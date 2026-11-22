# Projektstand und Umsetzungsplan

**Neue Produktpriorität (22.11.2026):** Zuerst die bereits vorhandenen Fach-/UI-Fehler beheben, dann **einfaches, an Forderungsquellen und Gegenstände gebundenes Tracking tatsächlicher Zahlungen und externer Buchungen** ergänzen. Keine vollständige WG-Buchhaltung, keine dauerhaften Boolean-Bezahlstatus; der Klick auf „Als bezahlt erfassen“ erzeugt ein datiertes Ausgleichsereignis. Maßgebliche nach Priorität sortierte Aufgaben und Abnahmekriterien: [WG-Praxis-To-do](WG-PRAXIS-TODO.md). Das beschreibt eine **neue Vorgabe**, nicht bereits umgesetzten Code.

**Stand 21.11.2026: Forderungsprojektion, lokale Verschlüsselung, PHP-Dateispeicherung, Checkout und Versionshistorie implementiert; automatisierte Tests und PHP-Integration bestanden. GitHub Pages erfordert noch die einmalige Aktivierung durch den Repository-Administrator; PHP-Hosting und echter Mailversand noch nicht eingerichtet.** Quellprojekt: `hausstand-svelte/`, App-Version `0.7.0`, Hauptbranch `master`. Die Dokumentation trennt bewusst **vorhanden**, **geplant** und **getestet**.

## P0-Fehlerbehebung (22.11.2026)

- [x] **A01:** Aktive Gegenstände mit 0 € Zeitwert bleiben im Bestand, in den Eigentumsanteilen und in der Umverteilungs-Auswahl sichtbar. `projectAt()` filtert den aktiven Bestand nun ausschließlich nach dem Ereignisstatus; die Wertsumme bleibt 0 €. Regressionstests: `tests/projector.test.js` (Abschreibung, Übertragung ohne fiktive Forderung, Archivierung). Automatisierte CI- und Browserprüfung sind gesondert zu bestätigen.
- [x] **A02:** Ausgezogene Personen bleiben unabhängig von Besitzwert und Zahl der Gegenstände in der Personenliste und im Profil sichtbar. Die UI V3 kennzeichnet den Auszug und zeigt vorhandene Netto-Forderungssalden auch ohne Eigentum. Die Projektion berücksichtigt den Stichtag, sodass zukünftige Einzüge nicht vorzeitig angezeigt werden; Altbestand ohne Einzugsereignis bleibt über vorhandene Eigentumsanteile auffindbar. Regressionstests: `tests/projector.test.js` (80-€-Forderung, ohne Besitz/Anspruch, künftiger Einzug/Wiedereinzug, Altbestand). GitHub-Actions-Prüfung und manuelle Browserabnahme sind gesondert zu bestätigen.
- [x] **A03:** Dauerhaftes Löschen ist nur bei nachweislich unbeteiligten Personen erlaubt. Die gemeinsame Fachfunktion `src/lib/personDeletion.js` prüft alle Ereignisse (auch zukünftige/verschachtelte), Eigentumsanteile, `financedByPersonId`, Entwürfe und optionale Projektdaten auf Personen-ID-Referenzen. Bei Beteiligung bleibt die Person samt Geld- und Eigentumshistorie vollständig erhalten; die Löschschaltfläche ist in der Haupt- und UI-V3-Oberfläche gesperrt, mit erklärendem Hinweis. Nur reine `person-added`-Ereignisse werden beim Löschen einer nie beteiligten Person entfernt. Regressionstests: `tests/person-deletion.test.js` (ehemalige Finanziererin, frühere Eigentümer, verschachtelte Vorgänge, Entwürfe und negative Integritätsfälle). Browser-Abnahme bleibt separat erforderlich.
- [x] **A04:** Schenkungen/Korrekturen (`financialMode: 'none'`) zeigen in der Umverteilungsvorschau und im Markdown-Export keine Zahlungsvorschläge mehr. Eigentumswertverschiebungen bleiben sichtbar, aber ausdrücklich ohne Forderung. Beide Dialogversionen (auch historische Bearbeitung) und Timelines berücksichtigen den Modus; Altentwürfe ohne Finanzmodus bleiben neutral. Regressionstests: `tests/redistribution.test.js`; manuelle Browserabnahme offen.
- [ ] Weitere P0-Fehler **A05–A07** und die Zahlungserfassung bleiben offen. Maßgeblich ist die [priorisierte To-do-Liste](WG-PRAXIS-TODO.md).

## Bereits vorhanden (statisch im Code geprüft)

- Personen und Gegenstände mit historischen Ereignissen; Anteile zum Stichtag
- Linear/degressiv/fix bewertete Gegenstände
- Direkte und gruppierte Anteilsänderungen, Entwürfe, rückwirkende Korrektur
- Vorschau auf Wertverschiebung und **empfohlene** Zahlungen, aber keine tatsächlich gebuchten Zahlungen
- Lokale JSON-Dateien, `localStorage`-Arbeitskopie, Vite-/Standalone-HTML-Build

