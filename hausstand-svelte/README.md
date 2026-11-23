# Hausstandsliste — application

This is the sole active implementation of **Hausstandsliste — Shared Ownership Tracker**, using Svelte/Vite. The same `ui-v3/` interface and shared domain modules are built into a standalone offline HTML file and a separately configured single-file PHP release.

## Development and builds

```bash
cd hausstand-svelte
npm ci
npm run dev
npm run check:js
npm test
npm run build:single
npm run build:php
php -l dist/hausstand.php
node server-php/smoke.mjs
```

- `npm run dev` serves the single current UI.
- `npm run build:single` produces `dist/hausstand-standalone.html`. This file needs no PHP backend.
- `npm run build:php` produces `dist/hausstand.php` with the same interface and a server API. Its operator must configure the private storage directory and HTTPS.
- `dist/` is generated and not committed. The CI workflows verify both distributions and publish the offline UI at the **GitHub Pages root**.

## Source layout

- `ui-v3/`: the only interface, dialogs, history picker and responsive styles.
- `src/components/`: reusable components used by that interface, including settlement entry, HelpTip, shared balance and redistribution widgets.
- `src/stores/projectStore.js`: source project, last saved file, edit state, as-of date and controlled changes.
- `src/lib/projector.js`: historical ownership projection from dated events.
- `src/lib/ledger.js`, `claimSettlement.js`: personal net positions and independent counterclaim/payment events.
- `src/lib/redistribution.js` and `valuation.js`: ownership changes and depreciation.
- `src/lib/persistence.js`, `versionHistory.js`, `crypto.js`: local working copy, **embedded compressed file history**, and browser-side encryption.
- `src/lib/sessionUndo.js`: bounded in-memory undo/redo and keyboard shortcut policy; never serialized into project files.
- `server-php/backend.php`: one encrypted current document per project, technical revision checking, checkout/lease and optional encrypted email copies.
- `tests/`: Node domain tests and PHP smoke test.

## File format and safety

Only the **current portable project schema** is accepted for file import. The current project remains ordinary JSON at the root; `versionHistory` contains complete previous saved states compressed with gzip/Base64 and protected by SHA-256. No server history archive or file-format migration exists. History follows local downloads and encrypted server uploads. The server revision number remains a technical concurrency safeguard, not a user-facing snapshot.

Changes to the current project are not equivalent to bank transfers. A payment event records an actual completed payment or an explicitly noncash adjustment; ownership and balances are derived separately. See [Community settlement](../docs/FEATURE-COMMUNAL-SETTLEMENT.md).

Unencrypted local working copies are a convenience, **not durable backups**. Protected data is never intentionally cached in plaintext. The file must be saved explicitly. Automated Chromium browser QA has passed for local JSON/encrypted files, restore, Undo and concurrent PHP checkout; real hosting and independent browser/device/security reviews must still be tested before production; see [Build variants](../docs/BUILD-VARIANTS.md), [Security](../docs/SECURITY-AND-ENCRYPTION.md), and [To-do list](../docs/WG-PRAXIS-TODO.md).

The default interface language is currently German. English-first localization is a separate open task; see [terminology](../docs/LANGUAGE-AND-TERMINOLOGY.md).
