import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

const layerOptions = [
  { id: 'heat', title: 'Hitze / Klimamodell', icon: 'Karte' },
  { id: 'trees', title: 'Bäume', icon: 'Baeume' },
  { id: 'shade', title: 'Schatten', icon: 'Schatten' },
  { id: 'water', title: 'Trinkwasser', icon: 'Wasser' },
  { id: 'refill', title: 'Refill', icon: 'Wasser' },
];

export default function App() {
  const mapElement = useRef(null);
  const mapState = useRef(null);
  const [data, setData] = useState(null);
  const [activeLayers, setActiveLayers] = useState({ heat: false, trees: false, shade: false });
  const [status, setStatus] = useState('Kartendaten werden geladen …');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const localData = window.HK_DATA;
    if (localData?.meta?.bounds) {
      setData(localData);
    } else {
      setLoadError(true);
      setStatus('Die lokalen Kartendaten fehlen oder sind fehlerhaft.');
    }
  }, []);

  useEffect(() => {
    if (!data || !mapElement.current) return undefined;

    const { bounds } = data.meta;
    const rows = Array.isArray(data.trees) ? data.trees : [];
    const map = L.map(mapElement.current, {
      zoomControl: false,
      preferCanvas: true,
      minZoom: 11,
      maxZoom: 19,
    });
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    map.setMaxBounds([
      [bounds[0][0] - 0.12, bounds[0][1] - 0.18],
      [bounds[1][0] + 0.12, bounds[1][1] + 0.18],
    ]);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const base = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      attribution: '&copy; OpenStreetMap-Mitwirkende',
    }).addTo(map);
    base.on('tileerror', () => {
      setStatus('Einige Grundkarten-Kacheln fehlen. Bitte Internetverbindung prüfen.');
    });

    const heatPane = map.createPane('heat');
    heatPane.style.zIndex = 350;
    heatPane.style.pointerEvents = 'none';
    const shadePane = map.createPane('shade');
    shadePane.style.zIndex = 360;
    shadePane.style.pointerEvents = 'none';
    const treePane = map.createPane('tree-points');
    treePane.style.zIndex = 400;
    treePane.style.pointerEvents = 'none';

    const heat = L.imageOverlay('./data/img/pet_ist.png', bounds, {
      pane: 'heat', opacity: 0.72, interactive: false,
    });
    const shade = L.imageOverlay('./data/img/shade_14.png', bounds, {
      pane: 'shade', opacity: 0.62, interactive: false,
    });
    heat.on('error', () => setStatus('Das Klimaraster konnte nicht geladen werden.'));
    shade.on('error', () => setStatus('Das Schattenraster konnte nicht geladen werden.'));

    const TreeTiles = L.GridLayer.extend({
      createTile(coords) {
        const canvas = document.createElement('canvas');
        const size = this.getTileSize();
        canvas.width = size.x;
        canvas.height = size.y;
        const ctx = canvas.getContext('2d');
        const scale = 2 ** coords.z;
        const left = coords.x / scale;
        const top = coords.y / scale;
        const right = (coords.x + 1) / scale;
        const bottom = (coords.y + 1) / scale;
        const pad = 7 / (256 * scale);
        const radius = coords.z >= 17 ? 3.2 : coords.z >= 15 ? 2.6 : 2.1;
        ctx.fillStyle = 'rgba(36, 132, 66, .92)';
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = coords.z >= 16 ? 0.8 : 0;

        for (const row of rows) {
          if (!Array.isArray(row) || !Number.isFinite(+row[0]) || !Number.isFinite(+row[1])) continue;
          const lat = +row[0] * Math.PI / 180;
          const x = (+row[1] + 180) / 360;
          const y = (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2;
          if (x < left - pad || x > right + pad || y < top - pad || y > bottom + pad) continue;
          ctx.beginPath();
          ctx.arc((x - left) * scale * 256, (y - top) * scale * 256, radius, 0, Math.PI * 2);
          ctx.fill();
          if (ctx.lineWidth) ctx.stroke();
        }
        return canvas;
      },
    });
    const trees = new TreeTiles({ pane: 'tree-points', minZoom: 11, maxZoom: 19, tileSize: 256 });
    mapState.current = { map, layers: { heat, trees, shade } };

    map.on('click', (event) => {
      const { lat, lng } = event.latlng;
      if (lat < bounds[0][0] || lat > bounds[1][0] || lng < bounds[0][1] || lng > bounds[1][1]) return;
      L.popup({ maxWidth: 260 })
        .setLatLng(event.latlng)
        .setContent(`<strong>${lat.toFixed(5)}, ${lng.toFixed(5)}</strong><br><span>Hildesheim</span>`)
        .openOn(map);
    });

    setStatus(`Bereit · ${rows.length.toLocaleString('de-DE')} Bäume · Klimaraster und Schatten verfügbar`);
    return () => {
      map.remove();
      mapState.current = null;
    };
  }, [data]);

  useEffect(() => {
    const current = mapState.current;
    if (!current) return;
    for (const [kind, layer] of Object.entries(current.layers)) {
      if (activeLayers[kind] && !current.map.hasLayer(layer)) layer.addTo(current.map);
      if (!activeLayers[kind] && current.map.hasLayer(layer)) current.map.removeLayer(layer);
    }
  }, [activeLayers, data]);

  const available = {
    heat: Boolean(data?.meta?.bounds),
    trees: Array.isArray(data?.trees) && data.trees.length > 0,
    shade: Boolean(data?.meta?.bounds),
    water: false,
    refill: false,
  };

  return (
    <main id="app">
      <div id="map" ref={mapElement} role="application" aria-label="Karte von Hildesheim" />
      <header className="map-panel">
        <h1>Hitzekompass <span>Hildesheim</span></h1>
        <details className="filters" open>
          <summary>Kartenebenen</summary>
          <div className="filter-list" role="group" aria-label="Datenebenen">
            {layerOptions.map((layer) => {
              const isAvailable = available[layer.id];
              return (
                <label className={isAvailable ? '' : 'unavailable'} key={layer.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(activeLayers[layer.id])}
                    disabled={!isAvailable || loadError}
                    onChange={(event) => setActiveLayers((current) => ({
                      ...current,
                      [layer.id]: event.target.checked,
                    }))}
                  />
                  <img
                    className="layer-icon"
                    src={`${import.meta.env.BASE_URL}icons/${layer.icon}${activeLayers[layer.id] ? '' : '_inaktiv'}.svg`}
                    alt=""
                    aria-hidden="true"
                  />
                  {layer.title}
                  {!isAvailable && <small>keine Daten</small>}
                </label>
              );
            })}
          </div>
        </details>
        <p id="data-status" role="status" aria-live="polite">{status}</p>
      </header>
    </main>
  );
}
