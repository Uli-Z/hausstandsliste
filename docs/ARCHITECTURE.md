# Architektur und Datenmodell

Stand der statischen Quellcode-Sichtung: **20.11.2026**, Branch `master` vor den Dokumentationsänderungen, App-Versionsangabe `0.7.0`. Diese Datei beschreibt den **vorhandenen Code**, keine bereits getestete Laufzeitfreigabe.

## Aufgabe und Systemgrenze

Hausstand verwaltet gemeinschaftliche Gegenstände, ihren errechneten Zeitwert und relative Eigentumsanteile. Personen kommen hinzu oder scheiden aus. Eine datierte Ereignis-Timeline erlaubt die Rekonstruktion eines historischen Stands.

Die App hat derzeit **kein Backend, keine Anmeldung, keine Datenbank, keine Synchronisation und keine echte Zahlungsbuchhaltung**. Sie berechnet Ausgleichsempfehlungen und Nettoschulden aus Anteilsereignissen, dokumentiert aber keine geleisteten Zahlungen.

## Komponenten und Datenfluss

```text
Projekt-JSON -> Import/normalize() -> projectStore (project, asOfDate)
                                     |
                                     v
                           projectAt(project, asOfDate)
                                     |
                                     v
                             abgeleitete projection
                                     |
                                     v
                   App.svelte / Komponenten / Dialoge
                                     |
                         appState.mutateProject(...)
                                     |
                 localStorage-Arbeitskopie / JSON-Export
```

- `src/main.js`: App-Einstieg
- `src/App.svelte`: Navigation und Dashboard
- `src/components/`: Oberfläche, Detailansichten, Timeline, Editoren
- `src/stores/projectStore.js`: zentrale Aktionen und abgeleiteter `projection`-Store
- `src/lib/domain.js`: `emptyProject()`, `normalize()`, Anteils- und Formatfunktionen
- `src/lib/projector.js`: eventbasierte Zustandsrekonstruktion
- `src/lib/redistribution.js`: Vorschau von Wertverschiebungen/Ausgleichszahlungen
- `src/lib/valuation.js`: Zeitwertmodelle
- `src/lib/persistence.js`: lokale Arbeitskopie und JSON-Ausgabe
- `scripts/inline-build.mjs`: Inline-Verpackung von JS/CSS nach `dist/hausstand-standalone.html`

## Persistiertes Projekt-JSON

Das aktuell erzeugte Grundprojekt (`schemaVersion: 1`) enthält:

| Feld | Rolle |
| --- | --- |
| `community` | Metadaten zur Gemeinschaft, z. B. Name |
| `people[]` | Personenstammdaten mit stabilen `id`-Werten |
| `items[]` | Gegenstandsstammdaten mit stabilen IDs, Name, Tags, Notiz |
| `events[]` | Datierte, nach `date` und `order` sortierte Fachereignisse |
| `drafts[]` | Noch nicht ausgeführte Entwürfe für Gegenstände oder Umverteilungen |
| `humanReadableSnapshot` | Bei Export erzeugte Zusammenfassung, **nicht** fachliche Quelle |
| `currency`, `appVersion`, `schemaVersion` | Formatmetadaten |

`normalize()` akzeptiert ältere `redistributions[]` als Fallback für `drafts[]`. Diese Kompatibilität vor Schemaänderungen prüfen.

### Ereignisse

| Typ | Effekt |
| --- | --- |
| `person-added` | Person wird aktiv |
| `person-deactivated` | Person wird inaktiv |
| `person-reactivated` | Person wird wieder aktiv |
| `item-added` | Gegenstand wird aktiviert; Initialwert, Wertmodell und Anteile werden gesetzt |
| `item-ended` | Gegenstand wird beendet bzw. in einen Folgestatus überführt |
| `shares-set` | Vollständiger Anteilssatz eines Gegenstands wird neu gesetzt |
| `redistribution-executed` | Enthält Child-Events (üblicherweise `shares-set`), die bei Projektion angewendet werden |

