import { nowISO, todayISO } from './util.js';

export const money = value => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
export const pct = value => new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value) || 0);

export const emptyProject = () => ({
  schemaVersion: 1,
  appVersion: '0.7.0-svelte',
  currency: 'EUR',
  community: { name: 'Hausgemeinschaft' },
  humanReadableSnapshot: { generatedAt: nowISO(), asOfDate: todayISO(), summary: [], people: [], items: [] },
  people: [],
  items: [],
  events: [],
  drafts: []
});

export const normalize = raw => {
  const base = emptyProject();
  const p = { ...base, ...(raw || {}) };
  p.community = { ...base.community, ...(raw?.community || {}) };
  p.people = Array.isArray(raw?.people) ? raw.people : [];
  p.items = Array.isArray(raw?.items) ? raw.items : [];
  p.events = Array.isArray(raw?.events) ? raw.events : [];
  p.drafts = Array.isArray(raw?.drafts) ? raw.drafts : [];
  p.currency = 'EUR';
  return p;
};

export const shareTotal = shares => Object.values(shares || {}).reduce((sum, value) => sum + (Number(value) > 0 ? Number(value) : 0), 0);
export const normShares = shares => Object.fromEntries(Object.entries(shares || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));

/**
 * Opening a file is deliberately strict: there is only one supported project
 * format. Internal domain fixtures and new in-memory projects are normalized
 * separately, but old exported file schemas are not migrated.
 */
export const requireProjectFile = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schemaVersion !== 1
      || value.currency !== 'EUR'
      || !value.community || typeof value.community.name !== 'string'
      || !Array.isArray(value.people) || !Array.isArray(value.items)
      || !Array.isArray(value.events) || !Array.isArray(value.drafts)
      || typeof value.lastSavedAt !== 'string'
      || !Number.isFinite(Date.parse(value.lastSavedAt))
      || value.versionHistory?.format !== 'portable-v1'
      || !Array.isArray(value.versionHistory.entries)) {
    throw new Error('Nicht unterstütztes Projektformat. Bitte eine aktuelle Hausstandsliste-Projektdatei öffnen.');
  }
  return value;
};
