#!/usr/bin/env node
// Build step shared by local dev and CI.
//  1. Copies web/engine.js and web/core.js to apps-script/Engine.gs and Core.gs,
//     so the browser and the Sheet always run the same logic (never edit the .gs copies).
//  2. With --stamp, writes a build version into web/ so phones pick up the update.
//  3. With --staging, points web/config.js at the staging /exec URL (for local testing only).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const web = p => path.join(root, 'web', p);
const gs = p => path.join(root, 'apps-script', p);
const args = process.argv.slice(2);

const HEADER = '// GENERATED from web/%s by scripts/build.js. Do not edit here.\n';
for (const [src, dst] of [['engine.js', 'Engine.gs'], ['core.js', 'Core.gs']]) {
  if (!fs.existsSync(web(src))) { console.warn('skip: web/' + src + ' not found'); continue; }
  fs.writeFileSync(gs(dst), HEADER.replace('%s', src) + fs.readFileSync(web(src), 'utf8'));
  console.log('built apps-script/' + dst);
}

if (args.includes('--stamp')) {
  const v = process.env.BUILD_VERSION ||
    new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  // The service worker's cache name is the app version: changing it makes phones update.
  const sw = web('sw.js');
  const src = fs.readFileSync(sw, 'utf8');
  const out = src.replace(/var VERSION = '[^']*';/, "var VERSION = 'flight-b" + v + "';");
  if (out === src) throw new Error("web/sw.js: no `var VERSION = '...'` line to stamp");
  fs.writeFileSync(sw, out);
  console.log('stamped web/sw.js flight-b' + v);
}

if (args.includes('--staging')) {
  const url = process.env.STAGING_API_URL;
  if (!url) throw new Error('Set STAGING_API_URL to the staging /exec URL');
  fs.writeFileSync(web('config.js'),
    "window.FLIGHT_CONFIG = { apiUrl: '" + url + "' }; // STAGING, do not commit\n");
  console.log('web/config.js now points at STAGING');
}
