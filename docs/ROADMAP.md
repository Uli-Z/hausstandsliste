# Projektstand, nächste Schritte und offene Entscheidungen

**Stand der Codeprüfung: 20.11.2026.** Hauptbranch `master`, Svelte-App `0.7.0`. Aussagen zu „vorhanden“ beruhen auf Quellcodesichtung, nicht auf einem in dieser Sitzung durchgeführten Browsertest.

## Bereits im Code vorhanden

- Personen hinzufügen, deaktivieren, reaktivieren und Stammdaten bearbeiten
- Gegenstände mit Tags, Wert und Anteilen anlegen, beenden, archivieren und als Nachfolgegegenstand fortführen
- Stichtagsbezogene Ereignis-Timeline mit Bearbeitungsmöglichkeiten
- Lineares, degressives und fixes Wertmodell
- Relative Anteilsverteilung je Gegenstand; Sammel-Umverteilungen
- Entwürfe für Gegenstände und Umverteilungen in `drafts[]`
- Wertdifferenzen, **empfohlene** Ausgleichszahlungen und Markdown-Export der Empfehlung
- Projekt-JSON-Import/-Export und `localStorage`-Arbeitskopie
- Build-Skripte für Vite und Standalone-HTML

**Nicht vorhanden:** Erfassung realer Zahlungen, Offen-/Beglichen-Status, Teilzahlungen, Fälligkeitslisten, CI-Tests und automatisch veröffentlichte Web-App.

## Nächste Produktaufgabe: Schuldenbegleichung

Ziel: Aus einer **ausgeführten** Umverteilung abgeleitete einzelne Ausgleichszahlungen sollen nachvollziehbar als **offen** oder **beglichen** markiert und dauerhaft im Projekt-JSON gespeichert werden. Eine Eigentumsänderung darf unabhängig davon bestehen bleiben, ob das Geld geflossen ist.

Vorgeschlagenes erstes Verhalten (noch nicht implementiert):

1. Bei ausgeführten Umverteilungen Zahlungsvorschläge mit Schuldner, Gläubiger, Betrag und Status anzeigen.
2. Jede Forderung separat „offen/beglichen“ schalten; optional Datum und Notiz zur Zahlung erfassen.
3. Offene Beträge pro Person nachvollziehbar anzeigen.
4. JSON-Export/-Import muss alle Zahlungsinformationen verlustfrei erhalten.
5. Bei nachträglich bearbeiteten Umverteilungen bestehende Zahlungsvermerke nicht versehentlich löschen oder unbemerkt falschen Forderungen zuordnen.

**Vor der Implementierung klären:**
- Start nur mit vollständig „beglichen/offen“ oder auch Teilzahlungen?
- Sollen Zahlungsvorgänge als separate datierte Events oder als eigene Projektentitäten gespeichert werden?
- Wie wird eine Zahlung eindeutig mit einer Forderung verknüpft, wenn `settlementRecommendations()` Vorschläge jedes Mal neu berechnet und keine stabilen Zahlungs-IDs erzeugt?
- Was passiert bei rückwirkender Änderung/Löschung einer Umverteilung oder bei Stichtagen vor Zahlungseingang?

Keine vermeintliche Umsetzung allein durch einen Checkbox-Zustand in der UI: maßgeblich sind **Persistenz und konsistente Historie**.

## Technische Stabilisierung (priorisieren, bevor echte Daten produktiv genutzt werden)

- [ ] `npm ci`, `check:js`, `build:single` tatsächlich ausführen und Ergebnis dokumentieren
- [ ] Standalone per `file://` offline prüfen, einschließlich JSON-Import/-Export
- [ ] Automatisierte Tests der Projektion, Bewertungsmodelle und Umverteilung ergänzen
- [ ] CI für Build und Tests einrichten
- [ ] JSON-Eingabevalidierung, fehlerhafte Browser-Arbeitskopien und Sicherungshinweise prüfen
- [ ] Alte Projektdateien und die Feature-Parität zur `vorlage.html` stichprobenartig testen
- [ ] Datenbezug beim vollständigen Löschen von Personen inklusive gespeicherter Umverteilungsentwürfe prüfen

## Bereitstellung (separater Schritt)

- [ ] Entscheiden, ob die Svelte-App über GitHub Pages öffentlich erreichbar sein soll
- [ ] Falls ja: reproduzierbaren Build und Deployment-Workflow ergänzen; korrekte Basis-URLs/Assets prüfen
- [ ] Sicherstellen, dass die Webseite **keine persönlichen Projekt-JSON-Dateien** ausliefert und die App ohne externen Dienst nutzbar bleibt

## Bewusste Abgrenzung

Nicht ohne ausdrückliche Produktentscheidung in Richtung Server-Datenbank, Account-System, Live-Synchronisierung oder vollwertige Finanzbuchhaltung ausbauen. Die Stärke des Projekts ist seine einfache, portable Offline-Nutzung.

## Pflege dieser Datei

Nach jeder Entwicklungssitzung den tatsächlichen Stand (implementiert / verifiziert / offen) nachführen. Neue Änderungswünsche zunächst hier und, bei Datenmodellfragen, in [ARCHITECTURE.md](ARCHITECTURE.md) festhalten.
