import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createSessionUndo, historyShortcut } from '../src/lib/sessionUndo.js';
import { appState } from '../src/stores/projectStore.js';

const values = new Map();
globalThis.localStorage = {
  setItem: (k, v) => values.set(k, v),
  getItem: k => values.get(k) || null,
  removeItem: k => values.delete(k)
};
globalThis.alert = () => {};
const project = name => ({
  schemaVersion: 1, currency: 'EUR', community: { name },
  people: [], items: [], events: [], drafts: [],
  lastSavedAt: '2026-11-23T08:00:00Z',
  versionHistory: { format: 'portable-v1', entries: [{ id: 'snapshot', data: 'opaque' }] }
});
const rename = name => appState.mutateProject(p => { p.community.name = name; });

test('session history is bounded, discards redo branch, and excludes archived file versions', () => {
  const h = createSessionUndo(3);
  let current = project('0');
  for (let i = 1; i <= 5; i++) {
    const next = { ...current, community: { name: String(i) } };
    assert.equal(h.record(current, next), true);
    current = next;
  }
  assert.deepEqual(h.counts(), { undoCount: 3, redoCount: 0 });
  for (const expected of ['4', '3', '2']) {
    current = h.undo(current);
    assert.equal(current.community.name, expected);
    assert.deepEqual(current.versionHistory, project('0').versionHistory);
  }
  assert.equal(h.undo(current), null);
  assert.equal(h.redo(current).community.name, '3');
  const changed = { ...current, community: { name: 'brand-new' } };
  assert.equal(h.record(current, changed), true);
  assert.equal(h.counts().redoCount, 0);
  assert.equal(h.redo(changed), null);
  assert.deepEqual(h.reset(), { undoCount: 0, redoCount: 0 });
  assert.throws(() => createSessionUndo(0), RangeError);
});

test('history ignores generated metadata and no-op edits', () => {
  const h = createSessionUndo();
  const a = project('A');
  assert.equal(h.record(a, { ...a, lastSavedAt: 'tomorrow', versionHistory: { format: 'portable-v1', entries: [] } }), false);
  assert.deepEqual(h.counts(), { undoCount: 0, redoCount: 0 });
});

test('store Undo/Redo follows all edits and recalculates dirty relative to confirmed save', () => {
  appState.importProject(project('A'));
  assert.deepEqual(get(appState).history, { undoCount: 0, redoCount: 0 });
  assert.equal(rename('B'), true);
  assert.equal(get(appState).dirty, true);
  assert.equal(get(appState).history.undoCount, 1);
  assert.equal(appState.undo(), true);
  assert.equal(get(appState).project.community.name, 'A');
  assert.equal(get(appState).dirty, false);
  assert.equal(appState.redo(), true);
  assert.equal(get(appState).project.community.name, 'B');
  appState.markSaved({ ...get(appState).project, lastSavedAt: '2026-11-23T09:00:00Z' });
  assert.equal(get(appState).dirty, false);
  assert.equal(appState.undo(), true);
  assert.equal(get(appState).dirty, true);
  assert.equal(appState.redo(), true);
  assert.equal(get(appState).dirty, false);
  assert.deepEqual(get(appState).project.versionHistory, project('A').versionHistory);
});

test('draft creation/removal is undoable, but view, dialog and as-of date are not', () => {
  appState.importProject(project('A'));
  const date = get(appState).asOfDate;
  appState.setAsOfDate('2020-01-01');
  appState.setRoute({ page: 'item', id: 'not-found' });
  assert.equal(get(appState).history.undoCount, 0);
  appState.upsertDraft({ id: 'd1', type: 'item', data: { name: 'Sofa' } });
  assert.equal(get(appState).history.undoCount, 1);
  appState.deleteDraft('d1');
  assert.deepEqual(get(appState).project.drafts, []);
  appState.undo();
  assert.equal(get(appState).project.drafts[0].data.name, 'Sofa');
  assert.equal(get(appState).asOfDate, '2020-01-01');
  assert.equal(get(appState).route.page, 'item');
  appState.setDialog({ type: 'itemAdd' });
  assert.equal(appState.undo(), false);
  appState.closeDialog();
  appState.setAsOfDate(date);
  appState.undo();
  assert.deepEqual(get(appState).project.drafts, []);
});

