(() => {
  'use strict';

  const status = document.getElementById('data-status');
  const controls = [...document.querySelectorAll('[data-layer]')];
  const data = window.HK_DATA;
  const bounds = data?.meta?.bounds;
  const rows = Array.isArray(data?.trees) ? data.trees : [];
  const waterPoints = Array.isArray(window.HK_DEMO_WATER) ? window.HK_DEMO_WATER : [];
  const locateButton = document.getElementById('btn-locate');
  const routePanel = document.getElementById('route-panel');
  const routeTitle = document.getElementById('route-title');
  const routeSummary = document.getElementById('route-summary');
  const routeGuidance = document.getElementById('route-guidance');
  const routeStartButton = document.getElementById('route-start');
  const routeCloseButton = document.getElementById('route-close');
  let map;
  let googleMaps;
  let Route;
  let treeOverlay;
  let heatOverlay;
  let shadeOverlay;
  let infoWindow;
  let locationMarker;
  let destinationMarker;
  let currentPosition = null;
  let currentPositionAt = 0;
  let routePolylines = [];
  let activeDestination = null;
  let geolocationPermission = 'unknown';
  let googleAuthFailed = false;

  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(permission => {
      geolocationPermission = permission.state;
      permission.addEventListener?.('change', () => { geolocationPermission = permission.state; });
    }).catch(() => {});
  }

  function loadGoogleMaps(key) {
    return new Promise((resolve, reject) => {
      const callbackName = '__hkGoogleMapsReady';
      window[callbackName] = () => { delete window[callbackName]; resolve(); };
      window.gm_authFailure = () => {
        googleAuthFailed = true;
        status.textContent = 'Google Maps hat den API-Schlüssel abgelehnt. Prüfe Schlüssel, Abrechnung und Website-Einschränkung.';
      };
      const script = document.createElement('script');
      const params = new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: callbackName, language: 'de', region: 'DE' });
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      script.onerror = () => reject(new Error('google-maps-load-failed'));
      document.head.appendChild(script);
    });
  }

  function boundsObject() {
    return { south: bounds[0][0], west: bounds[0][1], north: bounds[1][0], east: bounds[1][1] };
  }

  function showUserPosition(coords, follow = false) {
    currentPosition = { lat: coords.latitude, lng: coords.longitude };
    currentPositionAt = Date.now();
    const position = currentPosition;
    if (!locationMarker) {
      locationMarker = new googleMaps.Marker({
        map,
        position,
        title: 'Dein Standort',
        clickable: false,
        zIndex: 1200,
        icon: { path: googleMaps.SymbolPath.CIRCLE, scale: 7, fillColor: '#155eef', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }
      });
    } else locationMarker.setPosition(position);
    if (follow) map.panTo(position);
    return position;
  }

  function locationError(error) {
    if (error?.code === 1 && geolocationPermission === 'granted') return 'Der Browser meldet die Freigabe als erlaubt, liefert aber keine Position. Prüfe die Windows-Ortungsdienste und öffne die Karte unter http://localhost:8000.';
    if (error?.code === 1) return 'Der Browser oder das Gerät hat keinen Standort geliefert. Prüfe die Freigabe für diese lokale Website und die Standortdienste des Geräts.';
    if (error?.code === 2) return 'Dein Standort ist gerade nicht verfügbar. Bitte prüfe die Standortdienste deines Geräts.';
    if (error?.code === 3) return 'Die Standortabfrage hat zu lange gedauert. Bitte versuche es erneut.';
    return 'Der Standort konnte nicht ermittelt werden.';
  }

  function setLayer(kind, enabled) {
    const overlay = kind === 'heat' ? heatOverlay : kind === 'shade' ? shadeOverlay : kind === 'trees' ? treeOverlay : null;
    if (overlay) overlay.setMap(enabled ? map : null);
    if (kind === 'water') waterPoints.forEach(point => point.__marker?.setMap(enabled ? map : null));
  }

  function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
    return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
  }
  function formatDuration(milliseconds) {
    const minutes = Math.max(1, Math.round(milliseconds / 60000));
    return `${minutes} Min.`;
  }

  function clearRoute() {
    routePolylines.forEach(line => line.setMap(null));
    routePolylines = [];
    if (destinationMarker) destinationMarker.setMap(null);
    destinationMarker = null;
    activeDestination = null;
    routePanel.hidden = true;
  }

  function googleMapsDirectionsUrl(origin, destination) {
    const params = new URLSearchParams({
      api: '1',
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      travelmode: 'walking'
    });
    return `https://www.google.com/maps/dir/?${params}`;
  }

  async function routeTo(destination) {
    activeDestination = { lat: destination.lat, lng: destination.lng, label: destination.label };
    routePanel.hidden = false;
    routeTitle.textContent = `Fußweg zu: ${destination.label}`;
    routeSummary.textContent = 'Standort und Fußweg werden ermittelt …';
    routeGuidance.textContent = 'Bitte erlaube den Standortzugriff, damit Google Maps den Fußweg berechnen kann.';
    routeStartButton.disabled = true;
    routePolylines.forEach(line => line.setMap(null));
    routePolylines = [];
    if (destinationMarker) destinationMarker.setMap(null);
    destinationMarker = null;

    try {
      if (!navigator.geolocation) throw new Error('geolocation-unavailable');
      if (!currentPosition || Date.now() - currentPositionAt > 120000) {
        try {
          const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }));
          showUserPosition(position.coords);
        } catch (error) {
          if (!currentPosition) throw error;
          routeGuidance.textContent = 'Die aktuelle Abfrage ist fehlgeschlagen. Ich verwende den zuletzt angezeigten Standort.';
        }
      }
      const { routes } = await Route.computeRoutes({
        origin: currentPosition,
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: 'WALKING',
        fields: ['path', 'distanceMeters', 'durationMillis']
      });
      const route = routes?.[0];
      if (!route?.path?.length) throw new Error('no-route');
      const outline = new googleMaps.Polyline({ map, path: route.path, strokeColor: '#ffffff', strokeOpacity: .95, strokeWeight: 10, clickable: false, zIndex: 10 });
      const line = new googleMaps.Polyline({ map, path: route.path, strokeColor: '#1677ff', strokeOpacity: .97, strokeWeight: 6, clickable: false, zIndex: 11 });
      routePolylines = [outline, line];
      destinationMarker = new googleMaps.Marker({
        map, position: { lat: destination.lat, lng: destination.lng }, title: destination.label, zIndex: 1100,
        icon: { path: googleMaps.SymbolPath.CIRCLE, scale: 8, fillColor: '#e24b3c', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 }
      });
      routeSummary.textContent = `${formatDistance(route.distanceMeters || 0)} · etwa ${formatDuration(route.durationMillis || 0)} zu Fuß`;
      routeGuidance.textContent = 'Der Fußweg ist auf der Karte eingezeichnet. Für Abbiegehinweise öffnet sich die Navigation in Google Maps.';
      routeStartButton.disabled = false;
      const routeBounds = new google.maps.LatLngBounds();
      route.path.forEach(point => routeBounds.extend(point));
      map.fitBounds(routeBounds, { left: Math.min(document.querySelector('.map-panel').offsetWidth + 24, window.innerWidth - 24), top: 36, right: 24, bottom: Math.min(routePanel.offsetHeight + 24, window.innerHeight * .55) });
      status.textContent = 'Google-Fußweg berechnet. Für Navigation mit Abbiegehinweisen auf „In Google Maps navigieren“ tippen.';
    } catch (error) {
      routeSummary.textContent = 'Fußweg konnte nicht berechnet werden';
      if (error.code !== undefined) routeGuidance.textContent = locationError(error);
      else if (error.message === 'no-route') routeGuidance.textContent = 'Google Maps hat für dieses Ziel keinen Fußweg gefunden.';
      else routeGuidance.textContent = 'Google Maps konnte den Fußweg gerade nicht berechnen. Prüfe API-Schlüssel, Abrechnung und aktivierte Routes API.';
      routeStartButton.disabled = true;
      status.textContent = routeGuidance.textContent;
    }
  }

  async function initialize() {
    if (!data || !bounds) { status.textContent = 'Die lokalen Kartendaten fehlen oder sind fehlerhaft.'; return; }
    const key = window.GOOGLE_MAPS_API_KEY?.trim();
    if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY') {
      status.textContent = 'Google-Maps-API-Schlüssel fehlt. Trage ihn in config.js ein und lade die Seite neu.';
      return;
    }
    try {
      await loadGoogleMaps(key);
      if (googleAuthFailed) throw new Error('google-maps-auth-failed');
      const [mapsLibrary, coreLibrary, routesLibrary] = await Promise.all([
        google.maps.importLibrary('maps'), google.maps.importLibrary('core'), google.maps.importLibrary('routes')
      ]);
      googleMaps = { ...mapsLibrary, ...coreLibrary };
      Route = routesLibrary.Route;
      class TreeOverlay extends googleMaps.OverlayView {
        constructor(points) {
          super();
          this.points = points.filter(row => Array.isArray(row) && Number.isFinite(+row[0]) && Number.isFinite(+row[1]))
            .map(row => ({ lat: +row[0], lng: +row[1], latLng: new googleMaps.LatLng(+row[0], +row[1]) }));
          this.canvas = null;
        }
        onAdd() {
          this.canvas = document.createElement('canvas');
          this.canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
          this.getPanes().overlayLayer.appendChild(this.canvas);
        }
        draw() {
          if (!this.canvas || !this.getMap()) return;
          const div = map.getDiv(), ratio = window.devicePixelRatio || 1;
          const width = div.clientWidth, height = div.clientHeight;
          if (!width || !height) return;
          if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
            this.canvas.width = Math.round(width * ratio);
            this.canvas.height = Math.round(height * ratio);
          }
          const ctx = this.canvas.getContext('2d');
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          ctx.clearRect(0, 0, width, height);
          ctx.fillStyle = 'rgba(36,132,66,.92)';
          ctx.strokeStyle = 'rgba(255,255,255,.9)';
          const zoom = map.getZoom() || 14, radius = zoom >= 17 ? 3.2 : zoom >= 15 ? 2.6 : 2.1;
          const projection = this.getProjection(), visible = map.getBounds();
          for (const row of this.points) {
            if (visible && !visible.contains(row.latLng)) continue;
            const pixel = projection.fromLatLngToDivPixel(row.latLng);
            if (!pixel || pixel.x < -8 || pixel.x > width + 8 || pixel.y < -8 || pixel.y > height + 8) continue;
            ctx.beginPath(); ctx.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2); ctx.fill();
            if (zoom >= 16) { ctx.lineWidth = .8; ctx.stroke(); }
          }
        }
        onRemove() { this.canvas?.remove(); this.canvas = null; }
        findNearest(latLng, maxPixels = 12) {
          const projection = this.getProjection();
          if (!projection) return null;
          const click = projection.fromLatLngToContainerPixel(latLng);
          let nearest = null, nearestDistance = maxPixels;
          const visible = map.getBounds();
          for (const row of this.points) {
            if (visible && !visible.contains(row.latLng)) continue;
            const pixel = projection.fromLatLngToContainerPixel(row.latLng);
            if (!pixel) continue;
            const distance = Math.hypot(pixel.x - click.x, pixel.y - click.y);
            if (distance < nearestDistance) { nearestDistance = distance; nearest = { lat: row.lat, lng: row.lng }; }
          }
          return nearest;
        }
      }
      const center = { lat: (bounds[0][0] + bounds[1][0]) / 2, lng: (bounds[0][1] + bounds[1][1]) / 2 };
      map = new googleMaps.Map(document.getElementById('map'), {
        center, zoom: 14, mapTypeId: 'roadmap', mapTypeControl: false, streetViewControl: false,
        fullscreenControl: true, zoomControl: true,
        zoomControlOptions: { position: googleMaps.ControlPosition.RIGHT_BOTTOM },
        restriction: { latLngBounds: { south: bounds[0][0] - .12, west: bounds[0][1] - .18, north: bounds[1][0] + .12, east: bounds[1][1] + .18 }, strictBounds: false }
      });
      infoWindow = new googleMaps.InfoWindow();
      treeOverlay = new TreeOverlay(rows);
      heatOverlay = new googleMaps.GroundOverlay('data/img/pet_ist.png', boundsObject(), { opacity: .72, clickable: false });
      shadeOverlay = new googleMaps.GroundOverlay('data/img/shade_14.png', boundsObject(), { opacity: .62, clickable: false });
      heatOverlay.addListener('error', () => { status.textContent = 'Das Klimaraster konnte nicht geladen werden. Bitte data/img/pet_ist.png prüfen.'; });
      shadeOverlay.addListener('error', () => { status.textContent = 'Das Schattenraster konnte nicht geladen werden. Bitte data/img/shade_14.png prüfen.'; });

      const has = { heat: true, trees: rows.length > 0, shade: true, sensors: false, gateways: false, water: waterPoints.length > 0, cool: false, refill: false };
      for (const control of controls) {
        const kind = control.dataset.layer;
        if (!has[kind]) {
          control.disabled = true;
          const row = control.closest('label');
          if (row) { row.classList.add('unavailable'); row.title = 'Für diese Ebene sind in den lokalen Daten keine Datensätze vorhanden.'; }
        }
        control.addEventListener('change', () => setLayer(kind, control.checked));
      }

      for (const point of waterPoints) {
        if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
        point.__marker = new googleMaps.Marker({
          map: null, position: { lat: point.lat, lng: point.lon }, title: 'Künstliche Trinkwasser-Testdaten',
          icon: { path: googleMaps.SymbolPath.CIRCLE, scale: 6, fillColor: '#38bdf8', fillOpacity: .96, strokeColor: '#075985', strokeWeight: 2 }
        });
        point.__marker.addListener('click', () => routeTo({ lat: point.lat, lng: point.lon, label: 'Trinkwasser-Beispielpunkt' }));
      }

      locateButton.addEventListener('click', () => {
        if (!navigator.geolocation) { status.textContent = 'Dieser Browser unterstützt keine Standortbestimmung.'; return; }
        locateButton.disabled = true;
        status.textContent = 'Der Browser fragt jetzt nach deinem Standort. Bitte wähle „Zulassen“. ';
        navigator.geolocation.getCurrentPosition(position => {
          const point = showUserPosition(position.coords);
          const insideMapArea = point.lat >= bounds[0][0] && point.lat <= bounds[1][0] && point.lng >= bounds[0][1] && point.lng <= bounds[1][1];
          if (!insideMapArea) map.setOptions({ restriction: null });
          map.setCenter(point);
          map.setZoom(Math.max(map.getZoom() || 0, 16));
          status.textContent = 'Standort auf der Karte angezeigt.';
          locateButton.disabled = false;
        }, error => {
          status.textContent = error.code === error.PERMISSION_DENIED && geolocationPermission !== 'granted'
            ? 'Standortzugriff blockiert. Erlaube ihn in den Website-Einstellungen deines Browsers und versuche es erneut.'
            : locationError(error);
          locateButton.disabled = false;
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
      });

      map.addListener('click', event => {
        const treeControl = controls.find(control => control.dataset.layer === 'trees');
        if (treeControl?.checked) {
          const nearest = treeOverlay.findNearest(event.latLng);
          if (nearest) { routeTo({ ...nearest, label: 'Baum' }); return; }
        }
        infoWindow.setContent(`<strong>${event.latLng.lat().toFixed(5)}, ${event.latLng.lng().toFixed(5)}</strong><br><span>Hildesheim</span>`);
        infoWindow.setPosition(event.latLng);
        infoWindow.open({ map });
      });
      routeCloseButton.addEventListener('click', clearRoute);
      routeStartButton.addEventListener('click', () => {
        if (!currentPosition || !activeDestination) return;
        window.open(googleMapsDirectionsUrl(currentPosition, activeDestination), '_blank', 'noopener,noreferrer');
      });
      status.textContent = `Bereit · ${rows.length.toLocaleString('de-DE')} Bäume · ${waterPoints.length} künstliche Trinkwasser-Testpunkte · Klimaraster und Schatten verfügbar`;
      window.HK = { map, layers: { heat: heatOverlay, trees: treeOverlay, shade: shadeOverlay, water: waterPoints.map(point => point.__marker) }, data, waterPoints };
    } catch (error) {
      if (error.message === 'google-maps-auth-failed') return;
      status.textContent = error.message === 'google-maps-load-failed'
        ? 'Google Maps konnte nicht geladen werden. Prüfe die Internetverbindung und den API-Schlüssel.'
        : 'Google Maps wurde nicht vollständig initialisiert. Prüfe, ob Maps JavaScript API und Routes API aktiviert sind.';
    }
  }

  initialize();
})();
