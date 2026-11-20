# Projektstand und Umsetzungsplan

**Stand 20.11.2026: Forderungsprojektion auf Feature-Branch implementiert, CI/Browsertests noch offen; PHP-/Krypto-/E-Mail-Funktionen weiter geplant.** Quellprojekt: `hausstand-svelte/`, App-Version `0.7.0`, Hauptbranch `master`. Die Dokumentation trennt bewusst **vorhanden**, **geplant** und **getestet**.

## Bereits vorhanden (statisch im Code geprüft)

- Personen und Gegenstände mit historischen Ereignissen; Anteile zum Stichtag
- Linear/degressiv/fix bewertete Gegenstände
- Direkte und gruppierte Anteilsänderungen, Entwürfe, rückwirkende Korrektur
- Vorschau auf Wertverschiebung und **empfohlene** Zahlungen, aber keine tatsächlich gebuchten Zahlungen
- Lokale JSON-Dateien, `localStorage`-Arbeitskopie, Vite-/Standalone-HTML-Build

**Nicht vorhanden:** Erfassung tatsächlicher Geldzahlungen, Verschlüsselung, PHP-Dateispeicherung, Checkout/Checkin, Versionsarchiv, Passwortwechsel, E-Mail-Sicherung, automatisierte Tests und CI. GitHub Pages ist derzeit nicht aktiviert.

## Zwei priorisierte Produktfeatures + E-Mail-Sicherung

### A. Aus Ereignissen abgeleitete Forderungen und Nettoausgleich

[Fachkonzept und Korrekturregeln vollständig lesen](FEATURE-DEBT-LEDGER.md).

**Architekturänderung 20.11.2026:** Anders als im ersten Entwurf **keine persistenten Forderungsbuchungen, keine Checkbox, kein Ausgleichsstatus**. Forderungen entstehen allein durch die finanzielle Bedeutung von `project.events[]` und werden bei jeder Projektion wieder aus der Ereignishistorie berechnet.

- [x] Neue entgeltliche/unentgeltliche Anteilsänderungen explizit kennzeichnen; alte Events ohne Marker bleiben neutral.
- [x] `deriveClaims(project, asOfDate)` berechnet Forderungen mit Cent-Beträgen und Herkunftsreferenz auf Quell-/Child-Event.
- [x] Bilaterale Salden, freiwillige multilaterale Vereinfachung und Einzelvorgänge im Dashboard.
- [x] Rückwirkende Änderung/Löschung verändert Forderungsprojektion automatisch; keine zweite persistente Forderungsliste.
- [x] Bei neuen Gegenständen optional finanzierende Person dokumentieren.
- [x] Node-Testfälle und GitHub-Actions-Workflow ergänzt (Ausführung im PR prüfen).
- [ ] Browser-/JSON-Roundtrip und reale End-to-End-Nutzung testen.
- [ ] Optional später echte Zahlungen als datierte Gegenbuchungsereignisse erfassen.

**Implementierung:** `src/lib/ledger.js`, `src/lib/projector.js` (`walkEvents`), `src/components/LedgerPanel.svelte`, `tests/ledger.test.js`. Keine persistenten `finance.postings[]`, keine Checkboxen und keine gesonderten Statusaktionen.

### B. Optionale verschlüsselte PHP-Online-Dateiablage

[Architektur & Workflow vollständig lesen](FEATURE-COLLABORATIVE-STORAGE.md).

- [ ] Eine Svelte-Quellbasis mit **zwei Artefakten**: offline `hausstand-standalone.html` und optional `hausstand.php` (HTML + kleine PHP-Speicher-API).
- [ ] Mehrere Dateien mit sichtbaren Anzeigenamen, pro Datei eigenes Entschlüsselungspasswort, gemeinsame Arbeitsordner-Ansicht.
- [ ] Checkout/Checkin pro Datei; Lease nach standardmäßig **zwei Stunden Inaktivität** automatisch freigeben.
- [ ] Jeder Speichervorgang verlangt gültige Lease und passende Basisrevision; fremde/abgelaufene Bearbeitung darf keine Änderungen überschreiben.
- [ ] Jede bestätigte Speicherung erzeugt eine verschlüsselte Vorversion; Wiederherstellen erzeugt eine **neue** Revision.
- [ ] Pro Datei Passwort setzen/ändern; bestehende Versionshistorie bei Schlüsselwechsel konsistent behandeln.
- [ ] Webserver speichert nur **Ciphertext**, separate Datei-/Edit-Autorisierung, Datenordner außerhalb Webroot; HTTPS und Sicherheitsprüfung.
- [ ] Lokaler verschlüsselter Export/Import nutzt **dasselbe** Format unabhängig vom Server.

[Sicherheits- und Verschlüsselungsmodell vollständig lesen](SECURITY-AND-ENCRYPTION.md). Wichtige Grenze: Ein kompromittierter Server, der Web-Code ausliefert, kann Browser-Passwörter trotz clientseitiger Datei-Verschlüsselung abgreifen.

### C. E-Mail-Backup verschlüsselter Revisionen

Als Unterfunktion des Online-Modus:

- [ ] Nach jedem **bestätigten** neuen Revisionsstand eine E-Mail mit **verschlüsseltem Dateianhang** an konfigurierte Empfänger vorbereiten.
- [ ] SMTP/Transport und Empfänger nur serverseitig konfigurieren, keine beliebige offene Mail-Relay-API.
- [ ] Bei Mailfehler bleibt die Datei gespeichert; Versandstatus/Retry-Warteschlange, keine doppelten Mails je Revision.
- [ ] Kein Passwort, keine Klartext-Daten im E-Mail-Inhalt; sichtbare Metadaten im Betreff bewusst minimieren.

## Vorgehensreihenfolge (Empfehlung)

1. **Basis absichern:** `npm ci`, `npm run build:single`, fachliche Tests einrichten (bisher nicht ausgeführt); ältere JSON-Beispiele anonymisiert sichern.
2. **Forderungen vor Online-Betrieb:** Grundfunktionen im Feature-Branch umgesetzt; CI und Browser-/Import-Export-Abnahme abschließen.
3. **Verschlüsselung unabhängig vom Speicher:** formatversioniertes Crypto-Modul, lokaler verschlüsselter Export/Import, keinen Klartext-Cache im Verschlüsselungsmodus, Sicherheits-/Dateiformat-Tests.
4. **Speicheradapter und PHP-Server:** `documentStore`, API, eine Deploy-PHP-Datei, Mehrdateienliste, Checkout/Lease/Revisionsschutz und Versionshistorie.
5. **Passwortwechsel und E-Mail:** historische Versionen reencrypten, Bearbeitungsberechtigung rotieren, Mail-Queue und Retries.
6. **Integration/CI/Release:** Zwei-Browser- und Sicherheitstests, Offline-/Online-Abnahme, Deployment-Anleitung. GitHub Pages ist optional nur für statische Offline-Variante; **PHP läuft nicht auf GitHub Pages**.

## Noch offene Produktentscheidungen – vorgeschlagene Defaults

| Frage | Vorschlag |
| --- | --- |
| Muss eine Forderung abgehakt werden? | **Nein.** Gegenläufige Eigentums-/Ausgleichsereignisse saldieren automatisch; Status ist abgeleitet (Saldo null) |
| Müssen Forderungen gespeichert werden? | **Nein.** Fachereignisse sind Quelle, Forderungen werden live rekonstruiert |
| Tatsächliche Zahlungen zusätzlich erfassen? | Nur optional später über eigenes datiertes Gegenbuchungsereignis, niemals als Boolean |
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
