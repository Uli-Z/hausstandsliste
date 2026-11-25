# Hausstandsliste CLI (Q23, stage 2)

Requires Node.js 22+. From `hausstand-svelte/`:

```sh
npm ci
node bin/hausstand.mjs --help
node bin/hausstand.mjs items list --input project.json --as-of 2026-11-24 --json
node bin/hausstand.mjs balances show --input project.json --json
cat project.json | node bin/hausstand.mjs project validate --input -
```

This is a local CLI sharing the browser's domain, projector, ledger and event ordering. Install the shared application dependencies with `npm ci` first (the shared localization module imports `svelte/store`). It reads current plain or encrypted portable files, supports explicit non-overwriting saves, and does not connect to PHP. `project validate` checks the outer file structure and every embedded archive checksum. All successful data commands return one JSON object with `responseVersion: 1`, `command`, `source` (stored or projection), optional `asOfDate`, and `data`. List data has `total, offset, limit, rows`. Derived monetary amounts use integer cents; raw stored data retains the existing file schema. Proposals require group agreement and do not record payments. Errors are JSON on stderr, with empty stdout and nonzero exit status. See command help for options; no interactive prompt.

Remaining Q23: draft management, complete domain audit, general query output files, fresh-install/package and full acceptance.

## Shared library boundary

`src/lib/` is the single domain implementation for HTML, PHP (same browser app) and Node. The CLI is an adapter for arguments, JSON and local I/O only. It directly imports `requireProjectFile`, `projectAt`, `ledgerAt`, `newestFirst`, `getVersionEntries` and `validISODate`; it must not implement its own financial formulas, depreciation, event replay or calendar validation. New write commands must call the same pure `projectMutationProblem(before, after)` guard as the browser store, use shared domain event factories (e.g. `createClaimSettlementEvent`), and use `createPortableSave` / `readPortableVersion` for save/restore. Extract additional shared operations from UI components before exposing them in the CLI; never copy their business rules. Browser state, lease checks and file I/O remain adapter-specific. Shared modules may still depend on the installed Svelte localization package; decoupling it is a separate packaging task.

## Record a payment or restore an archive

Payment payload (JSON file or stdin, not the same stdin as the project):

```json
{"date":"2026-11-24","amountCents":1234,"debtorPersonId":"ben","creditorPersonId":"anna","settlementKind":"paid"}
```

The debtor field is the payer and the creditor field is the recipient. The explicitly required kind distinguishes actual cash payment (`paid`) from noncash offset (`external`, `waived`). An optional `note` is allowed. Never record a suggested payment as a real event unless it happened. Preview and save are separate invocations:

```sh
node bin/hausstand.mjs payments record --input project.json --payload payment.json --dry-run
node bin/hausstand.mjs payments record --input project.json --payload payment.json --output next.json --confirm
node bin/hausstand.mjs versions restore --input next.json --id VERSION_ID --dry-run
node bin/hausstand.mjs versions restore --input next.json --id VERSION_ID --output restored.json
```

Dry runs return `source: "working", data.saved: false`; a preview event's generated ID is not reserved. Actual saves return `source: "saved", data.saved: true`, the output path and version count. Restore preview includes the unsaved working project. Save archives the previous current state via the common portable archive module and refreshes the informational snapshot via the same export function as the browser. The original file is never overwritten; even an existing output with another name is rejected. Output uses a private temporary file in the target directory and atomic no-clobber publication via a hard link; filesystems without hard-link support are rejected. Parent directory must exist. The archive reader verifies every retained entry before saving. Errors include CONFIRM_REQUIRED, INVALID_PAYMENT, INVALID_PAYLOAD, MUTATION_REJECTED, INVALID_ARCHIVE, OUTPUT_EXISTS and OUTPUT_FAILED. Exit 6 indicates save/output errors. No in-place project replacement.

## Add and rename people (Q23)

