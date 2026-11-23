# UI concept — Hausstandsliste V3

**Status:** Implementation-ready proposal, not yet implemented or approved as a shipped UI.  
**Date:** 23 November 2026  
**Basis:** [32-screen browser/UX audit](UX-AUDIT-2026-11-23.md), the existing Svelte V3 screens, the [product terminology](LANGUAGE-AND-TERMINOLOGY.md), and the [prioritized tasks](WG-PRAXIS-TODO.md).  
**Scope:** One shared interface for standalone HTML / GitHub Pages and the PHP version. No domain-model, file-format, valuation, or settlement-mathematics changes.

## 1. Product direction and decisions

**Keep the overview dashboard.** Its four current-state numbers, four quick-action tiles, direct settlement suggestions and recent changes are a strength, not a problem to eliminate. It answers both "Where do we stand?" and "What can I do now?" in one place. Keep its recognizable visual structure, balanced cards, restrained teal accents, and desktop sidebar/mobile bottom navigation.

The improvement is **progressive disclosure in workflows and detail pages**, *not* turning the start page into a bare launcher. A useful summary stays visible; complex options stay available one level deeper.

### Non-negotiable principles

1. **Objects and ownership first.** The product is not a shared-expense app. "Pay", "waive" and "transfer ownership" remain distinct actions.
2. **Current state before mechanisms.** Show the value, each person's share, what remains to settle, and a concrete next action. Do not lead with ledger algorithms or depreciation parameters.
3. **One clear primary action per task**, but several legitimate entry points are acceptable. A dashboard quick action and a list-page action can lead to the same dialog; redundant *adjacent* actions in the same screen are not useful.
4. **Fewer choices at a time, not fewer capabilities.** Put advanced valuation, bulk transfers, JSON/debug views and uncommon maintenance under sensible disclosure controls.
5. **Financial meaning is never hidden.** Always make clear whether a transfer changes ownership, creates/changes a balance, or merely records a payment or non-cash adjustment; do not promise money was actually transferred.
6. **History and money remain trustworthy.** Existing recorded payments do not mutate when valuations or purchase values are edited; overpayments can reverse balances; dates and time travel remain explicit. Preserve all current event semantics and the embedded portable version archive.
7. **Safety warnings are not decoration.** Plaintext export, data-loss and read-only/conflict warnings stay visible when relevant. No irreversible or financially consequential action without an intelligible confirmation.
8. **English canonical, German localized.** Code and canonical docs in English. UI samples below use German first for review, with English pairs. Use existing translation/formatting helpers and respect browser language.
9. **No decorative tags, badges or long explanations.** Use direct labels, concise summaries, and help only for genuine uncertainty.

## 2. Information architecture: keep the familiar navigation

| Navigation (DE / EN) | One main question answered | First visible action | Secondary / behind disclosure |
| --- | --- | --- | --- |
| Überblick / Overview | What do we own, and what is outstanding? | Four quick-action tiles | Detailed history, formulas |
| Gegenstände / Items | What belongs to the group? | Gegenstand hinzufügen / Add item | Filters, archived items, valuation details |
| Personen / People | Who participates and what is their position? | Person hinzufügen / Add person | Departures, permanent deletion, detailed balance derivation |
| Geld & Ausgleich / Money & settlement | Who should settle how much with whom? | Ausgleichen / Record a settlement, on each suggestion | Manual settlement, source events, non-cash adjustments |
| Änderungen / Activity | What happened and when? | Open an event | Editing, historical details |
| Sichern & Teilen / Save & share | How do I save, open or share this project safely? | One context-sensitive Save action | Encrypted exports, archive restore, online management |
| Einstellungen / Settings | Which personal preferences and project options exist? | Language | Technical JSON, reset and security |

Desktop: keep the permanent sidebar. Mobile: keep **Start / Dinge / Personen / Geld / Mehr** in the bottom navigation, including safe-area spacing; "Mehr" holds Activity, Save & share and Settings. Do not introduce new top-level destinations for calculations, payments or archives.

### Global header