**Nicht vorhanden:** Erfassung tatsächlicher Geldzahlungen, automatische Echtzeit-Synchronisierung, neu verschlüsselte Althistorie nach Passwortwechsel sowie produktiv eingerichtetes PHP-/Mailhosting. GitHub Pages ist derzeit nicht aktiviert.

## Zwei priorisierte Produktfeatures + E-Mail-Sicherung

### A. Aus Ereignissen abgeleitete Forderungen und Nettoausgleich

[Fachkonzept und Korrekturregeln vollständig lesen](FEATURE-DEBT-LEDGER.md).

**Architekturänderung 20.11.2026:** Anders als im ersten Entwurf **keine persistenten Forderungsbuchungen, keine Checkbox, kein Ausgleichsstatus**. Forderungen entstehen allein durch die finanzielle Bedeutung von `project.events[]` und werden bei jeder Projektion wieder aus der Ereignishistorie berechnet.

- [x] Neue entgeltliche/unentgeltliche Anteilsänderungen explizit kennzeichnen; alte Events ohne Marker bleiben neutral.
- [x] `deriveClaims(project, asOfDate)` berechnet Forderungen mit Cent-Beträgen und Herkunftsreferenz auf Quell-/Child-Event.
- [x] Bilaterale Salden, freiwillige multilaterale Vereinfachung und Einzelvorgänge im Dashboard.
- [x] Rückwirkende Änderung/Löschung verändert Forderungsprojektion automatisch; keine zweite persistente Forderungsliste.
- [x] Bei neuen Gegenständen optional finanzierende Person dokumentieren.
- [x] Zehn Node-Tests und GitHub-Actions-Workflow erfolgreich auf `master` ausgeführt.
- [ ] Browser-/JSON-Roundtrip und reale End-to-End-Nutzung testen.
- [ ] **Neu priorisiert:** datierte, konkreten Forderungspositionen/Gegenständen zugeordnete Zahlungen, Teilzahlungen und externe Buchungen als Ausgleichsereignisse erfassen ([WG-Praxis-To-do](WG-PRAXIS-TODO.md)).

**Implementierung:** `src/lib/ledger.js`, `src/lib/projector.js` (`walkEvents`), `src/components/LedgerPanel.svelte`, `tests/ledger.test.js`. Keine persistenten `finance.postings[]`, keine Checkboxen und keine gesonderten Statusaktionen.

### B. Optionale verschlüsselte PHP-Online-Dateiablage

[Architektur & Workflow vollständig lesen](FEATURE-COLLABORATIVE-STORAGE.md).

- [x] Zwei Artefakte aus einer Svelte-App: `hausstand-standalone.html` und `hausstand.php`.
- [x] Mehrere Dateien, öffentliche Anzeigenamen, eigenes Passphrase-geschütztes Projekt pro Datei.
- [x] Checkout/Checkin pro Datei mit **2-Stunden-Lease**, manuelle Verlängerung, automatische Ungültigkeit bei Fristende.
- [x] Schreiboperationen mit Lease und `expectedRevision`; keine stillen Überschreibungen.
- [x] Verschlüsselte Vorversionen und Wiederherstellung als neue Revision.
- [x] Passwort für aktuelle Version ändern; **Bearbeitungsberechtigung rotieren**.
- [ ] Historische Serverversionen bei Passwortwechsel ebenfalls vollständig neu verschlüsseln (aktuell alte Passphrase nötig).
- [x] Datei-API sieht nur Ciphertext und Bearbeitungs-Token-Hash; Datenordner außerhalb des Webroots erforderlich.
- [x] Gleiches verschlüsseltes Format für lokale Dateien und PHP-Ablage.
- [ ] Server mit HTTPS produktiv einrichten, Zwei-Browser-Tests, Sicherheitsreview.

[Sicherheits- und Verschlüsselungsmodell vollständig lesen](SECURITY-AND-ENCRYPTION.md). Wichtige Grenze: Ein kompromittierter Server, der Web-Code ausliefert, kann Browser-Passwörter trotz clientseitiger Datei-Verschlüsselung abgreifen.

### C. E-Mail-Backup verschlüsselter Revisionen

Als Unterfunktion des Online-Modus:

- [x] Nach jedem bestätigten Speichern verschlüsselten Mail-Anhang mit PHP `mail()` versuchen.
- [x] Empfänger und Absender serverseitig per Umgebungsvariablen; PHP-Mailtransport des Hosts erforderlich.
- [x] Mailfehler beeinflusst die gesicherte Datei nicht; fehlgeschlagene Versionen werden beim nächsten Speichern erneut versucht (max. 5 Versuche).
- [ ] Eigenständige zeitgesteuerte Mail-Retry-Warteschlange und tatsächliche Zustellungsprüfung.
- [x] Kein Passwort und keine Klartextprojektdaten in E-Mail; Betreff nennt nur Versionsnummer.

