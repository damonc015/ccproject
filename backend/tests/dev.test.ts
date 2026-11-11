import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';

test('collaboration stand-ins are disabled by default', async t => {
  const { as } = fixture(t);
  await as().get('/dev/documents/doc_demo/content').expect(404);
  await as().post('/dev/documents/doc_demo/runs').send({ code: 'print(1)' }).expect(404);
});

test('new server documents can open/save/snapshot without browser mock state', async t => {
  const { as } = fixture(t, true);
  const { body: doc } = await as().post('/documents').send({ title: 'new.py' }).expect(201);
  const base = `/dev/documents/${doc.documentId}`;
  await as().get(`${base}/content`).expect(200, { content: '' });
  await as().put(`${base}/content`).send({ content: 'print(42)' }).expect(204);
  await as().get(`${base}/content`).expect(200, { content: 'print(42)' });
  const { body: version } = await as().post(`${base}/versions`).send({ label: 'First', content: 'print(42)' }).expect(201);
  await as().put(`${base}/content`).send({ content: 'print(43)' }).expect(204);
  await as().get(`/documents/${doc.documentId}/versions/${version.versionId}/content`).expect(200, { content: 'print(42)' });
  const { body: job } = await as().post(`${base}/runs`).send({ code: 'raise RuntimeError("must not execute")' }).expect(201);
  const result = await as().get(`/documents/${doc.documentId}/runs/${job.jobId}`).expect(200);
  assert.equal(result.body.stdout, '[Local fixture] No code was executed.\n');
});

test('stub enforces read and write roles, revocation and request limits', async t => {
  const { as } = fixture(t, true);
  await as('linus').get('/dev/documents/doc_demo/content').expect(200);
  await as('outsider').get('/dev/documents/doc_demo/content').expect(404);
  for (const user of ['linus', 'outsider']) {
    const code = user === 'linus' ? 403 : 404;
    await as(user).put('/dev/documents/doc_demo/content').send({ content: 'x' }).expect(code);
    await as(user).post('/dev/documents/doc_demo/versions').send({ content: 'x', label: 'x' }).expect(code);
    await as(user).post('/dev/documents/doc_demo/runs').send({ code: 'x' }).expect(code);
  }
  await as('grace').put('/dev/documents/doc_demo/content').send({ content: 'x' }).expect(204);
  await as().delete('/documents/doc_demo/collaborators/u_grace@example.com').expect(200);
  await as('grace').put('/dev/documents/doc_demo/content').send({ content: 'x' }).expect(404);
  await as().post('/dev/documents/doc_demo/runs').send({ code: 'x'.repeat(7001) }).expect(400);
});
