# Hausstandsliste — development guidance

**Product:** Hausstandsliste — Shared Ownership Tracker. Main development language: English. The UI supports English/German localization and browser-language detection (Q13 final acceptance pending). Do not translate persisted schema or event identifiers.

## Single supported application

- Application directory: `hausstand-svelte/`.
- **Only UI:** `ui-v3/App.svelte` and `ui-v3/`. Shared components are under `src/components/`; the shared domain/store modules are under `src/lib/` and `src/stores/`.
- **Only current project file schema:** `schemaVersion: 1` with readable top-level project data and embedded `versionHistory` (`portable-v1`, gzip/Base64, SHA-256). File imports explicitly reject unsupported schemas. **Do not add prototype/UI V1/UI V2 or historical file-format migration paths.**
- Two delivery artifacts from the same UI: `dist/hausstand-standalone.html` (offline, no server) and `dist/hausstand.php` (PHP API embedded). GitHub Pages serves the offline UI at the repository root.
- The PHP server stores only the **current encrypted project file** with atomic technical revision pointer, checkout lease and conflict protection. Historical business snapshots are **inside the encrypted project file**, never a second PHP archive or separate history API.
- GitHub and public Pages must never contain real household project data, passwords, private storage contents, or configuration secrets.

## Invariants

1. Jointly owned belongings, relative share units, and changes over time are the core purpose. Do not turn the app into an expense/bank transfer service.
2. Ownership is projected from dated events (`projectAt()`). Financial positions are projected from the same events (`ledgerAt()`); claims and personal balances are **derived**, not separately stored paid/unpaid rows.
3. A completed payment is an independent dated counterclaim event with payer, recipient and amount. It is **not** bound to a purchase. Partial and overpayments remain actual historical facts.
4. Group-wide payment routes are proposals and require mutual agreement. Distinguish `paid` from noncash `external`/`waived`.
5. Browser edits must go through the central store and respect readonly/lease rules. All frontends, including the Node CLI, must use the same pure `projectMutationProblem(before, after)` transaction guard and shared domain event factories in `src/lib/`. Extract any UI-only business operations into shared modules before exposing them in the CLI. Do not duplicate financial mathematics, date validation, event replay, file-format validation, save/archive logic or mutation rules. Only presentation, argument parsing, I/O and frontend-specific permissions/session state belong in adapters. Never silently modify historical payment amounts when an earlier purchase changes.
6. Preserve historical **event** calculations (date/order), but **not unsupported old file formats**.
7. Save must be explicit. Local means a new download, never writing back to an imported file; encrypted online means confirmed upload. Only an online project has a remote identity; a separate backup does not mark online changes saved. A temporary browser working copy is not a durable saved file. Restore from the embedded archive loads an unsaved working state.
8. Keep protected projects and their complete archived history encrypted; never cache their plaintext in `localStorage`.
9. Keep the UI minimal and responsive; explanations belong in contextual help. Warn clearly about saving, historical as-of dates, and factual payment confirmation.

## Checks

```bash
cd hausstand-svelte
npm ci
npm run check:js
npm test
npm run build:single
node scripts/check-standalone.mjs
npm run build:php
php -l dist/hausstand.php
node server-php/smoke.mjs
```

After every change, inspect the GitHub Actions runs for the exact commit. CI success is not a substitute for a real mobile browser, two-browser PHP, download/reimport, large archive or security test. Maintain the [prioritized to-do list](docs/WG-PRAXIS-TODO.md).

## References

- [Architecture](docs/ARCHITECTURE.md)
- [Communal settlement](docs/FEATURE-COMMUNAL-SETTLEMENT.md)
- [Portable in-file history](docs/FEATURE-PORTABLE-VERSION-HISTORY.md)
- [Build and hosting](docs/BUILD-VARIANTS.md)
- [Security](docs/SECURITY-AND-ENCRYPTION.md)
- [Terminology and future localization](docs/LANGUAGE-AND-TERMINOLOGY.md)

**Verification:** Q03–Q05 automated browser acceptance has passed for the documented scenarios. Q06, Q11, Q13 and later UI changes still have outstanding acceptance tasks; see the prioritized to-do list for exact status. Browser QA is intentionally manual; do not trigger it on every commit. Q10 time travel and Q12 session Undo/Redo are implemented.
