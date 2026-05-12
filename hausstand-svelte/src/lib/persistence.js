import { nowISO } from './util.js';
import { money } from './domain.js';
import { projectAt } from './projector.js';
import { label as valuationLabel } from './valuation.js';

const KEY = 'hausstand_svelte_v07_working_copy';

export const loadWorkingCopy = () => {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
};
export const saveWorkingCopy = payload => localStorage.setItem(KEY, JSON.stringify({ ...payload, savedAt: nowISO() }));

export const exportProject = (project, asOfDate) => {
  const projection = projectAt(project, asOfDate);
  return {
    ...project,
    schemaVersion: 1,
    currency: 'EUR',
    humanReadableSnapshot: {
      generatedAt: nowISO(),
      asOfDate,
      summary: [
        `Gemeinschaft: ${project.community?.name || 'Hausgemeinschaft'}`,
        `Gesamtwert aktiver Gegenstände: ${money(projection.totalValue)}`,
        `Personen mit Anteilen: ${projection.people.length}`,
        `Aktive Gegenstände mit Wert: ${projection.activeItems.length}`
      ],
      people: projection.people.map(p => ({ name: p.name, active: !!p.active, totalValue: Math.round(p.totalValue * 100) / 100 })),
      items: projection.activeItems.map(i => ({
        name: i.name,
        currentValue: Math.round(i.value * 100) / 100,
        valuation: valuationLabel(i.runtime.valuation),
        tags: i.tags || [],
        shares: Object.fromEntries(i.shareRows.map(r => [r.personName, r.units]))
      }))
    }
  };
};

export const downloadProject = (project, asOfDate) => {
  const data = exportProject(project, asOfDate);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(project.community?.name || 'hausstand').toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '_')}_${asOfDate}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
