import { walkEvents, projectAt } from './projector.js';
import { ledgerAt } from './ledger.js';
import { allocateCents } from './centAllocation.js';
import { valueAtCents } from './valuation.js';
import { itemDisplayName } from './itemNames.js';
import { recordedContributions, contributionProblem } from './purchaseFinancing.js';

// Ownership bridge is independent of the money ledger. Value changes are
// measured on the OLD allocation immediately before each dated transition.
export function personalReport(project, personId, asOfDate, context = {}) {
  const projection = context.projection ?? projectAt(project, asOfDate);
  const ledger = context.ledger ?? ledgerAt(project, asOfDate);
  const person = projection.allPeople.find(p => p.id === personId);
  if (!person) return null;
  const items = new Map();
  const events = [];
  let incomplete = !!(projection.warnings.length || ledger.warnings.length);
  const itemFor = id => {
    if (!items.has(id)) {
      const item = projection.items.find(i => i.id === id);
      items.set(id, { id, name: itemDisplayName(item) || id, acquired: 0, depreciation: 0,
        appreciation: 0, relinquished: 0, ended: 0, giftIn: 0, giftOut: 0, remaining: 0 });
    }
    return items.get(id);
  };
  const amount = (rt, date, shares = rt.shares) =>
    allocateCents(valueAtCents(rt.valuation, rt.initialValue, rt.date, date), shares)[personId] || 0;
  const record = (row, date, kind, cents) => {
    if (!cents) return;
    row[kind] += cents;
    events.push({ date, item: row.name, kind, cents });
  };
  const marked = new Map();
  const mark = (row, date, value) => {
    const previous = marked.get(row.id) || 0;
    if (previous > value) record(row, date, 'depreciation', previous - value);
    if (previous < value) record(row, date, 'appreciation', value - previous);
    marked.set(row.id, value);
  };
  walkEvents(project, asOfDate, (state, event, parent, resolvedShares) => {
    const mode = event.financialMode ?? parent?.financialMode;
    if (event.type === 'item-added') {
      const shares = event.shares || {};
      const value = amount({ valuation: event.valuation, initialValue: event.initialValue, date: event.date, shares }, event.date);
      const contribution = recordedContributions(event);
      if (mode === 'derived' && contributionProblem(Math.round(event.initialValue * 100), contribution, new Set(state.peopleById.keys()))) incomplete = true;
      if (value || shares[personId] || contribution?.[personId]) {
        const row = itemFor(event.itemId);
        // Successor/neutral additions are not cash purchases.
        record(row, event.date, mode === 'derived' ? 'acquired' : 'giftIn', value);
        marked.set(row.id, value);
      }
      if (mode === 'derived' && contribution?.[personId]) {
        events.push({ date: event.date, item: itemFor(event.itemId).name, kind: 'funded', cents: contribution[personId] });
      }
    } else if (event.type === 'shares-set' || event.type === 'item-ended') {
      const rt = state.runtime.get(event.itemId);
      if (rt?.status !== 'active') return;
      if (!rt.shares[personId] && !resolvedShares?.[personId] && !items.has(event.itemId)) return;
      const row = itemFor(event.itemId);
      const before = amount(rt, event.date);
      mark(row, event.date, before);
      if (event.type === 'item-ended') {
        record(row, event.date, 'ended', before);
        marked.set(row.id, 0);
      } else {
        const after = amount(rt, event.date, resolvedShares);
        if (after > before) record(row, event.date, mode === 'derived' ? 'acquired' : 'giftIn', after - before);
        if (after < before) record(row, event.date, mode === 'derived' ? 'relinquished' : 'giftOut', before - after);
        marked.set(row.id, after);
      }
    }
  });
  for (const holding of person.holdings) {
    const row = itemFor(holding.item.id);
    mark(row, asOfDate, holding.valueCents);
    row.remaining = holding.valueCents;
  }
  const totals = { acquired: 0, depreciation: 0, appreciation: 0, relinquished: 0, ended: 0, giftIn: 0, giftOut: 0, remaining: 0 };
  for (const row of items.values()) {
    for (const key of Object.keys(totals)) totals[key] += row[key];
    if (row.acquired + row.giftIn + row.appreciation - row.depreciation - row.relinquished - row.giftOut - row.ended !== row.remaining) incomplete = true;
  }
  if (totals.remaining !== person.totalValueCents) incomplete = true;
  const d = ledger.details.get(personId) || {};
  const finance = { funded: d.fundedCents || 0, initial: d.initialSharesCents || 0, taken: d.sharesTakenCents || 0,
    given: d.sharesGivenCents || 0, paid: 0, received: 0, externalPlus: 0, externalMinus: 0, waivedPlus: 0, waivedMinus: 0 };
  for (const entry of ledger.counterclaims) {
    const plus = entry.creditorPersonId === personId;
    if (!plus && entry.debtorPersonId !== personId) continue;
    const kind = entry.entryKind === 'paid' ? (plus ? 'paid' : 'received') : entry.entryKind + (plus ? 'Plus' : 'Minus');
    finance[kind] += entry.amountCents;
    events.push({ date: entry.date, item: '', kind, cents: entry.amountCents });
  }
  const balance = ledger.balances.get(personId) || 0;
  if (finance.funded - finance.initial - finance.taken + finance.given + finance.paid - finance.received
      + finance.externalPlus - finance.externalMinus + finance.waivedPlus - finance.waivedMinus !== balance) incomplete = true;
  let receivables = 0, liabilities = 0;
  for (const pair of ledger.pairwise) {
    if (pair.toPersonId === personId) receivables += pair.amountCents;
    if (pair.fromPersonId === personId) liabilities += pair.amountCents;
  }
  return { name: person.name, asOfDate, active: person.active, exitDate: person.inactiveFrom || null,
    totals, finance, balance, receivables, liabilities, incomplete,
    items: [...items.values()], events: events.sort((a,b) => a.date.localeCompare(b.date)) };
}
