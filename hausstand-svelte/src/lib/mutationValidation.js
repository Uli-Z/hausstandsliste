import { claimSettlementErrors, validISODate } from './claimSettlement.js';
import { contributionProblem } from './purchaseFinancing.js';
import { validMoney } from './util.js';
import { unownedActiveTransitions } from './ownershipValidation.js';

// Validate new/edited events before a mutation reaches the session history,
// browser working copy or portable file. Existing invalid imported rows can
// still be repaired: unchanged rows are not retroactively rejected.
export function mutationProblem(before, after) {
  const previous = Array.isArray(before?.events) ? before.events : [];
  const events = Array.isArray(after?.events) ? after.events : [];
  const counts = list => {
    const result = new Map();
    for (const event of list) {
      const id = event?.id;
      if (typeof id === 'string') result.set(id, (result.get(id) || 0) + 1);
    }
    return result;
  };
  const previousCounts = counts(previous), nextCounts = counts(events);
  for (const event of events) {
    if (typeof event?.id !== 'string' || !event.id.trim()) {
      return { key: 'errors.missingEventId' };
    }
    if (nextCounts.get(event.id) > 1 && nextCounts.get(event.id) > (previousCounts.get(event.id) || 0)) {
      return { key: 'errors.duplicateEventId' };
    }
  }

  const previousById = new Map(previous.map(event => [event?.id, event]));
  const people = new Set((after?.people || []).map(person => person.id));
  for (const event of events) {
    const original = previousById.get(event.id);
    if (original && JSON.stringify(original) === JSON.stringify(event)) continue;
    if (!validISODate(event.date)) return { key: 'errors.invalidEventDate' };

    if (event.type === 'claim-settlement-recorded') {
      if (claimSettlementErrors(event).length) return { key: 'errors.invalidPayment' };
      if (!people.has(event.debtorPersonId) || !people.has(event.creditorPersonId)) {
        return { key: 'errors.unknownPaymentPerson' };
      }
    }

    if (event.type === 'item-added') {
      if (!validMoney(event.initialValue)) {
        return { key: 'errors.invalidItemValue' };
      }
      if (Object.hasOwn(event,'purchaseContributionsCents')) {
        if (event.financedByPersonId || event.financialMode !== 'derived' ||
            contributionProblem(Math.round(event.initialValue*100), event.purchaseContributionsCents, people))
          return { key:'errors.invalidPurchaseContributions' };
      } else if (original && (Object.hasOwn(original,'purchaseContributionsCents') ||
          (original.initialValue !== event.initialValue && !(after.items || []).find(i=>i.id===event.itemId)?.predecessorItemId))) {
        return { key:'errors.invalidPurchaseContributions' };
      }
    }
  }
  return null;
}

// Shared transaction guard for every frontend (browser, CLI, future adapters).
// No UI, storage or global state; return stable diagnostic keys and parameters.
export function projectMutationProblem(before, after) {
  const eventProblem = mutationProblem(before, after);
  if (eventProblem) return eventProblem;
  const first = unownedActiveTransitions(after)[0];
  if (first) {
    const name = (after.items || []).find(item => item.id === first.itemId)?.name || first.itemId;
    return { key: 'errors.ownerless', params: { name, date: first.date } };
  }
  return null;
}
