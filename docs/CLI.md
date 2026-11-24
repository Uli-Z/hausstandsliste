# Hausstandsliste CLI (Q23, stage 1)

Requires Node.js (20+ recommended). From `hausstand-svelte/`:

```sh
npm ci
node bin/hausstand.mjs --help
node bin/hausstand.mjs items list --input project.json --as-of 2026-11-24 --json
node bin/hausstand.mjs balances show --input project.json --json
cat project.json | node bin/hausstand.mjs project validate --input -
```

This is a read-only foundation sharing the browser's domain, projector, ledger and event ordering. Install the shared application dependencies with `npm ci` first (the shared localization module imports `svelte/store`). It reads current unencrypted portable project files only. It does not write, restore, decrypt, connect to PHP, or claim full archive validation. `project validate` checks the same outer file structure as the browser import. All successful data commands return one JSON object with `responseVersion: 1`, `command`, `source` (stored or projection), optional `asOfDate`, and `data`. List data has `total, offset, limit, rows`. Derived monetary amounts use integer cents; raw stored data retains the existing file schema. Proposals require group agreement and do not record payments. Errors are JSON on stderr, with empty stdout and nonzero exit status. See command help for options; no interactive prompt.

Remaining Q23: safe mutations, dry-run/save and restore with intact history, complete validation and encryption support, output files, installable package, agent skill discovery/show/export and full acceptance. Do not use this stage to modify projects.
