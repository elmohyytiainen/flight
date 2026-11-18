// Guards the one rule that keeps browser and Sheet in sync.
// Engine scenario tests (missed Fridays, plateau, run-down, ...) go in engine.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
for (const [src, dst] of [['engine.js', 'Engine.gs'], ['core.js', 'Core.gs']]) {
  test(`apps-script/${dst} matches web/${src}`, { skip: !fs.existsSync(path.join(root, 'web', src)) }, () => {
    const a = fs.readFileSync(path.join(root, 'web', src), 'utf8');
    const b = fs.readFileSync(path.join(root, 'apps-script', dst), 'utf8');
    assert.ok(b.endsWith(a), `run "npm run build" to regenerate ${dst}`);
  });
}
