import { derived, writable } from 'svelte/store';
import { emptyProject, normalize } from '../lib/domain.js';
import { clone, todayISO, uid } from '../lib/util.js';
import { projectAt } from '../lib/projector.js';
import { saveWorkingCopy } from '../lib/persistence.js';

const initial = {
  project: emptyProject(),
  asOfDate: todayISO(),
  fileName: null,
  dirty: false,
  route: { page: 'dashboard' },
  activeDialog: null
};

function createStore() {
  const { subscribe, set, update } = writable(initial);
  const persist = state => {
    saveWorkingCopy({ project: state.project, asOfDate: state.asOfDate, fileName: state.fileName, dirty: state.dirty });
    return state;
  };
  return {
    subscribe,
    setAsOfDate: asOfDate => update(s => persist({ ...s, asOfDate })),
    setRoute: route => update(s => ({ ...s, route })),
    setDialog: activeDialog => update(s => ({ ...s, activeDialog })),
    closeDialog: () => update(s => ({ ...s, activeDialog: null })),
    importProject: (raw, fileName = null) => update(s => persist({ ...s, project: normalize(raw), fileName, dirty: false })),
    newProject: name => update(s => persist({ ...s, project: { ...emptyProject(), community: { name: name || 'Hausgemeinschaft' } }, fileName: null, dirty: true, route: { page: 'dashboard' } })),
    mutateProject: mutator => update(s => {
      const project = clone(s.project);
      mutator(project);
      return persist({ ...s, project, dirty: true });
    }),
    startRedistribution: (title, date, changes = [], extraDialog = {}) => update(s => {
      const r = createRedistribution(title || 'Neue Umverteilung', date || s.asOfDate, changes);
      return { ...s, activeDialog: { type: 'redistributionEdit', redistribution: r, ...extraDialog } };
    }),
    upsertDraft: draft => update(s => {
      const project = clone(s.project);
      project.drafts = project.drafts || [];
      const idx = project.drafts.findIndex(d => d.id === draft.id);
      if (idx >= 0) project.drafts[idx] = clone(draft);
      else project.drafts.push(clone(draft));
      return persist({ ...s, project, dirty: true });
    }),
    deleteDraft: id => update(s => {
      const project = clone(s.project);
      project.drafts = (project.drafts || []).filter(d => d.id !== id);
      return persist({ ...s, project, dirty: true });
    }),
    markExported: () => update(s => persist({ ...s, dirty: false }))
  };
}

export const appState = createStore();
export const projection = derived(appState, $s => projectAt($s.project, $s.asOfDate));

export const createEvent = (type, date, data = {}) => ({ id: uid('event'), type, date, order: Date.now(), ...data });
export const createRedistribution = (title, effectiveDate, changes = []) => ({ id: uid('redistribution'), type: 'redistribution', title, createdAt: new Date().toISOString(), effectiveDate, changes });
