# Fachkonzept: automatisch abgeleitete Forderungen und Nettoschulden

**Status: Kernfunktionen in `master` übernommen am 20.11.2026; zehn Tests und Standalone-Build in GitHub Actions erfolgreich. Manueller Browsertest noch offen.** Diese Fassung **ersetzt** den älteren Plan mit `finance.postings[]`, `settlementEvents[]` und einer Checkbox „bezahlt“. Es gibt **keinen** gespeicherten Boolean-Status und kein zweites, separat zu pflegendes Forderungsjournal.

## 1. Gewünschtes Verhalten

Jede finanziell relevante Anteilsbewegung erzeugt aus den Eigentumsänderungen automatisch eine Forderung. Das Eigentum ändert sich sofort und unabhängig davon, ob Geld fließt.

Entgegengesetzte Forderungen werden in der Anzeige automatisch miteinander **saldiert**; sie brauchen **kein Abhaken**. Neue Anteilsänderungen können bestehende Verpflichtungen ganz oder teilweise ausgleichen. Beispiel:

| Ereignis | Bruttovorgang |
| --- | --- |
| Anna erwirbt Anteile von Ben | Anna → Ben: 200 € |
| Ben erwirbt später Anteile von Anna | Ben → Anna: 75 € |
| Ben erwirbt weitere Anteile | Ben → Anna: 45 € |

Damit ist Anna gegenüber Ben **netto 80 € im Soll**. Wird das erste Ereignis später auf 150 € korrigiert, beträgt der Saldo automatisch nur noch **30 €**. Wird es gelöscht, bleiben nur die anderen zwei gültigen Forderungen bestehen: **Ben schuldet Anna 120 €**.

Das Prinzip ist **„Events sind die einzige Wahrheit, Forderungen sind eine Projektion“**.

## 2. Drei eindeutig getrennte Ebenen

1. **Quellereignisse (persistiert):** z. B. `shares-set`, `redistribution-executed` mit seinen `shares-set`-Kinderevents, zusätzliche explizite Kauf-/Einbringungsinformationen, optional später dokumentierte tatsächliche Geldbewegungen oder manuelle Ausgleichsbuchungen.
2. **Forderungseinträge (abgeleitet, NICHT persistiert):** Schuldner, Gläubiger, `amountCents`, Ereignisdatum, Gegenstand, `sourceEventId`, optional `childEventId`. Diese Werte werden aus allen bis zum Stichtag gültigen Quellereignissen **neu** rekonstruiert.
3. **Saldo/vereinfachte Zahlungsempfehlung (abgeleitet, NICHT persistiert):** Netto aus den gültigen Forderungen, je Person und je Gegenpartei. Der Status „ausgeglichen“ heißt ausschließlich: **Saldo = 0** (ggf. zum angegebenen Stichtag).

**Keine** `settled:boolean`-Eigenschaft, keine gespeicherten `finance.postings[]`, keine `settlementEvents[]`. Kein eigenständiges Verändern einer Forderung; Änderungen erfolgen über ihr Quellereignis.

## 3. Projizieren statt speichern

Vorschlag für die reine Fachfunktion:

```js
const claims = deriveClaims(project.events, asOfDate, project);
// [
//   {
//     sourceEventId: 'event_123',
//     childEventId: 'event_child_456', // optional
//     itemId: 'item_42',
//     date: '2026-11-20',
//     debtorPersonId: 'person_a',
//     creditorPersonId: 'person_b',
//     amountCents: 20000
//   }
// ]
const balances = simplifyClaims(claims);
```

**Verknüpfung:** Jede abgeleitete Forderung verweist auf das Fachereignis, aus dem sie errechnet wurde. Die IDs des Quellereignisses bleiben bei dessen Bearbeitung stabil. Bei einer Sammelumverteilung ist die Kombination aus Container-ID und Child-ID maßgeblich, damit einzelne Gegenstände/Übertragungen zuordenbar bleiben.

Die Zuordnung der Schuldner und Gläubiger bei komplexen Mehrpersonen-Umverteilungen erfolgt deterministisch, z. B. nach stabiler Personen-ID. Ein abgeleiteter Einzel-Eintrag darf bei Neuberechnung eine andere Paarung oder einen anderen Betrag haben: **nicht** als persistierte fremdreferenzierte Datensatz-ID behandeln. Manuelle Belege und Hinweise möglichst auf ein stabiles **Quellereignis**, nicht auf einen abgeleiteten Paarungseintrag, beziehen.

### Beträge

