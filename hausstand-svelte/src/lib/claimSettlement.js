import { nextEventOrder, uid } from './util.js';

// Settlement events document real-world information, not an independently
// editable claim or a persistent "paid" flag. Claim amounts remain derived.
export const CLAIM_SETTLEMENT_TYPE = 'claim-settlement-recorded';
export const CLAIM_SETTLEMENT_KINDS = Object.freeze(['paid', 'external', 'waived']);

const nonEmptyId = value => typeof value === 'string' && value.trim().length > 0;
const validISODate = value => {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/**
 * Structural checks only. B02/B03 will resolve the source to a particular
 * derived claim, check the actual outstanding amount and detect orphans.
 * Import remains tolerant: malformed imported events can be displayed with
 * warnings instead of being silently rewritten or discarded.
 */
export function claimSettlementErrors(event) {
  const errors = [];
  if (event?.type !== CLAIM_SETTLEMENT_TYPE) errors.push('Ereignistyp fehlt oder ist ungültig.');
  if (!nonEmptyId(event?.id)) errors.push('Stabile Ereignis-ID fehlt.');
  if (!validISODate(event?.date)) errors.push('Datum muss ein gültiges ISO-Kalenderdatum sein.');
  if (!Number.isSafeInteger(event?.order)) errors.push('Ereignis-Reihenfolge muss eine ganze Zahl sein.');
  if (!Number.isSafeInteger(event?.amountCents) || event.amountCents <= 0) {
    errors.push('Betrag muss eine positive, sichere Integer-Cent-Zahl sein.');
  }
  if (!CLAIM_SETTLEMENT_KINDS.includes(event?.settlementKind)) {
    errors.push('Ausgleichsart muss paid, external oder waived sein.');
  }
  for (const key of ['debtorPersonId', 'creditorPersonId', 'sourceEventId', 'itemId']) {
    if (!nonEmptyId(event?.[key])) errors.push(`${key} fehlt.`);
  }
  if (nonEmptyId(event?.debtorPersonId) && event.debtorPersonId === event.creditorPersonId) {
    errors.push('Schuldner und Gläubiger müssen verschieden sein.');
  }
  if (event?.childEventId != null && !nonEmptyId(event.childEventId)) {
    errors.push('childEventId muss fehlen oder eine gültige ID sein.');
  }
  if (event?.note != null && typeof event.note !== 'string') {
    errors.push('Notiz muss Text sein.');
  }
  return errors;
}

/**
 * Returns a new persistable project.events[] entry. Pass exact claim-origin
 * IDs: sourceEventId, optionally childEventId, itemId and both parties.
 * Does not book, match or apply the settlement to a claim yet (B02/B03).
 */
export function createClaimSettlementEvent(project, {
  date, amountCents, debtorPersonId, creditorPersonId, settlementKind,
  sourceEventId, childEventId = null, itemId, note
} = {}) {
  const event = {
    id: uid('settlement'),
    type: CLAIM_SETTLEMENT_TYPE,
    date,
    order: nextEventOrder(project, date),
    amountCents,
    debtorPersonId,
    creditorPersonId,
    settlementKind,
    sourceEventId,
    childEventId,
    itemId
  };
  if (note != null && note !== '') event.note = note;
  const errors = claimSettlementErrors(event);
  if (errors.length) throw new TypeError(`Ungültiges Ausgleichsereignis: ${errors.join(' ')}`);
  return event;
}
