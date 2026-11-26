import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteUnusedPerson, personDeletionEligibility } from '../src/lib/personDeletion.js';
import { ledgerAt } from '../src/lib/ledger.js';
import { projectAt } from '../src/lib/projector.js';
import { projectMutationProblem } from '../src/lib/mutationValidation.js';

const fixed = { type: 'fixed', minimumValue: 0 };
const person = (id, name = id) => ({ id, name });
const enter = (id, date = '2026-01-01') => ({
  id: 'enter-' + id, type: 'person-added', personId: id, date, order: 1, name: id
});
const makeProject = () => ({
  people: [person('anna', 'Anna'), person('ben', 'Ben')],
  items: [{ id: 'desk', name: 'Schreibtisch' }],
  events: [enter('anna'), enter('ben')],
  drafts: []
});
const assertBlockedWithoutMutation = (project, id = 'anna') => {
  const before = structuredClone(project);
  assert.equal(personDeletionEligibility(project, id).allowed, false);
  assert.equal(deleteUnusedPerson(project, id).allowed, false);
  assert.deepEqual(project, before, 'a rejected deletion must leave all source records untouched');
};

test('A03: unused new person can be removed with only their join event', () => {
  const project = makeProject();
  project.events.push({
    id: 'desk-created', type: 'item-added', date: '2026-01-02', order: 1,
    itemId: 'desk', initialValue: 45, valuation: fixed, shares: { ben: 1 },
    purchaseContributionsCents:{ben:4500}, financialMode: 'derived'
  });
  assert.equal(personDeletionEligibility(project, 'anna').allowed, true);
  const beforeBen = projectAt(project, '2026-03-01').people.find(p => p.id === 'ben').holdings;
  assert.deepEqual(deleteUnusedPerson(project, 'anna'), { allowed: true, reason: '' });
  assert.deepEqual(project.people.map(p => p.id), ['ben']);
  assert.deepEqual(project.events.map(e => e.id), ['enter-ben', 'desk-created']);
  assert.deepEqual(projectAt(project, '2026-03-01').people.find(p => p.id === 'ben').holdings, beforeBen);
});

test('A03: former owner cannot be deleted even when all shares were transferred away', () => {
  const project = makeProject();
  project.events.push({
    id: 'desk-created', type: 'item-added', date: '2026-01-02', order: 1,
    itemId: 'desk', initialValue: 80, valuation: fixed, shares: { anna: 1 },financialMode:'derived',purchaseContributionsCents:{anna:8000}
  });
  project.events.push({
    id: 'transfer', type: 'shares-set', date: '2026-02-01', order: 1,
    itemId: 'desk', shareUnitDeltas: { anna:-1,ben:1 }, financialMode: 'derived'
  });
  assert.equal(projectAt(project, '2026-03-01').people.find(p => p.id === 'anna').holdings.length, 0);
  const beforeClaims = ledgerAt(project, '2026-03-01').claims;
  assertBlockedWithoutMutation(project);
  assert.deepEqual(ledgerAt(project, '2026-03-01').claims, beforeClaims);
});

test('A03: departed original financier with an 80 EUR claim cannot disappear', () => {
  const project = makeProject();
  project.events.push({
    id: 'desk-created', type: 'item-added', date: '2026-01-02', order: 1,
    itemId: 'desk', initialValue: 80, valuation: fixed, shares: { ben: 1 },
    purchaseContributionsCents:{anna:8000}, financialMode: 'derived'
  });
  project.events.push({
    id: 'anna-left', type: 'person-deactivated', personId: 'anna', date: '2026-02-01', order: 1
  });
  assert.equal(projectAt(project, '2026-03-01').people.find(p => p.id === 'anna').holdings.length, 0);
  assert.deepEqual(ledgerAt(project, '2026-03-01').pairwise, [{
    fromPersonId: 'ben', toPersonId: 'anna', amountCents: 8000
  }]);
  assertBlockedWithoutMutation(project);
  assert.deepEqual(ledgerAt(project, '2026-03-01').pairwise, [{
    fromPersonId: 'ben', toPersonId: 'anna', amountCents: 8000
  }]);
});

