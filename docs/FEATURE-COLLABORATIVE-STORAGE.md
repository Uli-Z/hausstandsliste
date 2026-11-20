# Fach- und Technikentwurf: PHP-Online-Ablage

**Status:** Geplant, nicht implementiert (20.11.2026).

## Ziel

Die **identische Svelte-Anwendung** bleibt lokal als einzelne HTML-Datei verwendbar und kann alternativ als **eine deploybare `hausstand.php`** auf einem gewöhnlichen PHP-Webserver laufen. Sie zeigt dann einen gemeinsamen Arbeitsordner mit mehreren Projektdateien. Dateinamen dürfen (bewusst) ohne Datei-Passwort sichtbar sein. Die Inhalte jeder Datei sind dagegen verschlüsselt und nur mit ihrem jeweiligen Passwort lesbar.

Das System ist für seltene Änderungen durch wenige Personen gedacht, **nicht** für simultanes Live-Merge-Editing. Ein einfaches Checkout/Checkin-Modell, Revisionsprüfung und Versionsarchiv genügen.

## Unveränderte Grundarchitektur

Svelte und Fachlogik bleiben **einmalig** in `hausstand-svelte/src/`. Zwei Release-Varianten aus demselben Build:

1. `dist/hausstand-standalone.html`: offline nutzbar; lokale Klartext-JSONs **oder** verschlüsselte Projektdateien.
2. `dist/hausstand.php`: dieselbe HTML-App inline ausliefern **und** PHP-API per `?api=...` bedienen; zusätzlich Dateiliste, Checkout, Revisionen, verschlüsseltes Speichern, Historie und Benachrichtigung.

**Keine** zweite PHP-UI und keine PHP-Fachlogik: Der Server sieht ausschließlich verschlüsselte Bytes und unkritische Metadaten, berechnet keine Anteile und kennt keine Entschlüsselungspasswörter.

### Quellstruktur (Vorschlag, noch nicht angelegt)

```text
hausstand-svelte/
  src/lib/ledger.js            # zukünftige Fachlogik
  src/lib/crypto.js            # verschlüsseltes Dateiformat; Browser
  src/lib/storage/
    local.js                   # lokale Import-/Export-Funktionen
    remote.js                  # PHP-Transport-API
  src/stores/documentStore.js  # Dateistatus, serverRevision, lease, dirty
  src/components/             # Datei öffnen / Online-Speichern / Sperrstatus / Versionen
  scripts/build-php.mjs        # erzeugt eine PHP-Release-Datei aus Inline-HTML + PHP
server-php/
  src/                        # modular testbarer Backend-Quellcode
  tests/
  app.php                     # PHP-API- und HTML-Template, keine duplizierte UI
dist/
  hausstand-standalone.html
  hausstand.php               # einzig benötigte PHP-Release-Datei
```

Das PHP-Artefakt darf per Konfiguration einen **schreibbaren Datenordner außerhalb des öffentlichen Webroots** verwenden. Eine Serverkonfiguration (Datenverzeichnis, SMTP, Grenzen) muss entweder über Umgebungsvariablen oder eine nicht veröffentlichte Config-Datei bereitgestellt werden. Weder Daten noch Secrets gehören ins öffentliche GitHub-Repository.

## Projektdateien und Arbeitsordner

Die Ablage verwaltet **mehrere Dateien**. Jede Datei hat eine serverseitige **unveränderliche `fileId`**, einen frei sichtbaren Anzeigenamen, aktuelle **monotone `revision`**, Verschlüsselungsheader/Formatversion, eine aktuelle verschlüsselte Datei, verschlüsselte Revisionsarchive sowie Metadaten zum Checkout.

Nicht Dateinamen als Pfade verwenden! Server mappt geprüfte `fileId` auf ein eigenes Verzeichnis, normalisiert Namen zur Anzeige und verhindert Pfadüberquerung. Eine Löschung muss gesondert bestätigt und gegen versehentliche Löschung abgesichert werden.

Beispiel **außerhalb** des Webroots:

```text
private-hausstand-data/
  files/
    <fileId>/
      metadata.json
      current.hausstand.enc
      versions/
        000001.hausstand.enc
        000002.hausstand.enc
      lock.json
  mail-queue/
```

Ein solcher Ordner ist rein konzeptionell: Implementierung darf die Dateistruktur optimieren, solange Versionen und Lock-/Revisionsänderungen konsistent bleiben.

## Nutzungsablauf