test('readonly mode prevents Undo/Redo; changing project or restoring a saved snapshot resets stacks', () => {
  appState.importProject(project('A'));
  rename('B');
  appState.setReadOnly(true);
  assert.equal(appState.undo(), false);
  assert.equal(get(appState).project.community.name, 'B');
  appState.setReadOnly(false);
  assert.equal(appState.undo(), true);
  appState.importProject(project('C'));
  assert.equal(appState.redo(), false);
  rename('D');
  appState.restoreVersion(project('A'));
  assert.deepEqual(get(appState).history, { undoCount: 0, redoCount: 0 });
  rename('E');
  appState.restoreWorkingCopy({ project: project('F'), savedProject: project('F'), dirty: false });
  assert.equal(get(appState).history.undoCount, 0);
  rename('G');
  appState.newProject('New');
  assert.deepEqual(get(appState).history, { undoCount: 0, redoCount: 0 });
});

test('keyboard shortcuts work in normal pages, preserve native input Undo and ignore modals', () => {
  const ev = (key, opt = {}) => ({ key, ctrlKey: true, target: { tagName: 'DIV', closest: () => null }, ...opt });
  assert.equal(historyShortcut(ev('z')), 'undo');
  assert.equal(historyShortcut(ev('Z', { shiftKey: true })), 'redo');
  assert.equal(historyShortcut(ev('y')), 'redo');
  assert.equal(historyShortcut(ev('z', { ctrlKey: false, metaKey: true })), 'undo');
  assert.equal(historyShortcut(ev('z', { target: { tagName: 'INPUT' } })), null);
  assert.equal(historyShortcut(ev('z', { target: { tagName: 'TEXTAREA' } })), null);
  assert.equal(historyShortcut(ev('z', { target: { tagName: 'DIV', isContentEditable: true } })), null);
  assert.equal(historyShortcut(ev('z', { target: { tagName: 'DIV', closest: () => true } })), null);
  assert.equal(historyShortcut(ev('z', { repeat: true })), null);
  assert.equal(historyShortcut(ev('z', { isComposing: true })), null);
  assert.equal(historyShortcut(ev('z', { defaultPrevented: true })), null);
  assert.equal(historyShortcut(ev('z', { altKey: true })), null);
  assert.equal(historyShortcut(ev('z'), true), null);
});

test('quota failure leaves edits possible, warns visibly and discards stale working copy', () => {
  appState.importProject(project('A'));
  const original = globalThis.localStorage.setItem;
  try {
    globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.equal(rename('B'), true);
    assert.equal(get(appState).project.community.name, 'B');
    assert.equal(get(appState).localCacheWarning, true);
    assert.equal(values.has('hausstand_svelte_v07_working_copy'), false);
    assert.equal(appState.undo(), true);
    assert.equal(get(appState).project.community.name, 'A');
    assert.equal(get(appState).localCacheWarning, true);
  } finally {
    globalThis.localStorage.setItem = original;
  }
});

test('local working copies have no filename identity and protected imports never cache plaintext', () => {
  const key = 'hausstand_svelte_v07_working_copy';
  appState.importProject(project('Local'));
  assert.equal(Object.hasOwn(get(appState), 'fileName'), false);
  assert.equal(Object.hasOwn(JSON.parse(values.get(key)), 'fileName'), false);
  assert.equal(rename('Changed'), true);
  const copy = JSON.parse(values.get(key));
  appState.restoreWorkingCopy(copy);
  assert.equal(get(appState).project.community.name, 'Changed');
  assert.equal(get(appState).dirty, true);
  assert.equal(Object.hasOwn(get(appState), 'fileName'), false);
  appState.importProject(project('Protected'), { secure: true });
  assert.equal(get(appState).secure, true);
  assert.equal(get(appState).readOnly, false);
  assert.equal(values.has(key), false);
  appState.importProject(project('Online'), { secure: true, readOnly: true });
  assert.equal(get(appState).secure, true);
  assert.equal(get(appState).readOnly, true);
  assert.equal(rename('Blocked'), false);
  assert.equal(values.has(key), false);
  appState.newProject('New');
  assert.equal(get(appState).secure, false);
  assert.equal(get(appState).readOnly, false);
  assert.equal(Object.hasOwn(JSON.parse(values.get(key)), 'fileName'), false);
});

test('rejected drafts do not change the project or undo history', () => {
  appState.importProject(project('draft guard'));
  const before = JSON.stringify(get(appState).project);
  assert.equal(appState.upsertDraft({ id:'bad', type:'item', data:{name:'Table',tags:'not an array'} }), false);
  assert.equal(JSON.stringify(get(appState).project),before);
  assert.equal(get(appState).history.undoCount,0);
  assert.equal(appState.upsertDraft({id:'good',type:'item',data:{name:'Table'}}),true);
  assert.equal(get(appState).history.undoCount,1);
  appState.setReadOnly(true);
  assert.equal(appState.upsertDraft({id:'readonly',type:'item',data:{name:'Chair'}}),false);
  assert.equal(get(appState).project.drafts.length,1);
});
