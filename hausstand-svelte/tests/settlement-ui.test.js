import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('settlement proposals are the primary action, before personal balances and optional audit history', () => {
  for (const path of ['ui-v3/LedgerView.svelte', 'src/components/LedgerPanel.svelte']) {
    const s = source(path);
    const proposal = s.indexOf('So könnt ihr ausgleichen');
    const personal = s.indexOf('Salden der Personen');
    const audit = s.indexOf('Dokumentierte Ausgleiche');
    assert.ok(proposal !== -1 && personal > proposal && audit > personal, path);
    assert.match(s, /BalanceBreakdown/);
    assert.match(s, /type: 'settlementAdd'/);
    assert.match(s, /type:'settlementEdit'/);
  }
});

test('the payment form states the fact of a completed transfer and stays scrollable on mobile', () => {
  const s = source('src/components/SettlementDialog.svelte');
  assert.match(s, /Ist diese Zahlung bereits erfolgt/);
  assert.match(s, /Zahlung als erfolgt erfassen/);
  assert.match(s, /Es wird kein Geld überwiesen|Die App überweist selbst kein Geld/);
  assert.match(s, /settlement-form/);
  assert.match(s, /grid-template-rows:minmax\(0,1fr\) auto/);
  assert.match(s, /setAsOfDate\(date\)/);
});

test('ordinary person and item views do not use decorative badges and empty category placeholders', () => {
  for (const path of [
    'ui-v3/PeopleView.svelte', 'ui-v3/PersonDetail.svelte',
    'ui-v3/InventoryView.svelte', 'ui-v3/ItemDetail.svelte',
    'ui-v3/App.svelte'
  ]) {
    const s = source(path);
    assert.doesNotMatch(s, /class=["'][^"']*\bbadge\b/, path);
    assert.doesNotMatch(s, /class=["'][^"']*\bcount-pill\b/, path);
    assert.doesNotMatch(s, /keine Tags/, path);
  }
  assert.match(source('ui-v3/InventoryView.svelte'), /bind:value=\{tag\}/);
  assert.match(source('ui-v3/PersonDetail.svelte'), /BalanceBreakdown/);
});
