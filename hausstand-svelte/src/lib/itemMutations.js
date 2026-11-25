import { uid } from './util.js';
import { normShares } from './domain.js';
import { projectAt } from './projector.js';
import { validISODate } from './claimSettlement.js';
import { createEvent } from './personMutations.js';

const reject = code => { throw new Error(code); };
const text = value => typeof value === 'string';
export const validMoney = value => typeof value === 'number' && Number.isFinite(value) &&
  value >= 0 && Number.isSafeInteger(Math.round(value*100)) && Math.abs(value*100-Math.round(value*100)) <= 1e-7;
const validMode = mode => ['derived','none'].includes(mode);
const at = (project,date) => {
  if (!validISODate(date)) reject('INVALID_DATE');
  return projectAt(project,date);
};
function activeItem(view,id) {
  const item = view.activeItems.find(item=>item.id===id);
  if (!item) reject('ITEM_NOT_ACTIVE');
  return item;
}
// Existing inactive owners may retain or adjust their shares. New owners must
// be active at the event date, exactly as in the shared browser share editor.
export function checkedShares(view,shares,previous={}) {
  if (!shares || typeof shares !== 'object' || Array.isArray(shares) ||
      Object.entries(shares).some(([id,units])=>typeof units !== 'number' || !Number.isFinite(units) || units < 0 ||
        (units>0 && (!view.peopleById.has(id) || (!view.peopleById.get(id).active && !(previous[id]>0))))))
    reject('INVALID_SHARES');
  const clean=normShares(shares);
  if (!Object.keys(clean).length || !Number.isFinite(Object.values(clean).reduce((sum,n)=>sum+n,0))) reject('INVALID_SHARES');
  return clean;
}
function checkedValuation(v) {
  if (!v || !['fixed','linear','degressive'].includes(v.type) || !validMoney(v.minimumValue ?? 0))
    reject('INVALID_VALUATION');
  if (v.type==='linear' && (!Number.isFinite(v.durationYears) || v.durationYears<=0)) reject('INVALID_VALUATION');
  if (v.type==='degressive' && (!Number.isFinite(v.annualRate) || v.annualRate<0 || v.annualRate>1)) reject('INVALID_VALUATION');
  return {type:v.type,minimumValue:v.minimumValue??0,
    ...(v.type==='linear'?{durationYears:v.durationYears}:v.type==='degressive'?{annualRate:v.annualRate}:{})};
}
function metadata({name,tags=[],note=''}) {
  if (!text(name) || !name.trim() || !Array.isArray(tags) || !tags.every(text) || !text(note)) reject('INVALID_ITEM_METADATA');
  return {name,tags,note};
}
function purchase(project,payload,predecessor=null) {
  const {date,initialValue,valuation,shares,financedByPersonId,draftId}=payload;
  const view=at(project,date);
  const meta=metadata(payload);
  if (!validMoney(initialValue)) reject('INVALID_ITEM_VALUE');
  const rule=checkedValuation(valuation);
  const clean=checkedShares(view,shares,predecessor?.shares);
  if (financedByPersonId && (!text(financedByPersonId) || !view.peopleById.get(financedByPersonId)?.active))
    reject('INVALID_FINANCIER');
  const item={id:uid('item'),...meta,...(predecessor?{predecessorItemId:predecessor.id}:{})};
  const event=createEvent('item-added',date,{itemId:item.id,name:meta.name,initialValue,valuation:rule,shares:clean,
    ...(financedByPersonId?{financedByPersonId,financialMode:'derived'}:{financialMode:'none'})},project);
  project.items.push(item);
  project.events.push(event);
  if (draftId) project.drafts=(project.drafts||[]).filter(d=>d.id!==draftId);
  return {item,event};
}
export function addItem(project,payload) { return purchase(project,payload); }
export function updateItemMetadata(project,{itemId,...payload}) {
  const item=project.items.find(i=>i.id===itemId);
  if (!item) reject('ITEM_NOT_FOUND');
  Object.assign(item,metadata(payload));
  return {item};
}
export function setItemShares(project,{itemId,date,shares,financialMode,note=''}) {
  const view=at(project,date), item=activeItem(view,itemId);
  if (!validMode(financialMode) || !text(note)) reject('INVALID_SHARE_CHANGE');
  const event=createEvent('shares-set',date,{itemId,shares:checkedShares(view,shares,item.shares),financialMode,note},project);
  project.events.push(event);
  return {event};
}
export function endItem(project,{itemId,date,reason='',statusAfter='ended'}) {
  activeItem(at(project,date),itemId);
  if (!text(reason) || !['ended','taken-private','disposed','succeeded'].includes(statusAfter)) reject('INVALID_ITEM_END');
  const event=createEvent('item-ended',date,{itemId,statusAfter,reason},project);
  project.events.push(event);
  return {event};
}
export function continueItem(project,{itemId,date,reason='',...payload}) {
  const previous=activeItem(at(project,date),itemId);
  if (!text(reason)) reject('INVALID_ITEM_END');
  // Validate and create on a temporary copy, then commit both events in order.
  const copy={...project,items:[...project.items],events:[...project.events]};
  const ended=endItem(copy,{itemId,date,reason,statusAfter:'succeeded'}).event;
  const result=purchase(copy,{...payload,date,financedByPersonId:undefined},previous);
  project.items=copy.items;
  project.events=copy.events;
  return {...result,ended};
}
export function executeRedistribution(project,{effectiveDate,title='',financialMode,changes,id}) {
  const view=at(project,effectiveDate);
  if (!text(title) || !validMode(financialMode) || !Array.isArray(changes) || !changes.length) reject('INVALID_REDISTRIBUTION');
  const ids=new Set();
  const events=changes.map(change=>{
    if (!change || ids.has(change.itemId)) reject('INVALID_REDISTRIBUTION');
    const item=activeItem(view,change.itemId);
    ids.add(change.itemId);
    return {id:uid('event_child'),type:'shares-set',itemId:item.id,shares:checkedShares(view,change.shares,item.shares),note:title};
  });
  const event=createEvent('redistribution-executed',effectiveDate,{title,financialMode,events},project);
  project.events.push(event);
  if (id) project.drafts=(project.drafts||[]).filter(d=>d.id!==id);
  return {event};
}
