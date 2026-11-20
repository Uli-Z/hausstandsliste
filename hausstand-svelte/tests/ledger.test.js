import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateCents, deriveClaims, pairwiseBalances, simplifiedTransfers, ledgerAt } from '../src/lib/ledger.js';

const fixed = { type: 'fixed', minimumValue: 0 };
const project = events => ({
  people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }, { id: 'clara', name: 'Clara' }],
  items: ['one', 'two', 'three'].map(id => ({ id, name: id })),
  events
});
const item = (id, value, shares, date = '2026-01-01', extra = {}) => ({
  id: 'create-' + id, type: 'item-added', itemId: id, date, order: 1,
  initialValue: value, valuation: fixed, shares, ...extra
});
const transfer = (id, itemId, shares, date = '2026-02-01', order = 1, extra = {}) => ({
  id, type: 'shares-set', itemId, date, order, shares, financialMode: 'derived', ...extra
});
const scenario = () => [
  item('one', 200, { ben: 1 }),
  item('two', 75, { anna: 1 }),
  item('three', 45, { anna: 1 }),
  transfer('buy200', 'one', { anna: 1 }, '2026-02-01'),
  transfer('sell75', 'two', { ben: 1 }, '2026-02-02'),
  transfer('sell45', 'three', { ben: 1 }, '2026-02-03')
];

test('counterclaims offset without a persisted settlement flag', () => {
  const p = project(scenario());
  const ledger = ledgerAt(p, '2026-03-01');
  assert.equal(ledger.claims.length, 3);
  assert.deepEqual(ledger.pairwise, [{ fromPersonId: 'anna', toPersonId: 'ben', amountCents: 8000 }]);
  assert.deepEqual(ledger.simplified, ledger.pairwise);
  assert.equal(ledger.claims[0].sourceEventId, 'buy200');
  assert.equal(p.finance, undefined);
});

test('amount changes and deletion immediately recalculate debts', () => {
  const events = scenario();
  events[0].initialValue = 150;
  assert.equal(ledgerAt(project(events), '2026-03-01').pairwise[0].amountCents, 3000);
  const withoutPurchase = scenario().filter(e => e.id !== 'buy200');
  assert.deepEqual(ledgerAt(project(withoutPurchase), '2026-03-01').pairwise, [
    { fromPersonId: 'ben', toPersonId: 'anna', amountCents: 12000 }
  ]);
});

test('moving a dated event updates depreciated claim and as-of cutoff', () => {
  const events = [
    { ...item('one', 100, { ben: 1 }, '2025-01-01'), valuation: { type: 'linear', durationYears: 2 } },
    transfer('change', 'one', { anna: 1 }, '2025-01-01', 2)
  ];
  assert.equal(deriveClaims(project(events), '2025-01-01')[0].amountCents, 10000);
  events[1].date = '2026-01-01';
  assert.equal(deriveClaims(project(events), '2025-12-31').length, 0);
  const later = deriveClaims(project(events), '2026-01-02');
  assert.equal(later.length, 1);
  assert.ok(later[0].amountCents >= 4900 && later[0].amountCents <= 5100);
});

test('removing one owner yields proportional debts of remaining owners', () => {
  const p = project([
    item('one', 300, { anna: 1, ben: 1, clara: 1 }),
    transfer('exit', 'one', { ben: 1, clara: 1 })
  ]);
  assert.deepEqual(deriveClaims(p, '2026-03-01').map(c => [c.debtorPersonId, c.creditorPersonId, c.amountCents]), [
    ['ben', 'anna', 5000], ['clara', 'anna', 5000]
  ]);
});

test('initial funding creates claims only when explicitly attributed', () => {
  const funding = item('one', 120, { anna: 1, ben: 1, clara: 1 }, '2026-01-01',
    { financedByPersonId: 'anna', financialMode: 'derived' });
  assert.deepEqual(deriveClaims(project([funding]), '2026-03-01').map(c => [c.debtorPersonId, c.amountCents]), [
    ['ben', 4000], ['clara', 4000]
  ]);
  delete funding.financedByPersonId;
  assert.deepEqual(deriveClaims(project([funding]), '2026-03-01'), []);
});

test('legacy events have no financial effect without an explicit marker', () => {
  const old = transfer('old', 'one', { anna: 1 });
  delete old.financialMode;
  const p = project([item('one', 100, { ben: 1 }), old]);
  assert.equal(deriveClaims(p, '2026-03-01').length, 0);
  old.financialMode = 'derived';
  assert.equal(deriveClaims(p, '2026-03-01')[0].amountCents, 10000);
});

test('child events use the parent container date and financial mode', () => {
  const container = { id: 'container', type: 'redistribution-executed', date: '2026-02-01', order: 2,
    financialMode: 'derived', events: [{ id: 'child', type: 'shares-set', itemId: 'one', shares: { anna: 1 } }] };
  const p = project([item('one', 200, { ben: 1 }), container]);
  const [claim] = deriveClaims(p, '2026-03-01');
  assert.equal(claim.amountCents, 20000);
  assert.equal(claim.sourceEventId, 'container');
  assert.equal(claim.childEventId, 'child');
  container.financialMode = 'none';
  assert.equal(deriveClaims(p, '2026-03-01').length, 0);
});

test('unchanged ratios, empty owners and invalid transitions create no fictitious transfers', () => {
  const p = project([item('one', 100, { anna: 2, ben: 1 }),
    transfer('same', 'one', { anna: 4, ben: 2 }),
    transfer('empty', 'one', {}, '2026-03-02')]);
  assert.deepEqual(deriveClaims(p, '2026-04-01'), []);
});

test('cent allocation is exact and deterministic even with thirds', () => {
  const split = allocateCents(1001, { clara: 1, ben: 1, anna: 1 });
  assert.deepEqual(split, { anna: 334, ben: 334, clara: 333 });
  assert.equal(Object.values(split).reduce((sum, x) => sum + x, 0), 1001);
});

test('multilateral simplification is a separate, non-binding projection', () => {
  const claims = [
    { debtorPersonId: 'anna', creditorPersonId: 'ben', amountCents: 10000 },
    { debtorPersonId: 'ben', creditorPersonId: 'clara', amountCents: 10000 }
  ];
  assert.equal(pairwiseBalances(claims).length, 2);
  assert.deepEqual(simplifiedTransfers(claims), [
    { fromPersonId: 'anna', toPersonId: 'clara', amountCents: 10000 }
  ]);
});
