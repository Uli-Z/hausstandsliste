import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAt } from '../src/lib/projector.js';
import { deriveClaims, ledgerAt } from '../src/lib/ledger.js';
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
        shares: { anna: 1 }, purchaseContributionsCents:{anna:30000}, financialMode: 'derived'
      },
      {
        id: 'lamp-added', type: 'item-added', itemId: 'lamp', date: '2020-01-01', order: 4,
        initialValue: 0, valuation: { type: 'fixed', minimumValue: 0 }, shares: { ben: 1 }, financialMode:'derived', purchaseContributionsCents:{ben:0}
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
    itemId: 'fridge', shareUnitDeltas: { anna: -1, ben: 1 }, financialMode: 'derived'
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

test('A02: departed creditor with zero holdings and an 80 EUR claim stays selectable', () => {
  const project = {
    people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }],
    items: [{ id: 'desk', name: 'Schreibtisch' }],
    events: [
      { id: 'anna-enter', type: 'person-added', personId: 'anna', date: '2026-01-01', order: 1 },
      { id: 'ben-enter', type: 'person-added', personId: 'ben', date: '2026-01-01', order: 2 },
      {
        id: 'desk-buy', type: 'item-added', itemId: 'desk', date: '2026-01-02', order: 1,
        initialValue: 80, valuation: { type: 'fixed', minimumValue: 0 }, shares: { ben: 1 },
        financialMode: 'derived', purchaseContributionsCents:{anna:8000}
      },
      { id: 'anna-exit', type: 'person-deactivated', personId: 'anna', date: '2026-02-01', order: 1, reason: 'Auszug' }
    ]
  };

  const projection = projectAt(project, '2026-03-01');
  const anna = projection.people.find(person => person.id === 'anna');
  assert.ok(anna, 'the departed creditor must be in the people directory');
  assert.equal(anna.active, false);
  assert.equal(anna.inactiveFrom, '2026-02-01');
  assert.equal(anna.inactiveReason, 'Auszug');
  assert.deepEqual(anna.holdings, []);
  assert.equal(anna.totalValue, 0);
  const ledger = ledgerAt(project, '2026-03-01');
  assert.equal(ledger.balances.get('anna'), 8000);
  assert.deepEqual(ledger.pairwise, [{ fromPersonId: 'ben', toPersonId: 'anna', amountCents: 8000 }]);
});

test('A02: departed people without holdings or any claims remain in directory', () => {
  const project = {
    people: [{ id: 'former', name: 'Ehemalige' }],
    items: [],
    events: [
      { id: 'join', type: 'person-added', personId: 'former', date: '2026-01-01', order: 1 },
      { id: 'leave', type: 'person-deactivated', personId: 'former', date: '2026-02-01', order: 1, reason: 'Auszug' }
    ]
  };
  const p = projectAt(project, '2026-03-01');
  assert.equal(p.people.length, 1);
  assert.equal(p.people[0].name, 'Ehemalige');
  assert.equal(p.people[0].totalValue, 0);
  assert.deepEqual(p.people[0].holdings, []);
});

test('A02: people are active before creation and reactivate at historical dates', () => {
  const project = {
    people: [{ id: 'future', name: 'Zukunft' }, { id: 'never', name: 'Noch nie beigetreten' }],
    items: [],
    events: [
      { id: 'enter', type: 'person-added', personId: 'future', date: '2027-06-01', order: 1 },
      { id: 'exit', type: 'person-deactivated', personId: 'future', date: '2027-08-01', order: 1 },
      { id: 'reenter', type: 'person-reactivated', personId: 'future', date: '2027-09-01', order: 1 }
    ]
  };
  assert.deepEqual(projectAt(project, '2027-05-31').people.map(p => [p.id,p.active]), [['future',true],['never',true]]);
  assert.equal(projectAt(project, '2027-06-01').people.find(p => p.id === 'future').active, true);
  assert.equal(projectAt(project, '2027-08-01').people.find(p => p.id === 'future').active, false);
  assert.equal(projectAt(project, '2027-09-01').people.find(p => p.id === 'future').active, true);
  assert.equal(projectAt(project, '2027-09-01').people.find(p => p.id === 'never').active, true);
});
