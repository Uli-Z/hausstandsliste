import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAt, projectBeforeEvent } from '../src/lib/projector.js';
import { redistributionPreview } from '../src/lib/redistribution.js';
import { deriveClaims, ledgerAt } from '../src/lib/ledger.js';
import { nextEventOrder } from '../src/lib/util.js';

const date = '2026-02-01';
const itemAdded = () => ({
  id: 'acquisition', type: 'item-added', itemId: 'sofa', date: '2026-01-01', order: 1,
  initialValue: 100, valuation: { type: 'fixed', minimumValue: 0 },
  shares: { anna: 1 }, financialMode: 'none'
});
const transfer = (id, shares, onDate = date, order = 1, financialMode = 'derived') => ({
  id, type: 'shares-set', itemId: 'sofa', date: onDate, order, shares, financialMode
});
const group = (id, shares, onDate, order) => ({
  id, type: 'redistribution-executed', date: onDate, order,
  title: 'Übertragung', financialMode: 'derived',
  events: [{ id: 'child-' + id, type: 'shares-set', itemId: 'sofa', shares }]
});
const project = events => ({
  people: ['anna', 'ben', 'carla'].map(id => ({ id, name: id })),
  items: [{ id: 'sofa', name: 'Sofa' }],
  events
});
const sharesAt = (p, asOf = date) => projectAt(p, asOf).activeItems[0]?.shares;
const beforeShares = (p, id, onDate, order) =>
  projectBeforeEvent(p, id, onDate, order).activeItems[0]?.shares;

test('A07: same-day future ownership transfers do not enter the first transfer preview', () => {
  const p = project([
    itemAdded(), transfer('to-ben', { ben: 1 }, date, 20),
    transfer('to-carla', { carla: 1 }, date, 30)
  ]);
  const serialized = JSON.stringify(p);
  assert.deepEqual(sharesAt(p), { carla: 1 });
  assert.deepEqual(beforeShares(p, 'to-ben'), { anna: 1 });
  assert.deepEqual(beforeShares(p, 'to-carla'), { ben: 1 });
  const preview = redistributionPreview(p, {
    effectiveDate: date, financialMode: 'derived',
    changes: [{ itemId: 'sofa', shares: { ben: 1 } }]
  }, { beforeEventId: 'to-ben', order: 20 });
  assert.deepEqual(preview.base.activeItems[0].shares, { anna: 1 });
  assert.deepEqual(preview.rows.map(r => [r.personId, r.delta]), [
    ['ben', 100], ['anna', -100]
  ]);
  assert.deepEqual(preview.payments, [{
    fromPersonId: 'ben', from: 'ben', toPersonId: 'anna', to: 'anna', amount: 100
  }]);
  assert.equal(JSON.stringify(p), serialized, 'previews must not change source JSON');
});

test('A07: stable position is preserved for same-day equal-order legacy events', () => {
  const p = project([
    itemAdded(),
    transfer('first', { ben: 1 }, date, 25),
    transfer('second', { carla: 1 }, date, 25)
  ]);
  assert.deepEqual(beforeShares(p, 'first'), { anna: 1 });
  assert.deepEqual(beforeShares(p, 'second'), { ben: 1 });
  assert.deepEqual(sharesAt(p), { carla: 1 });
});

test('A07: missing legacy order uses stable relative array position', () => {
  const a = transfer('first', { ben: 1 }); delete a.order;
  const b = transfer('second', { carla: 1 }); delete b.order;
  const p = project([itemAdded(), a, b]);
  // Missing order sorts before explicit positive order on the same date.
  assert.deepEqual(beforeShares(p, 'first'), { anna: 1 });
  assert.deepEqual(beforeShares(p, 'second'), { ben: 1 });
});

test('A07: backdating an existing grouped event updates its pre-event basis', () => {
  const p = project([
    itemAdded(),
    transfer('to-ben', { ben: 1 }, '2026-02-01', 1),
    group('group-c', { carla: 1 }, '2026-03-01', 2),
    transfer('after-group', { anna: 1 }, '2026-04-01', 3)
  ]);
  const plan = date => ({
    effectiveDate: date, financialMode: 'derived',
    changes: [{ itemId: 'sofa', shares: { carla: 1 } }]
  });
  const regular = redistributionPreview(p, plan('2026-03-01'), { beforeEventId: 'group-c', order: 2 });
  assert.deepEqual(regular.base.activeItems[0].shares, { ben: 1 });
  assert.deepEqual(regular.payments.map(row => [row.fromPersonId, row.toPersonId, row.amount]),
    [['carla', 'ben', 100]]);

  const backdated = redistributionPreview(p, plan('2026-01-15'), { beforeEventId: 'group-c', order: 2 });
  assert.deepEqual(backdated.base.activeItems[0].shares, { anna: 1 });
  assert.deepEqual(backdated.payments.map(row => [row.fromPersonId, row.toPersonId, row.amount]),
    [['carla', 'anna', 100]]);

  const movedLater = redistributionPreview(p, plan('2026-05-01'), { beforeEventId: 'group-c', order: 2 });
  assert.deepEqual(movedLater.base.activeItems[0].shares, { anna: 1 });
  assert.deepEqual(movedLater.payments.map(row => [row.fromPersonId, row.toPersonId, row.amount]),
    [['carla', 'anna', 100]]);
  assert.deepEqual(sharesAt(p, '2026-05-01'), { anna: 1 }, 'preview must not edit event');
});

