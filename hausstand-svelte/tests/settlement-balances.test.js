import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaimSettlementForClaim } from '../src/lib/claimMatching.js';
import { deriveClaims, ledgerAt } from '../src/lib/ledger.js';
import { projectAt } from '../src/lib/projector.js';
import { exportProject } from '../src/lib/persistence.js';
import { normalize } from '../src/lib/domain.js';

const fixed = { type: 'fixed', minimumValue: 0 };
const purchase = (id, amount, shares, payer, order = 1) => ({
  id: 'purchase-' + id, type: 'item-added', date: '2026-01-01', order,
  itemId: id, initialValue: amount, valuation: fixed, shares,
  financialMode: 'derived', financedByPersonId: payer
});
const makeProject = () => ({
  people: ['anna', 'ben', 'clara'].map(id => ({ id, name: id })),
  items: ['fridge', 'sofa'].map(id => ({ id, name: id })),
  events: [purchase('fridge', 300, { anna: 1, ben: 1, clara: 1 }, 'anna')],
  drafts: []
});
const add = (project, debtor, cents, kind, date = '2026-02-01', itemId = 'fridge') => {
  const claim = deriveClaims(project, date).find(c => c.debtorPersonId === debtor && c.itemId === itemId);
  assert.ok(claim, 'expected derived claim');
  const event = createClaimSettlementForClaim(project, claim, {
    date, amountCents: cents, settlementKind: kind
  });
  project.events.push(event);
  return event;
};
const pos = (ledger, debtor, itemId = 'fridge') =>
  ledger.claimPositions.find(p => p.claim.debtorPersonId === debtor && p.claim.itemId === itemId);

test('B03: third-party funded acquisition: Ben pays 60, Clara pays 100, only Ben owes 40', () => {
  const p = makeProject();
  const before = ledgerAt(p, '2026-01-31');
  assert.deepEqual(before.pairwise, [
    { fromPersonId: 'ben', toPersonId: 'anna', amountCents: 10000 },
    { fromPersonId: 'clara', toPersonId: 'anna', amountCents: 10000 }
  ]);
  const ben = add(p, 'ben', 6000, 'paid');
  add(p, 'clara', 10000, 'paid');
  assert.equal(p.events.at(-2).id, ben.id);
  const ledger = ledgerAt(p, '2026-02-01');
  assert.equal(ledger.claims.length, 2, 'historical gross claims stay available');
  assert.deepEqual(ledger.claims.map(c => c.amountCents), [10000, 10000]);
  assert.deepEqual(ledger.openClaims.map(c => c.amountCents), [4000]);
  assert.deepEqual(ledger.pairwise, [
    { fromPersonId: 'ben', toPersonId: 'anna', amountCents: 4000 }
  ]);
  assert.equal(ledger.balances.get('anna'), 4000);
  assert.equal(ledger.balances.get('ben'), -4000);
  assert.equal(ledger.balances.has('clara'), false);
  assert.equal(pos(ledger, 'ben').status, 'partial');
  assert.equal(pos(ledger, 'ben').paidCents, 6000);
  assert.equal(pos(ledger, 'ben').outstandingCents, 4000);
  assert.equal(pos(ledger, 'clara').status, 'paid');
  assert.equal(pos(ledger, 'clara').paidCents, 10000);
  assert.equal(pos(ledger, 'clara').outstandingCents, 0);
  assert.deepEqual(ledger.itemBalances.map(x => [x.itemId, x.amountCents, x.paidCents, x.outstandingCents]),
    [['fridge', 20000, 16000, 4000]]);
  assert.deepEqual(ledger.warnings, []);
  assert.deepEqual(ledgerAt(p, '2026-01-31').pairwise, before.pairwise,
    'a recorded payment must not affect historical snapshots');
  assert.deepEqual(projectAt(p, '2026-02-02').activeItems[0].shares, { anna: 1, ben: 1, clara: 1 });
});

