import { itemNumberMutationProblem } from './itemNumbers.js';
import { claimSettlementErrors, validISODate } from './claimSettlement.js';
import { purchaseEventProblem } from './purchaseFinancing.js';
import { validMoney } from './util.js';
import { ownershipHistoryProblems } from './ownershipValidation.js';
import { personDeletionEligibility } from './personDeletion.js';
import { archiveHistoryProblems } from './personArchiveValidation.js';

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
      const successor = !!(after.items || []).find(i=>i.id===event.itemId)?.predecessorItemId;
      if (purchaseEventProblem(event,people,successor)) return { key:'errors.invalidPurchaseContributions' };
    }
  }
  return null;
}

// Shared transaction guard for every frontend (browser, CLI, future adapters).
// No UI, storage or global state; return stable diagnostic keys and parameters.
export function projectMutationProblem(before, after) {
  if (itemNumberMutationProblem(before,after)) return {key:'errors.invalidItemNumbers'};
  if (before?.community?.name !== after?.community?.name &&
      (typeof after?.community?.name !== 'string' || !after.community.name.trim())) {
    return { key: 'household.required' };
  }
  // Check the original references as well as the proposed state: a caller
  // must not bypass the no-cascade rule by deleting the person AND their
  // history in one transaction. An unused person's initial creation event
  // may be removed together with their master record.
  const nextPeople = new Set((after?.people || []).map(person => String(person.id)));
  for (const person of before?.people || []) {
    const id = String(person.id);
    if (nextPeople.has(id)) continue;
    const candidate = { ...after, people: [...(after.people || []), person] };
    const hasCreation = (after.events || []).some(event =>
      event.type === 'person-added' && String(event.personId) === id);
    if (!personDeletionEligibility(before, id).allowed ||
        !personDeletionEligibility(candidate, id).allowed || hasCreation) {
      return { key: 'errors.referencedPersonDeletion', params: { name: person.name || id } };
    }
  }
  const eventProblem = mutationProblem(before, after);
  if (eventProblem) return eventProblem;
  // Check every future ownership transition before evaluating financial or archival consequences.
  const first = ownershipHistoryProblems(after)[0];
  if (first) {
    const name = (after.items || []).find(item => item.id === first.itemId)?.name || first.itemId;
    const person = (after.people || []).find(p=>p.id===first.personId)?.name || first.personId || '—';
    const params = { name, date:first.date, person, eventId:first.sourceEventId, childEventId:first.childEventId || '', before:first.beforeUnits ?? '—', delta:first.deltaUnits ?? '—', reason:first.code };
    return {key:first.code==='OWNERLESS_ITEM'?'errors.ownerless':'errors.shareHistoryConflict',params};
  }
  // Check the complete future history too. Existing invalid records may be
  // explicitly repaired, but no new archival conflicts may be introduced.
  const priorArchiveProblems = new Set(archiveHistoryProblems(before || {}).map(p => p.identity));
  const archiveProblem = archiveHistoryProblems(after).find(p => !priorArchiveProblems.has(p.identity));
  if (archiveProblem) return { key: archiveProblem.key, params: archiveProblem.params };
  return null;
}
