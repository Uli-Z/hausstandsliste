# Hausstandsliste: GitHub Pages und PHP-Online-Ablage

**Stand:** 21.11.2026. Die App ist auf `master` in zwei Formen baubar. Die statische Veröffentlichung benötigt eine einmalige Einstellung im GitHub-Repository; der PHP-Betrieb benötigt **separates** HTTPS/PHP-Hosting. Niemals unverschlüsselte echte Projektdateien ins öffentliche GitHub-Repository legen.

## 1. GitHub-Pages-Veröffentlichung

GitHub Pages hostet **nur** die Svelte-Weboberfläche (`index.html` mit eingebettetem JS/CSS). Die PHP-API ist dort **nicht ausführbar**.

Der Workflow [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) baut aus der Anwendung die Standalone-HTML und versucht sie automatisch über `actions/deploy-pages` zu veröffentlichen. **Der erste automatische Versuch zur Aktivierung scheiterte am 21.11.2026 mit „Resource not accessible by integration“**, weil dem Workflow die Berechtigung fehlt, GitHub Pages erstmals zu aktivieren.

Für den Repository-Administrator sind deshalb einmalig nötig:

1. **[Repository → Settings → Pages](https://github.com/Uli-Z/hausstandsliste/settings/pages)** öffnen.
2. Unter **Build and deployment → Source** die Einstellung **GitHub Actions** wählen.
3. Den Workflow [**Deploy Hausstand to GitHub Pages**](https://github.com/Uli-Z/hausstandsliste/actions/workflows/pages.yml) über **Run workflow** auf dem Branch `master` ausführen. Erfolgreichen Lauf/Deployment-URL kontrollieren.

Die erwartete Webadresse nach erfolgreicher Aktivierung ist `https://uli-z.github.io/hausstandsliste/`. Nicht davon ausgehen, dass sie vor dem ersten erfolgreichen Deployment erreichbar ist.

Alternativ kann die [fertige Offline-HTML](https://github.com/Uli-Z/hausstandsliste/actions/workflows/ci.yml) als `hausstand-standalone` aus dem letzten erfolgreichen CI-Lauf heruntergeladen und ohne Hosting lokal geöffnet werden.

## 2. PHP-Release und Serverkonfiguration (neu ab 22.11.2026)

Die PHP-Datei wird separat und bei Bedarf gebaut. Sie verwendet die mobile V3 und ist ohne API-Einrichtungsdialog vorkonfiguriert. Die HTML-/Pages-Builds sind rein lokal und können nicht auf dem Server speichern.

Siehe die verbindliche Schritt-für-Schritt-Anleitung [**Offline-HTML und vorkonfigurierte PHP-Version**](BUILD-VARIANTS.md), einschließlich Build-Workflow, PHP-Konfigurationsblock, sicherem Datenverzeichnis, `allow_create` und Bedienung. Die frühere Methode mit Workspace-Schlüssel im Browser und separater API-URL wird nicht mehr verwendet.

## 5. Passwortwechsel und Grenzen

Passwortwechsel im Checkout verschlüsselt **die aktuelle Revision** neu und rotiert zugleich den geheimen Bearbeitungsschlüssel. Alte Browser-Clients mit dem bisherigen Token können danach nicht mehr auf dem Server speichern.

**Wichtig:** Alle bereits archivierten Versionen und E-Mail-Backups bleiben mit ihrem **alten** Passwort entschlüsselbar. Das neue Passwort allein entsperrt diese alten Versionen nicht automatisch. Eine vollständige, atomare Neuverschlüsselung der gesamten Versionshistorie ist noch ein offener Entwicklungspunkt. Alte Mail-Backups kann man nicht rückwirkend ändern oder zurückrufen.

Auch bei clientseitiger Verschlüsselung kann ein kompromittierter Webserver manipuliertes JavaScript ausliefern. Vor Verwendung echter sensibler Daten eine Sicherheitsprüfung des Deployments durchführen.

## 6. Verschlüsselte E-Mail-Sicherungen

Wenn `HAUSSTAND_BACKUP_EMAIL` und `HAUSSTAND_MAIL_FROM` korrekt gesetzt sind, versucht PHP nach jeder bestätigten Dateianlage bzw. Revision eine Nachricht mit **ausschließlich verschlüsseltem** Dateianhang zu versenden. Die eigentliche Zustellung hängt von der Mail-Konfiguration des Hosts ab; PHP `mail()` bedeutet nur, dass die Nachricht an den lokalen Mailtransport übergeben wurde.

Bei Versandfehler bleibt die Dateirevision dauerhaft gespeichert. Der Versandstatus steht in den Versionsmetadaten. Bei einem späteren Speichervorgang werden ausstehende Mails bis zu fünfmal mit einem Mindestabstand von fünf Minuten erneut versucht. Es gibt derzeit **keinen unabhängigen Cron-/Warteschlangendienst**, der ohne künftigen Zugriff/Schreibvorgang erneut zustellt. Eine echte externe Zustellprüfung ist noch offen.

## 7. Geprüft / noch offen

Automatisiert in GitHub Actions: JavaScript-Fachtests, Kryptotests, Vite-Standalone-Build, PHP-Build/`php -l` sowie ein kurz gestarteter PHP-HTTP-Integrationstest für Datei anlegen/lesen, Checkout, zweiten Checkout blockieren, Revisionen und Konflikte, Tokenrotation und Checkin.

Noch offen: Browser-End-to-End-Test auf tatsächlichen Mobil-/Desktop-Browsern, Online-CORS mit deinem Host, Produktivkonfiguration, tatsächliche Mailzustellung, TLS-/Security-Header-Review, wiederholte Konflikte und vollständige Passwort-Neuverschlüsselung der alten Historie. **Kein produktives Sicherheitsversprechen durch erfolgreiche CI allein.**
