# Hitzekompass Hildesheim

Die Website besteht aus `index.html`, `app.js` und `style.css`. Sie verwendet Leaflet für die Karte. Baum-, Hitze- und Schattendaten sowie die Icons liegen in den Ordnern `data/` und `icons/`; die OpenStreetMap-Grundkarte benötigt eine Internetverbindung.

Über **Mein Standort** kann die eigene Position auf der Karte angezeigt werden. Der Browser fragt erst nach dem Klick nach Erlaubnis. Die Position wird nicht auf einem Hitzekompass-Server gespeichert. Für die Routenberechnung wird der Standort nach ausdrücklicher Zustimmung an den externen FOSSGIS-Routenserver übermittelt.

## Neue Kartenfunktionen

- **Fußwege:** Die Schaltfläche „Route“ schaltet den Routenmodus ein und aus. Nur im aktiven Modus berechnet ein Klick auf einen Zielpunkt eine Fußroute vom aktuellen Gerätestandort. Die Route bleibt im gemappten Fußwegenetz; von den gelieferten Alternativen wird die kürzeste gewählt. Ein beweglicher Standortpunkt, automatisches Kartenfolgen und die verbleibende Wegstrecke helfen beim Folgen. Enge GPS-Sprünge auf weit entfernte Wege werden begrenzt und auffällige Umwege bei nahen Zielen nicht gezeichnet. Bei weniger als 10 m Abstand und genauer Position meldet die Website, dass das Ziel bereits nah ist, statt einen unnötigen Weg zu berechnen. Beim Ausschalten werden Route und Standortverfolgung beendet. Beim ersten Mal ist die Zustimmung zur Übermittlung der Koordinaten an den FOSSGIS-Routenserver erforderlich. FOSSGIS weist auf die Protokollierung der Routenanfragen hin. Die Route benötigt Internet und Standortfreigabe.
- **Benutzerprofil:** Anzeigename, Alter und gewünschte Arten künftiger Benachrichtigungen können auf diesem Gerät gespeichert werden. Das ist keine echte Anmeldung mit geschütztem Konto: Ohne Backend gibt es keine Kontenverwaltung oder geräteübergreifende Synchronisierung. Die Website verschickt derzeit keine Trink-, Hitze- oder Luftqualitätsbenachrichtigungen.
- **Wasser, Refill und Notfall:** Trinkwasser und Refill zeigen je fünf fiktive Demopunkte. Die Notfallpunkte sind ebenfalls Demos und dürfen nicht als Hilfe im Notfall verwendet werden. Diese Standorte sind nicht verifiziert.
- **Feinstaub:** Für das Projekt ist keine belastbare Messquelle vorhanden. Die Ebene zeigt deshalb keine Werte und meldet den leeren Datenstand.
- **Hinweise nach Ankunft:** Nach Erreichen des Ziels können neben dem Smiley auch Kartenhinweise erfasst werden. Hinweise und Rückmeldungen bleiben lokal und können exportiert werden; sie werden nicht an das Projektteam übertragen.

## Daten und externe Dienste

Die vorhandene lokale Datei `data/data.js` enthält Baumkoordinaten sowie Raster für Hitze und Schatten. In den Projektdateien ist keine vollständige Quellenangabe zu diesen Bestandsdaten dokumentiert; eine Herkunft oder Messgenauigkeit wird daher hier nicht ergänzt. Die Raster werden als vorhandene Projektdateien verwendet. Die Wasser-, Refill- und Notfall-Demopunkte sind synthetisch und stammen nicht aus einem Standortverzeichnis.

Die Grundkarte nutzt OpenStreetMap-Dienste. Routenanfragen gehen an den von FOSSGIS betriebenen Fußroutenserver und übermitteln Start- und Zielkoordinaten. Mehr dazu: [FOSSGIS-Routenserver und Datenschutz](https://routing.openstreetmap.de/about.html), [OSRM-Routen-API](https://project-osrm.org/docs/v26.6.1/http). Die Karte enthält die OpenStreetMap-Mitwirkenden als Quellenhinweis.

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

- `index.html`, `app.js`, `style.css`: Website und Kartenlogik.
- `data/data.js`, `data/img/`: Kartendaten und Rasterbilder.
- `icons/`: SVG-Symbole für die Kartenebenen.
- `www/`: gebaute Website.