- Zeitwert des betroffenen Gegenstands **am Ereignisdatum** berechnen; die Verteilung unmittelbar **vor** und **nach** dem Ereignis vergleichen.
- Anteilserhöhung ist wirtschaftlich ein Erwerb (Schuldner), Anteilsminderung eine Veräußerung (Gläubiger), sofern kein explizit anders modellierter Vorgang vorliegt.
- Bei Anteilslöschung verteilt sich dessen Wert durch die neuen Quoten anteilig auf die verbleibenden Beteiligten. Die Forderung ergibt sich daraus automatisch.
- Alle Nettorechnungen in **Integer-Cent**, mit dokumentierter, stabiler Rundung und ausgeglichener Summe je Ereignis.
- Ein reines Umgewichten von Anteilseinheiten ohne Änderung der Quoten erzeugt **keine** Forderung.
- Für einen neuen Gegenstand (`item-added`) sind die Anteile alleine nicht ausreichend, um festzustellen, wer die Anschaffung bezahlt/den Gegenstand eingebracht hat. Nur mit ausdrücklicher Information über Einbringer/Finanzierer und den wirtschaftlichen Empfänger eine Forderung ableiten. Ohne diese Angaben keine erfundenen Schuldner.
- `item-ended` (z. B. Entsorgung) allein erzeugt keine Verkaufserlöse. Eine Privatübernahme oder ein realer Verkauf braucht einen expliziten wirtschaftlichen Empfänger und Preis/Zuordnungsregel.

## 4. Rückwirkende Änderungen – zentrale Invariante

Die derzeitige App erlaubt Änderungen an historischen Events. Das soll erhalten bleiben:

- **Datum verschieben:** Das Event wird an seiner neuen historischen Position verarbeitet; Bewertung, vorherige Anteile und alle nachfolgenden von der Historie abhängigen Forderungen werden neu berechnet.
- **Anteil/Höhe ändern:** Die Forderung dieses Ereignisses ändert sich automatisch; wenn sich die Referenzbasis für spätere Events ändert, auch deren abgeleitete Effekte.
- **Event löschen:** Daraus abgeleitete Forderungen verschwinden automatisch. Keine verwaisten Posting-Datensätze können verbleiben, weil sie gar nicht gespeichert werden.
- **Sammelumverteilung bearbeiten:** Nur die veränderten Child-Events beeinflussen die zugehörigen Forderungen; die geänderte Gesamtchronologie wird bei Bedarf neu projiziert.
- **Stichtag ändern:** Nur bis zum Stichtag gültige Ereignisse und wirtschaftliche Gegenbewegungen berücksichtigen.
- **Historische Stammdatenänderungen:** Stabile Personen-/Gegenstands-IDs beibehalten. Beim Löschen von Personen mit referenzierten historischen Transaktionen Integritätsprüfung verlangen; besser deaktivieren als vollständig löschen.

Eine stabile, **eindeutige Ereignisreihenfolge** ist notwendig (Datum, `order`, abschließend ID). Derselbe Input und Stichtag ergeben exakt dieselben Ergebnisse. Berechnung der Forderungen muss denselben Ereignisverlauf wie die Eigentumsprojektion durchlaufen; bei gleicher Tagesordnung darf es keine unterschiedlichen Zustände geben.

### Kein doppelter Wahrheitsstand

Niemals gleichzeitig die Eigentumsereignisse **und** daraus materialisierte Forderungsbeträge mit separaten Änderungsregeln speichern. Falls später für Performance ein Cache eingeführt wird, muss er **vollständig verwerfbar** und eindeutig anhand des Event-Datenstands invalidierbar sein.

## 5. Wie tatsächliche Zahlungen abgebildet werden könnten

Die Nutzeridee funktioniert ohne echte Zahlungserfassung: Gegenläufige **Anteilsereignisse** schaffen bereits entgegengesetzte Forderungen.

Soll eine tatsächliche Zahlung dennoch dokumentiert werden, genügt später ein **explizites, datiertes Gegenbuchungsereignis**, z. B. `balance-adjustment` oder `cash-payment`. Beispiel: Anna schuldet Ben 80 €; eine tatsächlich geleistete Zahlung von Anna an Ben über 80 € wird im Saldo als Gegenbewegung zu Annas Schuld behandelt. Es ist **keine Checkbox** und verändert keine Eigentumsanteile.

Eine solche Buchung darf **nicht** fälschlich als zweiter Eigentumsverkauf dargestellt werden. Sie enthält reale Beteiligte, Datum, Betrag in Cent und optional den referenzierten Quellvorgang. Die Zahlungssumme wird **nicht automatisch** angepasst, wenn eine historische Forderung später korrigiert wird: Ein tatsächlich geflossener Betrag bleibt real. Stattdessen ändert sich der Restsaldo und die UI kann auf widersprüchliche bzw. überholte Verweise hinweisen.

**Status dieser Ergänzung:** Nur optionale Erweiterungsplanung; zunächst reicht die Verrechnung der wirtschaftlichen Anteilsbewegungen. Keine Pflicht zur tatsächlichen Buchhaltung.

