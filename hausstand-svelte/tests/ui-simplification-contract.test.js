import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('overview retains the four metrics and quick actions but has no duplicate add-item button', () => {
  const app = source('ui-v3/App.svelte');
  const overview = app.slice(app.indexOf("{:else if activeSection === 'overview'}"), app.indexOf("{:else if activeSection === 'items'}"));
  assert.equal((overview.match(/<div class="metric action-card">/g) || []).length, 4);
  assert.equal((overview.match(/<span class="task-icon">/g) || []).length, 4);
  assert.ok(overview.includes('rankedItems($projection.activeItems, $locale)'));
  assert.ok(overview.includes('nameEntries($projection.people.filter(p=>p.active), $locale)'));
  assert.ok(overview.includes('app.suggestions'));
  assert.ok(overview.includes('app.recent'));
  assert.ok(overview.includes('balances.slice(0,5)'));
  assert.ok(!overview.includes('class="solid-action" on:click={() => appState.setDialog({ type: \'itemAdd\' })}'));
  assert.ok(overview.includes('class:only-recent={!drafts.length}'));
  assert.ok(overview.includes('{#if drafts.length}'));
  assert.ok(!overview.includes('app.noDrafts'));
  const css = source('ui-v3/design.css');
  assert.ok(css.includes('.overview-layout.second-row.only-recent{grid-template-columns:minmax(0,1fr)}'));
});

test('inventory list keeps details but hides technical or empty sections', () => {
  const items = source('ui-v3/InventoryView.svelte');
  assert.ok(items.includes('tags.length > 1 || tag'));
  assert.ok(items.includes('{#if search.trim() || tag}'));
  assert.ok(items.includes('{#if archived.length}'));
  assert.ok(items.includes("pluralMessage('items.ownerCount', item.shareRows.length, $locale)"));
  assert.ok(items.includes('appState.setRoute({page:\'item\',id:item.id})'));
  assert.ok(!items.includes('valuationLabel'));
  assert.ok(!items.includes('inventory-bottom'));
  const language = source('src/lib/i18n.js');
  assert.equal((language.match(/"items.ownerCount.one"/g) || []).length, 2);
  assert.equal((language.match(/"items.ownerCount.other"/g) || []).length, 2);
});

test('people keep directional balances and a link to detail without an idle counter', () => {
  const people = source('ui-v3/PeopleView.svelte');
  assert.ok(people.includes('{#if search.trim()}'));
  assert.ok(people.includes("cents > 0 ? $translate('people.toReceive') : $translate('people.toSettle')"));
  assert.ok(people.includes("appState.setRoute({page:'person',id:person.id})"));
  assert.ok(people.includes("pluralMessage('people.itemCount'"));
});


test('item detail has one back control, prominent ownership and directly visible actions', () => {
  const item = source('ui-v3/ItemDetail.svelte');
  assert.ok(!item.includes('class="breadcrumb"'));
  assert.ok(item.includes('item-core-facts'));
  assert.ok(item.includes('<div class="valuation-detail">'));
  assert.ok(item.includes('<div class="secondary-actions" role="group"'));
  assert.ok(item.includes('class="panel-header ownership-header"'));
  assert.ok(item.includes("type: 'shareSet', itemId: item.id"));
  assert.ok(item.includes("type: 'itemContinue', itemId: item.id"));
  assert.ok(item.includes('transferClaims.length'));
  assert.ok(item.includes('purchaseBreakdown('));
  assert.ok(item.includes('purchase.purchaseHistory'));
  assert.ok(item.includes('purchase.historyNote'));
  assert.ok(item.includes('<Timeline project='));
});

test('person detail puts the personal balance and settlement first, without losing any actions', () => {
  const person = source('ui-v3/PersonDetail.svelte');
  assert.ok(!person.includes('class="breadcrumb"'));
  assert.ok(person.includes('person-core-facts'));
  assert.ok(person.includes('<div class="secondary-actions" role="group"'));
  assert.ok(person.includes("type: 'personMeta', personId: person.id"));
  assert.ok(person.includes("type:'personStatus'"));
  assert.ok(person.includes('on:click={startTransfer}'));
  assert.ok(person.includes('on:click={startDissolve}'));
  assert.ok(person.indexOf('ui.settlement-options-1u5xuy7') < person.indexOf('ui.balance-breakdown-kyjlab'));
  assert.ok(person.includes('<BalanceBreakdown detail={balanceDetail} {balanceCents}/>'));
  assert.ok(person.includes('<Timeline project='));
});


test('finance view leads with settlement suggestions rather than ownership transfers', () => {
  const app = source('ui-v3/App.svelte');
  const finance = app.slice(app.indexOf("{:else if activeSection === 'money'}"), app.indexOf("{:else if activeSection === 'activity'}"));
  assert.ok(finance.includes('nav.money'));
  assert.ok(!finance.includes('appState.startRedistribution()'));
  const ledger = source('ui-v3/LedgerView.svelte');
  assert.ok(!ledger.includes('ui.value-settlement-19afpms'));
  assert.ok(ledger.indexOf('ui.how-to-settle-balances-1hpc1r') < ledger.indexOf('ui.personal-balances-6tb5zl'));
  assert.ok(ledger.includes('on:click={() => addSettlement(transfer)}'));
});

