import { byDateOrder, clone } from './util.js';
import { normShares, shareTotal } from './domain.js';
import { valueAt } from './valuation.js';

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

const init = project => ({
  peopleById: new Map((project.people || []).map(p => [p.id, { ...p, active: false }])),
  itemsById: new Map((project.items || []).map(i => [i.id, { ...i }])),
  runtime: new Map(),
  warnings: []
});

export const applyEvent = (state, event) => {
  if (!event) return;
  if (event.type === 'person-added') {
    const person = ensurePerson(state, event.personId, event.name);
    // Stammdaten haben Vorrang. Event-Name nur als Fallback verwenden.
    if (!person.name && event.name) person.name = event.name;
    person.active = true;
    person.activeFrom = event.date;
    person.inactiveFrom = null;
  } else if (event.type === 'person-deactivated') {
    const person = ensurePerson(state, event.personId);
    person.active = false;
    person.inactiveFrom = event.date;
    person.inactiveReason = event.reason || '';
  } else if (event.type === 'person-reactivated') {
    const person = ensurePerson(state, event.personId);
    person.active = true;
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
  } else if (event.type === 'shares-set') {
    runtime(state, event.itemId).shares = normShares(event.shares);
  } else if (event.type === 'redistribution-executed') {
    for (const child of event.events || []) {
      applyEvent(state, { ...child, date: event.date, order: event.order });
    }
  } else {
    state.warnings.push(`Unbekannter Ereignistyp: ${event.type}`);
  }
};

export const projectAt = (project, asOfDate) => {
  const state = init(project);
  const events = (project.events || []).filter(e => e?.date && e.date <= asOfDate).sort(byDateOrder);
  for (const event of events) applyEvent(state, event);

  const items = [];
  for (const [id, rt] of state.runtime.entries()) {
    const base = state.itemsById.get(id) || { id, name: id, tags: [], note: '' };
    const active = rt.status === 'active';
    const currentValue = active ? valueAt(rt.valuation, rt.initialValue, rt.date, asOfDate) : 0;
    const total = shareTotal(rt.shares);
    const shareRows = Object.entries(rt.shares || {}).map(([personId, units]) => {
      const fraction = total > 0 ? units / total : 0;
      const person = state.peopleById.get(personId);
      return { personId, personName: person?.name || personId, units, fraction, value: currentValue * fraction, active: !!person?.active };
    });
    items.push({ ...base, runtime: rt, status: rt.status, value: currentValue, shares: rt.shares, shareRows });
  }

  const activeItems = items.filter(item => item.status === 'active' && item.value > 0.0001);
  const archivedItems = items.filter(item => item.status !== 'active');
  const people = [...state.peopleById.values()].map(person => {
    const holdings = activeItems.flatMap(item => item.shareRows.filter(row => row.personId === person.id).map(row => ({ item, ...row })));
    const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
    return { ...person, holdings, totalValue };
  }).filter(person => person.active || person.totalValue > 0.0001);

  return {
    asOfDate,
    people,
    items,
    activeItems,
    archivedItems,
    allTags: [...new Set((project.items || []).flatMap(item => item.tags || []))].sort((a, b) => a.localeCompare(b, 'de')),
    totalValue: activeItems.reduce((sum, item) => sum + item.value, 0),
    peopleById: state.peopleById,
    itemsById: state.itemsById,
    warnings: state.warnings
  };
};

export const projectBeforeEvent = (project, eventId, date) => {
  const copy = clone(project);
  copy.events = (copy.events || []).filter(event => event.id !== eventId);
  return projectAt(copy, date);
};

export const shareDeltasForChange = (baseProjection, change) => {
  const item = baseProjection.items.find(x => x.id === change.itemId);
  if (!item) return [];
  const beforeShares = item.shares || {};
  const afterShares = normShares(change.shares);
  const beforeTotal = shareTotal(beforeShares);
  const afterTotal = shareTotal(afterShares);
  const ids = [...new Set([...Object.keys(beforeShares), ...Object.keys(afterShares)])];
  return ids.map(personId => {
    const beforeFraction = beforeTotal > 0 ? (beforeShares[personId] || 0) / beforeTotal : 0;
    const afterFraction = afterTotal > 0 ? (afterShares[personId] || 0) / afterTotal : 0;
    return {
      personId,
      personName: baseProjection.peopleById.get(personId)?.name || personId,
      beforeValue: item.value * beforeFraction,
      afterValue: item.value * afterFraction,
      delta: item.value * (afterFraction - beforeFraction)
    };
  }).filter(x => Math.abs(x.delta) > 0.005);
};

