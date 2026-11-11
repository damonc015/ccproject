import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { caller } from '../auth/local.js';
import { RunService } from './service.js';

export function runRoutes(db: DatabaseSync) {
  const router = Router();
  const runs = new RunService(db);
  router.get('/:documentId/runs/:jobId', (req, res) => {
    res.json(runs.get(req.params.documentId, req.params.jobId, caller(res).userId));
  });
  return router;
}
