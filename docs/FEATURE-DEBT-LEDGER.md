# Fachkonzept: offene Forderungen und Nettoschulden

**Status:** Geplant, noch nicht implementiert. **Stand:** 20.11.2026. Grundlage: Svelte-Version 0.7.0, `src/lib/projector.js`, `src/lib/redistribution.js` und die vorhandenen Anteilsevents.

## Nutzerziel

Eine Eigentumsänderung wirkt sofort, unabhängig davon, ob ein Geldbetrag schon bezahlt oder anderweitig ausgeglichen wurde. Alle noch offenen Vorgänge werden gesammelt und zu einer **vereinfachten Nettoausgleichsempfehlung** verdichtet. Eine Person kann Gegenstände einbringen, Anteile erwerben, übertragen oder beim Auszug abgeben, ohne bei jedem Schritt Geld überweisen zu müssen.

Der Nutzer will für **jede finanzielle Anteilsbewegung** ein einzeln umschaltbares **Ausgeglichen? Ja/Nein**. Ein Ausgleich kann durch direkte Zahlung, gemeinsames Verrechnen oder eine manuelle Abrechnung erfolgen; das Eigentum selbst darf davon nicht abhängen.

## Begriffe und fachliche Regeln

- **Anteilsbewegung**: historisches `shares-set` (direkt oder im `redistribution-executed`-Event), ggf. eine aus `item-added` ausdrücklich finanzierte Einbringung. Jede fachliche Änderung hat eine stabile Ereignis-ID.
- **Finanzielle Buchung / Forderung (Posting):** fester Betrag zwischen einem Schuldner und einem Gläubiger, eindeutig mit dem Ereignis und Gegenstand verknüpft; mehrere Buchungen können aus einer Anteilsbewegung entstehen.
- **Ausgeglichen:** Status einer Buchung, **keine** Änderung des Anteils. In der UI eine Checkbox/Boolean; im JSON durch datierte Statusereignisse gespeichert und als `settled: boolean` für die Anzeige abgeleitet. Ein Rückgängigmachen erzeugt ein neues Statusereignis.
- **Nettoausgleich:** Reine Rechenempfehlung über *alle nicht ausgeglichenen* Buchungen zum gewählten Stichtag, nicht selbst eine neue Schuld. Die ursprünglichen Gegenparteien und Forderungen bleiben nachvollziehbar.

## Ermittlung der Forderungen

1. Die Eigentumsprojektion unmittelbar **vor** dem jeweiligen Anteilsereignis ermitteln; Wert des betroffenen Gegenstands am Ereignisdatum fixieren.
2. Relative Anteile vor/nach der Änderung in Euro-Beträge umrechnen. Zugänge sind wirtschaftliche Käufer (Schuldner), Abgänge wirtschaftliche Verkäufer (Gläubiger); ein Anteil, der ohne Ersatz verteilt wird, wird entsprechend der veränderten relativen Quoten von den verbleibenden Mitgliedern übernommen.
3. Aus positiven und negativen Deltas eine nachvollziehbare, **deterministische** Schuldner-Gläubiger-Zuordnung bilden. Die Zuordnung wird **bei Ausführung einmalig als unveränderliche Buchung eingefroren**, nicht bei jedem Stichtagsaufruf neu berechnet. IDs und Gegenparteien bleiben stabil.
4. Im ganzen Ereignis in **Integer-Cent** rechnen; Rundungsrest deterministisch nach stabiler ID verteilen. Pro Ereignis sind Summe der Abgänge und Zugänge identisch; kein Geld entsteht durch Rundungsfehler.
5. **Null- und Sonderfälle:** Enthält eine Änderung keine Gegenpartei, wird keine fiktive Zahlung erzeugt. Ein vollständig wegfallender Gegenstand (`item-ended`) ist nicht automatisch ein Verkauf. Die Übernahme ins Private braucht explizit Person und Betrag oder eine eindeutige gesonderte Übertragung.
6. **Einbringung:** `item-added` mit anfänglichen Anteilen alleine verrät nicht, wer den Gegenstand bezahlt oder mitgebracht hat. Der Dialog soll optional `financedByPersonId` bzw. explizite Einbringungs-/Kaufangaben erheben. Ohne solche Angaben **keine automatisch erfundene Forderung**. Wenn eine Person allein Eigentümer bleibt, ist keine andere Person automatisch zahlungspflichtig.

