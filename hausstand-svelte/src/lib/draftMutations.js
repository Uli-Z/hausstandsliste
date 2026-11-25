import { clone, uid } from './util.js';
import { validISODate } from './claimSettlement.js';
import { addItem, executeRedistribution } from './itemMutations.js';

const reject=code=>{throw new Error(code);};
export const createRedistribution = (title,effectiveDate,changes=[]) => ({
  id:uid('redistribution'),type:'redistribution',title,createdAt:new Date().toISOString(),
  effectiveDate,changes,financialMode:'derived'
});
export function createItemDraft({id,title,data,createdAt}) {
  if (!validISODate(data?.effectiveDate)) reject('INVALID_DRAFT_DATE');
  return {id:id||uid('draft_item'),type:'item',title,createdAt:createdAt||new Date().toISOString(),data:clone(data)};
}
// Drafts are intentionally allowed to be incomplete; the shared domain
// operation validates all fields at execution time, not merely at drafting.
export function upsertDraft(project,draft) {
  if (!draft || typeof draft.id!=='string' || !draft.id || !['item','redistribution'].includes(draft.type))
    reject('INVALID_DRAFT');
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
