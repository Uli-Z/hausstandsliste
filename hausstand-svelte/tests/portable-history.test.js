import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPortableSave, readPortableVersion, getVersionEntries, hasProjectChanges, mergeLegacyVersions
} from '../src/lib/versionHistory.js';
import { encryptProject, decryptProject } from '../src/lib/crypto.js';

const project = name => ({
  schemaVersion: 1, currency: 'EUR', community: { name },
  people: [], items: [], drafts: [], events: []
});

test('first save writes a readable current project, no invented prior version', async () => {
  const fresh = await createPortableSave(project('A'), null, '2026-11-23T08:00:00Z');
  assert.equal(fresh.community.name, 'A');
  assert.equal(fresh.lastSavedAt, '2026-11-23T08:00:00Z');
  assert.deepEqual(getVersionEntries(fresh), []);
});

test('each changed explicit save archives only the previous confirmed state', async () => {
  const a = await createPortableSave(project('A'), null, '2026-11-23T08:00:00Z');
  const b = await createPortableSave({ ...a, community: { name: 'B' } }, a, '2026-11-23T09:00:00Z');
  const c = await createPortableSave({ ...b, community: { name: 'C' } }, b, '2026-11-23T10:00:00Z');
  assert.equal(c.community.name, 'C');
  assert.equal(getVersionEntries(c).length, 2);
  assert.equal(JSON.stringify(c).includes('"name": "A"'), false);
  const oldest = await readPortableVersion(c, getVersionEntries(c)[0].id);
  const newer = await readPortableVersion(c, getVersionEntries(c)[1].id);
  assert.equal(oldest.community.name, 'A');
  assert.equal(newer.community.name, 'B');
  assert.equal(getVersionEntries(oldest).length, 2);
  assert.equal(oldest.lastSavedAt, c.lastSavedAt);
  assert.equal(getVersionEntries(c)[0].savedAt, '2026-11-23T08:00:00Z');
  assert.equal(getVersionEntries(c)[1].savedAt, '2026-11-23T09:00:00Z');
  const repeated = await createPortableSave(c, c, '2026-11-23T11:00:00Z');
  assert.deepEqual(repeated, c);
  const restoredAndSaved = await createPortableSave(oldest, c, '2026-11-23T12:00:00Z');
  assert.equal(restoredAndSaved.community.name, 'A');
  assert.equal(getVersionEntries(restoredAndSaved).length, 3);
  assert.equal((await readPortableVersion(restoredAndSaved, getVersionEntries(restoredAndSaved)[2].id)).community.name, 'C');
});

test('generated snapshots, stichtag metadata and archive fields are not business edits', () => {
  const p = project('A');
  assert.equal(hasProjectChanges({
    ...p, humanReadableSnapshot: { generatedAt: 'tomorrow', asOfDate: '2026-01-01' },
    versionHistory: { format: 'portable-v1', entries: [] }
  }, { ...p, humanReadableSnapshot: { generatedAt: 'yesterday' } }), false);
});

test('portable history survives JSON roundtrip and whole-file encryption', async () => {
  const a = await createPortableSave(project('A'), null);
  const b = await createPortableSave({ ...a, community: { name: 'B' } }, a);
  const encoded = JSON.parse(JSON.stringify(b));
  assert.equal((await readPortableVersion(encoded, encoded.versionHistory.entries[0].id)).community.name, 'A');
  const cipher = await encryptProject(encoded, 'correct-horse-battery');
  assert.equal(JSON.stringify(cipher).includes('portable-v1'), false);
  const decrypted = (await decryptProject(cipher, 'correct-horse-battery')).project;
  assert.equal((await readPortableVersion(decrypted, decrypted.versionHistory.entries[0].id)).community.name, 'A');
});

test('corruption, unknown formats and missing ids never silently recover incorrect data', async () => {
  const a = await createPortableSave(project('A'), null);
  const b = await createPortableSave({ ...a, community: { name: 'B' } }, a);
  const id = b.versionHistory.entries[0].id;
  await assert.rejects(() => readPortableVersion(b, 'missing'), /nicht gefunden/);
  const corrupt = structuredClone(b);
  corrupt.versionHistory.entries[0].sha256 = '0'.repeat(64);
  await assert.rejects(() => readPortableVersion(corrupt, id), /Prüfsumme/);
  assert.throws(() => getVersionEntries({ versionHistory: { format: 'unknown' } }), /Unbekanntes/);
});

test('imported legacy JSON has no archive and an unknown timestamp', async () => {
  const legacy = project('alt');
  const newer = await createPortableSave({ ...legacy, people: [{ id: 'p', name: 'N' }] }, legacy);
  assert.equal(newer.versionHistory.entries[0].savedAt, null);
  assert.equal((await readPortableVersion(newer, newer.versionHistory.entries[0].id)).people.length, 0);
});

test('legacy PHP snapshots migrate in order and remain portable without a second server archive', async () => {
  const source = 'cafecafe-1234-4567-8888-aabbccddeeff';
  const old = project('earliest');
  const middle = project('middle');
  const latest = await createPortableSave(project('latest'), null, '2026-11-23T10:00:00Z');
  const migrated = await mergeLegacyVersions(latest, [
    { revision: 3, project: latest, createdAt: '2026-11-23T10:00:00Z' },
    { revision: 1, project: old, createdAt: '2026-11-20T10:00:00Z' },
    { revision: 2, project: middle, createdAt: '2026-11-21T10:00:00Z' }
  ], source, latest);
  const entries = getVersionEntries(migrated);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, 'legacy-' + source + '-1');
  assert.equal(entries[1].id, 'legacy-' + source + '-2');
  assert.equal((await readPortableVersion(migrated, entries[0].id)).community.name, 'earliest');
  const saved = await createPortableSave(migrated, latest, '2026-11-23T11:00:00Z');
  assert.equal(saved.versionHistory.entries.length, 2, 'Archive-only save must not create an extra snapshot');
  assert.equal((await readPortableVersion(saved, entries[1].id)).community.name, 'middle');
  const repeated = await mergeLegacyVersions(saved, [
    { revision: 1, project: old }, { revision: 2, project: middle }, { revision: 3, project: latest }
  ], source, latest);
  assert.equal(repeated.versionHistory.entries.length, 2, 'Migration must be idempotent');
});

test('a missing previously saved history entry blocks download instead of deleting history', async () => {
  const a = await createPortableSave(project('A'), null);
  const b = await createPortableSave({ ...a, community: { name: 'B' } }, a);
  await assert.rejects(() => createPortableSave({ ...b, versionHistory: { format: 'portable-v1', entries: [] } }, b), /unvollständig/);
});
