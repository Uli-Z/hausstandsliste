# Hausstandsliste — Shared Ownership Tracker

**Hausstandsliste** is an open-source, local-first browser application for tracking jointly owned belongings, ownership shares, and changes over time. It is intended for shared households, flatshares, and other groups who own things together.

Unlike a shared expense tracker, Hausstandsliste focuses on **ownership rather than everyday spending**. It reconstructs ownership and value at any selected date, derives financial balances from ownership events, and records settlements that have already taken place.

**Application:** [`hausstand-svelte/`](hausstand-svelte/) (Svelte/Vite; version `0.7.0`). One user interface is shared by the offline HTML, [GitHub Pages](https://uli-z.github.io/hausstandsliste/), and the PHP release.

## Features

- Manage people, items, tags, and relative ownership shares.
- Value items using linear depreciation, declining-balance depreciation, or a fixed value.
- Reconstruct ownership, item value, and membership at historical dates using an event timeline.
- Preview, save drafts of, and execute ownership transfers.
- Derive financial claims and personal group balances from purchases, financing, and compensated ownership transfers.
- Suggest settlement routes and record, edit, or remove **payments that have actually occurred**, including partial payments and overpayments.
- Import/export project JSON, use the app locally, or deploy a separately configured encrypted PHP version.

**Ownership is separate from payment.** Executing an ownership transfer does not itself record a payment. A recorded payment is an independent, dated event and does not change any ownership shares. Corrections to past purchases recalculate derived claims but do not silently rewrite historical payments.

**Group settlement requires agreement.** The simplified payment routes are proposals for jointly agreed netting, not proof that any individual legal claim has been settled. See [Community settlement](docs/FEATURE-COMMUNAL-SETTLEMENT.md).

## Getting started

Requires Node.js and npm:

```bash
cd hausstand-svelte
npm ci
npm run dev
```

Open the local Vite URL shown in the terminal. To build a self-contained, offline-capable HTML file:

```bash
npm run build:single
```

The generated `hausstand-svelte/dist/hausstand-standalone.html` works without a server. The `dist/` directory is intentionally not committed. See [Development](docs/DEVELOPMENT.md) and the [Svelte project README](hausstand-svelte/README.md).

## Distribution and storage

There are two deliberately separate distributions:

1. **Standalone HTML / GitHub Pages:** offline-first, with local file import/export and **no PHP server-storage feature**.
2. **Separately built PHP release:** the same Svelte app, bundled with a preconfigured encrypted online file-storage API. The server operator configures the PHP file; end users do not enter API URLs or server credentials.

See [Build variants](docs/BUILD-VARIANTS.md) and [Deployment](docs/DEPLOYMENT.md). GitHub Pages itself cannot run PHP.

For ordinary unencrypted projects, browser `localStorage` is only a working copy. **Encrypted projects must not be cached in plaintext.** The exported project file is the durable record, so save it somewhere safe; browser data can disappear or be unavailable on another device. Never commit private household data to this public repository.

Both distributions use **the same portable project file format**: the current project in readable top-level JSON with earlier explicitly saved states compressed under `versionHistory`. The PHP server holds only the current encrypted file and a technical revision/lease for conflict protection; it does **not** maintain a separate project history. The application intentionally does not import obsolete file schemas. See [Portable version history](docs/FEATURE-PORTABLE-VERSION-HISTORY.md) and [open QA tasks](docs/WG-PRAXIS-TODO.md).

An encrypted email backup mechanism is implemented in PHP, but delivery against a real mail server has not been confirmed. Password changes re-encrypt the entire current file, including its portable history, but cannot re-encrypt already-sent email attachments. Production use with sensitive data requires independent security and hosting checks.

## Product name and language

The official product name is **Hausstandsliste**. Its English descriptor is **Shared Ownership Tracker**. Use those names in product titles, repository introductions, and release descriptions.

**Language migration status:** the main READMEs and product-language guidance are in English; the current user-interface copy and most older technical documents remain in German. English as the default UI language, automatic German selection from the browser language, and a manual language override are **planned, not yet implemented**. The current HTML documents retain `lang="de"` while their actual UI content is German. See [Language and terminology](docs/LANGUAGE-AND-TERMINOLOGY.md) and task Q13 in the [to-do list](docs/WG-PRAXIS-TODO.md).

User-facing localization will not change the current file-format or event identifiers. Only the current portable project schema is supported.

## Current implementation and verification

The event-driven financial model derives claims from compensated ownership events instead of storing a second list of claims or paid/unpaid checkboxes. Independent settlement events contribute opposing claims, including when a payment exceeds the original balance. The primary finance view shows **personal group balances** and suggested settlement routes; the original transactions remain auditable. The financial core is in `hausstand-svelte/src/lib/ledger.js` and `hausstand-svelte/src/lib/claimSettlement.js`.

As of **23 November 2026**, the [current verified CI run](https://github.com/Uli-Z/hausstandsliste/actions/runs/45144140944) passed **96 automated tests**, the sole UI's offline HTML build, PHP build/lint and PHP API smoke tests. Full interactive browser, mobile, JSON round-trip, external hosting, email delivery, and independent security acceptance remain open; see the [to-do list](docs/WG-PRAXIS-TODO.md).

The GitHub Pages workflow and the manual [PHP release workflow](https://github.com/Uli-Z/hausstandsliste/actions/workflows/php-release.yml) are separate. If Pages has not been enabled on this repository, an administrator must select **Settings → Pages → Source: GitHub Actions**. For downloads, open a successful [Svelte app checks](https://github.com/Uli-Z/hausstandsliste/actions/workflows/ci.yml) run and get the `hausstand-standalone` artifact. The generated files are not committed to `dist/`.

## Documentation

- [Developer and agent guidance](AGENTS.md) — repository development rules
- [Svelte project README](hausstand-svelte/README.md) — commands, builds, and code structure
- [Architecture and data model](docs/ARCHITECTURE.md)
- [Development and testing](docs/DEVELOPMENT.md)
- [Prioritized to-do list](docs/WG-PRAXIS-TODO.md) — current implementation priorities
- [Roadmap](docs/ROADMAP.md) — long-term work and historical decisions
- [Product language and terminology](docs/LANGUAGE-AND-TERMINOLOGY.md)
- [Community settlement rules](docs/FEATURE-COMMUNAL-SETTLEMENT.md)
- [Collaborative PHP storage](docs/FEATURE-COLLABORATIVE-STORAGE.md)
- [Security and encryption](docs/SECURITY-AND-ENCRYPTION.md)

**Development principle:** maintain a single UI and one current project format. Preserve event-based historical calculations, keep in-file history portable, and distinguish implemented code from verified testing.
