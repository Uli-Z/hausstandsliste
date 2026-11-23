import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAYMENT_STATUS_NOTICE, BILATERAL_BALANCE_DESCRIPTION,
  MULTILATERAL_SUGGESTION_DESCRIPTION, REDISTRIBUTION_SUGGESTION_TITLE,
  REDISTRIBUTION_SUGGESTION_NOTICE, DERIVED_CLAIMS_DESCRIPTION,
  FINANCIAL_EVENT_NOTE, ITEM_FUNDING_NOTE, PERSON_BALANCE_NOTE
} from '../src/lib/financialLabels.js';
import { ledgerAt } from '../src/lib/ledger.js';
import { dictionaries } from '../src/lib/i18n.js';
const hasTranslation = (component, germanText) => Object.entries(dictionaries.de).some(([key, value]) => value === germanText && component.includes(key));

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('A06: labels always separate derived claims, payment suggestions and booked payments', () => {
  assert.match(PAYMENT_STATUS_NOTICE, /Dokumentierte Ausgleichsereignisse/i);
  assert.match(BILATERAL_BALANCE_DESCRIPTION, /gegenläufigen Ansprüchen/i);
  assert.match(MULTILATERAL_SUGGESTION_DESCRIPTION, /unverbindlich/i);
  assert.match(MULTILATERAL_SUGGESTION_DESCRIPTION, /Keine Zahlung/i);
  assert.match(REDISTRIBUTION_SUGGESTION_TITLE, /noch keine Zahlung/i);
  assert.match(REDISTRIBUTION_SUGGESTION_NOTICE, /kein Geld wird überwiesen/i);
  assert.match(DERIVED_CLAIMS_DESCRIPTION, /dokumentierten Ausgleiche/i);
});

test('A06: historical ownership event never displays a payment as having taken place', () => {
  const derived = FINANCIAL_EVENT_NOTE({ financialMode: 'derived' });
  assert.match(derived, /Geldanspruch/i);
  assert.match(derived, /keine Überweisung/i);
  const gift = FINANCIAL_EVENT_NOTE({ financialMode: 'none' });
  assert.match(gift, /Schenkung oder Korrektur/i);
  assert.match(gift, /ohne neuen Geldanspruch/i);
  assert.match(gift, /ohne Zahlung/i);
  assert.match(FINANCIAL_EVENT_NOTE({ financialMode: 'none' }), /ohne neuen Geldanspruch/i);
  assert.match(ITEM_FUNDING_NOTE({ financialMode: 'derived', financedByPersonId: 'anna' }), /noch nicht gebucht/i);
  assert.match(ITEM_FUNDING_NOTE({ financedByPersonId: 'anna' }), /kein automatischer Geldanspruch/i);
});

test('A06: zero net balance does not certify a paid debt', () => {
  assert.match(PERSON_BALANCE_NOTE(10000), /rechnerisch zu erhalten/i);
  assert.match(PERSON_BALANCE_NOTE(-10000), /rechnerisch zu zahlen/i);
  assert.match(PERSON_BALANCE_NOTE(0), /nicht gleich bezahlt/i);

  const project = {
    people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }],
    items: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    events: [
      { id: 'purchase-a', type: 'item-added', itemId: 'a', date: '2026-01-01', order: 1,
        initialValue: 100, shares: { ben: 1 }, financedByPersonId: 'anna',
        valuation: { type: 'fixed' }, financialMode: 'derived' },
      { id: 'purchase-b', type: 'item-added', itemId: 'b', date: '2026-01-01', order: 2,
        initialValue: 100, shares: { anna: 1 }, financedByPersonId: 'ben',
        valuation: { type: 'fixed' }, financialMode: 'derived' }
    ]
  };
  const ledger = ledgerAt(project, '2026-01-02');
  assert.equal(ledger.claims.length, 2);
  assert.deepEqual(ledger.pairwise, []);
  assert.deepEqual(ledger.simplified, []);
  assert.match(PERSON_BALANCE_NOTE(ledger.balances.get('anna')), /nicht gleich bezahlt/i);
  assert.equal(project.events.some(event => event.type === 'claim-settlement-recorded'), false);
});

test('A06: current UI uses consistent financial labels and no payment counts', () => {
  for (const flavor of ['ui-v3/']) {
    const timeline = source(flavor + 'Timeline.svelte');
    assert.match(timeline, /FINANCIAL_EVENT_NOTE\(event\)/);
    assert.match(timeline, /ITEM_FUNDING_NOTE\(event\)/);
    assert.doesNotMatch(timeline, /preview\.payments\.length/);
    assert.doesNotMatch(timeline, /\} Zahlungen/);
    const panel = source(flavor + 'LedgerView.svelte');
    assert.ok(hasTranslation(panel, 'Offene Beträge pro Person'));
    assert.ok(hasTranslation(panel, 'Ausgleichen'));
    assert.match(panel, /BalanceBreakdown/);
    assert.ok(hasTranslation(panel, 'Zahlung erfassen'));
    assert.ok(hasTranslation(panel, 'Woher die Beträge stammen'));
    const transfer = source('ui-v3/RedistributionDialog.svelte');
    // The simplified transfer dialog now uses localized, visible wording
    // instead of the older technical suggestion-title helper.
    assert.match(transfer, /redistribution\.claimEffect/);
    assert.match(transfer, /redistribution\.noPaymentRecorded/);
    assert.match(transfer, /redistribution\.withoutClaims/);
    const existingTransfer = source('ui-v3/ExecutedRedistributionEditDialog.svelte');
    assert.match(existingTransfer, /REDISTRIBUTION_SUGGESTION_TITLE/);
    assert.match(existingTransfer, /REDISTRIBUTION_SUGGESTION_NOTICE/);
  }
  const dashboard = source('ui-v3/App.svelte');
  assert.match(dashboard, /Ausgleichsvorschläge|app\.suggestions/);
  assert.match(dashboard, /outstandingCents/);
  assert.doesNotMatch(dashboard, /Keine offenen Beträge/);
});
