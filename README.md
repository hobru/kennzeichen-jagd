# Kennzeichen-Jagd 🇩🇪

Eine Progressive Web App (PWA) zum Sammeln deutscher Kfz-Unterscheidungszeichen: Kürzel eingeben, Stadt/Kreis nachschlagen, Sichtung mit GPS-Position und Zeitstempel speichern. Mit Liste, Karte, Bundesland-Statistik, Backup-Export/-Import und PIN-Sperre. Alle Daten bleiben lokal im Browser.

## Deployment auf GitHub Pages (5 Minuten)

1. Neues **öffentliches** Repository anlegen, z. B. `kennzeichen-jagd` (unter deinem Account `hobru`).
2. Alle Dateien aus diesem Ordner in das Repository hochladen (Web-Upload reicht: *Add file → Upload files*).
3. Im Repository: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / root → Save**.
4. Nach ~1 Minute ist die App erreichbar unter:
   `https://hobru.github.io/kennzeichen-jagd/`
5. Auf dem Handy im Browser öffnen → **„Zum Startbildschirm hinzufügen"** → die App verhält sich wie eine native App (auch offline nutzbar, außer Kartenkacheln).

> Wichtig: GPS (Geolocation API) funktioniert nur über HTTPS – GitHub Pages liefert das automatisch. Beim ersten Speichern fragt der Browser nach der Standort-Berechtigung.

## Funktionen

- **Erfassen:** Kürzel tippen (auch komplettes Kennzeichen wie `FL-AB 123` – das Kürzel wird automatisch erkannt), Autovervollständigung, Anzeige von Stadt/Kreis, Bundesland und Herleitung des Kürzels.
- **Duplikate:** Bereits gesammelte Kürzel werden erkannt und mit Datum/Ort der Erstsichtung angezeigt.
- **Liste:** Alle Sichtungen als Mini-Kennzeichen, durchsuchbar, einzeln löschbar.
- **Karte:** Alle Sichtungen mit GPS-Position auf einer OpenStreetMap-Karte (Leaflet).
- **Statistik:** Gesamt-Fortschritt und Fortschritt je Bundesland.
- **Datenbank:** ~714 Unterscheidungszeichen sind mitgeliefert (`data.js`). Unter **Mehr → Liste jetzt aktualisieren** wird die aktuelle Liste von [openpotato/kfz-kennzeichen](https://github.com/openpotato/kfz-kennzeichen) geladen und lokal gecacht.
- **Backup:** Export als JSON (vollständig, re-importierbar) oder CSV (für Excel). Import führt Backups zusammen, ohne Duplikate anzulegen.
- **PIN-Sperre:** Beim ersten Start wird eine PIN festgelegt. Hinweis: Das ist ein Sichtschutz, keine echte Verschlüsselung – die Daten liegen ohnehin nur lokal auf deinem Gerät.

## Grenzen & Hinweise

- Daten liegen im `localStorage` des Browsers. **Browserdaten löschen = Sammlung weg.** Deshalb regelmäßig das JSON-Backup exportieren (z. B. in die Cloud-Ablage deiner Wahl).
- Kein Sync zwischen Geräten. Backup exportieren → auf dem anderen Gerät importieren funktioniert aber problemlos.
- Die Kartenansicht braucht Internet (OpenStreetMap-Kacheln werden nicht dauerhaft gecacht).

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | App-Gerüst |
| `style.css` | Design (Kennzeichen-Optik) |
| `app.js` | Logik: Lookup, GPS, Liste, Karte, Statistik, Backup, PIN |
| `data.js` | Mitgelieferter Datenstand der Unterscheidungszeichen |
| `sw.js` | Service Worker (Offline-Fähigkeit) |
| `manifest.webmanifest`, `icon-*.png` | PWA-Installation |

## Datenquelle & Lizenz-Hinweis

Kennzeichenliste: [openpotato/kfz-kennzeichen](https://github.com/openpotato/kfz-kennzeichen) (basierend auf den amtlichen Unterscheidungszeichen). Kartendaten: © OpenStreetMap-Mitwirkende.