## 6. Bilateral gegen multilateral: wichtige Unterscheidung

- **Bilateral (sicherer Standard):** Nur Forderungen zwischen denselben zwei Personen gegeneinander rechnen. Anna → Ben und Ben → Anna werden saldiert. Originalverläufe bleiben nachvollziehbar.
- **Multilateral (optionale Vorschau):** Die Nettopositionen einer ganzen Gemeinschaft können vereinfachte, neue Zahlungswege ergeben. Das ändert jedoch unter Umständen die Gegenpartei. Eine gemeinsame, verbindliche Verrechnung sollte nicht automatisch als rechtlich erfolgte Schuldbefreiung behandelt werden; sie setzt die Zustimmung der Beteiligten voraus.

In der Oberfläche beide Rechenarten klar benennen: **„Offen je Gegenpartei“** und **„Vereinfachte Gesamtübersicht“**.

## 7. Datenmodell / Migration

**Bevorzugt kein neues `finance`-Journal.** Vorhandenes `project.events[]` bleibt die maßgebliche Datenquelle. Bei Bedarf erhalten vorhandene fachliche Events optionale Felder wie `financialMode`, `financedByPersonId` oder explizite Käufer-/Verkäuferbezüge, sodass die wirtschaftliche Bedeutung eindeutig ist. Ergänzende echte Zahlungs- oder Anpassungs-Events liegen ebenfalls in `events[]`; alle sind datiert.

**Schema-Version:** Für neue optionale wirtschaftliche Felder kann Schema 2 eingeführt werden. Nur neue oder **ausdrücklich nachbearbeitete** ältere Anteilsereignisse als finanzielle Transaktionen auswerten, um beim Import eines Altprojekts nicht ohne Bestätigung rückwirkend Schulden zu erzeugen. Beispiel: Für alte Events ohne expliziten Marker standardmäßig **nur Eigentumswirkung**, neue Events `financialMode:'derived'`.

Anders als im bisherigen Planungsvorschlag darf der finanzielle Teil der Daten **keinen** separaten Status/Posting-Katalog enthalten. `humanReadableSnapshot` bleibt eine abgeleitete Export-Zusammenfassung, nicht Quelle.

## 8. Konkrete Änderungen an der Codearchitektur (geplant)

- **Neu: `src/lib/ledger.js`** mit `deriveClaims(project, asOfDate)`, `pairwiseBalances(...)`, `communityNet(...)`, Cent-Rundung, optional Verarbeitung realer Gegenbuchungsereignisse.
- **`src/lib/projector.js`**: Eigentumsprojektion und Forderungsableitung teilen sich **einen deterministischen Event-Walk** bzw. gemeinsame Zustandsübergänge. Eine doppelte, unterschiedlich sortierte Event-Rekonstruktion vermeiden.
- **`src/lib/redistribution.js`**: Für Vorschau und tatsächlich ausgeführte Umverteilung dieselbe finanzielle Ableitung nutzen. Kein einmaliges Erzeugen persistenter Buchungszeilen.
- **`src/lib/domain.js`**: Optionale `financialMode`-Metadaten bei Events, Migration/Validierung, Schema-Kompatibilität.
- **`src/stores/projectStore.js`**: Aktionen bearbeiten weiterhin nur Fachereignisse. Kein `settlePostings()`, `reopenPostings()`, `postings[]` oder Statusstore.
- **UI / Timeline / Personendetails:** Gekoppelte Ereignis-/Forderungsdarstellung, Herkunft anklickbar; Nettosaldo je Gegenpartei; bei Änderung sofortige Neuberechnung. Optional nur später eigener Dialog „Ausgleichsbuchung erfassen“.
- **Speicheradapter / PHP / Verschlüsselung:** Keine besondere Behandlung; beide speichern dieselbe fachliche Event-JSON-Datei. [PHP-Plan](FEATURE-COLLABORATIVE-STORAGE.md).

## 9. Akzeptanz- und Regressionstests

- Kauf erzeugt Forderung automatisch und verändert Eigentumsanteile sofort.
- Gegenläufige Übertragung reduziert den Saldo automatisch; mehrere Vorgänge werden ohne Checkbox verrechnet.
- Änderung von 200 € auf 150 € im Beispiel verändert das Ergebnis von 80 € auf 30 €.
- Löschen der ursprünglichen 200-€-Transaktion entfernt deren Forderung vollständig; danach schuldet Ben Anna 120 €.
- Datumsänderungen mit unterschiedlichen Zeitwerten führen zu korrekter Neuberechnung einschließlich betroffener Folge-Events.
- Anteilsauflösung auf mehrere verbleibende Personen erzeugt wertmäßige Gegenbuchungen nach Quoten.
- Gleichwertige Anteile mit unveränderter Prozentquote erzeugen keine Schulden.
- Rundungen in Cent, stabile Sortierung, mehrfache Events am selben Tag; kein Doppelzählen bei Sammelumverteilungen.
- Alte JSON-Daten werden nicht unaufgefordert zu neuen Geldforderungen umgedeutet.
- Personenlöschung mit finanziell referenzierten Ereignissen erzeugt Integritätswarnung.
- Für optionale echte Zahlung: Zahlung bleibt bei Korrektur des zugrundeliegenden Kaufes in ihrer realen Höhe erhalten, Restforderung ändert sich.

