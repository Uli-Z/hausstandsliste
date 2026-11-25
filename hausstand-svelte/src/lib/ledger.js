import { normShares } from './domain.js';
import { walkEvents } from './projector.js';
import { valueAt } from './valuation.js';
import { recordedContributions, contributionProblem } from './purchaseFinancing.js';
import { deriveSettlementCounterclaims } from './claimSettlement.js';

// Monetary calculations use integer cents. Largest-remainder allocation preserves
// the total even for uneven shares (e.g. 10.00 EUR split in thirds).
export function allocateCents(amountCents, shares) {
  const entries = Object.entries(normShares(shares))
    .filter(([, units]) => Number.isFinite(units))
    .sort(([a], [b]) => a.localeCompare(b));
  const total = entries.reduce((sum, [, units]) => sum + units, 0);
  if (total <= 0 || !Number.isSafeInteger(amountCents) || amountCents < 0) return {};
  const rows = entries.map(([personId, units]) => {
    const exact = amountCents * units / total;
    return { personId, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = amountCents - rows.reduce((sum, row) => sum + row.cents, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.personId.localeCompare(b.personId))) {
    if (remaining-- <= 0) break;
    row.cents++;
  }
  return Object.fromEntries(rows.map(row => [row.personId, row.cents]));
}

export function claimsFromDeltas(deltas, meta) {
  const debtors = [...deltas.entries()].filter(([, cents]) => cents > 0)
    .map(([personId, cents]) => ({ personId, cents })).sort((a, b) => a.personId.localeCompare(b.personId));
  const creditors = [...deltas.entries()].filter(([, cents]) => cents < 0)
    .map(([personId, cents]) => ({ personId, cents: -cents })).sort((a, b) => a.personId.localeCompare(b.personId));
  const result = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amountCents = Math.min(debtors[i].cents, creditors[j].cents);
    if (amountCents > 0) {
      result.push({
        ...meta,
        debtorPersonId: debtors[i].personId,
        creditorPersonId: creditors[j].personId,
        amountCents
      });
    }
    debtors[i].cents -= amountCents;
    creditors[j].cents -= amountCents;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return result;
}

// Preview and historical replay share exactly the same cent allocation.
export function purchaseClaims(amountCents, shares, contributions, meta = {}) {
  if (contributionProblem(amountCents, contributions, new Set(Object.keys(contributions || {})))) return [];
  const ownership = allocateCents(amountCents, shares);
  if (!Object.keys(ownership).length) return [];
  const deltas = new Map([...new Set([...Object.keys(ownership), ...Object.keys(contributions)])]
    .map(id => [id, (ownership[id] || 0) - (contributions[id] || 0)]));
  return claimsFromDeltas(deltas, meta);
}

// Returns ephemeral claims. No claims, settlement flags or cached balances are
// written to the project JSON. Editing an event automatically recalculates them.
export function deriveClaims(project, asOfDate) {
  const claims = [];
  walkEvents(project, asOfDate, (state, event, parent) => {
    const financialMode = event.financialMode ?? parent?.financialMode;
    if (financialMode !== 'derived') return;
    const sourceEventId = parent?.id || event.id;
    const childEventId = parent ? event.id : null;
    const meta = { sourceEventId, childEventId, itemId: event.itemId, date: event.date };
    if (event.type === 'shares-set') {
      const item = state.runtime.get(event.itemId);
      if (!item || item.status !== 'active') return;
      const beforeShares = normShares(item.shares);
      const afterShares = normShares(event.shares);
      if (!Object.keys(beforeShares).length || !Object.keys(afterShares).length) return;
      const valueCents = Math.round(valueAt(item.valuation, item.initialValue, item.date, event.date) * 100);
      if (!Number.isSafeInteger(valueCents) || valueCents <= 0) return;
      const before = allocateCents(valueCents, beforeShares);
      const after = allocateCents(valueCents, afterShares);
      const deltas = new Map();
      for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const delta = (after[id] || 0) - (before[id] || 0);
        if (delta) deltas.set(id, delta);
      }
      claims.push(...claimsFromDeltas(deltas, meta));
    } else if (event.type === 'item-added') {
      const contributions = recordedContributions(event);
      if (contributions && !contributionProblem(Math.round(event.initialValue * 100), contributions, new Set(state.peopleById.keys()))) {
        claims.push(...purchaseClaims(Math.round(event.initialValue * 100), event.shares, contributions, meta));
      }
    }
  });
  return claims;
}

// Bilateral netting preserves each original creditor/debtor pair.
export function pairwiseBalances(claims) {
  const pairs = new Map();
  for (const claim of claims) {
    const a = claim.debtorPersonId;
    const b = claim.creditorPersonId;
    if (!a || !b || a === b || claim.amountCents <= 0) continue;
    const [first, second] = [a, b].sort();
    const key = JSON.stringify([first, second]);
    pairs.set(key, (pairs.get(key) || 0) + (a === first ? claim.amountCents : -claim.amountCents));
  }
  return [...pairs.entries()].filter(([, balance]) => balance !== 0).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, balance]) => {
      const [first, second] = JSON.parse(key);
      return {
        fromPersonId: balance > 0 ? first : second,
        toPersonId: balance > 0 ? second : first,
        amountCents: Math.abs(balance)
      };
    });
}

