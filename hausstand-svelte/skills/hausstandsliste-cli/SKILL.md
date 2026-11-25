---
name: hausstandsliste-cli
description: Inspect and safely update Hausstandsliste shared ownership projects using the local hausstand CLI.
---

# Hausstandsliste CLI

Use the installed CLI (`hausstand --help`, `hausstand --version`) or run `node bin/hausstand.mjs` from the application source after npm ci. Requires Node.js 22+. This skill is bundled with the CLI: `hausstand skill show` prints it verbatim; `hausstand skill export --output /path/SKILL.md` exports it without overwriting by default. Add --force only to intentionally replace a skill file.

## Rules

- A project is a current schemaVersion 1 EUR portable file, with embedded archive. Never modify JSON directly, silently overwrite files, or invent IDs.
- An ownership transfer and a real payment are different facts. Balances and suggestions are derived. Never book a suggested payment unless the user confirms it actually occurred (or explicitly agrees to a noncash offset).
- Read-only commands never write. Use --dry-run before a mutation, inspect output, then save to an explicit NEW --output path. A dry-run ID is not reserved.
- For encrypted files, securely provide HAUSSTAND_PASSWORD in the environment. Never include the password in command arguments, payloads, chat or logs. Encrypted input remains encrypted on save. --encrypt protects a new/plain output. Explicit read/preview commands can emit decrypted project information to stdout; handle it privately. No PHP server access.
- Money in CLI mutation payloads is integer cents; share units are positive relative numbers. Stored events use the current project schema (euros for item initial/minimum values, integer cents for payments). Dates use YYYY-MM-DD. Do not edit generated snapshots.

## Commands

Use `--input project.json` (or `--input -` for stdin); writes use `--payload payload.json` (or --payload -; not both inputs on stdin). All successful data commands emit versioned JSON; errors are JSON on stderr and nonzero exit.

| Command | Options / payload |
| --- | --- |
| project create | payload {"name":"Household"}; no --input |
| project validate | input; checks file, stored business data and all embedded archive snapshots |
| project show | input; full stored project |
| people list / items list | input, optional --as-of, --offset, --limit |
| people show / items show | input, --id stable ID, optional --as-of |
| balances show | input, optional --as-of |
| events list / versions list | input, optional --offset, --limit |
| events show | input, --id event ID |
| events edit | input, --id event ID, payload of changed fields, --confirm for save |
| events delete | input, --id event ID, --confirm for save |
| people add | {"name":"Anna","date":"2026-01-01"} |
| people rename | {"personId":"ID","name":"Anna"} |
| people deactivate / reactivate | {"personId":"ID","date":"2026-12-01","reason":"optional"} |
| people delete | {"personId":"ID"}; --confirm for save; only unused people |
| items add | purchase payload below |
| items update | {"itemId":"ID","name":"Desk","tags":["office"],"note":""} |
| items continue | purchase payload + itemId, optional reason; omit financier |
| items end | {"itemId":"ID","date":"2026-12-01","reason":"optional","statusAfter":"ended"} |
| shares set | {"itemId":"ID","date":"2026-12-01","shares":{"PERSON_ID":1},"financialMode":"none"} |
| redistribution execute | {"effectiveDate":"2026-12-01","financialMode":"derived","changes":[{"itemId":"ID","shares":{"PERSON_ID":1}}],"title":"Optional"} |
| payments record | payment payload below; --confirm for save |
| drafts list / drafts show | input; show uses --id, list supports pagination |
| drafts put | draft payload below; optional existing id for replacement |
| drafts execute / drafts delete | --id draft ID; --confirm for save |
| versions restore | --id archive ID; no payload |

