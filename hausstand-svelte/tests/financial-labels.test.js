import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PAYMENT_STATUS_NOTICE, BILATERAL_BALANCE_DESCRIPTION,
  MULTILATERAL_SUGGESTION_DESCRIPTION, REDISTRIBUTION_SUGGESTION_TITLE,
  REDISTRIBUTION_SUGGESTION_NOTICE, DERIVED_CLAIMS_DESCRIPTION,
  FINANCIAL_EVENT_NOTE, ITEM_FUNDING_NOTE, PERSON_BALANCE_NOTE
} from '../src/lib/financialLabels.js';
import { ledgerAt } from '../src/lib/ledger.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('A06: labels always separate derived claims, payment suggestions and booked payments', () => {
  assert.match(PAYMENT_STATUS_NOTICE, /Dokumentierte Ausgleichsereignisse/i);
  assert.match(BILATERAL_BALANCE_DESCRIPTION, /gegenläufigen Ansprüchen/i);
  assert.match(MULTILATERAL_SUGGESTION_DESCRIPTION, /unverbindlich/i);
  assert.match(MULTILATERAL_SUGGESTION_DESCRIPTION, /Keine Zahlung/i);
  assert.match(REDISTRIBUTION_SUGGESTION_TITLE, /nicht gebucht/i);
  assert.match(REDISTRIBUTION_SUGGESTION_NOTICE, /keine gebuchte Zahlung/i);
  assert.match(DERIVED_CLAIMS_DESCRIPTION, /keine Zahlungen/i);
});

test('A06: historical ownership event never displays a payment as having taken place', () => {
  const derived = FINANCIAL_EVENT_NOTE({ financialMode: 'derived' });
  assert.match(derived, /Forderungen/i);
  assert.match(derived, /keine Zahlung gebucht/i);
  const legacy = FINANCIAL_EVENT_NOTE({ type: 'redistribution-executed' });
  assert.match(legacy, /Altvorgang/i);
  assert.match(legacy, /keine neue Forderung/i);
  assert.match(legacy, /keine Zahlung gebucht/i);
  assert.match(FINANCIAL_EVENT_NOTE({ financialMode: 'none' }), /keine neue Forderung/i);
  assert.match(ITEM_FUNDING_NOTE({ financialMode: 'derived', financedByPersonId: 'anna' }), /keine Zahlung gebucht/i);
  assert.match(ITEM_FUNDING_NOTE({ financedByPersonId: 'anna' }), /Keine Forderung/i);
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

test('A06: both interfaces use the same semantic labels and timelines never show payment counts', () => {
  for (const flavor of ['src/components/', 'ui-v3/']) {
    const timeline = source(flavor + 'Timeline.svelte');
    assert.match(timeline, /FINANCIAL_EVENT_NOTE\(event\)/);
    assert.match(timeline, /ITEM_FUNDING_NOTE\(event\)/);
    assert.doesNotMatch(timeline, /preview\.payments\.length/);
    assert.doesNotMatch(timeline, /\} Zahlungen/);
    const panel = source(flavor + (flavor.startsWith('ui-') ? 'LedgerView.svelte' : 'LedgerPanel.svelte'));
    assert.match(panel, /PAYMENT_STATUS_NOTICE/);
    assert.match(panel, /BILATERAL_BALANCE_DESCRIPTION/);
    assert.match(panel, /MULTILATERAL_SUGGESTION_DESCRIPTION/);
    assert.match(panel, /Entstandene Forderungen anzeigen/);
    const prefix = flavor.startsWith('ui-') ? 'ui-v3/' : 'src/components/';
    for (const name of ['RedistributionDialog.svelte', 'ExecutedRedistributionEditDialog.svelte']) {
      const dialog = source(prefix + name);
      assert.match(dialog, /REDISTRIBUTION_SUGGESTION_TITLE/);
      assert.match(dialog, /REDISTRIBUTION_SUGGESTION_NOTICE/);
    }
  }
  const dashboard = source('ui-v3/App.svelte');
  assert.match(dashboard, /Rechnerische Forderungssalden/);
  assert.match(dashboard, /PAYMENT_STATUS_NOTICE/);
  assert.doesNotMatch(dashboard, /Keine offenen Beträge/);
});
