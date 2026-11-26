import { spawn } from 'node:child_process';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { encryptProject, decryptProject, hashSecret, randomSecret } from '../src/lib/crypto.js';
import { emptyProject } from '../src/lib/domain.js';
import { createPortableSave, readPortableVersion } from '../src/lib/versionHistory.js';

const root = await mkdtemp(join(tmpdir(), 'hausstand-test-'));
const port = 18743;
const url = 'http://127.0.0.1:' + port + '/hausstand.php';
const server = spawn('php', ['-S', '127.0.0.1:' + port, '-t', 'dist'], {
  cwd: process.cwd(),
  env: { ...process.env, HAUSSTAND_DATA_DIR: root, HAUSSTAND_ADMIN_TOKEN: 'integration-admin-token' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
server.stderr.on('data', chunk => { log += chunk.toString(); });
async function call(action, payload = null, params = {}, headers = {}) {
  const endpoint = new URL(url);
  endpoint.searchParams.set('api', action);
  for (const [name, value] of Object.entries(params)) endpoint.searchParams.set(name, value);
  const response = await fetch(endpoint, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: payload ? JSON.stringify(payload) : undefined
  });
  const body = await response.json();
  return { status: response.status, ...body };
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) break;
    try { const r = await call('config'); ready = r.status === 200; if (ready) break; }
    catch { /* server starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('PHP server not ready: ' + log);
  const config = await call('config');
  assert.equal(config.status, 200);
  assert.equal(config.initialized, false);
  assert.equal('data_dir' in config, false);
  const id = 'hausstand-hauptdatei';
  const token = randomSecret();
  const project = { ...emptyProject(), community: { name: 'Test' } };
  const firstSaved = await createPortableSave(project, null, '2026-11-23T08:00:00Z');
  const envelope = await encryptProject(firstSaved, 'integration-password', token);
  let r = await call('create', { id, name: 'Integrationstest', envelope, tokenHash: await hashSecret(token) });
  assert.equal(r.status, 403);
  r = await call('create', { id, name: 'Integrationstest', envelope, tokenHash: await hashSecret(token) }, {}, { 'X-Hausstand-Admin': 'integration-admin-token' });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.revision, 1);
  assert.equal((await call('config')).initialized, true);
  assert.equal((await call('files')).status, 404);
  r = await call('read', null, { id });
  assert.equal(r.revision, 1);
  assert.equal(r.envelope.format, 'hausstand-aesgcm-v1');
  const auth = { 'X-File-Token': token };
  assert.equal((await call('checkout', { id, expectedRevision: 1 }, {}, { 'X-File-Token': 'f'.repeat(64) })).status, 403);
  r = await call('checkout', { id, expectedRevision: 1 }, {}, auth);
  assert.equal(r.status, 200, JSON.stringify(r));
  const lease = r.leaseToken;
  assert.equal((await call('checkout', { id, expectedRevision: 1 }, {}, auth)).status, 423);
  const saving = { ...auth, 'X-Lease-Token': lease };
  const nextSaved = await createPortableSave({
    ...firstSaved, people: [{ id: 'anna', name: 'Anna' }]
  }, firstSaved, '2026-11-23T09:00:00Z');
  const nextEnvelope = await encryptProject(nextSaved, 'integration-password', token);
  r = await call('save', { id, expectedRevision: 1, envelope: nextEnvelope }, {}, saving);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.revision, 2);
  assert.equal((await call('save', { id, expectedRevision: 1, envelope: nextEnvelope }, {}, saving)).status, 409);
  assert.equal((await call('versions', null, { id })).status, 404);
  assert.equal((await call('version', null, { id, rev: '1' })).status, 404);
  r = await call('read', null, { id });
  assert.equal(r.revision, 2);
  const current = (await decryptProject(r.envelope, 'integration-password')).project;
  assert.equal(current.people[0].name, 'Anna');
  assert.equal((await readPortableVersion(current, current.versionHistory.entries[0].id)).community.name, 'Test');
  await access(join(root, 'files', id, 'current-2.json'));
  await assert.rejects(access(join(root, 'files', id, 'current-1.json')));
  await assert.rejects(access(join(root, 'files', id, 'versions', '2.json')));

  const token2 = randomSecret();
  const env2 = await encryptProject(nextSaved, 'replacement-password', token2);
  r = await call('save', { id, expectedRevision: 2, envelope: env2, newTokenHash: await hashSecret(token2) }, {}, saving);
  assert.equal(r.status, 200);
  assert.equal((await call('renew', { id }, {}, saving)).status, 403);
  const saving2 = { ...saving, 'X-File-Token': token2 };
  assert.equal((await call('checkin', { id }, {}, saving2)).status, 200);
  assert.equal((await call('checkout', { id, expectedRevision: 3 }, {}, { 'X-File-Token': token2 })).status, 200);
  await access(join(root, 'files', id, 'current-3.json'));
  await assert.rejects(access(join(root, 'files', id, 'current-2.json')));

  const meta = JSON.parse(await readFile(join(root, 'files', id, 'meta.json'), 'utf8'));
  assert.equal(meta.currentFile, 'current-3.json');
  assert.equal(Object.hasOwn(meta, 'versions'), false);
  process.stdout.write('PHP API portable-history smoke test passed\n');
} finally {
  server.kill();
  await rm(root, { recursive: true, force: true });
}
