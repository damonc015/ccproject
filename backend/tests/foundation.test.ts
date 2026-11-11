import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { openDatabase } from '../src/storage/database.js';
import { seedDatabase } from '../src/storage/seed.js';

test('health, local authentication, CORS and missing routes', async t => {
  const db = openDatabase(); t.after(() => db.close()); seedDatabase(db);
  const app = createApp({ db });
  await request(app).get('/health').expect(200, { status: 'ok', mode: 'local' });
  await request(app).get('/missing').expect(401);
  await request(app).get('/missing').set('X-Dev-User-Id', 'unknown').expect(401);
  await request(app).get('/missing').set('X-Dev-User-Id', 'u_demo@example.com').expect(404);
  await request(app).options('/documents').set('Origin', 'http://localhost:5173').expect(204)
    .expect('Access-Control-Allow-Origin', 'http://localhost:5173');
  await request(app).get('/health').set('Origin', 'https://untrusted.example').expect(403);
});

test('SQLite persists across restarts and seeding preserves revoked memberships', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-api-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'nested', 'test.sqlite');
  let db = openDatabase(path);
  seedDatabase(db);
  db.prepare('DELETE FROM document_members WHERE userId = ?').run('u_grace@example.com');
  db.close();
  db = openDatabase(path); t.after(() => db.close()); seedDatabase(db);
  assert.equal(db.prepare('SELECT * FROM users').all().length, 4);
  assert.equal(db.prepare('SELECT * FROM document_members WHERE userId = ?').all('u_grace@example.com').length, 0);
  assert.equal(db.prepare('SELECT * FROM documents').all().length, 1);
});

test('local impersonation refuses production and invalid configuration', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /development/);
  assert.throws(() => readConfig({ PORT: 'abc' }), /PORT/);
  assert.throws(() => readConfig({ ENABLE_COLLAB_STUB: 'yes' }), /true or false/);
  assert.equal(readConfig({}).enableCollabStub, false);
});
