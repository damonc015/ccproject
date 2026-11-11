import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { caller } from '../auth/local.js';
import { DocumentService } from './service.js';

const createBody = z.object({ title: z.string().trim().max(200).optional() }).strict();
const shareBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(['editor', 'viewer']),
}).strict();

export function documentRoutes(db: DatabaseSync) {
  const router = Router();
  const docs = new DocumentService(db);
  router.get('/', (_req, res) => res.json(docs.list(caller(res).userId)));
  router.post('/', (req, res) => {
    const { title } = createBody.parse(req.body);
    res.status(201).json(docs.create(title || 'untitled.py', caller(res).userId));
  });
  router.get('/:documentId', (req, res) => res.json(docs.get(req.params.documentId, caller(res).userId)));
  router.delete('/:documentId', (req, res) => {
    docs.delete(req.params.documentId, caller(res).userId);
    res.sendStatus(204);
  });
  router.get('/:documentId/collaborators', (req, res) => {
    res.json(docs.collaborators(req.params.documentId, caller(res).userId));
  });
  router.post('/:documentId/collaborators', (req, res) => {
    const { email, role } = shareBody.parse(req.body);
    res.json(docs.share(req.params.documentId, caller(res).userId, email, role));
  });
  router.delete('/:documentId/collaborators/:userId', (req, res) => {
    res.json(docs.unshare(req.params.documentId, caller(res).userId, req.params.userId));
  });
  return router;
}
