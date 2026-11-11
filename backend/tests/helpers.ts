import type { TestContext } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/storage/database.js';
import { seedDatabase } from '../src/storage/seed.js';

export function fixture(t: TestContext, enableCollabStub = false) {
  const db = openDatabase();
  t.after(() => db.close());
  seedDatabase(db);
  const app = createApp({ db, enableCollabStub });
  const as = (name = 'demo') => ({
    get: (path: string) => request(app).get(path).set('X-Dev-User-Id', `u_${name}@example.com`),
    post: (path: string) => request(app).post(path).set('X-Dev-User-Id', `u_${name}@example.com`),
    put: (path: string) => request(app).put(path).set('X-Dev-User-Id', `u_${name}@example.com`),
    delete: (path: string) => request(app).delete(path).set('X-Dev-User-Id', `u_${name}@example.com`),
  });
  return { db, app, as };
}
