import { validISODate, claimSettlementErrors, CLAIM_SETTLEMENT_TYPE } from './claimSettlement.js';
import { resolveShareEvent, shareUnitDeltas, applyShareUnitDeltas } from './shareUnits.js';
import { projectBeforeEvent } from './projector.js';
import { clone, nextEventOrder, validMoney } from './util.js';
import { purchaseEventProblem } from './purchaseFinancing.js';
import { checkedShares, checkedValuation } from './itemMutations.js';

const fail = code => { throw new Error(code); };
const text = value => typeof value === 'string';
const modes = ['none','derived'];
// The identities, references and types of historical events are immutable
// through a correction. The whitelist is shared by browser and CLI.
export const editableEventFields = Object.freeze({
  'person-added':['date','name'],
  'person-deactivated':['date','reason'],
  'person-reactivated':['date','reason'],
  'item-added':['date','name','initialValue','valuation','shares','purchaseContributionsCents'],
  'item-ended':['date','statusAfter','reason'],
  'shares-set':['date','shares','financialMode','note'],
  'redistribution-executed':['date','title','financialMode','events'],
  [CLAIM_SETTLEMENT_TYPE]:['date','amountCents','debtorPersonId','creditorPersonId','settlementKind','note']
});
function indexOf(project,id) {
  const indices=project.events.flatMap((event,i)=>event.id===id?[i]:[]);
  if (!indices.length) fail('EVENT_NOT_FOUND');
  if (indices.length!==1) fail('AMBIGUOUS_EVENT_ID');
  return indices[0];
}
export function editEvent(project,eventId,changes) {
  const i=indexOf(project,eventId), original=project.events[i];
  const allowed=Object.hasOwn(editableEventFields,original.type)?editableEventFields[original.type]:null;
  if (!allowed || !changes || typeof changes!=='object' || Array.isArray(changes) ||
      Object.keys(changes).some(k=>!allowed.includes(k))) fail('INVALID_EVENT_PATCH');
  const event={...clone(original),...clone(changes)};
  if (!validISODate(event.date)) fail('INVALID_DATE');
  for (const key of ['name','reason','note','title']) {
    if (event[key]!=null && !text(event[key])) fail('INVALID_EVENT_TEXT');
  }
  if (event.type===CLAIM_SETTLEMENT_TYPE) {
    if (event.date!==original.date) event.order=nextEventOrder(project,event.date);
    if (claimSettlementErrors(event).length) fail('INVALID_PAYMENT');
  } else if (event.type==='item-added' || event.type==='shares-set' || event.type==='redistribution-executed') {
    const before=projectBeforeEvent(project,eventId,event.date,event.order);
    if (event.type==='item-added') {
      if (!validMoney(event.initialValue)) fail('INVALID_ITEM_VALUE');
      event.valuation=checkedValuation(event.valuation);
      event.shares=checkedShares(before,event.shares,original.shares);
      const successor = !!project.items.find(i=>i.id===event.itemId)?.predecessorItemId;
      const problem = purchaseEventProblem(event,new Set(project.people.map(p=>p.id)),successor);
      if (problem) fail(problem);
      if (!successor && event.initialValue !== original.initialValue && !Object.hasOwn(changes,'purchaseContributionsCents'))
        fail('CONTRIBUTION_SUM_MISMATCH');
    } else {
      if (!modes.includes(event.financialMode??'none')) fail('INVALID_FINANCIAL_MODE');
      if (event.type==='shares-set') {
        const item=before.activeItems.find(i=>i.id===event.itemId);
        if (!item) fail('ITEM_NOT_ACTIVE');
        if (Object.hasOwn(changes,'shares')) {
          event.shareUnitDeltas=shareUnitDeltas(item.shares,checkedShares(before,event.shares,item.shares));
          delete event.shares;
        }
        // A metadata/date-only edit preserves the actual historical units.
        checkedShares(before,resolveShareEvent(item.shares,event),item.shares);
      } else {
        if (!Array.isArray(event.events)) fail('INVALID_REDISTRIBUTION');
        const seen=new Set();
        event.events=event.events.map(child=>{
          const prior=(original.events||[]).find(e=>e.id===child?.id);
          if (!prior || seen.has(prior.id) || prior.type!=='shares-set' ||
              child.type!==prior.type || child.itemId!==prior.itemId) fail('INVALID_REDISTRIBUTION_CHILD');
          seen.add(prior.id);
          const item=before.activeItems.find(i=>i.id===prior.itemId);
          if (!item) fail('ITEM_NOT_ACTIVE');
          const next=clone(prior);
          if (Object.hasOwn(child,'shares'))
            next.shareUnitDeltas=shareUnitDeltas(item.shares,checkedShares(before,child.shares,item.shares));
          checkedShares(before,resolveShareEvent(item.shares,next),item.shares);
          return next;
        });
      }
    }
  } else if (event.type==='item-ended' && !['ended','taken-private','disposed','succeeded'].includes(event.statusAfter??'ended')) {
    fail('INVALID_ITEM_END');
  }
  project.events[i]=event;
  return event;
}
// Convert persisted unit deltas to editable target allocations only in a
// transient editor model. No target allocation is written to an event.
export function editableEventCopy(project,event) {
  const copy=clone(event);
  const before=projectBeforeEvent(project,event.id,event.date,event.order);
  const asTarget=child=>{
    const item=before.activeItems.find(i=>i.id===child.itemId);
    if (!item) fail('ITEM_NOT_ACTIVE');
    return {...child,shares:resolveShareEvent(item.shares,child)};
  };
  if (event.type==='shares-set') return asTarget(copy);
  if (event.type==='redistribution-executed') copy.events=copy.events.map(asTarget);
  return copy;
}

// Rebase an editor's allocations when its date changes. Preserve the units
// represented by current form inputs (including unsaved user edits).
export function redateEditableEvent(project,edited,newDate) {
  if (!validISODate(newDate)) fail('INVALID_DATE');
  if (!['shares-set','redistribution-executed'].includes(edited.type))
    return {...edited,date:newDate};
  const before=projectBeforeEvent(project,edited.id,edited.date,edited.order);
  const after=projectBeforeEvent(project,edited.id,newDate,edited.order);
  const move=child=>{
    const oldItem=before.activeItems.find(i=>i.id===child.itemId);
    const newItem=after.activeItems.find(i=>i.id===child.itemId);
    if (!oldItem || !newItem) fail('ITEM_NOT_ACTIVE');
    const delta=shareUnitDeltas(oldItem.shares,child.shares);
    return {...child,shares:applyShareUnitDeltas(newItem.shares,delta)};
  };
  if (edited.type==='shares-set') return {...move(edited),date:newDate};
  return {...edited,date:newDate,events:edited.events.map(move)};
}

/** The UI works on a full local event copy; submit only supported changes. */
export function replaceEditableEvent(project,edited) {
  const original=project.events[indexOf(project,edited.id)];
  if (original.type!==edited.type) fail('INVALID_EVENT_PATCH');
  const fields=Object.hasOwn(editableEventFields,original.type)?editableEventFields[original.type]:null;
  if (!fields) fail('INVALID_EVENT_PATCH');
  const changes=Object.fromEntries(fields.filter(k=>Object.hasOwn(edited,k)).map(k=>[k,edited[k]]));
  return editEvent(project,edited.id,changes);
}
export function removeEvent(project,eventId) {
  const i=indexOf(project,eventId);
  const event=project.events[i];
  if (!Object.hasOwn(editableEventFields,event.type)) fail('UNSUPPORTED_EVENT_TYPE');
  project.events.splice(i,1);
  return event;
}
