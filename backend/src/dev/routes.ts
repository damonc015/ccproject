// Temporary bridge for Person 1's editor until Person 2's server is available.
// Nothing here executes source code or implements real-time collaboration.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { caller } from '../auth/local.js';
import { requireRole } from '../permissions.js';
import { transaction } from '../storage/database.js';

const contentBody = z.object({ content: z.string().max(100000) }).strict();
const versionBody = z.object({ content: z.string().max(100000), label: z.string().trim().max(200) }).strict();
const runBody = z.object({ code: z.string().max(7000) }).strict();

export function devRoutes(db: DatabaseSync) {
  const router = Router();
  router.get('/documents/:documentId/content', (req, res) => {
    requireRole(db, req.params.documentId, caller(res).userId);
    res.json(db.prepare('SELECT content FROM dev_content WHERE documentId = ?').get(req.params.documentId) ?? { content: '' });
  });
  router.put('/documents/:documentId/content', (req, res) => {
    const { content } = contentBody.parse(req.body);
    transaction(db, () => {
      requireRole(db, req.params.documentId, caller(res).userId, 'editor');
      db.prepare(`INSERT INTO dev_content VALUES (?, ?)
        ON CONFLICT(documentId) DO UPDATE SET content = excluded.content`).run(req.params.documentId, content);
      db.prepare('UPDATE documents SET updatedAt = ? WHERE documentId = ?').run(new Date().toISOString(), req.params.documentId);
    });
    res.sendStatus(204);
  });
  router.post('/documents/:documentId/versions', (req, res) => {
    const { content, label } = versionBody.parse(req.body);
    const user = caller(res);
    requireRole(db, req.params.documentId, user.userId, 'editor');
    const version = { versionId: `version_${randomUUID()}`, documentId: req.params.documentId,
      label: label || 'Untitled version', createdByName: user.name, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO versions VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      version.versionId, version.documentId, version.label, user.userId, user.name, version.createdAt, content);
    res.status(201).json(version);
  });
  router.post('/documents/:documentId/runs', (req, res) => {
    runBody.parse(req.body);
    const user = caller(res);
    requireRole(db, req.params.documentId, user.userId, 'editor');
    const jobId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO runs
      (jobId, documentId, requestedBy, status, stdout, stderr, exitCode, error, createdAt, startedAt, finishedAt)
      VALUES (?, ?, ?, 'completed', ?, '', 0, '', ?, ?, ?)`).run(
      jobId, req.params.documentId, user.userId, '[Local fixture] No code was executed.\n', now, now, now);
    res.status(201).json({ jobId });
  });
  return router;
}
