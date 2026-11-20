# Hausstand – Svelte-Quellprojekt

Dies ist die **maßgebliche** Anwendung im Repository [`hausstandsliste`](../README.md). Die frühere Ein-Datei-App `../vorlage.html` ist eine Referenz; die laufende Entwicklung findet hier statt.

Die Quelldateien werden mit Svelte/Vite modular gepflegt und bei Bedarf als **eigenständige Offline-HTML-Datei** gebündelt. Der verwendete Projektzustand lässt sich als JSON-Datei exportieren und wieder importieren.

## Lokal starten

Node.js und npm vorausgesetzt:

```bash
cd hausstand-svelte
npm ci
npm run dev
```

`npm run dev` startet den lokalen Vite-Server (konfiguriert mit `127.0.0.1`). Weitere Befehle:

```bash
npm run check:js      # prüft Syntax des Inline-Build-Skripts
npm run build         # Vite-Produktionsbuild nach dist/
npm run build:single  # Build plus dist/hausstand-standalone.html
```

Die Datei `dist/hausstand-standalone.html` soll direkt im Browser und ohne Server funktionieren. Der Build ist dokumentiert, aber bei der Dokumentationsüberarbeitung vom 20.11.2026 **nicht erneut ausgeführt** worden. Für eine Veröffentlichung auf GitHub Pages ist aktuell noch kein Workflow eingerichtet.

## Projektübersicht

- `src/App.svelte`: Hauptoberfläche und Navigation
- `src/components/`: Dashboard-Bausteine, Detailseiten, Timeline, Dialoge
- `src/stores/projectStore.js`: zentrale reaktive Zustandsverwaltung
- `src/lib/projector.js`: Rekonstruktion des Zustands aus Ereignissen
- `src/lib/redistribution.js`: Anteilsänderungen und **empfohlene** Ausgleichszahlungen
- `src/lib/valuation.js`: Bewertungsmodelle
- `src/lib/persistence.js`: `localStorage`, Import-/Exportunterstützung und JSON-Ausgabe
- `scripts/inline-build.mjs`: fügt Build-Assets in eine HTML-Datei ein

## Fachliche Grenzen

Die App verwaltet **Eigentums- und Wertanteile**, nicht die tatsächliche Bezahlung von Ausgleichsforderungen. Der Button „Umverteilung ausführen“ speichert Anteilsänderungen in der Ereignis-Timeline; er markiert keine Zahlung als beglichen. Ein eigener Zahlungsstatus ist als nächster Ausbauschritt geplant.

Ein gespeicherter Browser-Arbeitsstand ist **keine Datensicherung**. Projekt-JSON regelmäßig exportieren und extern sichern. Keine echten persönlichen Hausgemeinschaftsdaten in Git committen.

## Weitere Dokumentation

- [Architektur und Datenmodell](../docs/ARCHITECTURE.md)
- [Entwicklung, Tests und Build](../docs/DEVELOPMENT.md)
- [Roadmap und offene Fragen](../docs/ROADMAP.md)
- [KI- und Entwicklerregeln](../AGENTS.md), [lokale technische Hinweise](GEMINI.md)


## Nächste Entwicklungsetappe (geplant)

Fachlich: [Forderungen je Anteilsbewegung, Ausgleichsstatus und Nettoschulden](../docs/FEATURE-DEBT-LEDGER.md). Technisch: [optionale Online-Ablage per PHP](../docs/FEATURE-COLLABORATIVE-STORAGE.md) und [lokale wie serverseitige verschlüsselte Dateien](../docs/SECURITY-AND-ENCRYPTION.md). Die gleiche Svelte-App soll zwei Artefakte erzeugen, `hausstand-standalone.html` und `hausstand.php`; die PHP-Datei ist **ein generiertes Release-Artefakt, keine separate UI**. Server-API und Mailversand sind noch nicht implementiert.


## Forderungsprojektion (Feature-Branch)

`src/lib/ledger.js` berechnet bei explizit entgeltlichen Anteilsänderungen die Forderungen automatisch aus der Ereignishistorie; Gegenforderungen werden in `LedgerPanel.svelte` saldiert. Alte Ereignisse ohne `financialMode` bleiben finanziell neutral. Die Fachlogik speichert keine Forderungsbeträge und keine Abhak-Statuswerte. `npm test` prüft die wichtigsten historischen Fälle. Echte Geldzahlungen bleiben bewusst außerhalb dieses Ausbauschritts.
