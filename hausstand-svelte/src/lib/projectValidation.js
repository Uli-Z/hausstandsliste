import { validStoredShareEvent } from './shareUnits.js';
import { requireProjectFile } from './domain.js';
import { projectMutationProblem } from './mutationValidation.js';
import { validShareMap, checkedValuation } from './itemMutations.js';
import { editableEventFields } from './eventMutations.js';
import { upsertDraft } from './draftMutations.js';

// Explicit audit of the entire persisted state, not the incremental editing
// guard: an invalid historical row must remain editable/deletable for repair.
// Reuse the existing payment, date, money, ownership and valuation validators.
export function storedProjectProblem(project) {
  requireProjectFile(project);
  const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const id = v => typeof v === 'string' && !!v.trim();
  const rows = new Map();
  for (const field of ['people', 'items', 'drafts', 'events']) {
    const ids = new Set();
    for (const row of project[field]) {
      if (!object(row) || !id(row.id) || ids.has(row.id)) return 'INVALID_' + field.toUpperCase() + '_ID';
      ids.add(row.id);
      if (['people','items'].includes(field) && typeof row.name !== 'string') return 'INVALID_METADATA';
      if (field === 'items' && ((row.tags !== undefined && (!Array.isArray(row.tags) || !row.tags.every(t => typeof t === 'string'))) ||
          (row.note !== undefined && typeof row.note !== 'string'))) return 'INVALID_METADATA';
    }
    rows.set(field, ids);
  }
  const people = rows.get('people'), items = rows.get('items'), eventIds = rows.get('events');
  const sharesValid = shares => validShareMap(shares) &&
    Object.entries(shares).every(([personId, units]) => units === 0 || people.has(personId));
  const changeValid = event => validStoredShareEvent(event) && Object.keys(event.shareUnitDeltas).every(personId=>people.has(personId));
  const modeValid = v => v === undefined || ['none','derived'].includes(v);
  for (const event of project.events) {
    if (!Object.hasOwn(editableEventFields, event.type)) return 'UNKNOWN_EVENT_TYPE';
    if (!Number.isSafeInteger(event.order)) return 'INVALID_EVENT_ORDER';
    if (event.type.startsWith('person-') && !people.has(event.personId)) return 'UNKNOWN_PERSON';
    if (['item-added','item-ended','shares-set'].includes(event.type) && !items.has(event.itemId)) return 'UNKNOWN_ITEM';
    if (['item-added','shares-set','redistribution-executed'].includes(event.type) && !modeValid(event.financialMode)) return 'INVALID_FINANCIAL_MODE';
    if (event.type === 'item-added' && !sharesValid(event.shares) || event.type === 'shares-set' && !changeValid(event)) return 'INVALID_SHARES';
    if (event.type === 'item-added') {
      try { checkedValuation(event.valuation); } catch { return 'INVALID_VALUATION'; }
    }
    if (event.type === 'item-ended' && event.statusAfter !== undefined &&
        !['ended','taken-private','disposed','succeeded'].includes(event.statusAfter)) return 'INVALID_ITEM_END';
    if (event.type === 'redistribution-executed') {
      if (!Array.isArray(event.events)) return 'INVALID_REDISTRIBUTION';
      const changed = new Set();
      for (const child of event.events) {
        if (!object(child) || !id(child.id) || eventIds.has(child.id) || child.type !== 'shares-set' ||
            !items.has(child.itemId) || changed.has(child.itemId) || !changeValid(child)) return 'INVALID_REDISTRIBUTION_CHILD';
        eventIds.add(child.id);
        changed.add(child.itemId);
      }
    }
  }
  const problem = projectMutationProblem({ events: [] }, project);
  if (problem) return problem.key;
  // Drafts may be unfinished. Validate structure using the shared draft
  // operation on a scratch container, never execute or mutate the input.
  for (const draft of project.drafts) {
    try { upsertDraft({ drafts: [] }, draft); } catch { return 'INVALID_DRAFT'; }
  }
  return null;
}