## Vorgehensreihenfolge (Empfehlung)

1. **Basis absichern:** `npm ci`, `npm run build:single`, fachliche Tests einrichten (bisher nicht ausgeführt); ältere JSON-Beispiele anonymisiert sichern.
2. **Forderungen vor Online-Betrieb:** Grundfunktionen in `master` umgesetzt; CI erfolgreich; Browser-/Import-Export-Abnahme abschließen.
3. **Verschlüsselung:** Crypto-Modul, lokaler Import/Export und Cache-Schutz umgesetzt; externe Sicherheitsabnahme und Passwortwechsel der Historie bleiben offen.
4. **PHP-Server:** API, Mehrdateienliste, Checkout/Revisionsschutz und Versionen implementiert; reales Hosting und Browserabnahme noch offen.
5. **Passwortwechsel und E-Mail:** Berechtigungsrotation und PHP-Mailversand umgesetzt; historische Versionen reencrypten und zuverlässige Zustellungs-/Retry-Tests ergänzen.
6. **Integration/CI/Release:** Zwei-Browser- und Sicherheitstests, Offline-/Online-Abnahme, Deployment-Anleitung. GitHub Pages ist optional nur für statische Offline-Variante; **PHP läuft nicht auf GitHub Pages**.

## Noch offene Produktentscheidungen – vorgeschlagene Defaults

| Frage | Vorschlag |
| --- | --- |
| Muss eine Forderung abgehakt werden? | **Nicht als gespeicherte Checkbox.** Ein Klick auf „Als bezahlt erfassen“ schreibt ein datiertes Ausgleichsereignis; offen/bezahlt/extern verbucht wird daraus abgeleitet. |
| Müssen Forderungen gespeichert werden? | **Nein.** Fachereignisse sind Quelle, Forderungen werden live rekonstruiert |
| Tatsächliche Zahlungen zusätzlich erfassen? | **Ja, priorisiert**; mit Verbindung zur Quellforderung und zum Gegenstand. Auch Teilzahlungen und externe Buchungen unterscheiden. |
| Multilaterale Vereinfachung? | Als Vorschau zusätzlich zur sicheren bilateralen Saldierung, nicht automatisch rechtliche Erfüllung |
| Neue Gegenstände ohne bekannten Finanzierer? | Keine automatisch generierten Geldforderungen |
| Alte Anteilsereignisse nach Update? | Ohne ausdrückliche Aktivierung keine automatische rückwirkende Schuldenerzeugung |
| Historische Korrektur/Löschung? | Quellereignis ändern; alle betroffenen Forderungen/Saldos neu berechnen, keine separate Synchronisierung |
| Komplettauflösung ohne Rest-Eigentümer? | Übernehmer/Verwertung explizit erfassen |
| Mehrere online bearbeitende Personen? | Ein Checkout-Inhaber pro Datei, keine Live-Merge-Funktion |
| Lease-Zeit? | 2 h seit letzter **echter** Bearbeitungsaktivität, keine passive Dauerverlängerung |
| Versionen? | Jede bestätigte neue Revision erhalten, Restore ist neuer Commit |
| Dateinamen öffentlich? | Ja, Inhaltsverschlüsselung pro Datei; das ist bewusste Metadaten-Offenlegung |
| Alle dürfen Dateien anlegen/löschen? | Nein, öffentlich erreichbare Instanz braucht zusätzliches Workspace-Verwaltungsrecht |
| Passwort/Krypto? | Browserseitig, starkes KDF und AES-GCM; Details mit Security-Review finalisieren |

## Pflege und Qualitätsregeln

Die Detailentwürfe sind **keine Funktionszusagen**, sondern der aktuelle Entwicklungsplan. Änderungen am Quellcode jeweils mit Tests, Schema-/Migrationsdokumentation und Aktualisierung dieser Roadmap begleiten. Erst dann „umgesetzt“ markieren.

Ausführliche Akzeptanzfälle: [Entwicklung](DEVELOPMENT.md). Vor neuen Aufgaben stets [AGENTS.md](../AGENTS.md) lesen.


## Deployment-Pflichtschritte (21.11.2026)

- [ ] Unter Repository-Settings → Pages als Source **GitHub Actions** aktivieren (CI-Token darf die Seite nicht erstmalig erzeugen).
- [ ] Pages-Workflow danach neu starten und tatsächliche URL prüfen.
- [ ] Für Online-Ablage separaten PHP-Webserver mit HTTPS und privatem Datenordner einrichten.
- [ ] Workspace-Schlüssel und optionale Backup-Mailkonfiguration als Server-Umgebungsvariablen setzen.
- [ ] PHP-Dienst mit Browser von GitHub Pages aus testen (CORS `HAUSSTAND_ALLOW_ORIGIN`).
- [ ] Vollständige Backup-, Passwortwechsel- und Konfliktprüfung mit Testdaten durchführen.

[Konkrete Anleitung](DEPLOYMENT.md).
