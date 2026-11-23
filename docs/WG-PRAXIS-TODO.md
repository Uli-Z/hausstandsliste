# Hausstandsliste – priorisierte To-do-Liste

**Aktualisiert: 23.11.2026 · Branch `master` · Maßgeblich ist die mobile UI V3.**

Diese Liste ersetzt die ursprüngliche Planung vom 22.11.2026. Sie ist mit dem derzeitigen Quellcode und den letzten Commits abgeglichen. **`[x]` bedeutet: im Code vorhanden bzw. umgesetzt – nicht automatisch im Browser oder im aktuellen CI-Lauf erfolgreich abgenommen.** Wo eine vollständige Prüfung fehlt, steht dies ausdrücklich dabei.

Die aktuelle Fachentscheidung ist in [Gemeinschaftlicher Wertausgleich](FEATURE-COMMUNAL-SETTLEMENT.md) dokumentiert. `docs/ROADMAP.md` enthält zusätzlich die längerfristigen Themen Verschlüsselung, PHP, Mail und Deployment.

## Produktprinzipien – weiterhin verbindlich

- **Gegenstände und Eigentumsanteile zuerst.** Keine vollständige Haushaltsbuch-, Kassen- oder Banking-App.
- **Ein gemeinschaftlicher Ausgleichssaldo je Person** aus historisch eingebrachtem Wert, übernommenen/abgegebenen Anteilen und dokumentierten Ausgleichen. Die primären Vorschläge ergeben sich aus `ledgerAt().simplified`, nicht aus einer dauerhaft abzuarbeitenden Liste bilateraler Einzelschulden.
- **Eine tatsächlich erfolgte Zahlung ist ein eigenständiges, datiertes Ereignis** mit Zahlender, Empfangender und Betrag. Sie ist weder einer Anschaffung zugeordnet noch bei nachträglicher Änderung der Anschaffung zu löschen oder anzupassen. Teil- und Überzahlungen bleiben erhalten.
- **Keine „bezahlt“-Checkboxen, keine gespeicherten Forderungslisten.** Forderungen und Salden werden aus den Ereignissen berechnet. `paid` ist eine wirkliche Zahlung; `external` und `waived` sind nichtbare Verrechnungen.
- **Gemeinschaftliche Saldierung nur nach Vereinbarung.** Eine optimierte Zahlung an eine andere positive Saldenperson ersetzt ohne entsprechende Abrede keine rechtlich eigenständige Forderung.
- **Schlanke Oberfläche:** Zahlen und Aktionen direkt, Hintergrundwissen nur über kontextbezogene `?`-Hilfe; keine dekorativen Tags/Badges oder unnötigen Erklärungstexte. Wichtige Warnungen und die Bestätigung, dass eine Zahlung wirklich erfolgt ist, bleiben sichtbar.
- **Offline-HTML und getrennt konfigurierter PHP-Build** teilen die Fachlogik; Alt-JSON und historische Stichtage dürfen nicht brechen.

## 1. P0 – Als Nächstes: Qualität und Freigabefähigkeit

Die folgenden Punkte sind **noch offen**. Nicht nochmals die bereits umgesetzten Grundfunktionen neu entwickeln.

