import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exportProject } from '../src/lib/persistence.js';

const source = relativePath => readFileSync(new URL('../' + relativePath, import.meta.url), 'utf8');

test('the exported file ends with the portable archive and keeps current data readable', () => {
  const project = {
    schemaVersion: 1, community: { name: 'WG' }, currency: 'EUR',
    people: [], items: [], events: [], drafts: [],
    versionHistory: { format: 'portable-v1', entries: [] }
  };
  const exported = exportProject(project, '2026-11-23');
  assert.equal(exported.community.name, 'WG');
  assert.equal(Object.keys(exported).at(-1), 'versionHistory');
  assert.equal(JSON.parse(JSON.stringify(exported)).versionHistory.format, 'portable-v1');
});

test('V3 Save persists an explicit version, and restores open as unsaved drafts', () => {
  const app = source('ui-v3/App.svelte');
  const storage = source('ui-v3/StorageView.svelte');
  const store = source('src/stores/projectStore.js');
  assert.match(storage, /createPortableSave\(\$appState\.project, \$appState\.savedProject\)/);
  assert.match(storage, /downloadProject\(saved, \$appState\.asOfDate\)/);
  assert.match(storage, /appState\.markSaved\(saved\)/);
  assert.match(app, /storageView\?\.saveFromHeader\?\.\(\)/);
  assert.match(app, /restoreWorkingCopy\(copy\)/);
  assert.doesNotMatch(app, /setAsOfDate\(copy\.asOfDate\)/);
  assert.match(storage, /createPortableSave\(project, \$appState\.savedProject\)/);
  assert.match(storage, /await api\('save', payload/);
  assert.match(storage, /readPortableVersion\(/);
  assert.match(store, /restoreVersion/);
});

test('PHP uses only current encrypted file and has no separate history API', () => {
  const php = source('server-php/backend.php');
  assert.match(php, /function currentPath\(/);
  assert.match(php, /currentFile/);
  assert.doesNotMatch(php, /\$api === 'versions'|\$api === 'version'/);
  assert.doesNotMatch(php, /atomicJson\(\$dir \. '\/versions\/' \. \$next/);
});
