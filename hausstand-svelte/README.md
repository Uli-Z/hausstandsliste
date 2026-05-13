# Hausstand – Svelte-Quellprojekt

Diese Version zerlegt die bisherige Single-HTML-App in viele kleinere Quelldateien und baut sie mit Svelte/Vite wieder zu einer einzelnen HTML-Datei zusammen.

## Architektur- und Domänenübersicht

### Hausstand – historische Anteilsverwaltung für Gemeinschaften

**Ziel:** Verwaltung gemeinschaftlich finanzierter Gegenstände einer Wohngemeinschaft oder ähnlichen Gemeinschaft.

### 1. Grundprinzipien

-   **Lokale Single-File-App:** Die App funktioniert dauerhaft als eine einzelne HTML-Datei (kein Server, keine Datenbank, keine API).
-   **JSON-Datei ist permanente Wahrheit:** Der maßgebliche Zustand liegt in der JSON-Projektdatei. Browser-Storage dient nur als Arbeitskopie.
-   **Historische Rekonstruktion:** Der Zustand wird aus Ereignissen bis zu einem wählbaren **Stichtag** rekonstruiert.
-   **Arbeitsdokument, keine Buchhaltung:** Ereignisse sind korrigierbar. Die App dokumentiert Wertanteile, aber **keine tatsächlichen Zahlungen**.

### 2. Ubiquitous Language (Kernbegriffe)

-   **Projekt:** Gesamte Datenbasis (Metadaten, Personen, Gegenstände, Events).
-   **Person:** Kann aktiv oder inaktiv sein (rekonstruiert aus Events).
-   **Gegenstand:** Ein Objekt des Hausstands mit ID, Name und Tags.
-   **Anteil (Share):** Relative Einheit (z.B. 2:1:1 entspricht 50%:25%:25%).
-   **Stichtag:** Das Datum, zu dem der Zustand berechnet wird.
-   **Umverteilung:** Gebündelter Arbeitsmodus für Anteilsänderungen mit Ausgleichsempfehlung.

### 3. Technischer Aufbau

#### Verzeichnisse & Module
-   `src/lib/` – Fachlogik:
    -   `domain.js`: Basisstrukturen & Normalisierung.
    -   `projector.js`: Event-Sourcing-Logik (Zustandsrekonstruktion).
    -   `valuation.js`: Bewertungsmodelle (Linear, Degressiv, Fixwert).
    -   `persistence.js`: Import/Export & LocalStorage.
-   `src/stores/` – `projectStore.js`: Zentraler App-State (Svelte-Store).
-   `src/components/` – UI-Komponenten.
-   `scripts/inline-build.mjs` – Bündelt den Vite-Build zu `dist/hausstand-standalone.html`.

### 4. Lokal starten & Bauen

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run dev

# Einzelne HTML-Datei bauen
npm run build:single
```
Die fertige Datei liegt danach unter `dist/hausstand-standalone.html`.

---

*Hinweis: Eine detaillierte fachliche Dokumentation der Ereignistypen und Bewertungsmodelle findet sich in der `GEMINI.md` für die AI-Unterstützung sowie in der internen Projektdokumentation.*
