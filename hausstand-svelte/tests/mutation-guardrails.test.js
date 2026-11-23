import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { mutationProblem } from '../src/lib/mutationValidation.js';
import { createClaimSettlementEvent } from '../src/lib/claimSettlement.js';
import { appState } from '../src/stores/projectStore.js';
import { ledgerAt } from '../src/lib/ledger.js';

const alerts = [];
const cache = new Map();
globalThis.alert = value => alerts.push(String(value));
globalThis.localStorage = {
  getItem: key => cache.get(key) ?? null,
  setItem: (key, value) => cache.set(key, value),
  removeItem: key => cache.delete(key)
};

function fixture() {
  return {
    schemaVersion: 1, currency: 'EUR', community: { name: 'Guardrails' },
    people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }],
    items: [{ id: 'table', name: 'Table' }],
    events: [{ id: 'purchase', type: 'item-added', itemId: 'table', date: '2026-01-01',
      order: 1, initialValue: 100, valuation: { type: 'fixed', minimumValue: 0 },
      shares: { anna: 1, ben: 1 }, financialMode: 'derived', financedByPersonId: 'anna' }],
    drafts: [], lastSavedAt: '2026-01-01T10:00:00.000Z',
    versionHistory: { format: 'portable-v1', entries: [] }
  };
}
const payment = (overrides = {}) => ({
  id: 'payment-1', type: 'claim-settlement-recorded', date: '2026-02-01',
  order: 2, amountCents: 5000, debtorPersonId: 'ben',
  creditorPersonId: 'anna', settlementKind: 'paid', ...overrides
});
const problem = (change, p = fixture()) =>
  mutationProblem(p, { ...p, events: [...p.events, change] })?.key;

test('Q06: rejects zero, negative, fractional and unsafe cent amounts', () => {
  for (const amountCents of [0, -100, 12.5, '123', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(problem(payment({ amountCents })), 'errors.invalidPayment', String(amountCents));
  }
  assert.equal(problem(payment({ amountCents: 1 })), undefined);
});

test('Q06: rejects impossible dates, missing/same/unknown people and malformed entries', () => {
  for (const date of ['', '2026-02-30', '2026-13-01', '01.02.2026', '2026-2-1']) {
    assert.equal(problem(payment({ date })), 'errors.invalidEventDate', date);
  }
  for (const entry of [
    { debtorPersonId: '' }, { creditorPersonId: '' },
    { debtorPersonId: 'anna' }, { creditorPersonId: 'missing' },
    { debtorPersonId: 'missing' }
  ]) {
    assert.ok(['errors.invalidPayment','errors.unknownPaymentPerson'].includes(problem(payment(entry))),
      JSON.stringify(entry));
  }
  assert.equal(problem(payment({ id: '' })), 'errors.missingEventId');
});

test('Q06: no duplicate event IDs even for two rapid submissions', () => {
  const p = fixture(), first = payment();
  assert.equal(mutationProblem(p, { ...p, events: [...p.events, first] }), null);
  const withFirst = { ...p, events: [...p.events, first] };
  assert.equal(problem(first, withFirst), 'errors.duplicateEventId');
  assert.equal(problem(payment({ id: 'purchase' })), 'errors.duplicateEventId');
});

test('Q06: valid future payment and edited payment keep their actual dates', () => {
  const p = fixture();
  const future = payment({ date: '2031-08-17', amountCents: 1248 });
  const added = { ...p, events: [...p.events, future] };
  assert.equal(mutationProblem(p, added), null);
  assert.equal(ledgerAt(added, '2026-02-01').counterclaims.length, 0);
  assert.equal(ledgerAt(added, future.date).counterclaims[0].amountCents, 1248);
  const edited = { ...added, events: [...p.events, { ...future, date: '2026-03-01' }] };
  assert.equal(mutationProblem(added, edited), null);
  assert.equal(ledgerAt(edited, '2026-02-01').counterclaims.length, 0);
  assert.equal(ledgerAt(edited, '2026-03-01').counterclaims[0].amountCents, 1248);
});

test('Q06: edited purchases cannot persist negative or sub-cent values', () => {
  const p = fixture();
  for (const value of [-1, 10.001, NaN, Infinity, '12.5']) {
    const next = { ...p, events: [{ ...p.events[0], initialValue: value }] };
    assert.equal(mutationProblem(p, next)?.key, 'errors.invalidItemValue', String(value));
  }
  assert.equal(mutationProblem(p, { ...p, events: [{ ...p.events[0], initialValue: 12.48 }] }), null);
});

test('Q06: unchanged bad imported entry can be repaired without blocking other edits', () => {
  const p = fixture();
  p.events.push(payment({ id: 'dup' }), payment({ id: 'dup', date: 'not-a-date' }));
  assert.equal(mutationProblem(p, { ...p, people: [...p.people, { id:'clara',name:'Clara' }] }), null);
  assert.equal(mutationProblem(p, { ...p, events: p.events.slice(0,-1) }), null);
  assert.equal(mutationProblem(p, { ...p, events: [...p.events, payment({ id:'dup' })] })?.key,
    'errors.duplicateEventId');
});

test('Q06: rejected changes do not dirty project, mutate events, or enter Undo history', () => {
  alerts.length = 0;
  appState.importProject(fixture());
  const before = JSON.stringify(get(appState).project);
  const history = get(appState).history.undoCount;
  assert.equal(appState.mutateProject(p => p.events.push(payment({ amountCents: -100 }))), false);
  assert.equal(appState.mutateProject(p => p.events.push(payment({ date: '2026-02-31' }))), false);
  assert.equal(appState.mutateProject(p => p.events.push(payment({ id: 'purchase' }))), false);
  assert.equal(appState.mutateProject(() => { throw Error('internal failure'); }), false);
  assert.equal(JSON.stringify(get(appState).project), before);
  assert.equal(get(appState).dirty, false);
  assert.equal(get(appState).history.undoCount, history);
  assert.equal(alerts.length, 4);
});

test('Q06: read-only blocks mutations, while valid changes can be saved exactly once', () => {
  appState.importProject(fixture());
  appState.setReadOnly(true);
  const before = JSON.stringify(get(appState).project);
  assert.equal(appState.mutateProject(p => p.events.push(payment())), false);
  assert.equal(JSON.stringify(get(appState).project), before);
  appState.setReadOnly(false);
  assert.equal(appState.mutateProject(p => p.events.push(payment())), true);
  const after = JSON.stringify(get(appState).project);
  assert.equal(appState.mutateProject(p => p.events.push(payment())), false);
  assert.equal(JSON.stringify(get(appState).project), after);
  assert.equal(get(appState).project.events.filter(e => e.id === 'payment-1').length, 1);
  assert.equal(get(appState).dirty, true);
});

test('Q06: independent event factory maintains safe cent integer and valid date', () => {
  const p = fixture();
  assert.throws(() => createClaimSettlementEvent(p, {
    date: '2026-02-31', amountCents: 1248, debtorPersonId:'ben',
    creditorPersonId:'anna'
  }), TypeError);
});
