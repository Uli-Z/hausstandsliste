# Portable in-file version history

**Status:** Implemented in source for the sole Svelte UI and PHP API, with automated tests. Interactive cross-browser and real-hosting acceptance are still open (Q11). Session Undo/Redo remains a separate planned feature (Q12).

## One current project format

The active project is ordinary JSON at the root, with `community`, `people`, `items`, `events`, `drafts`, and `lastSavedAt`. Its final `versionHistory` field has the form:

```json
{
  "format": "portable-v1",
  "entries": [
    {
      "id": "snapshot-uuid",
      "savedAt": "2026-11-23T09:00:00.000Z",
      "encoding": "gzip-base64",
      "sha256": "64-digit-hex-sha256",
      "data": "H4sIA..."
    }
  ]
}
```

The outer file has `schemaVersion: 1`, `currency: "EUR"`, and a complete active project. Each entry is a **complete previous saved project snapshot**, compressed as gzip, encoded as Base64 and integrity-checked using SHA-256. Archived snapshots do not include an archive of their own. The currently saved state is the ordinary top-level document, not a duplicate entry.

There is **one supported import format**: current project JSON with this embedded archive. The application does not support earlier schema variants or migration.

## Saving and restoring

Only explicit **Save** operations create file versions. Editing, navigation, date-travel and session-level Undo/Redo do not create versions.

- **Local HTML:** Save downloads the full JSON file, including its portable history. The browser usually cannot overwrite the previously downloaded path; a browser working copy is not a substitute for keeping the file.
- **Encrypted local:** the browser encrypts the entire document, including its complete history; no plaintext history is cached.
- **Online PHP:** Save encrypts the same document in the browser and uploads it as the server's only current project file. The server keeps a separate **technical revision counter and an exclusive checkout lease** to prevent competing writes. No server-side historical project files or history-reading endpoints exist.
- **Restore:** selecting an archive entry loads its contents as an **unsaved editable working state**. The embedded archive is retained. The next explicit Save archives the previous current file and makes the restored state current.

The PHP backend swaps a server-generated current file and metadata pointer to avoid exposing a partially saved revision. Optional encrypted email backups are independent recovery media, not the primary version history. Already-sent email attachments cannot be retroactively re-encrypted by a password change.

## Remaining acceptance

- Browser download/import from multiple devices, local versus encrypted versus PHP round trips.
- Full-archive integrity, corrupted snapshots, compression and storage quota limits.
- Two-browser checkout, lease expiry, technical revision conflicts and password rotation.
- Real mail delivery, hosting security and recovery tests.

Implementation: `hausstand-svelte/src/lib/versionHistory.js`, `ui-v3/StorageView.svelte`, `src/stores/projectStore.js`, `server-php/backend.php`. See [prioritized QA](WG-PRAXIS-TODO.md).
