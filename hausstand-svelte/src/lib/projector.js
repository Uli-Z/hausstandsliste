import { byDateOrder } from './util.js';
import { normShares, shareTotal } from './domain.js';
import { resolveShareEvent, ShareUnitError } from './shareUnits.js';
import { valueAtCents } from './valuation.js';
import { allocateCents } from './centAllocation.js';
import { CLAIM_SETTLEMENT_TYPE, claimSettlementErrors } from './claimSettlement.js';

const ensurePerson = (state, id, name = id) => {
  if (!state.peopleById.has(id)) state.peopleById.set(id, { id, name, active: false, synthetic: true });
  return state.peopleById.get(id);
};
const ensureItem = (state, id, name = id) => {
  if (!state.itemsById.has(id)) state.itemsById.set(id, { id, name, tags: [], note: '', synthetic: true });
  return state.itemsById.get(id);
};
const runtime = (state, id) => {
  if (!state.runtime.has(id)) state.runtime.set(id, { itemId: id, status: 'unknown', date: null, initialValue: 0, valuation: { type: 'fixed', minimumValue: 0 }, shares: {} });
  return state.runtime.get(id);
};

const init = (project, lifecycleEvents = project.events || []) => {
  const entries = new Map();
  for (const event of lifecycleEvents) {
    if (event.type !== 'person-added' || !event.date) continue;
    const previous = entries.get(event.personId);
    if (!previous || event.date < previous) entries.set(event.personId, event.date);
  }
  return ({
  // Keep every identity resolvable, including before entry and after exit.
  // Undated master records have no known boundary; never invent one.
  peopleById: new Map((project.people || []).map(p => [p.id, { ...p, entryDate: entries.get(p.id) || null, entered: !entries.has(p.id), active: !entries.has(p.id) }])),
  itemsById: new Map((project.items || []).map(i => [i.id, { ...i }])),
  runtime: new Map(),
  warnings: [],
  shareProblems: []
  });
};

export const applyEvent = (state, event, beforeApply = null, parent = null) => {
  if (!event) return;
  // Resolve exactly once before notifying consumers (ledger, archive validation).
  // Invalid transitions are reported, never clamped or partially applied.
  if (event.type === 'shares-set') {
    const rt = state.runtime.get(event.itemId);
    try {
      if (rt?.status !== 'active') throw new ShareUnitError('ITEM_NOT_ACTIVE');
      const afterShares = resolveShareEvent(rt.shares,event);
      for (const id of Object.keys(event.shareUnitDeltas)) {
        if (!state.peopleById.has(id)) throw new ShareUnitError('UNKNOWN_PERSON',id);
      }
      if (beforeApply) beforeApply(state,event,parent,afterShares);
      rt.shares = afterShares;
    } catch (error) {
      if (!(error instanceof ShareUnitError)) throw error;
      const problem = {
        code:error.code, personId:error.personId, beforeUnits:error.beforeUnits, deltaUnits:error.deltaUnits,
        itemId:event.itemId, date:event.date, sourceEventId:parent?.id || event.id,
        childEventId:parent ? event.id : null
      };
      state.shareProblems.push(problem);
      state.warnings.push(`${problem.code}: ${problem.itemId} (${problem.date}, ${problem.sourceEventId})`);
    }
    return;
  }
  if (beforeApply) beforeApply(state, event, parent);
  if (event.type === 'person-added') {
    const person = ensurePerson(state, event.personId, event.name);
    // Stammdaten haben Vorrang. Event-Name nur als Fallback verwenden.
    if (!person.name && event.name) person.name = event.name;
    if (!person.entered) {
      person.entered = true;
      person.entryDate = person.entryDate || event.date;
      person.active = !person.inactiveFrom;
    }
  } else if (event.type === 'person-deactivated') {
    const person = ensurePerson(state, event.personId);
    person.active = false;
    person.inactiveFrom = event.date;
    person.inactiveReason = event.reason || '';
  } else if (event.type === 'person-reactivated') {
    const person = ensurePerson(state, event.personId);
    person.active = !!person.entered;
    person.reactivatedAt = event.date;
    person.inactiveFrom = null;
  } else if (event.type === 'item-added') {
    const item = ensureItem(state, event.itemId, event.name);
    if (!item.name && event.name) item.name = event.name;
    const rt = runtime(state, event.itemId);
    rt.status = 'active';
    rt.date = event.date;
    rt.initialValue = Number(event.initialValue) || 0;
    rt.valuation = event.valuation || { type: 'fixed', minimumValue: 0 };
    rt.shares = normShares(event.shares);
  } else if (event.type === 'item-ended') {
    const rt = runtime(state, event.itemId);
    rt.status = event.statusAfter || 'ended';
    rt.endedAt = event.date;
    rt.endReason = event.reason || '';
  } else if (event.type === 'redistribution-executed') {
    for (const child of event.events || []) {
      applyEvent(state, { ...child, date: event.date, order: event.order }, beforeApply, event);
    }
  } else if (event.type === CLAIM_SETTLEMENT_TYPE) {
    // A recorded payment/external handoff never changes ownership. Recognition
    // and structural validation belong here; money netting uses a separate counterclaim.
    for (const problem of claimSettlementErrors(event)) {
      state.warnings.push(`Ungültiger Forderungsausgleich (${event.id || 'ohne ID'}): ${problem}`);
    }
  } else {
    state.warnings.push(`Unbekannter Ereignistyp: ${event.type}`);
  }
};