### Beispiel

A kauft 200 € von B, B kauft später 75 € und 45 € von A. Alle drei Buchungen bleiben offen. Die Nettorechnung zeigt nur noch: **A zahlt B 80 €**. Nach einer gemeinsamen Verrechnung kann ein einzelner Ausgleichsvorgang alle drei Buchungen als ausgeglichen markieren. Die Originalbuchungen und ihre Beträge bleiben bestehen.

Bei mehr als zwei Personen können aus mehreren Ursprungsforderungen neue **vereinfachte Zahlungswege** entstehen. Dies ist eine freiwillige gemeinsame Verrechnung; bei rechtlich eigenständigen Ansprüchen muss die Gruppe ihr zustimmen, bevor die App die ursprünglichen Forderungen als ausgeglichen markiert.

## Vorgeschlagene JSON-Struktur (Schema-Version 2, Entwurf)

```json
{
  "schemaVersion": 2,
  "finance": {
    "postings": [
      {
        "id": "posting_01",
        "sourceEventId": "event_123",
        "itemId": "item_42",
        "date": "2026-11-20",
        "debtorPersonId": "person_a",
        "creditorPersonId": "person_b",
        "amountCents": 20000,
        "basis": "share-delta"
      }
    ],
    "settlementEvents": [
      {
        "id": "settlement_01",
        "date": "2026-11-20",
        "postingIds": ["posting_01"],
        "settled": true,
        "method": "manual",
        "note": ""
      }
    ]
  }
}
```

`finance.postings[]` ist das dauerhaft gespeicherte **Forderungsjournal** mit Cent-Beträgen und unveränderlichen IDs. `finance.settlementEvents[]` speichert Zustandswechsel und Sammelabrechnungen. `settled` ist ein **persistiertes Boolean im Ausgleichsereignis** und der pro Posting angezeigte Boolean wird daraus berechnet. Das vermeidet eine zweite widersprüchliche, direkt mutierbare Statusquelle auf jeder Buchung. Es ist fachlich das gewünschte pro-Vorgang-Häkchen, auch wenn die interne Speicherung ereignisbasiert ist.

Ein Ausgleichsereignis kann **mehrere** Postings enthalten. Zum Rückgängigmachen wird ein späteres Ereignis mit `settled:false` geschrieben. Stichtagsansichten beachten Posting-Datum und datierte Ausgleichsereignisse; Sortierung stabil nach Datum und ID.

**Alternativ** wäre ein direkt persistiertes `posting.settled` möglich. Das wäre zwar kürzer, würde aber Status- und Rücksetzungs-Historie verlieren. Der ereignisbasierte Ansatz ist deshalb die bevorzugte Architektur.

## Vereinfachter Saldo

Aus den **offenen** Postings berechnen:

- `balance[debtor] -= amountCents`
- `balance[creditor] += amountCents`
- danach Schuldner (negativ) und Gläubiger (positiv) deterministisch paaren, bis alle Salden null sind.

Die Empfehlungen werden **nicht** als neue ursprüngliche Forderungen gespeichert; erst beim tatsächlichen Abschließen einer gemeinsamen Nettoabrechnung werden die zugehörigen Posting-IDs als ausgeglichen gebucht. Ein personengefilterter Bericht zeigt Ursprung, Gegenpartei, Datum, Einzelbetrag, Ausgleichsstatus sowie Gesamtsaldo.

## Einbau in die bestehende App