test('B03: second dated payment closes the remaining 40, without changing the original events', () => {
  const p = makeProject();
  add(p, 'ben', 6000, 'paid');
  add(p, 'ben', 4000, 'paid', '2026-03-01');
  const before = ledgerAt(p, '2026-02-28');
  const after = ledgerAt(p, '2026-03-01');
  assert.equal(pos(before, 'ben').outstandingCents, 4000);
  assert.equal(pos(after, 'ben').outstandingCents, 0);
  assert.equal(pos(after, 'ben').status, 'paid');
  assert.equal(pos(after, 'ben').paidCents, 10000);
  assert.equal(pos(after, 'ben').settlements.length, 2);
  assert.deepEqual(after.pairwise, [
    { fromPersonId: 'clara', toPersonId: 'anna', amountCents: 10000 }
  ]);
  assert.equal(p.events[0].initialValue, 300);
  assert.equal(p.events.length, 3);
});

test('B03: external handoff and waived remainder clear local balance without alleging paid', () => {
  const p = makeProject();
  add(p, 'ben', 4000, 'paid');
  add(p, 'ben', 5000, 'external');
  add(p, 'ben', 1000, 'waived');
  add(p, 'clara', 10000, 'external');
  const ledger = ledgerAt(p, '2026-02-02');
  assert.equal(pos(ledger, 'ben').status, 'mixed');
  assert.deepEqual([
    pos(ledger, 'ben').paidCents, pos(ledger, 'ben').externalCents,
    pos(ledger, 'ben').waivedCents, pos(ledger, 'ben').outstandingCents
  ], [4000, 5000, 1000, 0]);
  assert.equal(pos(ledger, 'clara').status, 'external');
  assert.equal(pos(ledger, 'clara').paidCents, 0);
  assert.equal(pos(ledger, 'clara').externalCents, 10000);
  assert.deepEqual(ledger.pairwise, []);
  assert.equal(ledger.settlements.length, 4);
  assert.deepEqual(ledger.warnings, []);
});

test('B03: another item and a different debtor remain unaffected by a settlement', () => {
  const p = makeProject();
  p.events.push(purchase('sofa', 120, { ben: 1 }, 'anna', 2));
  add(p, 'ben', 6000, 'paid', '2026-02-01', 'fridge');
  const ledger = ledgerAt(p, '2026-03-01');
  assert.equal(pos(ledger, 'ben', 'fridge').outstandingCents, 4000);
  assert.equal(pos(ledger, 'ben', 'sofa').outstandingCents, 12000);
  assert.equal(pos(ledger, 'clara').outstandingCents, 10000);
  assert.deepEqual(ledger.itemBalances.map(x => [x.itemId, x.outstandingCents]),
    [['fridge', 14000], ['sofa', 12000]]);
  assert.deepEqual(ledger.pairwise, [
    { fromPersonId: 'ben', toPersonId: 'anna', amountCents: 16000 },
    { fromPersonId: 'clara', toPersonId: 'anna', amountCents: 10000 }
  ]);
});

test('B03: counterclaims net bilaterally after actual payments, not as a payment themselves', () => {
  const p = makeProject();
  p.events = [
    purchase('fridge', 200, { anna: 1 }, 'ben', 1),
    purchase('sofa', 120, { ben: 1 }, 'anna', 2)
  ];
  add(p, 'anna', 5000, 'paid');
  const ledger = ledgerAt(p, '2026-03-01');
  assert.equal(pos(ledger, 'anna').outstandingCents, 15000);
  assert.equal(pos(ledger, 'ben', 'sofa').outstandingCents, 12000);
  assert.deepEqual(ledger.pairwise, [
    { fromPersonId: 'anna', toPersonId: 'ben', amountCents: 3000 }
  ]);
  assert.equal(ledger.itemBalances.length, 2);
  assert.equal(ledger.settlements[0].event.settlementKind, 'paid');
});

test('B03: overpayment is reported and capped, never turned into negative credit', () => {
  const p = makeProject();
  add(p, 'ben', 12000, 'paid');
  add(p, 'ben', 3000, 'paid', '2026-02-02');
  const ledger = ledgerAt(p, '2026-02-03');
  assert.equal(pos(ledger, 'ben').outstandingCents, 0);
  assert.equal(pos(ledger, 'ben').paidCents, 10000);
  assert.deepEqual(ledger.warnings.map(x => [x.code, x.excessCents]),
    [['over-settlement', 2000], ['over-settlement', 3000]]);
  assert.deepEqual(ledger.settlements.map(s => [s.appliedCents, s.excessCents]),
    [[10000, 2000], [0, 3000]]);
  assert.deepEqual(ledger.pairwise, [
    { fromPersonId: 'clara', toPersonId: 'anna', amountCents: 10000 }
  ]);
  assert.equal(p.events[1].amountCents, 12000, 'historically recorded payment is unchanged');
});

