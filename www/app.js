(() => {
  'use strict';

  const status = document.getElementById('data-status');
  const controls = [...document.querySelectorAll('[data-layer]')];
  const data = window.HK_DATA;
  const bounds = data?.meta?.bounds;

  if (!window.L) {
    status.textContent = 'Leaflet konnte nicht geladen werden. Bitte Internetverbindung prüfen und neu laden.';
    return;
  }
  if (!data || !bounds) {
    status.textContent = 'Die lokalen Kartendaten fehlen oder sind fehlerhaft.';
    controls.forEach(control => { control.disabled = true; });
    return;
  }

  const map = L.map('map', { zoomControl: false, preferCanvas: true, minZoom: 11, maxZoom: 19 });
  map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  map.setMaxBounds([[bounds[0][0] - 0.12, bounds[0][1] - 0.18], [bounds[1][0] + 0.12, bounds[1][1] + 0.18]]);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const base = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
    attribution: '&copy; OpenStreetMap-Mitwirkende'
  }).addTo(map);
  let tileErrors = 0;
  base.on('tileerror', () => {
    tileErrors++;
    status.textContent = 'Einige Grundkarten-Kacheln fehlen. Bitte Internetverbindung prüfen und die Seite neu laden.';
  });

  const heatPane = map.createPane('heat');
  heatPane.style.zIndex = 350;
  heatPane.style.pointerEvents = 'none';
  const shadePane = map.createPane('shade');
  shadePane.style.zIndex = 360;
  shadePane.style.pointerEvents = 'none';
  const heat = L.imageOverlay('data/img/pet_ist.png', bounds, { pane: 'heat', opacity: 0.72, interactive: false });
  const shade = L.imageOverlay('data/img/shade_14.png', bounds, { pane: 'shade', opacity: 0.62, interactive: false });
  heat.on('error', () => { status.textContent = 'Das Klimaraster konnte nicht geladen werden. Bitte data/img/pet_ist.png prüfen.'; });
  shade.on('error', () => { status.textContent = 'Das Schattenraster konnte nicht geladen werden. Bitte data/img/shade_14.png prüfen.'; });

  const species = Array.isArray(data.species) ? data.species : [];
  const rows = Array.isArray(data.trees) ? data.trees : [];
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
    }
  });
  const trees = new TreeTiles({ pane: 'tree-points', minZoom: 11, maxZoom: 19, tileSize: 256 });
  const treePane = map.createPane('tree-points');
  treePane.style.zIndex = 400;
  treePane.style.pointerEvents = 'none';

  const has = { heat: true, trees: rows.length > 0, shade: true, sensors: false, gateways: false, water: false, cool: false, refill: false };
  for (const control of controls) {
    const kind = control.dataset.layer;
    if (!has[kind]) {
      control.disabled = true;
      const row = control.closest('label');
      if (row) {
        row.classList.add('unavailable');
        row.title = 'Für diese Ebene sind in den lokalen Daten keine Datensätze vorhanden.';
      }
    }
  }

  function setLayer(kind, enabled) {
    const layer = kind === 'heat' ? heat : kind === 'trees' ? trees : kind === 'shade' ? shade : null;
    if (!layer) return;
    if (enabled && !map.hasLayer(layer)) layer.addTo(map);
    if (!enabled && map.hasLayer(layer)) map.removeLayer(layer);
  }
  controls.forEach(control => {
    control.addEventListener('change', () => setLayer(control.dataset.layer, control.checked));
  });

  map.on('click', event => {
    const ll = event.latlng;
    if (ll.lat < bounds[0][0] || ll.lat > bounds[1][0] || ll.lng < bounds[0][1] || ll.lng > bounds[1][1]) return;
    L.popup({ maxWidth: 260 }).setLatLng(ll).setContent(
      `<strong>${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}</strong><br><span>Hildesheim</span>`
    ).openOn(map);
  });

  const count = rows.length.toLocaleString('de-DE');
  status.textContent = `Bereit · ${count} Bäume · Klimaraster und Schatten verfügbar`;
  window.HK = { map, layers: { heat, trees, shade }, data };
})();
