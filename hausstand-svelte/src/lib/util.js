import { formatDate, formatDateTime } from './i18n.js';
export const todayISO = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const nowISO = () => new Date().toISOString();
export const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
export const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
export const parseTags = value => String(value || '').split(',').map(x => x.trim()).filter(Boolean);
export const dateDE = formatDate;
export const dateTimeDE = formatDateTime;
export const addDays = (iso, days) => {
  const d = new Date(`${iso || todayISO()}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const yearsBetween = (start, end) => {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, (b - a) / (365.2425 * 24 * 60 * 60 * 1000));
};
export const byDateOrder = (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.order ?? 0) - (b.order ?? 0);

// New events should be appended AFTER every existing event on their effective
// date, even for imported histories whose order lies in the future. This is
// important for backdated share edits as the end-of-day preview includes all
// existing events at that date. Existing order fields are never rewritten.
export const nextEventOrder = (project, date) => {
  const maxOnDate = (project?.events || []).reduce((maximum, event) => {
    if (event?.date !== date || !Number.isSafeInteger(event.order)) return maximum;
    return Math.max(maximum, event.order);
  }, 0);
  return Math.max(Date.now(), maxOnDate + 1);
};
export const eventDates = project => (project.events || []).map(e => e.date).filter(Boolean).sort();

export const validMoney = value => typeof value === 'number' && Number.isFinite(value) &&
  value >= 0 && Number.isSafeInteger(Math.round(value*100)) && Math.abs(value*100-Math.round(value*100)) <= 1e-7;
