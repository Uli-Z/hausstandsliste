import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaimSettlementEvent, paymentForBalance } from '../src/lib/claimSettlement.js';
import { ledgerAt } from '../src/lib/ledger.js';
import { normalize } from '../src/lib/domain.js';
import { exportProject } from '../src/lib/persistence.js';

const fixed = { type: 'fixed', minimumValue: 0 };
const purchase = (id, amount, shares, payer, date = '2026-01-10') => ({
  id: 'purchase-' + id, type: 'item-added', date, order: 1, itemId: id,
  initialValue: amount, shares, valuation: fixed,
  financialMode: 'derived', financedByPersonId: payer
});
const makeProject = () => ({
  people: ['anna', 'ben', 'clara'].map(id => ({ id, name: id })),
  items: ['fridge', 'sofa'].map(id => ({ id, name: id })),
  events: [purchase('fridge', 100, { ben: 1 }, 'anna')],
  drafts: []
});
function pay(p, payer, recipient, cents, date = '2026-02-01', kind = 'paid') {
  const event = createClaimSettlementEvent(p, {
    date, debtorPersonId: payer, creditorPersonId: recipient,
    amountCents: cents, settlementKind: kind
  });
  p.events.push(event);
  return event;
}
const pair = p => ledgerAt(p, '2026-12-31').pairwise;

test('payment is an independent inverse claim; overpayment becomes a credit', () => {
  const p = makeProject();
  const event = pay(p, 'ben', 'anna', 12000);
  assert.equal(event.sourceEventId, undefined);
  assert.equal(event.itemId, undefined);
  const ledger = ledgerAt(p, '2026-02-01');
  assert.deepEqual(ledger.claims.map(c => c.amountCents), [10000]);
  assert.deepEqual(ledger.counterclaims.map(c => [
    c.debtorPersonId, c.creditorPersonId, c.amountCents
  ]), [['anna', 'ben', 12000]]);
  assert.deepEqual(ledger.pairwise, [
    { fromPersonId: 'anna', toPersonId: 'ben', amountCents: 2000 }
  ]);
  assert.equal(ledger.warnings.length, 0);
});

test('payment and new purchase always net against the same bilateral account', () => {
  const p = makeProject();
  pay(p, 'ben', 'anna', 12000);
  p.events.push(purchase('sofa', 50, { anna: 1 }, 'ben', '2026-03-01'));
  assert.deepEqual(pair(p), [{ fromPersonId: 'anna', toPersonId: 'ben', amountCents: 7000 }]);
});

test('backdated change or deletion of a purchase never changes recorded payment', () => {
  const p = makeProject();
  const paid = pay(p, 'ben', 'anna', 12000);
  p.events[0].initialValue = 80;
  assert.deepEqual(pair(p), [{ fromPersonId: 'anna', toPersonId: 'ben', amountCents: 4000 }]);
  assert.equal(paid.amountCents, 12000);
  p.events.shift();
  assert.deepEqual(pair(p), [{ fromPersonId: 'anna', toPersonId: 'ben', amountCents: 12000 }]);
  assert.equal(paid.amountCents, 12000);
  assert.equal(ledgerAt(p, '2026-12-31').warnings.length, 0);
});

test('payments may precede a source purchase; no source or item is required', () => {
  const p = makeProject();
  const event = pay(p, 'ben', 'anna', 6000, '2026-01-01');
  assert.equal(event.itemId, undefined);
  assert.deepEqual(ledgerAt(p, '2026-01-05').pairwise, [
    { fromPersonId: 'anna', toPersonId: 'ben', amountCents: 6000 }
  ]);
  assert.deepEqual(ledgerAt(p, '2026-02-01').pairwise, [
    { fromPersonId: 'ben', toPersonId: 'anna', amountCents: 4000 }
  ]);
});

