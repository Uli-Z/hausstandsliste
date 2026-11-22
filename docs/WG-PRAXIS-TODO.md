# Priorisierte To-do-Liste: WG-Praxis und Zahlungsausgleich

**Beschlussstand: 22.11.2026.** Grundlage: aktuelle mobile UI V3 und Fachcode auf `master`. Das ist ein **Arbeitsplan**, keine Behauptung, die Punkte seien bereits umgesetzt. Reihenfolge: **bestehende Fehler zuerst**, dann der **kleinste sinnvolle** Forderungs- und Zahlungsausgleich, zuletzt Prüfung/Feinschliff.

## 0. Produktgrenze (verbindlich)

Die Hausstandsliste verwaltet **Gegenstände, Eigentumsanteile und die daraus entstehenden Forderungen inklusive ihrer Erfüllung**. Sie ist **kein** Haushaltsbuch und **kein** Ersatz für Überweisungen oder Shared-Expense-Apps. Zahlungen werden **dokumentiert**, nicht technisch ausgeführt. Eine Person kann die finanzielle Abwicklung bewusst außerhalb erledigen.

**Beibehalten:** Ereignisse sind die persistierte Wahrheit; Eigentums- und Geldzustand werden zum Stichtag berechnet. Keine unabhängig editierbaren Schuldenlisten, kein bloßes persistiertes `paid: true`, keine automatische Annahme, dass eine Eigentumsübertragung bezahlt ist. Alte Projekt-JSONs müssen unverändert importierbar bleiben; keine nachträglich erfundenen Schulden. Standalone-HTML und separate vorkonfigurierte PHP-Version müssen dieselbe Fachlogik nutzen.

**Bewusster Verzicht auf Features mit einfachen Umwegen:**
- kein eigener Verkauf an externe Käufer: eine Person kann die Anteile übernehmen, den Gegenstand beenden und privat verkaufen;
- keine eigene WG-Kasse, kein Bankkonto, keine SEPA-/Überweisungsintegration;
- kein allgemeines Einkaufs-, Miet-, Strom- oder Ausgabenbuch;
- keine Sonderlogik für Leihgaben, Versicherungen, Spenden, Reparaturen, Ratenverträge oder Marktwertermittlung;
- vorerst keine beliebig vielen ursprünglichen Zahler je Anschaffung: bei Bedarf externe Expense-App, Aufteilung in getrennte Vorgänge oder ausdrücklich übernommene Finanzierung nutzen;
- kein umfangreicher Ein-/Auszugs-Wizard oder separates rechtsverbindliches Forderungsmanagement;
- keine zusätzlichen Bewertungsmodelle oder frei konfigurierbaren Kontenpläne.

## A. P0 — Bestehende Fehler beheben (vor neuen Funktionen)

- [x] **A01 · Aktive Gegenstände mit Zeitwert 0 € anzeigen.** `projector.js` filtert `activeItems` mit `value > 0.0001`; dadurch fehlen noch vorhandene abgeschriebene Gegenstände im Bestand, bei Personen und in Umverteilungen. Aktivität ausschließlich aus `status` ableiten; nur Summen berücksichtigen 0 €. **Test:** vollständig abgeschriebener Kühlschrank bleibt sichtbar und übertragbar, ohne fiktive Forderung.
- [x] **A02 · Ausgezogene Personen ohne Eigentum weiterhin finden.** `projectAt` filtert inaktive Personen ohne positiven Wertanteil aus der Anzeige. Personen mindestens im Personenverzeichnis mit Kennzeichen „ausgezogen“ erhalten; insbesondere auch bei offenen Ansprüchen/Zahlungsereignissen. **Test:** ausgezogene Gläubigerin mit 0 € Eigentum und 80 € Anspruch bleibt auswählbar.
- [x] **A03 · Historisch gefährliches „Person endgültig löschen“ absichern.** Aktuelle Löschfunktion entfernt Personen aus historischen Anteilssätzen und kann `financedByPersonId`/Entwürfe/Ansprüche als verwaiste Referenzen zurücklassen. Löschen nur für nachweislich noch nie beteiligte Personen; ansonsten deaktivieren/archivieren. Integritätsprüfung in Tests. **Test:** eine ehemalige Finanziererin kann nicht stillschweigend aus Geldhistorie verschwinden.
- [ ] **A04 · Unentgeltliche Umverteilung darf keine Zahlungen suggerieren.** Vorschau bei `financialMode: 'none'` zeigt derzeit weiterhin rechnerische `preview.payments`. Bei Schenkung/Korrektur „keine Forderung“ anzeigen, Wertverschiebung getrennt erklären. Auch im Editor ausgeführter Umverteilungen prüfen.
- [ ] **A05 · Eigentumsanteile dürfen nicht in einen ungültigen Zustand geraten.** „Alle Anteile einer Person entfernen“ kann beim letzten Eigentümer einen aktiven Gegenstand ohne Eigentümer zurücklassen. Aktion blockieren oder explizit auf „Gegenstand beenden“ verweisen; keine stillschweigende Wert-/Geldvernichtung.
- [ ] **A06 · Empfehlungsbeträge nicht als erfolgte Zahlungen bezeichnen.** Dashboard, Timeline, Umverteilungsansicht und Geldseite zwischen „empfohlene Überweisung“, „entstandene Forderung“ und „gebuchte Zahlung“ trennen. Gerade alte Verlaufszeilen nicht als Zahlung missverstehen.
- [ ] **A07 · Stichtags- und Reihenfolge-Korrektheit prüfen.** Ereignisse am selben Tag, rückdatierte Anteilsübertragungen und nachträglich geänderte Daten: Vorschau muss *vor* der neuen Transaktion rechnen, ohne spätere Änderungen vorzuziehen. Falls Rechenfehler: beheben; mit deterministischen Regressionstests absichern (dieser Punkt ist eine Prüfaufgabe, kein bereits bestätigter Defekt).

