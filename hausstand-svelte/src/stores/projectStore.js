import { derived, writable } from 'svelte/store';
import { emptyProject, normalize } from '../lib/domain.js';
import { clone, todayISO, uid, nextEventOrder } from '../lib/util.js';
import { projectAt } from '../lib/projector.js';
import { ledgerAt } from '../lib/ledger.js';
import { newUnownedActiveTransitions } from '../lib/ownershipValidation.js';
import { saveWorkingCopy, clearWorkingCopy } from '../lib/persistence.js';
import { hasProjectChanges } from '../lib/versionHistory.js';

const initial = {
  project: emptyProject(),
  savedProject: null, // Last explicitly saved/loaded version, not the working copy.
  asOfDate: todayISO(),
  fileName: null,
  dirty: false,
  secure: false,
  readOnly: false,
  route: { page: 'dashboard' },
  activeDialog: null
};

function createStore() {
  const { subscribe, set, update } = writable(initial);
  const persist = state => {
    // Never persist a decrypted protected project into browser localStorage.
    if (state.secure) clearWorkingCopy();
    else saveWorkingCopy({ project: state.project, savedProject: state.savedProject, asOfDate: state.asOfDate, fileName: state.fileName, dirty: state.dirty });
    return state;
  };
  return {
    subscribe,
    setAsOfDate: asOfDate => update(s => persist({ ...s, asOfDate })),
    restoreWorkingCopy: copy => update(s => ({ ...s,
      project: normalize(copy.project),
      savedProject: copy.savedProject ? normalize(copy.savedProject) : copy.dirty ? null : normalize(copy.project),
      fileName: copy.fileName || null, dirty: !!copy.dirty,
      secure: false, readOnly: false, asOfDate: todayISO(), route: { page: 'dashboard' }
    })),
    setRoute: route => update(s => ({ ...s, route })),
    setDialog: activeDialog => update(s => ({ ...s, activeDialog })),
    closeDialog: () => update(s => ({ ...s, activeDialog: null })),
    importProject: (raw, fileName = null, secure = false, readOnly = false) => update(s => {
      const project = normalize(raw);
      return persist({ ...s, project, savedProject: clone(project), fileName, secure, readOnly,
        asOfDate: todayISO(), dirty: false, route: { page: 'dashboard' } });
    }),
    setReadOnly: readOnly => update(s => ({ ...s, readOnly })),
    newProject: name => update(s => persist({ ...s, project: { ...emptyProject(), community: { name: name || 'Hausgemeinschaft' } }, savedProject: null, fileName: null, secure: false, readOnly: false, asOfDate: todayISO(), dirty: true, route: { page: 'dashboard' } })),
    mutateProject: mutator => {
      let saved = false;
      update(s => {
        if (s.readOnly) { alert('Online-Datei ist schreibgeschützt. Bitte zuerst auschecken.'); return s; }
        const project = clone(s.project);
        mutator(project);
        const invalid = newUnownedActiveTransitions(s.project, project);
        if (invalid.length) {
          const first = invalid[0];
          const name = (project.items || []).find(item => item.id === first.itemId)?.name || first.itemId;
          alert(`Änderung nicht gespeichert: „${name}“ wäre ab ${first.date} ohne Eigentümer. Bitte Anteile auf eine andere Person übertragen oder den Gegenstand ausdrücklich über „Beenden / archivieren“ beenden.`);
          return s;
        }
        saved = true;
        return persist({ ...s, project, dirty: true });
      });
      return saved;
    },
    startRedistribution: (title, date, changes = [], extraDialog = {}) => update(s => {
      const r = createRedistribution(title || 'Neue Umverteilung', date || s.asOfDate, changes);
      return { ...s, activeDialog: { type: 'redistributionEdit', redistribution: r, ...extraDialog } };
    }),
    upsertDraft: draft => update(s => {
      if (s.readOnly) { alert('Online-Datei ist schreibgeschützt. Bitte zuerst auschecken.'); return s; }
      const project = clone(s.project);
      project.drafts = project.drafts || [];
      const idx = project.drafts.findIndex(d => d.id === draft.id);
      if (idx >= 0) project.drafts[idx] = clone(draft);
      else project.drafts.push(clone(draft));
      return persist({ ...s, project, dirty: true });
    }),
    deleteDraft: id => update(s => {
      if (s.readOnly) { alert('Online-Datei ist schreibgeschützt. Bitte zuerst auschecken.'); return s; }
      const project = clone(s.project);
      project.drafts = (project.drafts || []).filter(d => d.id !== id);
      return persist({ ...s, project, dirty: true });
    }),
    // The archive enters the working project only after the download/upload has been started/confirmed.
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

export const createEvent = (type, date, data = {}, project = null) => ({ id: uid('event'), type, date, order: nextEventOrder(project, date), ...data });
export const createRedistribution = (title, effectiveDate, changes = []) => ({ id: uid('redistribution'), type: 'redistribution', title, createdAt: new Date().toISOString(), effectiveDate, changes, financialMode: 'derived' });
