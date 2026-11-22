# Entwicklung, Build und manuelle Tests

## Voraussetzungen und Start

Node.js (eine aktuelle LTS-Version empfohlen) und npm bereitstellen. Im Verzeichnis `hausstand-svelte/` arbeiten:

```bash
npm ci
npm run dev
```

Die lokale Vite-Adresse öffnen; `vite.config.js` und `package.json` definieren den Build. Der Entwicklungsserver ist für `127.0.0.1` konfiguriert.

Weitere Befehle:

| Befehl | Zweck |
| --- | --- |
| `npm run check:js` | Syntaxprüfung von `scripts/inline-build.mjs` |
| `npm test` | Node-Bordmitteltests der Forderungslogik |
| `npm run build` | Vite-Produktionsbuild in `dist/` |
| `npm run build:single` | Vite-Build plus `dist/hausstand-standalone.html` |
| `npm run build:php` | Standalone-Build plus komplette PHP-App `dist/hausstand.php` |
| `npm run dev` | Lokaler Entwicklungsserver |

Das Inline-Skript ersetzt Referenzen auf gebaute `/assets/*.js` und `/assets/*.css` durch Inline-Code. Nach Abhängigkeits- oder Vite-Updates unbedingt prüfen, dass im Standalone-Ergebnis **keine** erforderlichen externen Asset-URLs übrigbleiben.

## Manuelle Akzeptanzprüfung (bis eine Testsuite existiert)

Nur mit **Testdaten** oder einer **gesicherten Kopie** eines bestehenden Projekts prüfen:

1. **Start/Projekt:** Leeres Projekt öffnen, Test-Gemeinschaft und zwei bis drei Personen anlegen; Anzeige und Aktiv-Status prüfen.
2. **Gegenstand:** Gegenstand mit Wert, Tags, Notiz und relativen Anteilen (z. B. 2:1) anlegen. Anteilprozent und Wertanteile kontrollieren.
3. **Stichtag:** Stichtag vor und nach dem Anlege-Event wählen; Personenstatus, Gegenstand und Wert müssen entsprechend wechseln. Weitere Ereignisse am selben Tag auf Reihenfolge prüfen.
4. **Bewertung:** Lineares, degressives und fixes Modell an unterschiedlichen Stichtagen vergleichen; Mindestwert kontrollieren.
5. **Umverteilung:** Anteilsänderung als Entwurf speichern, schließen und wieder öffnen. Vor Ausführung dürfen sich Anteile nicht verändern. Vorschau der Wertdifferenzen und Ausgleichsempfehlungen prüfen; danach ausführen und die Timeline kontrollieren.
6. **Historische Korrektur:** Ausgeführte Umverteilung über die Timeline bearbeiten; Werte und Anteilssätze erneut prüfen.
7. **Personen und Archiv:** Person deaktivieren/reaktivieren, Gegenstand beenden/als neue Version fortführen; Archiv und Detail-Timelines prüfen.
8. **JSON-Roundtrip:** Projekt exportieren, in einem frischen Browserprofil/importieren und gleichen Stichtag, Personen, Gegenstände, Events sowie Entwürfe vergleichen. Browser-Arbeitskopie nicht mit der Exportdatei verwechseln.
9. **Standalone:** `npm run build:single` ausführen, `dist/hausstand-standalone.html` direkt per `file://` öffnen und Kernaktionen samt JSON-Import/-Export ohne Internetverbindung erproben.
10. **Regression:** Bestehende JSON-Datei aus einer älteren Version importieren (insbesondere falls `redistributions[]` vorhanden ist); Datenerhalt prüfen.

Erwartetes Verhalten bei Ausgleichsempfehlungen: **Keine** Zahlung wird automatisch als geleistet oder beglichen erfasst. Dafür existiert noch keine Funktion.

## Status der technischen Verifizierung

Bei der Dokumentationspflege am **20.11.2026** wurden Code, Struktur und package-Skripte statisch geprüft. **Kein Build, keine Browser-Akzeptanzprüfung und kein Testlauf wurden tatsächlich ausgeführt**; die Umgebung konnte das öffentliche GitHub-Repository nicht klonen. Ein erfolgreicher Build darf erst nach wirklicher Ausführung behauptet werden.

