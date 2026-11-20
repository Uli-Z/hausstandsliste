# Projektleitfaden für Entwicklungsagenten – Hausstandsliste

Dieses Dokument ist der kurze Einstieg für neue Entwicklungs-Sitzungen. **Zuerst diese Dateien lesen**:

1. [README.md](README.md) – Ziel, Schnellstart, Funktionsumfang
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – Datenmodell und Ereignisprojektion
3. [docs/ROADMAP.md](docs/ROADMAP.md) – tatsächlicher Stand, offene Produktentscheidungen
4. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) – Build und manuelle Prüfungen
5. [hausstand-svelte/GEMINI.md](hausstand-svelte/GEMINI.md) – technische Regeln nahe am Code

## Wo wird entwickelt?

- Produktiver Quellcode: `hausstand-svelte/` (Svelte/Vite), Einstieg `src/App.svelte`
- Zustand und Mutationen: `src/stores/projectStore.js`
- Fachlogik: `src/lib/` (insbesondere `projector.js`, `redistribution.js`, `persistence.js`)
- UI: `src/components/`; globale Styles: `src/styles.css`
- `vorlage.html` ist eine **historische Referenz**, keine parallel zu pflegende App.
- Build-Ergebnis `dist/hausstand-standalone.html` wird erzeugt, nicht versioniert.

## Unverrückbare Produktprinzipien

1. **Offline-first:** kein erforderlicher Server, keine API, keine serverseitige Datenbank; das Ziel ist eine einzige eigenständige HTML-Datei.
2. **Projekt-JSON ist die dauerhafte Datenquelle**; `localStorage` ist nur eine Arbeitskopie. Import-/Exportfähigkeit und Rückwärtskompatibilität beachten.
3. **Historische Ereignisse:** `projectAt(project, asOfDate)` muss bei gleicher Eingabe dasselbe Ergebnis liefern; Ereignisse nach `date` und `order` sortieren.
4. **Entitäten per stabiler ID referenzieren**, Anteile als relative Einheiten speichern (nicht als gerundete Prozentangaben).
5. **Datenänderungen nur über `appState.mutateProject(...)`** bzw. die Store-Aktionen; keine direkte Mutation von `$appState.project`.
6. Die vorhandene Funktionsparität zur alten HTML-Version schützen. Bestehende Imports und historische Projektdateien nicht stillschweigend verändern.
7. **Umverteilung ≠ Zahlung.** Die App errechnet derzeit nur Ausgleichsempfehlungen. Keine erfundene Funktion zur Schuldenbegleichung dokumentieren.

## Bei jeder neuen Sitzung

- Aktuelle Dateien und Branches abrufen; nie allein aus früheren Antworten auf den Arbeitsstand schließen.
- `README.md`, `docs/ROADMAP.md` und betroffene Quelldateien lesen.
- Änderungen gezielt und klein halten; Datenmodell-Änderungen auf Migration, Stichtage, JSON-Export und alte Ereignisse prüfen.
- Nach Codeänderungen `npm ci`, `npm run check:js`, `npm run build:single` und die manuellen Tests aus [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) durchführen. Nicht ausgeführte Tests ausdrücklich nennen.
- Dokumentation und Roadmap im selben Arbeitsschritt aktualisieren; **„umgesetzt“ nur nach Sichtung des Codes**, „getestet“ nur nach tatsächlichem Test.

## Status der Dokumentationsüberarbeitung (20.11.2026)

Die Dokumentation wurde anhand der Dateien im Branch `master` aktualisiert. In dieser Sitzung wurde kein Build ausgeführt und kein Anwendungscode geändert. Das Projekt besitzt bislang keine automatisierte Testsuite und keine eingerichtete GitHub-Pages-Veröffentlichung.

**Nächster Produktpunkt:** persistente Begleichung einzelner Ausgleichszahlungen (offen/bezahlt) – erst Datenmodell und UI-Verhalten festlegen, dann umsetzen. Details in [docs/ROADMAP.md](docs/ROADMAP.md).