1. **Dateiliste** laden: Name, Änderungsdatum/Revision und optional Checkout-Status sichtbar (Inhalte geschützt).
2. **Öffnen:** verschlüsselte Datei herunterladen; Passwort **im Browser** eingeben; dort entschlüsseln. Nur lesen ist ohne Checkout möglich.
3. **Bearbeiten:** Checkout anfordern. Bei fremder aktiver Sperre schreibgeschützt bleiben; Anzeige „gesperrt bis ...“.
4. **Speichern:** Svelte-Projekt-JSON lokal verschlüsseln; API erhält verschlüsselten Inhalt, gültige **Lease-Berechtigung** und die zuvor gelesene `expectedRevision`. PHP prüft beides vor dem atomaren Schreiben. Neue Revision und verschlüsseltes Backup erzeugen.
5. **Einchecken:** eigenen Checkout explizit beenden. Beim Schließen/Verlassen optional anbieten; Verlassen ist **kein** zuverlässiger Server-Aufruf.
6. **Automatische Freigabe:** Standard zwei Stunden **ohne echte Bearbeitungsaktivität**. Nur aktives Bearbeiten/Speichern oder ausdrücklich bestätigte Verlängerung setzt die Ablaufzeit neu; ein vergessener Browser-Tab darf nicht ewig durch passive Heartbeats blockieren.
7. **Historie:** verschlüsselte Versionen anzeigen, nach Passwortprüfung im Browser öffnen; Wiederherstellung erstellt **eine neue Revision**, statt ältere Versionen zu überschreiben.
8. **Passwort:** bei Erstellung festlegen, beim Öffnen eingeben und bei bestehender Datei im Checkout ändern. Details unter [Sicherheitsentwurf](SECURITY-AND-ENCRYPTION.md).
9. **Benachrichtigung:** nach **erfolgreich gespeichertem** neuem Stand verschlüsselte Version (auch nach Wiederherstellen oder Passwortwechsel) per E-Mail versenden; kein Klartext.

### Sperre und Konflikte

Eine Zwei-Stunden-Sperre ist eine **serverseitig gespeicherte Lease**, kein offenes PHP-`flock()` über zwei Stunden. Zusätzlich wird jede kritische API-Operation **kurz** mit Dateisystem-Lock abgesichert und revisioniert. `save` akzeptiert nur aktiven Lease-Eigentümer und passende Basisrevision.

- Lease abgelaufen: anderer Teilnehmer kann übernehmen; ein alter Client darf **nicht** still überschreiben.
- Kollision: HTTP 409 mit aktueller Revision; eigene ungespeicherte Änderungen lokal erhalten und verschlüsselt exportierbar machen, statt sie zu verwerfen.
- Netzwerkfehler: Dateistand nicht als „gespeichert“ markieren, bevor der Server die neue Revision bestätigt.
- Speicherung: zuerst vollständige temporäre Datei auf demselben Dateisystem schreiben, prüfen, dann unter Lock atomar ersetzen und Versions-/Metadaten konsistent aktualisieren. Keine stillen Teilschreibvorgänge.
- Automatische Sperrfreigabe bedeutet **nicht**, dass ein Client-Entwurf automatisch auf dem Server gespeichert ist.

## Minimale API (Routen sind Entwurf)

| Aktion | Idee |
| --- | --- |
| `GET ?api=files` | Öffentliche Liste der Anzeigenamen und Basis-Metadaten |
| `POST ?api=create` | Datei mit Passwort im Browser erzeugen und verschlüsseltes Paket hochladen |
| `GET ?api=read&id=...` | Aktuelle verschlüsselte Version und Revisionsnummer |
| `POST ?api=checkout` | Autorisierte Lease erwerben |
| `POST ?api=save` | Lease + Revisionsnummer + neues Ciphertext-Paket |
| `POST ?api=checkin` | Lease freigeben |
| `GET ?api=versions&id=...` | Versionsliste; Inhalte nur mit Berechtigung |
| `GET ?api=version&id=...&rev=...` | Alte verschlüsselte Revision |
| `POST ?api=restore` | Alte Version als neue Revision speichern |
| `POST ?api=password` | Passwort-/Schlüsselwechsel und Sicherheitsaktualisierung |

Die Datei-ID (nicht Anzeigename) ist für alle API-Zugriffe maßgeblich. Das API muss Rate-Limits, maximale Dateigröße, Server-Autorisierung und CSRF-/Origin-Schutz implementieren. **Passwörter nicht an PHP übertragen**, wenn das Ziel der Schutz gegen Einsicht in Serverdaten ist; dafür ein im Browser nach erfolgreicher Entschlüsselung erhältliches, separat gesichertes Dateibearbeitungs-Capability einsetzen (siehe Sicherheitsentwurf).

