/*
 * Build the Capacitor web bundle (Update 13 — iPhone groundwork).
 *
 * Capacitor packages a single web directory into the native app shell.
 * This repo keeps its sources at the root (no build step for the browser),
 * so this script simply copies the shippable files into www/ — which is
 * what capacitor.config.json points at. Run via `npm run build:www`
 * (or automatically by `npm run ios:add` / `npm run ios:sync`).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');

const SHIP = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'assets'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const entry of SHIP) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) {
    console.error(`build:www — missing ${entry}`);
    process.exit(1);
  }
  fs.cpSync(src, path.join(out, entry), { recursive: true });
}
console.log(`build:www — copied ${SHIP.join(', ')} → www/`);
