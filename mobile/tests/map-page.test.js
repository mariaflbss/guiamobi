/**
 * Teste da página do mapa (US09) em DOM simulado (jsdom).
 *
 * Carrega o MESMO HTML que o WebView recebe (Leaflet embutido + script do mapa)
 * e exercita a API usada pelo React Native: paradas, linha, POIs, veículos,
 * GPS do usuário, camadas (padrão/satélite/híbrido), reserva de servidores de
 * tiles e proteção contra HTML injetado.
 *
 * Rodar: npm run test:map
 * Limite: jsdom não é o Chromium do Android; este teste valida a lógica e o DOM,
 * não o download real dos tiles (isso depende de rede/dispositivo).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

// ---- carrega os módulos TS (mapHtml / mapPayload) sem Metro ----
function loadTs(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'map', file), 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
  const mod = { exports: {} };
  const localRequire = (name) => (name.startsWith('./') ? loadTs(name.replace('./', '') + (name.endsWith('.ts') ? '' : '.ts')) : require(name));
  new Function('exports', 'require', 'module', out.outputText)(mod.exports, localRequire, mod);
  return mod.exports;
}
const { MAP_HTML } = loadTs('mapHtml.ts');
const { buildMapData, buildPageCall, normalizeBaseUrl } = loadTs('mapPayload.ts');

const BASE_URL = 'https://guiamobi.app/';
const colors = { primary: '#1D5FD0', primaryDark: '#123F8E', success: '#16794C', origin: '#7C3AED' };
const labels = { line: 'Linha 875', you: 'Você', origin: 'Origem', stop: 'Parada', address: 'Endereço', mapUnavailable: 'MAPA INDISPONÍVEL' };

// Paradas reais de exemplo (região de São Paulo)
const STOPS = [
  { latitude: -23.5505, longitude: -46.6333, name: 'Sé' },
  { latitude: -23.5613, longitude: -46.6565, name: 'Av. Paulista' },
  { latitude: -23.5874, longitude: -46.6576, name: 'Ibirapuera' },
];
const SHAPE = [
  { latitude: -23.5505, longitude: -46.6333 },
  { latitude: -23.5560, longitude: -46.6450 },
  { latitude: -23.5613, longitude: -46.6565 },
  { latitude: -23.5874, longitude: -46.6576 },
];

function dataFor(extra = {}) {
  return buildMapData({
    stops: STOPS, shape: SHAPE, boardingIndex: 0, destinationIndex: 2, currentStopIndex: 1,
    currentStopAddress: 'Av. Paulista, 1000', pois: [{ id: 'p1', category: 'hospital', name: 'Hospital X', latitude: -23.556, longitude: -46.65 }],
    vehicles: [{ id: 'v1', latitude: -23.553, longitude: -46.64 }], colors, labels, ...extra,
  });
}

function openPage({ width = 400, height = 170 } = {}) {
  const sent = [];
  const size = { width, height };
  const dom = new JSDOM(MAP_HTML, {
    url: BASE_URL, runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      // jsdom não tem layout nem createSVGRect (Leaflet precisa dos dois).
      Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => size.width, configurable: true });
      Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => size.height, configurable: true });
      window.SVGSVGElement.prototype.createSVGRect = () => ({});
      window.ReactNativeWebView = { postMessage: (m) => sent.push(JSON.parse(m)) };
    },
  });
  return { dom, win: dom.window, GM: dom.window.GM, sent, size };
}

const paneCount = (win, pane) => win.document.querySelectorAll(`.leaflet-${pane}-pane path`).length;
const tiles = (win) => [...win.document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile')];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const popupLayers = (GM) => { const out = []; GM._map.eachLayer((l) => { if (l.getPopup && l.getPopup()) out.push(l); }); return out; };
const inView = (GM, [lat, lon]) => GM._map.getBounds().contains([lat, lon]);

test('HTML é autossuficiente: nenhum script/CSS de CDN', () => {
  assert.doesNotMatch(MAP_HTML, /<script[^>]+src=/i);
  assert.doesNotMatch(MAP_HTML, /<link[^>]+href=/i);
  assert.doesNotMatch(MAP_HTML, /unpkg\.com\/leaflet/);
  assert.match(MAP_HTML, /name="referrer"/);
});

test('página inicia, expõe window.GM e avisa "ready" ao React Native', () => {
  const { GM, sent } = openPage();
  assert.ok(GM && typeof GM.setData === 'function' && typeof GM.setUser === 'function' && typeof GM.setMapType === 'function');
  assert.deepEqual(sent.filter((m) => m.type === 'ready'), [{ type: 'ready' }]);
});

test('paradas, linha, POIs e veículos são desenhados nos painéis certos', () => {
  const { win, GM } = openPage();
  GM.setData(dataFor());
  assert.equal(paneCount(win, 'stops'), STOPS.length * 2, 'cada parada = marcador + alvo de toque');
  assert.equal(paneCount(win, 'shape'), 1);
  assert.equal(paneCount(win, 'pois'), 2);
  assert.equal(paneCount(win, 'vehicles'), 2);
  const fills = [...win.document.querySelectorAll('.leaflet-stops-pane path')].map((p) => p.getAttribute('fill'));
  assert.ok(fills.includes(colors.primary), 'parada atual em cor primária');
  assert.ok(fills.includes(colors.origin), 'origem em cor distinta do GPS');
  assert.ok(fills.includes(colors.success), 'destino em cor de sucesso');
});

test('sem shape do GTFS, usa as paradas como traçado de fallback', () => {
  const { win, GM } = openPage();
  GM.setData(dataFor({ shape: undefined }));
  assert.equal(paneCount(win, 'shape'), 1);
});

test('mapa enquadra todas as paradas e a linha, com margem na tela', () => {
  const { GM, size } = openPage();
  GM.setData(dataFor());
  for (const s of STOPS) {
    assert.ok(inView(GM, [s.latitude, s.longitude]), `parada ${s.name} visível`);
    const pt = GM._map.latLngToContainerPoint([s.latitude, s.longitude]);
    assert.ok(pt.x >= 20 && pt.x <= size.width - 20 && pt.y >= 20 && pt.y <= size.height - 20, `parada ${s.name} com margem (${pt.x},${pt.y})`);
  }
  // Observação: em jsdom o Leaflet usa zoom inteiro (any3d=false); no WebView real o passo é 0,5.
  assert.ok(GM._map.getZoom() >= 10 && GM._map.getZoom() <= 16);
});

test('tiles pedem o OpenStreetMap com referrerPolicy "origin"', () => {
  const { win, GM } = openPage();
  GM.setData(dataFor());
  const t = tiles(win);
  assert.ok(t.length > 0, 'há tiles na tela');
  assert.ok(t.every((img) => img.src.startsWith('https://tile.openstreetmap.org/')));
  assert.ok(t.every((img) => img.referrerPolicy === 'origin'));
});

test('GPS: marcador do usuário aparece, e enquadra usuário + paradas no primeiro sinal', () => {
  const { win, GM } = openPage();
  GM.setData(dataFor());
  const farUser = [-22.9068, -43.1729]; // Rio de Janeiro, longe da linha
  GM.setUser(farUser);
  assert.equal(paneCount(win, 'user'), 3, 'halo + ponto + alvo de toque');
  assert.ok(inView(GM, farUser), 'usuário visível');
  for (const s of STOPS) assert.ok(inView(GM, [s.latitude, s.longitude]), 'paradas continuam visíveis');
});

test('GPS: atualizações seguintes só movem o marcador, sem mexer no zoom do usuário', () => {
  const { win, GM } = openPage();
  GM.setData(dataFor());
  GM.setUser([-23.552, -46.636]);
  win.document.querySelector('#map').dispatchEvent(new win.Event('touchstart'));
  GM._map.setView([-23.5613, -46.6565], 17, { animate: false });
  GM.setUser([-23.553, -46.640]);
  GM.setData(dataFor({ vehicles: [{ id: 'v1', latitude: -23.554, longitude: -46.641 }] }));
  assert.equal(GM._map.getZoom(), 17);
  assert.equal(paneCount(win, 'user'), 3, 'sem marcadores duplicados');
});

test('setUser(null) remove o marcador', () => {
  const { win, GM } = openPage();
  GM.setData(dataFor());
  GM.setUser([-23.55, -46.63]);
  GM.setUser(null);
  assert.equal(paneCount(win, 'user'), 0);
});

test('setData idêntico não redesenha; mudar só veículos não toca nas paradas', () => {
  const { win, GM } = openPage();
  GM.setData(dataFor());
  const stopPaths = [...win.document.querySelectorAll('.leaflet-stops-pane path')];
  GM.setData(dataFor());
  GM.setData(dataFor({ vehicles: [{ id: 'v1', latitude: -23.56, longitude: -46.65 }] }));
  const after = [...win.document.querySelectorAll('.leaflet-stops-pane path')];
  assert.ok(stopPaths.every((p, i) => p === after[i]), 'mesmos elementos SVG de parada');
});

test('Padrão -> Satélite -> Híbrido -> Padrão troca as camadas', () => {
  const { win, GM } = openPage();
  GM.setData(dataFor());
  GM.setMapType('satellite');
  assert.ok(tiles(win).length > 0 && tiles(win).every((i) => i.src.includes('World_Imagery')));
  GM.setMapType('hybrid');
  const srcs = tiles(win).map((i) => i.src);
  assert.ok(srcs.some((s) => s.includes('World_Imagery')) && srcs.some((s) => s.includes('World_Boundaries_and_Places')));
  GM.setMapType('standard');
  assert.ok(tiles(win).every((i) => i.src.startsWith('https://tile.openstreetmap.org/')));
  assert.equal(paneCount(win, 'stops'), STOPS.length * 2, 'marcadores sobrevivem à troca de camada');
});

test('servidor de tiles falha -> reserva automática (OSM -> Carto -> OSM France) -> aviso -> recupera', () => {
  const { win, GM, sent } = openPage();
  GM.setData(dataFor());
  const failAll = () => tiles(win).forEach((img) => img.dispatchEvent(new win.Event('error')));
  const host = () => new URL(tiles(win)[0].src).host;

  assert.equal(host(), 'tile.openstreetmap.org');
  failAll();
  assert.match(host(), /basemaps\.cartocdn\.com$/, 'foi para o Carto');
  failAll();
  assert.equal(host(), 'tile.openstreetmap.fr', 'foi para o OSM France');
  failAll();
  const banner = win.document.getElementById('banner');
  assert.equal(banner.style.display, 'block');
  assert.equal(banner.textContent, labels.mapUnavailable);
  assert.ok(sent.some((m) => m.type === 'tiles' && m.status === 'unavailable'));
  assert.equal(paneCount(win, 'stops'), STOPS.length * 2, 'paradas continuam visíveis mesmo sem fundo');

  tiles(win)[0].dispatchEvent(new win.Event('load')); // rede voltou
  assert.equal(banner.style.display, 'none');
});

test('dados com HTML malicioso não viram HTML (popup usa textContent)', () => {
  const { win, GM } = openPage();
  const evil = '</script><img src=x onerror="window.__pwned=1">';
  GM.setData(dataFor({
    stops: [{ latitude: -23.55, longitude: -46.63, name: evil }, ...STOPS],
    currentStopAddress: evil,
    pois: [{ id: 'p', category: 'bank', name: evil, latitude: -23.556, longitude: -46.65 }],
  }));
  const layers = popupLayers(GM);
  assert.ok(layers.length >= 5, 'há popups de paradas e POI');
  for (const l of layers) {
    l.openPopup(); // abre um por vez (o Leaflet mantém só um aberto)
    assert.equal(win.document.querySelectorAll('.leaflet-popup-content img').length, 0);
    assert.ok(win.document.querySelector('.leaflet-popup-content').textContent.length > 0);
  }
  assert.equal(win.__pwned, undefined);
  const texts = layers.map((l) => l.getPopup().getContent().textContent);
  assert.ok(texts.some((t) => t.includes(evil)), 'o texto malicioso aparece como TEXTO puro');
});

test('popup da parada mostra "Parada N - nome" e o endereço da parada atual', () => {
  const { GM } = openPage();
  GM.setData(dataFor());
  const texts = popupLayers(GM).map((l) => l.getPopup().getContent().textContent);
  assert.ok(texts.includes('Parada 1 - Sé'));
  assert.ok(texts.includes('Parada 2 - Av. PaulistaEndereço: Av. Paulista, 1000'));
  assert.ok(texts.includes('Parada 3 - Ibirapuera'));
  assert.ok(texts.includes('Hospital X'));
  assert.ok(texts.includes('Linha 875'), 'veículo');
});

test('WebView sem tamanho no início: enquadra assim que o tamanho existe', async () => {
  const { GM, size } = openPage({ width: 0, height: 0 });
  GM.setData(dataFor());
  assert.equal(GM._state.fitted, false);
  size.width = 400; size.height = 170;
  await sleep(400);
  assert.equal(GM._state.fitted, true);
  for (const s of STOPS) assert.ok(inView(GM, [s.latitude, s.longitude]));
});

test('buildPageCall: JSON seguro, executável e com U+2028 escapado', () => {
  const { win, GM } = openPage();
  const weird = 'a\u2028b\u2029c"\'`${x}</script>';
  const script = buildPageCall('setData', dataFor({ currentStopAddress: weird }));
  assert.ok(!script.includes('\u2028') && !script.includes('\u2029'));
  assert.equal(win.eval(script), true);
  assert.equal(paneCount(win, 'stops'), STOPS.length * 2);
  win.eval(buildPageCall('setUser', [-23.55, -46.63]));
  win.eval(buildPageCall('setMapType', 'satellite'));
  assert.equal(paneCount(win, 'user'), 3);
  assert.equal(GM._state.mapType, 'satellite');
  assert.doesNotThrow(() => win.eval('window.GM = undefined; ' + buildPageCall('setUser', null)), 'sem GM não quebra');
});

test('normalizeBaseUrl garante "/" final', () => {
  assert.equal(normalizeBaseUrl('https://x.com'), 'https://x.com/');
  assert.equal(normalizeBaseUrl('https://x.com/'), 'https://x.com/');
});
