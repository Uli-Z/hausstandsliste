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
- Projekt-JSON importieren/exportieren; lokale Browser-Arbeitskopie

**Wichtig:** Eine ausgeführte Umverteilung dokumentiert eine Anteilsänderung, **keine beglichene Zahlung**. Offen-/Bezahlt-Status, Teilzahlungen und Schuldenübersicht sind noch nicht implementiert.

## Speicherung und Datenschutz

In der aktuellen implementierten Version gibt es noch keinen Backend-Server und keine Datenbank. Die App speichert die Arbeitskopie im `localStorage` des verwendeten Browsers. Die **exportierte JSON-Projektdatei ist der dauerhaft aufzubewahrende Datenbestand**. Browserdaten können verloren gehen oder auf einem anderen Gerät fehlen – daher regelmäßig exportieren und gesichert ablegen. Persönliche Projektdaten nicht in dieses öffentliche Repository committen.

## Veröffentlichungsstatus

Der Quellcode ist öffentlich; **GitHub Pages ist für dieses Repository derzeit nicht aktiviert** (geprüft am 20.11.2026). Es gibt keine eingerichtete automatische Veröffentlichung und derzeit keine CI-Testpipeline. Das Standalone-Build-Ziel ist vorhanden; ein frischer Build wurde bei der Dokumentationsüberarbeitung nicht ausgeführt.

## Geplante Erweiterungen (noch nicht implementiert)

Für die nächste Entwicklungsphase sind **zwei Produktfunktionen** und eine Benachrichtigung vorgesehen:

1. **Offene Forderungen aus Anteilsbewegungen:** Jede wirtschaftliche Eigentumsübertragung erhält fest zugeordnete finanzielle Buchungen mit Status **ausgeglichen/offen**; mehrere noch offene Buchungen können zu vereinfachten Nettoschulden verrechnet werden. Einbringung von Gegenständen braucht eine ausdrückliche Angabe zur Finanzierung, wenn daraus Forderungen entstehen sollen.
2. **Mehrere verschlüsselte Projektdateien auf einem PHP-Server:** Ein gemeinsamer Arbeitsordner mit sichtbaren Dateinamen, Passwort zum Entschlüsseln, Checkout/Checkin mit standardmäßig zwei Stunden Inaktivitätsfrist, Revisionsschutz und verschlüsselter Versionshistorie. Zusätzlich zur Offline-HTML-Version soll aus demselben Quellcode ein `hausstand.php`-Release gebaut werden.
3. **Verschlüsselte E-Mail-Sicherung:** Nach jeder bestätigten Online-Speicherung eine Kopie der verschlüsselten Dateiversion an eine konfigurierte E-Mail-Adresse senden. Die Verschlüsselung muss genauso für lokale Dateien funktionieren.

Detaillierte, noch nicht implementierte Fach- und Architekturentwürfe:

- [Forderungsjournal und Nettoausgleich](docs/FEATURE-DEBT-LEDGER.md)
- [Kollaborative PHP-Dateiablage](docs/FEATURE-COLLABORATIVE-STORAGE.md)
- [Sicherheits- und Verschlüsselungsentwurf](docs/SECURITY-AND-ENCRYPTION.md)

**Status:** Es handelt sich um geplante Änderungen. Der vorhandene Code ist weiterhin Version 0.7.0 ohne Schuldenstatus, serverseitige Speicherung, Verschlüsselung oder E-Mail-Versand.

## Projekt-Dokumentation

- [`AGENTS.md`](AGENTS.md) – Einstieg und verbindliche Hinweise für weitere Entwicklungs- und KI-Sitzungen
- [Architektur & Datenmodell](docs/ARCHITECTURE.md) – Aufbau, Ereignistypen, Speicherweg
- [Entwicklung & Testen](docs/DEVELOPMENT.md) – Befehle, manuelle Prüfschritte, Releases
- [Stand & nächste Aufgaben](docs/ROADMAP.md) – bestätigter Funktionsstand, offene Aufgaben und Entscheidungen
- [Svelte-Projekt-README](hausstand-svelte/README.md) – Hinweise direkt beim Quellprojekt

**Weiterentwicklung:** Maßgeblich ist der Branch `master`. Vor jeder Änderung aktuellen Branch, Git-Status und Dokumentation prüfen. Neue Funktionen zunächst im Datenmodell und in den Akzeptanzfällen durchdenken; die alte HTML-Vorlage nicht parallel als zweite Implementierung fortführen.
