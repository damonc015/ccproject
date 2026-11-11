import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { fixture } from './helpers.js';

test('create/open/list: server owns identity, defaults title, and filters by access', async t => {
  const { as } = fixture(t);
  const created = await as('outsider').post('/documents').send({ title: '  ' }).expect(201);
  assert.equal(created.body.ownerId, 'u_outsider@example.com');
  assert.equal(created.body.title, 'untitled.py');
  assert.equal(created.body.role, 'owner');
  assert.equal(created.body.language, 'python');
  await as('outsider').get(`/documents/${created.body.documentId}`).expect(200);
  await as().get(`/documents/${created.body.documentId}`).expect(404);
  const mine = await as('outsider').get('/documents').expect(200);
  assert.equal(mine.body.length, 1);
  const shared = await as('grace').get('/documents').expect(200);
  assert.equal(shared.body[0].documentId, 'doc_demo');
  assert.equal(shared.body[0].role, 'editor');
});

test('every document request requires a known confirmed identity', async t => {
  const { app, db, as } = fixture(t);
  await request(app).get('/documents').expect(401);
  await as('unknown').post('/documents').send({}).expect(401);
  db.prepare('UPDATE users SET confirmed = 0 WHERE email = ?').run('outsider@example.com');
  await as('outsider').get('/documents').expect(401);
});

test('body validation rejects forged owner, invalid JSON and oversized requests', async t => {
  const { as } = fixture(t);
  await as().post('/documents').send({ title: 'x.py', ownerId: 'someone-else' }).expect(400);
  await as().post('/documents').send({ title: 1 }).expect(400);
  await as().post('/documents').send({ title: 'x'.repeat(201) }).expect(400);
  await as().post('/documents').set('Content-Type', 'application/json').send('{').expect(400);
  await as().post('/documents').send({ title: 'x'.repeat(270000) }).expect(413);
});

test('sharing normalizes email, only accepts existing confirmed users, and upserts roles', async t => {
  const { as, db } = fixture(t);
  const path = '/documents/doc_demo/collaborators';
  const missing = await as().post(path).send({ email: 'new@example.com', role: 'editor' }).expect(404);
  assert.equal(missing.body.error.code, 'USER_NOT_FOUND');
  db.prepare('UPDATE users SET confirmed = 0 WHERE email = ?').run('outsider@example.com');
  await as().post(path).send({ email: 'outsider@example.com', role: 'viewer' }).expect(404);
  await as().post(path).send({ email: ' GRACE@EXAMPLE.COM ', role: 'viewer' }).expect(200);
  const people = await as().get(path).expect(200);
  assert.equal(people.body.filter((p: { email: string }) => p.email === 'grace@example.com').length, 1);
  assert.equal((await as('grace').get('/documents/doc_demo')).body.role, 'viewer');
  assert.equal(db.prepare('SELECT * FROM users').all().length, 4);
});

test('only owners manage access, with owner immutable and no role escalation', async t => {
  const { as } = fixture(t);
  const path = '/documents/doc_demo/collaborators';
  for (const user of ['grace', 'linus']) {
    await as(user).get(path).expect(200);
    await as(user).post(path).send({ email: 'outsider@example.com', role: 'editor' }).expect(403);
    await as(user).delete(`${path}/u_linus@example.com`).expect(403);
    await as(user).delete('/documents/doc_demo').expect(403);
  }
  await as('outsider').get(path).expect(404);
  await as('outsider').post(path).send({ email: 'unknown@example.com', role: 'viewer' }).expect(404);
  await as().post(path).send({ email: 'grace@example.com', role: 'owner' }).expect(400);
  await as().post(path).send({ email: 'demo@example.com', role: 'editor' }).expect(400);
  await as().delete(`${path}/u_demo@example.com`).expect(400);
});

test('revoking access immediately affects gallery, opening and collaborator list', async t => {
  const { as } = fixture(t);
  const path = '/documents/doc_demo/collaborators/u_grace@example.com';
  await as().delete(path).expect(200);
  await as().delete(path).expect(200);
  await as('grace').get('/documents').expect(200, []);
  await as('grace').get('/documents/doc_demo').expect(404);
  await as('grace').get('/documents/doc_demo/collaborators').expect(404);
});

test('owner deletion removes dependent local rows atomically', async t => {
  const { as, db } = fixture(t);
  await as().delete('/documents/doc_demo').expect(204);
  for (const table of ['documents', 'document_members', 'versions', 'runs', 'dev_content']) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 0);
  }
  await as('grace').get('/documents/doc_demo').expect(404);
});
