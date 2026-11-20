# Hitzekompass Hildesheim

## Starten

1. Doppelklick auf `start-local.bat`.
2. Die Karte öffnet sich unter `http://localhost:8000`.
3. Das schwarze Konsolenfenster offen lassen, solange die Karte läuft. Zum Beenden dort `Strg+C` drücken.

Python und eine Internetverbindung werden benötigt. Die Internetverbindung liefert Leaflet und die OpenStreetMap-Grundkarte. Baum- und Klimadaten liegen im Projektordner.

## Projektaufbau

- `index.html`, `app.js`, `style.css`: die Website. Diese Dateien gehören zusammen.
- `data/data.js`: lokale Klimadaten und Baumkoordinaten.
- `data/img/`: Hitze-, Nacht- und Schattenraster.
- `tools/`: optionale Skripte zum Erzeugen der Kartendaten. Dafür werden zusätzliche Quelldateien benötigt, die nicht Teil dieses Projekts sind.

## Ebenen

- **Hitze / Klimamodell:** gefühlte Temperatur, aktuelles Szenario, 14 Uhr.
- **Bäume:** 31.394 Punkte aus dem lokalen Baumkataster.
- **Schatten:** Schattenraster für 14 Uhr.
- Sensoren, Gateways, Trinkwasser und kühle Orte sind deaktiviert, weil dafür keine lokalen Datensätze vorhanden sind.