- `src/lib/ledger.js` **neu**: reine Funktionen für Erstellung von Postings, Prüfung auf Ausgleich, Saldierung, vereinfachte Transfers, Rundung.
- `src/lib/projector.js`: bei historischen Rekonstruktionen Finanzstatus zum Stichtag berechnen oder separate `financeAt(project, date)`-Projektion verwenden; nicht mit Eigentumswerten vermischen.
- `src/lib/domain.js`: Schema-2-Normalisierung und kontrollierte Migration aus Schema 1.
- `src/stores/projectStore.js`: Aktionen für `settlePostings(ids)`, `reopenPostings(ids)` und Buchungserstellung; alle Datenänderungen zentral.
- `src/lib/redistribution.js`: bestehende Vorschau behalten; beim **Ausführen** Postings fixieren. Einzelnes `shares-set` und Sammel-Umverteilung laufen durch denselben Codepfad.
- `src/components/RedistributionDialog.svelte`: Vorschau offener Forderungen und Option „ohne sofortige Zahlung ausführen“.
- `src/components/ExecutedRedistributionEditDialog.svelte`, `Timeline.svelte`: Ursprung/Forderungen/Status anzeigen.
- **Neue** Finanzübersicht und personenbezogene Saldenansicht: offene Einzelvorgänge, vereinfachte Empfehlung, Sammel-Abschluss.

## Migration und Korrekturen

**Schema-1-Altprojekte dürfen NICHT stillschweigend rückwirkend zu neuen Schulden führen.** Alte Events standardmäßig als historisch nicht verbuchte Ausgangslage behandeln. Optional später manuelle Übernahme einzelner historischer Vorgänge nach Bestätigung.

Bereits ausgeführte Buchungen bleiben eingefroren. Wenn eine historische Anteilsänderung nachträglich bearbeitet/gelöscht wird, zugehörige Postings **nicht stillschweigend verändern**, sondern Korrektur/Neuerstellung als expliziten Vorgang mit sichtbarer Prüfung, insbesondere bei bereits ausgeglichenen Buchungen. Physisches Komplettlöschen von Personen mit Referenzen auf Finanzpostings muss gesperrt oder mit geprüfter Migration behandelt werden.

## Akzeptanzfälle / Tests

- Eigentumsänderung ohne Zahlung erzeugt offenes Posting; Besitz ändert sich sofort.
- Erwerb, Verkauf, anteilige Auflösung unter Verbleibenden, Personenwechsel.
- Mehrere entgegengesetzte Vorgänge liefern korrekten Cent-Nettoausgleich, ohne doppelte Schuld.
- Einzel-Checkbox und Sammelabrechnung bleiben nach JSON-Export/Import erhalten; Rückgängig ist möglich.
- Stichtag vor/nach Erwerb und Ausgleich zeigt fachlich konsistente Beträge und Status.
- Zwei oder mehr Gläubiger/Schuldner, Dezimalwerte, 1-Cent-Rundungsfälle und deterministische Reihenfolge.
- `item-added` ohne Finanzierer erzeugt **keine** erfundene Forderung.
- Beendigung ohne Übernehmer erzeugt **keine** fiktive Forderung.
- Korrektur eines bereits ausgeglichenen Quellereignisses führt zu sichtbarer Konflikt-/Prüfbehandlung.
- Alte JSONs importieren unverändert und bekommen keine unerwarteten Forderungen.

## Noch zu entscheiden

1. Für die Anzeige zunächst „**Ausgeglichen**“ (Zahlung oder freiwillige Verrechnung) statt rechtlich enger „Bezahlt“? **Empfohlen: ja.**
2. Teilzahlungen im ersten Release? **Empfohlen: nein**, zunächst ganzer Vorgang Boolean und Sammel-Verrechnung.
3. Bei vollständiger Gegenstandsauflösung ohne verbleibenden Anteilseigner: expliziten Übernehmer/Veräußerung verlangen, statt einen Käufer anzunehmen.
4. Beitrags-/Einbringungsdialog: Zahlende Person / Herkunft auswählen, falls aus der anfänglichen Verteilung eine Forderung entstehen soll.

**Status:** Entwurf, keine Änderung des Datenmodells oder Quellcodes vorgenommen.
