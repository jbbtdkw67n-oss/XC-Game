// Offline install check: the service worker must precache every script and
// stylesheet index.html loads, or an installed (home-screen) copy breaks the
// first time it runs offline. No browser needed.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const loaded = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+\.(?:js|css))"/g)]
  .map((m) => m[1].replace(/^\.\//, ''))
  .filter((p) => !/^https?:/.test(p));
const cached = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));

const missing = loaded.filter((p) => !cached.has(p));
const stale = [...cached].filter((p) => /\.(js|css)$/.test(p) && !fs.existsSync(path.join(root, p)));

const fails = [];
if (!loaded.length) fails.push('no scripts found in index.html');
if (missing.length) fails.push('sw.js does not precache: ' + missing.join(', '));
if (stale.length) fails.push('sw.js precaches files that do not exist: ' + stale.join(', '));
console.log(`index.html loads ${loaded.length} scripts/styles; sw.js precaches ${cached.size} assets`);
console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'PASS');
process.exit(fails.length ? 1 : 0);
