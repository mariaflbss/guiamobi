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

  var DEFAULT_LABELS = { line: '', you: 'Sua localização atual', origin: 'Origem', destination: 'Destino', stop: 'Parada', address: 'Endereço', mapUnavailable: 'Mapa indisponível', unnamedPoi: 'Nome não disponível', favorite: 'Favorito', favoriteCategories: {}, poi: {} };
  var DEFAULT_COLORS = { line: '#1852A4', you: '#1852A4', origin: '#2F6FB6', originRing: '#2F6FB6', destination: '#15803D', stop: '#6B7280', poi: '#F97316', favorite: '#6D28D9' };

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
  // Mantém os controles + e − visíveis, sem ficarem escondidos sob o seletor
  // de mapa (padrão/satélite/híbrido) que ocupa o canto superior esquerdo.
  map.zoomControl.setPosition('bottomright');
  map.attributionControl.setPrefix(false);
  map.setView([0, 0], 2);

  // Painéis separados: a ordem de empilhamento não depende da ordem de redesenho.
  [['shape', 410], ['traveled', 415], ['stops', 420], ['pois', 430], ['favorites', 435], ['vehicles', 440], ['user', 450]].forEach(function (p) {
    map.createPane(p[0]).style.zIndex = p[1];
  });
  var groups = {
    shape: L.layerGroup().addTo(map),
    traveled: L.layerGroup().addTo(map),
    stops: L.layerGroup().addTo(map),
    pois: L.layerGroup().addTo(map),
    favorites: L.layerGroup().addTo(map),
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
  function hit(latlng, pane, content, speech) {
    // Use um alvo HTML transparente de 44x44 px em vez de circleMarker invisível.
    // No Android/WebView ele recebe toque de forma mais confiável e mantém o
    // marcador visual separado do alvo de interação.
    var h = L.marker(latlng, {
      pane: pane,
      interactive: true,
      bubblingMouseEvents: false,
      icon: L.divIcon({ className: 'map-hit', html: '<span></span>', iconSize: [44, 44], iconAnchor: [22, 22] })
    });
    h.bindPopup(content, { maxWidth: 280, closeButton: true });
    if (speech && speech.text) {
      h.on('click', function () { post({ type: 'speak', text: speech.text }); });
      // Fechar o balão (inclusive pelo X) interrompe imediatamente a leitura.
      h.on('popupclose', function () { post({ type: 'stopSpeech' }); });
    }
    return h;
  }

  function rank(s) { return s.destination ? 3 : (s.boarding ? 2 : (s.current ? 1 : 0)); }

  function allPoints() {
    var pts = [];
    state.stopPoints.forEach(function (p) { pts.push(p); });
    state.shapePoints.forEach(function (p) { pts.push(p); });
    if (state.userPos) pts.push(state.userPos);
    // Favoritos são pontos pessoais persistentes e devem participar do enquadramento
    // inicial mesmo quando estiverem fora do raio de 1 km dos POIs de orientação.
    if (state.favoritePoints) state.favoritePoints.forEach(function (p) { pts.push(p); });
    return pts;
  }
  state.stopPoints = [];
  state.shapePoints = [];
  state.favoritePoints = [];

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

    if (sig('stops', [d.stops, colors, labels.stop, labels.address, labels.origin, labels.destination])) {
      groups.stops.clearLayers();
      state.stopPoints = [];
      // Destino por cima de tudo, depois origem, depois a parada atual. Assim,
      // num trajeto de ida e volta (origem e destino no mesmo ponto) o destino aparece.
      var order = d.stops.slice().sort(function (a, b) { return rank(a) - rank(b) || a.index - b.index; });
      order.forEach(function (s) {
        var latlng = [s.lat, s.lon];
        var roleLabel = s.destination ? labels.destination : (s.boarding ? labels.origin : labels.stop + ' ' + (s.index + 1));
        var placeName = s.name || roleLabel;
        var title = (s.destination || s.boarding) ? (s.name ? roleLabel + ': ' + s.name : roleLabel) : placeName;
        var lines = [title];
        if (!(s.destination || s.boarding) && s.name) lines.push(labels.stop + ' ' + (s.index + 1));
        if (s.address) lines.push(s.address);
        var marker;
        if (s.destination) marker = dot(latlng, 'stops', 8, colors.destination, { color: '#ffffff', weight: 2.5 });
        else if (s.boarding) marker = dot(latlng, 'stops', 8, colors.origin, { color: '#ffffff', weight: 2.5 });
        else if (s.current) marker = dot(latlng, 'stops', 6, colors.stop, { color: '#4B5563', weight: 2.5 });
        else marker = dot(latlng, 'stops', 4, colors.stop, { color: '#ffffff', weight: 1.5, fillOpacity: 0.88 });
        marker.options.interactive = false;
        groups.stops.addLayer(marker);
        groups.stops.addLayer(hit(latlng, 'stops', popupEl(lines), { type: 'stop', text: lines.filter(Boolean).join('. ') }));
        state.stopPoints.push(latlng);
      });
    }

    if (sig('shape', [d.shape, colors])) {
      groups.shape.clearLayers();
      state.shapePoints = d.shape.length > 1 ? d.shape : [];
      if (d.shape.length > 1) {
        groups.shape.addLayer(L.polyline(d.shape, { pane: 'shape', color: colors.line, weight: 4, opacity: 0.78, interactive: false }));
      }
    }

    if (sig('traveled', [d.traveledShape, colors])) {
      groups.traveled.clearLayers();
      if (d.traveledShape && d.traveledShape.length > 1) {
        groups.traveled.addLayer(L.polyline(d.traveledShape, { pane: 'traveled', color: colors.line, weight: 6, opacity: 0.9, interactive: false }));
      }
    }

    if (sig('pois', [d.pois, colors.poi, labels.poi, labels.unnamedPoi])) {
      groups.pois.clearLayers();
      d.pois.forEach(function (p) {
        var lat = Number(p.lat);
        var lon = Number(p.lon);
        if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;

        var latlng = [lat, lon];
        var categoryLabel = labels.poi && labels.poi[p.category] ? labels.poi[p.category] : labels.unnamedPoi;
        var nameLabel = p.name || labels.unnamedPoi;
        var content = popupEl([nameLabel, categoryLabel]);

        // O marcador visual e a área de toque são o MESMO objeto. Assim o POI
        // laranja não fica escondido por um hit-marker transparente sobreposto.
        var marker = L.marker(latlng, {
          pane: 'pois',
          interactive: true,
          bubblingMouseEvents: false,
          icon: L.divIcon({
            className: 'poi-marker',
            html: '<span style=\"display:block;width:14px;height:14px;border-radius:50%;background:' + colors.poi + ';border:2px solid #ffffff;box-sizing:border-box;\"></span>',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          })
        });
        marker.bindPopup(content, { maxWidth: 280, closeButton: true });
        marker.on('popupclose', function () { post({ type: 'stopSpeech' }); });
        groups.pois.addLayer(marker);
      });
    }

    if (sig('favorites', [d.favorites, labels.favorite, labels.favoriteCategories])) {
      groups.favorites.clearLayers();
      state.favoritePoints = [];
      (d.favorites || []).forEach(function (f) {
        var latlng = [f.lat, f.lon];
        state.favoritePoints.push(latlng);
        groups.favorites.addLayer(dot(latlng, 'favorites', 6, colors.favorite, { color: '#ffffff', weight: 2, fillOpacity: 0.92, interactive: false }));
        var title = f.nickname || labels.favorite;
        var category = f.category && labels.favoriteCategories && labels.favoriteCategories[f.category] ? labels.favoriteCategories[f.category] : '';
        var lines = [title, category, f.address || ''];
        groups.favorites.addLayer(hit(latlng, 'favorites', popupEl(lines), { type: 'favorite', text: [title, category, f.address || ''].filter(Boolean).join('. ') }));
      });
    }

    if (sig('vehicles', [d.vehicles, colors, labels])) {
      groups.vehicles.clearLayers();
      d.vehicles.forEach(function (v) {
        groups.vehicles.addLayer(dot(v, 'vehicles', 7, colors.line, { color: '#ffffff', weight: 2, interactive: false }));
        groups.vehicles.addLayer(hit(v, 'vehicles', popupEl([labels.line]), { type: 'vehicle', text: labels.line }));
      });
    }

    if (state.userPos) setUser(state.userPos);
    if (!state.fitted) fitAll(0);
  }

  function setUser(pos) {
    groups.user.clearLayers();
    state.userPos = pos && isFinite(pos[0]) && isFinite(pos[1]) ? pos : null;
    if (!state.userPos) return;
    var colors = state.colors;
    groups.user.addLayer(L.circleMarker(state.userPos, { pane: 'user', radius: 13, stroke: false, fillColor: colors.you, fillOpacity: 0.16, interactive: false }));
    var me = dot(state.userPos, 'user', 7, colors.you, { color: '#ffffff', weight: 2.5, interactive: false });
    groups.user.addLayer(me);
    groups.user.addLayer(hit(state.userPos, 'user', popupEl([state.labels.you]), { type: 'user', text: state.labels.you }));
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
.leaflet-popup-content { font:13px/1.35 sans-serif; margin:10px 12px; max-width:280px; width:max-content; min-width:70px; word-break:normal; overflow-wrap:anywhere; }
.map-hit { width:44px !important; height:44px !important; margin:0 !important; padding:0 !important; pointer-events:auto !important; background:transparent; border:0; }
.map-hit span { display:block; width:44px; height:44px; pointer-events:auto; }
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