`projectAt(project, asOfDate)` berücksichtigt nur Ereignisse mit `event.date <= asOfDate`. Das Ergebnis enthält aktuelle Personen/Gegenstände, aktive/archivierte Gegenstände, Anteilwerte und Warnungen zu unbekannten Ereignistypen. Bei einem `item-ended` sinkt der aktive Wert auf null; archivierte Gegenstände bleiben nachvollziehbar.

### Ein Geldjournal mit Gegenforderungen (neue Entscheidung 22.11.2026)

Alle Geldpositionen haben dieselbe Struktur: Schuldner, Gläubiger, positiver Integer-Cent-Betrag und Datum. `deriveClaims()` leitet Forderungen aus Anschaffungen und Anteilsänderungen ab. Eine dokumentierte Zahlung Ben → Anna wird als gleichwertige **Gegenforderung** Anna → Ben in den Saldo aufgenommen. `ledgerAt()` berechnet den Saldo aus beiden Positionen. Damit bleibt z. B. bei 100 € Schuld und 120 € Zahlung ein rechnerischer Anspruch Ben gegenüber Anna von 20 €. Ändert sich der Anschaffungswert nachträglich, ändert das nicht den tatsächlich dokumentierten Zahlungsbetrag.

Die persistierte Gegenbuchung heißt aus Import-Kompatibilität weiterhin `claim-settlement-recorded` und speichert `id`, `date`, `order`, `amountCents`, `debtorPersonId` (**zahlende Person**), `creditorPersonId` (**empfangende Person**), `settlementKind` (`paid`, `external`, `waived`) und eine optionale `note`. Sie benötigt **keine** `sourceEventId`, `childEventId` oder `itemId`. Solche Felder aus bereits erzeugten Projektdateien bleiben erhalten, werden für den Saldo aber ignoriert. Bei `external` oder `waived` handelt es sich um ausdrücklich **nicht tatsächlich überwiesene** Gegenbuchungen.

`src/lib/claimSettlement.js` validiert und erzeugt die Einträge; `deriveSettlementCounterclaims(project, asOfDate)` nimmt nur gültige Buchungen mit eindeutiger ID und bekannten Personen auf. `paymentForBalance(project, balance, date)` erzeugt einen Vorgang für eine spätere Ein-Klick-Aktion. `ledgerAt()` gibt `claims` (Brutto-Eigentumsforderungen), `counterclaims` (umgekehrte Gegenbuchungen), `entries` (gemeinsames Journal), `pairwise`, `balances`, `simplified` und `warnings` zurück. Keine persistierten Bezahlhäkchen und keine zweite frei editierbare Schuldenliste. Keine bezahlten Beträge je Gegenstand behaupten: Zahlungen gelten für Personenpaare, nicht für bestimmte Käufe.

`claimMatching.js` und `settlementBalances.js` wurden aus der früheren, zu komplizierten B02-/B03-Implementierung entfernt. Tests: `tests/payment-counterclaims.test.js` und die angepassten `tests/claim-settlement.test.js`. Gezielte fachliche Tests bestanden; vollständige npm-/Browser-/PHP-Abnahme steht noch aus.

### Anteilssätze und Bewertung

Anteile werden als positive relative Einheiten gespeichert, z. B. `{personA: 2, personB: 1}`; daraus ergeben sich 2/3 bzw. 1/3 des Zeitwerts. Keine Prozentwerte als Primärdaten speichern.

Die Bewertungsarten sind `linear` (Nutzungsdauer in Jahren), `degressive` (jährliche Rate) und `fixed` (konstanter Wert), optional mit Mindestwert.

### Umverteilungen

Ein Entwurf in `drafts[]` verändert noch keine aktiven Anteile. Bei „Ausführen“ erstellt der Dialog ein `redistribution-executed`-Event mit den geänderten Anteilssätzen und entfernt den Entwurf. `redistributionPreview()` berechnet Wertdifferenzen und `settlementRecommendations()` daraus empfohlene Zahlungen zwischen Personen.

**Es werden keine tatsächlichen Zahlungsvorgänge gespeichert.** Die frühere Vorschaufunktion `settlementRecommendations()` unterscheidet sich von der jetzt implementierten `deriveClaims()`-Forderungsprojektion. Diese rekonstruiert Salden aus Quellereignissen, statt einen zweiten Finanzstatus zu speichern.

