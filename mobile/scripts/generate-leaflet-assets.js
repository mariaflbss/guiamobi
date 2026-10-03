/**
 * Gera src/components/map/leafletAssets.ts a partir do pacote npm `leaflet`.
 *
 * Por quê: o mapa (US09) roda dentro de um WebView e antes carregava o Leaflet
 * de um CDN (unpkg). Se o CDN falhar ou estiver bloqueado, o mapa inteiro some.
 * Embutindo o código no app, só os "tiles" (imagens do mapa) dependem de rede.
 *
 * Uso (só é preciso rodar ao atualizar a versão do Leaflet):
 *   npm run map:assets
 */
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist');
const pkg = require('leaflet/package.json');
const js = fs.readFileSync(path.join(dist, 'leaflet.js'), 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
const css = fs.readFileSync(path.join(dist, 'leaflet.css'), 'utf8');

if (js.includes('</script')) throw new Error('leaflet.js contém </script>; não é seguro embutir em HTML.');

const out = `/* eslint-disable */
// ARQUIVO GERADO por scripts/generate-leaflet-assets.js - não edite à mão.
// Leaflet ${pkg.version} (BSD-2-Clause) - https://leafletjs.com
export const LEAFLET_VERSION = ${JSON.stringify(pkg.version)};
export const LEAFLET_CSS = ${JSON.stringify(css)};
export const LEAFLET_JS = ${JSON.stringify(js)};
`;

const target = path.join(__dirname, '..', 'src', 'components', 'map', 'leafletAssets.ts');
fs.writeFileSync(target, out);
console.log(`Gerado ${path.relative(process.cwd(), target)} (Leaflet ${pkg.version}, ${(out.length / 1024).toFixed(0)} KB)`);
