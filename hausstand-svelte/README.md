# Hausstand – Svelte-Quellprojekt

Diese Version zerlegt die bisherige Single-HTML-App in viele kleinere Quelldateien und baut sie mit Svelte/Vite wieder zu einer einzelnen HTML-Datei zusammen.

## Dateien

- `src/lib/` – Fachlogik, Projektion, Bewertung, Persistenz
- `src/stores/` – zentraler App-State
- `src/components/` – Svelte-Komponenten für Header, Timeline, Listen, Details und Umverteilung
- `scripts/inline-build.mjs` – nimmt den normalen Vite-Build und schreibt `dist/hausstand-standalone.html`

## Lokal starten

```bash
npm install
npm run dev
```

## Einzelne HTML-Datei bauen

```bash
npm install
npm run build:single
```

Danach liegt die fertige Datei hier:

```text
dist/hausstand-standalone.html
```

## Warum die Umverteilung neu strukturiert wurde

Der alte Fehler entstand aus einem großen Script mit globalem Dialogzustand. In dieser Version liegt eine Umverteilung als klarer Arbeitsstand in `project.redistributions`. Der Dialog schreibt Änderungen über kontrollierte Funktionen in diesen Arbeitsstand. Erst `Umverteilung ausführen` erzeugt ein `redistribution-executed`-Timeline-Event mit `shares-set`-Child-Events.

Die Aktion „Alle Anteile von einer Person auf eine andere übertragen“ ist im Umverteilungsdialog als eigene Personenaktion implementiert.

## Hinweise

Ich konnte den Svelte-Build in dieser Umgebung nicht ausführen, weil die Svelte/Vite-Pakete hier nicht vorinstalliert sind und keine Netzwerk-Installation möglich ist. Die JavaScript-Module und das Build-Skript wurden aber syntaktisch geprüft.
