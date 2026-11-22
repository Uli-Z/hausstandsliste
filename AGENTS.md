# Projektleitfaden für Entwicklungsagenten – Hausstandsliste

Dieses Dokument ist der kurze Einstieg für neue Entwicklungs-Sitzungen. **Zuerst diese Dateien lesen**:

1. [README.md](README.md) – Ziel, Schnellstart, Funktionsumfang
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – Datenmodell und Ereignisprojektion
3. [docs/ROADMAP.md](docs/ROADMAP.md) – tatsächlicher Stand, offene Produktentscheidungen
4. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) – Build und manuelle Prüfungen
5. [hausstand-svelte/GEMINI.md](hausstand-svelte/GEMINI.md) – technische Regeln nahe am Code

## Wo wird entwickelt?

- Produktiver Quellcode: `hausstand-svelte/` (Svelte/Vite), Einstieg `src/App.svelte`
- Zustand und Mutationen: `src/stores/projectStore.js`
- Fachlogik: `src/lib/` (insbesondere `projector.js`, `redistribution.js`, `persistence.js`)
- UI: `src/components/`; globale Styles: `src/styles.css`
- `vorlage.html` ist eine **historische Referenz**, keine parallel zu pflegende App.
- Build-Ergebnis `dist/hausstand-standalone.html` wird erzeugt, nicht versioniert.

## Unverrückbare Produktprinzipien

1. **Offline-first als dauerhafte Fähigkeit:** Die eigenständige HTML-Datei und der lokale JSON-Import/-Export müssen erhalten bleiben. **Implementiert** ist ein optionaler PHP-Online-Modus aus demselben Svelte-Quellcode, kein verpflichtender Server und keine zweite UI. Siehe `docs/FEATURE-COLLABORATIVE-STORAGE.md`.
2. **Projekt-JSON ist die dauerhafte Datenquelle**; `localStorage` ist nur eine Arbeitskopie. Import-/Exportfähigkeit und Rückwärtskompatibilität beachten.
3. **Historische Ereignisse:** `projectAt(project, asOfDate)` muss bei gleicher Eingabe dasselbe Ergebnis liefern; Ereignisse nach `date` und `order` sortieren.
4. **Entitäten per stabiler ID referenzieren**, Anteile als relative Einheiten speichern (nicht als gerundete Prozentangaben).
5. **Datenänderungen nur über `appState.mutateProject(...)`** bzw. die Store-Aktionen; keine direkte Mutation von `$appState.project`.
6. Die vorhandene Funktionsparität zur alten HTML-Version schützen. Bestehende Imports und historische Projektdateien nicht stillschweigend verändern.
7. **Umverteilung ≠ Ausgleich.** Die App berechnet jetzt Forderungen und Nettosalden aus entgeltlichen Ereignissen, erfasst aber keine realen Geldzahlungen. Für die geplante Forderungsverwaltung siehe `docs/FEATURE-DEBT-LEDGER.md`: Forderungen **ausschließlich aus Quellereignissen ableiten** (keine gespeicherten Postings/Checkboxen), Ereignis-ID als Herkunft, centgenaue Nettosalden und automatische Neuberechnung bei Datum-/Wertänderung oder Löschung.
8. **Verschlüsselung/Backend nicht mit Fachlogik vermengen.** Projekt-JSON, Crypto-Container und lokaler/remote Speicheradapter sind getrennte Schichten. Die implementierte Browser-Verschlüsselung darf niemals durch unverschlüsseltes lokales Caching unterlaufen werden; kein Passwort an PHP senden. Vor Umsetzung `docs/SECURITY-AND-ENCRYPTION.md` lesen.
9. **Bereitstellung prüfen:** PHP-API, Checkout, Versionen, E-Mail-Anbindung und Verschlüsselung sind implementiert. Der PHP-Server muss separat installiert und konfiguriert werden; GitHub Pages benötigt einmalige Aktivierung. E-Mail-Versand und Browser-Verhalten sind nicht durch eine End-to-End-Abnahme belegt.

## Bei jeder neuen Sitzung

- Aktuelle Dateien und Branches abrufen; nie allein aus früheren Antworten auf den Arbeitsstand schließen.
- `README.md`, `docs/ROADMAP.md` und betroffene Quelldateien lesen.
- Änderungen gezielt und klein halten; Datenmodell-Änderungen auf Migration, Stichtage, JSON-Export und alte Ereignisse prüfen.
- Nach Codeänderungen `npm ci`, `npm run check:js`, `npm run build:single` und die manuellen Tests aus [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) durchführen. Nicht ausgeführte Tests ausdrücklich nennen.
- Dokumentation und Roadmap im selben Arbeitsschritt aktualisieren; **„umgesetzt“ nur nach Sichtung des Codes**, „getestet“ nur nach tatsächlichem Test.

## Status der Dokumentationsüberarbeitung (20.11.2026)

Die Dokumentation wurde anhand der Dateien im Branch `master` aktualisiert. In dieser Sitzung wurde kein Build ausgeführt und kein Anwendungscode geändert. Das Projekt besitzt bislang keine automatisierte Testsuite und keine eingerichtete GitHub-Pages-Veröffentlichung.

