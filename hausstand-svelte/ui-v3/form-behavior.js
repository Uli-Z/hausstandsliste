import { parseDecimal } from '../src/lib/i18n.js';
// Eingabeverhalten der UI V3, unabhängig von der Fachlogik.
export const isEnterForSubmit = event => {
  const target = event?.target;
  return event?.key === 'Enter' && !event.repeat && !event.isComposing &&
    !event.ctrlKey && !event.altKey && !event.metaKey &&
    target?.tagName === 'INPUT' &&
    !['date','time','file','checkbox','radio','button','submit'].includes(target.type);
};

export function prepareDialogNumber(event) {
  const input = event?.target;
  if (input?.tagName !== 'INPUT' || input.type !== 'number' || !input.closest?.('.modal')) return;
  // Eine vorausgefüllte Null darf nicht erst gelöscht werden müssen.
  if (input.value === '0') {
    input.dataset.autoClearedZero = 'true';
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (input.value) {
    // Unterstützte Browser markieren beim Fokussieren die ganze Zahl.
    try { input.select?.(); } catch { /* Number-Inputs unterstützen nicht überall Textselektion. */ }
  }
}

export function finishDialogNumber(event) {
  const input = event?.target;
  if (input?.tagName !== 'INPUT' || input.type !== 'number' || input.dataset?.autoClearedZero !== 'true') return;
  delete input.dataset.autoClearedZero;
  // Ohne Eingabe bleibt der ursprünglich vorhandene Wert Null erhalten.
  if (input.value === '') {
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function parseShareInput(value) {
  if (value === '') return null; // Zwischenzustand: das Feld bleibt wirklich leer.
  const parsed = parseDecimal(value);
  return Number.isFinite(parsed) ? parsed : null;
}