Der GitHub-Actions-Workflow mit zehn Node-Fachlogiktests ist inzwischen vorhanden und hat auf Pull Request und `master` erfolgreich Tests sowie Standalone-Build ausgeführt. GitHub Pages bleibt deaktiviert. **Die manuelle Browser-/JSON-Roundtrip-Prüfung steht noch aus.**

## Änderungen sicher durchführen

- Vor dem Arbeiten Git-Status, Branch und jüngsten Commit prüfen. Aktueller Hauptbranch: `master`.
- Kurze, zusammenhängende Commits; Dokumentation und Anwendungsänderungen zusammen pflegen.
- Änderungen an Projektschema/Eventlogik immer gegen historische Stichtage und alte JSON-Daten prüfen.
- Vor destruktiven Eingriffen eine JSON-Sicherung exportieren. Browser-Storage ist kein belastbares Backup.
- Keine personenbezogenen Echtdaten oder exportierten Projekt-JSONs zu diesem öffentlichen Repository hinzufügen.
- Keine Seitenveröffentlichung oder automatische Synchronisation als vorhanden annehmen: erst explizit einrichten und prüfen.


## Geplante ergänzende Abnahmetests (noch nicht implementiert)

Bei den geplanten Funktionen die folgenden Schwerpunkte in automatisierte Tests aufnehmen:

- **Forderungsjournal:** anteilige Übertragungen, anteilige Auflösung, neue Einbringung mit/ohne Finanzierer, automatisch saldierte Gegenschulden **ohne Checkbox**, Integer-Cent-Rundung, sourceEventId-/Child-Event-Verknüpfung, Änderung von Datum und Beträgen, Löschen von Quellereignissen, Einfluss auf Folge-Events, Schema-1-Migration.
- **Verschlüsselung:** lokale Export-Import-Runde mit korrekter/falscher Passphrase, manipulierte Ciphertexte, KDF-Parameter, Nonce-Eindeutigkeit, altes Dateiformat, Passwortwechsel und Reverschlüsselung alter Versionen; `localStorage` enthält im verschlüsselten Modus keine Klartextdaten.
- **PHP-API:** Lese-/Schreibberechtigung, Rate-Limits, zwei Browser, Checkout/Checkin, 2-h-Inaktivitätsablauf, Revision-409, Atomizität und Absturzsimulation, verschlüsselte Versionshistorie und Restore als neue Revision, Pfadüberquerung, Dateigrößen, E-Mail-Warteschlange und Wiederholung ohne doppelte Mails.
- **Build:** neues `build:php`-Ziel prüfen, generierte `hausstand.php` neben `hausstand-standalone.html`; beide aus derselben Svelte-Quelle, Offline-HTML ohne Netzwerkanfragen und Remote-Betrieb nur unter HTTPS.

Diese Tests/Befehle müssen vor einer künftigen Produktivfreigabe tatsächlich ausgeführt werden. Details siehe [Feature Forderungen](FEATURE-DEBT-LEDGER.md), [PHP-Modus](FEATURE-COLLABORATIVE-STORAGE.md), [Sicherheitsentwurf](SECURITY-AND-ENCRYPTION.md).


### Zusätzliche Regressionstests zur präzisierten Forderungsarchitektur

Mit den drei Ereignissen Anna → Ben 200 €, Ben → Anna 75 € und Ben → Anna 45 € muss Anna netto 80 € schulden. Bei rückwirkender Änderung des ersten Ereignisses auf 150 € muss das automatisch **30 €** ergeben; beim Löschen des ersten Ereignisses muss Ben netto **120 €** schulden. Kein Ausgleichs-Boolean, kein verwaistes Posting und kein eigener Finanzstatus darf im exportierten JSON zurückbleiben. `deriveClaims()` muss zu jedem Eintrag ein gültiges Quellereignis referenzieren, auch nach Datumsänderungen und bei Child-Events in Sammelumverteilungen. Beide Nettoformen (bilateral und fakultativ multilateral) ausdrücklich unterscheiden. Bei Zahlungen als späteren Gegenbuchungsereignissen dürfen tatsächlich geflossene Beträge nicht automatisch mit einem rückwirkend geänderten Kaufbetrag überschrieben werden.


## Testautomatisierung des Forderungsfeatures (20.11.2026)

