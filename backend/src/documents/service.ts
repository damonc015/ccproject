import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../errors.js';
import { documentSelect, requireRole, type DocumentSummary } from '../permissions.js';
import { transaction } from '../storage/database.js';

export class DocumentService {
  constructor(private db: DatabaseSync) {}

  list(userId: string): DocumentSummary[] {
    return this.db.prepare(`${documentSelect} WHERE d.ownerId = ? OR m.userId IS NOT NULL
      ORDER BY d.updatedAt DESC, d.documentId ASC`).all(userId, userId, userId) as unknown as DocumentSummary[];
  }

  get(documentId: string, userId: string) {
    return requireRole(this.db, documentId, userId);
  }

  create(title: string, userId: string) {
    const documentId = `doc_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO documents (documentId, title, ownerId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)`).run(documentId, title, userId, now, now);
    return this.get(documentId, userId);
  }

  delete(documentId: string, userId: string) {
    transaction(this.db, () => {
      requireRole(this.db, documentId, userId, 'owner');
      this.db.prepare('DELETE FROM documents WHERE documentId = ?').run(documentId);
    });
  }

  collaborators(documentId: string, userId: string) {
    requireRole(this.db, documentId, userId);
    return this.db.prepare(`
      SELECT u.userId, u.email, u.name, 'owner' AS role FROM documents d
        JOIN users u ON u.userId = d.ownerId WHERE d.documentId = ?
      UNION ALL
      SELECT u.userId, u.email, u.name, m.role FROM document_members m
        JOIN users u ON u.userId = m.userId WHERE m.documentId = ?
      ORDER BY name, userId`).all(documentId, documentId);
  }

  share(documentId: string, userId: string, email: string, role: 'editor' | 'viewer') {
    return transaction(this.db, () => {
      const doc = requireRole(this.db, documentId, userId, 'owner');
      const target = this.db.prepare('SELECT userId FROM users WHERE email = ? AND confirmed = 1').get(email) as { userId: string } | undefined;
      if (!target) throw new HttpError(404, 'USER_NOT_FOUND', 'No registered user has this email address.');
      if (target.userId === doc.ownerId) throw new HttpError(400, 'OWNER_IMMUTABLE', 'The owner already has full access.');
      this.db.prepare(`INSERT INTO document_members (documentId, userId, role) VALUES (?, ?, ?)
        ON CONFLICT(documentId, userId) DO UPDATE SET role = excluded.role`).run(documentId, target.userId, role);
      return this.collaborators(documentId, userId);
    });
  }

  unshare(documentId: string, userId: string, targetId: string) {
    return transaction(this.db, () => {
      const doc = requireRole(this.db, documentId, userId, 'owner');
      if (targetId === doc.ownerId) throw new HttpError(400, 'OWNER_IMMUTABLE', 'The owner cannot be removed.');
      this.db.prepare('DELETE FROM document_members WHERE documentId = ? AND userId = ?').run(documentId, targetId);
      return this.collaborators(documentId, userId);
    });
  }
}
