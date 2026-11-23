# Einstieg für KI-unterstützte Entwicklung


## Product naming and localization (23 November 2026)

Use **Hausstandsliste — Shared Ownership Tracker** in app titles and new English-language documentation. The active UI is still mostly German until localization task **Q13**; see [language guidance](docs/LANGUAGE-AND-TERMINOLOGY.md) and [prioritized tasks](docs/WG-PRAXIS-TODO.md). Keep stored data identifiers and artifact filenames unchanged.


Die aktuelle Hausstandsliste wird unter `hausstand-svelte/` entwickelt. Bitte vor Änderungen lesen:

- [AGENTS.md](AGENTS.md) – Arbeitsregeln und Lesereihenfolge
- [README.md](README.md) – Projektzweck und Schnellstart
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – Fachmodell
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) – Build und Tests
- [docs/ROADMAP.md](docs/ROADMAP.md) – aktueller Stand
- [docs/FEATURE-DEBT-LEDGER.md](docs/FEATURE-DEBT-LEDGER.md) – Planung Forderungen/Nettoschulden
- [docs/FEATURE-COLLABORATIVE-STORAGE.md](docs/FEATURE-COLLABORATIVE-STORAGE.md) – PHP-Kollaboration, Lock/Versionen/E-Mail
- [docs/SECURITY-AND-ENCRYPTION.md](docs/SECURITY-AND-ENCRYPTION.md) – Browser-Verschlüsselung und Sicherheitsgrenzen
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – GitHub Pages / PHP-Hosting

Ergänzende Svelte-spezifische Hinweise stehen in [hausstand-svelte/GEMINI.md](hausstand-svelte/GEMINI.md).

**Wichtig:** Es gibt aktuell keine persistente Erfassung tatsächlich geleisteter Ausgleichszahlungen; nur Vorschläge. Keine Zahlungsbestätigung mit der Ausführung einer Anteilsumverteilung verwechseln.