## Gemeinsame Oberfläche

Die bisherigen **Öffnen**- und **Exportieren**-Buttons bleiben bestehen; ein Dateimenü bietet:

- **Lokale Datei:** JSON öffnen/exportieren; verschlüsselte Datei öffnen/exportieren.
- **Online:** Arbeitsordner öffnen, neue Datei anlegen, Datei lesen, zum Bearbeiten auschecken, Speichern, Einchecken.
- **Datei-Status:** Nur lesen / Ausgecheckt von mir / Gesperrt / Ungespeicherte Änderungen / Konflikt.
- **Versionen & Sicherheit:** Versionsliste, Vorversion wiederherstellen, Passwort ändern.

Online-Funktionen nur anzeigen, wenn die Server-API verfügbar ist. Offline-HTML darf **keine** Netzverbindung benötigen. Bei Online-Dateien sollte ein verschlüsselter lokaler Entwurf möglich sein; **niemals entschlüsseltes Projekt-JSON automatisch in `localStorage` ablegen**, solange ein verschlüsseltes Projekt geöffnet ist. Dafür den heutigen `projectStore` von `documentStore` / Speicheradapter trennen.

## E-Mail-Versand

Serverkonfiguration legt eine oder mehrere feste Empfängeradressen und sicheren SMTP-Transport fest. Optional pro Datei eine durch Serverkonfiguration erlaubte Empfängerauswahl (kein beliebiger öffentlicher Mailversand). Nach jeder bestätigten neuen Revision genau **eine Benachrichtigung pro Revision** vormerken und als **verschlüsselten** Anhang mit Datei-ID/Revision versenden.

Ein fehlgeschlagener E-Mail-Versand darf die bereits gespeicherte Revision **nicht** rückgängig machen. Fehlerstatus anzeigen und Versand später erneut versuchen (kleine persistente Warteschlange und begrenzte Wiederholungen; kein externer Job zwingend). Beim Backup bleiben Dateiname und Metadaten im E-Mail-Betreff ggf. sichtbar; keine Passwörter und keine Klartext-Auszüge versenden. SMTP-Konfiguration/Secrets nur auf dem Server.

## Abgrenzung und Risiken

- Für Live-Merge oder paralleles Schreiben werden keine Konfliktalgorithmen benötigt. Es gibt **einen aktiven Bearbeiter pro Datei**.
- Der gemeinsame Server kann die Dateiliste und verschlüsselte Inhalte sehen. HTTPS ist verpflichtend.
- Passwörter dürfen nicht auf dem Server gespeichert oder versendet werden; verschlüsselte Inhalte sind trotzdem durch Offline-Passwortraten angreifbar (starke Passphrasen nötig).
- Öffentliche Dateienliste heißt **sichtbare Metadaten**. Wer Namen nicht öffentlich zeigen will, braucht eine spätere separate Zugriffsschicht.
- Öffentliche Erstellung/Dateilöschung darf kein ungeschützter Spam-/Destruktions-Endpunkt werden: Für eine öffentlich erreichbare Instanz **separates Workspace-Admin-Recht** oder eine gleichwertige starke Absicherung für Anlage/Löschung vorsehen.

## Akzeptanzfälle

- Offline-HTML funktioniert unverändert und unabhängig von PHP.
- Generiertes PHP liefert dieselbe Oberfläche ohne externe Assets, danach zwei Browser können die Liste laden.
- Datei A und B mit unterschiedlichen Passwörtern; falsches Passwort zeigt keinen Inhalt.
- A checkt aus: B bleibt schreibgeschützt; nach zwei Stunden Inaktivität kann B übernehmen.
- A versucht nach Lease-Ablauf/revisionsbedingtem Konflikt zu speichern: **kein Überschreiben**, lokaler Entwurf erhalten.
- Jede bestätigte Änderung erzeugt eine neue abrufbare verschlüsselte Version; Restore erzeugt wiederum neue Revision.
- Passwortwechsel, Zugriff auf alte Versionen, verschlüsselte lokale Export-/Importdatei.
- Jede neue Revision wird für verschlüsselte E-Mail-Sicherung vorgemerkt; Versandfehler ohne Datenverlust behandelbar.
- Pfadüberquerung, API-Fuzzing, gleichzeitige POSTs, korrupte Metadaten und Schreibrechte geprüft.

**Noch nicht implementiert:** Alle oben genannten Server-/Crypto-Funktionen.
