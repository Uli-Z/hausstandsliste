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
    'backup_email' => '',
    'mail_from' => '',
    'admin_token' => '',
];
```

- `data_dir`: writable directory **outside the public webroot**. PHP creates it when needed; adjust the path for subdirectory installations. In-webroot storage is rejected.
- `admin_token`: a long secret required to initialize the one server project and install application updates.
- `backup_email` and `mail_from`: optional addresses for encrypted backup attachments if the host supports PHP mail.
- Environment overrides: `HAUSSTAND_DATA_DIR`, `HAUSSTAND_ADMIN_TOKEN`, `HAUSSTAND_BACKUP_EMAIL`, `HAUSSTAND_MAIL_FROM`.

Example: `/home/account/public_html/hausstand.php` and `/home/account/hausstand-private-data/`. PHP 8.1+, HTTPS, cURL and PHP write permission to the script and private data folder are required. Copy `server-php/hausstand-config.example.php` to a private file outside the web root and set `HAUSSTAND_CONFIG_FILE` to its path, then set `backup_email`, `mail_from` and a long random `admin_token`. The config filename is ignored by Git. In Settings, enter the same token and use **Neueste Version installieren**; it downloads the PHP asset from the latest GitHub release and checks PHP syntax before atomically replacing the app. Configure mail only on the server and verify real delivery after deployment.

The UI uses its own address (`hausstand.php?api=...`); there is no API URL or workspace-key setting in the browser. Project passwords remain in the browser.

## 4. Using online storage

1. Open the deployed PHP URL over HTTPS. On first use, initialize the single project with the admin token and a project password.
2. Sign in with the project password. The browser keeps an encrypted device credential and a session cookie for subsequent visits.
3. Edit and use **Auf dem Server speichern**. An exclusive lease protects against conflicting changes.
4. Download an encrypted backup or restore one in Settings. Restoring replaces the current server project after confirmation.

Each online project has one current encrypted document containing its portable archive. Technical revisions and an exclusive lease prevent conflicting writes; there is no separate server-side history or real-time merging.

**Limits:** PHP must execute rather than serve the source as text. Project names and technical metadata can be visible on a publicly reachable installation. A lost file password cannot be recovered by the server. Real hosting, access control, recovery and security must be checked before sensitive use; see [Deployment](DEPLOYMENT.md), [Security](SECURITY-AND-ENCRYPTION.md) and [QA](WG-PRAXIS-TODO.md).
