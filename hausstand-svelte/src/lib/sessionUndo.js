// Small, session-only edit history. File archives and credentials never enter it.
// The archive always belongs to the current saved file, not an undo checkpoint.
import { collectItemNumbers, applyItemNumbers } from './itemNumbers.js';
const copy = value => structuredClone(value);
const editData = project => {
  const value = copy(project);
  delete value.versionHistory;
  delete value.lastSavedAt;
  delete value.humanReadableSnapshot;
  delete value.itemNumberRegistry; // Allocation never rewinds with business data.
  return value;
};

const apply = (current, snapshot) => {
  const restored = copy(snapshot);
  for (const key of ['versionHistory', 'lastSavedAt', 'humanReadableSnapshot']) {
    if (key in current) restored[key] = copy(current[key]);
  }
  return applyItemNumbers(restored,collectItemNumbers([current,restored]));
};

export function createSessionUndo(limit = 50) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Undo limit must be a positive integer');
  let past = [];
  let future = [];
  const counts = () => ({ undoCount: past.length, redoCount: future.length });
  const reset = () => { past = []; future = []; return counts(); };
  const record = (before, after, description = []) => {
    const previous = editData(before);
    if (JSON.stringify(previous) === JSON.stringify(editData(after))) return false;
    past.push({ snapshot: previous, description: copy(description) });
    if (past.length > limit) past.shift();
    future = [];
    return true;
  };
  const travel = (stack, opposite, current, validate) => {
    if (!stack.length) return null;
    const entry = stack[stack.length - 1];
    const result = apply(current, entry.snapshot);
    if (validate && !validate(result)) return null;
    stack.pop();
    opposite.push({ snapshot: editData(current), description: entry.description });
    if (opposite.length > limit) opposite.shift();
    return result;
  };
  const view = (current, saved) => {
    const cursor = past.length;
    const chronologicalFuture = [...future].reverse();
    const states = [...past.map(entry=>entry.snapshot), editData(current), ...chronologicalFuture.map(entry=>entry.snapshot)];
    const target = saved == null ? null : JSON.stringify(editData(saved));
    // Match the saved business state, never an archive or a technical revision.
    const savedIndices = target == null ? [] : states.flatMap((state,index)=>JSON.stringify(state)===target?[index]:[]);
    const savedIndex = savedIndices.includes(cursor) ? cursor : savedIndices.at(-1) ?? null;
    return { entries:[...past,...chronologicalFuture].map(entry=>copy(entry.description)), cursor,
      hasSaved:target!==null, savedIndex, savedOutside:target!==null&&savedIndex===null };
  };
  const jump = (current, index, validate) => {
    if (!Number.isInteger(index) || index<0 || index>past.length+future.length || index===past.length) return null;
    // Use the same undo/redo transitions; commit the whole jump only if every
    // intervening state passes the normal validation.
    const oldPast=past, oldFuture=future;
    past=[...past]; future=[...future];
    try {
      let next=current;
      while(past.length!==index) {
        next=past.length>index?travel(past,future,next,validate):travel(future,past,next,validate);
        if(!next) { past=oldPast; future=oldFuture; return null; }
      }
      return next;
    } catch(error) { past=oldPast; future=oldFuture; throw error; }
  };
  return {
    record, counts, reset, view, jump,
    undo: (current, validate) => travel(past, future, current, validate),
    redo: (current, validate) => travel(future, past, current, validate)
  };
}

export function historyShortcut(event, hasDialog = false) {
  if (hasDialog || event.defaultPrevented || event.isComposing || event.repeat || event.altKey) return null;
  if (!(event.ctrlKey || event.metaKey) || (event.ctrlKey && event.metaKey)) return null;
  const target = event.target;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
      || target?.isContentEditable || target?.closest?.('[contenteditable], [role="textbox"]')) return null;
  const key = String(event.key || '').toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}
