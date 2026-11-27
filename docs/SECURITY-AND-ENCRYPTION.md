# Security and encryption

**Status:** Current implementation documented on 24 November 2026. Automated crypto tests, PHP smoke tests and documented local browser round trips have passed. No independent security audit or real-hosting acceptance has been completed.

## Security goals and limits

The optional server stores and emails encrypted project documents, not plaintext ownership data or file passwords. Encryption/decryption occur in the browser. Local encrypted exports use the same container format. Unprotected JSON downloads are an explicit alternative for unprotected working copies, not a safe default for protected data.

Project names, IDs, file sizes, modification dates, checkout status and technical revision metadata may be visible to visitors. Encryption protects stored ciphertext against access without the password, but does not protect against malicious code delivered by a compromised server, XSS, browser malware, compromised devices or weak passwords. HTTPS is required for online use. A locally verified HTML file reduces reliance on a web server but not device risk.

## Implemented container

In `hausstand-svelte/src/lib/crypto.js`:

- `format: hausstand-aesgcm-v1`, `version: 1`, `kdf: PBKDF2-SHA256`, `cipher: AES-256-GCM`.
- Web Crypto PBKDF2-HMAC-SHA-256 with 600,000 iterations for new files; a fresh random 16-byte salt and 12-byte nonce for each encryption.
- AES-256-GCM with a 128-bit authentication tag, authenticated JSON header and Base64-encoded ciphertext. Container validation checks header shape, allowed iteration range and salt/nonce lengths.
- Encrypted payload contains the full project JSON (including its portable archive) and an edit capability (`editToken`). New capabilities use 32 random bytes. Wrong passwords and corrupt ciphertext are rejected.

SHA-256 on compressed archive entries detects corruption; it is not an independent authenticity signature for plaintext project files. The current schema alone is supported; there is no legacy migration.

Use long random passphrases, not merely the enforced minimum of eight characters. Public ciphertext permits offline password guessing; server rate limiting cannot prevent that. A lost password is unrecoverable without a separate accessible copy.

## Server authorization and version history

The server stores the SHA-256 hash of the edit capability rather than the file password. After decrypting the document, the browser can use that capability over HTTPS for authorized operations. Capability sharing is not individual user authentication; anyone with the same project password may be able to edit.

The PHP API checks an exclusive checkout lease and the expected technical revision. It maintains one current encrypted project file, not a separate business history. Current-file replacement uses a new file and metadata pointer; see [collaborative storage](FEATURE-COLLABORATIVE-STORAGE.md). Protect creation by upstream access controls when enabling it, and keep the private data directory outside the webroot.

### Password rotation

During checkout, password change re-encrypts the entire current document including all embedded earlier versions and rotates the editing capability. Older capabilities cannot continue writing. Previously downloaded or emailed encrypted copies cannot be retroactively re-encrypted or revoked; their old passwords still work. Test rotation and recovery on the intended host.

## Local working copies and backups

- Unprotected data may be cached in `localStorage` under `hausstand_svelte_v07_working_copy`. The cache is not a durable saved file.
- Opening protected data clears the plaintext working-copy cache and disables plaintext caching. The active session still contains decrypted data in memory; do not assume secure memory erasure.
- Importing a file never links the browser to the source path. Local Save downloads a new file; protected local Save requires the session password and produces encrypted output.
- A separate encrypted backup of an unprotected working copy does not encrypt that working copy. An online backup download does not mark pending server changes saved.
- Restore loads an unsaved working state from the embedded archive. Session Undo/Redo is not serialized.

## Hosting and remaining security checks

Keep private files and configuration outside public access, use HTTPS and proper file permissions, protect creation, verify request limits and avoid logging secrets. Optional mail backups contain encrypted attachments; delivery failure must not undo a saved project. Real delivery and retry/recovery must be checked.

Before production, review XSS, CSP/security headers, same-origin request protection, capability handling, password rotation, rate/size limits, concurrency, archive-size limits and host backup/recovery. Review the current code independently. A compromised server can capture passwords even with client-side encryption. See [Deployment](DEPLOYMENT.md) and [QA](WG-PRAXIS-TODO.md).

## Technical references

- [MDN: Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [MDN: Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)
- [OWASP: Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP: Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP: Web Frontend Security](https://cheatsheetseries.owasp.org/cheatsheets/Web_Frontend_Security_Cheat_Sheet.html)
- [PHP: flock](https://www.php.net/manual/en/function.flock.php)
- [PHP: rename](https://www.php.net/manual/en/function.rename.php)


## Administration credential throttling (S05)

The manual PHP updater and initial project creation share a private, installation-wide credential-attempt budget. Five failed non-empty administrator key attempts per remote address, or sixty failures across the installation, within a fixed five-minute window cause HTTP 429 with `Retry-After` until that window ends. The peer identity is derived from the web server's `REMOTE_ADDR`, not forwarded headers. A reverse proxy may therefore share a budget across clients; the global limit deliberately trades short administrative unavailability for protection against distributed guessing. Do not configure a publicly writable private data directory. The separate `.admin-attempts.lock` and `.admin-attempts.json` hold only bounded counters and hashed peer identifiers, not the supplied key or project contents. These files are technical state, not portable project history. Storage failure blocks administrative operations, not normal project access. Use a high-entropy random administrator key, HTTPS and server-level rate limits as additional protections. The limit does not protect locally performed file decryption or replace hosting security.