export function personBalances(claims) {
  const balances = new Map();
  for (const claim of claims) {
    balances.set(claim.debtorPersonId, (balances.get(claim.debtorPersonId) || 0) - claim.amountCents);
    balances.set(claim.creditorPersonId, (balances.get(claim.creditorPersonId) || 0) + claim.amountCents);
  }
  return balances;
}

/**
 * Explain a person's communal net position without persisting another ledger.
 * Gross initial financing includes the financier's OWN share; earlier claims
 * omit that self-owned part because no person can owe themselves money.
 * Transfer claims are shown as acquired/relinquished shares, not new cash.
 * All amounts are integer cents and must reconcile with personBalances(entries).
 */
export function personBalanceDetails(project, asOfDate, claims, counterclaims) {
  const details = new Map((project.people || []).map(person => [person.id, {
    fundedCents: 0, initialSharesCents: 0,
    sharesGivenCents: 0, sharesTakenCents: 0,
    paidCents: 0, receivedPaymentsCents: 0,
    adjustmentsPlusCents: 0, adjustmentsMinusCents: 0
  }]));
  const rowFor = id => {
    if (!details.has(id)) details.set(id, {
      fundedCents: 0, initialSharesCents: 0,
      sharesGivenCents: 0, sharesTakenCents: 0,
      paidCents: 0, receivedPaymentsCents: 0,
      adjustmentsPlusCents: 0, adjustmentsMinusCents: 0
    });
    return details.get(id);
  };
  const sourceTypes = new Map((project.events || []).map(event => [event.id, event.type]));
  for (const claim of claims) {
    const purchase = sourceTypes.get(claim.sourceEventId) === 'item-added';
    if (!purchase) {
      rowFor(claim.creditorPersonId).sharesGivenCents += claim.amountCents;
      rowFor(claim.debtorPersonId).sharesTakenCents += claim.amountCents;
    }
  }
  // Record full gross financing and ownership, including self-owned portions.
  for (const event of project.events || []) {
    if (event.type !== 'item-added' || !event.date || event.date > asOfDate || event.financialMode !== 'derived') continue;
    const contributions = recordedContributions(event);
    const valueCents = Math.round(event.initialValue * 100);
    if (!contributions || contributionProblem(valueCents, contributions, new Set((project.people || []).map(p => p.id)))) continue;
    for (const [id, cents] of Object.entries(contributions)) rowFor(id).fundedCents += cents;
    for (const [id, cents] of Object.entries(allocateCents(valueCents, event.shares))) rowFor(id).initialSharesCents += cents;
  }
  for (const entry of counterclaims) {
    const payer = rowFor(entry.creditorPersonId);
    const recipient = rowFor(entry.debtorPersonId);
    if (entry.entryKind === 'paid') {
      payer.paidCents += entry.amountCents;
      recipient.receivedPaymentsCents += entry.amountCents;
    } else {
      payer.adjustmentsPlusCents += entry.amountCents;
      recipient.adjustmentsMinusCents += entry.amountCents;
    }
  }
  for (const row of details.values()) {
    row.balanceCents = row.fundedCents + row.sharesGivenCents +
      row.paidCents + row.adjustmentsPlusCents -
      row.initialSharesCents - row.sharesTakenCents -
      row.receivedPaymentsCents - row.adjustmentsMinusCents;
  }
  return details;
}

// Optional group-level simplification, not a legally binding change of creditor.
export function simplifiedTransfers(claims) {
  const balances = personBalances(claims);
  const debtors = [...balances].filter(([, cents]) => cents < 0)
    .map(([personId, cents]) => ({ personId, cents: -cents })).sort((a, b) => a.personId.localeCompare(b.personId));
  const creditors = [...balances].filter(([, cents]) => cents > 0)
    .map(([personId, cents]) => ({ personId, cents })).sort((a, b) => a.personId.localeCompare(b.personId));
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amountCents = Math.min(debtors[i].cents, creditors[j].cents);
    if (amountCents > 0) transfers.push({
      fromPersonId: debtors[i].personId, toPersonId: creditors[j].personId, amountCents
    });
    debtors[i].cents -= amountCents;
    creditors[j].cents -= amountCents;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return transfers;
}

export function ledgerAt(project, asOfDate) {
  const claims = deriveClaims(project, asOfDate);
  const { entries: counterclaims, warnings } = deriveSettlementCounterclaims(project, asOfDate);
  // One financial ledger: every money event has a debtor, a creditor, and an
  // immutable amount. A payment is an entry in the inverse direction.
  // No amount is capped or assigned to an individual purchase claim.
  const entries = [...claims, ...counterclaims];
  return {
    claims, // Derived purchase/share claims (gross, for the audit trail).
    counterclaims, // Independently recorded reverse entries, unchanged by edits.
    entries,
    warnings,
    pairwise: pairwiseBalances(entries),
    simplified: simplifiedTransfers(entries),
    balances: personBalances(entries),
    details: personBalanceDetails(project, asOfDate, claims, counterclaims)
  };
}
