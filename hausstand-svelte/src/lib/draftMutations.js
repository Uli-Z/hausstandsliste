import { clone, uid } from './util.js';
import { validISODate } from './claimSettlement.js';
import { addItem, executeRedistribution, checkedValuation, validShareMap, validMoney } from './itemMutations.js';

const reject=code=>{throw new Error(code);};
function checkItemData(data) {
  if (!data || typeof data!=='object' || Array.isArray(data) ||
      (data.effectiveDate!==undefined && !validISODate(data.effectiveDate)) ||
      ['name','note','financedByPersonId'].some(k=>data[k]!==undefined && typeof data[k]!=='string') ||
      (data.tags!==undefined && (!Array.isArray(data.tags) || !data.tags.every(tag=>typeof tag==='string'))) ||
      (data.initialValue!==undefined && !validMoney(data.initialValue)) ||
      (data.shares!==undefined && !validShareMap(data.shares))) reject('INVALID_ITEM_DRAFT');
  if (data.valuation!==undefined) checkedValuation(data.valuation);
}
function checkRedistribution(draft) {
  if (!validISODate(draft.effectiveDate) || !['none','derived'].includes(draft.financialMode) ||
      !Array.isArray(draft.changes) || draft.changes.some(change=>!change || typeof change.itemId!=='string' ||
        !change.itemId || !validShareMap(change.shares))) reject('INVALID_REDISTRIBUTION_DRAFT');
}
export function createRedistribution(title,effectiveDate,changes=[]) {
  const draft={id:uid('redistribution'),type:'redistribution',title,createdAt:new Date().toISOString(),
    effectiveDate,changes:clone(changes),financialMode:'derived'};
  checkRedistribution(draft);
  return draft;
}
export function createItemDraft({id,title,data,createdAt}) {
  if (!validISODate(data?.effectiveDate)) reject('INVALID_DRAFT_DATE');
  checkItemData(data);
  return {id:id||uid('draft_item'),type:'item',title,createdAt:createdAt||new Date().toISOString(),data:clone(data)};
}
// Drafts are intentionally allowed to be incomplete; the shared domain
// operation validates all fields at execution time, not merely at drafting.
export function upsertDraft(project,draft) {
  if (!draft || typeof draft.id!=='string' || !draft.id || !['item','redistribution'].includes(draft.type))
    reject('INVALID_DRAFT');
  if (draft.title!==undefined && typeof draft.title!=='string') reject('INVALID_DRAFT_TITLE');
  if (draft.type==='item') checkItemData(draft.data);
  else checkRedistribution(draft);
  project.drafts=project.drafts||[];
  const i=project.drafts.findIndex(d=>d.id===draft.id);
  if (i>=0 && project.drafts[i].type!==draft.type) reject('DRAFT_TYPE_MISMATCH');
  if (i>=0) project.drafts[i]=clone(draft);
  else project.drafts.push(clone(draft));
  return draft;
}
export function removeDraft(project,id) {
  const draft=(project.drafts||[]).find(d=>d.id===id);
  if (!draft) reject('DRAFT_NOT_FOUND');
  project.drafts=project.drafts.filter(d=>d.id!==id);
  return draft;
}
export function executeDraft(project,id) {
  const draft=(project.drafts||[]).find(d=>d.id===id);
  if (!draft) reject('DRAFT_NOT_FOUND');
  if (draft.type==='item') {
    const {effectiveDate,...data}=draft.data||{};
    return addItem(project,{...data,date:effectiveDate,draftId:id});
  }
  if (draft.type==='redistribution') return executeRedistribution(project,draft);
  reject('INVALID_DRAFT');
}