- [x] **Q01 · Vollständige automatisierte Regression laufen lassen.** `cd hausstand-svelte && npm ci && npm test && npm run check:js`. Insbesondere `tests/community-balances.test.js`, `tests/payment-counterclaims.test.js`, `tests/claim-settlement.test.js`, `tests/chronology.test.js`, `tests/financial-labels.test.js` und `tests/settlement-ui.test.js`. **Abgenommen am 23.11.2026:** GitHub Actions [Svelte app checks, Lauf 45118131756](https://github.com/Uli-Z/hausstandsliste/actions/runs/45118131756) auf Commit [`55cebf836ecbd605ac867e0376840b6c7163ef49`](https://github.com/Uli-Z/hausstandsliste/commit/55cebf836ecbd605ac867e0376840b6c7163ef49); `npm ci`, `npm run check:js` und `npm test` erfolgreich, **87 Tests bestanden, 0 fehlgeschlagen**. Der **gesamte CI-Workflow** ist anschließend bei `build:php` gescheitert; dieser Fehler gehört zu Q02, nicht zu Q01.
- [ ] **Q02 · Alle relevanten Buildvarianten prüfen.** `npm run build:single`, `npm run build:ui-v3`, `npm run build:php`, `php -l dist/hausstand.php` und ggf. `node server-php/smoke.mjs`. Besonders auf Svelte-Compilerfehler in den neuen `HelpTip`-Einbindungen, auf nicht erreichbare Dialog-Footer und auf funktionierenden Standalone-Start achten. **Status (23.11.2026):** Aktueller [CI-Lauf 45118131756](https://github.com/Uli-Z/hausstandsliste/actions/runs/45118131756): Offline-HTML-Build erfolgreich, **PHP-Build fehlgeschlagen** bei `scripts/inline-ui-v3.mjs --php` (Assertion erwartet `data-label="Betrag"`); nachfolgende Build-/Smoke-Schritte deshalb nicht ausgeführt. Fehlerreproduktion und Behebung ausstehend.
- [ ] **Q03 · Fachliche Ende-zu-Ende-Abnahme des Wertausgleichs.** Ein vollständiges Testprojekt anlegen und im echten Browser durchspielen: 300-€-Kauf durch Anna bei drei gleichen Anteilen → Anna +200 €, Ben/Clara je −100 €; Ben zahlt 60 € an Anna → Anna +140 €, Ben −40 €, Clara −100 €; Clara zahlt 100 €, Ben die verbleibenden 40 € → alle Salden 0 €. Danach Überzahlung, Gegenforderung, entgeltliche/unentgeltliche Anteilsänderung, abweichender Zahlungsempfänger bei vereinbarter Gruppensaldierung, historische Stichtage sowie Änderung/Löschung von Kauf und Zahlung testen. **Status:** fachliche Testfälle existieren im Code; ein kompletter UI-Test ist offen.
- [ ] **Q04 · Mobile und Desktop-Bedienung abnehmen.** Bei 320–390 px, Tablet und Desktop testen: Startseite, Personenprofil, Gegenstandsdetail, Geldübersicht, Zeitleiste, Ausgleichsdialog, Anteilsübertragung. Keine horizontalen Überläufe oder riesigen Eingabefelder; Dezimalbetrag, Enter/Fokus, Abbrechen/Speichern und mobile Footer funktionieren. `?`-Hilfe öffnet und schließt bei Klick, außerhalb, Escape und Scrollen; keine abgeschnittenen oder verdeckten Popovers. **Status:** entsprechende CSS-/UI-Anpassungen und statische Regressionen vorhanden, tatsächlicher Browsertest ausstehend.
- [ ] **Q05 · Import/Export und historische Kompatibilität abnehmen.** Unverschlüsselte und verschlüsselte JSON-Projekte mit alten und neuen Ereignissen importieren, ändern, exportieren und erneut laden. Projekte ohne `financialMode` dürfen keine rückwirkenden Geldforderungen bekommen. Datums-/Reihenfolge-Korrektheit, Rundung in Cent und an der Geldhistorie beteiligte ausgezogene Personen verifizieren; Standalone und PHP vergleichen. **Status:** umfangreiche einzelne Fachtests vorhanden, vollständiger Roundtrip noch nicht bestätigt.
- [ ] **Q06 · UI-Warnungen und Fehlbuchungen praktisch testen.** Null-/Negativbeträge, zu viele Nachkommastellen, ungültige Daten, identische/fehlende Personen, doppelte Event-IDs, mehrfaches schnelles Speichern, schreibgeschütztes Projekt, abgewiesene Mutation und Datum nach dem aktuellen Stichtag. Die App muss den Zustand unverändert lassen und verständlich reagieren. **Status:** Validierung, `busy`-Sperre, Warnungen und Stichtagswechsel sind implementiert, praktische Abnahme ausstehend.

## 2. P1 – Nach bestandener Basisprüfung

- [ ] **Q07 · Letzter UX-Feinschliff nach echten Tests.** Nur nach reproduzierbaren Befunden: kleine `?`-Hilfe, präzise Schaltflächenbezeichnungen, klare Zahlungsrichtung, nachvollziehbare persönliche Saldorechnung und übersichtliche Historie. Insbesondere prüfen, ob „Ausgleichen“ ohne Kontext als reale Überweisung missverstanden wird. Keine zusätzlichen dauerhaften Erklärungstexte einbauen.
- [ ] **Q08 · Dokumentation auf einen konsistenten Stand bringen.** `README.md`, `hausstand-svelte/README.md`, `AGENTS.md`, `GEMINI.md`, `ARCHITECTURE.md`, `ROADMAP.md` und ältere Feature-Dokumente enthalten teils noch historische Aussagen wie „Zahlungen noch nicht implementiert“, bilaterale Schuldübersicht als Primärmodell oder unbestätigten Pages-Status. Alte Abschnitte als historisch kennzeichnen oder aktualisieren, statt zusätzliche widersprechende Statusblöcke anzuhängen. Einen erfolgreichen Test/Build erst nach tatsächlicher Ausführung behaupten.
- [ ] **Q09 · Veröffentlichung der aktuellen V3 prüfen.** GitHub-Pages-Workflow, tatsächliche veröffentlichte URL und neueste sichtbare Version kontrollieren. Das Pages-Hosting bleibt **rein statisch**; die PHP-Variante wird separat gebaut und bereitgestellt. **Status:** Workflow und Veröffentlichungscode vorhanden; aktueller Deployment-Erfolg wurde hier nicht verifiziert.

## 3. P1 – Nur für eine wirklich genutzte PHP-Installation

Diese Arbeiten sind **keine Voraussetzungen für die rein lokale HTML-Nutzung**. Die Sicherheits-/Deployment-Aufgaben aus [Roadmap](ROADMAP.md) und [Deployment](DEPLOYMENT.md) bleiben maßgeblich.

- [ ] **S01 · Reales HTTPS-/PHP-Hosting prüfen:** privater beschreibbarer Datenordner außerhalb des Webroots, keine Klartextauslieferung der PHP-Datei, Zugriffsrechte, Schutz vor öffentlichem Erstellen/Löschen, Sicherheits-Header und PHP-Version.
- [ ] **S02 · Zwei-Browser-Tests für Online-Projekte:** Checkout/Checkin, konkurrierende Schreibversuche, Konflikte, Ablauf/Erneuerung der Lease, Revisionen, Restore, Passwort- und Berechtigungsrotation, verschlüsselter Import/Export.
- [ ] **S03 · Verschlüsselte E-Mail-Sicherung mit echtem Mailserver prüfen:** Zustellung, Fehlermeldungen und Retry-Verhalten; `mail()`-Aufruf bedeutet nicht automatisch tatsächliche Zustellung.
- [ ] **S04 · Sicherheitsgrenzen und Passwortwechsel dokumentieren/entscheiden:** alte Revisionen und bereits versandte Mail-Anhänge werden beim Passwortwechsel derzeit nicht rückwirkend neu verschlüsselt. Eine komplette Re-Verschlüsselung der Serverhistorie nur dann entwickeln, wenn sie für das gewählte Betriebskonzept notwendig ist.

## 4. Bereits implementiert – nicht mehr als offene Entwicklung führen

| Bisherige IDs | Geprüfter Implementierungsstand | Abnahme |
| --- | --- | --- |
| **A01–A03** | Abgeschriebene aktive Gegenstände, ausgezogene Personen und historisch sicheres Personenlöschen im Fachcode berücksichtigt | Automatisierte Tests vorhanden; Browserabnahme siehe Q03–Q05 |
| **A04–A05** | Unentgeltliche Übertragung ohne Forderungsvorschläge; ungültige eigentümerlose Gegenstände bei neuen Änderungen verhindern | Tests vorhanden; Browserabnahme offen |
| **A06–A07** | Zahlungs-, Forderungs- und Vorschlagsbegriffe getrennt; historische Ereignispositionen und Stichtage überarbeitet | Tests vorhanden; Gesamtlauf Q01 |
| **B01–B03, B07, B12** | Eigenständige datierte Geldereignisse, Gegenforderungen, unveränderte echte Zahlungen nach Kaufänderungen, Cent-Saldierung | Fachlogik vorhanden; vollständige Regression Q01/Q03 |
| **B04–B06, B08, B11, B13** | Zahlungen aus Vorschlag oder manuell, Teil-/Überzahlung, `external`/`waived`, Bearbeiten/Löschen im Verlauf | Dialoge vorhanden; Interaktion Q03/Q04 |
| **B09–B10** | Gegenstandsfinanzierung, persönliche Gesamtsalden, aufklappbare Herleitung, Ausgleichsvorschläge und dokumentierte Buchungen | UI vorhanden; Darstellung Q04 |
| **C01, C03** | Klare Trennung Anteilsübertragung/Zahlung, vorausgefüllter Ausgleichsdialog, explizite Finanzierung bei Anschaffung | UI vorhanden |
| **Neue UX-Änderungen 22.11.** | Überflüssige Badges/Tags entfernt; lange Hilfetexte hinter `?`; `BalanceBreakdown` für persönliche Salden | Statische Tests vorhanden; mobile Abnahme Q04 |
| **B14, C02, C06, D01–D05** | **Teilweise:** technische Voraussetzungen und Testdateien existieren, aber die integrierte Abnahme ist noch nicht abgeschlossen | Entspricht Q01–Q06 |

## 5. Bewusst gestrichen oder zurückgestellt

- **Alte C04 „einzelne Forderungen nach offen/bezahlt/extern sortieren“:** entfällt. Das wäre eine zweite Schuldverwaltung und widerspricht dem vereinbarten persönlichen Gemeinschaftssaldo. Stattdessen wird die Geldhistorie nach Buchungsart dargestellt; ein ausgeglichener Saldo ist nicht der Nachweis, dass eine bestimmte Anschaffung bezahlt wurde.
- **Alte C05 „menschenlesbarer Auszug je Personenpaar“:** aktuell **kein Pflichtfeature**. Die Geldseite hat eine persönliche Saldoherleitung und eine aufklappbare Herkunftsliste; Export/Markdown nur bei konkretem Praxisbedarf.
- **Alte vier Implementierungspakete A/B/C/D:** durch Q01–Q09 und S01–S04 ersetzt, da die Forderungs- und Zahlungsfunktionen bereits vorhanden sind.
- **Keine** externe Verkaufsintegration, WG-Kasse, automatische Banküberweisung, Miet-/Stromkosten-App, vollständiges Rechnungsmodul, frei konfigurierbarer Kontenplan oder Mehrzahler-Anschaffungswizard ohne belegten Bedarf.

## Abnahmeregel

Ein Punkt darf erst als **getestet** gelten, wenn der entsprechende Lauf bzw. Browserfall wirklich durchgeführt, das Ergebnis dokumentiert und bei Fehlern ein reproduzierbarer Fall erfasst wurde. Ein `[x]` in Abschnitt 4 bestätigt nur den derzeit geprüften **Code-Stand**, keine produktive Freigabe. Nach Q01–Q06 diese Liste erneut konsolidieren, dann erst produktive Nutzung der jeweiligen Variante freigeben.