- A **single sticky header** displays the community/project name (truncate long names with a full-name accessible label), active time-travel state, Undo/Redo controls and a context-sensitive Save button.
- Normal mode: compact "Heute / Today" date trigger (not a second full-width bar). Active time travel: visible, bold **Stichtag: DD.MM.YYYY / As of ...** plus "Heute / Today" reset; previous/next date controls in the popover. On mobile, the selected date must remain readable while scrolled; a two-row header is permissible *only in the active time-travel state* when necessary.
- The Save action label describes the **real operation**: file download in local mode versus server commit in an editable online project. In an online read-only view, do not suggest that a server write is possible.
- Keep a small dirty/saved status, not a long sentence; show exact explanation only on demand. Errors persist until dismissed, successes disappear.
- Buttons and the header may not cover forms or the mobile bottom navigation. One header Save button does not imply that local cached data are already securely backed up.

## 3. Overview dashboard — deliberately preserve its usefulness

**Preserve, in this order:**

1. **Four metrics:** \`Gemeinsamer Bestandswert\` / Total current value, \`Gegenstände\` / Items, \`Personen\` / People, \`Noch auszugleichen\` / Outstanding balance. These represent the **selected as-of date**, including historical/future views. Preserve all four even on mobile.
2. **Four useful quick-action tiles:** \`Gegenstand hinzufügen\` / Add item, \`Anteile übertragen\` / Transfer shares, \`Person hinzufügen\` / Add person, \`Daten sichern\` / Back up project. Keep their SVG icons and short subtitle (maximum one concise line when possible).
3. **Ausgleichsvorschläge / Settlement suggestions:** readable \`Ben → Anna · 100,00 € · Ausgleichen\`; show up to three recommendations by default (current five is acceptable on desktop if it does not overwhelm). If more, \`Alle ansehen\`. Direct settlement from the dashboard must remain.
4. **Letzte Änderungen / Recent changes:** last five dated events, with a direct link to the full timeline.
5. **Entwürfe / Drafts:** only when drafts exist. When none exist, do **not** reserve a large empty card. Other content expands to use the space.

**Remove only real redundancy:** the separate top-right \`+ Gegenstand hinzufügen\` button on the *overview* duplicates the first quick-action tile. Keep that button on the Items page. If an empty project needs onboarding, show "First add a person" prominently, not four inapplicable actions.

**Do not** remove the four KPI cards, the quick-action board or settlement suggestions; this would undermine the user's preferred at-a-glance dashboard.

#### Desktop sketch (structure, not pixel-exact art)

\`\`\`text
Project  [Today / selected date]             [Undo Redo] [Save]
Overview
[ Total value ] [ Items ] [ People ] [ Outstanding balance ]

[ What would you like to do? ]    [ Settlement suggestions            ]
[ Add item   ][ Transfer shares ]    Ben → Anna   100 €   [Settle]
[ Add person ][ Back up data   ]    Clara → Anna  100 €   [Settle]
                                   [All balances]

[ Recent changes                       ]    [Drafts, ONLY if present]
\`\`\`

#### Smartphone sketch

\`\`\`text
Project      [Date] [Undo] [Save]     (sticky)
Overview
[ Value        ][ Outstanding ]
[ Items        ][ People      ]      (same four metrics)
[ Add item     ][ Transfer    ]
[ Add person   ][ Back up     ]
Settlement suggestions
  Ben → Anna    100 €  [Settle]
Recent changes
Drafts (only if there are drafts)
[ Start | Things | People | Money | More ]  (fixed)
\`\`\`

The mobile KPI order may differ to put outstanding money alongside value, but *do not* drop any metric. Responsive test at 320, 375, 390, 768, 1280 px: no horizontal overflow, no overlapping persistent bars; key actions remain accessible through normal scrolling.

## 4. Other screen specifications

### 4.1 Items listing (\`InventoryView.svelte\`)

- Top: "Gegenstände" and one \`+ Gegenstand hinzufügen\` button.
- Each item card primarily shows **name, current value, ownership summary** (e.g. "3 Beteiligte"), with optional note or one category line. The entire card or a clear "Details" action opens the item; do not duplicate both full-card click and a giant "Details" button unless accessibility requires an explicit target.
- Remove the per-card technical valuation label ("constant", "linear over 6 years") from the default listing. That information remains on the item detail and inside valuation options.
- Search should be easily available for non-trivial inventories. Conditional category filter only when at least two meaningful category choices exist (or when the user has filtered), and result count only when filtering/search is active. Do not show "1 / 1" just to fill space.
- Archive: when empty, no large empty panel; with archived items, a compact \`Frühere Gegenstände (n)\` disclosure at the end. Existing items/archived items still findable.
- Remove the separate, usually empty "Anteile ändern" callout from this page: the dashboard transfer tile and item detail cover the functionality.
- Large inventories should support search with no heavy animations and retain focus/scroll after opening and returning from detail.

### 4.2 People listing (\`PeopleView.svelte\`)

- Keep person name, value of owned shares, and if non-zero an explicit positive/negative settlement amount (\`Noch zu erhalten\` / \`Noch auszugleichen\`).
- Retain the item count in small type, but shrink repeated card spacing; hide the "3 / 3" counter when no search is active.
- Show inactive/departed status as unobtrusive text only when it matters, never a row of badges.
- Click opens the profile; a single main action "Person hinzufügen". Search should remain accessible for larger lists.

### 4.3 Item detail (\`ItemDetail.svelte\`)

- Exactly **one** back control, returning to the last appropriate listing, not a second "Back to overview" breadcrumb.
- Hero: item name, value, share summary, optional description. Valuation in a compact \`Wertentwicklung: gleichmäßig über 6 Jahre\` detail/disclosure, not a third large KPI competing with value.
- Main content: \`Wem gehört wie viel?\` ownership table/list, with units + percentages + money values still accessible. Primary action **\`Anteile ändern\`** adjacent to ownership.
- Secondary \`Bearbeiten\` (name/metadata), \`Ersetzen\`, \`Beenden\` grouped under \`Weitere Aktionen\`. Preserve clear warnings before end/replacement.
- \`Finanzierung und Ausgleich\` and \`Änderungen\`: compact sections, expanding for source transactions and event editing. Time-travel future events remain visible as future records, not included in as-of values.

### 4.4 Person detail (\`PersonDetail.svelte\`)

- Hero: person name, **net balance with direction** and value of owned belongings; avoid a redundant KPI wall.
- The owned-items list and direct \`Ausgleichen\` proposals remain immediately reachable.
- \`So setzt sich der Saldo zusammen\` expands the existing historical breakdown; never silently replace the net calculation with a list of individual "debts".
- Secondary actions grouped: rename, move out/rejoin, transfer all shares, dissolve/remove shares. Make the consequences clear before destructive actions.
- One back control. On mobile, do not place four large action buttons above all the actual holdings/balances.

### 4.5 Money & settlement (\`LedgerView.svelte\`)

Show in this hierarchy:

1. \`So könnt ihr ausgleichen\` — each row \`Ben zahlt an Anna | 100,00 € | Ausgleichen\` (wording is a **suggestion**, not a transaction status).
2. \`Saldo je Person\` — net credits/obligations; tap to reveal the exact \`BalanceBreakdown\` and navigate to person detail.
3. \`Zahlung erfassen\` — secondary/manual action; does **not** require selecting an existing individual debt.
4. \`Dokumentierte Zahlungen\` and \`Woher die Beträge stammen\` — collapsed history disclosures, still fully editable/auditable according to event rules.

Avoid a redundant extra \`Geld ausgleichen\` subheading and do not place "Transfer shares" as the primary finance-page action. Ownership changes belong to Items, item details and the Overview shortcut.

**Crucial wording:** an \`Ausgleichen\` button opens a **recording form** for money that was actually paid; it does not send a payment. The final action must clearly mean "Zahlung als erfolgt erfassen / Record payment as made". The form allows partial, exact and overpayments, including reverse balances, without silently capping to a suggested amount. Non-cash waivers/offsets remain explicitly separate options.

### 4.6 Activity / history (\`Timeline.svelte\`)

- Change large repetitive cards into **compact chronological rows**, newest first (including future events and equal dates deterministically).
- Each row contains a type icon + short action + affected person/item + event date, e.g. \`[box] Kühlschrank angeschafft · 02.01.2025\`.
- Entire accessible row opens its appropriate event editor when editable; read-only events open a details view. A separate Edit button is unnecessary where a row already does the job. Keyboard Enter/Space + visible focus and touch target >=44 px.
- No persistent explanatory subtitle \`Über Bearbeiten kannst du ...\`. Future events carry a text marker \`Nach dem Stichtag\` when needed; the selected date separator stays legible.
- Do not conflate **event editing** with **restoring a saved project version**; these are different tasks.
- Preserve historical timeline and financial causality. Activity is not a second domain-ledger.

### 4.7 Settings

- One compact \`Sprache / Language\` selector with \`Automatisch (Deutsch)\` or \`Automatic (English)\` showing the *resolved* language, not an opaque "Auto".
- \`Aktuelles Projekt\` in 1–2 compact rows, with project name/file name and editing status (also present in Save & share, so avoid repeating a giant card).
- One collapsed \`Erweiterte Optionen / Advanced\` containing technical JSON view and \`Neues Projekt beginnen\` / Reset. Confirmation for reset explicitly identifies unsaved work and available backup.
- No duplicate heading "Sprache" followed by an identical label without purpose.

## 5. Transaction dialogs: user stories, fields and consequences

### 5.1 Add item (\`DialogRouter.svelte\` + \`ShareEditor.svelte\`)

The default path should be a short, single-screen *task* whenever possible, not a compulsory multi-page wizard.

**Default visible fields, in order:**

1. \`Datum\` (prefilled with the selected as-of date, explicitly editable).
2. \`Was wurde angeschafft?\` (item name).
3. \`Anschaffungswert\` (amount).
4. \`Wem gehört es?\` (people and shares, plus a convenience \`Gleich aufteilen\` when multiple selected). Show resulting percentages, validate nonzero total.
5. \`Wer hat es bezahlt?\` (person, or "Keine Finanzierung zuordnen" if no claim is to be recorded). **Do not** automatically equate financing with ownership.

Below: compact line \`Wertentwicklung: Gleichmäßig über 6 Jahre · Ändern\` followed by collapsible \`Weitere Angaben\` (valuation type + duration/rate/minimum, categories, note). Retain the *existing* valuation default unless a separate domain/product decision approves changing it. No stealth reset when expanding/collapsing. Optional fields must survive draft saves and reload.

A tiny effect summary uses existing projection/ledger logic: \`Nach dem Erfassen: 3 Eigentümer · Wert 300 € · möglicher Ausgleich ...\`, **only when valid/knowable**. A statement is a preview, not a payment record. If missing financing: communicate "Kein Ausgleich aus diesem Kauf", not a confusing empty value.

Footer: \`Abbrechen\` / \`Als Entwurf speichern\` (secondary) / \`Gegenstand anlegen\` (primary). On mobile the footer is sticky, without covering input fields. Invalid values block only the final action and show a short adjacent reason.

### 5.2 Share changes and redistribution (\`RedistributionDialog.svelte\` and \`ShareEditor.svelte\`)

**Default path:**

A. **Was soll sich ändern?** Choose item(s) and new people/shares. An option to transfer **all shares of a person** is available via a secondary task selector, not three competing bulk buttons. When launched from one item/person, preselect the known context.

B. **Was bedeutet das?** Live preview: \`Anna −100 € Eigentumswert; Ben +100 €\` and the possible resulting *net settlement* by person, using existing calculations. The preview must not label an eventual balance as a completed payment. Add short choice \`Mit Wertausgleich\` vs \`Ohne Wertausgleich (Schenkung/Korrektur)\`, with an accessible help description. The effect of this choice is visible before saving.

C. **Bestätigen:** Show effective date (prefilled from current as-of date and freely editable), compact description if relevant, and the affected item count. \`Anteile ändern\` commits a dated event. \`Als Entwurf sichern\` is secondary.

Hide by default: 3 batch shortcuts, a filter for one item, Markdown export, large neutral previews, and advanced financial accounting details. Put legitimate bulk actions in \`Weitere Aktionen\`, Markdown under \`Exportieren\`. On 375 px, task and consequence form a vertical flow; desktop may show adjacent panes **only when both have meaningful content**.

If chosen date is before a participant joins or before the item exists, explain the exact issue and disable confirmation rather than silently changing people. A change in valuation effective date must reproject the available people/items correctly.

### 5.3 Settlement entry (\`SettlementDialog.svelte\`)

- Keep already good shape: payer, recipient, amount, payment date and optional note.
- If opened from a suggestion, prefill payer/recipient/amount **without asserting the payment occurred**. In an editable as-of view, default to its date; editing an old event retains the event's saved date.
- One concise persistent line before confirmation: \`Nur erfassen, wenn diese Zahlung bereits stattgefunden hat.\` / "Record only after this payment actually occurred." It may be accompanied by a compact predicted balance effect.
- \`Weitere Ausgleichsarten\` holds non-cash settlement/waiver, with distinct labels; never silently turn them into paid transfers.
- Primary action for a real payment: \`Zahlung als erfolgt erfassen\`. Partial payments, excess payments, invalid amount rejection, duplicate rapid submissions and reverse credits continue to work as before.
- Avoid the present ambiguous additional heading \`Ist diese Zahlung bereits erfolgt?\` when no question/choice follows it.

### 5.4 Add/edit person, exit/re-entry, item end and event edits

- **Add person** is already good. Keep name + effective date, plus a short duplicate-name error. Do not add financial fields.
- **Exit/re-entry:** date and short optional reason; show whether ownership/shares remain untouched, with separate action if a transfer is needed. Do not silently redistribute.
- **Item replacement/end:** current item and consequences, effective date, optional reason; explicit confirmation for archival and changes affecting values.
- **Edit existing event:** show the *stored* original date (never replace it merely because time travel is active), difference/preview and save; preserve other payments and history.
- Destructive actions should be relegated to a distinct secondary action, not visually equal to ordinary Save.

## 6. Save & share: replace storage architecture in the UI, not the data layer

The present screen is structurally fragmented. Rebuild its information architecture using **the current project as the anchor**. Preserve one in-file \`versionHistory\`, encrypted envelopes, and PHP revision/lease protections; do not introduce a parallel server history or incompatible JSON.

### At-a-glance layout

\`\`\`text
Sichern & Teilen
Aktuelles Projekt: Hausgemeinschaft · Lokal · Ungesicherte Änderungen
[ Projektdatei herunterladen ]  [ Projekt öffnen ]

Weitere Möglichkeiten
  ▸ Datei mit Passwort schützen
  ▸ Frühere Version wiederherstellen
  ▸ Online zusammenarbeiten    (PHP only)
  ▸ Sicherheit & weitere Optionen
\`\`\`

No separate large "Where are my data?" card. Display **one short context-sensitive status** and only the relevant actions.

### State-specific behaviour

| Current mode/state | Main action and label (DE) | Secondary behaviour and guardrail |
| --- | --- | --- |
| Local working copy, no active online checkout | \`Projektdatei herunterladen\` / Download project file | Explicitly tell user *a file was downloaded*, not that the browser copy is a reliable external backup. Keep the plaintext warning visible before unencrypted export. |
| Local password-protected save requested | \`Verschlüsselte Datei herunterladen\` | Ask for password and confirmation in the export flow; no accidental plaintext download when password mode was chosen. |
| Open local file | \`Projektdatei öffnen\` | Detect whether encrypted; ask password *only if needed*. If unsaved changes exist, require explicit Replace / Cancel / Save a copy decision. |
| Online project opened, **read-only** (PHP) | \`Bearbeitung starten\` / Start editing | Do not offer a misleading server Save. Show why unavailable and possible conflict/lease state. Optional local file copy labelled as download. |
| Online project actively checked out (PHP) | \`Änderungen online speichern\` / Save online changes | Commit to server with revision checks; communicate success/revision. Downloading a copy is separate, not implicitly the same action. |
| Online editing conflict or failed save | No false success state; prominent actionable error | Keep local changes; provide understandable conflict resolution / export a copy. Do not auto-overwrite another user's revision. |
| Restore older embedded version | \`Als neuen Arbeitsstand wiederherstellen\` | User sees date and consequence; creates *unsaved current working copy*, never silently rewrites the archived version. |
| New online project (PHP) | \`Online-Projekt erstellen\` under collaboration | Name, password and explicit creation, not mixed into the normal local file action. |
| Password rotation or lease extension | Advanced/security only | Preserve current encryption semantics and confirmation; do not make these primary CTAs. |

Use \`Sichern & Teilen\` as a navigation name for now, but within the screen distinguish **Datei weitergeben** (share a downloaded file) from **Online zusammenarbeiten** (work in a shared server project). "Share" must not imply invitations/permissions that do not exist.

**Concrete flow:** \`Open file → detect format/encryption → ask password if needed → warn if replacing unsaved state → load\`. PHP: \`Select online file → read-only → start editing → modify → save online → end editing\`; ensure changing sections does not discard checkout status. Advanced history: \`Select earlier archive entry → compare date/summary if available → confirm → restore as unsaved\`.

Technical ownership: recompose \`App.svelte\` Save section and \`StorageView.svelte\` into a coordinated **single screen** rather than two independent card trees. Avoid parallel password/filename controls; scope each input to its specific operation. Maintain portable-version archive and crypto code unchanged.

## 7. Layout system and microcopy rules

| Element | Recommended standard |
| --- | --- |
| Main content | Desktop content max ~1180–1280 px; comfortable margins, 16–24 px section gaps; do not force equal-height cards where one has no content. |
| Dashboard | Four KPI cards and four quick actions retained. Desktop columns as currently; mobile 2×2 metric and action grids at >=360 px, 1-column at 320 px if labels become unreadable. |
| Detail pages | Value + main action at top; secondary actions in an overflow menu / disclosure. One back route. |
| Dialogs | Desktop width matched to task (person ~520 px, settlement ~600 px, item ~720 px, multi-item transfer ~960–1080 px); no giant modal for two fields. Mobile full-width or full-height dialogs with scrollable body and fixed accessible footer. |
| Buttons | One strong solid primary action per task, neutral secondary, discreet destructive action only in dangerous context; meaningful icons; minimum touch target about 44×44 px. |
| Help | Only if necessary; \`?\` directly aligned with its label. Keyboard, touch and screenreader accessible. Most help <=2 short sentences; complex math links to a fuller explanation, not a permanent text wall. |
| Financial amounts | Right-aligned/tabular digits; signs **and** direction words (receive vs owe) for accessibility; avoid depending on color alone. |
| Tags and badges | Only for a real state distinction (e.g. archived, historical/future), not technical trivia or decorative section labels. |
| Empty states | One short action-oriented sentence; hide entirely empty secondary dashboard sections. Do not replace warnings with silence. |
| Dates | Locale display; ISO storage. Active as-of date always perceivable, especially for future events and dated forms. |
| Long lists | Search/filter after meaningful content thresholds; keep focus/selection after returning from detail; no full-page overflow. |

### Preferred simple German wording (localized equivalent required)

| Avoid | Prefer | Reason |
| --- | --- | --- |
| \`Forderungen automatisch berechnen\` without context | \`Mit Wertausgleich\` + short preview | Refers to a user-visible consequence |
| \`Einheiten\` as only ownership indicator | \`Anteile\` plus \`33,3 %\`; "Einheiten" in deeper edit | Common language, preserves precise units |
| \`Endgültige Änderung\` | \`Anteile jetzt ändern\` / \`Gegenstand beenden\` | Names the action instead of an opaque permanence label |
| \`Checkout / Lease\` | \`Bearbeitung starten / beenden\` | Explains real workflow |
| \`Ausgleichen\` as if transferring money | \`Zahlung als erfolgt erfassen\` in confirmation | Does not imply a banking service |
| \`Automatisch\` (language selector only) | \`Automatisch (Deutsch)\` | Shows resolved locale |
| \`Wo liegen deine Daten?\` as large persistent card | \`Lokal in diesem Browser\` as a small project status | No separate theory lesson |

## 8. Implementation plan (no large rewrite)

**Phase 1 — layout pruning and dashboard preservation.** Keep overview KPI/action/suggestion/recent sections. Remove only duplicate overview add CTA; conditionally render empty draft/archive cards and unnecessary counters/filters. Remove second Back breadcrumb. Compact person/item tiles and clarify smaller labels. Primarily \`App.svelte\`, \`InventoryView.svelte\`, \`PeopleView.svelte\`, \`ItemDetail.svelte\`, \`PersonDetail.svelte\`, \`design.css\`.

**Phase 2 — forms with consequence previews.** Reorder Add item fields, introduce \`Weitere Angaben\` and share-preview; redesign transfer defaults and financial consequences; streamline settlement confirmation while preserving all validation and dated-event behaviour. Primarily \`DialogRouter.svelte\`, \`ShareEditor.svelte\`, \`RedistributionDialog.svelte\`, \`SettlementDialog.svelte\`. Add UI regression cases, but no schema change.

**Phase 3 — coherent Save & share.** Implement one state-driven screen across \`App.svelte\` and \`StorageView.svelte\`, preserving PHP checkout, encrypted backup, archive and conflict semantics. Align header Save with actual storage mode. Q20 owns this phase.

**Phase 4 — timeline, accessibility and localization polish.** Compact event rows (Q18); help inventory (Q17), modal focus, keyboard controls, long-label i18n and PHP-only states (Q13). Close prior open browser acceptance checks only with actual evidence.

The phases may be implemented as several reviewable commits; **do not change calculation formulas, version history JSON, event IDs, PHP APIs or encryption keys simply for UX**. Avoid repeating the entire cross-browser suite for every commit; keep heavy browser QA manual/on-request.

## 9. Acceptance criteria — testable product behaviour

### Dashboard / visual

- [ ] All four KPI numbers and four quick actions are visible and correct at the selected as-of date; no capability from the existing overview is lost.
- [ ] Settlement suggestions and recent changes remain directly visible, including after navigating back from details.
- [ ] A dashboard with no drafts has no empty Drafts card; with drafts it shows continuing/deleting the correct draft.
- [ ] At 320, 375, 390, 768 and 1280 px there is no horizontal page overflow, clipping of save/date controls, or overlap with mobile navigation.

### Ownership and money

- [ ] Create a 300 € item with three equal owners financed by Anna: own shares 100 € each, resulting personal balances Anna +200 €, Ben −100 €, Clara −100 €. The simpler form must not alter the calculation.
- [ ] Preview vs. commit: changing shares updates displayed preview; choosing paid/without settlement affects appropriate claims, but never creates a fake *payment* event.
- [ ] Partial 60 €, full 100 €, excess payment and later valuation edits preserve actual payment events and correct reverse/net balances.
- [ ] Form dates default to current selected as-of date; editing an existing event leaves its stored date intact. Future events do not change historical balances.
- [ ] A person/item not available on the selected effective date cannot be silently chosen. Invalid values/duplicate saves/read-only actions produce clear local errors and do not mutate the project.

### Files / trust

- [ ] Local download and online save are unmistakably different operations, correctly reported; an unencrypted backup always carries the plaintext warning.
- [ ] Opening plain/encrypted files has one predictable path; encrypted files prompt password only when applicable; unsaved work is never silently overwritten.
- [ ] Online checkout/read-only/conflict/expiry states have the right action and no false success; independent browser contexts preserve conflict protections.
- [ ] Restoring embedded older archive creates unsaved working state; subsequent export and PHP save preserve the portable archive and encryption.

### Accessibility / languages / regression

- [ ] Each dialog has meaningful accessible name, initial focus, keyboard close/focus restoration and non-covered sticky action footer on mobile.
- [ ] Dynamic help can be opened/closed by tap/keyboard, with sufficient target size, good contrast and no orphan help icon.
- [ ] English/German views, date/number formatting, long text and compact 320 px layouts are checked; locale preference remains browser-local and does not enter the project file.
- [ ] Unit/regression tests and both build variants pass. Manually requested real-browser acceptance runs in Chromium, Firefox and WebKit; PHP collaboration tested against a real test server in separate browser profiles.

## 10. Not in scope

No rebranding; no new bank integration, money transfer system, receipts or general expenses; no fundamental replacement of the overview; no inventing new persistent claims/debts; no migration of portable JSON; no new PHP server version-history database; no unnecessary graphical dashboard embellishment. Avoid turning this into a multi-step enterprise app. **Simplification is achieved by better grouping and conditional visibility, not by removing the user's essential current-state overview.**

---

**Related tracked work:** [Q07 (visual audit), Q17 (help), Q18 (timeline), Q20 (save/share), Q13 (i18n) and Q19 (time-travel forms)](WG-PRAXIS-TODO.md). This document is the concrete implementation blueprint; open work remains unchecked until code and browser acceptance confirm it.