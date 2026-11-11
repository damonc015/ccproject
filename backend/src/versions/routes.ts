import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { caller } from '../auth/local.js';
import { VersionService } from './service.js';

export function versionRoutes(db: DatabaseSync) {
  const router = Router();
  const versions = new VersionService(db);
  router.get('/:documentId/versions', (req, res) => {
    res.json(versions.list(req.params.documentId, caller(res).userId));
  });
  router.get('/:documentId/versions/:versionId/content', (req, res) => {
    res.json(versions.preview(req.params.documentId, req.params.versionId, caller(res).userId));
  });
  return router;
}
