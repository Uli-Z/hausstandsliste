# Offline-HTML und vorkonfigurierte PHP-Version

Hausstand wird in **zwei getrennten Betriebsvarianten** gebaut. Eine statische HTML-Datei enthält keine Möglichkeit, Projekte über die PHP-API zu speichern. Nur der manuell erstellte PHP-Build nutzt den Server und kennt automatisch seine eigene Adresse.

## 1. Standalone HTML (nur lokal)

```bash
cd hausstand-svelte
npm ci
npm run build:single
npm run build:ui-v3
```

- `dist/hausstand-standalone.html`: bisherige Offline-Oberfläche
- `dist/pages/ui-v3/index.html`: aktuelle mobile Oberfläche
- Beide arbeiten unabhängig von PHP. Projekt-JSON sowie verschlüsselte Backups lassen sich herunterladen und wieder öffnen; unverschlüsselte Arbeitskopien bleiben im jeweiligen Browser.
- Die ebenfalls statischen GitHub-Pages-Seiten haben keine Server-Dateiliste, keinen Server-Checkout und keine Server-Speicherfunktion.

## 2. PHP-App manuell als einzelne Datei bauen

```bash
cd hausstand-svelte
npm ci
npm run build:php
php -l dist/hausstand.php
```

Die Datei **`dist/hausstand.php`** enthält PHP-API, HTML, JavaScript und CSS in einem Artefakt. Sie verwendet die **mobile V3**. Hochladen genügt, sobald der private Datenordner konfiguriert und über PHP beschreibbar ist. Ein weiterer Build der HTML-Version ist nicht nötig.

**Ohne lokale Entwicklungsumgebung:** In GitHub den Workflow [Build PHP single-file release (manual)](https://github.com/Uli-Z/hausstandsliste/actions/workflows/php-release.yml) über „Run workflow“ starten. Aus dem abgeschlossenen Workflow unter „Artifacts“ `hausstand-php-manual` herunterladen und die ZIP-Datei entpacken.

## 3. Konfiguration in derselben PHP-Datei

Die folgenden Einstellungen stehen **ganz am Anfang** von `hausstand.php` (sie werden aus `server-php/backend.php` übernommen):

```php
$HAUSSTAND_CONFIG = [
    'data_dir' => __DIR__ . '/../hausstand-private-data',
    'allow_create' => false,
    'backup_email' => '',
    'mail_from' => '',
];
```

- `data_dir`: beschreibbarer Ordner **außerhalb des öffentlich abrufbaren Webverzeichnisses**. PHP legt ihn bei Bedarf selbst an. Wenn das Skript in einem Unterordner liegt, muss der Pfad ggf. angepasst werden. Daten innerhalb des Webroots werden sicherheitshalber abgelehnt.
- `allow_create`: Standardmäßig `false`; Besucher können vorhandene Projekte öffnen, aber keine neuen anlegen. Setzt der Betreiber `true`, darf **jeder Besucher mit Zugriff auf die PHP-Seite** neue Projekte anlegen – deshalb nur mit einer vorgeschalteten Zugriffsbeschränkung (z. B. HTTP-Authentifizierung oder geschützter Netzwerkzugang) verwenden.
- `backup_email` / `mail_from`: optionale Adressen für verschlüsselte Sicherungsanhänge, falls `mail()` auf dem Server funktioniert.
- Serveradministratoren können Werte durch `HAUSSTAND_DATA_DIR`, `HAUSSTAND_ALLOW_CREATE`, `HAUSSTAND_BACKUP_EMAIL` und `HAUSSTAND_MAIL_FROM` aus ihrer Hosting-Umgebung übersteuern.

Beispiel: `/home/konto/public_html/hausstand.php` im Web, `/home/konto/hausstand-private-data/` für Dateien. Bei dieser Verzeichnisstruktur passt der Standardpfad. Benötigt werden PHP 8.1+, ein HTTPS-Host und Schreibrechte für PHP im privaten Ordner.

**Keine API-URL und kein Workspace-Schlüssel im Browser:** Die Weboberfläche benutzt ausschließlich dieselbe PHP-Adresse (`hausstand.php?api=...`). In den Einstellungen des Benutzers existiert keine Verbindungsmaske. Die Dateipasswörter verbleiben im Browser; der Server verwaltet nur die verschlüsselten Daten.

## 4. Nutzung der Server-App

1. Öffne die auf dem HTTPS-Host veröffentlichte `hausstand.php` im Browser.
2. Unter **Sichern & Teilen → Online-Projekte** sind vorhandene Dateien auf diesem Server sichtbar. Ein Passwort ist nur für das gewählte Projekt nötig, nicht für die Serververbindung.
3. Öffne ein Projekt, starte die Bearbeitung (Checkout), ändere die Daten und speichere die Revision. Beende die Bearbeitung (Checkin), damit andere übernehmen können.
4. Wenn `allow_create=true` gesetzt ist, kannst du aus dem aktuellen Stand ein neues Online-Projekt anlegen. Ein langes Projektpasswort ist erforderlich.
5. Zusätzlich bleiben lokale verschlüsselte oder unverschlüsselte Dateien verfügbar. Verschlüsselte Daten werden nicht als Klartext-Browserkopie gespeichert.

**Wichtige Einschränkungen:** Der PHP-Server muss die Datei als PHP ausführen, darf sie nicht als Klartext ausliefern und muss über HTTPS erreichbar sein. Dateinamen und Versionsmetadaten sind bei einer öffentlich erreichbaren Instanz sichtbar; das Öffnen der Inhalte erfordert das Dateipasswort. Ein verlorenes Dateipasswort kann nicht auf dem Server wiederhergestellt werden. Die App verhindert paralleles Bearbeiten durch Checkout/Checkin; sie synchronisiert Bearbeitungen nicht in Echtzeit. Vor echtem Einsatz Sicherheits-/Berechtigungsprüfung und Backups einplanen.
