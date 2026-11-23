# Encrypted PHP collaborative storage

**Status:** PHP implementation and automated smoke tests present. Real hosting and security acceptance pending.

The optional PHP release serves the **same Svelte UI** as the standalone HTML build, plus an API for a shared folder of encrypted project documents. End users open that PHP file via HTTPS. Its operator configures an inaccessible private data directory, optional email backup and whether the public UI can create projects. The server receives ciphertext, not file passwords or plaintext ownership data.

## One current file per project

Each project folder contains metadata (`meta.json`) and a server-managed current encrypted document file (`current-<revision>.json`). A metadata pointer selects the active file. Older replaced current files are removed after the pointer is committed; no separate file-version archive or historical version API exists. The **entire user-facing version history is embedded in the encrypted document** and can be inspected/restored client-side after decryption.

The numeric technical server `revision` is used only for `expectedRevision` write-conflict checks and to select a crash-safe current file. It is not a recoverable earlier business snapshot.

The server may also maintain a bounded retry queue containing separately encrypted email backup payloads. This queue is for email delivery, not user-visible file history.

## Core workflow

1. `GET ?api=files`: list project names, revision and checkout status.
2. `GET ?api=read&id=...`: return current encrypted document and technical revision.
3. Browser decrypts with a project password; viewing is read-only until checkout.
4. `POST ?api=checkout`: acquire exclusive editing lease; a second editor is blocked.
5. `POST ?api=save`: submit the entire new encrypted project document with embedded `versionHistory`, valid lease and `expectedRevision`. Server writes a new current file, updates its metadata pointer, increments revision, and removes the replaced file.
6. `POST ?api=renew` or `POST ?api=checkin`: extend or release the lease. Lease expiry alone is not a save.
7. Password rotation uploads a re-encrypted whole current project and rotates the editing capability. Already emailed backup files retain their previous encryption.

## Security and constraints

- Require HTTPS, a writable **private directory outside the webroot**, correct file permissions, and access control around new-project creation.
- Keep encryption and key derivation in the browser; PHP checks opaque capability/lease hashes.
- Reject stale revisions and expired leases rather than silently overwriting.
- Never claim a save succeeded until the server confirms the new revision.
- Never put decrypted protected projects in `localStorage`.
- A shared file is edited by one person at a time. There is no automatic real-time merging.
- Optional email delivery failure must not roll back a successfully written project.

The distributable is generated using `npm run build:php` as `dist/hausstand.php`. It is separate from static GitHub Pages. See [Build variants](BUILD-VARIANTS.md), [Portable history](FEATURE-PORTABLE-VERSION-HISTORY.md) and [Security](SECURITY-AND-ENCRYPTION.md).
