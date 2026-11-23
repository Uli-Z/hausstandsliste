# Hausstandsliste — repository entry point

**Product:** Hausstandsliste — Shared Ownership Tracker. The current UI is in German; English-first localization (Q13) is planned. Documentation should be English. Persisted project keys and event identifiers do not change when the UI is localized.

Read the current project guidance before editing:

- [AGENTS.md](AGENTS.md) — canonical implementation rules
- [README.md](README.md) — goals and quick start
- [Architecture](docs/ARCHITECTURE.md) — current event, project and storage model
- [Development](docs/DEVELOPMENT.md) — builds and tests
- [Roadmap](docs/ROADMAP.md) and [prioritized tasks](docs/WG-PRAXIS-TODO.md)
- [Communal settlements](docs/FEATURE-COMMUNAL-SETTLEMENT.md)
- [Portable file history](docs/FEATURE-PORTABLE-VERSION-HISTORY.md)
- [Encrypted collaborative storage](docs/FEATURE-COLLABORATIVE-STORAGE.md)
- [Security and encryption](docs/SECURITY-AND-ENCRYPTION.md)
- [Deployment](docs/DEPLOYMENT.md)

The **only** UI is `hausstand-svelte/ui-v3/` (with shared components under `src/components/`). Both the offline HTML build and optional PHP release use it. The **only** project file format is current schema v1 with an embedded compressed portable history; no old file or separate server version migrations are supported. See [application-specific notes](hausstand-svelte/GEMINI.md).

**Important:** Actual completed payments are already recorded as independent dated events and must not be confused with suggested payments or automatic transfer proposals. Financial balances are derived from ownership and settlement events, not persisted paid/unpaid flags.
