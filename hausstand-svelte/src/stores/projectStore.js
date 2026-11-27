import { derived, get, writable } from 'svelte/store';
import { itemDisplayName } from '../lib/itemNames.js';
import { collectItemNumbers, applyItemNumbers, alignSavedItemNumbers } from '../lib/itemNumbers.js';
import { emptyProject, normalize } from '../lib/domain.js';
import { clone, todayISO } from '../lib/util.js';
import { createRedistribution, upsertDraft, removeDraft } from '../lib/draftMutations.js';
import { projectAt } from '../lib/projector.js';
import { ledgerAt } from '../lib/ledger.js';
import { ownershipHistoryProblems } from '../lib/ownershipValidation.js';
import { saveWorkingCopy, clearWorkingCopy } from '../lib/persistence.js';
import { hasProjectChanges, withoutHistory } from '../lib/versionHistory.js';
import { createSessionUndo } from '../lib/sessionUndo.js';
import { describeSessionChange } from '../lib/sessionLog.js';
import { projectMutationProblem } from '../lib/mutationValidation.js';
import { message, getLocale } from '../lib/i18n.js';
import { notifications } from '../lib/notifications.js';
import { openDatePicker, dismissDatePicker, selectAsOfDate, returnToToday, syncCalendarDay } from '../lib/timeTravel.js';

const initial = {
  project: emptyProject(),
  savedProject: null, // Last explicitly saved/loaded version, not the working copy.
  localCacheWarning: false,
  history: { undoCount: 0, redoCount: 0 },
  asOfDate: todayISO(), datePickerOpen: false, timeTravelActive: false,
  dirty: false,
  secure: false,
  readOnly: false,
  readOnlyReason: '',
  route: { page: 'dashboard' },
  activeDialog: null,
  dialogRevision: 0 // Session-only identity; unrelated store notifications must not remount forms.
};

