# Hausstandsliste – historische Anteilsverwaltung

Hausstand ist eine browserbasierte Anwendung zur Verwaltung von gemeinsam finanzierten Gegenständen und den Eigentumsanteilen einzelner Personen, zum Beispiel in einer Hausgemeinschaft. Anteile, Werte und Personenstatus lassen sich zu einem beliebigen **Stichtag** rekonstruieren.

**Aktuelle Anwendung:** [`hausstand-svelte/`](hausstand-svelte/) (Svelte/Vite, Versionsangabe `0.7.0`).  
**Historische Vorlage:** [`vorlage.html`](vorlage.html) (ältere Single-HTML-Fassung, nicht die primäre Entwicklungsbasis).

## Schnellstart

Voraussetzung: Node.js mit npm.

```bash
cd hausstand-svelte
npm ci
npm run dev
```

Die angezeigte lokale Vite-Adresse im Browser öffnen. Für eine ohne Server verwendbare HTML-Datei:

```bash
npm run build:single
```

Das Ergebnis liegt unter `hausstand-svelte/dist/hausstand-standalone.html` und kann lokal geöffnet werden. `dist/` ist absichtlich nicht im Repository versioniert. Details: [Entwicklung & Testen](docs/DEVELOPMENT.md).

## Was funktioniert bereits?

- Personen, Gegenstände, Tags und Anteilssätze verwalten
- Drei Bewertungsmodelle: linear, degressiv, fester Wert
- Ereignis-Timeline und stichtagsbezogene Rekonstruktion
- Umverteilungen vorbereiten, als Entwurf speichern und ausführen
- Wertverschiebungen und **empfohlene** Ausgleichszahlungen berechnen
- Forderungen automatisch aus entgeltlichen Anteilsbewegungen ableiten, bilateral saldieren und gemeinschaftlich vereinfacht anzeigen
- Projekt-JSON importieren/exportieren; lokale Browser-Arbeitskopie

**Wichtig:** Eine ausgeführte Umverteilung dokumentiert eine Anteilsänderung, **keine beglichene Zahlung**. Eine Schuldenübersicht ist vorhanden, tatsächliche Geldzahlungen und Zahlungsstatus werden jedoch nicht erfasst.

## Speicherung und Datenschutz

In der aktuellen implementierten Version gibt es noch keinen Backend-Server und keine Datenbank. Die App speichert die Arbeitskopie im `localStorage` des verwendeten Browsers. Die **exportierte JSON-Projektdatei ist der dauerhaft aufzubewahrende Datenbestand**. Browserdaten können verloren gehen oder auf einem anderen Gerät fehlen – daher regelmäßig exportieren und gesichert ablegen. Persönliche Projektdaten nicht in dieses öffentliche Repository committen.

## Veröffentlichungsstatus

Der Quellcode ist öffentlich; **GitHub Pages ist für dieses Repository derzeit nicht aktiviert** (geprüft am 20.11.2026). Eine öffentliche Web-App ist nicht eingerichtet. Ein GitHub-Actions-Workflow prüft automatisiert Tests und Standalone-Build und stellt die HTML-Datei als Workflow-Artefakt bereit.

## Erweiterungen (Forderungslogik umgesetzt, Servermodus geplant)

Für die nächste Entwicklungsphase sind **zwei Produktfunktionen** und eine Benachrichtigung vorgesehen:

1. **Forderungen aus Anteilsbewegungen (implementiert):** Jede wirtschaftliche Eigentumsübertragung erzeugt **aus ihren historischen Ereignisdaten abgeleitete** Forderungen. Gegenläufige Forderungen werden automatisch verrechnet, **ohne Checkbox oder gespeicherten Zahlungsstatus**. Wird ein Quellereignis zeitlich oder wertmäßig verändert oder gelöscht, werden alle betroffenen Forderungen und Salden neu berechnet. Einbringung von Gegenständen braucht eine ausdrückliche Angabe zur Finanzierung, wenn daraus Forderungen entstehen sollen.
2. **Mehrere verschlüsselte Projektdateien auf einem PHP-Server:** Ein gemeinsamer Arbeitsordner mit sichtbaren Dateinamen, Passwort zum Entschlüsseln, Checkout/Checkin mit standardmäßig zwei Stunden Inaktivitätsfrist, Revisionsschutz und verschlüsselter Versionshistorie. Zusätzlich zur Offline-HTML-Version soll aus demselben Quellcode ein `hausstand.php`-Release gebaut werden.
3. **Verschlüsselte E-Mail-Sicherung:** Nach jeder bestätigten Online-Speicherung eine Kopie der verschlüsselten Dateiversion an eine konfigurierte E-Mail-Adresse senden. Die Verschlüsselung muss genauso für lokale Dateien funktionieren.

Dokumentation zur umgesetzten Forderungslogik und den weiteren Planungen:

- [Forderungsjournal und Nettoausgleich](docs/FEATURE-DEBT-LEDGER.md)
- [Kollaborative PHP-Dateiablage](docs/FEATURE-COLLABORATIVE-STORAGE.md)
- [Sicherheits- und Verschlüsselungsentwurf](docs/SECURITY-AND-ENCRYPTION.md)

**Status:** Die Forderungsprojektion ist in `master` implementiert, zehn Unit-Tests und der Standalone-Build liefen in GitHub Actions erfolgreich. Der manuelle Browser-/JSON-Roundtrip steht noch aus. Es werden weiterhin keine realen Geldzahlungen erfasst. PHP, Verschlüsselung und E-Mail bleiben geplant.

## Projekt-Dokumentation

- [`AGENTS.md`](AGENTS.md) – Einstieg und verbindliche Hinweise für weitere Entwicklungs- und KI-Sitzungen
- [Architektur & Datenmodell](docs/ARCHITECTURE.md) – Aufbau, Ereignistypen, Speicherweg
- [Entwicklung & Testen](docs/DEVELOPMENT.md) – Befehle, manuelle Prüfschritte, Releases
- [Stand & nächste Aufgaben](docs/ROADMAP.md) – bestätigter Funktionsstand, offene Aufgaben und Entscheidungen
- [Svelte-Projekt-README](hausstand-svelte/README.md) – Hinweise direkt beim Quellprojekt

**Weiterentwicklung:** Maßgeblich ist der Branch `master`. Vor jeder Änderung aktuellen Branch, Git-Status und Dokumentation prüfen. Neue Funktionen zunächst im Datenmodell und in den Akzeptanzfällen durchdenken; die alte HTML-Vorlage nicht parallel als zweite Implementierung fortführen.


## Offline-HTML herunterladen

In [GitHub Actions – Svelte app checks](https://github.com/Uli-Z/hausstandsliste/actions/workflows/ci.yml) einen erfolgreichen Lauf öffnen und unter **Artifacts** `hausstand-standalone` herunterladen. Das Artefakt enthält die eigenständige HTML-App (14 Tage Aufbewahrung), aber keine Projektdateien. GitHub Pages ist nicht aktiviert.
