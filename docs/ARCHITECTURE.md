# Architecture — Hausstandsliste

## Scope

Hausstandsliste is a local-first application for shared belongings and their owners' relative shares, historical valuations and documented settlements. It is not an expense or banking system. One Svelte UI supports both offline HTML and encrypted PHP-backed collaboration.

## Source layout

- `hausstand-svelte/ui-v3/`: **sole** responsive UI, dialogs, finance and history views, global CSS.
- `src/components/`: reusable HelpTip, SettlementDialog, BalanceBreakdown and RedistributionItemList.
- `src/stores/projectStore.js`: editable project, last confirmed saved project, dirty flag, current as-of date, read-only and protected modes.
- `src/lib/domain.js`: project model, normalization of current in-memory data, validation of **one accepted file schema**.
- `src/lib/projector.js`: `walkEvents` and `projectAt` reconstruct ownership at an as-of date.
- `src/lib/ledger.js`: `ledgerAt` reconstructs cent-based financial claims, personal group balances and candidate settlement routes using the same event ordering.
- `src/lib/claimSettlement.js`: independent dated cash/noncash settlement events.
- `src/lib/redistribution.js`, `valuation.js`, `ownershipValidation.js`, `personDeletion.js`: ownership calculations and integrity rules.
- `src/lib/persistence.js`, `versionHistory.js`, `crypto.js`: export, working copy, in-file compressed history and encryption.
- `server-php/backend.php`: optional same-origin encrypted document storage API.

## Current project file

The **only accepted** on-disk data schema is `schemaVersion: 1`, `currency: "EUR"`, with `community`, `people`, `items`, `events`, `drafts`, `lastSavedAt` and `versionHistory`. Current ownership data is plain JSON at the root; `versionHistory.entries[]` holds complete prior save states as gzip/Base64 with SHA-256. Snapshots omit their own archive to prevent recursive growth.

A file is accepted by `requireProjectFile()`. Unsupported schemas are rejected, not migrated. Generated `humanReadableSnapshot` is descriptive only, never the authoritative data model. `localStorage` is an unencrypted-project working copy, not the saved file. Protected projects are never intentionally cached there as plaintext.

## Events and values

- Stable person and item IDs; ownership shares are relative units.
- Events have effective ISO date and order. The as-of view reconstructs ownership and values deterministically.
- `item-added`, `item-ended`, `shares-set`, `redistribution-executed`, membership events and `claim-settlement-recorded` comprise the active event model.
- Financially compensated ownership events may derive claims; there is **no persisted debt or paid/unpaid status**.
- `claim-settlement-recorded` independently records payer, recipient, amount in integer cents and `paid`, `external` or `waived`. No purchase reference is stored. Overpayment creates a reverse balance. Edits to purchases do not rewrite recorded transfers.
- Group-netting proposals are distinct from legally agreed payment obligations.

## Explicit Save and remote storage

Session Undo/Redo (Q12) is implemented, with up to 50 in-memory steps. It is not serialized, does not create archive entries and resets on import, project switch or archived-version Restore. On explicit Save after changes, the previously saved whole project becomes an archive entry and the current state is saved.

- Offline: import loads a working copy, without retaining a link to the source filename. Save downloads a new complete file; it cannot overwrite the imported file. A protected local working copy is saved encrypted. Dirty status compares working data to the last imported or explicitly saved snapshot.
- PHP: encrypt the same file in the browser; upload it to a single current encrypted server document.
- The PHP server tracks a monotonic technical revision, current-file pointer and exclusive checkout lease. Stale writes receive 409; older project states are **not** separately stored by PHP. The client restores historical versions only from the encrypted file archive.
- Optional encrypted email copies are independent backups, not another user-visible history implementation. Downloading a separate backup while editing online does not confirm a remote save.
- Language is a browser-local preference, not a project field. The interface uses English fallback, German browser detection and a manual override. Time travel starts at today on reload/import and is separate from saved event dates.

## Build and validation

`npm run build:single` and `npm run build:php` produce the same UI in different transport modes. GitHub Pages publishes the standalone UI at the repository root. `npm test`, PHP lint and the PHP API smoke test exercise the model and builds; full browser/security review remains open. See [Build variants](BUILD-VARIANTS.md) and [To-do](WG-PRAXIS-TODO.md).
