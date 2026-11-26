import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { appState } from '../src/stores/projectStore.js';
import { todayISO } from '../src/lib/util.js';
import { validCalendarDate, openDatePicker, dismissDatePicker, selectAsOfDate, returnToToday, syncCalendarDay } from '../src/lib/timeTravel.js';

// The project store writes an ordinary browser working copy; Node has no DOM.
const localValues = new Map();
globalThis.localStorage = {
  setItem: (key, value) => localValues.set(key, value),
  getItem: key => localValues.get(key) ?? null,
  removeItem: key => localValues.delete(key)
};

const base = { asOfDate: '2026-11-23', datePickerOpen: false, timeTravelActive: false, dirty: true };
test('only valid calendar dates can be selected', () => {
  for (const x of ['', 'tomorrow', '2026-02-30', '2026-2-03', '2025-02-29', '2026-12-01T00:00:00']) {
    assert.equal(validCalendarDate(x), false, x);
    assert.equal(selectAsOfDate(base, x), base);
  }
  assert.equal(validCalendarDate('2024-02-29'), true);
});
test('normal today advances overnight while selected past/future dates remain fixed', () => {
  const opened = openDatePicker(base);
  assert.equal(opened.datePickerOpen, true);
  assert.equal(syncCalendarDay(opened, '2026-11-24').asOfDate, '2026-11-24');
  assert.deepEqual(dismissDatePicker(opened), base);
  for (const date of ['2026-11-20', '2026-12-06']) {
    const selected = selectAsOfDate(base, date);
    assert.equal(selected.timeTravelActive, true);
    assert.equal(syncCalendarDay(selected, '2026-12-06'), selected);
    assert.equal(dismissDatePicker(selected), selected, 'closed date menu stays closed after programmatic selection');
    const selectedFromOpenMenu = selectAsOfDate(openDatePicker(base), date);
    assert.equal(selectedFromOpenMenu.datePickerOpen, true);
    assert.deepEqual(dismissDatePicker(selectedFromOpenMenu), { ...selectedFromOpenMenu, datePickerOpen: false });
    assert.deepEqual(returnToToday(selected, '2026-12-06'), { ...base, asOfDate: '2026-12-06' });
  }
  assert.equal(syncCalendarDay(base, 'invalid'), base);
});
test('project changes reset date selector; viewing another day is not a data edit', () => {
  appState.newProject('Date QA');
  const current = get(appState);
  assert.equal(current.asOfDate, todayISO());
  assert.equal(current.timeTravelActive, false);
  const dirty = current.dirty;
  appState.openDatePicker();
  appState.syncToday('2032-03-10');
  assert.equal(get(appState).asOfDate, '2032-03-10');
  appState.setAsOfDate('2024-05-21');
  appState.syncToday('2032-03-11');
  assert.equal(get(appState).asOfDate, '2024-05-21');
  assert.equal(get(appState).dirty, dirty);
  appState.exitTimeTravel();
  assert.equal(get(appState).asOfDate, todayISO());
  assert.equal(get(appState).datePickerOpen, false);
  appState.setAsOfDate('2024-04-05');
  appState.newProject('Another');
  assert.equal(get(appState).asOfDate, todayISO());
  assert.equal(get(appState).timeTravelActive, false);
});
test('no global arrow date shortcut; editing preserves the original event date', () => {
  const app = readFileSync(new URL('../ui-v3/App.svelte', import.meta.url), 'utf8');
  const edit = readFileSync(new URL('../ui-v3/EventEditDialog.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /e\.key\s*===\s*'Arrow(Left|Right)'/);
  assert.match(app, /appState\.openDatePicker\(\)/);
  assert.match(app, /class="time-travel-popover"/);
  assert.match(app, /class:header-in-time-travel=/);
  assert.match(app, /class="time-travel-selected-text"/);
  assert.doesNotMatch(app, /class="date-toolbar"/);
  assert.match(app, /appState\.exitTimeTravel\(\)/);
  assert.match(edit, /edited\s*=\s*editableEventCopy\(project,event\)/);
  assert.match(edit, /value=\{edited\.date\} on:change=\{changeDate\}/);
});
