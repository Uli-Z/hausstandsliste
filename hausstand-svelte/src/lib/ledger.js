import { normShares } from './domain.js';
import { walkEvents } from './projector.js';
import { valueAt } from './valuation.js';

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

function claimsFromDeltas(deltas, meta) {
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
    } else if (event.type === 'item-added' && event.financedByPersonId) {
      // Ownership distribution alone does not identify the payer.
      const valueCents = Math.round((Number(event.initialValue) || 0) * 100);
      if (!Number.isSafeInteger(valueCents) || valueCents <= 0) return;
      const ownership = allocateCents(valueCents, event.shares);
      const payerId = event.financedByPersonId;
      for (const [debtorPersonId, amountCents] of Object.entries(ownership).sort(([a], [b]) => a.localeCompare(b))) {
        if (debtorPersonId !== payerId && amountCents > 0) {
          claims.push({ ...meta, debtorPersonId, creditorPersonId: payerId, amountCents });
        }
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
  return {
    claims,
    pairwise: pairwiseBalances(claims),
    simplified: simplifiedTransfers(claims),
    balances: personBalances(claims)
  };
}
