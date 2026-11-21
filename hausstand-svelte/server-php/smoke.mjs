import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { encryptProject, hashSecret, randomSecret } from '../src/lib/crypto.js';

const root = await mkdtemp(join(tmpdir(), 'hausstand-test-'));
const port = 18743;
const url = 'http://127.0.0.1:' + port + '/hausstand.php';
const workspaceKey = 'test-workspace-key-at-least-16-chars';
const server = spawn('php', ['-S', '127.0.0.1:' + port, '-t', 'dist'], {
  cwd: process.cwd(),
  env: { ...process.env, HAUSSTAND_DATA_DIR: root, HAUSSTAND_WORKSPACE_KEY: workspaceKey },
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
    try { const r = await call('files'); ready = r.status === 200; if (ready) break; }
    catch { /* server starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('PHP server not ready: ' + log);
  const id = 'cafecafe-1234-4567-8888-aabbccddeeff';
  const token = randomSecret();
  const project = { people: [], items: [], events: [] };
  const envelope = await encryptProject(project, 'integration-password', token);
  let r = await call('create', { id, name: 'Integrationstest', envelope, tokenHash: await hashSecret(token) },
    {}, { 'X-Workspace-Key': workspaceKey });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.revision, 1);
  r = await call('files');
  assert.equal(r.files.length, 1);
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
  const nextEnvelope = await encryptProject(project, 'integration-password', token);
  r = await call('save', { id, expectedRevision: 1, envelope: nextEnvelope }, {}, saving);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.revision, 2);
  assert.equal((await call('save', { id, expectedRevision: 1, envelope: nextEnvelope }, {}, saving)).status, 409);
  r = await call('versions', null, { id });
  assert.deepEqual(r.versions.map(v => v.revision), [2, 1]);
  r = await call('version', null, { id, rev: '1' });
  assert.equal(r.envelope.ciphertext, envelope.ciphertext);
  const token2 = randomSecret();
  const env2 = await encryptProject(project, 'replacement-password', token2);
  r = await call('save', { id, expectedRevision: 2, envelope: env2, newTokenHash: await hashSecret(token2) }, {}, saving);
  assert.equal(r.status, 200);
  assert.equal((await call('renew', { id }, {}, saving)).status, 403);
  const saving2 = { ...saving, 'X-File-Token': token2 };
  assert.equal((await call('checkin', { id }, {}, saving2)).status, 200);
  assert.equal((await call('checkout', { id, expectedRevision: 3 }, {}, { 'X-File-Token': token2 })).status, 200);
  process.stdout.write('PHP API smoke test passed\n');
} finally {
  server.kill();
  await rm(root, { recursive: true, force: true });
}
