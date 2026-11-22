import { normShares, shareTotal } from './domain.js';
import { byDateOrder } from './util.js';

// Every active item must retain at least one positive ownership unit,
// irrespective of its monetary value or the activity status of its owner.
export const hasOwner = shares => shareTotal(normShares(shares)) > 0;

/**
 * Find transitions that leave an ACTIVE item without an owner.
 * Replay historical events in the same date/order sequence as projector.js.
 * A redistribution uses its parent date/order and processes children in order.
 * No data is changed and no claim or payment is created.
 */
export function unownedActiveTransitions(project) {
  const states = new Map();
  const problems = [];
  const events = (project?.events || [])
    .filter(event => event?.date)
    .sort(byDateOrder);

  function apply(event, parent = null) {
    if (!event) return;
    const itemId = event.itemId;
    if (event.type === 'redistribution-executed') {
      for (const child of event.events || []) apply(child, event);
      return;
    }
    if (!itemId || !['item-added', 'item-ended', 'shares-set'].includes(event.type)) return;
    const state = states.get(itemId) || { status: 'unknown', shares: {} };
    if (event.type === 'item-added') {
      state.status = 'active';
      state.shares = normShares(event.shares);
    } else if (event.type === 'item-ended') {
      state.status = event.statusAfter || 'ended';
    } else if (event.type === 'shares-set') {
      state.shares = normShares(event.shares);
    }
    states.set(itemId, state);
    if ((event.type === 'item-added' || event.type === 'shares-set')
        && state.status === 'active' && !hasOwner(state.shares)) {
      const date = parent?.date || event.date;
      const sourceEventId = parent?.id || event.id || '';
      const childEventId = parent ? (event.id || '') : '';
      problems.push({
        itemId, date, sourceEventId, childEventId,
        key: JSON.stringify([itemId, date, sourceEventId, childEventId])
      });
    }
  }
  for (const event of events) apply(event);
  return problems;
}

// Preserve legacy imports unchanged and permit corrections to old bad data.
// Only NEW invalid historical transitions may block an in-app mutation.
export function newUnownedActiveTransitions(before, after) {
  const previous = new Set(unownedActiveTransitions(before).map(problem => problem.key));
  return unownedActiveTransitions(after).filter(problem => !previous.has(problem.key));
}
