# Product language and terminology

**Product:** Hausstandsliste  
**English descriptor:** Shared Ownership Tracker  
**Decision date:** 23 November 2026  
**Status (23 November 2026):** Core V3 UI internationalization is implemented, with browser-locale detection, browser-local manual override, English fallback, locale-aware formatting and regression tests. Most views and dialogs are translated; remaining dynamic/domain/server messages and cross-browser accessibility acceptance are tracked as [Q13](WG-PRAXIS-TODO.md).

## Positioning

Hausstandsliste tracks **jointly owned belongings and changes in ownership**. It is **not** a shared expense tracker, household bookkeeping system, banking tool, or generic asset-management suite.

Use the public-facing heading **Hausstandsliste — Shared Ownership Tracker**. Keep the German proper name as the product identity across languages; translate supporting copy instead.

Suggested short description:

> Track jointly owned belongings, manage ownership shares, and settle balances when ownership changes.

Suggested longer description:

> Hausstandsliste is an open-source, local-first shared ownership tracker for households, flatshares, and other groups who jointly own belongings.

The descriptor **Shared Ownership Tracker** is intentionally descriptive; no separate English product name is introduced.

## Canonical terminology

| Concept | English (canonical) | German |
| --- | --- | --- |
| Item | Item / belonging | Gegenstand |
| People / members | People | Personen |
| Joint ownership | Shared ownership / co-ownership | Gemeinsames Eigentum |
| Share of an item | Ownership share | Eigentumsanteil |
| Share change / transfer | Ownership transfer | Anteilsübertragung |
| Item value at a date | Current value / value at date | Zeitwert / Stichtagswert |
| Financier | Person who financed the item | Finanzierende Person |
| Derived claim | Claim | Forderung |
| Person's net position | Personal balance | Persönlicher Ausgleichssaldo |
| Suggested transfer of money | Settlement suggestion | Ausgleichsvorschlag |
| Actual historical payment | Recorded payment | Dokumentierte Zahlung |
| Non-cash adjustment | Non-cash settlement / waiver | Nichtbarer Ausgleich / Erlass |
| Timeline | Activity / timeline | Änderungen / Verlauf |
| Past state | History / as-of date | Historie / Stichtag |
| Stored versions | Version history | Versionshistorie |
| Save/export | Save / export | Speichern / Exportieren |

Terminology rules:

- **Ownership transfer** changes shares; a **payment** does not.
- **Claim** means a derived financial consequence of a dated ownership event, not a separately persisted invoice or paid checkbox.
- **Personal balance** means the consolidated position of a person in a group whose members have agreed to shared netting. It is not automatically proof that an individual legal claim has been settled.
- A **settlement suggestion** is not an executed or recorded payment. Buttons used to record money must explicitly state that the money has *already been paid*.
- The product is not a `shared expense app`; avoid `expense` as the primary product noun.
- Prefer ordinary human-readable UI labels; avoid long explanatory paragraphs, badges, and technical ledger jargon in normal views. Put nonessential explanations behind contextual help.

## Internationalization design (Q13, in progress)

1. **Canonical authoring language:** English for new documentation, product text, UI translation keys, accessibility labels, and developer-facing descriptions.
2. **Supported locales in the first release:** `en` (fallback/default) and `de`. Detect German from `navigator.languages` / `navigator.language` when the primary language subtag is `de` (including `de-DE`, `de-AT`, and `de-CH`); otherwise use English. Use browser APIs only at runtime, never during build or module evaluation where unavailable.
3. **Manual selection:** expose a discreet Language / Sprache control in Settings (English, Deutsch, Automatic); manual choice overrides browser detection, survives reload, and is stored locally per browser. Keep language preference separate from ownership project data, so importing/sharing a project does not unexpectedly change every collaborator's locale.
4. **No split sources:** introduce one translation-key mechanism and complete `en`/`de` dictionaries. UI V3, classic/shared components, dialogs, help popovers, warnings, empty states, export dialogs, and accessible `aria-*` labels must use it. Older UI V2 may share the implementation or remain explicitly deprecated; do not ship a half-translated main build.
5. **Language metadata:** update the live document's `<html lang>`, page title, descriptions, and accessible content when the active locale changes. Until the actual UI is translated, entry documents correctly remain `lang="de"`; an English descriptor in a title does not make the page English.
6. **Formatting:** use locale-aware number, currency, and display-date formatting, plus reliable parsing for both decimal comma and decimal point where appropriate. Persisted dates remain ISO and financial calculations remain integer cents; a locale switch must not alter values or event order. Guard date/timezone boundaries and historical as-of-date selection.
7. **Fallback and quality:** missing keys fall back to English (not a blank label), report missing translations in tests, and cover pluralization, dynamic names, responsive widths, keyboard interactions, screen readers, and interpolation safety. No external translation service or network requirement.
8. **Distribution parity:** standalone HTML/GitHub Pages and the configured PHP build must select languages identically, including offline. Only the presentation layer is localized; no backend protocol or project schema migration is implied.

## Compatibility and documentation migration

Do **not** rename existing `hausstand-*` release filenames, PHP endpoints, JSON keys, event types, `localStorage` keys, schema versions, cryptographic envelope identifiers, or historical project values to match the English title. Those identifiers are part of compatibility and may be handled separately only with an explicit migration.

The main `README.md` and the Svelte README are now authored in English. The central architecture, build, deployment, security and storage references are maintained in English (Q08). Historical UX/feature notes and the German working backlog may retain their original language. The prioritized to-do list is the current source for implementation and verification status.

## Implementation notes (23 November 2026)

- Language preferences are saved as `hausstand-language` in browser local storage, not in the ownership project, the portable archive, or PHP backups.
- Use `src/lib/i18n.js` for stable English/German translation keys, `$translate(key)` in Svelte, and the shared formatting helpers for amounts and dates.
- Main application, dialogs and component translation is implemented for the core interface; final message coverage remains open; the existing domain schema and settlement arithmetic are unchanged.
- Chromium browser checks include English automatic selection, switching to German, preference surviving reload, and no language property in exported project data. These checks are in `tests/browser-qa.mjs`.
- Pending closure: audit all dynamic messages, error paths and plurals; verify complete English mobile and screen-reader experience and a second browser engine before closing Q13.
