# Sicherheitsentwurf: verschlüsselte Projektdateien

**Status:** Architekturvorschlag, **keine implementierte/überprüfte Verschlüsselung** (20.11.2026). Diese Datei ist eine Spezifikation, kein Sicherheitsversprechen.

## Sicherheitsziel

- Der Server speichert und verschickt **nur Ciphertext** der Hausstandsdaten.
- Entschlüsselung und Verschlüsselung passieren im **Browser** nach Eingabe einer pro Datei gewählten Passphrase. Lokaler verschlüsselter Export nutzt **exakt das gleiche Format**.
- Projekt-JSON im Klartext darf auf Wunsch weiterhin bewusst exportiert werden; die App muss das erkennbar anzeigen.
- Dateinamen, Datei-IDs, Größen, Änderungstermine, Sperrstatus und Versionen können als **absichtlich öffentliche Metadaten** sichtbar sein.

## Bedrohungsmodell und Grenze

Clientseitige Verschlüsselung schützt gegen den Einblick in gespeicherte Serverdateien, Backups oder E-Mail-Anhänge **ohne Passwort**. Sie schützt **nicht** zuverlässig gegen einen kompromittierten PHP-Webserver, der manipuliertes JavaScript ausliefert, gegen Browser-Malware, XSS oder ein schwaches erratbares Passwort. Die aufgerufene Web-App stammt vom Server; der Server könnte bei einer künftigen Sitzung den Passphrase-Eingabecode austauschen. Eine selbstständig lokal geprüfte/verteilte HTML-Datei reduziert diese spezielle Vertrauensabhängigkeit, eliminiert aber nicht Geräteschwachstellen.

**HTTPS** für Online-Betrieb erforderlich; `file://`-Betrieb für lokale WebCrypto-Unterstützung browserübergreifend testen. Nicht bloß von „AES“ auf Ende-zu-Ende-Sicherheit schließen.

## Kryptografie (provisorische Designentscheidung)

1. Versioniertes verschlüsseltes Containerformat, z. B. `.hausstand.enc`, mit `format`, `version`, `kdf`, KDF-Parametern, zufälligem Salt, pro Verschlüsselung eindeutigem Nonce, `ciphertext` und Authentifizierungstag.
2. **Authentifizierte Verschlüsselung:** AES-256-GCM über die Browser-Web-Crypto-API (oder eine etablierte, gut geprüfte Bibliothek). Header/Datei-ID/Formatversion soweit sinnvoll kryptographisch als Additional Authenticated Data binden.
3. **KDF:** Bevorzugt Argon2id mit expliziten, getesteten Speicher-/Zeitparametern, **wenn** als gepflegter, vollständig inline-bündelbarer WASM-/JS-Baustein für Offline-HTML praktikabel. Andernfalls als dokumentierter Kompromiss PBKDF2-HMAC-SHA-256 mit ausreichend hohen, auf Zielgeräten gemessenen Parametern über WebCrypto; Parameter **mit jeder Datei speichern**. Niemals Passwort direkt als AES-Schlüssel verwenden.
4. Alle Salts, Nonces und Capability-Secrets aus `crypto.getRandomValues()`; jede AES-GCM-Verschlüsselung braucht einen **neuen Nonce** für denselben Schlüssel.
5. Crypto-Code zentral in `src/lib/crypto.js`: `encryptProject`, `decryptProject`, `changePassword`, Formatvalidierung, Fehlermeldung bei falschem Passwort/Manipulation, Tests mit gespeicherten Testvektoren.
6. Key-Derivation mit expliziter Domänentrennung: Verschlüsselungsschlüssel und Authentisierungsmaterial niemals ungeprüft identisch wiederverwenden.

**Passwortqualität:** Lange, zufällige Passphrase empfehlen; bei öffentlichem Ciphertext sind Passwortversuche offline möglich, Server-Ratelimit hilft dagegen nicht. Sicheres Passwort-Backup/Wiederherstellungsstrategie erklären: **Vergessenes Passwort bedeutet ohne eigene Klartext-/Schlüsselkopie Datenverlust.**

## Server-Autorisierung ohne Kenntnis des Passworts

**Nicht** auf Basis einer öffentlichen Dateiliste Schreiboperationen erlauben. Als einfache Variante:

