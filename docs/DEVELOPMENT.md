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
| `npm run build` | Vite-Produktionsbuild in `dist/` |
| `npm run build:single` | Vite-Build plus `dist/hausstand-standalone.html` |
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

Es existieren aktuell **keine automatisierten Tests**, keine eingecheckten GitHub-Actions-Workflows und keine GitHub-Pages-Veröffentlichung. Ein erster sinnvoller Qualitätsschritt ist ein CI-Job für `npm ci`, `check:js`, `build:single` und einfache Fachlogiktests.

## Änderungen sicher durchführen

- Vor dem Arbeiten Git-Status, Branch und jüngsten Commit prüfen. Aktueller Hauptbranch: `master`.
- Kurze, zusammenhängende Commits; Dokumentation und Anwendungsänderungen zusammen pflegen.
- Änderungen an Projektschema/Eventlogik immer gegen historische Stichtage und alte JSON-Daten prüfen.
- Vor destruktiven Eingriffen eine JSON-Sicherung exportieren. Browser-Storage ist kein belastbares Backup.
- Keine personenbezogenen Echtdaten oder exportierten Projekt-JSONs zu diesem öffentlichen Repository hinzufügen.
- Keine Seitenveröffentlichung oder automatische Synchronisation als vorhanden annehmen: erst explizit einrichten und prüfen.


## Geplante ergänzende Abnahmetests (noch nicht implementiert)

Bei den geplanten Funktionen die folgenden Schwerpunkte in automatisierte Tests aufnehmen:

- **Forderungsjournal:** anteilige Übertragungen, anteilige Auflösung, neue Einbringung mit/ohne Finanzierer, saldierte Gegenschulden, Integer-Cent-Rundung, Ausgleichshaken und Sammelverrechnung, historische Korrektur, Schema-1-Migration.
- **Verschlüsselung:** lokale Export-Import-Runde mit korrekter/falscher Passphrase, manipulierte Ciphertexte, KDF-Parameter, Nonce-Eindeutigkeit, altes Dateiformat, Passwortwechsel und Reverschlüsselung alter Versionen; `localStorage` enthält im verschlüsselten Modus keine Klartextdaten.
- **PHP-API:** Lese-/Schreibberechtigung, Rate-Limits, zwei Browser, Checkout/Checkin, 2-h-Inaktivitätsablauf, Revision-409, Atomizität und Absturzsimulation, verschlüsselte Versionshistorie und Restore als neue Revision, Pfadüberquerung, Dateigrößen, E-Mail-Warteschlange und Wiederholung ohne doppelte Mails.
- **Build:** neues `build:php`-Ziel prüfen, generierte `hausstand.php` neben `hausstand-standalone.html`; beide aus derselben Svelte-Quelle, Offline-HTML ohne Netzwerkanfragen und Remote-Betrieb nur unter HTTPS.

Diese Tests/Befehle müssen vor einer künftigen Produktivfreigabe tatsächlich ausgeführt werden. Details siehe [Feature Forderungen](FEATURE-DEBT-LEDGER.md), [PHP-Modus](FEATURE-COLLABORATIVE-STORAGE.md), [Sicherheitsentwurf](SECURITY-AND-ENCRYPTION.md).
