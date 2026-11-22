import { byDateOrder, nextEventOrder, uid } from './util.js';

// One money journal: ownership events derive claims, actual payments are
// counterclaims in the opposite direction. No payment-to-item/source link.
export const CLAIM_SETTLEMENT_TYPE = 'claim-settlement-recorded';
export const CLAIM_SETTLEMENT_KINDS = Object.freeze(['paid', 'external', 'waived']);
const nonEmptyId = value => typeof value === 'string' && value.trim().length > 0;
const validISODate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/**
 * debtorPersonId is the person who paid / arranged the settlement.
 * creditorPersonId is the person who received it. The resulting financial
 * ledger entry has the OPPOSITE direction, irrespective of existing debts.
 *
 * Legacy sourceEventId/childEventId/itemId metadata remains importable and
 * exportable, but has no matching or netting effect.
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
  for (const key of ['debtorPersonId', 'creditorPersonId']) {
    if (!nonEmptyId(event?.[key])) errors.push(key + ' fehlt.');
  }
  if (nonEmptyId(event?.debtorPersonId) && event.debtorPersonId === event.creditorPersonId) {
    errors.push('Zahlende und empfangende Person müssen verschieden sein.');
  }
  for (const key of ['sourceEventId', 'childEventId', 'itemId']) {
    if (event?.[key] != null && !nonEmptyId(event[key])) errors.push(key + ' muss eine gültige ID sein.');
  }
  if (event?.note != null && typeof event.note !== 'string') errors.push('Notiz muss Text sein.');
  return errors;
}

/**
 * A real payment or manual offset is stored once as a dated event; it stays
 * the exact amount paid if earlier purchase events are corrected or removed.
 * References are optional legacy/context fields and are never required.
 */
export function createClaimSettlementEvent(project, {
  date, amountCents, debtorPersonId, creditorPersonId,
  settlementKind = 'paid', note,
  sourceEventId, childEventId, itemId
} = {}) {
  const event = {
    id: uid('settlement'),
    type: CLAIM_SETTLEMENT_TYPE,
    date,
    order: nextEventOrder(project, date),
    amountCents,
    debtorPersonId, // payer / original debtor
    creditorPersonId, // recipient / original creditor
    settlementKind
  };
  if (note != null && note !== '') event.note = note;
  if (sourceEventId != null) event.sourceEventId = sourceEventId;
  if (childEventId != null) event.childEventId = childEventId;
  if (itemId != null) event.itemId = itemId;
  const errors = claimSettlementErrors(event);
  if (errors.length) throw new TypeError('Ungültiges Ausgleichsereignis: ' + errors.join(' '));
  return event;
}

// The "Mark as paid" shortcut creates the same event as manual payment
// recording, using a (possibly already netted) outstanding pair balance.
export function paymentForBalance(project, balance, date, note = '') {
  if (!balance || !Number.isSafeInteger(balance.amountCents) || balance.amountCents <= 0) {
    throw new TypeError('Es gibt keinen positiven Nettosaldo für die Zahlung.');
  }
  return createClaimSettlementEvent(project, {
    date,
    amountCents: balance.amountCents,
    debtorPersonId: balance.fromPersonId,
    creditorPersonId: balance.toPersonId,
    settlementKind: 'paid',
    note
  });
}

/**
 * Express every recorded payment/adjustment as a COUNTERCLAIM.
 * Ben owes Anna 100, Ben pays Anna 120 -> Anna owes Ben 120 in the
 * bookkeeping, giving a net receivable of 20 for Ben.
 *
 * "external" and "waived" are explicit non-cash local offsets; their kinds
 * must not be displayed as proof of money transfer.
 */
export function deriveSettlementCounterclaims(project, asOfDate) {
  const all = (project?.events || []).filter(event => event?.type === CLAIM_SETTLEMENT_TYPE);
  const counts = new Map();
  for (const event of all) counts.set(event.id, (counts.get(event.id) || 0) + 1);
  const people = new Set((project?.people || []).map(person => person.id));
  const entries = [];
  const warnings = [];
  for (const event of all.filter(event => event?.date && event.date <= asOfDate).sort(byDateOrder)) {
    const errors = claimSettlementErrors(event);
    if (errors.length) {
      warnings.push({ event, code: 'invalid-event', message: errors.join(' ') });
      continue;
    }
    if (counts.get(event.id) !== 1) {
      warnings.push({ event, code: 'duplicate-event', message: 'Doppelte Buchungs-ID.' });
      continue;
    }
    if (!people.has(event.debtorPersonId) || !people.has(event.creditorPersonId)) {
      warnings.push({ event, code: 'unknown-person', message: 'Eine beteiligte Person fehlt.' });
      continue;
    }
    entries.push({
      sourceEventId: event.id,
      childEventId: null,
      itemId: null, // no source allocation: optional event.itemId is descriptive only
      date: event.date,
      order: event.order,
      debtorPersonId: event.creditorPersonId,
      creditorPersonId: event.debtorPersonId,
      amountCents: event.amountCents,
      entryKind: event.settlementKind,
      sourceType: CLAIM_SETTLEMENT_TYPE
    });
  }
  return { entries, warnings };
}
