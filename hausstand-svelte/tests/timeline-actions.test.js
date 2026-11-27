import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { iconForTimelineEvent, interactionForTimelineEvent } from '../src/lib/timelineActions.js';

const timeline = readFileSync(fileURLToPath(new URL('../ui-v3/Timeline.svelte', import.meta.url)), 'utf8');
const i18n = readFileSync(fileURLToPath(new URL('../src/lib/i18n.js', import.meta.url)), 'utf8');

test('each supported saved event has a recognizable icon and routes to its existing editor', () => {
  const expected = {
    'item-added': 'box',
    'item-ended': 'archive',
    'shares-set': 'arrows',
    'redistribution-executed': 'arrows',
    'claim-settlement-recorded': 'wallet',
    'person-added': 'person-add',
    'person-deactivated': 'people',
    'person-reactivated': 'person-add'
  };
  for (const [type, icon] of Object.entries(expected)) {
    assert.equal(iconForTimelineEvent(type), icon);
    assert.equal(interactionForTimelineEvent(type, false), 'edit');
  }
});

test('read-only states and unknown events never open a mutation dialog', () => {
  for (const type of ['item-added', 'shares-set', 'claim-settlement-recorded', 'redistribution-executed', 'unrecognized']) {
    assert.equal(interactionForTimelineEvent(type, true), 'details');
  }
  assert.equal(interactionForTimelineEvent('unrecognized', false), 'details');
  assert.equal(iconForTimelineEvent('unrecognized'), 'clock');
});

test('both time-travel partitions use accessible whole-row actions without redundant edit buttons', () => {
  assert.equal((timeline.match(/class="event-open-overlay"/g) || []).length, 1);
  assert.equal((timeline.match(/on:click=\{\(\) => activateEvent\(event\)\}/g) || []).length, 1);
  assert.equal((timeline.match(/aria-expanded=\{interactionForTimelineEvent/g) || []).length, 1);
  assert.equal((timeline.match(/class="event-icon"/g) || []).length, 1);
  assert.doesNotMatch(timeline, /class="event-actions"|class="small ghost edit-button"/);
  assert.match(timeline, /type: event\.type === 'claim-settlement-recorded' \? 'settlementEdit'/);
  assert.match(timeline, /eventId: event\.id/);
  assert.match(timeline, /\.event-open-overlay:focus-visible/);
  assert.match(timeline, /\.event-summary \.entity-link/);
  assert.match(timeline, /\{#each rows as row \(row.key\)\}/);
  assert.match(timeline, /\.\.\.visibleFuture\.map\(group =>/);
  assert.match(timeline, /\.\.\.visiblePast\.map\(group =>/);
  assert.match(timeline, /key:'cutoff'/);
});

test('readonly details are present on both sides of the cutoff and strings are localized', () => {
  assert.equal((timeline.match(/class="event-readonly-details"/g) || []).length, 1);
  assert.match(timeline, /history = grouped \? groupedHistoryAt\(events,asOfDate\) : splitHistoryAt\(events, asOfDate\)/);
  for (const key of ['timeline.editEvent', 'timeline.viewDetails', 'timeline.viewOnly']) {
    assert.equal(i18n.split('"' + key + '"').length - 1, 2, key + ' should exist in EN and DE');
  }
});
