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
const { buildMapData, buildPageCall, normalizeBaseUrl, evaluateShape, MAP_MARKER_COLORS } = loadTs('mapPayload.ts');

const BASE_URL = 'https://guiamobi.app/';
const colors = { line: '#1852A4', ...MAP_MARKER_COLORS };
const labels = {
  line: 'Linha 875', you: 'Você', origin: 'Origem', destination: 'Destino', stop: 'Parada', address: 'Endereço',
  mapUnavailable: 'MAPA INDISPONÍVEL',
};

// Paradas reais de exemplo (região de São Paulo)
const STOPS = [
  { latitude: -23.5505, longitude: -46.6333, name: 'Sé' },
  { latitude: -23.5613, longitude: -46.6565, name: 'Av. Paulista' },
  { latitude: -23.5874, longitude: -46.6576, name: 'Ibirapuera' },
];
// Traçado sintético que SEGUE "ruas": degraus de quarteirão com vértice a cada ~20 m
// (um shape real de GTFS/OTP tem esse perfil). Não é uma reta entre paradas.
function streetShape(points, stepDeg = 0.0002) {
  const out = [];
  for (let i = 1; i < points.length; i += 1) {
    let { latitude: lat, longitude: lon } = points[i - 1];
    const target = points[i];
    out.push({ latitude: lat, longitude: lon });
    let alongLat = true, guard = 0;
    while ((Math.abs(lat - target.latitude) > stepDeg || Math.abs(lon - target.longitude) > stepDeg) && guard++ < 20000) {
      // anda ~500 m numa direção, depois dobra a esquina
      for (let k = 0; k < 25; k += 1) {
        if (alongLat && Math.abs(lat - target.latitude) > stepDeg) lat += Math.sign(target.latitude - lat) * stepDeg;
        else if (!alongLat && Math.abs(lon - target.longitude) > stepDeg) lon += Math.sign(target.longitude - lon) * stepDeg;
        else break;
        out.push({ latitude: lat, longitude: lon });
      }
      alongLat = !alongLat;
    }
    out.push({ latitude: target.latitude, longitude: target.longitude });
  }
  return out;
}
const SHAPE = streetShape(STOPS);

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
  assert.ok(fills.includes(colors.origin), 'origem em azul claro');
  assert.ok(fills.includes(colors.destination), 'destino em verde');
  assert.ok(fills.includes(colors.stop), 'parada comum em cinza neutro');
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
  assert.ok(texts.includes('Parada 1 - SéOrigem'));
  assert.ok(texts.includes('Parada 2 - Av. PaulistaEndereço: Av. Paulista, 1000'));
  assert.ok(texts.includes('Parada 3 - IbirapueraDestino'));
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

/* ======================= Traçado real, sem fallback ======================= */

const stopsOnly = STOPS.map(({ latitude, longitude }) => ({ latitude, longitude }));

test('evaluateShape: aceita só geometria real de rua', () => {
  assert.equal(evaluateShape(SHAPE, stopsOnly).status, 'ok');
  assert.ok(evaluateShape(SHAPE, stopsOnly).points.length > 50);
});

test('evaluateShape: sem shape / 1 ponto / lixo -> "missing", sem pontos', () => {
  for (const bad of [undefined, null, [], [stopsOnly[0]], [{ latitude: NaN, longitude: 1 }, { latitude: 1, longitude: NaN }]]) {
    const r = evaluateShape(bad, stopsOnly);
    assert.equal(r.status, 'missing');
    assert.deepEqual(r.points, []);
  }
});

test('evaluateShape: shape feito só das paradas é rejeitado (não é trajeto)', () => {
  const r = evaluateShape(stopsOnly, stopsOnly);
  assert.equal(r.status, 'derived-from-stops');
  assert.deepEqual(r.points, []);
  // ida e volta (mesma parada repetida) também
  assert.equal(evaluateShape([stopsOnly[0], stopsOnly[1], stopsOnly[0]], stopsOnly).status, 'derived-from-stops');
});

test('evaluateShape: poucos vértices com retas longas é rejeitado como grosseiro', () => {
  const coarse = [{ latitude: -23.5505, longitude: -46.6333 }, { latitude: -23.56, longitude: -46.66 }, { latitude: -23.6, longitude: -46.7 }];
  const r = evaluateShape(coarse, []);
  assert.equal(r.status, 'too-coarse');
  assert.deepEqual(r.points, []);
});

test('Linha 103 (Terminal Central -> Costinha -> Terminal Central) sem shape: nenhuma linha é desenhada', () => {
  const terminal = { latitude: -23.17889, longitude: -45.88694, name: 'Terminal Central' };
  const costinha = { latitude: -23.09007, longitude: -45.92573, name: 'Costinha' };
  const { win, GM } = openPage();
  const data = buildMapData({
    stops: [terminal, costinha, terminal], shape: undefined, boardingIndex: 0, destinationIndex: 1, colors, labels,
  });
  assert.equal(data.shapeStatus, 'missing');
  assert.deepEqual(data.shape, []);
  GM.setData(data);
  assert.equal(paneCount(win, 'shape'), 0, 'NENHUMA reta entre as paradas');
  assert.ok(paneCount(win, 'stops') >= 4, 'as paradas continuam aparecendo');
  assert.equal(win.document.querySelectorAll('.leaflet-overlay-pane path[stroke="' + colors.line + '"]').length, 0);
});

