import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { localAuth } from './auth/local.js';
import { errorHandler, HttpError } from './errors.js';
import { documentRoutes } from './documents/routes.js';
import { versionRoutes } from './versions/routes.js';
import { runRoutes } from './runs/routes.js';
import { devRoutes } from './dev/routes.js';

export interface AppOptions {
  db: DatabaseSync;
  frontendOrigins?: string[];
  enableCollabStub?: boolean;
}

export function createApp({ db, frontendOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'], enableCollabStub = false }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.vary('Origin');
    const origin = req.get('Origin');
    if (origin) {
      if (!frontendOrigins.includes(origin)) throw new HttpError(403, 'ORIGIN_DENIED', 'Origin is not allowed.');
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-Dev-User-Id');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'local' }));
  app.use(localAuth(db));
  app.use(express.json({ limit: '256kb' }));
  app.use('/documents', documentRoutes(db));
  app.use('/documents', versionRoutes(db));
  app.use('/documents', runRoutes(db));
  if (enableCollabStub) app.use('/dev', devRoutes(db));
  app.use((_req, _res) => { throw new HttpError(404, 'NOT_FOUND', 'Route not found.'); });
  app.use(errorHandler);
  return app;
}
