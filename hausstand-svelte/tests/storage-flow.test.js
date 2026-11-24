import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaries } from '../src/lib/i18n.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const storage = read('ui-v3/StorageView.svelte');
const app = read('ui-v3/App.svelte');

test('one save flow owns all local/remote save operations and keeps the archive portable', () => {
  assert.match(app, /storageView\?\.saveFromHeader\?\.\(\)/);
  assert.match(storage, /async function exportPlain\(\)/);
  assert.match(storage, /downloadProject\(saved, \$appState\.asOfDate\)/);
  assert.match(storage, /await api\('save', payload/);
  assert.match(storage, /createPortableSave\(\$appState\.project, \$appState\.savedProject\)/);
  assert.match(storage, /if \(openedId && !leaseToken\) return \{ handled: false \}/);
  assert.match(app, /activeSection === 'save'\)/);
  assert.doesNotMatch(app, /class="save-top-grid"|class="save-basic"/);
});

test('one file picker recognizes encryption before requesting the password', () => {
  assert.equal((storage.match(/type="file"/g) || []).length, 1);
  assert.match(storage, /data\?\.format\?\.startsWith\('hausstand-aesgcm'\)/);
  assert.match(storage, /pendingEncrypted = data/);
  assert.match(storage, /\{#if pendingEncrypted\}/);
  assert.match(storage, /decryptProject\(pendingEncrypted, openPassword\)/);
  assert.match(storage, /requireProjectFile\(project\)/);
  assert.match(storage, /ensureNoOverwrite\(\)/);
  assert.match(storage, /appState\.importProject\(verified, \{ secure: true \}\)/);
  assert.match(storage, /appState\.importProject\(verified\)/);
});

test('encrypted backup stays separate and cannot implicitly switch the browser working mode', () => {
  const start = storage.indexOf('  async function exportEncrypted()');
  const end = storage.indexOf('  async function openLocalFile(', start);
  const exportEncrypted = storage.slice(start, end);
  assert.match(exportEncrypted, /const token = randomSecret\(\)/);
  assert.match(exportEncrypted, /if \(!openedId\) appState\.markSaved\(saved\)/);
  assert.doesNotMatch(exportEncrypted, /appState\.importProject|activePassword = password|editToken = token/);
  assert.match(storage, /if \(openedId && !leaseToken\) return \{ handled: false \}/);
  assert.match(storage, /if \(!openedId && \$appState\.secure && !activePassword\)/);
});

test('online editing is a real server identity, local opening is not', () => {
  assert.match(storage, /requireLeaseReleased\(\)/);
  assert.match(storage, /openedId = file\.id; openedName = file\.name/);
  assert.match(storage, /appState\.importProject\(verified, \{ secure: true, readOnly: true \}\)/);
  assert.match(storage, /clearOnlineLink\(\)/);
  assert.doesNotMatch(app, /app\.currentProject|app\.openFile|project-metadata/);
  assert.match(storage, /\{#if SERVER_MODE\}/);
});

test('all new flow text exists in English and German', () => {
  const keys = [...storage.matchAll(/'((?:storage)\.[^']+)'/g)].map(match => match[1]);
  for (const key of new Set(keys)) {
    assert.ok(dictionaries.en[key], 'missing English: ' + key);
    assert.ok(dictionaries.de[key], 'missing German: ' + key);
  }
  assert.equal(dictionaries.en['nav.save'], 'Save & open');
  assert.equal(dictionaries.de['nav.save'], 'Sichern & Öffnen');
});

test('local import names are temporary and optional backup names do not control primary downloads', () => {
  const store = read('src/stores/projectStore.js');
  assert.doesNotMatch(store, /\bfileName\b/);
  assert.doesNotMatch(storage, /backupName\s*=\s*pendingFileName/);
  const primary = storage.slice(storage.indexOf('export async function saveFromHeader()'), storage.indexOf('async function savePrimary()'));
  assert.doesNotMatch(primary, /backupName|pendingFileName/);
  assert.match(primary, /\$appState\.project\.community\?\.name/);
  assert.match(storage, /pendingFileName = file\.name/);
});
