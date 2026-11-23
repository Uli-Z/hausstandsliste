# Hausstandsliste — application implementation notes

The code in this directory is the only active Svelte application. The UI entry point is `ui-v3/main.js` and `ui-v3/App.svelte`; `vite.ui-v3.config.js` is the only Vite build configuration. The offline HTML, Pages root, and single-file PHP release share this interface. Never recreate parallel classic/V2 UIs.

## Commands

```bash
npm ci
npm run dev
npm run check:js
npm test
npm run build:single
node scripts/check-standalone.mjs
npm run build:php
php -l dist/hausstand.php
node server-php/smoke.mjs
```

## Data, history and settlements

`src/lib/projector.js` projects historical ownership and member presence from ordered events; `src/lib/ledger.js` projects cent-exact claims, personal balances, and suggested payment routes. `src/lib/claimSettlement.js` validates independent dated cash/noncash adjustments. Never attach payments to individual purchases or store paid/unpaid claim flags. Use `src/stores/projectStore.js` for mutations and readonly checks.

The only accepted project file schema has `schemaVersion: 1`, `currency: EUR`, `lastSavedAt` and `versionHistory` with `format: portable-v1`. Complete previous save points are gzip/Base64 snapshots with SHA-256 validation in the file itself. `src/lib/versionHistory.js` handles snapshot writing and restore. Do not add alternative encodings or old-format migration paths.

The PHP API in `server-php/backend.php` stores one current encrypted document per project, guarded by technical revision/checkout lease and metadata pointer. It does **not** store a history archive. Passwords remain in the browser, and encrypted project copies must never be cached in cleartext. Optional encrypted email files are independent backups.

## UI design

The single responsive UI lives in `ui-v3/`. The reusable `src/components/SettlementDialog.svelte`, `HelpTip.svelte`, `BalanceBreakdown.svelte`, and `RedistributionItemList.svelte` are used by that UI. No additional decorative badges or permanently visible long explanations. Keep the working date explicit when time travel is active; the UI should open at today's date. Q10 (compact time travel), Q12 (Undo/Redo), and Q13 (localization) remain open.

Before calling any feature complete, check current GitHub Actions for the exact commit and record what was tested. Browser and real-hosting acceptance are separate.
