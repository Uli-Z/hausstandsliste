import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationCenter } from '../src/lib/notifications.js';

test('notifications stack, expire independently and can be dismissed', () => {
  let clock = 0, seq = 0, seen = [];
  const timers = new Map();
  const center = createNotificationCenter({
    schedule: (fn, delay) => { const id = ++seq; timers.set(id, {fn, at: clock + delay}); return id; },
    cancel: id => timers.delete(id)
  });
  const advance = ms => {
    clock += ms;
    for (const [id, t] of [...timers]) if (t.at <= clock) { timers.delete(id); t.fn(); }
  };
  const unsubscribe = center.subscribe(items => { seen = items; });
  const first = center.notify('Person added', {kind:'success'});
  advance(1200);
  const second = center.notify('Item added', {kind:'success'});
  const error = center.notify('Could not save', {kind:'error'});
  assert.deepEqual(seen.map(n => n.id), [first, second, error]);
  advance(1799);
  assert.deepEqual(seen.map(n => n.id), [first, second, error]);
  advance(1);
  assert.deepEqual(seen.map(n => n.id), [second, error]);
  advance(1199);
  assert.deepEqual(seen.map(n => n.id), [second, error]);
  advance(1);
  assert.deepEqual(seen.map(n => n.id), [error]);
  center.dismiss(error);
  assert.deepEqual(seen, []);
  assert.equal(timers.size, 0);
  unsubscribe();
});

test('source dismissal does not clear unrelated feedback', () => {
  const center = createNotificationCenter();
  let seen;
  const stop = center.subscribe(items => { seen = items; });
  center.notify('Saved', {source:'storage'});
  const id = center.notify('Added', {kind:'success'});
  center.dismissSource('storage');
  assert.deepEqual(seen.map(n => n.id), [id]);
  center.clear();
  assert.deepEqual(seen, []);
  stop();
});

test('ordinary info/warning expire after three seconds; critical mail warnings persist and manual dismissal cancels timers', () => {
  const timers = new Map();
  let next = 0, seen = [];
  const center = createNotificationCenter({
    schedule: (fn, delay) => { const id = ++next; timers.set(id, {fn, delay}); return id; },
    cancel: id => timers.delete(id)
  });
  let stop = center.subscribe(items => { seen = items; });
  const info = center.notify('Mail disabled', {kind:'info', source:'mail'});
  const warning = center.notify('Temporary warning', {kind:'warning'});
  const critical = center.notify('Mail failed', {kind:'warning', source:'mail', duration:0});
  assert.deepEqual([...timers.values()].map(t => t.delay), [3000, 3000]);
  center.dismiss(warning);
  assert.equal(timers.size, 1);
  stop();
  // Subscription changes must neither restart nor cancel the outstanding timer.
  stop = center.subscribe(items => { seen = items; });
  assert.deepEqual(seen.map(n => n.id), [info, critical]);
  [...timers.values()][0].fn();
  assert.deepEqual(seen.map(n => n.id), [critical]);
  assert.equal(timers.size, 0);
  center.clear();
  assert.deepEqual(seen, []);
  stop();
});