- Bei Dateianlage im Browser eine zufällige **256-Bit-Bearbeitungs-Capability** erzeugen. Der Server speichert nur ihren Hash zur Autorisierung; die Capability liegt **innerhalb** des verschlüsselten Datei-Containers und kann nur nach erfolgreicher Entschlüsselung gelesen werden.
- Nach Entschlüsselung kann der Browser die Capability für Checkout/Checkin/Speichern über **HTTPS** verwenden; keine Passphrase an PHP. Sessions/kurzlebige Tokens statt ständiger Übertragung prüfen; Autorisierung vor jedem schreibenden API-Aufruf.
- Datei-Anlage/Löschung eines **öffentlich** gelisteten Arbeitsordners zusätzlich gegen Spam/Denial-of-Service schützen (z. B. separates Workspace-Admin-Recht). Ein Lesezugriff auf Ciphertext ist nicht automatisch ein Schreibrecht.
- Server-Dateikonfiguration und Versionen niemals über erratbare Pfade direkt aus dem Webroot anbieten; Versionsabruf erfordert Prüfung der Datei-Berechtigung.
- Als sicherheitsrelevantes Design vor Implementierung ein kurzes Bedrohungsmodell und Integrations-/Penetrationstests durchführen. Capability ist **kein** vollständiges Identitäts- oder Rechtemanagement; alle mit derselben Passphrase können gleichberechtigt editieren.

### Passwortwechsel

Der Passwortwechsel muss im Browser mit **altem** Passwort/Schlüssel autorisiert und die aktuelle Version unter neuem Passwort neu verschlüsselt werden, **zusammen mit einer Rotation der Bearbeitungs-Capability**. Die Behandlung historischer Versionen ist ausdrücklich Teil der Operation:

- Bevorzugtes Verhalten: Alle serverseitig behaltenen alten Versionen unter dem neuen Passwort/Schlüssel **neu verschlüsseln** und unter derselben exklusiven Lease atomar ersetzen, sodass die neue Passphrase die Versionshistorie öffnen kann und die alte nicht mehr zum Online-Öffnen genügt.
- Alte **bereits heruntergeladene oder per E-Mail verschickte** verschlüsselte Kopien lassen sich **nicht rückwirkend unlesbar machen**. Altes Passwort + alte Kopie können frühere Inhalte weiter öffnen.
- Bei Key-Rotation alle Nonces erneut erzeugen; konsistente Umstellung oder vollständiger Abbruch, kein gemischter halbfertiger Zustand.
- Der Server darf die Bearbeitungs-Capability nicht im Klartext in Metadaten ausgeben. Hashvergleich zeitkonstant; Log-/Error-Ausgaben ohne Token.
- Möglichkeit bedenken, dass ein fremder Nutzer mit altem Passwort bereits eine geöffnete Sitzung besitzt: bei Rotation alle Server-Leases/Session-Rechte widerrufen.

## Browser-Speicher und Benutzerführung

Heute enthält der `localStorage` die **Klartext-Arbeitskopie** (`hausstand_svelte_v07_working_copy`). Dieser Zustand darf in einem Verschlüsselungsmodus **nicht** unbeachtet fortbestehen. Geplante Änderung:

- Bei verschlüsseltem Projekt kein unverschlüsseltes `project` in `localStorage` schreiben; Schlüssel nur im Speicher der geöffneten Sitzung halten.
- Optional lokalen, **ebenfalls verschlüsselten** Recovery-Entwurf anbieten. Hinweis bei ungespeicherten Änderungen und bei Lease-Verlust; niemals heimlich als Klartext sichern.
- Beim Wechsel zwischen Projekten Schlüsselmaterial aus dem App-Zustand verwerfen; Browser-Cache/Downloads/Exportdateien bleiben separate Nutzerverantwortung.
- Beim lokalen Export explizite Wahl: `JSON (unverschlüsselt)` oder `Verschlüsselte Datei`. Beim Import Format automatisch erkennen und ggf. Passphrase anfordern.
- Keine externen Analytics-/Skriptdienste, CSP/Same-Origin/CSRF-Schutz und XSS-Prüfung. Nutzertexte in UI und in Dateinamen maskieren.

## Server- und E-Mail-Betrieb

- Datenverzeichnis außerhalb Webroot; PHP-Dateien und Konfiguration ohne Schreibzugriff durch fremde Benutzer.
- Kurze `flock()`-Locks für Metadaten-/Versionsoperationen (keine stundenlangen OS-Locks), temporäre Datei + möglichst atomare Umbenennung innerhalb desselben Dateisystems, Revisionsvergleich zur Konfliktvermeidung.
- API-Request-Limits, sinnvolle Maximalgrößen, Serverlimits, Fehlerprotokoll ohne vertrauliche Daten, konfigurierte SMTP-Zugangsdaten ausschließlich serverseitig.
- E-Mail-Versand ausschließlich **verschlüsselter** Anhang; Betreff darf keine vertraulichen Details enthalten. SMTP über TLS. Versandfehler ohne Datenverlust protokollieren und erneut versuchen.

## Quellen und technische Referenzen

- [MDN: Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [MDN: sichere Kontexte](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)
- [OWASP: Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP: Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP: Web Frontend Security](https://cheatsheetseries.owasp.org/cheatsheets/Web_Frontend_Security_Cheat_Sheet.html)
- [PHP Manual: flock](https://www.php.net/manual/en/function.flock.php)
- [PHP Manual: rename](https://www.php.net/manual/en/function.rename.php)

**Nicht als implementiert ausgeben.** Vor produktivem Betrieb unabhängige Sicherheitsdurchsicht erforderlich.
