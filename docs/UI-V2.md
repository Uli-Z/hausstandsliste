# UI V2 – separater Entwurf

Dieser Entwurf wird unter `https://uli-z.github.io/hausstandsliste/ui-v2/` zusätzlich zur produktiven GitHub-Pages-Startseite veröffentlicht.

## Architektur
- `hausstand-svelte/ui-v2/App.svelte` ist ein alternatives Dashboard/Layout.
- Personen, Gegenstände, Zeitverlauf, Details, Dialoge, Forderungsberechnung, Verschlüsselung, lokale und PHP-Onlinespeicherung werden **aus denselben Originalmodulen unter `src/` importiert**. Der fachliche Code wurde nicht verändert.
- `design.css` baut auf `src/styles.css` auf und führt ein eigenständiges Design mit besseren Smartphone-Breakpoints ein.
- `npm run build:ui-v2` erstellt ein selbstständiges HTML-Dokument in `dist/pages/ui-v2/index.html`. Die HTML-Ausführung bleibt als verzögertes Modul nach dem DOM-Parsing erhalten, um den früheren leeren Bildschirm zu vermeiden.
- `.github/workflows/pages.yml` veröffentlicht das Original weiter unter `/` und den Entwurf unter `/ui-v2/`.
- Die beiden Ansichten sind auf derselben Domain und nutzen dieselbe Browser-Arbeitskopie. Änderungen in einer Ansicht können deshalb in der anderen erscheinen. Vor Änderungen sensible/produktive Daten exportieren bzw. sichern. Die in der Anwendung integrierte Online-Speicherung benötigt weiterhin einen separaten HTTPS/PHP-Server; GitHub Pages selbst führt kein PHP aus.

## Lokales Prüfen
```bash
cd hausstand-svelte
npm ci
npm test
npm run build:single
npm run build:ui-v2
```
In der GitHub Actions-Pipeline werden beide Builds validiert.
