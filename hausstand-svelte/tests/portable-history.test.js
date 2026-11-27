import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPortableSave, readPortableVersion, getVersionEntries, hasProjectChanges, prepareServerReplacement
} from '../src/lib/versionHistory.js';
import { encryptProject, decryptProject } from '../src/lib/crypto.js';
import { requireProjectFile } from '../src/lib/domain.js';

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

test('a missing previously saved history entry blocks download instead of deleting history', async () => {
  const a = await createPortableSave(project('A'), null);
  const b = await createPortableSave({ ...a, community: { name: 'B' } }, a);
  await assert.rejects(() => createPortableSave({ ...b, versionHistory: { format: 'portable-v1', entries: [] } }, b), /unvollständig/);
});

test('only current standalone or encrypted project files are accepted for import', async () => {
  const saved = await createPortableSave({
    ...project('current'), appVersion: '0.7.0-svelte'
  }, null, '2026-11-23T09:00:00.000Z');
  assert.equal(requireProjectFile(saved).community.name, 'current');
  const cipher = await encryptProject(saved, 'valid-project-password');
  assert.equal(requireProjectFile((await decryptProject(cipher, 'valid-project-password')).project).versionHistory.format, 'portable-v1');
  assert.throws(() => requireProjectFile({ ...saved, schemaVersion: 0 }), /Nicht unterstütztes/);
  assert.throws(() => requireProjectFile({ ...saved, versionHistory: undefined }), /Nicht unterstütztes/);
  assert.throws(() => requireProjectFile({ ...saved, redistributions: [], drafts: undefined }), /Nicht unterstütztes/);
});

test('Q43 preview defaults to the local calendar date of the archive timestamp', async () => {
  const {todayISO}=await import('../src/lib/util.js');
  assert.equal(todayISO(new Date(2025,0,2,12,0)), '2025-01-02');
  assert.equal(todayISO(new Date(2026,10,27,12,0)), '2026-11-27');
});

test('Q68 plain older file replaces server contents while retaining both valid histories', async () => {
  const a=await createPortableSave(project('A'),null,'2026-11-23T08:00:00Z');
  const b=await createPortableSave({...a,community:{name:'B'}},a,'2026-11-23T09:00:00Z');
  const incoming=await createPortableSave({...a,community:{name:'Offline'}},a,'2026-11-24T08:00:00Z');
  const before=structuredClone(b), original=structuredClone(incoming);
  const {saved,replacesHistory}=await prepareServerReplacement(incoming,b,'2026-11-27T09:00:00Z');
  assert.equal(replacesHistory,false);
  assert.equal(saved.community.name,'Offline');
  assert.ok(b.versionHistory.entries.every(e=>saved.versionHistory.entries.some(v=>v.id===e.id)));
  assert.ok(incoming.versionHistory.entries.every(e=>saved.versionHistory.entries.some(v=>v.id===e.id)));
  assert.equal((await readPortableVersion(saved,saved.versionHistory.entries.at(-1).id)).community.name,'B');
  assert.deepEqual(b,before);
  assert.deepEqual(incoming,original);
  const old=await prepareServerReplacement(a,b);
  assert.equal(old.replacesHistory,false);
  assert.equal(old.saved.versionHistory.entries.length,2);
});
test('Q68 unrelated numbered projects require separate explicit replacement of history', async () => {
  const first=await createPortableSave({...project('Server'),items:[{id:'server-item',name:'Server item',number:1}]},null);
  const server=await createPortableSave({...first,community:{name:'Server newer'}},first);
  const source=await createPortableSave({...project('Other'),items:[{id:'offline-item',name:'Offline item',number:1}]},null);
  const result=await prepareServerReplacement(source,server);
  assert.equal(result.replacesHistory,true);
  assert.equal(result.saved.community.name,'Other');
  assert.deepEqual(result.saved.items,source.items);
  assert.deepEqual(result.saved.versionHistory,source.versionHistory);
  assert.equal(server.versionHistory.entries.length,1);
});
test('Q68 invalid schema or damaged source history is never treated as a replacement option', async () => {
  const a=await createPortableSave(project('A'),null);
  const b=await createPortableSave({...a,community:{name:'B'}},a);
  await assert.rejects(()=>prepareServerReplacement({...a,schemaVersion:0},b),/Nicht unterstütztes/);
  const corrupt=structuredClone(b);
  corrupt.versionHistory.entries[0].sha256='0'.repeat(64);
  await assert.rejects(()=>prepareServerReplacement(corrupt,b),/Prüfsumme/);
});
