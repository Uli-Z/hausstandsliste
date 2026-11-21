# UX-Überarbeitung – UI V3

## Heuristisches Audit (ohne Nutzertests)
| Bereich | Vorher | Hauptproblem | Entscheidung |
|---|---:|---|---|
| Einstieg | 2/5 | Zahlen, Liste und Zeitverlauf konkurrieren | Fokus auf Aufgaben, knapper Überblick, Onboarding |
| Personen | 3/5 | Tabelle ohne erkennbaren nächsten Schritt | Karten, Suchfeld und klare Profil-Aktion |
| Gegenstände | 3/5 | breite Tabelle / teils versteckte Bedienung | Karten, Suche, Tags, Detailschaltfläche, Archiv |
| Umverteilung | 2/5 | technischer Begriff | Hauptaktion "Anteile übertragen"; bestehender Dialog bleibt |
| Forderungen | 2/5 | Nettosaldo vs. vereinfachte Zahlung unklar | Bereich "Geld & Ausgleich", erklärt beide Sichten |
| Verlauf | 2/5 | Timeline und Bearbeiten vermischt | eigene Seite "Änderungen", voller Timeline-Dialog bleibt |
| Dateien & Online | 1/5 | Backup/Import/Online in einem Technikblock | "Sichern & Teilen" mit Klartext, Verschlüsselung und Teamarbeit als getrennte Aufgaben |
| Archiv & Reset | 2/5 | am Ende des Dashboards, zerstörende Aktionen unklar | Archiv bei Gegenständen, Reset isoliert in Einstellungen |
| Mobil | 2/5 | Tabellenbreite / Scrollseite | Seitenwechsel, responsive Karten und horizontale Navigation |

## Neue Informationsarchitektur
- Überblick = Aktionen, Kennzahlen, zuletzt passiert, Entwürfe und offener Ausgleich.
- Gegenstände = durchsuchbare Karten, Detailseite, Übertragen und Archiv.
- Personen = durchsuchbare Karten und Detailseite inklusive Anteile.
- Geld & Ausgleich = automatisch ermittelte Ansprüche inklusive zugrundeliegender Änderungen und unterschiedlicher Saldierungslogik.
- Änderungen = vollständiger Vorgangsverlauf und Ereignisbearbeitung.
- Sichern & Teilen = normale Klartext-Sicherung, passwortgeschützte lokale Sicherung, gemeinsame PHP-Ablage.
- Einstellungen = Metadaten, JSON und bewusst abgesetztes Zurücksetzen.

## Technische Grenzen und Daten
- UI V3 ist eine separate statische GitHub-Pages-Version unter `/ui-v3/`; Original und UI V2 bleiben erhalten.
- Die Fachberechnung bleibt unverändert in `hausstand-svelte/src/`. Detailansichten, Timeline, Dialoge und Projektstore werden direkt wiederverwendet.
- Getrennte Layouts teilen **die gleiche BrowserlocalStorage-Instanz** auf derselben Origin; keine Sandbox für echte Daten.
- Die Online-Zusammenarbeit setzt weiter einen separat betriebenen HTTPS/PHP-Server voraus; GitHub Pages führt keinen PHP-Backendcode aus.
- Die Klartext-JSON-Sicherung ist nicht verschlüsselt. Geschützte Dateien werden browserseitig verschlüsselt.
- Automatisierte CI- und Buildtests sind kein Ersatz für End-to-End-Browsertests.

## Offene UX-Arbeit
- Geführte, verständliche Umverteilungsdialoge und sauberere Fehlertexte in den komplexen Detailformularen.
- Echte Browser-E2E-Tests inklusive mobiler Bedienung, Screenreader und Tastatursteuerung.
- Gemeinsame Ablage inkl. Locking, Konfliktfällen, Versionen und echter E-Mail-Benachrichtigung gegen realen Server prüfen.

## Zweite UX-Runde
Die V3-Varianten der Personen- und Gegenstandsdetails, Verlaufsdarstellung und Bearbeitungsdialoge nutzen handlungsorientierte Beschriftungen. Der Fachcode einschließlich Store, Ledger und Zeitprojektion bleibt unverändert; Änderungen sind nur auf der Vorschauunterseite.
