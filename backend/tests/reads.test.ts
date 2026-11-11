import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { fixture } from './helpers.js';

const demoJob = '00000000-0000-4000-8000-000000000001';

test('versions: all members can list and preview; list excludes content/internal fields', async t => {
  const { as, db } = fixture(t);
  db.prepare('INSERT INTO versions VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('v_new', 'doc_demo', 'Later', 'u_demo@example.com', 'Demo User', '2099-01-01T00:00:00.000Z', 'print(2)');
  for (const user of ['demo', 'grace', 'linus']) {
    const list = await as(user).get('/documents/doc_demo/versions').expect(200);
    assert.equal(list.body[0].versionId, 'v_new');
    assert.deepEqual(Object.keys(list.body[0]).sort(), ['versionId', 'documentId', 'label', 'createdByName', 'createdAt'].sort());
    await as(user).get('/documents/doc_demo/versions/v_new/content').expect(200, { content: 'print(2)' });
  }
  await as().get('/documents/doc_demo/versions/missing/content').expect(404);
});

test('run status normalizes queued results without leaking fields or advancing state', async t => {
  const { as, db } = fixture(t);
  db.prepare(`INSERT INTO runs (jobId, documentId, requestedBy, status, createdAt, taskArn)
    VALUES (?, ?, ?, ?, ?, ?)`).run('queued-job', 'doc_demo', 'u_demo@example.com', 'queued', '2026-01-01', 'private-task');
  const expected = { jobId: 'queued-job', status: 'queued', stdout: '', stderr: '', exitCode: null, error: '', startedAt: null, finishedAt: null };
  for (const user of ['demo', 'grace', 'linus']) {
    await as(user).get('/documents/doc_demo/runs/queued-job').expect(200, expected);
  }
  assert.equal(db.prepare('SELECT status FROM runs WHERE jobId = ?').get('queued-job')!.status, 'queued');
  await as().get('/documents/doc_demo/runs/missing').expect(404);
});

test('running, success, nonzero exit and timeout preserve execution contract', async t => {
  const { as, db } = fixture(t);
  for (const sample of [
    { status: 'running', exitCode: null, error: '', stdout: '', finishedAt: null },
    { status: 'completed', exitCode: 0, error: '', stdout: 'hello\n', finishedAt: '2026-01-01T00:00:02Z' },
    { status: 'failed', exitCode: 1, error: 'NONZERO_EXIT', stdout: '', finishedAt: '2026-01-01T00:00:02Z' },
    { status: 'failed', exitCode: 124, error: 'TIMEOUT', stdout: '', finishedAt: '2026-01-01T00:00:02Z' },
  ]) {
    db.prepare('UPDATE runs SET status = ?, exitCode = ?, error = ?, stdout = ?, finishedAt = ? WHERE jobId = ?')
      .run(sample.status, sample.exitCode, sample.error, sample.stdout, sample.finishedAt, demoJob);
    const result = await as().get(`/documents/doc_demo/runs/${demoJob}`).expect(200);
    for (const [key, value] of Object.entries(sample)) assert.equal(result.body[key], value);
  }
});

test('versions and runs reject unauthenticated, outsider and revoked access', async t => {
  const { as, app } = fixture(t);
  const paths = ['/documents/doc_demo/versions', '/documents/doc_demo/versions/version_demo/content', `/documents/doc_demo/runs/${demoJob}`];
  await as().delete('/documents/doc_demo/collaborators/u_grace@example.com').expect(200);
  for (const path of paths) {
    await request(app).get(path).expect(401);
    await as('outsider').get(path).expect(404);
    await as('grace').get(path).expect(404);
  }
});

test('a valid accessible document cannot be used to read another document’s version or run', async t => {
  const { as } = fixture(t);
  const { body: own } = await as('outsider').post('/documents').send({ title: 'own.py' }).expect(201);
  await as('outsider').get(`/documents/${own.documentId}/versions/version_demo/content`).expect(404);
  await as('outsider').get(`/documents/${own.documentId}/runs/${demoJob}`).expect(404);
  // Even a user who can access both documents must provide the correct pairing.
  const { body: second } = await as().post('/documents').send({}).expect(201);
  await as().get(`/documents/${second.documentId}/runs/${demoJob}`).expect(404);
  await as().get(`/documents/${second.documentId}/versions/version_demo/content`).expect(404);
});
