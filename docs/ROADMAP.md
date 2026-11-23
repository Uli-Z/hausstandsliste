# Hausstandsliste — development roadmap

The canonical prioritized work items and their actual acceptance status are in [WG-PRAXIS-TODO.md](WG-PRAXIS-TODO.md). This roadmap records the current product direction, rather than preserving superseded implementation plans.

## Implemented core

- Single Svelte UI, shared by offline HTML, GitHub Pages (root URL) and manually built PHP release.
- Event-based shared-item ownership, membership changes, relative ownership shares and valuation/depreciation.
- Historical as-of projection and ownership transfers.
- Financial claims and personal communal balances derived from compensated ownership events.
- Independent dated cash/noncash settlement records, partial payments, overpayments and proposals for netting by agreement.
- JSON current project file with embedded compressed `versionHistory`, protected archive encryption and explicit local-download or PHP-upload Save.
- PHP storage with a **single current encrypted file**, technical revision check, exclusive checkout lease, password rotation and optional encrypted email copies.
- Current file-format validation. Unsupported project schemas and obsolete UI/storage implementations have **no compatibility or migration code**.
- CI exercising JS/domain tests, standalone build, PHP lint/build and HTTP API smoke.

## Before regular use

- Q03: end-to-end browser verification of financial settlement scenarios.
- Q04: mobile/desktop UI and accessibility acceptance.
- Q05/Q11: file Save → download/upload → reopen → restore history, encryption and browser limits.
- Q06: invalid edits and warnings.
- S01–S04: real PHP hosting, concurrency, backup email, password/permissions and security checks.

## Planned product improvements

- **Q10:** Compact opt-in time-travel UI. Open at the true current date; reveal a prominent historical/future-date banner only when viewing another date.
- **Q12:** Session-only Undo/Redo with Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z; never saved into the portable file archive.
- **Q13:** English as the default UI language, automatic German selection from browser preferences, and a manual override. Internal file format stays language-neutral.
- **Q07/Q08/Q09:** final UX, documentation and deployment review.

**Scope boundary:** No banking, recurring expense tracker, legacy format import, separate server history API, parallel UI variants, or real-time multi-editor merge.
