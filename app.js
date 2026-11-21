(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const status = $('#data-status');
  const controls = [...document.querySelectorAll('[data-layer]')];
  const data = window.HK_DATA;
  const bounds = data?.meta?.bounds;
  if (!window.L) { status.textContent = 'Leaflet konnte nicht geladen werden. Bitte Internetverbindung prüfen und neu laden.'; return; }
  if (!data || !bounds) { status.textContent = 'Die lokalen Kartendaten fehlen oder sind fehlerhaft.'; controls.forEach((c) => { c.disabled = true; }); return; }

  const map = L.map('map', { zoomControl: false, preferCanvas: true, minZoom: 11, maxZoom: 19 });
  map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  map.setMaxBounds([[bounds[0][0] - .12, bounds[0][1] - .18], [bounds[1][0] + .12, bounds[1][1] + .18]]);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: ['a','b','c'], attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>' }).addTo(map);
  const pane = (name, z) => { const p = map.createPane(name); p.style.zIndex = z; p.style.pointerEvents = 'none'; return p; };
  pane('heat', 350); pane('shade', 360); pane('tree-points', 400); map.createPane('markers').style.zIndex = 450; map.createPane('user-location').style.zIndex = 650;
  const heat = L.imageOverlay('./data/img/pet_ist.png', bounds, { pane: 'heat', opacity: .72 });
  const shade = L.imageOverlay('./data/img/shade_14.png', bounds, { pane: 'shade', opacity: .62 });
  heat.on('error', () => { status.textContent = 'Das Klimaraster konnte nicht geladen werden.'; });
  shade.on('error', () => { status.textContent = 'Das Schattenraster konnte nicht geladen werden.'; });
  const rows = Array.isArray(data.trees) ? data.trees : [];
  const TreeTiles = L.GridLayer.extend({ createTile(coords) {
    const canvas = document.createElement('canvas'); const size = this.getTileSize(); canvas.width = size.x; canvas.height = size.y;
    const ctx = canvas.getContext('2d'); const scale = 2 ** coords.z; const left = coords.x / scale; const top = coords.y / scale; const right = (coords.x + 1) / scale; const bottom = (coords.y + 1) / scale;
    const pad = 7 / (256 * scale); const radius = coords.z >= 17 ? 3.2 : coords.z >= 15 ? 2.6 : 2.1;
    ctx.fillStyle = 'rgba(36,132,66,.92)'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = coords.z >= 16 ? .8 : 0;
    for (const row of rows) { if (!Array.isArray(row) || !Number.isFinite(+row[0]) || !Number.isFinite(+row[1])) continue;
      const lat = +row[0] * Math.PI / 180; const x = (+row[1] + 180) / 360; const y = (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2;
      if (x < left-pad || x > right+pad || y < top-pad || y > bottom+pad) continue;
      ctx.beginPath(); ctx.arc((x-left)*scale*256, (y-top)*scale*256, radius, 0, Math.PI*2); ctx.fill(); if (ctx.lineWidth) ctx.stroke();
    } return canvas;
  }});
  const trees = new TreeTiles({ pane: 'tree-points', minZoom: 11, maxZoom: 19, tileSize: 256 });
  const locationLayer = L.layerGroup().addTo(map); const markerLayers = {};
  let target = null; let origin = null; let originAccuracy = 0; let routeLine = null; let routeMeasure = null; let targetMarker = null; let userMarker = null; let accuracyCircle = null; let routeWatch = null; let pendingAction = null; let reportPoint = null; let route = null; let routeRequestId = 0; let routeModeEnabled = false;
  const routeModeToggle = $('#route-mode-toggle');
  function pointMarker(group, latlng, color, title, detail) {
    const marker = L.circleMarker(latlng, { pane: 'markers', radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 });
    marker.bindPopup(`<strong>${title}</strong><br>${detail}`); marker.addTo(group); return marker;
  }
  // Deliberately synthetic points; they are never represented as verified real services.
  const demo = {
    water: [
      { at:[52.1501,9.9512], name:'Demo-Trinkwasserstelle 1' },
      { at:[52.1572,9.9411], name:'Demo-Trinkwasserstelle 2' },
      { at:[52.1465,9.9254], name:'Demo-Trinkwasserstelle 3' },
      { at:[52.1638,9.9318], name:'Demo-Trinkwasserstelle 4' },
      { at:[52.1531,9.9692], name:'Demo-Trinkwasserstelle 5' },
    ],
    refill: [
      { at:[52.1478,9.9364], name:'Demo-Refill-Station 1' },
      { at:[52.1611,9.9555], name:'Demo-Refill-Station 2' },
      { at:[52.1436,9.9493], name:'Demo-Refill-Station 3' },
      { at:[52.1662,9.9431], name:'Demo-Refill-Station 4' },
      { at:[52.1558,9.9197], name:'Demo-Refill-Station 5' },
    ],
    emergency: [{ at:[52.1534,9.9336], name:'Fiktive Demo-Notfallstation A' }, { at:[52.1594,9.9481], name:'Fiktive Demo-Notfallstation B' }],
  };
  for (const [key, entries] of Object.entries(demo)) {
    const group = L.layerGroup(); markerLayers[key] = group;
    entries.forEach((item) => pointMarker(group, item.at, key === 'emergency' ? '#bd2e34' : '#087d91', item.name, key === 'emergency' ? '<b>Demo – kein realer Standort.</b> Nicht für Notfälle verwenden.' : '<b>Fiktiver Demo-Punkt – kein bestätigter Standort.</b>'));
  }
  const pmGroup = L.layerGroup(); markerLayers.pm = pmGroup;
  const layers = { heat, trees, shade, water: markerLayers.water, refill: markerLayers.refill, emergency: markerLayers.emergency, pm: pmGroup };
  const available = { heat:true, trees:rows.length>0, shade:true, water:true, refill:true, emergency:true, pm:true };
  function toggleLayer(control, enabled) {
    const key = control.dataset.layer; const layer = layers[key];
    control.setAttribute('aria-pressed', String(enabled));
    if (enabled && layer && !map.hasLayer(layer)) layer.addTo(map);
    if (!enabled && layer && map.hasLayer(layer)) map.removeLayer(layer);
    const icon = control.querySelector('[data-icon]');
    if (icon) icon.src = `./icons/${icon.dataset.icon}${enabled ? '' : '_inaktiv'}.svg`;
    if (key === 'pm' && enabled) $('#layer-message').textContent = 'Keine belastbare Feinstaub-Messquelle im Projekt vorhanden. Es werden keine Messwerte angezeigt.';
    else if ($('#layer-message').textContent.startsWith('Keine belastbare')) $('#layer-message').textContent = '';
    $('#layer-message').hidden = !$('#layer-message').textContent;
  }
  controls.forEach((control) => { const key=control.dataset.layer; if (!available[key]) { control.disabled=true; control.classList.add('unavailable'); control.title='Für diese Ebene sind keine lokalen Datensätze vorhanden.'; }
    control.addEventListener('click', () => toggleLayer(control, control.getAttribute('aria-pressed')!=='true')); });
  function setTarget(latlng, label='Kartenpunkt') {
    const lat=Number(latlng[0]), lng=Number(latlng[1]); target=[lat,lng];
    if(routeWatch!==null)navigator.geolocation.clearWatch(routeWatch);routeWatch=null;route=null;
    if(routeLine)map.removeLayer(routeLine);routeLine=null;routeMeasure=null;
    if(targetMarker)map.removeLayer(targetMarker);
    targetMarker=L.circleMarker(target,{pane:'markers',radius:9,color:'#fff',weight:3,fillColor:'#e8742c',fillOpacity:1,bubblingMouseEvents:false}).addTo(map);
    targetMarker.bindTooltip('Ziel',{direction:'top'});
    L.popup({maxWidth:260}).setLatLng(target).setContent(`<strong>Ziel ausgewählt</strong><br>Kürzeste Fußroute wird berechnet …<br>${lat.toFixed(5)}, ${lng.toFixed(5)}`).openOn(map);
    needsConsent(startRoute);
  }
  map.on('click', (e) => {
    const {lat,lng}=e.latlng; if (lat<bounds[0][0]||lat>bounds[1][0]||lng<bounds[0][1]||lng>bounds[1][1]) return;
    if (pendingAction==='report') { reportPoint=[lat,lng]; $('#report-location').textContent=`Ort: ${lat.toFixed(5)}, ${lng.toFixed(5)}`; pendingAction=null; $('#report-modal').hidden=false; $('#report-text').focus(); return; }
    if(routeModeEnabled) setTarget([lat,lng]);
    else L.popup({maxWidth:260}).setLatLng(e.latlng).setContent('<strong>Route ist ausgeschaltet.</strong><br>Aktiviere die Schaltfläche „Route“, um hierher zu routen.').openOn(map);
  });
  routeModeToggle.addEventListener('click',()=>{
    routeModeEnabled=!routeModeEnabled;
    routeModeToggle.setAttribute('aria-pressed',String(routeModeEnabled));
    if(routeModeEnabled){status.textContent='Fußroute aktiviert. Tippe auf ein Ziel in der Karte.';return;}
    routeRequestId++;if(routeWatch!==null)navigator.geolocation.clearWatch(routeWatch);routeWatch=null;route=null;routeMeasure=null;target=null;
    if(routeLine)map.removeLayer(routeLine);routeLine=null;if(targetMarker)map.removeLayer(targetMarker);targetMarker=null;map.closePopup();
    status.textContent='Fußroute deaktiviert. Standortverfolgung beendet.';
  });
  function needsConsent(action) { if (sessionStorage.getItem('hk-route-consent')==='yes') { action(); return; } pendingAction=action; $('#route-consent-check').checked=false; $('#route-consent-accept').disabled=true; $('#route-consent').hidden=false; $('#route-consent-check').focus(); }
  $('#route-consent-check').addEventListener('change',(e)=>$('#route-consent-accept').disabled=!e.target.checked);
  $('#route-consent-cancel').addEventListener('click',()=>{ $('#route-consent').hidden=true; pendingAction=null; });
  $('#route-consent-accept').addEventListener('click',()=>{ if (!$('#route-consent-check').checked) return; sessionStorage.setItem('hk-route-consent','yes'); $('#route-consent').hidden=true; const action=pendingAction; pendingAction=null; if (typeof action==='function') action(); });
  function measureRoute(geometry){
    const points=geometry.coordinates;const cumulative=[0];
    for(let i=1;i<points.length;i++)cumulative[i]=cumulative[i-1]+map.distance([points[i-1][1],points[i-1][0]],[points[i][1],points[i][0]]);
    return cumulative;
  }
  function routeProgress(lat,lon,geometry,cumulative){
    let nearest=Infinity,along=0;const points=geometry.coordinates;const cos=Math.cos(lat*Math.PI/180);
    for(let i=1;i<points.length;i++){
      const ax=(points[i-1][0]-lon)*111320*cos,ay=(points[i-1][1]-lat)*111320,bx=(points[i][0]-lon)*111320*cos,by=(points[i][1]-lat)*111320;
      const dx=bx-ax,dy=by-ay;const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));const crossTrack=Math.hypot(ax+t*dx,ay+t*dy);
      if(crossTrack<nearest){nearest=crossTrack;along=cumulative[i-1]+(cumulative[i]-cumulative[i-1])*t;}
    }
    return { offRoute:nearest, remaining:Math.max(0,cumulative[cumulative.length-1]-along) };
  }
  function startRoute() {
    if(!routeModeEnabled){status.textContent='Aktiviere zuerst die Fußroute.';return;}
    if(!target){status.textContent='Tippe zuerst auf einen Zielpunkt in der Karte.';return;}
    const destination=[...target];const requestId=++routeRequestId;
    if(!navigator.geolocation){status.textContent='Für eine Route wird dein Startpunkt benötigt. Geolocation ist nicht verfügbar.';return;}
    status.textContent='Standort wird für die Routenberechnung abgefragt …';
    navigator.geolocation.getCurrentPosition(async(pos)=>{if(requestId!==routeRequestId)return;origin=[pos.coords.latitude,pos.coords.longitude];originAccuracy=Number(pos.coords.accuracy)||0;locationLayer.clearLayers();userMarker=null;accuracyCircle=null;updateUserMarker(origin,originAccuracy);
      const gap=map.distance(origin,destination);if(gap<=10&&originAccuracy<=20){status.textContent=`Du bist nur ${Math.round(gap)} m vom Ziel entfernt. Geh nur weiter, wenn der Weg frei ist; quere keine Gebäude.`;map.closePopup();return;}
      await requestRoute(destination,requestId);
    },(err)=>{if(requestId!==routeRequestId)return;status.textContent=err.code===1?'Standortfreigabe abgelehnt. Erlaube sie in den Browsereinstellungen, um eine Route zu sehen.':'Startpunkt konnte nicht ermittelt werden.';},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  }
  async function requestRoute(destination,requestId){
    try { const coords=`${origin[1]},${origin[0]};${destination[1]},${destination[0]}`;const startRadius=Math.round(Math.min(50,Math.max(15,originAccuracy+5)));const targetRadius=50;const params=new URLSearchParams({overview:'full',geometries:'geojson',alternatives:'3',radiuses:`${startRadius};${targetRadius}`});const url=`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coords}?${params}`;
      status.textContent='Fußroute wird berechnet …';const response=await fetch(url);const result=await response.json();if(requestId!==routeRequestId)return;if(result.code==='NoSegment'){status.textContent='Kein naher Fußweg gefunden. Wähle einen Punkt näher an einem freien Gehweg.';return;}if(!response.ok||result.code!=='Ok'||!result.routes?.length)throw new Error(`HTTP ${response.status}`);
      const chosen=result.routes.reduce((a,b)=>a.distance<=b.distance?a:b);
      const snaps=result.waypoints?.map((waypoint)=>Number(waypoint.distance)||0)||[];
      if(snaps.some((distance,index)=>distance>(index===0?startRadius:targetRadius)+2)){status.textContent='Ein Start- oder Zielpunkt liegt zu weit vom Fußwegnetz entfernt. Wähle einen Punkt näher an einem freien Gehweg.';return;}
      const directDistance=map.distance(origin,destination);
      if(directDistance<=60&&chosen.distance>Math.max(100,directDistance*4)){status.textContent='Das Fußwegenetz schlägt hier einen auffälligen Umweg vor. Prüfe vor Ort auf Gebäude oder fehlende Wege; wähle sonst einen Zielpunkt direkt auf einem freien Gehweg.';return;}
      route=chosen;routeMeasure=measureRoute(chosen.geometry);if(routeLine)map.removeLayer(routeLine);routeLine=L.geoJSON(chosen.geometry,{style:{color:'#087d91',weight:7,opacity:1}}).addTo(map);map.fitBounds(routeLine.getBounds(),{padding:[35,35]});
      const mins=Math.round(chosen.duration/60);status.textContent=`Kürzeste verfügbare Fußroute: ${(chosen.distance/1000).toLocaleString('de-DE',{maximumFractionDigits:1})} km · ca. ${mins} Min. · Routing: FOSSGIS`;
      if(routeWatch!==null)navigator.geolocation.clearWatch(routeWatch);routeWatch=navigator.geolocation.watchPosition(onProgress,(error)=>{if(route)status.textContent='Standortverfolgung pausiert. Prüfe die Standortfreigabe.';}, {enableHighAccuracy:true,maximumAge:2000,timeout:20000});
    } catch(error){if(requestId!==routeRequestId)return;status.textContent='Die Fußroute konnte nicht berechnet werden. Prüfe deine Internetverbindung oder wähle einen anderen Punkt.';}
  }
  function updateUserMarker(point,accuracy=0){
    if(!accuracyCircle){accuracyCircle=L.circle(point,{pane:'user-location',radius:Math.max(accuracy,3),color:'#1479d1',weight:1,fillColor:'#4aa3f0',fillOpacity:.12,interactive:false}).addTo(locationLayer);}
    else {accuracyCircle.setLatLng(point);accuracyCircle.setRadius(Math.max(accuracy,3));}
    if(!userMarker){userMarker=L.circleMarker(point,{pane:'user-location',radius:8,color:'#fff',weight:3,fillColor:'#1479d1',fillOpacity:1,interactive:false}).addTo(locationLayer);}
    else userMarker.setLatLng(point);
  }
  function onProgress(pos){ if(!route||!routeMeasure)return;const here=[pos.coords.latitude,pos.coords.longitude];const progress=routeProgress(here[0],here[1],route.geometry,routeMeasure);const accuracy=Number(pos.coords.accuracy)||0;
    updateUserMarker(here,accuracy);
    if(progress.remaining<12&&progress.offRoute<Math.min(35,Math.max(18,accuracy))){status.textContent='Du bist am Ende der Route angekommen.';route=null;if(routeWatch!==null){navigator.geolocation.clearWatch(routeWatch);routeWatch=null;}$('#feedback-title').textContent='Du bist am Ziel angekommen';$('#feedback-question').textContent='Geht es dir an diesem Ort besser?';$('#arrival-feedback').querySelectorAll('[data-feeling]').forEach((b)=>{b.disabled=false;});$('#arrival-feedback').hidden=false;$('#arrival-feedback [data-feeling]').forEach((b)=>b.focus({preventScroll:true}));return;}
    const remaining=Math.round(progress.remaining);const offRoute=Math.round(progress.offRoute);status.textContent=offRoute>30?`Noch ca. ${remaining} m auf der Route · ${offRoute} m daneben`:`Noch ca. ${remaining} m auf der Route`;
    map.panTo(here,{animate:true,duration:.4});}
  $('#arrival-feedback').querySelectorAll('[data-feeling]').forEach((button)=>button.addEventListener('click',()=>{saveLocal('feedback',{feeling:button.dataset.feeling,at:new Date().toISOString(),destination:target});$('#arrival-feedback').querySelectorAll('[data-feeling]').forEach((option)=>{option.disabled=true;});$('#feedback-title').textContent='Danke!';$('#feedback-question').textContent='Möchtest du noch einen Hinweis zur Karte senden?';status.textContent='Rückmeldung lokal gespeichert.';}));
  $('#skip-feedback').addEventListener('click',()=>{$('#arrival-feedback').hidden=true;});
  $('#open-report').addEventListener('click',()=>{reportPoint=target?[...target]:null;$('#report-location').textContent=reportPoint?`Ort: ${reportPoint[0].toFixed(5)}, ${reportPoint[1].toFixed(5)}`:'Kein Ort gewählt';$('#arrival-feedback').hidden=true;$('#report-modal').hidden=false;$('#report-text').focus();});
  $('#report-location-button').addEventListener('click',()=>{$('#report-modal').hidden=true;pendingAction='report';status.textContent='Tippe auf die Karte für den Hinweis-Ort.';});
  $('#close-report').addEventListener('click',()=>{$('#report-modal').hidden=true;});
  function readLocal(key){try{return JSON.parse(localStorage.getItem(`hk-${key}`)||'[]');}catch{return[];}}
  function saveLocal(key,item){const records=readLocal(key);records.push(item);localStorage.setItem(`hk-${key}`,JSON.stringify(records));}
  $('#report-form').addEventListener('submit',(e)=>{e.preventDefault();saveLocal('reports',{category:$('#report-category').value,text:$('#report-text').value.trim(),point:reportPoint,at:new Date().toISOString()});e.target.reset();reportPoint=null;$('#report-location').textContent='Kein Ort gewählt';$('#report-modal').hidden=true;status.textContent='Hinweis lokal gespeichert.';});
  function download(name,value){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  $('#export-local-data').addEventListener('click',()=>download('hitzekompass-lokale-rueckmeldungen.json',{reports:readLocal('reports'),feedback:readLocal('feedback')}));
  const profileForm=$('#profile-form');
  function showProfile(profile, message) {
    $('#profile-name').value=profile.name||'';$('#profile-age').value=profile.age||'';
    profileForm.querySelectorAll('input[name="notifications"]').forEach((input)=>{input.checked=profile.notifications?.includes(input.value)||false;});
    $('#profile-status').textContent=message;
  }
  try { const savedProfile=JSON.parse(localStorage.getItem('hk-user-profile')||'null');if(savedProfile)showProfile(savedProfile,'Dein Profil wurde auf diesem Gerät geladen.'); } catch { /* Ungültige lokale Profildaten bleiben unberücksichtigt. */ }
  profileForm.addEventListener('submit',(e)=>{e.preventDefault();const age=Number($('#profile-age').value);if(!Number.isInteger(age)||age<1||age>120){$('#profile-status').textContent='Bitte gib ein Alter zwischen 1 und 120 Jahren ein.';return;}
    const profile={name:$('#profile-name').value.trim(),age,notifications:[...profileForm.querySelectorAll('input[name="notifications"]:checked')].map((input)=>input.value),updatedAt:new Date().toISOString()};
    try{localStorage.setItem('hk-user-profile',JSON.stringify(profile));$('#profile-status').textContent='Profil und Benachrichtigungswünsche wurden auf diesem Gerät gespeichert.';}catch{$('#profile-status').textContent='Das Profil konnte nicht lokal gespeichert werden. Prüfe die Speichereinstellungen deines Browsers.';}
  });
  $('#location-button').addEventListener('click',()=>{if(!navigator.geolocation){status.textContent='Standortzugriff ist nicht verfügbar. Öffne die Website über HTTPS oder localhost.';return;}status.textContent='Standort wird ermittelt …';navigator.geolocation.getCurrentPosition((pos)=>{origin=[pos.coords.latitude,pos.coords.longitude];locationLayer.clearLayers();L.circle(origin,{pane:'user-location',radius:pos.coords.accuracy||0,color:'#1479d1',weight:1,fillColor:'#4aa3f0',fillOpacity:.16,interactive:false}).addTo(locationLayer);L.circleMarker(origin,{pane:'user-location',radius:8,color:'#fff',weight:3,fillColor:'#1479d1',fillOpacity:1,interactive:false}).addTo(locationLayer);map.setView(origin,16);status.textContent='Standort nur auf dieser Karte angezeigt.';},()=>{status.textContent='Standort konnte nicht abgerufen werden. Erlaube den Zugriff in den Browsereinstellungen.';},{enableHighAccuracy:true,maximumAge:15000,timeout:15000});});
  status.textContent='Bereit';
  window.HK={map,layers,data};
})();
