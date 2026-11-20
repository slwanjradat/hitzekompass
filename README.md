# Hitzekompass Hildesheim

## Starten

1. Doppelklick auf `start-local.bat`.
2. Die Karte öffnet sich unter `http://localhost:8000`.
3. Das schwarze Konsolenfenster offen lassen, solange die Karte läuft. Zum Beenden dort `Strg+C` drücken.

Python, eine Internetverbindung und ein Google Maps API-Schlüssel werden benötigt. Baum- und Klimadaten liegen im Projektordner.

## Google Maps einrichten

1. Aktiviere in einem Google-Cloud-Projekt die **Maps JavaScript API** und die **Routes API** und richte die Abrechnung ein.
2. Beschränke den API-Schlüssel auf die Website `http://localhost:8000/*` sowie auf diese beiden APIs.
3. Trage den Schlüssel in `config.js` ein. Diese Datei wird nicht von Git übernommen.
4. Starte `start-local.bat` und öffne `http://localhost:8000`.

Die Karte und die Fußroute kommen von Google Maps. Baum-, Klima-, Schatten- und Trinkwasser-Testdaten bleiben lokal im Projekt. Für Abbiegehinweise öffnet die Schaltfläche die Fußnavigation in Google Maps.

Über **Mein Standort zeigen** fragt der Browser erst nach einem Klick nach der Standortfreigabe. Bei Zustimmung erscheint ein einzelner Positionspunkt; bei Ablehnung kann die Freigabe in den Website-Einstellungen des Browsers geändert werden.

## Wege

Schalte **Bäume** oder **Trinkwasser** ein und tippe den gewünschten Punkt an. Google Maps berechnet einen Fußweg und zeichnet ihn in der Karte ein. **In Google Maps navigieren** öffnet dort die Abbiegehinweise.

## Projektaufbau

- `index.html`, `app.js`, `style.css`: die Website.
- `config.js`: lokaler Google Maps API-Schlüssel; wird nicht versioniert.
- `data/data.js`: lokale Klimadaten und Baumkoordinaten.
- `data/img/`: Hitze-, Nacht- und Schattenraster.
- `data/demo-water.js`: künstliche Trinkwasser-Beispielpunkte.
- `tools/`: optionale Skripte zum Erzeugen der Kartendaten.

## Ebenen

- **Hitze / Klimamodell:** gefühlte Temperatur, aktuelles Szenario, 14 Uhr.
- **Bäume:** 31.394 Punkte aus dem lokalen Baumkataster.
- **Schatten:** Schattenraster für 14 Uhr.
- **Trinkwasser:** 12 künstliche Beispielpunkte rund um Hildesheim. Sie sind Testdaten und markieren keine realen Wasserstellen.
- Sensoren, Gateways, Refill und kühle Orte sind deaktiviert, weil dafür keine Datensätze vorhanden sind.
