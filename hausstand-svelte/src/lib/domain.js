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
  redistributions: []
});

export const normalize = raw => {
  const base = emptyProject();
  const p = { ...base, ...(raw || {}) };
  p.community = { ...base.community, ...(raw?.community || {}) };
  p.people = Array.isArray(raw?.people) ? raw.people : [];
  p.items = Array.isArray(raw?.items) ? raw.items : [];
  p.events = Array.isArray(raw?.events) ? raw.events : [];
  p.redistributions = Array.isArray(raw?.redistributions) ? raw.redistributions : [];
  p.currency = 'EUR';
  return p;
};

export const shareTotal = shares => Object.values(shares || {}).reduce((sum, value) => sum + (Number(value) > 0 ? Number(value) : 0), 0);
export const normShares = shares => Object.fromEntries(Object.entries(shares || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