test('B03: changing old price creates over-settlement warning without erasing payment', () => {
  const p = makeProject();
  add(p, 'ben', 10000, 'paid');
  p.events[0].initialValue = 150;
  const ledger = ledgerAt(p, '2026-02-02');
  assert.equal(pos(ledger, 'ben').amountCents, 5000);
  assert.equal(pos(ledger, 'ben').paidCents, 5000);
  assert.equal(ledger.warnings[0].code, 'over-settlement');
  assert.equal(ledger.warnings[0].excessCents, 5000);
  assert.equal(p.events[1].amountCents, 10000);
  p.events = p.events.filter(e => e.id !== 'purchase-fridge');
  const gone = ledgerAt(p, '2026-02-02');
  assert.deepEqual(gone.pairwise, []);
  assert.equal(gone.unmatchedSettlements[0].code, 'missing-source');
  assert.equal(gone.settlements.length, 0);
  assert.equal(p.events.length, 1, 'orphan event remains available for correction');
});

test('B03: invalid and dangling imported records do not reduce balances', () => {
  const p = makeProject();
  const paid = add(p, 'ben', 6000, 'paid');
  paid.debtorPersonId = 'clara';
  const ledger = ledgerAt(p, '2026-02-02');
  // Clara does have a claim, so this record is now attached to Clara,
  // showing why B12 must explicitly guard against editing settlement parties.
  assert.equal(pos(ledger, 'ben').outstandingCents, 10000);
  assert.equal(pos(ledger, 'clara').outstandingCents, 4000);
  paid.debtorPersonId = 'unknown';
  assert.equal(ledgerAt(p, '2026-02-02').unmatchedSettlements[0].code, 'claim-not-found');
  assert.equal(pos(ledgerAt(p, '2026-02-02'), 'ben').outstandingCents, 10000);
  paid.amountCents = -100;
  assert.equal(ledgerAt(p, '2026-02-02').unmatchedSettlements[0].code, 'invalid-event');
});

test('B03: export/import and source dates preserve exact stichtag-based amounts', () => {
  const p = makeProject();
  add(p, 'ben', 3333, 'paid', '2026-02-01');
  const copy = normalize(JSON.parse(JSON.stringify(exportProject(p, '2026-02-02'))));
  assert.equal(pos(ledgerAt(copy, '2026-02-02'), 'ben').outstandingCents, 6667);
  assert.equal(pos(ledgerAt(copy, '2026-01-31'), 'ben').outstandingCents, 10000);
  copy.events[1].date = '2026-04-01';
  assert.equal(pos(ledgerAt(copy, '2026-03-01'), 'ben').outstandingCents, 10000);
  assert.equal(pos(ledgerAt(copy, '2026-04-01'), 'ben').outstandingCents, 6667);
});

test('B03: cents for three shares are exact, legacy events remain financially neutral', () => {
  const p = makeProject();
  p.events[0].initialValue = 10.01;
  const initial = ledgerAt(p, '2026-01-02');
  assert.deepEqual(initial.claims.map(c => [c.debtorPersonId, c.amountCents]),
    [['ben', 334], ['clara', 333]]);
  add(p, 'ben', 100, 'paid');
  const partial = ledgerAt(p, '2026-02-01');
  assert.equal(pos(partial, 'ben').outstandingCents, 234);
  assert.equal(pos(partial, 'clara').outstandingCents, 333);
  const legacy = makeProject();
  delete legacy.events[0].financialMode;
  legacy.events.push(p.events[1]);
  assert.deepEqual(ledgerAt(legacy, '2026-02-02').claims, []);
  assert.deepEqual(ledgerAt(legacy, '2026-02-02').pairwise, []);
  assert.equal(ledgerAt(legacy, '2026-02-02').unmatchedSettlements[0].code, 'claim-not-found');
});
