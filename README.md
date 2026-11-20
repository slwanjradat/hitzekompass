# Hitzekompass Hildesheim

Die Website ist mit React, Vite und Leaflet gebaut. Baum-, Hitze- und Schattendaten sowie die Icons liegen lokal im Projekt; die OpenStreetMap-Grundkarte benötigt eine Internetverbindung.

## Website lokal öffnen

```bash
npm install
npm run dev
```

Vite zeigt im Terminal die Adresse der lokalen Website an.

## Website bauen

```bash
npm run build
```

Die statische Website wird nach `www/` gebaut und kann von dort auf einem Webserver bereitgestellt werden.

## Projektstruktur

- `src/`: React-Oberfläche und Einstiegspunkt.
- `index.html`, `style.css`: Vite-Einstieg und Gestaltung.
- `data/data.js`, `data/img/`: Kartendaten und Rasterbilder.
- `icons/`: SVG-Symbole für die Kartenebenen.
- `www/`: gebaute Website.
