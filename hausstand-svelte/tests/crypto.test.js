import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptProject, decryptProject, hashSecret, isEncryptedEnvelope } from '../src/lib/crypto.js';

const project = { events: [{ id: 'test', type: 'note' }], people: [], items: [] };

test('authenticated local encrypted round-trip', async () => {
  const encrypted = await encryptProject(project, 'correct-horse-battery', 'a'.repeat(64));
  assert.ok(isEncryptedEnvelope(encrypted));
  assert.equal(JSON.stringify(encrypted).includes('test'), false);
  const restored = await decryptProject(encrypted, 'correct-horse-battery');
  assert.deepEqual(restored.project, project);
  assert.equal(restored.editToken, 'a'.repeat(64));
});

test('incorrect password and tampering fail authentication', async () => {
  const encrypted = await encryptProject(project, 'correct-horse-battery');
  await assert.rejects(() => decryptProject(encrypted, 'incorrect-password'));
  await assert.rejects(() => decryptProject({ ...encrypted, nonce: encrypted.nonce.replace(/^./, 'A') }, 'correct-horse-battery'));
  await assert.rejects(() => decryptProject({ ...encrypted, ciphertext: 'AAAA' }, 'correct-horse-battery'));
});

test('encryption uses fresh nonces and salts', async () => {
  const first = await encryptProject(project, 'correct-horse-battery');
  const second = await encryptProject(project, 'correct-horse-battery');
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.match(await hashSecret('a'.repeat(64)), /^[0-9a-f]{64}$/);
});
