import { derived, writable } from 'svelte/store';
import { emptyProject, normalize } from '../lib/domain.js';
import { clone, todayISO, uid } from '../lib/util.js';
import { projectAt } from '../lib/projector.js';
import { ledgerAt } from '../lib/ledger.js';
import { unownedActiveTransitions } from '../lib/ownershipValidation.js';
import { saveWorkingCopy, clearWorkingCopy } from '../lib/persistence.js';
import { hasProjectChanges, withoutHistory } from '../lib/versionHistory.js';
import { createSessionUndo } from '../lib/sessionUndo.js';
import { projectMutationProblem } from '../lib/mutationValidation.js';
import { message, getLocale } from '../lib/i18n.js';
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
  route: { page: 'dashboard' },
  activeDialog: null
};

function createStore() {
  const { subscribe, update } = writable(initial);
  const sessionUndo = createSessionUndo(50);
  const resetUndo = state => ({ ...state, history: sessionUndo.reset() });
  const changedProject = (state, nextProject) => {
    if (!sessionUndo.record(state.project, nextProject)) return state;
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
  return {
    subscribe,
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
        ? normalize({ ...copy.savedProject, ...(copy.savedHistoryIds?.length
          ? { versionHistory: { format: 'portable-v1', entries: savedArchiveEntries } }
          : {}) })
        : copy.dirty ? null : normalize(copy.project);
      return resetUndo({ ...s, project: normalize(copy.project), savedProject: saved,
        dirty: hasProjectChanges(normalize(copy.project), saved),
        localCacheWarning: false, secure: false, readOnly: false,
        asOfDate: todayISO(), datePickerOpen: false, timeTravelActive: false, route: { page: 'dashboard' }, activeDialog: null });
    }),
    setRoute: route => update(s => ({ ...s, route })),
    setDialog: activeDialog => update(s => ({ ...s, activeDialog })),
    closeDialog: () => update(s => ({ ...s, activeDialog: null })),
    importProject: (raw, { secure = false, readOnly = false } = {}) => update(s => {
      const project = normalize(raw);
      return persist(resetUndo({ ...s, project, savedProject: clone(project), secure, readOnly,
        asOfDate: todayISO(), datePickerOpen: false, timeTravelActive: false, dirty: false, route: { page: 'dashboard' }, activeDialog: null }));
    }),
    setReadOnly: readOnly => update(s => ({ ...s, readOnly })),
    newProject: name => update(s => persist(resetUndo({ ...s, project: { ...emptyProject(), community: { name: name || 'Hausgemeinschaft' } }, savedProject: null, secure: false, readOnly: false, asOfDate: todayISO(), datePickerOpen: false, timeTravelActive: false, dirty: true, route: { page: 'dashboard' }, activeDialog: null }))),
    mutateProject: mutator => {
      let saved = false;
      update(s => {
        if (s.readOnly) { alert(message('errors.readOnly', getLocale())); return s; }
        const project = clone(s.project);
        try { mutator(project); }
        catch { alert(message('errors.changeFailed', getLocale())); return s; }
        const problem = projectMutationProblem(s.project, project);
        if (problem) {
          alert(message(problem.key, getLocale(), problem.params || {}));
          return s;
        }
        saved = true;
        return changedProject(s, project);
      });
      return saved;
    },
    startRedistribution: (title, date, changes = [], extraDialog = {}) => update(s => {
      const r = createRedistribution(title || 'Neue Umverteilung', date || s.asOfDate, changes);
      return { ...s, activeDialog: { type: 'redistributionEdit', redistribution: r, ...extraDialog } };
    }),
    upsertDraft: draft => update(s => {
      if (s.readOnly) { alert(message('errors.readOnly', getLocale())); return s; }
      const project = clone(s.project);
      project.drafts = project.drafts || [];
      const idx = project.drafts.findIndex(d => d.id === draft.id);
      if (idx >= 0) project.drafts[idx] = clone(draft);
      else project.drafts.push(clone(draft));
      return changedProject(s, project);
    }),
    deleteDraft: id => update(s => {
      if (s.readOnly) { alert(message('errors.readOnly', getLocale())); return s; }
      const project = clone(s.project);
      project.drafts = (project.drafts || []).filter(d => d.id !== id);
      return changedProject(s, project);
    }),
    undo: () => {
      let applied = false;
      update(s => {
        if (s.readOnly || s.activeDialog) return s;
        const project = sessionUndo.undo(s.project, p => !unownedActiveTransitions(p).length);
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
        const project = sessionUndo.redo(s.project, p => !unownedActiveTransitions(p).length);
        if (!project) return s;
        applied = true;
        return persist({ ...s, project, dirty: hasProjectChanges(project, s.savedProject),
          history: sessionUndo.counts() });
      });
      return applied;
    },
    // The archive enters the working project only after the download/upload has been started/confirmed.
    restoreVersion: restored => update(s => {
      if (s.readOnly) return s;
      // Restoring is an editable draft, not an implicit file/server save.
      const project = normalize(restored);
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
}

export const appState = createStore();
export const projection = derived(appState, $s => projectAt($s.project, $s.asOfDate));
export const ledger = derived(appState, $s => ledgerAt($s.project, $s.asOfDate));

export { createEvent } from '../lib/personMutations.js';
export const createRedistribution = (title, effectiveDate, changes = []) => ({ id: uid('redistribution'), type: 'redistribution', title, createdAt: new Date().toISOString(), effectiveDate, changes, financialMode: 'derived' });
