import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaries } from '../src/lib/i18n.js';
const translationKey = de => Object.entries(dictionaries.de).find(([, text]) => text === de)?.[0];
const atTranslation = (component, de) => { const key = translationKey(de); assert.ok(key, 'missing de translation: ' + de); return component.indexOf(key); };

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('settlement proposals are the primary action, before personal balances and optional audit history', () => {
  for (const path of ['ui-v3/LedgerView.svelte']) {
    const s = source(path);
    const proposal = atTranslation(s, 'So könnt ihr ausgleichen');
    const personal = atTranslation(s, 'Offene Beträge pro Person');
    const audit = atTranslation(s, 'Eingetragene Zahlungen und Verrechnungen');
    assert.ok(proposal !== -1 && personal > proposal && audit > personal, path);
    assert.match(s, /BalanceBreakdown/);
    assert.match(s, /type: 'settlementAdd'/);
    assert.match(s, /type:'settlementEdit'/);
  }
});

test('the payment form states the fact of a completed transfer and stays scrollable on mobile', () => {
  const s = source('src/components/SettlementDialog.svelte');
  assert.ok(atTranslation(s, 'Ist diese Zahlung bereits erfolgt?') >= 0);
  assert.ok(atTranslation(s, 'Zahlung als erfolgt erfassen') >= 0);
  assert.match(dictionaries.de['help.confirmPaid'], /bereits erfolgte Zahlungen/);
  assert.match(dictionaries.de['help.confirmPaid'], /Kaufänderung/);
  assert.match(dictionaries.en['help.confirmPaid'], /completed payments/i);
  assert.match(dictionaries.en['help.confirmPaid'], /purchase correction/i);
  assert.ok(s.includes('help.confirmPaid'));
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


test('contextual help does not occupy the main layout until requested', () => {
  const help = source('src/components/HelpTip.svelte');
  assert.match(help, /aria-label=\{label\}/);
  assert.match(help, /aria-expanded=\{open\}/);
  assert.match(help, /\{#if open\}/);
  assert.match(help, /event\.key === 'Escape'/);
  assert.match(help, /onWindowClick/);

  for (const file of ['ui-v3/LedgerView.svelte']) {
    const s = source(file);
    assert.match(s, /import HelpTip/);
    assert.match(s, /help\.suggestionsFull/);
    assert.match(s, /<HelpTip[^>]*triggerText=\{\$translate\("help\.calculation"\)\}/);
    assert.doesNotMatch(s, /<p class="intro">/);
    assert.doesNotMatch(s, /<p class="section-footnote">/);
  }
  for (const [file,key] of [['ui-v3/Timeline.svelte','help.claimsCalculated'],
    ['ui-v3/RedistributionDialog.svelte','help.shareChange'],
    ['ui-v3/ExecutedRedistributionEditDialog.svelte','help.shareChange'],
    ['src/components/SettlementDialog.svelte','help.confirmPaid']]) {
    assert.ok(source(file).includes(key),file);
    assert.doesNotMatch(source(file), /<HelpTip/);
  }
  const dialog = source('src/components/SettlementDialog.svelte');
  assert.ok(atTranslation(dialog, 'Ist diese Zahlung bereits erfolgt?') >= 0);
  assert.doesNotMatch(dialog, /<p class="settlement-intro">/);
});