test('two independent partial payments and a second person remain distinct', () => {
  const p = makeProject();
  p.events[0].initialValue = 300;
  p.events[0].shares = { anna: 1, ben: 1, clara: 1 };
  pay(p, 'ben', 'anna', 6000);
  pay(p, 'clara', 'anna', 10000);
  assert.deepEqual(pair(p), [{ fromPersonId: 'ben', toPersonId: 'anna', amountCents: 4000 }]);
  const all = ledgerAt(p, '2026-02-02');
  assert.equal(all.claims.length, 2);
  assert.equal(all.counterclaims.length, 2);
  assert.equal(all.balances.get('ben'), -4000);
  assert.equal(all.balances.get('anna'), 4000);
});

test('mark-as-paid shortcut only generates the opposite posting for the net balance', () => {
  const p = makeProject();
  const balance = ledgerAt(p, '2026-02-01').pairwise[0];
  const event = paymentForBalance(p, balance, '2026-02-01');
  assert.equal(event.amountCents, 10000);
  assert.equal(event.debtorPersonId, 'ben');
  assert.equal(event.creditorPersonId, 'anna');
  assert.equal(event.sourceEventId, undefined);
  assert.equal(event.itemId, undefined);
  p.events.push(event);
  assert.deepEqual(pair(p), []);
  assert.throws(() => paymentForBalance(p, { ...balance, amountCents: 0 }, '2026-02-01'), TypeError);
});

test('JSON roundtrip retains amounts, kinds, and old optional references without using them', () => {
  const p = makeProject();
  const entry = createClaimSettlementEvent(p, {
    date: '2026-02-01', debtorPersonId: 'ben', creditorPersonId: 'anna',
    amountCents: 12000, settlementKind: 'paid', note: 'Ausgleich',
    sourceEventId: 'arbitrary-old-reference', itemId: 'fridge'
  });
  p.events.push(entry);
  const restored = normalize(JSON.parse(JSON.stringify(exportProject(p, '2026-02-02'))));
  assert.deepEqual(restored.events, p.events);
  assert.deepEqual(ledgerAt(restored, '2026-02-02').pairwise, [
    { fromPersonId: 'anna', toPersonId: 'ben', amountCents: 2000 }
  ]);
});

test('externally tracked and waived bookings remain distinct from actual payments', () => {
  const p = makeProject();
  pay(p, 'ben', 'anna', 4000, '2026-02-01', 'paid');
  pay(p, 'ben', 'anna', 4000, '2026-02-02', 'external');
  pay(p, 'ben', 'anna', 2000, '2026-02-03', 'waived');
  const ledger = ledgerAt(p, '2026-02-03');
  assert.deepEqual(ledger.counterclaims.map(e => e.entryKind), ['paid', 'external', 'waived']);
  assert.deepEqual(ledger.pairwise, []);
});

test('unknown persons, invalid values and duplicate IDs cannot silently enter the balance', () => {
  const p = makeProject();
  const first = pay(p, 'ben', 'anna', 3000);
  p.events.push({ ...first });
  assert.equal(ledgerAt(p, '2026-02-01').warnings.length, 2);
  assert.deepEqual(ledgerAt(p, '2026-02-01').pairwise, [
    { fromPersonId: 'ben', toPersonId: 'anna', amountCents: 10000 }
  ]);
  p.events.pop();
  first.creditorPersonId = 'missing';
  assert.equal(ledgerAt(p, '2026-02-01').warnings[0].code, 'unknown-person');
  first.creditorPersonId = 'anna';
  first.amountCents = -1;
  assert.equal(ledgerAt(p, '2026-02-01').warnings[0].code, 'invalid-event');
});

test('cent rounding and historical cutoff remain deterministic', () => {
  const p = makeProject();
  p.events[0].initialValue = 10.01;
  p.events[0].shares = { anna: 1, ben: 1, clara: 1 };
  pay(p, 'ben', 'anna', 334, '2026-02-01');
  assert.deepEqual(ledgerAt(p, '2026-01-31').claims.map(c => c.amountCents), [334, 333]);
  assert.deepEqual(ledgerAt(p, '2026-01-31').pairwise, [
    { fromPersonId: 'ben', toPersonId: 'anna', amountCents: 334 },
    { fromPersonId: 'clara', toPersonId: 'anna', amountCents: 333 }
  ]);
  assert.deepEqual(pair(p), [{ fromPersonId: 'clara', toPersonId: 'anna', amountCents: 333 }]);
});
