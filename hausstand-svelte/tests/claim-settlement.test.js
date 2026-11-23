import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAIM_SETTLEMENT_TYPE, CLAIM_SETTLEMENT_KINDS,
  claimSettlementErrors, createClaimSettlementEvent, deriveSettlementCounterclaims
} from '../src/lib/claimSettlement.js';
import { projectAt } from '../src/lib/projector.js';
import { ledgerAt } from '../src/lib/ledger.js';

const makeProject = () => ({
  people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }],
  items: [{ id: 'fridge', name: 'Kühlschrank' }],
  events: [{
    id: 'purchase', type: 'item-added', date: '2026-01-01', order: 1,
    itemId: 'fridge', initialValue: 100,
    valuation: { type: 'fixed' }, shares: { ben: 1 },
    financedByPersonId: 'anna', financialMode: 'derived'
  }]
});
const args = (overrides = {}) => ({
  date: '2026-02-01', amountCents: 10000,
  debtorPersonId: 'ben', creditorPersonId: 'anna',
  settlementKind: 'paid', ...overrides
});

test('B01 revised: payment has stable ID/date/cent amount but no mandatory item linkage', () => {
  const p = makeProject();
  const event = createClaimSettlementEvent(p, args());
  assert.equal(event.type, CLAIM_SETTLEMENT_TYPE);
  assert.ok(event.id.startsWith('settlement_'));
  assert.ok(Number.isSafeInteger(event.order));
  assert.equal(event.itemId, undefined);
  assert.equal(event.sourceEventId, undefined);
  assert.equal(event.amountCents, 10000);
  assert.deepEqual(claimSettlementErrors(event), []);
  assert.equal(p.events.length, 1);
});

test('B01 revised: record validation rejects invalid amounts, dates or people', () => {
  for (const invalid of [
    { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.25 },
    { amountCents: '10' }, { date: '2026-02-30' }, { date: 'wrong' },
    { debtorPersonId: 'anna' }, { creditorPersonId: '' },
    { settlementKind: 'not-paid' }, { note: 12 }
  ]) {
    assert.throws(() => createClaimSettlementEvent(makeProject(), args(invalid)), TypeError);
  }
  assert.deepEqual(CLAIM_SETTLEMENT_KINDS, ['paid', 'external', 'waived']);
});

test('B01 revised: payments do not change ownership and only count as opposite money entries', () => {
  const p = makeProject();
  const event = createClaimSettlementEvent(p, args());
  p.events.push(event);
  assert.deepEqual(projectAt(p, '2026-02-02').warnings, []);
  assert.deepEqual(projectAt(p, '2026-02-02').activeItems[0].shares, { ben: 1 });
  assert.deepEqual(ledgerAt(p, '2026-01-31').pairwise, [
    { fromPersonId: 'ben', toPersonId: 'anna', amountCents: 10000 }
  ]);
  assert.deepEqual(ledgerAt(p, '2026-02-02').pairwise, []);
  assert.deepEqual(deriveSettlementCounterclaims(p, '2026-02-02').entries.map(e => [
    e.debtorPersonId, e.creditorPersonId, e.amountCents
  ]), [['anna', 'ben', 10000]]);
});

test('payments cannot contain old purchase or source references', () => {
  const p = makeProject();
  const event = createClaimSettlementEvent(p, args({
    sourceEventId: 'purchase', childEventId: 'child-1', itemId: 'fridge'
  }));
  assert.equal(event.sourceEventId, undefined);
  assert.equal(event.childEventId, undefined);
  assert.equal(event.itemId, undefined);
  assert.deepEqual(claimSettlementErrors({ ...event, sourceEventId: 'purchase' }).length > 0, true);
});
