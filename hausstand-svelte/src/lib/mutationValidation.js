import { claimSettlementErrors, validISODate } from './claimSettlement.js';

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
      const value = event.initialValue;
      const cents = value * 100;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
          !Number.isSafeInteger(Math.round(cents)) ||
          Math.abs(cents - Math.round(cents)) > 1e-7) {
        return { key: 'errors.invalidItemValue' };
      }
    }
  }
  return null;
}
