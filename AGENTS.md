# Repository Guidelines

## Project Structure & Module Organization

The working app lives in `hausstand-svelte/`. Source code is under `hausstand-svelte/src/`, with the entry point in `src/main.js` and the main UI in `src/App.svelte`. Shared styling is in `src/styles.css`. Build helpers live in `hausstand-svelte/scripts/`, and generated output is written to `hausstand-svelte/dist/`.

The project is intentionally a single-file Svelte/Vite app: the build produces `dist/hausstand-standalone.html` for offline use.

Core domain logic is split across `src/lib/` for normalization, projection, valuation, and persistence, with app state managed in `src/stores/projectStore.js`. Keep event reconstruction logic deterministic and centralized.

## Build, Test, and Development Commands

Run commands from `hausstand-svelte/`:

- `npm install` installs dependencies from `package-lock.json`.
- `npm run dev` starts the Vite dev server on `127.0.0.1`.
- `npm run build` creates the production bundle in `dist/`.
- `npm run build:single` builds and then inlines assets into `dist/hausstand-standalone.html`.
- `npm run check:js` runs Node syntax checking on `scripts/inline-build.mjs`.

## Coding Style & Naming Conventions

Use modern ES modules and Svelte components. Existing code uses 2-space indentation, single-quoted strings, and semicolon-terminated JavaScript. Keep component names in `PascalCase` (`Header.svelte`), utility modules in `camelCase` (`projectStore.js`), and prefer descriptive file names that match their purpose.

CSS is centralized in `src/styles.css`; reuse existing utility classes and variables before adding new patterns.

Follow the domain conventions from `GEMINI.md`: do not mutate the project object directly, use `appState.mutateProject(...)`; keep IDs stable and reference entities by ID rather than name; store relative shares as integers, not percentages; and preserve event ordering for deterministic projections.

## Testing Guidelines

There is no automated test suite yet. Before opening a change, validate the app with `npm run build` and, for standalone packaging changes, `npm run build:single`. If you add tests, place them alongside the app’s source or in a dedicated `tests/` directory and use clear, feature-based names.

When changing projection or valuation logic, verify the same JSON input and `asOfDate` still produce the same snapshot.

## Commit & Pull Request Guidelines

The Git history is compact and uses imperative commit subjects, often prefixed with `Fix:` or `Initial commit:`. Follow that style for consistency, keep commits focused, and mention the affected area in the subject.

Pull requests should include a short summary, the user-facing impact, and verification steps. Add screenshots or exported HTML when UI or packaging output changes.

## Configuration Notes

This app is designed to run locally without a backend. Treat the JSON project file as the source of truth and avoid introducing server dependencies unless the architecture changes deliberately.
