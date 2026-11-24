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
- **Q12 implemented:** 50-step session-only Undo/Redo, Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z and unobtrusive header controls, excluded from file archives.
- Real Chromium QA of offline save/import/restore, Undo and concurrent PHP editing (see Browser acceptance QA workflow).

## Before regular use

- Q03–Q05: automated financial, responsive and portable-file browser scenarios passed; physical device and latest UI regression still remain.
- Q11: real hosting, device and archive-size acceptance.
- Q06: invalid edits and warnings.
- S01–S04: real PHP hosting, concurrency, backup email, password/permissions and security checks.

## Planned product improvements

- **Q10/Q16:** Compact opt-in time travel implemented; latest header UI browser acceptance pending.
- **Q13:** English fallback, automatic German selection and manual override implemented; final localization and accessibility audit pending.
- **Q20/Q24:** Save & open and local working-copy separation implemented; latest browser acceptance pending.
- **Q23:** Agent-friendly CLI (planned).
- **S05:** Manual authenticated PHP self-update (planned).
- **Q09:** Published-page verification.

**Scope boundary:** No banking, recurring expense tracker, legacy format import, separate server history API, parallel UI variants, or real-time multi-editor merge.