`hausstand-svelte/tests/ledger.test.js` enthält automatisierte Tests für Gegenforderungen, historische Änderungen/Löschungen, Stichtage, Anteilauflösung, Cent-Rundung, Legacy-Events und Sammelumverteilung. Mit `npm test` ausführen. `.github/workflows/ci.yml` startet bei Pull Requests nach `master` und führt `npm ci`, `npm run check:js`, `npm test` und `npm run build:single` aus. **CI war bei Pull Request und Merge nach `master` erfolgreich.** Eine manuelle Browser- und JSON-Roundtrip-Prüfung ist zusätzlich erforderlich.


### Download des geprüften Builds

Ein erfolgreicher [GitHub-Actions-Lauf](https://github.com/Uli-Z/hausstandsliste/actions/workflows/ci.yml) liefert unter **Artifacts** die Datei `hausstand-standalone` (14 Tage Aufbewahrung). Sie enthält nur die eigenständige HTML-App und keine persönlichen Projektdaten. Der manuelle Offline-Browsertest bleibt erforderlich.


## Ergänzte Tests für Verschlüsselung und PHP (21.11.2026)

- `npm test`: zusätzliche Kryptotests in `tests/crypto.test.js` (Roundtrip, falsches Passwort/Manipulation, zufällige Salts/Nonces).
- `npm run build:php`, `php -l dist/hausstand.php`: PHP-Release-Build und Syntaxcheck.
- `node server-php/smoke.mjs`: startet kurz einen lokalen PHP-Testserver und kontrolliert die Verschlüsselungscontainer-API einschließlich Checkout, Konfliktsperre, Versionen und Wechsel des Bearbeitungstokens. Keine E-Mail wird tatsächlich verschickt, wenn keine Mailkonfiguration gesetzt ist.
- `.github/workflows/pages.yml`: erstellt aus derselben Svelte-Anwendung das öffentliche statische Pages-Artefakt. Die automatische initiale Aktivierung war durch einen GitHub-Rechtefehler blockiert; Repository-Administrator muss Settings → Pages → GitHub Actions einmalig einstellen. [Deployment-Anleitung](DEPLOYMENT.md).

Noch offen: manuelle Browser-End-to-End-Tests und Sicherheitsreview auf einem realen HTTPS-PHP-Host, tatsächliche E-Mail-Zustellung und vollständige Neuschlüsselung der Versionshistorie.

## Regression A04: Keine Zahlungen bei unentgeltlichen Umverteilungen (22.11.2026)

`tests/redistribution.test.js` kontrolliert, dass Schenkungen/Korrekturen trotz berechneter Wertverschiebung **keine** Ausgleichszahlung empfehlen und keine Forderung erzeugen. Der Test deckt auch entgeltliche Vorgänge, alte Entwürfe ohne Finanzmodus sowie die Vorschau historisch ausgeführter Umverteilungen ab. Das gemeinsame Fachmodul und beide UI-Varianten zeigen in diesen Fällen den Hinweis auf die fehlende Forderung; der Markdown-Bericht beschreibt keinen erfolgten Geldfluss. Browser-Klicktest und CI-Lauf nach dem Commit sind separat zu prüfen.

## Regression A05: Keine aktiven Gegenstände ohne Eigentümer (22.11.2026)

`tests/ownership-validation.test.js` sichert die Blockade leerer/Null-/Negativ-Anteilssätze, das Überspringen von Alleineigentum bei der Spezialaktion, historische Sammelereignisse, same-day-Reihenfolge, Wert 0 €, legitime Ausbuchungen sowie die unveränderte Einlesbarkeit älterer problematischer Projekte ab. `src/lib/ownershipValidation.js` prüft jede neue Speichermutation anhand der vollständigen chronologischen Ereignisfolge; vorhandene historische Ungültigkeiten verhindern nicht die spätere Korrektur. Der Dialog muss bei abgewiesenen Änderungen offen bleiben. Manueller Browsercheck: Alleineigentum entfernen (blockiert), zusätzliche Person zuerst hinzufügen (danach Übertragung möglich), Gegenstand explizit beenden, rückdatierte Umverteilung invalidieren (blockiert), Alt-JSON importieren (nicht verändert), Desktop und mobile UI V3 prüfen. CI-Status und manuelle Browserabnahme separat verifizieren.
