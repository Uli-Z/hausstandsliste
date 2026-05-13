export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const nowISO = () => new Date().toISOString();
export const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
export const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
export const parseTags = value => String(value || '').split(',').map(x => x.trim()).filter(Boolean);
export const dateDE = iso => {
  if (!iso) return '–';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(d);
};
export const dateTimeDE = iso => iso ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '–';
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
export const eventDates = project => (project.events || []).map(e => e.date).filter(Boolean).sort();
