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

## Full browser acceptance (manual GitHub Actions only)

The separate [Browser acceptance QA](../.github/workflows/browser-qa.yml) workflow is **not triggered by pushes or pull requests**. It is intentionally a manual `workflow_dispatch` job to avoid consuming GitHub Actions minutes installing and running all three Playwright browsers on every commit. In the GitHub repository, open **Actions → Browser acceptance QA → Run workflow → master → Run workflow** when a full browser regression is needed (for example before a release or after changing storage, UI navigation or cross-browser behavior).

The suite builds offline HTML and PHP, installs Playwright with **Chromium, Firefox and WebKit**, and runs `node tests/browser-qa.mjs`. It exercises financial balances, payments, time travel, Undo/Redo, portable file archives, encrypted download/reimport and restore, responsive UI and PHP checkout/revision conflicts.

Normal commits still trigger the separate **Svelte app checks** workflow (syntax checks, Node unit tests, standalone/PHP builds, PHP smoke test); the Pages deployment remains automated independently. Neither of those runs Playwright browser acceptance tests.

To execute the full browser suite locally with browser dependencies installed:

```bash
npm install --no-save --package-lock=false playwright@1.65.1
npx playwright install chromium firefox webkit
npm run build:single
npm run build:php
npm run test:browser
```

Automated browser coverage uses simulated viewport dimensions rather than physical mobile devices. Real mobile devices and external HTTPS/PHP deployment remain additional release checks.

## Manual browser acceptance (still necessary)

1. Create three people and purchase a €300 shared item paid for by Anna, split equally. Anna should show +€200, the other two -€100 each. Record Ben paying €60; confirm updated net group positions. Complete the remaining payments, then test partial and excess payments.
2. Edit or remove a historical purchase and confirm independent already-recorded payments remain unchanged. Test compensated and uncompensated share transfers and dated member departure.
3. Save a local file twice after edits; download, reopen in a different browser, inspect both historic snapshots, restore an older one and explicitly Save again. Repeat with encrypted export/import and the PHP release.
4. Test 320–390px phone, tablet and desktop with navigation, finance details, labels, help and modal footer. No broken horizontal scrolling or oversize fields.
5. Verify blocked invalid edits: bad dates, invalid cents, missing people, duplicate event IDs, ownerless active items, read-only status, concurrent double submissions.
6. On a real HTTPS PHP server verify checkout/lease expiry, two competing browsers, stale technical revision 409, complete encrypted history, password rotation, email backup and recovery.
7. Test large file histories, quota limits, corrupted snapshots and explicit download errors.

Passing CI is **not** proof that the application is secure or production-ready. Review the [prioritized to-do list](WG-PRAXIS-TODO.md) and [security guidance](SECURITY-AND-ENCRYPTION.md) before release.
