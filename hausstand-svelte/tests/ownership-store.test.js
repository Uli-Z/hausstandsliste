import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { appState } from '../src/stores/projectStore.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key)
};
import { notifications } from '../src/lib/notifications.js';
const errors = () => get(notifications).filter(n=>n.kind==='error').map(n=>n.message);

function fixture(shares = { anna: 1 }) {
  return {
    people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }],
    items: [{ id: 'desk', name: 'Schreibtisch' }],
    events: [{
      id: 'added', type: 'item-added', itemId: 'desk',
      date: '2026-01-01', order: 1,
      initialValue: 100, valuation: { type: 'fixed', minimumValue: 0 },
      shares, financialMode:'derived', purchaseContributionsCents:{anna:10000}
    }]
  };
}

test('A05 store: rejected ownerless mutation leaves data and unsaved flag untouched', () => {
  notifications.clear();
  appState.importProject(fixture());
  const original = JSON.stringify(get(appState).project.events);
  const saved = appState.mutateProject(p => {
    p.events.push({
      id: 'remove', type: 'shares-set', itemId: 'desk',
      date: '2026-02-01', order: 2, shareUnitDeltas: { anna: -1 }
    });
  });
  assert.equal(saved, false);
  assert.equal(JSON.stringify(get(appState).project.events), original);
  assert.equal(get(appState).dirty, false);
  assert.match(errors().at(-1), /keine Eigentümer|no owner/i);
});

test('A05 store: valid transfer is saved and marked dirty', () => {
  notifications.clear();
  appState.importProject(fixture());
  const saved = appState.mutateProject(p => {
    p.events.push({
      id: 'transfer', type: 'shares-set', itemId: 'desk',
      date: '2026-02-01', order: 2, shareUnitDeltas: { anna: -1, ben: 1 }, financialMode: 'none'
    });
  });
  assert.equal(saved, true);
  assert.equal(get(appState).dirty, true);
  assert.equal(get(appState).project.events.at(-1).shareUnitDeltas.ben, 1);
  assert.equal(errors().length, 0);
});

test('A05 store: invalid ownerless project can be repaired', () => {
  appState.importProject(fixture({}));
  assert.deepEqual(get(appState).project.events[0].shares, {});
  const saved = appState.mutateProject(p => { p.events[0].shares = { anna: 1 }; });
  assert.equal(saved, true);
  assert.deepEqual(get(appState).project.events[0].shares, { anna: 1 });
});
