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

Die App arbeitet weiterhin ohne verpflichtenden Server. Zusätzlich gibt es einen **optionalen PHP-Speichermodus** für verschlüsselte gemeinsame Dateien; GitHub Pages bietet nur die statische Oberfläche. Bei gewöhnlichen Klartext-Projekten speichert die App eine Arbeitskopie im `localStorage`. **Verschlüsselt geöffnete Projekte werden dagegen nicht als Klartext im Browser-Storage zwischengespeichert.** Die **exportierte JSON-Projektdatei ist der dauerhaft aufzubewahrende Datenbestand**. Browserdaten können verloren gehen oder auf einem anderen Gerät fehlen – daher regelmäßig exportieren und gesichert ablegen. Persönliche Projektdaten nicht in dieses öffentliche Repository committen.

## Veröffentlichungsstatus

Der Quellcode ist öffentlich. Die GitHub-Pages-Veröffentlichung ist vorbereitet; die erstmalige Freischaltung unter **Settings → Pages → Source: GitHub Actions** muss einmal durch den Repository-Administrator erfolgen. Der automatische Versuch war durch fehlende GitHub-Actions-Administrationsberechtigung blockiert. Die getestete HTML- und PHP-Datei stehen als CI-Artefakte bereit. [Deployment-Anleitung](docs/DEPLOYMENT.md).

## Erweiterungen: Forderungen, Verschlüsselung und optionale Online-Ablage

Der Implementierungsstand umfasst:

1. **Forderungen aus Anteilsbewegungen (implementiert):** Jede wirtschaftliche Eigentumsübertragung erzeugt **aus ihren historischen Ereignisdaten abgeleitete** Forderungen. Gegenläufige Forderungen werden automatisch verrechnet, **ohne Checkbox oder gespeicherten Zahlungsstatus**. Wird ein Quellereignis zeitlich oder wertmäßig verändert oder gelöscht, werden alle betroffenen Forderungen und Salden neu berechnet. Einbringung von Gegenständen braucht eine ausdrückliche Angabe zur Finanzierung, wenn daraus Forderungen entstehen sollen.
2. **Mehrere verschlüsselte Projektdateien auf einem PHP-Server (implementiert, noch nicht extern gehostet):** Ein gemeinsamer Arbeitsordner mit sichtbaren Dateinamen, Passwort zum Entschlüsseln, Checkout/Checkin mit standardmäßig zwei Stunden Inaktivitätsfrist, Revisionsschutz und verschlüsselter Versionshistorie. Zusätzlich zur Offline-HTML-Version wird aus demselben Quellcode ein `hausstand.php`-Release gebaut.
3. **Verschlüsselte E-Mail-Sicherung (implementiert, Versand noch nicht mit echtem Mailserver bestätigt):** Nach jeder bestätigten Online-Speicherung eine Kopie der verschlüsselten Dateiversion an eine konfigurierte E-Mail-Adresse senden. Die Verschlüsselung muss genauso für lokale Dateien funktionieren.

Dokumentation zur umgesetzten Forderungslogik und den weiteren Planungen:

- [Forderungsjournal und Nettoausgleich](docs/FEATURE-DEBT-LEDGER.md)
- [Kollaborative PHP-Dateiablage](docs/FEATURE-COLLABORATIVE-STORAGE.md)
- [Sicherheits- und Verschlüsselungsentwurf](docs/SECURITY-AND-ENCRYPTION.md)
- [Installation, GitHub Pages und PHP-Server](docs/DEPLOYMENT.md)

**Status:** Forderungsableitung, lokaler verschlüsselter Import/Export, PHP-Online-Ablage, Checkout, Revisionen und PHP-Mailanbindung sind im Code. Automatisierte Kryptotests und PHP-API-Integrationstests einschließlich PHP-Build waren erfolgreich; eine manuelle Browser-/Server-/E-Mail-Abnahme und unabhängige Sicherheitsprüfung stehen noch aus. Echte Geldzahlungen werden nicht erfasst.

## Projekt-Dokumentation

- [`AGENTS.md`](AGENTS.md) – Einstieg und verbindliche Hinweise für weitere Entwicklungs- und KI-Sitzungen
- [Architektur & Datenmodell](docs/ARCHITECTURE.md) – Aufbau, Ereignistypen, Speicherweg
- [Entwicklung & Testen](docs/DEVELOPMENT.md) – Befehle, manuelle Prüfschritte, Releases
- [Stand & nächste Aufgaben](docs/ROADMAP.md) – bestätigter Funktionsstand, offene Aufgaben und Entscheidungen
- [Svelte-Projekt-README](hausstand-svelte/README.md) – Hinweise direkt beim Quellprojekt

**Weiterentwicklung:** Maßgeblich ist der Branch `master`. Vor jeder Änderung aktuellen Branch, Git-Status und Dokumentation prüfen. Neue Funktionen zunächst im Datenmodell und in den Akzeptanzfällen durchdenken; die alte HTML-Vorlage nicht parallel als zweite Implementierung fortführen.


## Offline-HTML herunterladen

In [GitHub Actions – Svelte app checks](https://github.com/Uli-Z/hausstandsliste/actions/workflows/ci.yml) einen erfolgreichen Lauf öffnen und unter **Artifacts** `hausstand-standalone` herunterladen. Das Artefakt enthält die eigenständige HTML-App (14 Tage Aufbewahrung), aber keine Projektdateien. Für die automatische Web-Veröffentlichung die [Pages-Quelle einmalig aktivieren](docs/DEPLOYMENT.md#github-pages-veröffentlichung).


**Wichtige Grenzen:** GitHub Pages führt selbst kein PHP aus. Die gemeinsame Online-Ablage benötigt einen separaten PHP-Webserver mit HTTPS; Dateinamen und Revisionsmetadaten sind dort öffentlich sichtbar. Das Ändern des Dateipassworts schützt die aktuelle Revision und rotiert das Schreibrecht, **verschlüsselt aber alte Versionen und bereits versandte E-Mails nicht rückwirkend neu**. Eine produktive Nutzung sensibler Daten setzt eine Server- und Sicherheitsprüfung voraus.


## Fehlerbehebung GitHub Pages (21.11.2026)

Bei der ersten Pages-Veröffentlichung konnte der Build erfolgreich deployen, obwohl die Anwendung nur eine leere Seite zeigte. Ursache: `scripts/inline-build.mjs` hatte das JavaScript aus dem Vite-Bundle mit einem synchronen `<script>` im HTML-`<head>` eingebettet; die App versuchte `#app` zu verwenden, bevor dieses DOM-Element existierte. Der Generator bewahrt jetzt `<script type="module">` bei, damit die Ausführung nach dem HTML-Parsing startet. Der zusätzliche CI-/Pages-Check `scripts/check-standalone.mjs` sichert dieses Verhalten ab. Das reparierte Artefakt wird bei jedem Push auf `master` neu auf GitHub Pages veröffentlicht.
