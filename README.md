# Kennzeichen-Jagd 🇩🇪

Eine Progressive Web App (PWA) zum Sammeln deutscher Kfz-Unterscheidungszeichen: Kürzel eingeben, Stadt/Kreis nachschlagen, Sichtung mit GPS-Position und Zeitstempel speichern. Mit Liste, Karte, Bundesland-Statistik und Backup-Export/-Import. Alle Daten bleiben lokal im Browser.

## Deployment auf GitHub Pages (5 Minuten)

1. Neues **öffentliches** Repository anlegen, z. B. `kennzeichen-jagd` (unter deinem Account `hobru`).
2. Alle Dateien aus diesem Ordner in das Repository hochladen (Web-Upload reicht: *Add file → Upload files*).
3. Im Repository: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / root → Save**.
4. Nach ~1 Minute ist die App erreichbar unter:
   `https://hobru.github.io/kennzeichen-jagd/`
5. Auf dem Handy im Browser öffnen → **„Zum Startbildschirm hinzufügen"** → die App verhält sich wie eine native App (auch offline nutzbar, außer Kartenkacheln).

> Wichtig: GPS (Geolocation API) funktioniert nur über HTTPS – GitHub Pages liefert das automatisch. Beim ersten Speichern fragt der Browser nach der Standort-Berechtigung.

## Funktionen

- **Scannen:** Kamera-Button neben der Eingabe: Kennzeichen in den Rahmen halten, die Schrift wird direkt auf dem Gerät erkannt (Tesseract.js/OCR) und gegen die Kennzeichenliste geprüft – Fotos verlassen das Handy nie. Erkennung klappt am besten frontal und bei gutem Licht; das Ergebnis füllt nur das Eingabefeld, gespeichert wird erst nach Bestätigung.
- **Erfassen:** Kürzel tippen (auch komplettes Kennzeichen wie `FL-AB 123` – das Kürzel wird automatisch erkannt), Autovervollständigung, Anzeige von Stadt/Kreis, Bundesland und Herleitung des Kürzels.
- **Duplikate:** Bereits gesammelte Kürzel werden erkannt und mit Datum/Ort der Erstsichtung angezeigt.
- **Liste:** Alle Sichtungen als Mini-Kennzeichen, durchsuchbar, einzeln löschbar.
- **Karte:** Alle Sichtungen mit GPS-Position auf einer OpenStreetMap-Karte (Leaflet).
- **Statistik:** Gesamt-Fortschritt und Fortschritt je Bundesland.
- **Datenbank:** ~714 Unterscheidungszeichen sind mitgeliefert (`data.js`). Unter **Mehr → Liste jetzt aktualisieren** wird die aktuelle Liste von [openpotato/kfz-kennzeichen](https://github.com/openpotato/kfz-kennzeichen) geladen und lokal gecacht.
- **Backup:** Export als JSON (vollständig, re-importierbar) oder CSV (für Excel). Import führt Backups zusammen, ohne Duplikate anzulegen.


## Siri-Kurzbefehl (freihändig im Auto)

Die App versteht den Deep Link `?add=KÜRZEL`, z. B. `https://hobru.github.io/kennzeichen-jagd/?add=FL` – das speichert die Sichtung sofort (mit GPS und Zeitstempel) und sagt das Ergebnis per Sprachausgabe an. Damit lässt sich ein Siri-Kurzbefehl bauen:

1. **Kurzbefehle**-App öffnen → **+** → Name z. B. „Kennzeichen".
2. Aktion **„Text diktieren"** hinzufügen (Sprache: Deutsch, „Anhalten nach: Pause").
3. Aktion **„URL"** hinzufügen: `https://hobru.github.io/kennzeichen-jagd/?add=` und dahinter die Variable **Diktierter Text** einfügen.
4. Aktion **„URLs öffnen"** hinzufügen.

Dann im Auto: „Hey Siri, Kennzeichen" → Kürzel sprechen („FL") → die App öffnet sich, speichert und bestätigt per Sprachausgabe. Duplikate werden erkannt und angesagt statt doppelt gespeichert.

**Wichtig (iOS):** Kurzbefehle öffnen URLs in Safari – und Safari und die Homescreen-App haben **getrennte Speicher**. Sichtungen aus dem Kurzbefehl landen also in der Safari-Instanz. Die App zeigt in dem Fall einen Hinweis an; zusammenführen geht jederzeit verlustfrei über Backup-Export (Safari) → Import (Homescreen-App). Wer den Kurzbefehl viel nutzt, fährt am einfachsten, wenn er die App generell in Safari verwendet statt sie zu pinnen.

## Grenzen & Hinweise

- Daten liegen im `localStorage` des Browsers. **Browserdaten löschen = Sammlung weg.** Deshalb regelmäßig das JSON-Backup exportieren (z. B. in die Cloud-Ablage deiner Wahl).
- Kein Sync zwischen Geräten. Backup exportieren → auf dem anderen Gerät importieren funktioniert aber problemlos.
- Die Kartenansicht braucht Internet (OpenStreetMap-Kacheln werden nicht dauerhaft gecacht).

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | App-Gerüst |
| `style.css` | Design (Kennzeichen-Optik) |
| `app.js` | Logik: Lookup, GPS, Liste, Karte, Statistik, Backup |
| `data.js` | Mitgelieferter Datenstand der Unterscheidungszeichen |
| `sw.js` | Service Worker (Offline-Fähigkeit) |
| `version.js` | Versionsnummer – **bei jedem Release hier hochzählen** (aktualisiert Anzeige und Offline-Cache) |
| `manifest.webmanifest`, `icon-*.png` | PWA-Installation |

## Datenquelle & Lizenz-Hinweis

Kennzeichenliste: [openpotato/kfz-kennzeichen](https://github.com/openpotato/kfz-kennzeichen) (basierend auf den amtlichen Unterscheidungszeichen). Kartendaten: © OpenStreetMap-Mitwirkende.
