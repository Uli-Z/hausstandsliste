import { normShares, shareTotal } from './domain.js';
import { walkEvents } from './projector.js';

// Reuse the one chronological projector, including nested redistribution
// children, rather than independently interpreting ownership events.
export const hasOwner = shares => shareTotal(normShares(shares)) > 0;

export function ownershipHistoryProblems(project) {
  const problems = [];
  const state = walkEvents(project,'9999-12-31',(_state,event,parent) => {
    if (event.type !== 'item-added' || hasOwner(event.shares)) return;
    problems.push({code:'OWNERLESS_ITEM',itemId:event.itemId,date:event.date,
      sourceEventId:parent?.id || event.id,childEventId:parent ? event.id : null});
  });
  return [...problems,...state.shareProblems].map(problem=>({
    ...problem,key:JSON.stringify([problem.itemId,problem.date,problem.sourceEventId,problem.childEventId])
  }));
}

export function unownedActiveTransitions(project) {
  return ownershipHistoryProblems(project).filter(p=>p.code==='OWNERLESS_ITEM');
}