`people add` accepts `{"name":"Clara","date":"2028-01-01"}`; `people rename` accepts `{"personId":"PERSON_ID","name":"Clara New"}`.
Both accept `--input` and `--payload` (one may be stdin), and exactly one of `--dry-run` or `--output <new-file>`. They return the person, and for add the new dated event. A rename changes master data only, preserving existing events and history. Names must be nonempty and unique under the same trimmed case-insensitive comparison as the UI. Both use `src/lib/personMutations.js` and the common transaction guard and portable save path. No payment confirmation flag is needed for these operations.

## Move out, return and remove unused people

`people deactivate` and `people reactivate` accept `{"personId":"PERSON_ID","date":"2028-02-01","reason":"optional note"}`. They use the same membership transition check and event factory as the browser. The date must be on or after move-in and the person must be active for move-out or inactive for return at the end of that date's existing events. No ownership or payment changes are implied. If omitted, the CLI reason is empty; the browser supplies a localized default.

`people delete` accepts `{"personId":"PERSON_ID"}`. Preview with `--dry-run`; saving requires `--output next.json --confirm`. The shared all-history reference guard rejects used people, including references in future events and drafts, with PERSON_IN_USE. Only the unused master record and its move-in event are removed from the working state; the previous version is retained in the archive. This is not a privacy erasure tool. Responses include the removed person and `deleted: true` (preview additionally has `saved: false`).

## Item and ownership commands

All use `--input project.json --payload payload.json` and either `--dry-run` or `--output next.json`. CLI amounts are integer cents (the shared file schema uses euros). Example purchase:

```json
{"name":"Desk","date":"2026-11-25","initialValueCents":30000,"valuation":{"type":"linear","durationYears":6,"minimumValueCents":5000},"shares":{"anna":1,"ben":1},"financedByPersonId":"anna","tags":["office"]}
```

`items add`: purchase above; financing is optional. Fixed valuation needs only type and minimumValueCents; degressive uses annualRate (0–1). `items update`: itemId,name, optional tags,note (replace metadata). `items continue`: purchase fields plus itemId, optional reason, no financing (neutral successor); `items end`: itemId,date, optional reason/statusAfter. `shares set`: itemId,date,shares,financialMode (derived or none), optional note. `redistribution execute`: effectiveDate,changes (array of {itemId,shares}),financialMode, optional title. Share changes never record actual payments. All use itemMutations.js, projectMutationProblem and the common portable save path.

## Install and discover the bundled skill

From `hausstand-svelte/`, run `npm pack` then `npm install -g ./hausstand-svelte-singlefile-0.7.0.tgz` (or use the actual generated tarball name). The package is intended for local installation, not published to npm. `hausstand --help` points to `hausstand skill show` and `hausstand skill export --output /path/SKILL.md`; export is byte-identical and does not overwrite unless `--force` is provided. `--output -` writes raw Markdown. Once installed, these commands need no network. The parent directory must exist.

## New and encrypted projects

`project create --payload name.json --output new.json` accepts `{ "name": "Household" }`; no `--input` required. For encrypted files, supply `HAUSSTAND_PASSWORD` via a secure environment mechanism; never pass it on the command line. Encrypted files always save encrypted using the shared browser AES-GCM/PBKDF2 module and preserve the existing edit token. Add `--encrypt` for new/plain project output. Read and dry-run responses may contain explicitly requested decrypted data, so protect stdout. Wrong passwords, damaged archives and write errors do not publish files. No PHP connection or password rotation in this CLI.

## Historical corrections

`events show --id EVENT_ID` reads a single event. `events edit --id EVENT_ID --payload changes.json --dry-run` previews a typed correction; saving and `events delete` require explicit `--confirm`. Immutable IDs, type and item/person reference are protected (payment payer/recipient are editable as in the UI). Editable fields depend on event type; see the bundled skill. Monetary item edits use integer `initialValueCents` and a complete valuation including `minimumValueCents`. The shared event mutation module is used by the three browser editing dialogs and the CLI; all writes still pass the project transaction guard. Correcting a purchase does not rewrite historical independent payments.
