# Hausstandsliste — Svelte application

This directory contains the **active source code** for [Hausstandsliste — Shared Ownership Tracker](../README.md), a local-first browser app for jointly owned belongings. The older [single-file prototype](../vorlage.html) is only a historical reference.

The Svelte/Vite source produces a standalone offline HTML application and a separately configured PHP release. Both builds share the domain logic, event history, and user interface; PHP is **not** required for local use.

## Development

Install Node.js and npm:

```bash
cd hausstand-svelte
npm ci
npm run dev
```

Other commands:

```bash
npm run check:js      # check the inline build script
npm test              # domain, settlement, and crypto regression tests
npm run build         # Vite production build
npm run build:single  # self-contained dist/hausstand-standalone.html
npm run build:ui-v3   # current mobile UI V3, used by the Pages workflow
npm run build:ui-v2   # older preview interface
npm run build:php     # standalone PHP release, dist/hausstand.php
```

The `dist/` files are generated and not versioned. The HTML distribution can run from `file://` and must not depend on the PHP API. The PHP distribution is built **manually** and configured by the operator inside the PHP file, not by the end user. See [Build variants](../docs/BUILD-VARIANTS.md) and [Deployment](../docs/DEPLOYMENT.md).

## Code map

- `ui-v3/App.svelte` and `ui-v3/`: **current** mobile-first interface and navigation.
- `src/App.svelte`, `src/components/`: classic interface, shared components, and dialogs.
- `src/stores/projectStore.js`: project state and controlled mutations.
- `src/lib/projector.js`: reconstruction from dated project events.
- `src/lib/ledger.js` and `src/lib/claimSettlement.js`: derived ownership-related claims, personal balances, and independently recorded settlements.
- `src/lib/redistribution.js`: ownership transfers and settlement previews.
- `src/lib/valuation.js`: valuation/depreciation methods.
- `src/lib/persistence.js`, `src/lib/crypto.js`: JSON export, temporary working copy, and encryption.
- `server-php/backend.php`: PHP server template, not a second application.
- `scripts/`: standalone HTML and PHP bundling.
- `tests/`: regression tests.

## Ownership and financial boundaries

The app is an **ownership tracker**, not a shared household budget or bank payment service. Purchases and compensated ownership transfers can produce derived claims; the finance screen shows personal net group balances and proposed settlement routes. Actual payments are recorded as **independent dated events**, and may be edited or deleted. Payments do not change ownership, are not matched to individual purchases, and may produce an opposing balance when they exceed an amount owed.

The application does not send bank transfers. Group-level netting requires the participants' agreement; see [Community settlement](../docs/FEATURE-COMMUNAL-SETTLEMENT.md). Original claims remain available for audit but are not a second paid/unpaid checklist.

Import/export compatibility is essential. Old JSON records without an explicit financial mode must not retroactively acquire new claims. An encrypted project must never be silently cached unencrypted. Browser working copies are not durable backups.

## Language and naming

**Hausstandsliste** is the product name; **Shared Ownership Tracker** is the English descriptor. Product titles and visible branding now use these terms in UI V3 and the earlier entry points. **This is not yet a localized UI:** most interface strings are still German, so HTML `lang="de"` remains accurate.

Planned task **Q13** introduces English as the default UI language, German detection through browser preferences, a persistent manual override, translation keys, locale-aware formatting, and accessibility/testing coverage. Do not replace persisted JSON field names, event identifiers, storage keys, or release filenames simply to translate the UI. See [Language and terminology](../docs/LANGUAGE-AND-TERMINOLOGY.md) and the [to-do list](../docs/WG-PRAXIS-TODO.md).

## Verification and further documentation

The last recorded complete CI run on 23 November 2026 ([run 45122479125](https://github.com/Uli-Z/hausstandsliste/actions/runs/45122479125)) passed 87 unit tests, JS checks, standalone/UI builds, PHP build/lint, and PHP API smoke tests. New commits must be tested independently. Full interactive browser/mobile testing, old/new JSON round trips, real hosting/email validation, and the portable in-file version history are still open.

- [Developer rules](../AGENTS.md) and [Svelte-specific notes](GEMINI.md)
- [Architecture](../docs/ARCHITECTURE.md)
- [Development and test instructions](../docs/DEVELOPMENT.md)
- [Current prioritized tasks](../docs/WG-PRAXIS-TODO.md)
- [Roadmap](../docs/ROADMAP.md)
- [Portable version history proposal](../docs/FEATURE-PORTABLE-VERSION-HISTORY.md)
