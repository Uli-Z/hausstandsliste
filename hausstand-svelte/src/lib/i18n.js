import { writable, derived, get } from 'svelte/store';

// Browser-local preference: never added to the portable ownership project.
export const LANGUAGE_KEY = 'hausstand-language';
export const dictionaries = {
  "en": {
    "nav.overview": "Overview",
    "nav.items": "Items",
    "nav.people": "People",
    "nav.money": "Money & settlement",
    "nav.activity": "Activity",
    "nav.save": "Save & share",
    "nav.settings": "Settings",
    "nav.home": "Home",
    "nav.things": "Items",
    "nav.cash": "Money",
    "nav.more": "More",
    "language.title": "Language / Sprache",
    "language.help": "This preference is stored only in this browser, not in shared project files.",
    "language.auto": "Automatic",
    "language.english": "English",
    "language.german": "German",
    "app.save": "Save",
    "app.saving": "Saving …",
    "app.clean": "All changes saved",
    "app.dirty": "Unsaved changes",
    "app.undo": "Undo (Ctrl+Z)",
    "app.redo": "Redo (Ctrl+Y)",
    "app.currentProject": "Current project",
    "app.household": "Household",
    "app.openFile": "Opened file",
    "app.editing": "Editing",
    "app.editable": "Editable",
    "app.readonly": "Read-only",
    "app.noFile": "No file selected",
    "app.dateAsOf": "Data as of",
    "app.today": "Today",
    "app.past": "Past state",
    "app.future": "Future state",
    "app.previous": "Previous day",
    "app.next": "Next day",
    "app.first": "First event",
    "app.last": "Last event",
    "app.pickDate": "Choose date",
    "app.itemAdd": "Add item",
    "app.personAdd": "Add person",
    "app.transfer": "Transfer shares",
    "app.settle": "Record settlement",
    "app.backup": "Back up data",
    "app.viewAll": "View all amounts →",
    "app.viewActivity": "View all activity →",
    "app.intro": "Start by adding people.",
    "app.firstPerson": "Add first person",
    "app.totalValue": "Total shared item value",
    "app.activeItems": "Value of all active items",
    "app.inInventory": "Currently owned",
    "app.participants": "Current participants",
    "app.outstanding": "Outstanding settlement",
    "app.sharedBalance": "Shared settlement balance",
    "app.tasks": "What would you like to do?",
    "app.addSomething": "Add something",
    "app.recordItem": "Record a new item",
    "app.split": "Reallocate ownership",
    "app.join": "Move-in or new participation",
    "app.share": "Create a backup or collaborate",
    "app.suggestions": "Settlement suggestions",
    "app.settled": "All settled",
    "app.recent": "What has changed?",
    "app.none": "No changes yet.",
    "app.drafts": "Drafts",
    "app.noDrafts": "No open drafts.",
    "app.continue": "Continue",
    "app.backupTitle": "Create a backup",
    "app.download": "Download backup",
    "app.openBackup": "Open existing backup",
    "app.whereData": "Where is your data?",
    "app.passwordProtected": "Password-protected project",
    "app.localCopy": "Working copy in this browser",
    "app.notExported": "Changes not yet exported",
    "app.noNew": "No new changes since the last backup",
    "app.unencrypted": "not encrypted",
    "app.inspect": "Inspect project data",
    "app.newProject": "Start a new project",
    "app.technicalOpen": "Show JSON data",
    "app.technicalClose": "Hide technical view",
    "app.reset": "Reset project …",
    "people.search": "Search person …",
    "people.searchLabel": "Search people",
    "people.shareValue": "Current value of shares",
    "people.profile": "Open profile →",
    "people.toReceive": "To receive",
    "people.toSettle": "To settle",
    "people.moved": "Moved out",
    "people.inactive": "No longer participating",
    "people.noMatches": "No matches",
    "people.none": "No people yet",
    "people.try": "Try another name.",
    "people.first": "Add the first people before recording shared items.",
    "items.search": "Search item …",
    "items.searchLabel": "Search items",
    "items.category": "Filter by category",
    "items.all": "All categories",
    "items.details": "View shares and details",
    "items.none": "No matching items",
    "items.try": "Change your search or category filter.",
    "items.first": "Record your first item with its value, people and shares.",
    "items.change": "Change shares",
    "items.prepare": "Prepare transfer",
    "items.old": "Previous items",
    "items.noOld": "No previous items yet.",
    "items.show": "View",
    "items.hide": "Hide",
    "items.detailsLink": "View details →",
    "items.dateUnknown": "Date unknown",
    "items.archived": "Archived"
  },
  "de": {
    "nav.overview": "Überblick",
    "nav.items": "Gegenstände",
    "nav.people": "Personen",
    "nav.money": "Geld & Ausgleich",
    "nav.activity": "Änderungen",
    "nav.save": "Sichern & Teilen",
    "nav.settings": "Einstellungen",
    "nav.home": "Start",
    "nav.things": "Dinge",
    "nav.cash": "Geld",
    "nav.more": "Mehr",
    "language.title": "Sprache",
    "language.help": "Die Spracheinstellung wird nur in diesem Browser gespeichert, nicht in der Projektdatei.",
    "language.auto": "Automatisch",
    "language.english": "Englisch",
    "language.german": "Deutsch",
    "app.save": "Speichern",
    "app.saving": "Speichert …",
    "app.clean": "Keine ungespeicherten Änderungen",
    "app.dirty": "Ungespeicherte Änderungen",
    "app.undo": "Rückgängig (Strg+Z)",
    "app.redo": "Wiederholen (Strg+Y)",
    "app.currentProject": "Aktuelles Projekt",
    "app.household": "Hausgemeinschaft",
    "app.openFile": "Geöffnete Datei",
    "app.editing": "Bearbeitung",
    "app.editable": "Bearbeitbar",
    "app.readonly": "Schreibgeschützt",
    "app.noFile": "Keine Datei ausgewählt",
    "app.dateAsOf": "Stand der Daten",
    "app.today": "Heute",
    "app.past": "Vergangener Stand",
    "app.future": "Geplanter Stand",
    "app.previous": "Einen Tag zurück",
    "app.next": "Einen Tag vor",
    "app.first": "Zum ersten Ereignis",
    "app.last": "Zum letzten Ereignis",
    "app.pickDate": "Datum wählen",
    "app.itemAdd": "Gegenstand hinzufügen",
    "app.personAdd": "Person hinzufügen",
    "app.transfer": "Anteile übertragen",
    "app.settle": "Ausgleichen",
    "app.backup": "Daten sichern",
    "app.viewAll": "Alle Beträge ansehen →",
    "app.viewActivity": "Alle Änderungen →",
    "app.intro": "Beginne mit den Personen.",
    "app.firstPerson": "Erste Person hinzufügen",
    "app.totalValue": "Gemeinsamer Bestandswert",
    "app.activeItems": "Wert aller aktiven Gegenstände",
    "app.inInventory": "im aktuellen Bestand",
    "app.participants": "aktuell dabei",
    "app.outstanding": "Noch auszugleichen",
    "app.sharedBalance": "gemeinsamer Ausgleichssaldo",
    "app.tasks": "Was möchtest du tun?",
    "app.addSomething": "Etwas hinzufügen",
    "app.recordItem": "Neuen Gegenstand erfassen",
    "app.split": "Besitz neu aufteilen",
    "app.join": "Einzug oder neue Beteiligung",
    "app.share": "Sicherung erstellen oder gemeinsam arbeiten",
    "app.suggestions": "Ausgleichsvorschläge",
    "app.settled": "Alles ausgeglichen",
    "app.recent": "Was hat sich verändert?",
    "app.none": "Noch keine Änderungen.",
    "app.drafts": "Entwürfe",
    "app.noDrafts": "Keine offenen Entwürfe.",
    "app.continue": "Fortsetzen",
    "app.backupTitle": "Sicherungskopie erstellen",
    "app.download": "Sicherung herunterladen",
    "app.openBackup": "Vorhandene Sicherung öffnen",
    "app.whereData": "Wo liegen deine Daten?",
    "app.passwordProtected": "Passwortgeschütztes Projekt",
    "app.localCopy": "Arbeitskopie in diesem Browser",
    "app.notExported": "Änderungen noch nicht exportiert",
    "app.noNew": "Keine neuen Änderungen seit der letzten Sicherung",
    "app.unencrypted": "nicht verschlüsselt",
    "app.inspect": "Projektdaten ansehen",
    "app.newProject": "Neues Projekt beginnen",
    "app.technicalOpen": "JSON-Daten anzeigen",
    "app.technicalClose": "Technische Ansicht schließen",
    "app.reset": "Projekt zurücksetzen …",
    "people.search": "Person suchen …",
    "people.searchLabel": "Personen durchsuchen",
    "people.shareValue": "Aktueller Wert der Anteile",
    "people.profile": "Profil öffnen →",
    "people.toReceive": "Noch zu erhalten",
    "people.toSettle": "Noch auszugleichen",
    "people.moved": "Ausgezogen",
    "people.inactive": "Nicht mehr dabei",
    "people.noMatches": "Keine Treffer",
    "people.none": "Noch keine Personen",
    "people.try": "Versuche einen anderen Namen.",
    "people.first": "Lege die ersten Personen an, bevor du gemeinsame Gegenstände erfasst.",
    "items.search": "Gegenstand suchen …",
    "items.searchLabel": "Gegenstände durchsuchen",
    "items.category": "Nach Kategorie filtern",
    "items.all": "Alle Kategorien",
    "items.details": "Anteile & Details ansehen",
    "items.none": "Keine passenden Gegenstände",
    "items.try": "Ändere die Suche oder den Kategorienfilter.",
    "items.first": "Erfasse euren ersten Gegenstand – mit Wert, Personen und Anteilen.",
    "items.change": "Anteile ändern",
    "items.prepare": "Übertragung vorbereiten",
    "items.old": "Frühere Gegenstände",
    "items.noOld": "Noch keine früheren Gegenstände.",
    "items.show": "Ansehen",
    "items.hide": "Ausblenden",
    "items.detailsLink": "Details ansehen →",
    "items.dateUnknown": "Datum unbekannt",
    "items.archived": "Archiviert"
  }
};
export function resolveLocale(preference = 'auto', browserLanguages = []) {
  if (preference === 'en' || preference === 'de') return preference;
  const first = Array.isArray(browserLanguages) ? browserLanguages[0] : browserLanguages;
  return String(first || '').split('-')[0].toLowerCase() === 'de' ? 'de' : 'en';
}
export function loadLanguage(storage = typeof localStorage === 'undefined' ? null : localStorage) {
  try { const value = storage?.getItem(LANGUAGE_KEY); return ['en','de'].includes(value) ? value : 'auto'; }
  catch { return 'auto'; }
}
export const languagePreference = writable(loadLanguage());
const userLanguages = () => typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
export const locale = derived(languagePreference, value => resolveLocale(value, userLanguages()));
export function setLanguage(value) {
  const selected = ['auto','en','de'].includes(value) ? value : 'auto';
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LANGUAGE_KEY, selected); } catch {}
  languagePreference.set(selected);
}
export function message(key, lang='en', params={}) {
  const template = dictionaries[lang]?.[key] ?? dictionaries.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g,(match,k)=>Object.hasOwn(params,k) ? String(params[k]) : match);
}
export const translate = derived(locale, value => (key, params) => message(key, value, params));
export const getLocale = () => get(locale);
export const formatMoney = (amount, lang=getLocale()) =>
  new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB',{style:'currency',currency:'EUR'}).format(Number(amount)||0);
export const formatPercent = (fraction, lang=getLocale()) =>
  new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(fraction)||0);
export function formatDate(iso, lang=getLocale()) {
  if (!iso) return '–';
  const date = new Date(String(iso).slice(0,10)+'T12:00:00');
  return Number.isNaN(date.getTime()) ? String(iso) :
    new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB',{dateStyle:'medium'}).format(date);
}
export function formatDateTime(iso, lang=getLocale()) {
  if (!iso) return '–';
  const date=new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) :
    new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(date);
}
// Parse comma or point decimals, optionally using the other separator for grouping.
export function parseDecimal(value) {
  let s=String(value??'').trim().replace(/[\s\u00a0\u202f]/g,'');
  if (!s || !/^[+-]?[\d.,]+$/.test(s)) return NaN;
  const comma=s.lastIndexOf(','), dot=s.lastIndexOf('.');
  if (comma>=0 && dot>=0) {
    const decimal=comma>dot?',':'.',group=decimal===','?'.':',';
    s=s.split(group).join('').replace(decimal,'.');
  } else if (comma>=0) s=s.replace(',','.');
  return /^[+-]?\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN;
}
