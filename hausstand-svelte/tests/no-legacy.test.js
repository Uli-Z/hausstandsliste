import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(appRoot, '..');
const appFile = relative => readFileSync(path.join(appRoot, relative), 'utf8');

test('V3 is the only UI: no prototype, classic or V2 entry points', () => {
  for (const deleted of [
    'vorlage.html',
    'hausstand-svelte/index.html',
    'hausstand-svelte/vite.config.js',
    'hausstand-svelte/vite.ui-v2.config.js',
    'hausstand-svelte/ui-v2/App.svelte',
    'hausstand-svelte/src/App.svelte',
    'hausstand-svelte/src/main.js',
    'hausstand-svelte/src/styles.css',
    'hausstand-svelte/src/components/LedgerPanel.svelte',
    'hausstand-svelte/src/components/StoragePanel.svelte',
    'hausstand-svelte/scripts/inline-ui-v2.mjs',
    'hausstand-svelte/scripts/inline-build.mjs',
  ]) assert.equal(existsSync(path.join(root, deleted)), false, deleted);

  const pkg = JSON.parse(appFile('package.json'));
  assert.match(pkg.scripts['build:single'], /inline-ui-v3\.mjs --standalone/);
  assert.match(pkg.scripts.dev, /vite\.ui-v3\.config\.js/);
  assert.equal(pkg.scripts['build:ui-v2'], undefined);
  assert.equal(pkg.scripts['build:ui-v3'], undefined);
});

test('PHP API stores the current document only: no historical revision endpoints', () => {
  const php = appFile('server-php/backend.php');
  const storage = appFile('ui-v3/StorageView.svelte');
  assert.doesNotMatch(php, /\$api === ['"]versions?['"]/);
  assert.doesNotMatch(php, /\/versions\//);
  assert.doesNotMatch(php, /\$meta\[['"]versions['"]\]/);
  assert.match(php, /currentFile/);
  assert.match(php, /assertRevision/);
  assert.doesNotMatch(storage, /mergeLegacyVersions|migrateLegacyVersions|getVersions|selectedVersion\s*=/);
});

test('one current file schema: no old redistribution import field or purchase-linked payments', () => {
  const domain = appFile('src/lib/domain.js');
  const claimSettlement = appFile('src/lib/claimSettlement.js');
  const versions = appFile('src/lib/versionHistory.js');
  assert.doesNotMatch(domain, /raw\?\.redistributions|delete p\.redistributions/);
  assert.match(domain, /export const requireProjectFile/);
  assert.doesNotMatch(versions, /mergeLegacyVersions|json-base64|legacyRevision/);
  assert.doesNotMatch(claimSettlement, /sourceEventId, childEventId, itemId/);
});

test('Q31 has no legacy single-payer field or compatibility branch', () => {
  for (const file of ['src/lib/purchaseFinancing.js','src/lib/itemMutations.js','src/lib/eventMutations.js',
    'src/lib/mutationValidation.js','src/lib/projectValidation.js','src/lib/draftMutations.js',
    'src/lib/financialLabels.js','bin/hausstand.mjs','ui-v3/DialogRouter.svelte','ui-v3/Timeline.svelte']) {
    assert.doesNotMatch(appFile(file), /financedByPersonId|allowHistoricalUnknownFunding/,file);
  }
});
