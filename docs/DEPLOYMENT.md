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

## 2. PHP-App als einzelne Datei erzeugen

```bash
cd hausstand-svelte
npm ci
npm test
npm run build:php
php -l dist/hausstand.php
```

Ergebnis: `dist/hausstand.php`. Im gleichen GitHub-Actions-Build ist sie unter **Artifacts → hausstand-php** erhältlich. Die Datei enthält die identische Svelte-Weboberfläche und zusätzlich die PHP-Speicher-API.

Ein PHP-Host muss PHP 8.1+ (empfohlen 8.2+), HTTPS, beschreibbaren privaten Dateispeicher und bei E-Mail-Backups einen nutzbaren PHP-Mailtransport anbieten. Keine öffentliche Datenablage im Document Root verwenden.

## 3. Server sicher konfigurieren

Beispielaufbau:

```text
/var/www/html/hausstand.php            # öffentlich abrufbarer PHP-Einstieg
/var/lib/hausstand-data/               # NICHT öffentlich, vom PHP-Prozess beschreibbar
```

Verzeichnis `/var/lib/hausstand-data` außerhalb des HTTP-Document-Roots vorher erstellen und nur für den PHP-Benutzer beschreibbar machen. Diese Konfiguration gehört in den Host/Hoster, **nicht** in die öffentliche PHP-Datei oder ins Git-Repository:

| Umgebungsvariable | Bedeutung |
| --- | --- |
| `HAUSSTAND_DATA_DIR` | **Pflicht:** absoluter beschreibbarer Pfad zu privatem Verzeichnis außerhalb des Webroots |
| `HAUSSTAND_WORKSPACE_KEY` | **Pflicht für neue Dateien:** zufälliger geheimer Workspace-Schlüssel von mindestens 16 Zeichen; ist **nicht** das Dateipasswort |
| `HAUSSTAND_ALLOW_ORIGIN` | Für den Zugriff von GitHub Pages z. B. `https://uli-z.github.io` (exakte Origin **ohne** Pfad) |
| `HAUSSTAND_BACKUP_EMAIL` | Optional: feste Backup-Empfängeradresse für verschlüsselte Versionsanhänge |
| `HAUSSTAND_MAIL_FROM` | Optional: überprüfte Absenderadresse, passend zum PHP-Mailtransport |

Bei Bereitstellung auf derselben Origin ist kein `HAUSSTAND_ALLOW_ORIGIN` nötig. Verwende für den Online-Betrieb **immer HTTPS**. Auf GitHub Pages unter „Dateien & Online“ die vollständige PHP-API-URL angeben, zum Beispiel `https://example.org/hausstand.php`. Dateinamen, Revisionen und Sperrfristen sind im gemeinsamen Arbeitsordner sichtbar.

Die Dateipassphrase wird **nur im Browser zur Entschlüsselung** verwendet. Der PHP-Server kennt sie nicht. Das Server-Workspace-Passwort darf nicht mit einem Dateipasswort verwechselt werden und dient ausschließlich zum **Anlegen** neuer Dateien.

## 4. Ablauf im Browser

1. Eine Datei mit einem starken, individuellen Dateipasswort in der Anwendung verschlüsselt anlegen. Dafür beim ersten Anlegen zusätzlich den Workspace-Schlüssel eingeben.
2. Eine bestehende Datei aus der gemeinsamen Liste wählen, Dateipasswort eingeben und zunächst **schreibgeschützt** öffnen.
3. **Auschecken**, bearbeiten und **Auf Server speichern**. Dabei entsteht automatisch eine neue Revision; die Lease läuft zwei Stunden ab und wird nur beim Speichern bzw. über „Sperre verlängern“ erneuert.
4. **Einchecken**. Ein abgelaufener Checkout wird serverseitig automatisch ungültig; andere können danach übernehmen. Eine verlorene Sperre oder eine überholte Revision führt zum Speicherkonflikt, nicht zu stillem Überschreiben. Dann den ungespeicherten Stand **verschlüsselt lokal exportieren**.
5. Unter **Versionen** lässt sich eine ältere verschlüsselte Version nach Eingabe ihrer gültigen Passphrase wieder öffnen und mit aktiver Lease **als neue Revision** abspeichern.

Ein lokaler verschlüsselter Export ist auch ohne PHP/Webserver möglich. Klartext-JSON-Export ist weiterhin bewusst verfügbar; bei geschützten Projekten erscheint dafür eine Warnung.

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
