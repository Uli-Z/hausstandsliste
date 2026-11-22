# Gemeinschaftlicher Wertausgleich (ab 22.11.2026)

## Ziel und Produktgrenze

Die Hausstandsliste verwaltet gemeinsam genutzte Gegenstände und Eigentumsanteile. Der finanzielle Ausgleich ist eine kleine Nebenfunktion: Er soll den Unterschied zwischen **eingebrachtem Wert**, **übernommenem Anteilwert** und **dokumentierten Zahlungen** nachvollziehbar ausgleichen. Die Anwendung führt kein Bankkonto, tätigt keine Überweisung und ist kein allgemeines Haushaltsbuch.

## Ein persönlicher Ausgleichssaldo je Person

Ein positiver Saldo bedeutet, dass eine Person dem gemeinsamen Bestand rechnerisch mehr Wert zugeführt/abgegeben als erhalten hat und entsprechend Geld erhalten könnte. Negativ bedeutet, dass diese Person noch Wert ausgleichen müsste. Die Summe aller Personensalden beträgt **0 Cent**. Der Saldo ist keine Angabe des aktuellen Marktwertes des Eigentums.

Bei einem Kauf von 300 € durch Anna mit drei gleichen Eigentumsanteilen:
- Anna bringt 300 € ein, erhält selbst einen Anteil im Wert von 100 €: Saldo +200 €
- Ben erhält 100 € Anteil, bringt zunächst kein Geld ein: Saldo −100 €
- Clara erhält 100 € Anteil, bringt zunächst kein Geld ein: Saldo −100 €

Die App speichert dafür **keine zusätzliche Wertkontobuchung**. Sie berechnet dieselbe Wirkung aus dem datierten Ereignis `item-added` mit `financedByPersonId`, `initialValue` und `shares`. Es ist **nicht** nötig, die Eigentumsanteile erst künstlich zu 100 % Anna zuzuteilen und danach weiterzuverkaufen.

Bei entgeltlicher Eigentumsübertragung wird der Wert der abgegebenen/erworbenen Anteile **zum Zeitpunkt des Vorgangs** verrechnet. Eine Schenkung oder Korrektur mit `financialMode: 'none'` erzeugt keinen Ausgleichsbedarf.

## Dokumentierte Zahlungen

Ein bereits erfolgter Geldfluss wird als datiertes Ereignis `claim-settlement-recorded` erfasst. Wer zahlt, erhält eine positive Saldoänderung; wer das Geld erhält, eine negative. Der Betrag ist ein historischer Fakt, unabhängig von Anschaffung und Eigentum, und wird auch bei einer nachträglichen Änderung des Kaufwertes nicht automatisch überschrieben.

Beispiel: Nach dem Kauf oben zahlt Ben Anna 60 €. Neue Salden: Anna +140 €, Ben −40 €, Clara −100 €. Die Eigentumsanteile bleiben unverändert.

Überzahlungen können Salden in die Gegenrichtung drehen. Eine Teilzahlung benötigt keine Verknüpfung mit einem bestimmten Gegenstand. Das Ereignis ist in der Zeitleiste sichtbar, bearbeitbar und löschbar. `external` und `waived` sind ausdrücklich nicht zahlungswirksame Arten, die nur die lokale Abrechnung verändern.

## Ausgleichsvorschläge

`ledgerAt().balances` ist die führende fachliche Ansicht für die offenen Positionen. `ledgerAt().simplified` liefert ein deterministisches Routing mit möglichst wenigen Überweisungen von negativen zu positiven Salden. „Ausgleichen“ legt **erst nach Bestätigung** eine solche Zahlung im Journal an. Manuelle Zahlungen sind ebenfalls möglich; sie verändern anschließend dieselben Salden und damit die folgenden Vorschläge.

Die ursprünglichen `claims` und das optionale `pairwise`-Ergebnis dienen nur der Herkunft und technischen Nachvollziehbarkeit; sie sind **nicht** parallel zu den Gruppensalden als eine zweite offene Schuldverwaltung zu behandeln.

**Wichtige soziale/rechtliche Voraussetzung:** Wenn Anna ursprünglich Ben und Ben ursprünglich Clara Geld schuldete, kann die gemeinsame Ausgleichsberechnung stattdessen eine direkte Zahlung Anna → Clara vorschlagen. Dieser Vorschlag gilt nur, wenn die Beteiligten die gruppenweite Saldierung als Abrechnungsregel akzeptieren. Eine solche Zahlung tilgt nicht ohne Weiteres rechtlich selbständige ursprüngliche Forderungen. Die Oberfläche nennt deshalb *Vorschlag*, nicht *bestehende individuelle Schuld*.

## Historie, Wertermittlung und Abgrenzung

- Anschaffungen und Anteilsänderungen verwenden ihre **historischen** Werte zum jeweiligen Ereignisdatum. Laufende Abschreibung verändert den ausgewiesenen heutigen Eigentumswert, nicht automatisch die zuvor vereinbarten Geldflüsse.
- Rückwirkende Kauf-/Transferkorrekturen ändern die daraus abgeleiteten Saldobeiträge, nicht dokumentierte Zahlungen.
- Zahlungsevents wirken ausschließlich ab ihrem Datum; bei Anzeige eines früheren Stichtags kann eine heute eingetragene Zahlung deshalb noch nicht sichtbar sein.
- Bei neuen Gegenständen ist zur automatischen Wertzuordnung derzeit genau **eine finanzierende Person** auswählbar; gemeinschaftliche Finanzierung durch mehrere Personen ist noch kein eigener Workflow.
- Alte Ereignisse ohne Finanzmodus werden nicht rückwirkend in entgeltliche Vorgänge umgewandelt.
- Beim Auszug bleiben Personen und ihre Salden sichtbar.

## Umsetzung

Fachcode: `src/lib/ledger.js` und `src/lib/claimSettlement.js`.
Erfassung/Korrektur: `src/components/SettlementDialog.svelte`.
Oberflächen: `ui-v3/LedgerView.svelte` und `src/components/LedgerPanel.svelte`.
Tests: `tests/community-balances.test.js`, `tests/payment-counterclaims.test.js` und `tests/ledger.test.js`.

Die gemeinsame Abrechnung erfordert noch einen vollständigen CI-Build und manuelle Browser-/Mobilabnahme; produktive Speicherung sensibler Daten setzt die separat dokumentierte Sicherheitsprüfung voraus.
