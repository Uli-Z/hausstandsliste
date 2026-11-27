import { itemDisplayName } from './itemNames.js';
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
export const clearWorkingCopy = () => localStorage.removeItem(KEY);

export const exportProject = (project, asOfDate) => {
  const projection = projectAt(project, asOfDate);
  // Keep the active project readable first and the compressed, opaque
  // historical payload at the very end of a manually inspected JSON file.
  const { versionHistory, ...current } = project;
  return {
    ...current,
    schemaVersion: 1,
    currency: 'EUR',
    humanReadableSnapshot: {
      // Informational only: the authoritative project is people/items/events/drafts.
      // Valid JSON has no comment syntax, so keep this explanation as metadata.
      note: 'Generated overview for manual reading only. Do not edit this section to change project data; the authoritative values are in people, items and events.',
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
        id: i.id,
        name: i.name,
        number: i.number,
        label: itemDisplayName(i),
        currentValue: Math.round(i.value * 100) / 100,
        // Keep the same machine-readable rule as the canonical item-added event.
        valuation: { ...i.runtime.valuation },
        // Optional human description; calculations never read this text.
        valuationDescription: valuationLabel(i.runtime.valuation),
        tags: i.tags || [],
        shares: Object.fromEntries(i.shareRows.map(r => [r.personName, r.units]))
      }))
    },
    ...(versionHistory ? { versionHistory } : {})
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
