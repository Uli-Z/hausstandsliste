# Einheitliche portable Versionshistorie – Zieldesign

**Status: erste Implementierung auf `master` (23.11.2026), automatisierte CI erfolgreich; praktische Browser-/Hosting-Abnahme und Undo/Redo noch offen.** Gilt für lokale Standalone-HTML-, verschlüsselte lokale und PHP-Online-Projekte. Ersetzt das bisherige Produktmodell mit einer separaten serverseitigen Versionshistorie. Entwicklungs- und Abnahmetasks: [Q11/Q12](WG-PRAXIS-TODO.md).

## Erster Implementierungsstand (23.11.2026)

- `src/lib/versionHistory.js`: komprimierte SHA-256-geprüfte vollständige Snapshots; Vorversionen wiederherstellen und alte PHP-Revisionen idempotent in die Datei übernehmen.
- `src/stores/projectStore.js`: letzter ausdrücklich gespeicherter Zustand getrennt vom Arbeitsstand, ungespeicherter Restore, Browser-Cache-Warnung, Wiederherstellung nach Neuladen auf den heutigen Stichtag.
- `ui-v3/App.svelte` / `ui-v3/StorageView.svelte`: zentraler Speicherknopf, Dirty-Status, lokaler JSON-Download, verschlüsselter Download/Upload, gemeinsame Versionsauswahl und manueller Migrationsweg.
- `server-php/backend.php`: neue Server-Speicherstände als eine aktuelle verschlüsselte Datei (atomarer Revisionszeiger); nur technische Revisionen bleiben. Frühere `versions/`-Dateien bleiben **unverändert und lesbar** zur Migration. Die externe verschlüsselte E-Mail-Kopie bleibt unabhängig davon.
- Automatischer Testnachweis: [CI-Lauf 45139312801](https://github.com/Uli-Z/hausstandsliste/actions/runs/45139312801), 98 erfolgreiche Tests einschließlich PHP-Smoke, PHP-Lint, Standalone und V3.
- **Noch ausstehend:** manueller Cross-Browser-Test, große Dateiarchive/Quotagrenzen, Migration über mehrere frühere Passwörter, reales PHP-Hosting, E-Mail-Zustellung, UX-Abnahme und das separat geplante Sitzungs-Undo/Redo (Q12). Alte PHP-Archive werden nicht automatisch gelöscht; ihre endgültige Bereinigung erfordert nachprüfbare Migration und separate Backups.

## Grundsatz: eine Projektdatei als vollständige Quelle

Die **einzige maßgebliche fachliche Versionshistorie** liegt **in der Projektdatei selbst**. Sie reist beim Download, Versand und Import vollständig mit und ist lokal wie online identisch.

- Das reguläre, aktuelle Projekt bleibt direkt in den bisherigen Top-Level-Feldern (z. B. `community`, `people`, `items`, `events`) als normales JSON lesbar.
- Am Ende ergänzt `versionHistory` eine Liste **früherer, ausdrücklich gespeicherter Gesamtzustände**, mit Zeitstempel und komprimiertem Snapshot (z. B. gzip + Base64), Versions-ID/Schema/Kodierungsangabe sowie Integritätsprüfung. Snapshots dürfen **keine eigene `versionHistory`** enthalten. Der **aktuell gespeicherte Stand** ist bereits der oberste Datensatz, nicht noch einmal redundant im Archiv.
- Jede Version ist ein kompletter fachlicher Projektzustand, keine Sammlung von Diffs, damit Wiederherstellung berechenbar bleibt. Eine Begrenzungs-/Aufräumstrategie darf niemals Versionen stillschweigend vernichten.
- Unverschlüsselte lokale JSON-Dateien zeigen den aktuellen Zustand unmittelbar an. Bei verschlüsselten Projekten wird **die gesamte Datei mitsamt `versionHistory` als Einheit im Browser verschlüsselt**, damit historische persönliche Daten genauso geschützt sind wie die aktuellen.
- Frühere JSON-Dateien ohne `versionHistory` bleiben importierbar und beginnen mit leerem Archiv. Formatdetails (komprimierte Daten, Integritätskontrolle, Kompatibilität) vor Implementierung als Tests fixieren.

## Zwei verschiedene Historien, nicht verwechseln

1. **Undo/Redo:** feine bestätigte Bearbeitungsschritte nur in der **aktuellen Sitzung**; Strg+Z, Strg+Y und Strg+Umschalt+Z; niemals in Datei oder PHP-Historie persistieren. Native Undo-Funktion in Textfeldern respektieren.
2. **Dateiversionen:** nur explizite erfolgreiche Speicherpunkte. Nach Klick auf **Speichern** wird ein neuer aktueller Stand zur Datei, die bisherige gespeicherte Fassung wandert in `versionHistory`. Wiederherstellung einer älteren Version eröffnet zunächst einen ungespeicherten Arbeitsstand; erneutes Speichern legt einen weiteren Speicherpunkt an und erhält den bisherigen Verlauf. `asOfDate`/Zeitreise ist eine getrennte **Ansicht** der fachlichen Ereignisse, kein Versions-Restore.

Unveränderte Projekte sollen beim bloßen Speichern keine Duplikate erzeugen. `dirty` bezieht sich auf die Abweichung vom zuletzt explizit gespeicherten Stand. Navigieren und Stichtagwechsel sind keine neuen Projektversionen.

## Gemeinsame Speicheroberfläche, unterschiedlicher Transport

- **Lokal:** zentraler Speichern-Button erzeugt einen neuen Download der **vollständigen aktuellen Datei samt Archiv**. Das Browserprogramm kann die bestehende Datei normalerweise nicht automatisch überschreiben. Download-Auslösung ist kein verifizierter Erfolg auf dem Dateisystem: Status und Warnung müssen dies ehrlich darstellen. Die unverschlüsselte lokale Arbeitskopie ist lediglich eine Wiederanlaufhilfe; größere Archive sollten in einer geeigneten browserinternen Ablage (z. B. IndexedDB) statt unkontrolliert in `localStorage` verwaltet werden. Bei geschützten Projekten niemals Klartextstände dauerhaft im Browser ablegen.
- **Online:** derselbe Speichern-Button verschlüsselt exakt dasselbe Projekt **mit eingebettetem Versionsarchiv** und lädt **eine aktuelle vollständige Datei** zum PHP-Server. Erfolg erst nach bestätigter Serverantwort. Kein zweites, abweichendes Versionsformat.
- **PHP-Backend künftig:** **keine separate fachliche Aufbewahrung unter `versions/` und keine wiederherstellbaren gesonderten Versionseinträge mehr.** Der Server speichert die aktuelle verschlüsselte Datei und knappe technische Metadaten. `expectedRevision`, monotone technische Revisionsnummer, Checkout-Lease, Sperren und atomare Schreibvorgänge bleiben **unbedingt** zur Konfliktvermeidung bestehen. Diese Revisionsnummer ist **kein** fachliches Versionsarchiv und erlaubt für sich allein keine Wiederherstellung.
- Versionen-Liste und Wiederherstellen liest die App nach Entschlüsselung aus `versionHistory`. Rückkehr zu einer Vorversion verändert **nicht sofort** die Serverdatei; erst bewusstes Speichern unter gültigem Checkout und passender Serverrevision tut das.
- Das E-Mail-Backup darf weiterhin die **verschlüsselte komplette aktuelle Datei** nach erfolgreichem Speichern versenden. Es ist ein separates Sicherungsmedium, **nicht** die primäre fachliche Versionshistorie. Alte versandte Anhänge behalten ihr ursprüngliches Passwort.

## Migration vorhandener PHP-Projekte (wichtig: keine Daten verlieren)

Die derzeit implementierte PHP-App speichert jede bestätigte Fassung als separate verschlüsselte Datei und liefert `versions`/`version`-APIs. Diese sind **Altbestand**, nicht Zielarchitektur.

1. Vor Umstellung alle vorhandenen Serverdateien und Revisionsarchive unverändert sichern; aktuell verwendete Bearbeitungsrechte/Checkout und alte Passwörter beachten.
2. Bei bestehendem Online-Projekt im Browser historische verschlüsselte Fassungen lesen und entschlüsseln; die auslesbaren **kompletten alten Fassungen** in zeitlicher Reihenfolge in das eingebettete Archiv überführen. Falls frühere Fassungen andere Passwörter verwenden, diese bei Bedarf explizit erfragen; der Server darf sie nicht entschlüsseln.
3. Vollständigkeit, Reihenfolge und die Fähigkeit, jeden importierten Snapshot wiederherzustellen, verifizieren. Bei fehlendem Passwort, Fehler oder Unterbrechung: **keine Altversion löschen**; Migration abbrechen oder verbleibende ältere Versionen zum Abruf/Export verfügbar halten.
4. Erst nach bestätigter Migration und unabhängiger Sicherung die alte serverseitige Versionsablage abschalten bzw. kontrolliert aufräumen; keine stille Löschung. Für nicht migrierbare Altstände klar gekennzeichneten Lese-/Exportpfad erhalten, bis der Betreiber bewusst entscheidet.
5. PHP-`save`/Restore-/Versions-API, verschlüsselten Import/Export und Mail-Backup an die neue Datei-Struktur anpassen. Die Migration muss bei wiederholter Ausführung idempotent sein (keine doppelten Archivstände).

## Tests und Sicherheitsbedingungen

- Portable Roundtrips: Speichern in HTML, Öffnen in anderem Browser und online sowie zurück; Historien und Zeitstempel bleiben identisch. Versionen vorwärts/rückwärts ansehen und verlustfrei als ungespeicherten Arbeitsstand wiederherstellen.
- Alte JSON-Projekte und alte PHP-Revisionsarchive; Migration mit alten/neuen Passwörtern; unvollständige oder korrupte Archive; Abbruch und Wiederaufnahme ohne Verlust.
- Historie bleibt beim Passwortwechsel als Teil des neu verschlüsselten aktuellen Gesamtpakets geschützt; separat früher versandte Backups nicht rückwirkend neu verschlüsselt.
- Zwei Browser, gleichzeitige Schreibversuche und abgelaufene Lease: HTTP-409/423-Schutz bleibt wirksam. Die eingebettete Historie darf bei Konflikt nicht still überschrieben, abgeschnitten oder zusammengeführt werden.
- Dateigröße, Kompressionszeit, Limits und Fehler bei Browser-Speicher-/Netz-/Serverquota; Statusanzeigen dürfen gescheiterten Download/Upload nicht als sicher gespeichert ausgeben.

**Abgrenzung:** Diese Festlegung ersetzt die bisherige fachliche PHP-Revisionshistorie, nicht den notwendigen technischen Revisions-/Konfliktschutz und nicht die optionale externe Katastrophensicherung.
