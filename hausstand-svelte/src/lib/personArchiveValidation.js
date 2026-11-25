import { walkEvents } from './projector.js';
import { ledgerAt } from './ledger.js';
import { byDateOrder } from './util.js';
import { CLAIM_SETTLEMENT_TYPE } from './claimSettlement.js';

// A person can be archived only at an exact chronological position with no
// active ownership units and no open communal balance. Use the same projector
// and cent ledger as every frontend; no saved balance or duplicate arithmetic.
export function archiveHistoryProblems(project) {
  const events = (project.events || []).filter(e => e?.date).sort(byDateOrder);
  if (!events.some(e => ['person-deactivated','person-reactivated'].includes(e.type))) return [];
  const positions = new Map(events.map((event, index) => [event, index]));
  const names = new Map((project.people || []).map(p => [p.id,p.name]));
  const problems = [];
  const add = (key, personId, event, parent = null, extra = {}) => {
    const source = parent || event;
    problems.push({ key, params: { name: names.get(personId) || personId, date: source.date,
      eventId: source.id, ...extra }, identity: JSON.stringify([key, personId, source.id, parent ? event.id : null, source.date]) });
  };
  walkEvents(project, '9999-12-31', (state, event, parent) => {
    const archived = id => !!state.peopleById.get(id)?.inactiveFrom;
    const id = event.personId;
    if (event.type === 'person-deactivated') {
      if (!names.has(id) || archived(id) || !state.peopleById.get(id)?.active) {
        add('errors.archiveStatus', id, event, parent);
        return;
      }
      const held = [...state.runtime.values()].filter(item =>
        item.status === 'active' && Number(item.shares?.[id]) > 0);
      if (held.length) {
        const item = held[0];
        add('errors.archiveHoldings', id, event, parent, {
          item: state.itemsById.get(item.itemId)?.name || item.itemId
        });
      }
      const index = positions.get(event);
      // Status events are top-level; include only preceding events, even on
      // the same day. Later payments cannot retroactively clear this balance.
      if (index !== undefined) {
        const balance = ledgerAt({ ...project, events: events.slice(0,index) }, event.date).balances.get(id) || 0;
        if (balance !== 0) add('errors.archiveBalance', id, event, parent, { cents: balance });
      }
      return;
    }
    if (event.type === 'person-reactivated') {
      if (!names.has(id) || !archived(id)) add('errors.archiveStatus', id, event, parent);
      return;
    }
    const involved = new Set();
    if (event.type === 'item-added' || event.type === 'shares-set') {
      for (const [personId, units] of Object.entries(event.shares || {}))
        if (Number(units) > 0) involved.add(personId);
    }
    if (event.type === 'item-added') {
      for (const [personId, cents] of Object.entries(event.purchaseContributionsCents || {}))
        if (cents > 0) involved.add(personId);
    }
    if (event.type === CLAIM_SETTLEMENT_TYPE) {
      involved.add(event.debtorPersonId);
      involved.add(event.creditorPersonId);
    }
    for (const personId of involved)
      if (archived(personId)) add('errors.archivedPersonInvolvement', personId, event, parent);
  });
  return problems;
}
