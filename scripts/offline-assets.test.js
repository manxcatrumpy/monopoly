const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
test('offline install caches every local script used by the page', async () => {
  const listeners = {};
  let cachedAssets;
  const context = vm.createContext({
    importScripts: () => {},
    self: { addEventListener: (type, handler) => { listeners[type] = handler; }, skipWaiting: () => {} },
    caches: { open: async () => ({ addAll: async assets => { cachedAssets = assets; } }) },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'version.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), context);
  let installation;
  listeners.install({ waitUntil: task => { installation = task; } });
  await installation;
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script src="(\.\/[^"]+)"/g), match => match[1]);
  assert.ok(scripts.includes('./game-rules.js'));
  assert.ok(scripts.indexOf('./game-rules.js') < scripts.indexOf('./app.js'));
  for (const script of scripts) {
    assert.ok(cachedAssets.includes(script), script + ' must be cached for offline use');
    assert.ok(fs.existsSync(path.join(root, script)), script + ' must exist');
  }
});
