# Hausstandsliste CLI (Q23, stage 2)

Requires Node.js (20+ recommended). From `hausstand-svelte/`:

```sh
npm ci
node bin/hausstand.mjs --help
node bin/hausstand.mjs items list --input project.json --as-of 2026-11-24 --json
node bin/hausstand.mjs balances show --input project.json --json
cat project.json | node bin/hausstand.mjs project validate --input -
```

This is a local CLI sharing the browser's domain, projector, ledger and event ordering. Install the shared application dependencies with `npm ci` first (the shared localization module imports `svelte/store`). It reads current unencrypted portable project files only. It supports explicit non-overwriting payment saves and archived-version restoration. It does not yet decrypt or connect to PHP. `project validate` checks the same outer file structure as the browser import. All successful data commands return one JSON object with `responseVersion: 1`, `command`, `source` (stored or projection), optional `asOfDate`, and `data`. List data has `total, offset, limit, rows`. Derived monetary amounts use integer cents; raw stored data retains the existing file schema. Proposals require group agreement and do not record payments. Errors are JSON on stderr, with empty stdout and nonzero exit status. See command help for options; no interactive prompt.

Remaining Q23: other person status/deletion, item/ownership mutations, complete validation and encryption support, general output files, installable package, agent skill discovery/show/export and full acceptance.

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

Dry runs return `source: "working", data.saved: false`; a preview event's generated ID is not reserved. Actual saves return `source: "saved", data.saved: true`, the output path and version count. Restore preview includes the unsaved working project. Save archives the previous current state via the common portable archive module and refreshes the informational snapshot via the same export function as the browser. The original file is never overwritten; even an existing output with another name is rejected. Output uses a private temporary file in the target directory and atomic no-clobber publication via a hard link; filesystems without hard-link support are rejected. Parent directory must exist. The archive reader verifies every retained entry before saving. Errors include CONFIRM_REQUIRED, INVALID_PAYMENT, INVALID_PAYLOAD, MUTATION_REJECTED, INVALID_ARCHIVE, OUTPUT_EXISTS and OUTPUT_FAILED. Exit 6 indicates save/output errors. No encrypted input or in-place replacement yet.

## Add and rename people (Q23)

`people add` accepts `{"name":"Clara","date":"2028-01-01"}`; `people rename` accepts `{"personId":"PERSON_ID","name":"Clara New"}`.
Both accept `--input` and `--payload` (one may be stdin), and exactly one of `--dry-run` or `--output <new-file>`. They return the person, and for add the new dated event. A rename changes master data only, preserving existing events and history. Names must be nonempty and unique under the same trimmed case-insensitive comparison as the UI. Both use `src/lib/personMutations.js` and the common transaction guard and portable save path. No payment confirmation flag is needed for these operations.