## B. P1 — Schlanke echte Zahlungserfassung (Kernfunktion; in dieser Reihenfolge)

- [ ] **B01 · Minimalen Ausgleichsereignistyp im Datenmodell definieren.** Persistiertes, datiertes Ereignis wie `claim-settlement-recorded`, mit stabiler ID, Betrag in Integer-Cent, Schuldner, Gläubiger, Art (`paid` | `external` | optional `waived`), Herkunftsreferenz und optionaler Notiz. Die abgeleitete Forderung selbst bleibt *nicht* gespeichert. Keine Checkbox als alleinige Datenquelle.
- [ ] **B02 · Jeden Ausgleich einer konkreten Forderungsposition zuordnen.** Herkunft der Forderung: `sourceEventId` + ggf. `childEventId`, `itemId`, Schuldner und Gläubiger. Insbesondere Forderungen bei `item-added` aus `financedByPersonId` müssen separat pro Gegenstand nachvollziehbar sein. Stabile Referenzen auch nach Export/Import.
- [ ] **B03 · Offene Forderung korrekt berechnen.** Ursprüngliche Forderungen minus zugeordnete Zahlungen/Ausgleiche; Ergebnis pro Gegenstand, Forderungsposition, Person und bilateral. Vollständig, teilweise, noch offen, extern verbucht und verrechnet **aus Ereignissen ableiten**, nicht als widersprüchlichen Zweitstatus führen. Centgenau, stichtagsbezogen.
- [ ] **B04 · Ein-Klick-Aktion „Als bezahlt erfassen“.** Direkt an einer offenen Forderung (und am Gegenstand): Betrag = aktuell noch offen, Datum = heute, Personenkonstellation vorbelegt; klar bestätigen und Ausgleichsereignis speichern. Nicht bloß „Häkchen setzen“. Für bereits vollständig ausgeglichene Forderungen deaktiviert; doppeltes Klicken darf keine zweite Zahlung buchen.
- [ ] **B05 · Teilzahlung erfassen.** Neben Schnellaktion „Teilbetrag …“ mit freiem positivem Betrag bis zum offenen Betrag, Datum und optionaler Notiz; sofortige Restschuld. Beispiel: 100 € Anspruch, 60 € bezahlt -> 40 € offen.
- [ ] **B06 · „Extern verbucht“ ausdrücklich von „bezahlt“ unterscheiden.** Wenn WG/Personen dieselbe Forderung in einer Shared-Expense-App weiterverfolgen, kann sie mit Ein-Klick-Aktion **aus der lokalen offenen Liste ausgelagert** werden. Anzeige „extern verbucht“, **nicht** „bezahlt“; optional App-/Vorgangsnotiz. Damit keine doppelte Zahlungsaufforderung; die App behauptet nicht, dass Geld floss.
- [ ] **B07 · Gegenläufige Forderungen sauber zuordnen.** Bilaterales Saldo-Prinzip erhalten; im Gegenstandsdetail klar zeigen: „bezahlt“, „durch Gegenforderung verrechnet“, „extern verbucht“ oder „noch offen“. Zuweisung von Verrechnungen zu Positionen deterministisch und nachvollziehbar (z. B. zeitlich geordnet). Eine bloß vorgeschlagene **multilaterale** Vereinfachung darf Forderungen nicht automatisch als erfüllt kennzeichnen.
- [ ] **B08 · Aggregierte Zahlung von einer Person an eine andere zuordnen.** Schnellaktion aus der bilateralen Geldübersicht für den Nettobetrag. Falls mehrere Gegenstände beteiligt sind, vor dem Speichern verständliche, deterministische Aufteilung/Zuordnung vorschlagen und offenlegen; keine undokumentierte Sammelzahlung ohne Gegenstandsbezug.
- [ ] **B09 · Gegenstandsdetail: „Finanzierung & Ausgleich“.** Ursprüngliche Finanziererin, daraus entstandene Forderungen, Zahlungseinträge mit Datum/Art/Notiz, bilaterale Verrechnungen und Restbeträge zeigen. Ein-Klick-Aktionen hier anbieten. Nicht nachträglich nur in globaler Geldliste suchen müssen.
- [ ] **B10 · Geldübersicht und Personenseite vereinfachen.** Hauptansicht: wirklich *lokal offene* Salden; darunter bei Bedarf nach Personen/Gegenständen aufklappbare Herkunft, bezahlt/extern verbucht/teilweise sowie Ausgleichshistorie. Keine zweite komplexe Buchführung neben der Eigentumsliste.
- [ ] **B11 · Gebuchte Zahlungen korrigieren und rückgängig machen.** Im Verlauf editierbar oder über dokumentiertes Gegenereignis stornierbar; Ursprungsforderung wird nicht überschrieben. Doppelbuchungen, falscher Empfänger, falsches Datum korrigierbar; Historie bleibt nachvollziehbar.
- [ ] **B12 · Änderungen an Altvorgängen dürfen Zahlungen nicht löschen.** Wenn eine Anschaffung zeitlich verschoben, im Wert verändert oder gelöscht wird, bleiben echte Ausgleichsereignisse erhalten. Unpassende Zuordnungen/Überzahlungen/gelöschte Forderungsquellen sichtbar **warnen** und korrigierbar machen; nichts automatisch umhängen, stornieren oder als frei verfügbares Guthaben interpretieren.
- [ ] **B13 · Forderungsrest bei abweichender Einigung schließen können.** Kleiner Weg „Rest erlassen/anders ausgeglichen“ (falls nicht bereits durch `external` abgedeckt), damit WG-Vereinbarungen nicht als ewige unbezahlte Restschuld erscheinen. Kein eigener Kaufpreis-Editor nötig.
- [ ] **B14 · Historische Stichtage und Import-Altbestand berücksichtigen.** Zahlung wirkt erst ab ihrem Datum; rückdatierte Ansprüche bleiben unverändert; alte `financialMode`-lose Daten erzeugen auch nach Migration keine neuen Schulden. Neues Eventformat kompatibel mit JSON, lokaler Verschlüsselung und PHP-Ablage.

