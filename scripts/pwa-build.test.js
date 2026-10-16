const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('./build.cjs');
const { hash, worker } = require('./sw-fixture');
const root = path.join(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-pwa-build-'));
test.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

test('build generates a verified release containing every local page script and locale', async () => {
  const output = path.join(temporary, 'release'); const release = build({ output, env: {} });
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  for (const [, script] of html.matchAll(/<script src="(\.\/[^?]+)\?rev=[a-f\d]+"/g)) {
    if (script !== './pwa-manifest.js') assert.ok(release.assets.some(asset => asset.path === script), script);
  }
  assert.doesNotMatch(html, /https:\/\//);
  const resources = Object.fromEntries(release.assets.map(asset => {
    const bytes = fs.readFileSync(path.join(output, asset.path)); assert.equal(hash(bytes), asset.sha256);
    return [asset.path, bytes];
  }));
  for (const lang of ['zh-tw', 'zh-cn', 'en']) assert.ok(release.assets.some(asset => asset.path === './locales/cards-' + lang + '.json'));
  assert.ok(release.assets.some(asset => asset.path === './vendor/html2canvas.min.js'));
  const sw = worker({ release, resources }); await sw.event('install');
  assert.equal((await sw.fetch('./pwa-manifest.js')).status, 200);
});
test('identical builds are reproducible; preview metadata is stamped before fingerprints', () => {
  const first = build({ output: path.join(temporary, 'one'), env: {} });
  const second = build({ output: path.join(temporary, 'two'), env: {} });
  assert.equal(first.id, second.id);
  const preview = build({ output: path.join(temporary, 'preview'), env: { CF_PAGES_BRANCH: 'test', CF_PAGES_COMMIT_SHA: '1234567abcdef' } });
  assert.notEqual(first.id, preview.id); assert.equal(preview.suffix, '-1234567');
  const context = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(temporary, 'preview/pwa-manifest.js'), 'utf8'), context);
  assert.equal(context.PWA_RELEASE.id, preview.id);
});
test('changing a shipped asset without bumping the display version still produces a new release', () => {
  const source = path.join(temporary, 'source'); fs.mkdirSync(source);
  for (const name of fs.readdirSync(root)) if (/\.(html|js|css|webmanifest)$/.test(name)) fs.copyFileSync(path.join(root, name), path.join(source, name));
  for (const folder of ['icons', 'locales', 'vendor']) fs.cpSync(path.join(root, folder), path.join(source, folder), { recursive: true });
  const before = build({ source, output: path.join(temporary, 'before'), env: {} });
  fs.appendFileSync(path.join(source, 'ui-weather.js'), '\n// asset changed\n');
  const after = build({ source, output: path.join(temporary, 'after'), env: {} });
  assert.equal(before.version, after.version); assert.equal(before.build, after.build); assert.notEqual(before.id, after.id);
});