function createStore() {
  const { subscribe, update } = writable(initial);
  const sessionUndo = createSessionUndo(50);
  // Central UI entry guard; the mutation guard remains the second layer.
  const requireEditing = state => {
    if (!state.readOnly) return true;
    notifications.dismissSource('read-only');
    notifications.notify([message('errors.readOnly', getLocale()), state.readOnlyReason].filter(Boolean).join('\n\n'), {kind:'error', source:'read-only'});
    return false;
  };
  const openDialog = (state, dialog) => {
    if (dialog && dialog.type !== 'options' && !requireEditing(state)) return state;
    return { ...dismissDatePicker(state), activeDialog: dialog, dialogRevision: state.dialogRevision + 1 };
  };
  const resetUndo = state => ({ ...state, history: sessionUndo.reset() });
  const changedProject = (state, nextProject) => {
    if (!sessionUndo.record(state.project, nextProject, describeSessionChange(state.project,nextProject))) return state;
    return persist({ ...state, project: nextProject,
      dirty: hasProjectChanges(nextProject, state.savedProject),
      history: sessionUndo.counts() });
  };
  const persist = state => {
    // Never persist decrypted protected data into browser storage.
    if (state.secure) { clearWorkingCopy(); return { ...state, localCacheWarning: false }; }
    try {
      // Do not duplicate the entire compressed archive in localStorage merely
      // to keep the saved baseline for dirty detection after reload.
      const savedHistoryIds = state.savedProject?.versionHistory?.entries?.map(v => v.id) || [];
      saveWorkingCopy({
        project: state.project,
        savedProject: state.savedProject ? withoutHistory(state.savedProject) : null,
        savedHistoryIds,
        asOfDate: state.asOfDate, dirty: state.dirty
      });
      return { ...state, localCacheWarning: false };
    } catch {
      // Full browser quota must not prevent editing; do not leave stale cached
      // data masquerading as the most recent version.
      clearWorkingCopy();
      return { ...state, localCacheWarning: true };
    }
  };
  const api = {
    subscribe,
    sessionLog: () => { const s=get({subscribe}); return sessionUndo.view(s.project,s.savedProject); },
    openDatePicker: () => update(s => openDatePicker(s)),
    dismissDatePicker: () => update(s => dismissDatePicker(s)),
    setAsOfDate: asOfDate => update(s => {
      const next = selectAsOfDate(s, asOfDate);
      return next === s ? s : persist(next);
    }),
    exitTimeTravel: () => update(s => returnToToday(s, todayISO())),
    syncToday: day => update(s => syncCalendarDay(s, day)),
    restoreWorkingCopy: copy => update(s => {
      // Saved state has a smaller copy without history; reconstruct its exact
      // prior archive from the persisted entry IDs.
      const savedArchiveEntries = (copy.project?.versionHistory?.entries || [])
        .filter(entry => (copy.savedHistoryIds || []).includes(entry.id));
      const saved = copy.savedProject
        ? normalize({ ...alignSavedItemNumbers(copy.savedProject,copy.project), ...(copy.savedHistoryIds?.length
          ? { versionHistory: { format: 'portable-v1', entries: savedArchiveEntries } }
          : {}) })
        : copy.dirty ? null : normalize(copy.project);
      return resetUndo({ ...s, project: normalize(copy.project), savedProject: saved,
        dirty: hasProjectChanges(normalize(copy.project), saved),
        localCacheWarning: false, secure: false, readOnly: false, readOnlyReason: '',
        asOfDate: todayISO(), datePickerOpen: false, timeTravelActive: false, route: { page: 'dashboard' }, activeDialog: null });
    }),
    setRoute: route => update(s => ({ ...dismissDatePicker(s), route })),
    requireEditing: () => requireEditing(get({ subscribe })),
    setDialog: activeDialog => update(s => openDialog(s, activeDialog)),
    closeDialog: () => update(s => ({ ...s, activeDialog: s.readOnly ? null : s.activeDialog?.returnTo || null, dialogRevision: s.dialogRevision + 1 })),
    importProject: (raw, { secure = false, readOnly = false, sameProjectRefresh = false } = {}) => update(s => {
      const project = normalize(raw);
      // A checkout refreshes the same project, not the user's chosen viewing date.
      // Explicit imports/new projects still start at today.
      const view = sameProjectRefresh ? syncCalendarDay(s, todayISO()) : returnToToday(s, todayISO());
      return persist(resetUndo({ ...s, project, savedProject: clone(project), secure, readOnly, readOnlyReason: '',
        asOfDate: view.asOfDate, datePickerOpen: view.datePickerOpen, timeTravelActive: view.timeTravelActive,
        dirty: false, route: { page: 'dashboard' }, activeDialog: null }));
    }),
    setReadOnly: (readOnly, reason = '') => update(s => {
      if (!readOnly) notifications.dismissSource('read-only');
      const next = { ...s, readOnly, readOnlyReason: readOnly ? reason : '' };
      // Do not remount or discard an already-open form when the lease is lost.
      if (readOnly && !s.readOnly && s.activeDialog && s.activeDialog.type !== 'options') requireEditing(next);
      return next;
    }),
    // Intentional destructive replacement, never an undoable domain mutation.
    newProject: name => {
      let replaced = false;
      update(s => {
        if (!requireEditing(s)) return s;
        // Remove the previous working copy before publishing the blank one.
        clearWorkingCopy();
        replaced = true;
        return persist(resetUndo({ ...s, project: { ...emptyProject(), community: { name: name || 'Hausgemeinschaft' } }, savedProject: null, secure: false, readOnly: false, readOnlyReason: '', asOfDate: todayISO(), datePickerOpen: false, timeTravelActive: false, dirty: true, route: { page: 'dashboard' }, activeDialog: null }));
      });
      return replaced;
    },
    mutateProject: mutator => {
      let saved = false;
      update(s => {
        if (!requireEditing(s)) return s;
        const project = clone(s.project);
        try { mutator(project); }
        catch { notifications.notify(message('errors.changeFailed', getLocale()), {kind:'error'}); return s; }
        const problem = projectMutationProblem(s.project, project);
        if (problem) {
          notifications.notify(message(problem.key, getLocale(), problem.params || {}), {kind:'error'});
          return s;
        }
        saved = true;
        const next = changedProject(s, project);
        if (next !== s) {
          const key = s.activeDialog?.type === 'personAdd' ? 'toast.personAdded'
            : s.activeDialog?.type === 'itemAdd' ? 'toast.itemAdded' : 'toast.changeRecorded';
          const created = project.items.find(item=>!s.project.items.some(old=>old.id===item.id));
          notifications.notify(message(key, getLocale()) + (created ? ' · ' + itemDisplayName(created) : ''), {kind:'success'});
        }
        return next;
      });
      return saved;
    },
    renameHousehold: name => {
      if (typeof name !== 'string' || !name.trim()) return false;
      return api.mutateProject(project => { project.community = { ...project.community, name: name.trim() }; });
    },
    startRedistribution: (title, date, changes = [], extraDialog = {}) => update(s => {
      if (!requireEditing(s)) return s;
      const { initialFinancialMode, ...dialogOptions } = extraDialog;
      const r = createRedistribution(title || 'Neue Umverteilung', date || s.asOfDate, changes);
      if (initialFinancialMode === 'none') r.financialMode = 'none';
      return openDialog(s, { type: 'redistributionEdit', redistribution: r, ...dialogOptions });
    }),
    upsertDraft: draft => {
      let accepted = false;
      update(s => {
        if (!requireEditing(s)) return s;
        const project = clone(s.project);
        try { upsertDraft(project,draft); }
        catch { notifications.notify(message('errors.changeFailed', getLocale()), {kind:'error'}); return s; }
        accepted = true;
        return changedProject(s, project);
      });
      return accepted;
    },
    deleteDraft: id => update(s => {
      if (!requireEditing(s)) return s;
      const project = clone(s.project);
      try { removeDraft(project,id); }
      catch { return s; }
      return changedProject(s, project);
    }),
    undo: () => {
      let applied = false;
      update(s => {
        if (s.readOnly || s.activeDialog) return s;
        const project = sessionUndo.undo(s.project, p => !ownershipHistoryProblems(p).length);
        if (!project) return s;
        applied = true;
        return persist({ ...s, project, dirty: hasProjectChanges(project, s.savedProject),
          history: sessionUndo.counts() });
      });
      return applied;
    },
    redo: () => {
      let applied = false;
      update(s => {
        if (s.readOnly || s.activeDialog) return s;
        const project = sessionUndo.redo(s.project, p => !ownershipHistoryProblems(p).length);
        if (!project) return s;
        applied = true;
        return persist({ ...s, project, dirty: hasProjectChanges(project, s.savedProject),
          history: sessionUndo.counts() });
      });
      return applied;
    },
    jumpHistory: index => {
      let applied=false;
      update(s=>{
        if(s.activeDialog || !requireEditing(s)) return s;
        const project=sessionUndo.jump(s.project,index,p=>!ownershipHistoryProblems(p).length);
        if(!project) return s;
        applied=true;
        return persist({...s,project,dirty:hasProjectChanges(project,s.savedProject),history:sessionUndo.counts()});
      });
      return applied;
    },
    // The archive enters the working project only after the download/upload has been started/confirmed.
    restoreVersion: restored => update(s => {
      if (s.readOnly) return s;
      // Restoring is an editable draft, not an implicit file/server save.
      const project = normalize(applyItemNumbers(restored,collectItemNumbers([s.project,restored])));
      return persist(resetUndo({ ...s, project, dirty: hasProjectChanges(project, s.savedProject),
        activeDialog: null, route: { page: 'dashboard' }, asOfDate: todayISO(), datePickerOpen: false, timeTravelActive: false }));
    }),
    markSaved: saved => update(s => {
      const savedProject = normalize(saved);
      const dirty = hasProjectChanges(s.project, savedProject);
      return persist({ ...s,
        project: dirty ? { ...s.project, lastSavedAt: savedProject.lastSavedAt, versionHistory: savedProject.versionHistory } : savedProject,
        savedProject: clone(savedProject), dirty
      });
    }),
    markExported: () => update(s => persist({ ...s, dirty: false, savedProject: clone(s.project) }))
  };
  return api;
}

export const appState = createStore();
export const projection = derived(appState, $s => projectAt($s.project, $s.asOfDate));
export const ledger = derived(appState, $s => ledgerAt($s.project, $s.asOfDate));

export { createEvent } from '../lib/personMutations.js';
export { createRedistribution } from '../lib/draftMutations.js';