test('A03: departure or reactivation alone is enough to preserve lifecycle history', () => {
  for (const type of ['person-deactivated', 'person-reactivated']) {
    const project = makeProject();
    project.events.push({ id: 'lifecycle', type, date: '2026-02-01', order: 1, personId: 'anna' });
    assertBlockedWithoutMutation(project);
  }
});

test('A03: nested historical and future shares-set references prohibit deletion', () => {
  for (const date of ['2026-02-01', '2035-02-01']) {
    const project = makeProject();
    project.events.push({
      id: 'redistribution', type: 'redistribution-executed', date, order: 2,
      financialMode: 'derived', events: [
        { id: 'child', type: 'shares-set', itemId: 'desk', shareUnitDeltas: { anna: 1 } }
      ]
    });
    assertBlockedWithoutMutation(project);
  }
});

test('A03: draft shares, financing and redistribution selections prohibit deletion', () => {
  const drafts = [
    { id: 'draft-1', type: 'item', data: { shares: { anna: 1 }, purchaseContributionsCents:{ben:1000} } },
    { id: 'draft-2', type: 'item', data: { shares: { ben: 1 }, purchaseContributionsCents:{anna:1000} } },
    { id: 'draft-3', type: 'redistribution', changes: [{ itemId: 'desk', shares: { anna: 1 } }] },
    { id: 'draft-4', type: 'redistribution', sourcePersonId: 'anna', targetPersonId: 'ben' }
  ];
  for (const draft of drafts) {
    const project = makeProject();
    project.drafts.push(draft);
    assertBlockedWithoutMutation(project);
  }
});

test('A03: person references in other master data or finance extension are protected', () => {
  const item = makeProject();
  item.items[0].addedByPersonId = 'anna';
  assertBlockedWithoutMutation(item);

  const otherPerson = makeProject();
  otherPerson.people[1].responsiblePersonId = 'anna';
  assertBlockedWithoutMutation(otherPerson);

  const futureFormat = makeProject();
  futureFormat.finance = { settlements: [{ creditorPersonId: 'anna', debtorPersonId: 'ben', amountCents: 8000 }] };
  assertBlockedWithoutMutation(futureFormat);
});

test('A03: settlement-like events and unknown event types are protected', () => {
  const project = makeProject();
  project.events.push({
    id: 'settlement', type: 'claim-settlement-recorded', date: '2026-03-01', order: 1,
    creditorPersonId: 'anna', debtorPersonId: 'ben', amountCents: 3000
  });
  assertBlockedWithoutMutation(project);
});

test('A03: nonexistent people cannot be deleted', () => {
  const project = makeProject();
  const before = structuredClone(project);
  assert.equal(deleteUnusedPerson(project, 'missing').allowed, false);
  assert.equal(deleteUnusedPerson(project, null).allowed, false);
  assert.deepEqual(project, before);
});

test('Q27: shared transaction guard rejects removing a referenced person even together with their history', () => {
  const before = makeProject();
  before.events.push({
    id: 'desk-created', type: 'item-added', date: '2026-01-02', order: 1,
    itemId: 'desk', initialValue: 80, valuation: fixed, shares: { ben: 1 },
    purchaseContributionsCents: { anna: 8000 }, financialMode: 'derived'
  });
  const after = structuredClone(before);
  after.people = after.people.filter(p => p.id !== 'anna');
  const expected = { key: 'errors.referencedPersonDeletion', params: { name: 'Anna' } };
  assert.deepEqual(projectMutationProblem(before, after), expected);
  after.events = after.events.filter(e => e.id === 'enter-ben');
  after.items = [];
  assert.deepEqual(projectMutationProblem(before, after), expected);
});

test('Q27: shared transaction guard allows only clean removal of an unused person', () => {
  const before = makeProject();
  const after = structuredClone(before);
  assert.equal(deleteUnusedPerson(after, 'anna').allowed, true);
  assert.equal(projectMutationProblem(before, after), null);
  const dangling = { ...after, events: before.events };
  assert.equal(projectMutationProblem(before, dangling).key, 'errors.referencedPersonDeletion');
  const newReference = { ...after, drafts: [{ id: 'draft', shares: { anna: 1 } }] };
  assert.equal(projectMutationProblem(before, newReference).key, 'errors.referencedPersonDeletion');
});
