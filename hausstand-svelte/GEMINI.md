# Hausstand (Svelte Version) - Context & Instructions

Hausstand ist ein Werkzeug zur Verwaltung von Haushaltsinventaren und Personenanteilen basierend auf einem **Event-Sourcing-Modell**.

## 1. Kernprinzipien (Core Mandates)

-   **Historische Rekonstruktion:** Der Zustand (Personenstatus, Gegenstandswerte, Anteile) wird deterministisch aus einer Timeline von Ereignissen bis zu einem **Stichtag** (`asOfDate`) berechnet.
-   **Single-File Architecture:** Das Ziel ist eine eigenständige HTML-Datei. Vermeide externe Abhängigkeiten oder komplexe Build-Strukturen, die dieses Ziel gefährden.
-   **JSON is Truth:** Das Projekt-JSON enthält alle relevanten Daten. Der Snapshot im JSON ist nur informativ.
-   **Keine Zahlungsverwaltung:** Die App berechnet **Ausgleichsempfehlungen** (Deltas), speichert aber keine Zahlungsflüsse oder Schuldenstände.

## 2. Ubiquitous Language

-   **Projekt:** Die gesamte Datenbasis.
-   **Person:** Stammdaten (ID, Name). Status (aktiv/inaktiv) ist zeitabhängig und wird aus Events berechnet.
-   **Gegenstand (Item):** Stammdaten (ID, Name, Tags, Notiz). Wert und Anteile sind zeitabhängig.
-   **Gegenstandsversion:** Bei massiven Änderungen wird ein Gegenstand beendet (`item-ended`) und ein neuer angelegt (`item-added`), ggf. mit `predecessorItemId`.
-   **Anteil (Share):** Relative Einheiten. Die Summe der Einheiten bildet die Basis für die prozentuale Aufteilung.
-   **Umverteilung (Redistribution):** Ein Container für mehrere Anteilsänderungen. Vor der Ausführung ein Arbeitsstand (`redistributions[]`), nach der Ausführung ein Event (`redistribution-executed`).

## 3. Datenmodell & Ereignisse

### Wichtige Ereignistypen
-   `person-added` / `person-deactivated` / `person-reactivated`: Steuern den Aktivitätsstatus.
-   `item-added`: Initialisiert Wert, Bewertungsmodell und Anteile.
-   `item-ended`: Entfernt Gegenstand aus dem aktiven Hausstand (Status: `ended`, `taken-private`, `disposed`, `succeeded`).
-   `shares-set`: Setzt den vollständigen Anteilssatz neu.
-   `redistribution-executed`: Container-Event, das Child-Events (meist `shares-set`) enthält.

### Bewertungsmodelle (`valuation`)
-   `linear`: Abschreibung über `durationYears`.
-   `degressive`: Jährliche Rate `annualRate`.
-   `fixed`: Konstanter Wert.
-   Alle Modelle unterstützen einen `minimumValue`.

## 4. Architektur (Module)

-   **`Projector` (`src/lib/projector.js`):** Die wichtigste Komponente. Sie iteriert über sortierte Events und baut den Zustand auf.
-   **`Store` (`src/stores/projectStore.js`):** Verwaltet das reaktive Projekt-Objekt und die aktuelle `projection`.
-   **`Valuation` (`src/lib/valuation.js`):** Berechnet den mathematischen Wert eines Gegenstands zu einem Datum.
-   **`Domain` (`src/lib/domain.js`):** Enthält Normalisierungslogik und fachliche Grundoperationen.

## 5. Entwicklungskonventionen

-   **State Mutation:** Niemals das Projekt direkt mutieren. Nutze `appState.mutateProject(mutator)`.
-   **Determinisimus:** Die Projektion muss bei gleichem Input (JSON + Datum) immer das gleiche Ergebnis liefern. Achte auf die `order` bei Ereignissen am selben Tag.
-   **Stammdaten vs. Events:** Redaktionelle Korrekturen (Namen, Tags, Notizen) sind Stammdatenänderungen. Fachliche Statusänderungen sind Events.
-   **Relative Anteile:** Speichere niemals Prozentwerte, nur relative Einheiten (Integer bevorzugt).
-   **IDs:** Nutze `uid(prefix)` für neue Entitäten. Referenziere immer über IDs, niemals über Namen.

## 6. UI-Struktur

-   **Timeline:** Chronologische Liste, markiert durch den Stichtag.
-   **Dashboard:** 3-Spalten-Layout (Timeline, Personen, Gegenstände).
-   **Umverteilungsworkflow:** Ein geführter Prozess, der erst beim "Ausführen" persistente Events erzeugt.
