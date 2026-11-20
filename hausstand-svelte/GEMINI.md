# Svelte-Projekt: technische Hinweise

Zuerst [`../AGENTS.md`](../AGENTS.md), [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md), [`../docs/ROADMAP.md`](../docs/ROADMAP.md) lesen. Diese Datei ergänzt die allgemeinen Regeln um Svelte-spezifische Konventionen.

## Architekturentscheidungen

- **Svelte/Vite, modularer Quellcode, eine fertige HTML-Datei.** Kein Pflicht-Backend; keine zweite parallele Umsetzung in `../vorlage.html`.
- **Event-Sourcing:** `src/lib/projector.js` verarbeitet `project.events` anhand des Stichtags; nicht den projizierten Zustand als alleinige Wahrheit speichern.
- **Datei ist Wahrheit:** `src/lib/persistence.js` exportiert JSON inkl. `humanReadableSnapshot`; dieser Snapshot ist nur abgeleitete Lesehilfe. `localStorage` ist temporäre Arbeitskopie.
- **Store:** `src/stores/projectStore.js` mit `appState.mutateProject` für Datenänderungen und dem abgeleiteten Store `projection`. Keine direkte Mutation des Projektobjekts außerhalb der Store-Aktionen.
- **Stammdaten vs. Ereignisse:** Namen, Tags und Notizen stehen in `people[]`/`items[]`; zeitabhängige Aktivität, Wert und Eigentumsanteile in `events[]`.

## Aktuelles Projekt-JSON (Schema-Version 1)

`community`, `people[]`, `items[]`, `events[]`, `drafts[]`, `currency`, `humanReadableSnapshot`, `schemaVersion`, `appVersion`.

**Wichtige Korrektur zu älteren Dokumenten:** Entwürfe liegen aktuell in `drafts[]` (Item- und Umverteilungsentwürfe). Beim Import liest `normalize()` ersatzweise das historische Feld `redistributions[]` und entfernt es anschließend. Ein ausgeführter Umverteilungsentwurf wird als Event `redistribution-executed` mit `shares-set`-Kinderevents gespeichert.

Ereignistypen: `person-added`, `person-deactivated`, `person-reactivated`, `item-added`, `item-ended`, `shares-set`, `redistribution-executed`.

Bewertungsmodelle: `linear` (`durationYears`), `degressive` (`annualRate`), `fixed`; alle optional mit `minimumValue`.

Relative Anteilseinheiten verwenden, IDs statt Namen referenzieren, neue IDs mit `uid(prefix)` erzeugen. Ereignisse am selben Datum werden zusätzlich über `order` sortiert. Gleiche Eingaben und gleicher Stichtag müssen gleiche Projektionen erzeugen.

## Umverteilung und Zahlung

`src/lib/redistribution.js` berechnet mit `redistributionPreview()` Wertdifferenzen und mit `settlementRecommendations()` **nicht persistierte** Zahlungsvorschläge. Die UI zeigt diese in `RedistributionDialog.svelte` und `ExecutedRedistributionEditDialog.svelte`. Es gibt bislang **keine** Datenstruktur für „offen“, „bezahlt“ oder Teilzahlungen und keinen tatsächlichen Geldfluss. Umsetzung erst nach Klärung stabiler Forderungs-IDs und des historischen Verhaltens (siehe Roadmap).

## Prüfregeln vor Änderungen

```bash
npm ci
npm run check:js
npm run build:single
```

Danach die manuellen Akzeptanzfälle aus [`../docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md) im Browser ausführen, besonders JSON-Roundtrip, historische Stichtage, Umverteilungen, Export und `file://`-Start der Standalone-Datei. Automatisierte Tests existieren derzeit nicht. Nicht verifizierte Builds/Tests nicht als erfolgreich dokumentieren.


## Geplante Architekturentwicklung (noch kein Code)

- [Forderungsjournal/Nettoschulden](../docs/FEATURE-DEBT-LEDGER.md): **neue Festlegung 20.11.2026:** keine gespeicherten Forderungslisten und kein `settled:boolean`; ausschließlich dynamisch aus `events[]` hergeleitete, über Quellereignis-IDs nachvollziehbare Cent-Forderungen und Netto-Salden. Jede historische Korrektur ändert die Projektion automatisch. Alte Events nicht stillschweigend zu Schulden machen.
- [PHP-Ablage](../docs/FEATURE-COLLABORATIVE-STORAGE.md): eine Svelte-App, zwei Build-Artefakte, getrennte Speicheradapter und ein eigenes `documentStore` für Revision, Dirty-Flag und Checkout.
- [Browser-Verschlüsselung](../docs/SECURITY-AND-ENCRYPTION.md): dasselbe verschlüsselte Containerformat für lokalen Export und Remote-Speicherung; aktuell vorhandene Klartext-`localStorage`-Arbeitskopie darf niemals bei verschlüsselten Projekten unverschlüsselt fortgeführt werden.

**Noch nicht implementieren oder als vorhanden behaupten**, bevor die betreffenden Architekturentscheidungen bestätigt, getestet und in Code umgesetzt sind.