test('buildMapData: mesmo se a tela mandar o shape = paradas, nada é desenhado', () => {
  const { win, GM } = openPage();
  const data = buildMapData({ stops: STOPS, shape: stopsOnly, colors, labels });
  assert.equal(data.shapeStatus, 'derived-from-stops');
  GM.setData(data);
  assert.equal(paneCount(win, 'shape'), 0);
});

test('com shape real: a linha aparece e acompanha os vértices (não a reta entre paradas)', () => {
  const { win, GM } = openPage();
  const data = buildMapData({ stops: STOPS, shape: SHAPE, colors, labels });
  assert.equal(data.shapeStatus, 'ok');
  assert.ok(data.shape.length > 50);
  GM.setData(data);
  assert.equal(paneCount(win, 'shape'), 1);
  // (o atributo "d" do SVG é simplificado pelo Leaflet conforme o zoom; confere a geometria da polilinha)
  const lines = [];
  GM._map.eachLayer((l) => { if (l instanceof win.L.Polyline && !(l instanceof win.L.CircleMarker)) lines.push(l); });
  assert.equal(lines.length, 1);
  const latlngs = lines[0].getLatLngs();
  assert.equal(latlngs.length, data.shape.length, 'todos os vértices do shape real foram usados');
  assert.ok(latlngs.length > 50, 'muitos vértices, não 2 pontos ligando as paradas');
});

test('trocar para sem-shape depois de ter shape remove a linha (sem resíduo)', () => {
  const { win, GM } = openPage();
  GM.setData(buildMapData({ stops: STOPS, shape: SHAPE, colors, labels }));
  assert.equal(paneCount(win, 'shape'), 1);
  GM.setData(buildMapData({ stops: STOPS, shape: undefined, colors, labels }));
  assert.equal(paneCount(win, 'shape'), 0);
});

/* ============================ Cores dos marcadores ============================ */

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a, b) => Math.hypot(...hex(a).map((v, i) => v - hex(b)[i]));

test('Você / Origem / Destino têm cores bem distintas entre si e das paradas comuns', () => {
  const set = { you: colors.you, origin: colors.origin, destination: colors.destination, stop: colors.stop };
  const names = Object.keys(set);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      assert.ok(dist(set[names[i]], set[names[j]]) > 90, `${names[i]} x ${names[j]} muito parecidos`);
    }
  }
  // "Você" é azul ESCURO e "Origem" azul CLARO
  const lum = (h) => 0.299 * hex(h)[0] + 0.587 * hex(h)[1] + 0.114 * hex(h)[2];
  assert.ok(lum(colors.you) < 70, 'Você escuro');
  assert.ok(lum(colors.origin) > 150, 'Origem claro');
  assert.ok(hex(colors.destination)[1] > hex(colors.destination)[0] && hex(colors.destination)[1] > hex(colors.destination)[2], 'Destino verde');
});

test('marcadores no mapa usam exatamente as cores combinadas (Você escuro, Origem claro com aro, Destino verde)', () => {
  const { win, GM } = openPage();
  GM.setData(dataFor());
  GM.setUser([-23.552, -46.636]);
  const fill = (pane) => [...win.document.querySelectorAll(`.leaflet-${pane}-pane path`)].map((p) => [p.getAttribute('fill'), p.getAttribute('stroke')]);
  const stops = fill('stops');
  assert.ok(stops.some(([f, st]) => f === colors.origin && st === colors.originRing), 'origem: azul claro + aro azul-escuro');
  assert.ok(stops.some(([f]) => f === colors.destination), 'destino verde');
  assert.ok(!stops.some(([f]) => f === colors.you), 'nenhuma parada usa a cor do usuário');
  assert.ok(fill('user').some(([f]) => f === colors.you), 'usuário azul escuro');
});

test('ida e volta: origem e destino no mesmo ponto -> o destino fica por cima', () => {
  const { win, GM } = openPage();
  const t = { latitude: -23.17889, longitude: -45.88694, name: 'Terminal Central' };
  GM.setData(buildMapData({
    stops: [t, { latitude: -23.09, longitude: -45.925, name: 'Costinha' }, t], boardingIndex: 0, destinationIndex: 2, colors, labels,
  }));
  const paths = [...win.document.querySelectorAll('.leaflet-stops-pane path')];
  const idxOrigin = paths.findIndex((p) => p.getAttribute('fill') === colors.origin);
  const idxDest = paths.findIndex((p) => p.getAttribute('fill') === colors.destination);
  assert.ok(idxOrigin >= 0 && idxDest > idxOrigin, 'destino desenhado depois (acima) da origem');
});

test('legenda do RouteMap usa as MESMAS constantes de cor que o mapa', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'RouteMap.tsx'), 'utf8');
  for (const k of ['you', 'origin', 'originRing', 'destination']) assert.match(src, new RegExp(`MAP_MARKER_COLORS\\.${k}`), k);
  assert.match(src, /\.\.\.MAP_MARKER_COLORS/, 'mapa recebe as mesmas cores');
  assert.match(src, /hasRealShape \? \(/, 'item "Linha" da legenda só existe com traçado real');
  assert.match(src, /routeDetail\.shapeUnavailable/, 'aviso de traçado indisponível');
});
