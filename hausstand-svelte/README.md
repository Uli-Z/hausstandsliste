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
npm run build:php     # MANUELL: mobile V3 mit PHP-API, dist/hausstand.php
npm test              # Ledger- und Kryptotests
```

Die Datei `dist/hausstand-standalone.html` soll direkt im Browser und ohne Server funktionieren. Der Build ist dokumentiert, aber bei der Dokumentationsüberarbeitung vom 20.11.2026 **nicht erneut ausgeführt** worden. Ein GitHub-Pages-Workflow existiert. Falls die automatische Aktivierung mangels GitHub-Permissions scheitert, unter Settings → Pages als Quelle GitHub Actions wählen und Workflow neu ausführen.

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

Die App verwaltet in erster Linie **Eigentums- und Wertanteile**. Sie kann bereits geleistete Ausgleichszahlungen als eigenständige datierte Ereignisse dokumentieren, bearbeiten und löschen, überweist aber kein Geld. Der Button „Umverteilung ausführen“ speichert Anteilsänderungen, **keine** Zahlung. Das persönliche Wertkonto ergibt sich aus Finanzierung, Anteilen, Anteilsübertragungen und dokumentierten Zahlungen; ein zusätzlicher Bezahlstatus wird nicht geführt.

Ein gespeicherter Browser-Arbeitsstand ist **keine Datensicherung**. Projekt-JSON regelmäßig exportieren und extern sichern. Keine echten persönlichen Hausgemeinschaftsdaten in Git committen.

## Weitere Dokumentation

- [Architektur und Datenmodell](../docs/ARCHITECTURE.md)
- [Entwicklung, Tests und Build](../docs/DEVELOPMENT.md)
- [Roadmap und offene Fragen](../docs/ROADMAP.md)
- [KI- und Entwicklerregeln](../AGENTS.md), [lokale technische Hinweise](GEMINI.md)


## Nächste Entwicklungsetappe (geplant)

Fachlich: [Forderungen je Anteilsbewegung, Ausgleichsstatus und Nettoschulden](../docs/FEATURE-DEBT-LEDGER.md). Technisch: [optionale Online-Ablage per PHP](../docs/FEATURE-COLLABORATIVE-STORAGE.md) und [lokale wie serverseitige verschlüsselte Dateien](../docs/SECURITY-AND-ENCRYPTION.md). Die gleiche Svelte-App soll zwei Artefakte erzeugen, `hausstand-standalone.html` und `hausstand.php`; die PHP-Datei ist **ein generiertes Release-Artefakt, keine separate UI**. Server-API und Mailanbindung sind implementiert, benötigen aber einen separaten PHP-Webserver und ein funktionierendes PHP-Mailtransport-Setup; siehe [Deployment](../docs/DEPLOYMENT.md).


## Forderungsprojektion (`master`, implementiert)

`src/lib/ledger.js` berechnet bei explizit entgeltlichen Anteilsänderungen die Forderungen automatisch aus der Ereignishistorie; Gegenforderungen werden in `LedgerPanel.svelte` saldiert. Alte Ereignisse ohne `financialMode` bleiben finanziell neutral. Die Fachlogik speichert keine Forderungsbeträge und keine Abhak-Statuswerte. `npm test` prüft die wichtigsten historischen Fälle. Dazu kommen jetzt unabhängige Zahlungsevents und die nachvollziehbare Zerlegung der persönlichen Salden mit `ledgerAt().details` (ohne zusätzliche Persistenz).

## Build-Trennung (22.11.2026)

- HTML-/Pages-Build: ausschließlich lokale Speicherung und Datei-Import/-Export. Keine PHP-API-URL, keine Online-Speicherung.
- PHP-Build: `npm run build:php`; erzeugt `dist/hausstand.php` aus der **aktuellen V3-UI** plus PHP-Backend. Datenordner und Berechtigungen werden **oben in der PHP-Datei** durch den Betreiber eingestellt. Endanwender brauchen keine Serverdaten einzugeben.
- Manueller GitHub-Workflow: [PHP-Datei bauen](https://github.com/Uli-Z/hausstandsliste/actions/workflows/php-release.yml).
- Details: [Getrennte Buildvarianten](../docs/BUILD-VARIANTS.md).


## Einfache Ausgleichsbedienung (22.11.2026)

Die mobile V3-Oberfläche führt über **Ausgleichsvorschläge → Ausgleichen → bereits erfolgte Zahlung bestätigen**. Die Zahlung ist im Verlauf bearbeitbar/löschbar. Der Personenbereich erklärt den Saldo als Summe von Finanzierungen, aufgenommenen/abgegebenen Anteilen und Zahlungen. Zahlungen werden keinem bestimmten Gegenstand zugeordnet; die ursprünglichen Wertverschiebungen bleiben als Herkunft einsehbar. Kategorien werden gefiltert, aber nicht als wiederholte Badge-Chips präsentiert. Details und rechtliche Abgrenzung: [gemeinschaftlicher Wertausgleich](../docs/FEATURE-COMMUNAL-SETTLEMENT.md).
