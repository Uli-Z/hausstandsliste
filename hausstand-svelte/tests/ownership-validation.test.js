import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAt } from '../src/lib/projector.js';
import { deriveClaims } from '../src/lib/ledger.js';
import { buildRemovePersonChanges, soleOwnedItems } from '../src/lib/redistribution.js';
import { hasOwner, unownedActiveTransitions } from '../src/lib/ownershipValidation.js';

const fixed = { type: 'fixed', minimumValue: 0 };
const added = (id, shares, value = 100, order = 1) => ({
  id: 'add-' + id, type: 'item-added', date: '2026-01-01', order, itemId: id,
  initialValue: value, valuation: fixed, shares, financialMode:'derived', purchaseContributionsCents:{[Object.keys(shares)[0] || 'anna']:Math.round(value*100)}
});
const setShares = (id, itemId, shares, date = '2026-02-01', order = 1) => ({
  id, type: 'shares-set', date, order, itemId, shares, financialMode: 'derived'
});
const project = events => ({
  people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }],
  items: [{ id: 'solo', name: 'Sofa' }, { id: 'shared', name: 'Lampe' }],
  events
});

test('A05: removing sole owner is skipped; shared property can be reassigned', () => {
  const p = project([added('solo', { anna: 1 }), added('shared', { anna: 1, ben: 1 }, 20, 2)]);
  const projection = projectAt(p, '2026-11-22');
  assert.deepEqual(soleOwnedItems(projection, 'anna').map(item => item.id), ['solo']);
  const changes = buildRemovePersonChanges(projection, 'anna');
  assert.deepEqual(changes, [{ itemId: 'shared', shares: { ben: 1 } }]);
  assert.deepEqual(p.events[0].shares, { anna: 1 }, 'shortcut cannot mutate source history');
  assert.deepEqual(buildRemovePersonChanges(projection, 'ben'), [{ itemId: 'shared', shares: { anna: 1 } }]);
});

test('A05: an empty direct transfer is invalid, even for zero-value active items', () => {
  const before = project([added('solo', { anna: 1 }, 0)]);
  const after = structuredClone(before);
  after.events.push(setShares('remove-last', 'solo', {}, '2026-03-01'));
  assert.equal(hasOwner({}), false);
  assert.equal(hasOwner({ anna: 0, ben: -1 }), false);
  assert.equal(hasOwner({ anna: 0, ben: 1 }), true);
  assert.deepEqual(unownedActiveTransitions(after).map(p => [p.itemId, p.sourceEventId]),
    [['solo', 'remove-last']]);
  assert.equal(projectAt(before, '2026-03-01').activeItems[0].value, 0);
  assert.deepEqual(deriveClaims(before, '2026-03-01'), []);
});

test('A05: creating or continuing an item with no positive share is rejected', () => {
  const before = project([]);
  const after = project([added('solo', { anna: 0, ben: -2 })]);
  assert.deepEqual(unownedActiveTransitions(after).map(problem => problem.sourceEventId),
    ['add-solo']);
  const okay = project([added('solo', { anna: 2 })]);
  assert.deepEqual(unownedActiveTransitions(okay), []);
});

test('A05: a nested historical redistribution is checked with parent identity', () => {
  const before = project([added('solo', { anna: 1 })]);
  const after = structuredClone(before);
  after.events.push({
    id: 'group', type: 'redistribution-executed', date: '2026-03-01', order: 2,
    financialMode: 'none', events: [
      { id: 'child', type: 'shares-set', itemId: 'solo', shares: { anna: 0 } }
    ]
  });
  const [issue] = unownedActiveTransitions(after);
  assert.equal(issue.itemId, 'solo');
  assert.equal(issue.sourceEventId, 'group');
  assert.equal(issue.childEventId, 'child');
  assert.equal(issue.date, '2026-03-01');
});

test('A05: same-day event order and backdated edits are guarded', () => {
  const before = project([
    added('solo', { anna: 1 }),
    { id: 'end', type: 'item-ended', itemId: 'solo', date: '2026-02-01', order: 2 },
    setShares('correction', 'solo', {}, '2026-02-01', 3)
  ]);
  assert.deepEqual(unownedActiveTransitions(before), []);
  const changed = structuredClone(before);
  changed.events[2].order = 1;
  assert.deepEqual(unownedActiveTransitions(changed).map(problem => problem.sourceEventId),
    ['correction']);
});

test('A05: item-ended is the explicit alternative to deleting the last owner', () => {
  const before = project([added('solo', { anna: 1 })]);
  const after = structuredClone(before);
  after.events.push({
    id: 'end', type: 'item-ended', date: '2026-03-01', order: 1,
    itemId: 'solo', statusAfter: 'ended', reason: 'Ausgesondert'
  });
  assert.deepEqual(unownedActiveTransitions(after), []);
  assert.deepEqual(projectAt(after, '2026-03-02').activeItems, []);
});

test('A05: any invalid ownerless ownership state blocks subsequent edits', () => {
  const before = project([added('solo', {})]);
  const same = structuredClone(before);
  same.items[0].name = 'Sofa';
  assert.equal(unownedActiveTransitions(before).length, 1);
  assert.deepEqual(unownedActiveTransitions(same).map(problem => problem.itemId), ['solo']);
  const repaired = structuredClone(before);
  repaired.events[0].shares = { ben: 1 };
  assert.deepEqual(unownedActiveTransitions(repaired), []);
  const additionalInvalid = structuredClone(before);
  additionalInvalid.events.push(added('shared', {}));
  assert.deepEqual(unownedActiveTransitions(additionalInvalid).map(problem => problem.itemId), ['solo', 'shared']);
});

test('A05: valid transfers do not change claims or the original ownership before effective date', () => {
  const before = project([added('solo', { anna: 1 })]);
  const after = structuredClone(before);
  after.events.push(setShares('transfer', 'solo', { ben: 1 }, '2026-05-01'));
  assert.deepEqual(unownedActiveTransitions(after), []);
  assert.deepEqual(projectAt(after, '2026-04-30').activeItems[0].shares, { anna: 1 });
  assert.deepEqual(projectAt(after, '2026-05-01').activeItems[0].shares, { ben: 1 });
  assert.equal(deriveClaims(after, '2026-05-01')[0].amountCents, 10000);
});
