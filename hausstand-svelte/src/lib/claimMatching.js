import { CLAIM_SETTLEMENT_TYPE, claimSettlementErrors, createClaimSettlementEvent } from './claimSettlement.js';
import { deriveClaims } from './ledger.js';
import { byDateOrder } from './util.js';

// This is a stable REFERENCE to a derived claim, not a second persistent claim
// identifier. Amount and date deliberately do not participate: both may
// change when a historical source event is edited.
export function claimReferenceFields(record) {
  return {
    sourceEventId: record?.sourceEventId,
    childEventId: record?.childEventId ?? null,
    itemId: record?.itemId,
    debtorPersonId: record?.debtorPersonId,
    creditorPersonId: record?.creditorPersonId
  };
}

export function claimReferenceKey(record) {
  const ref = claimReferenceFields(record);
  // JSON array encoding is unambiguous even for IDs with punctuation.
  return JSON.stringify([
    ref.sourceEventId, ref.childEventId, ref.itemId,
    ref.debtorPersonId, ref.creditorPersonId
  ]);
}

const issue = (event, code, message, details = null) => ({
  event, code, message, ...(details ? { details } : {})
});

/**
 * Match recorded settlements with EXACTLY one recalculated claim at an as-of
 * date. A partial payment and an external record can refer to the same claim;
 * B03 will calculate their totals and remaining balances.
 *
 * Never infer a match from a person-pair balance, a similar amount or an item
 * name. Source/child/item/debtor/creditor must all agree.
 *
 * Broken links, duplicate source IDs and changed payer/ownership references
 * are reported explicitly rather than reassigned to a different claim.
 */
export function matchClaimSettlements(project, asOfDate) {
  const claims = deriveClaims(project, asOfDate);
  const sourcesById = new Map();
  const allEvents = project?.events || [];

  for (const event of allEvents) {
    if (!event?.id || event.type === CLAIM_SETTLEMENT_TYPE) continue;
    if (!sourcesById.has(event.id)) sourcesById.set(event.id, []);
    sourcesById.get(event.id).push(event);
  }

  const sortedEvents = allEvents.filter(event => event?.date && event.date <= asOfDate)
    .sort(byDateOrder);
  const eventPositions = new Map(sortedEvents.map((event, index) => [event, index]));
  const settlementIdCounts = new Map();
  for (const event of allEvents) {
    if (event?.type !== CLAIM_SETTLEMENT_TYPE || !event.id) continue;
    settlementIdCounts.set(event.id, (settlementIdCounts.get(event.id) || 0) + 1);
  }

  const claimsByKey = new Map();
  for (const claim of claims) {
    const key = claimReferenceKey(claim);
    if (!claimsByKey.has(key)) claimsByKey.set(key, []);
    claimsByKey.get(key).push(claim);
  }

  const matched = [];
  const unmatched = [];
  for (const event of sortedEvents) {
    if (event.type !== CLAIM_SETTLEMENT_TYPE) continue;

    const errors = claimSettlementErrors(event);
    if (errors.length) {
      unmatched.push(issue(event, 'invalid-event', 'Ungültige Ausgleichsbuchung.', errors));
      continue;
    }
    if (settlementIdCounts.get(event.id) !== 1) {
      unmatched.push(issue(event, 'duplicate-settlement-id', 'Ausgleichs-ID ist nicht eindeutig.'));
      continue;
    }

    const sources = sourcesById.get(event.sourceEventId) || [];
    if (sources.length === 0) {
      unmatched.push(issue(event, 'missing-source', 'Das ursprüngliche Forderungsereignis fehlt.'));
      continue;
    }
    if (sources.length !== 1) {
      unmatched.push(issue(event, 'ambiguous-source', 'Die Forderungsquelle besitzt keine eindeutige Ereignis-ID.'));
      continue;
    }
    const sourcePosition = eventPositions.get(sources[0]);
    const settlementPosition = eventPositions.get(event);
    if (sourcePosition === undefined || sourcePosition >= settlementPosition) {
      unmatched.push(issue(event, 'source-after-settlement',
        'Die Forderungsquelle liegt zeitlich nicht vor der Ausgleichsbuchung.'));
      continue;
    }

    const key = claimReferenceKey(event);
    const candidates = claimsByKey.get(key) || [];
    if (candidates.length === 0) {
      unmatched.push(issue(event, 'claim-not-found',
        'Keine Forderungsposition mit dieser Quelle, diesem Gegenstand und diesen Parteien vorhanden.'));
      continue;
    }
    if (candidates.length !== 1) {
      unmatched.push(issue(event, 'ambiguous-claim',
        'Mehrere Forderungspositionen teilen dieselbe Referenz.'));
      continue;
    }

    matched.push({ event, claim: candidates[0], claimKey: key });
  }

  return { claims, matched, unmatched };
}

/**
 * Preferred future UI API. It copies the origin of the selected derived
 * claim, checks that it is still present and chronologically eligible, and
 * returns an event to append via appState.mutateProject().
 *
 * It does NOT apply, store or net the event. Amount-limit checks and actual
 * balance calculation belong to B03/C06.
 */
export function createClaimSettlementForClaim(project, claim, options = {}) {
  const reference = claimReferenceFields(claim);
  const event = createClaimSettlementEvent(project, { ...options, ...reference });
  const previewProject = { ...project, events: [...(project.events || []), event] };
  const matching = matchClaimSettlements(previewProject, event.date);
  if (!matching.matched.some(row => row.event === event)) {
    const error = matching.unmatched.find(row => row.event === event);
    throw new TypeError(error?.message || 'Die ausgewählte Forderung kann nicht zugeordnet werden.');
  }
  return event;
}