Purchase (use real IDs from people list):
```json
{"name":"Desk","date":"2026-11-25","initialValueCents":30000,"valuation":{"type":"linear","durationYears":6,"minimumValueCents":5000},"shares":{"ANNA_ID":1,"BEN_ID":1},"purchaseContributionsCents":{"ANNA_ID":20000,"BEN_ID":10000}}
```
Valuation types: fixed, linear (positive durationYears), degressive (annualRate 0–1). All require minimumValueCents. Optional tags and note. Purchase contributions are required and must add up to initialValueCents. The old explicit single-payer argument is accepted only as shorthand. Optional settledPaymentDate records the calculated independent cash payments; provide it ONLY when those exact payments actually occurred. Neutral successor items do not represent purchases.

Payment:
```json
{"date":"2026-11-25","amountCents":1234,"debtorPersonId":"BEN_ID","creditorPersonId":"ANNA_ID","settlementKind":"paid"}
```
Kinds paid, external, waived. Optional note. Payer is debtorPersonId. No purchase/item link.

## Historical corrections

For events edit, payload contains only fields to change (not id, type, order or itemId/personId). Allowed fields: person-added date/name; person status date/reason; item-added date/name/initialValueCents/valuation/shares/purchaseContributionsCents (mandatory matching explicit map when changing purchase price); item-ended date/statusAfter/reason; shares-set date/shares/financialMode/note; redistribution-executed date/title/financialMode/events (only existing child IDs/types/item IDs, updated shares or removed children); payment date/amountCents/debtorPersonId/creditorPersonId/settlementKind/note. A valuation replacement requires type, minimumValueCents and durationYears/annualRate where applicable. Preview and confirm explicitly before saving. Never change past payments as a side effect of changing a purchase.

## Drafts

Item draft: {"type":"item","title":"Table plan","data":{"effectiveDate":"2026-11-25","name":"Table","initialValueCents":30000,"valuation":{"type":"fixed","minimumValueCents":0},"shares":{"PERSON_ID":1}}}. Only effectiveDate is mandatory inside item data; incomplete drafts must be finished before execution. Redistribution draft: {"type":"redistribution","title":"Transfer","effectiveDate":"2026-11-25","financialMode":"none","changes":[{"itemId":"ITEM_ID","shares":{"PERSON_ID":1}}]}. Omit id for new draft; include an existing same-type id to replace. Preview, then save. Executing a draft records its dated events using shared validation and removes the draft; deleting a draft never records a transaction. Both require --confirm for save.

## Typical workflow

```sh
hausstand project validate --input project.json
hausstand people list --input project.json --as-of 2026-11-25
hausstand items add --input project.json --payload purchase.json --dry-run
hausstand items add --input project.json --payload purchase.json --output next.json
hausstand balances show --input next.json --as-of 2026-11-25
hausstand versions list --input next.json
```

Data response: {responseVersion:1,command,source,data}; source stored, projection, working or saved. Projection includes asOfDate. Lists have total,offset,limit,rows (limit max 1000). A saved response reports output, versionCount and encrypted; previews report saved:false. Error: {responseVersion:1,error:{code,message}}. Exit 2 usage/confirmation, 3 unreadable/invalid JSON input, 4 invalid project/mutation/archive/password, 5 missing ID, 6 output/save, 1 unexpected. On error do not retry by bypassing validation. Inspect help and correct input. Never expose private project contents outside the authorized task.

Limitations: no arbitrary raw event injection, no PHP remote access, no in-place project replacement. Older saved versions may still contain deleted people; deletion is not privacy erasure.

List commands accept `--search TEXT` (case-insensitive row substring before pagination). Read-only commands may additionally write a new JSON report with `--output PATH`; stdout still returns the same response. Encrypted input reports are stdout-only; never write plaintext reports from them through the CLI.

`project validate` reports `businessValidated: true` on success. `INVALID_BUSINESS_DATA` identifies invalid current business data; `INVALID_ARCHIVE` identifies a damaged or substantively invalid archived snapshot. An explicit correction may preserve the old invalid snapshot in history, so validation can still fail afterward. Never delete archive entries to bypass validation.
