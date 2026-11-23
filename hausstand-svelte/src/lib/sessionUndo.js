// Small, session-only edit history. File archives and credentials never enter it.
// The archive always belongs to the current saved file, not an undo checkpoint.
const copy = value => structuredClone(value);
const editData = project => {
  const value = copy(project);
  delete value.versionHistory;
  delete value.lastSavedAt;
  delete value.humanReadableSnapshot;
  return value;
};

const apply = (current, snapshot) => {
  const restored = copy(snapshot);
  for (const key of ['versionHistory', 'lastSavedAt', 'humanReadableSnapshot']) {
    if (key in current) restored[key] = copy(current[key]);
  }
  return restored;
};

export function createSessionUndo(limit = 50) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Undo limit must be a positive integer');
  let past = [];
  let future = [];
  const counts = () => ({ undoCount: past.length, redoCount: future.length });
  const reset = () => { past = []; future = []; return counts(); };
  const record = (before, after) => {
    const previous = editData(before);
    if (JSON.stringify(previous) === JSON.stringify(editData(after))) return false;
    past.push(previous);
    if (past.length > limit) past.shift();
    future = [];
    return true;
  };
  const travel = (stack, opposite, current, validate) => {
    if (!stack.length) return null;
    const result = apply(current, stack[stack.length - 1]);
    if (validate && !validate(result)) return null;
    stack.pop();
    opposite.push(editData(current));
    if (opposite.length > limit) opposite.shift();
    return result;
  };
  return {
    record, counts, reset,
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