test('A07: group before preview excludes later same-day nested redistribution', () => {
  const p = project([
    itemAdded(),
    group('first', { ben: 1 }, date, 5),
    group('second', { carla: 1 }, date, 6)
  ]);
  const make = (id, shares, order) => redistributionPreview(p, {
    effectiveDate: date, financialMode: 'derived',
    changes: [{ itemId: 'sofa', shares }]
  }, { beforeEventId: id, order });
  assert.deepEqual(make('first', { ben: 1 }, 5).base.activeItems[0].shares, { anna: 1 });
  assert.deepEqual(make('second', { carla: 1 }, 6).base.activeItems[0].shares, { ben: 1 });
  assert.deepEqual(make('second', { carla: 1 }, 6).payments.map(p => p.toPersonId), ['ben']);
});

test('A07: new event order is strictly after imported same-day future order values', () => {
  const extremelyHigh = Date.now() + 500000;
  const p = project([itemAdded(), transfer('future-order', { ben: 1 }, date, extremelyHigh)]);
  const proposed = {
    effectiveDate: date, financialMode: 'derived',
    changes: [{ itemId: 'sofa', shares: { carla: 1 } }]
  };
  const preview = redistributionPreview(p, proposed);
  assert.deepEqual(preview.base.activeItems[0].shares, { ben: 1 });
  const newOrder = nextEventOrder(p, date);
  assert.ok(newOrder > extremelyHigh, 'new event must replay after existing events');
  p.events.push(group('new', { carla: 1 }, date, newOrder));
  assert.deepEqual(sharesAt(p), { carla: 1 });
  assert.deepEqual(beforeShares(p, 'new'), { ben: 1 });
  assert.deepEqual(preview.payments.map(row => [row.fromPersonId, row.toPersonId]),
    [['carla', 'ben']]);
});

test('A07: multiple additions on the same day always receive increasing orders', () => {
  const p = project([itemAdded()]);
  const firstOrder = nextEventOrder(p, date);
  p.events.push(transfer('first', { ben: 1 }, date, firstOrder));
  const secondOrder = nextEventOrder(p, date);
  p.events.push(transfer('second', { carla: 1 }, date, secondOrder));
  assert.ok(secondOrder > firstOrder);
  assert.deepEqual(beforeShares(p, 'second'), { ben: 1 });
  assert.deepEqual(sharesAt(p), { carla: 1 });
});

test('A07: cent-accurate claims replay at the correct same-day moment', () => {
  const p = project([
    itemAdded(), transfer('to-ben', { ben: 1 }, date, 10),
    transfer('to-carla', { carla: 1 }, date, 20)
  ]);
  const claims = deriveClaims(p, date);
  assert.deepEqual(claims.map(c => [c.sourceEventId, c.debtorPersonId, c.creditorPersonId, c.amountCents]), [
    ['to-ben', 'ben', 'anna', 10000],
    ['to-carla', 'carla', 'ben', 10000]
  ]);
  assert.deepEqual(ledgerAt(p, '2026-01-31').claims, []);
  assert.equal(ledgerAt(p, date).claims.length, 2);
  const moved = structuredClone(p);
  moved.events[2].date = '2026-01-15';
  assert.deepEqual(deriveClaims(moved, date).map(c => [c.sourceEventId, c.debtorPersonId, c.creditorPersonId]), [
    ['to-carla', 'carla', 'anna'],
    ['to-ben', 'ben', 'carla']
  ]);
});

test('A07: past time-value follows event effective date, not current date', () => {
  const event = itemAdded();
  event.initialValue = 120;
  event.valuation = { type: 'linear', durationYears: 1, minimumValue: 0 };
  const p = project([event,
    transfer('early', { ben: 1 }, '2026-01-01', 2),
    transfer('later', { carla: 1 }, '2027-02-01', 3)
  ]);
  const before = projectBeforeEvent(p, 'early');
  assert.equal(before.asOfDate, '2026-01-01');
  assert.equal(before.activeItems[0].value, 120);
  assert.equal(projectBeforeEvent(p, 'later').activeItems[0].value, 0);
  assert.equal(deriveClaims(p, '2027-02-02').filter(x => x.sourceEventId === 'later').length, 0);
});
