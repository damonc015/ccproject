import type { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../errors.js';
import { requireRole } from '../permissions.js';

export class VersionService {
  constructor(private db: DatabaseSync) {}

  list(documentId: string, userId: string) {
    requireRole(this.db, documentId, userId);
    return this.db.prepare(`SELECT versionId, documentId, label, createdByName, createdAt
      FROM versions WHERE documentId = ? ORDER BY createdAt DESC, versionId DESC`).all(documentId);
  }

  preview(documentId: string, versionId: string, userId: string) {
    requireRole(this.db, documentId, userId);
    const version = this.db.prepare('SELECT content FROM versions WHERE versionId = ? AND documentId = ?')
      .get(versionId, documentId);
    if (!version) throw new HttpError(404, 'VERSION_NOT_FOUND', 'Version not found.');
    return version;
  }
}
