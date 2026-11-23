import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('overview retains the four metrics and quick actions but has no duplicate add-item button', () => {
  const app = source('ui-v3/App.svelte');
  const overview = app.slice(app.indexOf("activeSection === 'overview'"), app.indexOf("activeSection === 'items'"));
  assert.equal((overview.match(/<div class="metric">/g) || []).length, 4);
  assert.equal((overview.match(/<span class="task-icon">/g) || []).length, 4);
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
  assert.ok(items.includes("pluralMessage('items.ownerCount', item.shareRows.length)"));
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