// Both ownership and financial projections walk the same, ordered history.
export const walkEvents = (project, asOfDate, beforeApply = null, lifecycleEvents = project.events || []) => {
  const state = init(project, lifecycleEvents);
  const events = (project.events || []).filter(e => e?.date && e.date <= asOfDate).sort(byDateOrder);
  for (const event of events) applyEvent(state, event, beforeApply);
  return state;
};

export const projectAt = (project, asOfDate, lifecycleEvents = project.events || []) => {
  const state = walkEvents(project, asOfDate, null, lifecycleEvents);
  const items = [];
  for (const [id, rt] of state.runtime.entries()) {
    const base = state.itemsById.get(id) || { id, name: id, tags: [], note: '' };
    const active = rt.status === 'active';
    const valueCents = active ? valueAtCents(rt.valuation, rt.initialValue, rt.date, asOfDate) : 0;
    const allocated = allocateCents(valueCents, rt.shares);
    const total = shareTotal(rt.shares);
    const shareRows = Object.entries(rt.shares || {}).map(([personId, units]) => {
      const fraction = total > 0 ? units / total : 0;
      const person = state.peopleById.get(personId);
      const cents = allocated[personId] ?? 0;
      return { personId, personName: person?.name || personId, units, fraction, valueCents: cents, value: cents / 100, active: !!person?.active };
    });
    items.push({ ...base, runtime: rt, status: rt.status, valueCents, value: valueCents / 100, shares: rt.shares, shareRows });
  }

  // A fully depreciated item still exists and can still be owned or transferred.
  // Only its monetary value, not its presence in the inventory, is zero.
  const activeItems = items.filter(item => item.status === 'active');
  const archivedItems = items.filter(item => item.status !== 'active');
  const allPeople = [...state.peopleById.values()].map(person => {
    const holdings = activeItems.flatMap(item => item.shareRows.filter(row => row.personId === person.id).map(row => ({ item, ...row })));
    const totalValueCents = holdings.reduce((sum, holding) => sum + holding.valueCents, 0);
    return { ...person, holdings, totalValueCents, totalValue: totalValueCents / 100 };
  // Historical references and explicit detail views still resolve all identities.
  }).filter(person => !person.synthetic || person.active || person.inactiveFrom || person.reactivatedAt);

  const totalValueCents = activeItems.reduce((sum, item) => sum + item.valueCents, 0);
  return {
    asOfDate,
    people: allPeople.filter(person => person.entered || person.active),
    allPeople,
    items,
    activeItems,
    archivedItems,
    allTags: [...new Set((project.items || []).flatMap(item => item.tags || []))].sort((a, b) => a.localeCompare(b, 'de')),
    totalValueCents,
    totalValue: totalValueCents / 100,
    peopleById: state.peopleById,
    itemsById: state.itemsById,
    warnings: state.warnings
  };
};

/**
 * Reconstruct ownership immediately BEFORE an existing event at its effective
 * date/order. Unlike "remove event, then project at end of day", this excludes
 * every later same-day event. Date/order overrides let historical editors show
 * the position where the edited event would actually be replayed.
 *
 * Tied date/order values retain array position, matching stable sort in
 * walkEvents(). The input project and its event history remain untouched.
 */
export const projectBeforeEvent = (project, eventId, date = null, order = null) => {
  const all = project.events || [];
  const index = all.findIndex(event => event.id === eventId);
  if (index < 0) return projectAt(project, date);
  const target = all[index];
  const effectiveDate = date ?? target.date;
  const effectiveOrder = order ?? target.order;
  const position = { date: effectiveDate, order: effectiveOrder };
  const events = all.filter((event, eventIndex) => {
    if (eventIndex === index || !event?.date) return false;
    const relative = byDateOrder(event, position);
    return relative < 0 || (relative === 0 && eventIndex < index);
  });
  return projectAt({ ...project, events }, effectiveDate, all);
};

export const shareDeltasForChange = (baseProjection, change) => {
  const item = baseProjection.items.find(x => x.id === change.itemId);
  if (!item) return [];
  const beforeShares = item.shares || {};
  const afterShares = change.type === 'shares-set' ? resolveShareEvent(beforeShares,change) : normShares(change.shares);
  const beforeCents = allocateCents(item.valueCents, beforeShares);
  const afterCents = allocateCents(item.valueCents, afterShares);
  const ids = [...new Set([...Object.keys(beforeShares), ...Object.keys(afterShares)])];
  return ids.map(personId => {
    const before = beforeCents[personId] ?? 0;
    const after = afterCents[personId] ?? 0;
    const deltaCents = after - before;
    return {
      personId,
      personName: baseProjection.peopleById.get(personId)?.name || personId,
      beforeValue: before / 100,
      afterValue: after / 100,
      deltaCents,
      delta: deltaCents / 100
    };
  }).filter(x => x.deltaCents !== 0);
};