test('settings show one language selector and show commands without a nested disclosure, retaining explicit confirmation', () => {
  const app = source('ui-v3/App.svelte');
  const settings = app.slice(app.indexOf("{:else if activeSection === 'settings'}"), app.indexOf('      {/key}'));
  assert.equal((settings.match(/id="language-selection"/g) || []).length, 1);
  assert.ok(settings.includes("resolveLocale('auto'") === false); // Resolution is shared with the app script.
  assert.ok(app.includes("const autoLanguage = resolveLocale('auto'"));
  assert.ok(settings.includes('settings.advanced'));
  assert.ok(settings.includes('<section class="ux-panel setting-panel settings-advanced"'));
  assert.ok(settings.includes('showJson'));
  assert.ok(settings.includes('showDanger'));
  const language = source('src/lib/i18n.js');
  assert.equal((language.match(/"settings.advanced"/g) || []).length, 2);
  assert.equal((language.match(/"ui.moreActions"/g) || []).length, 2);
});

test('Q35: short option groups are visible while extensive histories remain collapsible', () => {
  for (const [path, group] of [['ItemDetail','secondary-actions'],['PersonDetail','secondary-actions'],['DialogRouter','item-extra-fields'],['RedistributionDialog','redistribution-advanced'],['App','settings-advanced'],['StorageView','storage-secondary']]) {
    const component = source('ui-v3/' + path + '.svelte');
    assert.ok(!component.split('\n').some(line => line.includes('<details') && line.includes(group)), path);
  }
  const storage = source('ui-v3/StorageView.svelte');
  assert.ok(storage.includes('bind:value={remoteCreatePassword}'));
  assert.ok(storage.includes('bind:value={remotePassword}'));
  assert.ok(storage.includes('<details class="ux-panel storage-versions"'));
  const ledger = source('ui-v3/LedgerView.svelte');
  assert.ok(ledger.includes('<details class="audit-disclosure">'));
});

test('Q25: cards extend native primary buttons without nesting secondary controls', () => {
  const css=source('ui-v3/design.css');
  assert.match(css,/\.action-card \.card-primary::after\{[^}]*inset:0/);
  assert.match(css,/\.card-primary:focus-visible::after/);
  assert.match(css,/\.card-secondary\{position:relative;z-index:2/);
  for(const [path,kind] of [['InventoryView','item-tile'],['PeopleView','person-tile'],['App','metric'],['LedgerView','transfer-row']]){
    const s=source('ui-v3/'+path+'.svelte');
    assert.ok(s.includes('class="'+kind+' action-card"'),path);
    assert.ok(s.includes('card-primary'),path);
  }
  const app=source('ui-v3/App.svelte');
  assert.ok(app.includes('subtle-danger card-secondary'));
  assert.ok(app.includes('preview={true}/>'));
  assert.ok(app.includes('full={true}/>'));
  assert.ok(!app.includes('focusRecentEvent'));
  assert.ok(app.includes("navigate('activity')"));
  assert.ok(source('ui-v3/CompactNames.svelte').includes('pointer-events:auto'));
});


test('Q28: no Markdown detail exports in the supported browser UI; project saving stays available', () => {
  for (const dir of ['ui-v3/', 'src/components/']) {
    for (const name of readdirSync(new URL('../' + dir, import.meta.url)).filter(name => name.endsWith('.svelte'))) {
      const component = source(dir + name);
      assert.doesNotMatch(component, /redistributionMarkdown|copyMarkdown|copy-markdown|export-markdown|details-exportieren|export-details|Markdown exportieren|Markdown kopieren/i, dir + name);
    }
  }
  const edit = source('ui-v3/ExecutedRedistributionEditDialog.svelte');
  assert.ok(edit.includes('ui.effect-of-the-change-13xavst'));
  assert.ok(edit.includes('preview.rows'));
  assert.ok(edit.includes('preview.payments'));
  const storage = source('ui-v3/StorageView.svelte');
  assert.ok(storage.includes('exportPlain'));
  assert.ok(storage.includes('exportEncrypted'));
  assert.ok(storage.includes('saveFromHeader'));
});


test('Q09/Q25: standalone build finance checks accept compound class attributes, not substrings', () => {
  const ledger = source('ui-v3/LedgerView.svelte');
  const build = source('scripts/inline-ui-v3.mjs');
  assert.ok(build.includes('ledgerClasses.has(className)'));
  assert.ok(!build.includes(`ledgerSource.includes('class="'+className+'"')`));
  const classes = new Set([...ledger.matchAll(/\bclass="([^"]*)"/g)]
    .flatMap(([,value]) => value.split(/\s+/).filter(Boolean)));
  for (const name of ['transfer-row', 'transfer-amount', 'person-balance-row', 'audit-row']) {
    assert.ok(classes.has(name), name);
  }
  assert.ok(classes.has('action-card'));
  assert.ok(!classes.has('transfer'));
});
