# Save and open — V3 interaction flow

Decision (2026-11-23): a browser working copy is not an open file. A downloaded file is a new, separate artifact; only a PHP project has a genuine remote identity and edit lease. This design implements Q20 together with the overlapping local-file portion of Q24.

## Information architecture

1. **Current working copy:** one compact status line: project name, local or online context, dirty vs. unchanged. A local source filename is never presented as a connected file.
2. **Save:** one dominant action, whose effect depends on context:
   - Local, unprotected: export a complete new JSON file with embedded compressed version history.
   - Local, protected and unlocked this session: export a *new encrypted* file, never silently plaintext.
   - PHP project with active edit lease: save the encrypted versioned file to the server with revision checks.
   - PHP project in read-only mode: “Start editing” instead of promising an online save.
   - Optional “Protect a downloaded copy with a password” is secondary and never replaces an online save.
3. **Open a project file:** one import picker accepts plain and encrypted JSON. First inspect the envelope; prompt for a password only when required. Validate before replacement, warn about unsaved changes and never imply the original file will be updated.
4. **Online collaboration (PHP only):** list → enter password → open read-only → start editing → save using the main action → stop editing. New project creation and password change are nested/secondary.
5. **Earlier versions:** a collapsed secondary recovery section with an explicit confirmation, leaving the restored content unsaved. It reads the same embedded archive from the current project.
6. **Settings:** no inert current-project status panel; settings contain actual controls only.

## Safety invariants

- Never export plaintext from a protected working copy by pressing Save.
- Never treat local download as a remote save; remote exports do not mark server edits as saved.
- Never import/new-project/switch remotes while a PHP edit lease is active; stop editing first.
- Preserve revision token and checkout handling for the PHP backend. No new archive format or migration.
- Passwords remain in memory only, never inside the browser's local working copy.
- Dirty status means differences from the last imported/explicitly saved working snapshot; it does not mean that a source file is linked.

## Verification

Source and pure logic unit tests, build:single/build:php and PHP smoke tests run automatically. Full Chromium/Firefox/WebKit visual and interaction review stays manually triggered. Regression journeys: new local → download → modify → download, plain import, encrypted import with deferred password, encrypted save, readonly PHP → checkout → save → checkin, incompatible/invalid import, restore history, mobile + keyboard, DE/EN.
