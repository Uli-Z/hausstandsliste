# Development and testing

## Setup and commands

```bash
cd hausstand-svelte
npm ci
npm run dev
npm run check:js
npm test
npm run build:single
node scripts/check-standalone.mjs
npm run build:php
php -l dist/hausstand.php
php -l server-php/backend.php
node server-php/smoke.mjs
```

The dev server serves the **only** Svelte UI (`ui-v3/`). `build:single` creates `dist/hausstand-standalone.html`; `build:php` creates one operator-configurable `dist/hausstand.php`. Generated `dist/` files are not committed. GitHub Pages publishes the same offline interface at the repository root.

## Automated coverage

The Node test suite under `tests/` covers historical ownership and event order, depreciation, person and item integrity, financial claims/counterclaims, payment validation, cent precision, encryption, portable gzip history, SHA-256 integrity and UI behavior contracts. The PHP smoke test starts a temporary local server, creates/reads an encrypted project, exercises checkout conflicts, updates a single current encrypted file, verifies technical revisions, changes the editing token and checks checkin.

Only the **current** file schema is supported. Imported project JSON must have `schemaVersion: 1`, `currency: EUR`, `lastSavedAt` and embedded `versionHistory`; unsupported files must be rejected. No alternative historical file formats or PHP version archives are supported.

## Automated browser acceptance (Chromium)

The separate [Browser acceptance QA](../.github/workflows/browser-qa.yml) workflow builds offline HTML and PHP, installs Playwright/Chromium, and runs `node tests/browser-qa.mjs`. It exercises financial balances, payment entry, Ctrl+Z/Ctrl+Y, downloading and reopening a portable project in another browser context, Restore, narrow mobile layout, and two-browser encrypted PHP checkout/revision conflict handling.

To execute locally with browser dependencies already installed:

```bash
npm install --no-save --package-lock=false playwright@1.65.1
npx playwright install chromium
npm run build:single
npm run build:php
npm run test:browser
```

Only the Chromium-specific successful parts from an actual workflow run may be claimed verified. Browser-engine diversity, real mobile devices and real HTTPS/PHP deployment remain additional checks.

## Manual browser acceptance (still necessary)

1. Create three people and purchase a €300 shared item paid for by Anna, split equally. Anna should show +€200, the other two -€100 each. Record Ben paying €60; confirm updated net group positions. Complete the remaining payments, then test partial and excess payments.
2. Edit or remove a historical purchase and confirm independent already-recorded payments remain unchanged. Test compensated and uncompensated share transfers and dated member departure.
3. Save a local file twice after edits; download, reopen in a different browser, inspect both historic snapshots, restore an older one and explicitly Save again. Repeat with encrypted export/import and the PHP release.
4. Test 320–390px phone, tablet and desktop with navigation, finance details, labels, help and modal footer. No broken horizontal scrolling or oversize fields.
5. Verify blocked invalid edits: bad dates, invalid cents, missing people, duplicate event IDs, ownerless active items, read-only status, concurrent double submissions.
6. On a real HTTPS PHP server verify checkout/lease expiry, two competing browsers, stale technical revision 409, complete encrypted history, password rotation, email backup and recovery.
7. Test large file histories, quota limits, corrupted snapshots and explicit download errors.

Passing CI is **not** proof that the application is secure or production-ready. Review the [prioritized to-do list](WG-PRAXIS-TODO.md) and [security guidance](SECURITY-AND-ENCRYPTION.md) before release.