## Speicherung und Offline-Ziel

- Lokale Arbeitskopie unter `localStorage`-Key `hausstand_svelte_v07_working_copy`
- Export via `downloadProject()` als JSON mit berechnetem `humanReadableSnapshot`
- Kein automatischer Dateisystem-Speicher; Export ist die notwendige Datensicherung
- `npm run build:single` soll eine selbstständige HTML-Datei erzeugen, ohne Backend
- `dist/` und `node_modules/` sind git-ignoriert; keine Projektdaten in die Quellcodeverwaltung aufnehmen

## Abgrenzung zum historischen HTML

Die 90-KB-Datei `vorlage.html` ist eine ältere Fassung. Neue Arbeiten gehören in das modulare Svelte-Projekt. Vor größeren Änderungen prüfen, ob eine bestehende Funktion der Vorlage erhalten bleiben muss; nicht beide Implementierungen unabhängig weiterentwickeln.


## Architekturentwicklung – ausschließlich geplant (20.11.2026)

Die bisherige Architektur wird **nicht ersetzt**. Sie soll zu drei weitgehend unabhängigen Schichten erweitert werden:

1. **Fachschicht:** `projector.js` für Eigentumszustände und ein neues reines `ledger.js` für **aus denselben historischen Ereignissen abgeleitete Forderungen** und centgenaue Nettoausgleiche. Keine dauerhaft gespeicherten Forderungsbeträge, keine Status-Checkbox; historische Änderungen und Löschungen ändern die abgeleiteten Forderungen automatisch. Event-Semantik und Alt-Datenmigration: [FEATURE-DEBT-LEDGER.md](FEATURE-DEBT-LEDGER.md).
2. **Verschlüsselungsschicht:** `crypto.js` im Browser, dateiformatunabhängiger Projektzustand, gemeinsames verschlüsseltes Containerformat für lokale Dateien und Serverdateien. [SECURITY-AND-ENCRYPTION.md](SECURITY-AND-ENCRYPTION.md).
3. **Speicherschicht:** getrennte lokale und remote Adapter, dazu ein `documentStore` (Datei-ID, Revision, Lock/Lease, Dirty). Ein modular testbares PHP-Backend wird beim Build als **eine PHP-Datei** inklusive HTML verpackt, die verschlüsselte Dateien versioniert ablegt und Mailversand übernimmt. [FEATURE-COLLABORATIVE-STORAGE.md](FEATURE-COLLABORATIVE-STORAGE.md).

Die bisherige Architekturaufnahme oben beschreibt weiterhin den **Ist-Zustand**; keines dieser drei neuen Module oder das PHP-Backend existiert derzeit. Der neue optionale Webserver-Modus hebt den bisherigen Offline-HTML-Modus nicht auf.

Zentrale Invarianten: Eigentumsveränderungen sind unabhängig von der Zahlung; Forderungen sind **nicht persistierte** und bei Quellereignis-Korrekturen stets neu berechnete Projektionen zum Stichtag; das Speichermedium ändert niemals die Bedeutung des Projekt-JSON; unbekannte Passwörter dürfen den Server nicht in die Lage versetzen, Klartext zu sehen; keine stillen Übertragungs-/Revisionskonflikte.


## Implementierte Forderungsprojektion (`master`, 20.11.2026)

`src/lib/ledger.js` rekonstruiert Cent-Forderungen durch `walkEvents` aus `projector.js`, synchron zum Eigentumszustand. Die Herkunft wird durch `sourceEventId` und bei Sammelumverteilungen `childEventId` nachvollziehbar. Es wird **kein** zweites Finanzjournal gespeichert: geänderte oder gelöschte Quellereignisse führen automatisch zu neu berechneten Salden. Neue entgeltliche Vorgänge setzen `financialMode:'derived'`, während alte Einträge ohne Kennzeichnung neutral bleiben. Neu hinzugefügte Gegenstände können optional `financedByPersonId` erfassen. Der bestehende Projekt-JSON-Aufbau bleibt kompatibel.