## 10. Noch offene Detailentscheidungen

1. Welche neuen Ereignistypen/optionalen Felder kennzeichnen **entgeltliche** Anteilsänderung versus ausdrücklich unentgeltliche Schenkung/Korrektur? Empfehlung: explizite finanzielle Semantik, Default für neue entgeltliche Aktionen, keine stillen Altdaten-Schulden.
2. Sollen später explizite **Geldzahlungen** als Gegenbuchungsereignis erfasst werden? Nicht nötig für die erste Umsetzung, aber architektonisch vorbereitet.
3. Soll neben der bilateralen Saldierung eine **multilaterale Auszahlungsempfehlung** angezeigt werden? Ja als klar gekennzeichnete, unverbindliche Vorschau; keine Änderung der Forderungsgläubiger durch Anzeige allein.

**Festlegung gegenüber Vorgängerversion:** Forderungen sind **ausschließlich Projektionen der Quellereignisse**; keine persistenten, abhakbaren Forderungen. Änderungen an Quellereignissen ändern automatisch die daraus abgeleiteten Forderungen.


## Implementierungsstand (20.11.2026)

- `src/lib/ledger.js`: reine, centgenaue Forderungsableitung, bilaterale und optionale multilaterale Saldierung.
- `projector.js`: gemeinsamer deterministischer `walkEvents` mit Before-Apply-Hook für verschachtelte Umverteilungen.
- `financialMode:'derived'` aktiviert die Ableitung bei neuen Anteilstransaktionen; `financialMode:'none'` und alte Events ohne Feld bleiben ohne Forderung.
- `item-added` kann mit `financedByPersonId` eine Person als Finanzierer erfassen und bei mehreren Eigentümern daraus Ansprüche ableiten.
- `LedgerPanel.svelte`: bilaterale Salden, unverbindliche Gesamtverrechnung, Herkunft der Einzelvorgänge und Editierlink.
- `tests/ledger.test.js`, `.github/workflows/ci.yml`: automatische Test- und Buildprüfung ergänzt; beide erfolgreich auf PR und `master`.

**Noch nicht enthalten:** tatsächliche Geldzahlungen, Gegenbuchungsereignisse, PHP, Verschlüsselung oder E-Mail. Die Forderungsbeträge sind ausschließlich zur Laufzeit berechnet und werden nicht in der Projektdatei gespeichert.


## Ergänzung B02 – Zuordnung der Ausgleichsereignisse (22.11.2026)

Die grundsätzliche Produktentscheidung, Forderungen immer aus Fachereignissen abzuleiten, bleibt unverändert. Zusätzlich zu B01 (Ausgleichsereignis als Datensatz) enthält `src/lib/claimMatching.js` nun eine reine Zuordnungsfunktion. Sie referenziert eine **konkrete** Forderungsposition anhand von `sourceEventId`, optionalem `childEventId`, `itemId`, `debtorPersonId` und `creditorPersonId`. Der daraus erzeugte Referenzschlüssel ist stabil über JSON-Export/Import sowie Wert- und Datumsänderungen; bei einer Änderung der wirtschaftlichen Parteien kann die Verbindung dagegen bewusst ungültig werden.

- `claimReferenceFields(claim)` und `claimReferenceKey(claim)`: normierte Herkunft und eindeutiger Schlüssel; fehlende Child-ID = `null`.
- `matchClaimSettlements(project, asOfDate)`: gibt zuordenbare Ereignisse unter `matched` und Problemfälle unter `unmatched` mit Fehlercode zurück. Keine automatische Zuordnung bei mehrdeutigen, gelöschten, zeitlich unmöglichen oder veränderten Referenzen.
- `createClaimSettlementForClaim(project, claim, options)`: schreibbares Ereignis mit echten Herkunfts-IDs erzeugen und die aktuelle Zuordnung prüfen; keine Mengenverrechnung.

Das ist **B02, nicht B03**: Ausgleichsereignisse ziehen derzeit noch keine Cent-Beträge von der Brutto-Forderung ab, selbst wenn die Referenz stimmt. Das ist erst der nächste Schritt. Regression: `tests/claim-matching.test.js` mit 7 neuen Fällen; gezielte Tests für B02 und bestehende B01-/Ledger-Tests erfolgreich, kein vollständiger CI-/Browserlauf bestätigt.
