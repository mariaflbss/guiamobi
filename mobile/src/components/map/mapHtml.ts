import { LEAFLET_CSS, LEAFLET_JS } from './leafletAssets';

/**
 * Página do mapa (US09), executada dentro do WebView do RouteMap.
 *
 * Decisões técnicas:
 * - Leaflet vai embutido no app (leafletAssets.ts): nenhum CDN de script/CSS.
 *   Sem internet, paradas e linha ainda aparecem; só o fundo cartográfico não.
 * - A página é ESTÁTICA. O React Native envia os dados por `window.GM.*`
 *   (injectJavaScript). Assim o mapa não recarrega a cada posição de GPS ou de
 *   veículo, e o zoom/posição que o usuário escolheu é preservado.
 * - Fundo cartográfico: OpenStreetMap, com reserva automática (Carto e
 *   OSM France) se o primeiro servidor falhar. O servidor do OSM exige o
 *   cabeçalho Referer: por isso o WebView é aberto com `baseUrl` (ver RouteMap).
 * - Satélite/Híbrido: imagens Esri World Imagery (uso gratuito, sem chave).
 * - Textos de popup são montados com textContent (nada de innerHTML com dados
 *   vindos da API/OSM).
 */
const PAGE_SCRIPT = `
(function () {
  'use strict';

  var DEFAULT_LABELS = { line: '', you: 'You', origin: 'Origin', stop: 'Stop', address: 'Address', mapUnavailable: 'Map unavailable' };
  var DEFAULT_COLORS = { primary: '#1D5FD0', primaryDark: '#123F8E', success: '#16794C', origin: '#7C3AED' };

  var OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  var PROVIDERS = {
    standard: [
      { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, attribution: OSM_ATTR },
      { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', subdomains: 'abcd', maxZoom: 19,
        attribution: OSM_ATTR + ' &copy; <a href="https://carto.com/attributions">CARTO</a>' },
      { url: 'https://tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', subdomains: 'a', maxZoom: 19,
        attribution: OSM_ATTR + ' &middot; tiles by OSM France' }
    ],
    satellite: [
      { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19,
        attribution: 'Tiles &copy; Esri' }
    ],
    reference: [
      { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', maxZoom: 19,
        attribution: '' }
    ]
  };

  function post(message) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }
    } catch (e) { /* ignora */ }
  }

  var state = {
    labels: DEFAULT_LABELS,
    colors: DEFAULT_COLORS,
    mapType: 'standard',
    viewReady: false,
    fitted: false,
    fitTimer: null,
    userFitted: false,
    interacted: false,
    sigs: {},
    userPos: null,
    stats: { ok: 0, err: 0 },
    providerIndex: { standard: 0, satellite: 0, reference: 0 },
    baseLayer: null,
    refLayer: null,
    watchdog: null,
    exhausted: false
  };

  var banner = document.getElementById('banner');
  function showBanner(text) { banner.textContent = text; banner.style.display = 'block'; }
  function hideBanner() { banner.style.display = 'none'; }

  if (!window.L) {
    showBanner(state.labels.mapUnavailable);
    post({ type: 'error', message: 'leaflet-missing' });
    return;
  }

  var map = L.map('map', { zoomControl: true, attributionControl: true, zoomSnap: 0.5, worldCopyJump: false });
  map.attributionControl.setPrefix(false);
  map.setView([0, 0], 2);

  // Painéis separados: a ordem de empilhamento não depende da ordem de redesenho.
  [['shape', 410], ['stops', 420], ['pois', 430], ['vehicles', 440], ['user', 450]].forEach(function (p) {
    map.createPane(p[0]).style.zIndex = p[1];
  });
  var groups = {
    shape: L.layerGroup().addTo(map),
    stops: L.layerGroup().addTo(map),
    pois: L.layerGroup().addTo(map),
    vehicles: L.layerGroup().addTo(map),
    user: L.layerGroup().addTo(map)
  };

  ['touchstart', 'mousedown', 'wheel'].forEach(function (evt) {
    map.getContainer().addEventListener(evt, function () { state.interacted = true; }, { passive: true });
  });

  /* ---------- Camadas de fundo (tiles) com reserva automática ---------- */

  function makeLayer(kind) {
    var list = PROVIDERS[kind];
    var provider = list[Math.min(state.providerIndex[kind], list.length - 1)];
    var layer = L.tileLayer(provider.url, {
      maxZoom: provider.maxZoom,
      subdomains: provider.subdomains || 'abc',
      attribution: provider.attribution,
      referrerPolicy: 'origin',
      crossOrigin: false
    });
    if (kind !== 'reference') {
      layer.on('tileload', onTileLoad);
      layer.on('tileerror', onTileError);
    }
    return layer;
  }

  function onTileLoad() {
    state.stats.ok += 1;
    if (state.watchdog) { clearTimeout(state.watchdog); state.watchdog = null; }
    if (banner.style.display !== 'none') hideBanner();
    if (state.exhausted) state.exhausted = false;
  }

  function onTileError() {
    state.stats.err += 1;
    if (state.stats.ok === 0 && state.stats.err >= 4) failover();
  }

  function activeKind() { return state.mapType === 'standard' ? 'standard' : 'satellite'; }

  function failover() {
    var kind = activeKind();
    var list = PROVIDERS[kind];
    if (state.providerIndex[kind] < list.length - 1) {
      state.providerIndex[kind] += 1;
      post({ type: 'tiles', status: 'failover', provider: state.providerIndex[kind] });
      refreshBase();
    } else if (state.stats.ok === 0) {
      state.exhausted = true;
      showBanner(state.labels.mapUnavailable);
      post({ type: 'tiles', status: 'unavailable' });
    }
  }

  function armWatchdog() {
    if (state.watchdog) clearTimeout(state.watchdog);
    state.watchdog = setTimeout(function () {
      state.watchdog = null;
      if (state.stats.ok === 0) failover();
    }, 9000);
  }

  function refreshBase() {
    if (!state.viewReady) return;
    if (state.baseLayer) { map.removeLayer(state.baseLayer); state.baseLayer = null; }
    if (state.refLayer) { map.removeLayer(state.refLayer); state.refLayer = null; }
    state.stats = { ok: 0, err: 0 };
    var kind = activeKind();
    state.baseLayer = makeLayer(kind).addTo(map);
    state.baseLayer.bringToBack();
    if (state.mapType === 'hybrid') state.refLayer = makeLayer('reference').addTo(map);
    armWatchdog();
  }

  // Ao voltar a ter internet, tenta de novo desde o servidor principal.
  window.addEventListener('online', function () {
    state.providerIndex = { standard: 0, satellite: 0, reference: 0 };
    hideBanner();
    refreshBase();
  });

  /* ---------- Utilidades de desenho ---------- */

  function sizeOk() {
    var el = map.getContainer();
    return el.clientWidth > 0 && el.clientHeight > 0;
  }

  function popupEl(lines) {
    var box = document.createElement('div');
    lines.forEach(function (line, i) {
      if (!line) return;
      if (i > 0) box.appendChild(document.createElement('br'));
      var span = document.createElement(i === 0 ? 'strong' : 'span');
      span.textContent = line;
      box.appendChild(span);
    });
    return box;
  }

  function dot(latlng, pane, radius, fill, extra) {
    var opts = { pane: pane, radius: radius, color: '#ffffff', weight: 2, fillColor: fill, fillOpacity: 1 };
    for (var k in extra) opts[k] = extra[k];
    return L.circleMarker(latlng, opts);
  }

  // Alvo de toque maior e invisível: marcadores de 7 px são difíceis de tocar.
  function hit(latlng, pane, content) {
    var h = L.circleMarker(latlng, { pane: pane, radius: 18, stroke: false, fillColor: '#000000', fillOpacity: 0 });
    h.bindPopup(content);
    return h;
  }

  function allPoints() {
    var pts = [];
    state.stopPoints.forEach(function (p) { pts.push(p); });
    state.shapePoints.forEach(function (p) { pts.push(p); });
    if (state.userPos) pts.push(state.userPos);
    return pts;
  }
  state.stopPoints = [];
  state.shapePoints = [];

  function fitAll(attempt) {
    if (state.fitTimer) { clearTimeout(state.fitTimer); state.fitTimer = null; }
    var pts = allPoints();
    if (pts.length === 0) return false;
    if (!sizeOk()) {
      // O WebView pode ainda não ter tamanho no 1o instante; tenta de novo (um único timer).
      if ((attempt || 0) < 40) {
        state.fitTimer = setTimeout(function () { state.fitTimer = null; fitAll((attempt || 0) + 1); }, 150);
      }
      return false;
    }
    map.invalidateSize();
    if (pts.length === 1) map.setView(pts[0], 16);
    else map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16, animate: false });
    state.fitted = true;
    if (!state.viewReady) { state.viewReady = true; refreshBase(); }
    return true;
  }

  /* ---------- API usada pelo React Native ---------- */

  function sig(name, value) {
    var s = JSON.stringify(value);
    if (state.sigs[name] === s) return false;
    state.sigs[name] = s;
    return true;
  }

  function setData(d) {
    state.labels = d.labels || DEFAULT_LABELS;
    state.colors = d.colors || DEFAULT_COLORS;
    var colors = state.colors;
    var labels = state.labels;

    if (sig('stops', [d.stops, colors, labels])) {
      groups.stops.clearLayers();
      state.stopPoints = [];
      d.stops.forEach(function (s) {
        var latlng = [s.lat, s.lon];
        // A origem selecionada não é a posição GPS do usuário. Usa uma cor
        // própria para evitar os dois marcadores azuis quando o usuário está
        // longe do ponto de embarque.
        var color = s.destination ? colors.success : (s.boarding ? colors.origin : (s.current ? colors.primary : colors.primaryDark));
        var title = labels.stop + ' ' + (s.index + 1) + (s.name ? ' - ' + s.name : '');
        var lines = [title];
        if (s.boarding) lines.push(labels.origin);
        if (s.address) lines.push(labels.address + ': ' + s.address);
        groups.stops.addLayer(dot(latlng, 'stops', s.boarding ? 9 : 7, color, { interactive: false }));
        groups.stops.addLayer(hit(latlng, 'stops', popupEl(lines)));
        state.stopPoints.push(latlng);
      });
    }

    if (sig('shape', [d.shape, colors])) {
      groups.shape.clearLayers();
      state.shapePoints = d.shape.length > 1 ? d.shape : [];
      if (d.shape.length > 1) {
        groups.shape.addLayer(L.polyline(d.shape, { pane: 'shape', color: colors.primary, weight: 5, opacity: 0.9, interactive: false }));
      }
    }

    if (sig('pois', d.pois)) {
      groups.pois.clearLayers();
      d.pois.forEach(function (p) {
        var latlng = [p.lat, p.lon];
        groups.pois.addLayer(dot(latlng, 'pois', 6, '#f59e0b', { interactive: false }));
        groups.pois.addLayer(hit(latlng, 'pois', popupEl([p.name || p.category])));
      });
    }

    if (sig('vehicles', [d.vehicles, colors, labels])) {
      groups.vehicles.clearLayers();
      d.vehicles.forEach(function (v) {
        groups.vehicles.addLayer(dot(v, 'vehicles', 7, colors.primary, { interactive: false }));
        groups.vehicles.addLayer(hit(v, 'vehicles', popupEl([labels.line])));
      });
    }

    if (!state.fitted) fitAll(0);
  }

  function setUser(pos) {
    groups.user.clearLayers();
    state.userPos = pos && isFinite(pos[0]) && isFinite(pos[1]) ? pos : null;
    if (!state.userPos) return;
    var colors = state.colors;
    groups.user.addLayer(L.circleMarker(state.userPos, { pane: 'user', radius: 18, stroke: false, fillColor: colors.primary, fillOpacity: 0.18, interactive: false }));
    var me = dot(state.userPos, 'user', 9, colors.primary, { interactive: false });
    groups.user.addLayer(me);
    groups.user.addLayer(hit(state.userPos, 'user', popupEl([state.labels.you])));
    // Primeiro sinal de GPS: enquadra usuário + paradas (uma vez, e só se
    // a pessoa ainda não mexeu no mapa). Assim o usuário nunca "perde" a linha.
    if (!state.userFitted && !state.interacted) {
      state.userFitted = true;
      if (state.fitted) fitAll(0);
    }
  }

  function setMapType(type) {
    if (type !== 'standard' && type !== 'satellite' && type !== 'hybrid') type = 'standard';
    if (type === state.mapType && state.baseLayer) return;
    state.mapType = type;
    hideBanner();
    refreshBase();
  }

  window.GM = { setData: setData, setUser: setUser, setMapType: setMapType, _state: state, _map: map };

  post({ type: 'ready' });
})();
`;

const PAGE_STYLE = `
html, body, #map { margin:0; padding:0; width:100%; height:100%; background:#e5e3df; }
body { overflow:hidden; -webkit-tap-highlight-color: transparent; }
.leaflet-control-attribution { font-size:9px; }
.leaflet-control-zoom a { width:36px !important; height:36px !important; line-height:36px !important; font-size:22px !important; }
.leaflet-popup-content { font:13px/1.35 sans-serif; margin:10px 12px; }
#banner { display:none; position:absolute; z-index:9999; left:50%; top:50%; transform:translate(-50%,-50%); max-width:78%;
  padding:10px 12px; border-radius:10px; background:#fff; color:#222; font:13px/1.3 sans-serif; text-align:center;
  box-shadow:0 2px 8px rgba(0,0,0,.2); pointer-events:none; }
`;

/** HTML completo e autossuficiente (sem scripts/CSS externos). */
export const MAP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta name="referrer" content="origin" />
<style>${LEAFLET_CSS}</style>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div id="map"></div>
<div id="banner" role="status"></div>
<script>${LEAFLET_JS}</script>
<script>${PAGE_SCRIPT}</script>
</body>
</html>`;