**Geplante nächste Produktpunkte (20.11.2026):** (1) dynamisch aus Events abgeleitete Forderungen/Nettoschulden (ohne gespeicherten Ausgleichsstatus); (2) optionale verschlüsselte PHP-Online-Ablage mit Checkout, Revisionen und Versionshistorie; (3) verschlüsselte E-Mail-Kopie je Revision und lokal nutzbares Verschlüsselungsformat. Forderungsableitung, Verschlüsselung, PHP-API und E-Mail-Anbindung sind implementiert; externes PHP-Hosting, Seitenfreischaltung und End-to-End-Abnahme sind offen. [Roadmap](docs/ROADMAP.md).


## Implementierung der Forderungsableitung (in `master`, 20.11.2026)

Neue Module: `src/lib/ledger.js`, `src/components/LedgerPanel.svelte`, `tests/ledger.test.js`, `.github/workflows/ci.yml`. Eigentums- und Finanzprojektion verwenden denselben `walkEvents`-Ablauf. Keine Postings/Checkboxen persistieren; die einzigen zusätzlichen Fachdaten sind optionale Felder `financialMode` und `financedByPersonId` an bestehenden Events. Neue Änderungen sind standardmäßig entgeltlich, Alt-Events ohne Marker finanziell neutral. GitHub CI hat die zehn Fachlogiktests und den Standalone-Build erfolgreich ausgeführt. Manuelle Browser-/JSON-Tests stehen aus. PHP/Krypto/E-Mail sind im Code und separat auf einem PHP-Server zu betreiben.


## Speicher-/Verschlüsselungsschicht (21.11.2026)

- `hausstand-svelte/src/lib/crypto.js`: versioniertes AES-256-GCM-Containerformat mit PBKDF2-HMAC-SHA256 und 600.000 Iterationen; editToken bleibt im Ciphertext.
- `hausstand-svelte/src/components/StoragePanel.svelte`: verschlüsselter lokaler Import/Export und Browser-UI für PHP-Speicher, Locks, Revisionen, Passwortwechsel.
- `hausstand-svelte/src/stores/projectStore.js`: `secure` verhindert Klartext-`localStorage`, `readOnly` schützt gesperrte Online-Dokumente.
- `hausstand-svelte/server-php/backend.php`: alleinige PHP-API-Vorlage; `scripts/build-php.mjs` fügt sie mit der gebündelten Svelte-HTML zur `dist/hausstand.php` zusammen.
- `hausstand-svelte/server-php/smoke.mjs`: Integrationstest mit temporärem PHP-Server, Testdaten und Lease-/Revisionsprüfungen.
- `.github/workflows/pages.yml` enthält die statische Veröffentlichung, die **einmalig in den GitHub-Reposettings aktiviert werden muss**, falls der CI-Token die Seitenanlage nicht autorisiert.
- **Nicht behaupten:** PHP auf GitHub Pages, produktiv bestätigter E-Mail-Versand, durchgängig neu verschlüsselte Historie nach Passwortwechsel oder bereits erfolgte externe Sicherheitsprüfung.
- [Installationsanleitung](docs/DEPLOYMENT.md) beachten; keine realen Passwörter/Konfigurationen in Repository committen.


## Forderungsjournal – verbindliches Modell (22.11.2026)

- **Eine Geldprojektion, keine Zahlung-zu-Kauf-Verknüpfung.** `deriveClaims()` leitet ursprüngliche Forderungen aus Anschaffungen/Anteilsbewegungen ab. `deriveSettlementCounterclaims()` erzeugt aus jeder unabhängig dokumentierten Zahlung eine Gegenforderung mit umgekehrter Richtung. `ledgerAt()` saldiert alle Buchungen bilateral, ohne Gegenbuchungen zu deckeln.
- Der Zahlungsbetrag bleibt auch nach Rückdatierung, Änderung oder Löschung eines Kaufes unverändert. Ein Überschuss ist ein Anspruch in Gegenrichtung.
- `src/lib/claimSettlement.js` validiert `claim-settlement-recorded`; `sourceEventId`, `childEventId`, `itemId` sind optional und wirken **nie** auf die Zahlung. Frühere Module `claimMatching.js` und `settlementBalances.js` wurden entfernt.
- Ein-Klick-„Als beglichen“ erzeugt künftig über `paymentForBalance()` lediglich ein unabhängiges `paid`-Ereignis für den **bilateralen Nettobetrag**. Eine Einzelgegenstandszuordnung, Bezahlflag oder weitere Schuldenliste sind ausdrücklich nicht vorgesehen.
- `external` und `waived` sind eigene **nicht-bar**-Kennzeichnungen im selben Geldjournal. Nicht als Geldüberweisung darstellen.
- Aktuell sind die Saldenberechnung und Timeline-/Geld-Anzeigen angepasst; Erfassungs- und Editierdialoge sind noch nicht vorhanden. Gezielte Tests in isolierter JavaScript-Ausführung erfolgreich, npm-/Build-/Browserabnahme offen. [To-do](docs/WG-PRAXIS-TODO.md).
