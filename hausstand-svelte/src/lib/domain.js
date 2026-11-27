import { applyItemNumbers, collectItemNumbers } from './itemNumbers.js';
import { requireShareEventFormat } from './shareUnits.js';
import { purchaseEventFieldsValid } from './purchaseFinancing.js';
import { nowISO, todayISO } from './util.js';
import { formatMoney, formatPercent } from './i18n.js';

export const money = formatMoney;
export const pct = formatPercent;

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
  return applyItemNumbers(p);
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
  const successors = new Set(value.items.filter(i=>i.predecessorItemId).map(i=>i.id));
  if (value.events.some(e=>e.type==='item-added' && (!purchaseEventFieldsValid(e) ||
      (!successors.has(e.itemId) && !Object.hasOwn(e,'purchaseContributionsCents'))))) {
    throw new Error('Nicht unterstütztes Projektformat. Bitte eine aktuelle Hausstandsliste-Projektdatei öffnen.');
  }
  collectItemNumbers([value]); // Reject conflicting explicit identities before import.
  return requireShareEventFormat(value);
};