## C. P2 — Kleine Bedienungsverbesserungen (ohne neuen Funktionsballast)

- [ ] **C01 · Sichere Schnellaktionen und eindeutige Sprache.** „Anteile übertragen“ ≠ „bezahlt“; bei „Als bezahlt erfassen“ klar benennen, dass es lediglich eine bereits erfolgte Zahlung *dokumentiert*. Vor Speicherung Betrag und Gegenpartei sichtbar.
- [ ] **C02 · Schnelle Bearbeitung am Smartphone.** Vollständige/teilweise Zahlung mit wenigen Schritten, vernünftigen Zahleneingaben, Enter/Bestätigung und sauberer Fokusführung; keine ungewollte breite Eingabefelder.
- [ ] **C03 · Finanzierungsfelder bei Anschaffung erklären.** Bei neuer Anschaffung „Wem gehört es?“ und „Wer hat bezahlt?“ eindeutig trennen. Ohne dokumentierten Finanzierer keine automatische Geldforderung.
- [ ] **C04 · Unvollständige Abrechnung kenntlich machen.** Unbezahlte oder extern verbuchte Forderungen von bereits abgeschlossenen getrennt zeigen; nach Auszug keine irreführende „alles erledigt“-Anzeige.
- [ ] **C05 · Kurzer, menschenlesbarer Ausgleichsauszug.** Pro Person/Gegenstand: entstanden, verrechnet, gezahlt, extern verbucht, offen; zur WG-Abstimmung kopierbar (Markdown/Text genügt, kein komplexes Rechnungsmodul).
- [ ] **C06 · Fehlbedienungen abfangen.** Negativbetrag, 0 €, Überzahlung, identischer Schuldner/Gläubiger, unbekannte Personen, falsche Referenzen und mehrfache schnelle Klicks vor dem Speichern prüfen.

