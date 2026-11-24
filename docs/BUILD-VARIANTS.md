# Build variants — offline HTML and configured PHP

Hausstandsliste has one Svelte UI and two current distributions. Static HTML cannot save to the PHP API. Only the PHP build provides same-origin online storage.

## 1. Standalone HTML

```bash
cd hausstand-svelte
npm ci
npm run build:single
```

- `dist/hausstand-standalone.html` contains the responsive V3 UI. GitHub Pages publishes that same offline UI at the repository root.
- Open plain or encrypted project files locally. Import loads a working copy, not a linked file. Save downloads a new complete file including embedded version history; the original file remains unchanged.
- Unprotected browser working copies are temporary; protected data is not cached as plaintext. No remote file list, checkout or online save is available in the standalone distribution.

## 2. Build the single-file PHP application

```bash
cd hausstand-svelte
npm ci
npm run build:php
php -l dist/hausstand.php
```

`dist/hausstand.php` contains PHP, HTML, JavaScript and CSS. Upload it to a PHP-capable HTTPS host after configuring a private writable data directory. The PHP build also builds the UI; no separate standalone build is needed.

Without a local development environment, start [Build PHP single-file release (manual)](https://github.com/Uli-Z/hausstandsliste/actions/workflows/php-release.yml) using Run workflow, then download and unpack the `hausstand-php-manual` artifact.

## 3. Server configuration

The current build copies this configuration block from `server-php/backend.php` to the start of the PHP file:

```php
$HAUSSTAND_CONFIG = [
    'data_dir' => __DIR__ . '/../hausstand-private-data',
    'allow_create' => false,
    'backup_email' => '',
    'mail_from' => '',
];
```

- `data_dir`: writable directory **outside the public webroot**. PHP creates it when needed; adjust the path for subdirectory installations. In-webroot storage is rejected.
- `allow_create`: defaults to false. Setting true allows any visitor with access to the application to create a project; use an upstream access restriction such as HTTP authentication or protected network access.
- `backup_email` and `mail_from`: optional addresses for encrypted backup attachments if the host supports PHP mail.
- Environment overrides: `HAUSSTAND_DATA_DIR`, `HAUSSTAND_ALLOW_CREATE`, `HAUSSTAND_BACKUP_EMAIL`, `HAUSSTAND_MAIL_FROM`.

Example: `/home/account/public_html/hausstand.php` and `/home/account/hausstand-private-data/`. PHP 8.1+, HTTPS and PHP write permission to the private folder are required. Keep configuration secrets out of the public repository. Manual admin-authenticated self-update and separate local configuration are planned under S05, **not implemented**.

The UI uses its own address (`hausstand.php?api=...`); there is no API URL or workspace-key setting in the browser. Project passwords remain in the browser.

## 4. Using online storage

1. Open the deployed PHP URL over HTTPS.
2. In **Save & open → Work together online** (German: **Sichern & Öffnen**), choose a project and enter its password.
3. Start editing (checkout), make changes, save online and stop editing (checkin). Read-only viewing does not acquire an editing lease.
4. If creation is enabled, create a new online project from the current working copy with a long passphrase.
5. A separate local encrypted download is a backup, not a confirmed online save. Only online projects have a remote identity.

Each online project has one current encrypted document containing its portable archive. Technical revisions and an exclusive lease prevent conflicting writes; there is no separate server-side history or real-time merging.

**Limits:** PHP must execute rather than serve the source as text. Project names and technical metadata can be visible on a publicly reachable installation. A lost file password cannot be recovered by the server. Real hosting, access control, recovery and security must be checked before sensitive use; see [Deployment](DEPLOYMENT.md), [Security](SECURITY-AND-ENCRYPTION.md) and [QA](WG-PRAXIS-TODO.md).
