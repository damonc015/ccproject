import type { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../errors.js';
import { requireRole } from '../permissions.js';

export class RunService {
  constructor(private db: DatabaseSync) {}

  get(documentId: string, jobId: string, userId: string) {
    requireRole(this.db, documentId, userId);
    const run = this.db.prepare(`SELECT jobId, status, COALESCE(stdout, '') AS stdout,
      COALESCE(stderr, '') AS stderr, exitCode, COALESCE(error, '') AS error, startedAt, finishedAt
      FROM runs WHERE jobId = ? AND documentId = ?`).get(jobId, documentId);
    if (!run) throw new HttpError(404, 'RUN_NOT_FOUND', 'Run not found.');
    return run;
  }
}
