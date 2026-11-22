import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAt } from '../src/lib/projector.js';
import { deriveClaims } from '../src/lib/ledger.js';
import { buildRedistributionItemRows, buildTransferChanges } from '../src/lib/redistribution.js';

function sampleProject() {
  return {
    people: [
      { id: 'anna', name: 'Anna' },
      { id: 'ben', name: 'Ben' }
    ],
    items: [
      { id: 'fridge', name: 'Kühlschrank' },
      { id: 'lamp', name: 'Lampe' }
    ],
    events: [
      { id: 'person-anna', type: 'person-added', personId: 'anna', date: '2020-01-01', order: 1 },
      { id: 'person-ben', type: 'person-added', personId: 'ben', date: '2020-01-01', order: 2 },
      {
        id: 'fridge-added', type: 'item-added', itemId: 'fridge', date: '2020-01-01', order: 3,
        initialValue: 300, valuation: { type: 'linear', durationYears: 1, minimumValue: 0 },
        shares: { anna: 1 }, financedByPersonId: 'anna', financialMode: 'derived'
      },
      {
        id: 'lamp-added', type: 'item-added', itemId: 'lamp', date: '2020-01-01', order: 4,
        initialValue: 0, valuation: { type: 'fixed', minimumValue: 0 }, shares: { ben: 1 }
      }
    ]
  };
}

test('A01: depreciated and originally zero-value items remain in active inventory', () => {
  const projection = projectAt(sampleProject(), '2026-11-22');

  assert.deepEqual(projection.activeItems.map(item => item.id), ['fridge', 'lamp']);
  assert.deepEqual(projection.activeItems.map(item => item.value), [0, 0]);
  assert.equal(projection.totalValue, 0);
  assert.equal(projection.archivedItems.length, 0);

  const anna = projection.people.find(person => person.id === 'anna');
  const ben = projection.people.find(person => person.id === 'ben');
  assert.deepEqual(anna.holdings.map(holding => holding.item.id), ['fridge']);
  assert.deepEqual(ben.holdings.map(holding => holding.item.id), ['lamp']);
  assert.equal(anna.holdings[0].value, 0);
  assert.equal(anna.totalValue, 0);
});

test('A01: zero-value item remains available for redistribution without creating debt', () => {
  const project = sampleProject();
  const projection = projectAt(project, '2026-11-22');
  const changes = buildTransferChanges(projection, 'anna', 'ben');

  assert.deepEqual(changes, [{ itemId: 'fridge', shares: { ben: 1 } }]);
  const rows = buildRedistributionItemRows(projection, changes);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.itemId === 'fridge').changed, true);
  assert.equal(rows.find(row => row.itemId === 'fridge').itemValue, 0);

  project.events.push({
    id: 'fridge-transfer', type: 'shares-set', date: '2026-11-22', order: 5,
    itemId: 'fridge', shares: { ben: 1 }, financialMode: 'derived'
  });
  assert.deepEqual(deriveClaims(project, '2026-11-22'), []);
  const afterTransfer = projectAt(project, '2026-11-22');
  assert.deepEqual(afterTransfer.activeItems.find(item => item.id === 'fridge').shares, { ben: 1 });
  assert.equal(afterTransfer.people.find(person => person.id === 'ben').holdings.length, 2);
});

test('A01: only ending an item moves a zero-value item from active to archive', () => {
  const project = sampleProject();
  project.events.push({
    id: 'fridge-ended', type: 'item-ended', date: '2026-11-23', order: 5,
    itemId: 'fridge', statusAfter: 'ended', reason: 'Entsorgt'
  });

  assert.equal(projectAt(project, '2026-11-22').activeItems.length, 2);
  const afterEnd = projectAt(project, '2026-11-23');
  assert.deepEqual(afterEnd.activeItems.map(item => item.id), ['lamp']);
  assert.deepEqual(afterEnd.archivedItems.map(item => item.id), ['fridge']);
  assert.deepEqual(afterEnd.people.find(person => person.id === 'anna').holdings, []);
});
