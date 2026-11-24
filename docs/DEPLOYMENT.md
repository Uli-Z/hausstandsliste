# Deployment — GitHub Pages and PHP online storage

The same Svelte UI is distributed as offline HTML and a separately built PHP release. Never put real project files or configuration secrets in the public repository.

## 1. Static GitHub Pages

Pages hosts only the HTML with bundled JS/CSS, not the PHP API. The [Pages workflow](../.github/workflows/pages.yml) builds and deploys the standalone UI. For a new repository configuration, an administrator must:

1. Open [Settings → Pages](https://github.com/Uli-Z/hausstandsliste/settings/pages).
2. Select **GitHub Actions** under Build and deployment → Source.
3. Run [Deploy Hausstand to GitHub Pages](https://github.com/Uli-Z/hausstandsliste/actions/workflows/pages.yml) on `master` and verify the deployment.

The published URL is [uli-z.github.io/hausstandsliste/](https://uli-z.github.io/hausstandsliste/). The [24 November 2026 deployment workflow](https://github.com/Uli-Z/hausstandsliste/actions/runs/45363166660) succeeded; independent inspection of the currently served page remains Q09.

Alternatively, download the `hausstand-standalone` artifact from a successful [CI run](https://github.com/Uli-Z/hausstandsliste/actions/workflows/ci.yml) and open the HTML locally.

## 2. PHP deployment

Follow [Build variants](BUILD-VARIANTS.md) for building or downloading the PHP artifact, operator configuration, same-origin API, private data directory, creation permissions and usage. Use separate HTTPS/PHP hosting; Pages cannot execute PHP. The offline distribution has no online project storage.

Ensure PHP executes the file instead of exposing source, and ensure the storage directory is outside the webroot with appropriate access permissions. Configure upstream access restrictions before allowing project creation. The current file and embedded archive are encrypted in the browser.

## 3. Password rotation and recovery

Changing an online project password during checkout re-encrypts the entire current document including its embedded archive and rotates the editing capability. Clients with the old capability cannot continue saving. Previously downloaded or emailed encrypted files remain decryptable with their original password; they cannot be revoked.

A compromised web server can still deliver malicious JavaScript. Review [security limitations](SECURITY-AND-ENCRYPTION.md) before handling sensitive data.

## 4. Encrypted email backups

When `HAUSSTAND_BACKUP_EMAIL` and `HAUSSTAND_MAIL_FROM` are configured, PHP attempts to send an encrypted attachment after confirmed creation or save. A successful `mail()` call indicates acceptance by the local mail transport, not confirmed delivery.

Email failure does not undo a saved revision. A server-side retry queue records delivery status; later saves retry pending messages up to five times with at least five minutes between attempts. There is no independent cron/queue worker. Test actual delivery and recovery on the host.

## 5. Acceptance

CI covers JS tests, encryption, standalone and PHP builds, PHP lint and a local HTTP smoke test. Automated browser tests cover documented cross-browser offline and Chromium two-context online scenarios; see [QA status](WG-PRAXIS-TODO.md). Full browser QA is deliberately manual, not triggered on every commit.

Outstanding: current UI regression, physical devices, external HTTPS hosting, TLS/security headers, access permissions, lease expiry/renewal and password-rotation/recovery on the intended host, real email delivery and independent security review. Passing CI is not a production security guarantee.
