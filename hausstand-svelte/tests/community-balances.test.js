import test from 'node:test';
import assert from 'node:assert/strict';
import { ledgerAt } from '../src/lib/ledger.js';
import { createClaimSettlementEvent } from '../src/lib/claimSettlement.js';

const project = (people = ['anna', 'ben', 'clara']) => ({
  people: people.map(id => ({ id, name: id })),
  items: ['fridge', 'sofa'].map(id => ({ id, name: id })),
  events: [], drafts: []
});
const buy = (p, id, value, shares, payer, date = '2026-01-01') => p.events.push({
  id: 'purchase-' + id, type: 'item-added', date, order: 1, itemId: id,
  initialValue: value, valuation: { type: 'fixed', minimumValue: 0 },
  shares, financedByPersonId: payer, financialMode: 'derived'
});
const pay = (p, from, to, cents, date = '2026-01-02') => p.events.push(
  createClaimSettlementEvent(p, {
    date, amountCents: cents, debtorPersonId: from,
    creditorPersonId: to, settlementKind: 'paid'
  })
);
const balance = (p, date = '2026-12-31') => ledgerAt(p, date);
const asObject = ledger => Object.fromEntries(ledger.balances.entries());

test('one person contributes a 300 EUR item shared in thirds', () => {
  const p = project();
  buy(p, 'fridge', 300, {anna:1, ben:1, clara:1}, 'anna');
  const l = balance(p);
  assert.deepEqual(asObject(l), {ben:-10000, clara:-10000, anna:20000});
  assert.deepEqual(l.simplified, [
    {fromPersonId:'ben',toPersonId:'anna',amountCents:10000},
    {fromPersonId:'clara',toPersonId:'anna',amountCents:10000}
  ]);
  assert.equal([...l.balances.values()].reduce((a,b)=>a+b,0),0);
});

test('real payment changes only personal balance, not ownership', () => {
  const p = project();
  buy(p, 'fridge', 300, {anna:1, ben:1, clara:1}, 'anna');
  pay(p, 'ben', 'anna', 6000);
  const l = balance(p);
  assert.equal(l.balances.get('anna'), 14000);
  assert.equal(l.balances.get('ben'), -4000);
  assert.equal(l.balances.get('clara'), -10000);
  assert.deepEqual(p.events[0].shares, {anna:1,ben:1,clara:1});
  assert.equal(l.counterclaims.length,1);
  assert.equal(l.counterclaims[0].amountCents,6000);
});

test('routing directly to another positive balance closes communal settlement', () => {
  const p = project();
  buy(p, 'fridge', 100, {anna:1}, 'ben');
  buy(p, 'sofa', 100, {ben:1}, 'clara');
  assert.deepEqual(balance(p).simplified, [
    {fromPersonId:'anna',toPersonId:'clara',amountCents:10000}
  ]);
  pay(p,'anna','clara',10000);
  const l=balance(p);
  assert.deepEqual(l.simplified, []);
  assert.deepEqual(asObject(l), {anna:0, ben:0, clara:0});
  // Original purchase claims remain auditable even though group balances are cleared.
  assert.equal(l.claims.length,2);
});

test('overpayment becomes credit, including after editing purchase', () => {
  const p = project(['anna','ben']);
  buy(p, 'fridge', 100, {ben:1}, 'anna');
  pay(p,'ben','anna',12000);
  assert.deepEqual(asObject(balance(p)), {ben:2000,anna:-2000});
  p.events[0].initialValue=80;
  const l=balance(p);
  assert.equal(l.balances.get('ben'),4000);
  assert.equal(l.balances.get('anna'),-4000);
  assert.equal(l.counterclaims[0].amountCents,12000);
});

test('a dated payment is visible only from its own date onward', () => {
  const p=project(['anna','ben']);
  buy(p,'fridge',100,{ben:1},'anna');
  pay(p,'ben','anna',10000,'2026-03-01');
  assert.equal(balance(p,'2026-02-28').balances.get('ben'),-10000);
  assert.equal(balance(p,'2026-03-01').balances.get('ben'),0);
});

test('personal explanation shows full financing, own shares and received payment', () => {
  const p = project();
  buy(p, 'fridge', 300, { anna: 1, ben: 1, clara: 1 }, 'anna');
  pay(p, 'ben', 'anna', 6000);
  const l = balance(p);
  const anna = l.details.get('anna');
  const ben = l.details.get('ben');
  assert.equal(anna.fundedCents, 30000);
  assert.equal(anna.initialSharesCents, 10000);
  assert.equal(anna.receivedPaymentsCents, 6000);
  assert.equal(anna.balanceCents, 14000);
  assert.equal(ben.initialSharesCents, 10000);
  assert.equal(ben.paidCents, 6000);
  assert.equal(ben.balanceCents, -4000);
});

test('transferred shares are explained separately from initial ownership and cash', () => {
  const p = project(['anna', 'ben']);
  buy(p, 'fridge', 100, { anna: 1 }, 'anna');
  p.events.push({
    id: 'share-transfer', type: 'shares-set', date: '2026-04-01',
    order: 1, itemId: 'fridge', shares: { ben: 1 }, financialMode: 'derived'
  });
  const l = balance(p);
  const anna = l.details.get('anna');
  assert.equal(anna.fundedCents, 10000);
  assert.equal(anna.initialSharesCents, 10000);
  assert.equal(anna.sharesGivenCents, 10000);
  assert.equal(anna.balanceCents, 10000);
  assert.equal(l.details.get('ben').sharesTakenCents, 10000);
  assert.equal(l.details.get('ben').balanceCents, -10000);
});

test('noncash offsets are not shown as real payments', () => {
  const p = project(['anna', 'ben']);
  buy(p, 'fridge', 100, { ben: 1 }, 'anna');
  p.events.push(createClaimSettlementEvent(p, {
    date: '2026-01-02', debtorPersonId: 'ben', creditorPersonId: 'anna',
    amountCents: 4000, settlementKind: 'waived'
  }));
  const l = balance(p);
  const ben = l.details.get('ben');
  assert.equal(ben.paidCents, 0);
  assert.equal(ben.adjustmentsPlusCents, 4000);
  assert.equal(ben.balanceCents, -6000);
});

test('every personal breakdown reconciles to the same single ledger, including historic cutoffs', () => {
  const p = project();
  buy(p, 'fridge', 300.01, { anna: 1, ben: 1, clara: 1 }, 'anna');
  p.events.push({
    id: 'share-transfer', type: 'shares-set', date: '2026-03-01',
    order: 1, itemId: 'fridge', shares: { anna: 2, clara: 1 }, financialMode: 'derived'
  });
  pay(p, 'ben', 'clara', 1700, '2026-04-01');
  for (const day of ['2026-01-01', '2026-02-02', '2026-03-01', '2026-04-01']) {
    const l = ledgerAt(p, day);
    for (const [id, detail] of l.details) {
      assert.equal(detail.balanceCents, l.balances.get(id) || 0,
        `Balance breakdown diverges for ${id} at ${day}`);
    }
    assert.equal([...l.balances.values()].reduce((a,b) => a+b,0), 0);
  }
});