## D. P3 — Tests, Migration und Freigabe (vor produktivem Einsatz Pflicht)

- [ ] **D01 · Fachliche Tests für alle P0-Fehler und P1-Statusableitungen.** U. a. 300-€-Kauf durch Anna für drei Eigentümer, 60-€-Teilzahlung Ben, 100-€-Zahlung Clara, vollständiger Ausgleich, externe Buchung.
- [ ] **D02 · Verrechnungs- und Änderungsfälle.** Gegenansprüche über zwei Gegenstände; deterministische Zuordnung und wirkliche Reststände; spätere Änderung von Wert, Datum, Eigentümer und Quellereignis; Überzahlungs-/Orphan-Warnung.
- [ ] **D03 · Zahlungshistorie.** Wiederholtes Buchen, Storno, 0-/Negativ-/Überzahlung, stichtagsgenaues Filtern, Auszug nach letzter Zahlung, alte Projekte ohne Finanzmodus, Beträge in Dritteln und Cent-Rundung.
- [ ] **D04 · Browser-/Mobiltests.** Dialoge vollständig bedienbar, Tastatur/Enter, Portrait 320–390 px, Test mit vielen Gegenständen/Personen und realistischen Projektdateien.
- [ ] **D05 · Gemeinsames Speicherformat.** Standalone und PHP-Build, verschlüsselter Import/Export, JSON-Roundtrip, bestehende Projektdateien, zwei Browser/Checkout/Konfliktfall. Bestehende Offenpunkte von Server-/Sicherheitsabnahme aus `ROADMAP.md` bleiben bestehen.
- [ ] **D06 · Dokumentation konsistent aktualisieren.** README, `AGENTS.md`, `FEATURE-DEBT-LEDGER.md`, aktuelle UI V3 sowie `ROADMAP.md` an Event- statt Checkbox-Modell anpassen; Abnahmefälle und tatsächlich getesteten Stand dokumentieren.

## Empfohlene Umsetzungspakete

1. **Patch 1 – Bugs:** A01–A06 + Tests, A07 mit prüfen/beheben.
2. **Patch 2 – Ereignislogik:** B01–B03, B07, B12, B14 + D01/D02.
3. **Patch 3 – minimale Zahlungs-UI:** B04–B06, B08–B11, B13 + Gegenstands-/Personenansichten B09/B10.
4. **Patch 4 – Freigabe:** C01–C06 und D03–D06.

## Fachliche Abnahme (Muss-Kriterien)

- Drei Personen besitzen jeweils 1/3 einer von Anna für 300 € bezahlten Anschaffung: Ben und Clara schulden Anna je 100 €; Eigentum von Zahlung unabhängig.
- Ben bezahlt später 60 €: nur seine Position für **diesen Gegenstand** hat 40 € Rest. Clara bezahlt 100 €: ihre Position ist bezahlt. Ein Klick auf „Als bezahlt erfassen“ bei Ben erstellt ein **datierbares, editierbares Ausgleichsereignis** von 40 €; danach lokal 0 € offen.
- „Extern verbucht“ entfernt eine Forderung aus lokalen Zahlungsaufforderungen, behauptet aber nicht, dass Geld geflossen ist; die Verbindung zum Gegenstand bleibt sichtbar.
- Gegenforderungen werden bilateral verrechnet, ohne sie als tatsächlich überwiesen darzustellen. Die Zuordnung pro Gegenstand bleibt erklärbar.
- Wird die ursprüngliche Anschaffung später korrigiert oder gelöscht, gehen echte Zahlungsereignisse **nicht verloren**; unpassende Zuordnungen werden markiert.
- Bereits vorhandene Projekte und beide Build-Varianten bleiben nutzbar.
