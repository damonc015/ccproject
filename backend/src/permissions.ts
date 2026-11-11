import type { DatabaseSync } from 'node:sqlite';
import { HttpError } from './errors.js';

export type Role = 'owner' | 'editor' | 'viewer';
export interface DocumentSummary {
  documentId: string;
  title: string;
  language: 'python';
  ownerId: string;
  ownerName: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export const documentSelect = `SELECT d.documentId, d.title, d.language, d.ownerId,
  u.name AS ownerName, d.createdAt, d.updatedAt,
  CASE WHEN d.ownerId = ? THEN 'owner' ELSE m.role END AS role
  FROM documents d JOIN users u ON u.userId = d.ownerId
  LEFT JOIN document_members m ON m.documentId = d.documentId AND m.userId = ?`;

const rank: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export function requireRole(db: DatabaseSync, documentId: string, userId: string, minimum: Role = 'viewer'): DocumentSummary {
  const doc = db.prepare(`${documentSelect} WHERE d.documentId = ?`).get(userId, userId, documentId) as
    (Omit<DocumentSummary, 'role'> & { role: Role | null }) | undefined;
  if (!doc?.role) throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
  if (rank[doc.role] < rank[minimum]) throw new HttpError(403, 'FORBIDDEN', `This action requires ${minimum} access.`);
  return doc as DocumentSummary;
}
