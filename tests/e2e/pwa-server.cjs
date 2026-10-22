const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('../../scripts/build.cjs');

async function createServer({ legacy = false } = {}) {
  const root = path.resolve(__dirname, '../..');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-pwa-e2e-'));
  const source = path.join(temporary, 'source'); fs.mkdirSync(source);
  for (const name of fs.readdirSync(root)) if (/\.(js|css|html|webmanifest)$/.test(name)) fs.copyFileSync(path.join(root, name), path.join(source, name));
  for (const folder of ['icons', 'locales', 'vendor']) fs.cpSync(path.join(root, folder), path.join(source, folder), { recursive: true });
  const folders = { a: path.join(temporary, 'a'), b: path.join(temporary, 'b') };
  const a = build({ source, output: folders.a, env: {} });
  if (legacy) {
    // 第七階段前的核心快取策略：network-first、同版覆寫、安裝後直接接管。
    fs.writeFileSync(path.join(folders.a, 'sw.js'), `
      const CACHE='fuhui-dashboard-v${a.build}';
      const ASSETS=${JSON.stringify([...a.assets.map(asset => asset.path), './pwa-manifest.js'])};
      self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
      self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
      self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{
        if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;
      }).catch(()=>caches.match(e.request)));});
    `);
  }
  fs.writeFileSync(path.join(source, 'version.js'), fs.readFileSync(path.join(source, 'version.js'), 'utf8').replace(/APP_BUILD = \d+/, 'APP_BUILD = ' + (a.build + 1)));
  const b = build({ source, output: folders.b, env: {} });
  let published = 'a', fault = null;
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/game/')) { response.writeHead(404).end(); return; }
    const relative = url.pathname.slice('/game/'.length) || 'index.html';
    const file = path.resolve(folders[published], relative);
    if (!file.startsWith(folders[published] + path.sep)) { response.writeHead(403).end(); return; }
    if (fault && relative === 'ui-weather.js' && !url.searchParams.has('rev')) { response.writeHead(fault === 'http' ? 503 : 200, { 'Content-Type': 'text/javascript' }).end('// incomplete deployment'); return; }
    try {
      response.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(fs.readFileSync(file));
    } catch (_) { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/game/`, releases: { a, b },
    publish(value, failure = null) { published = value; fault = failure; },
    async close() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); fs.rmSync(temporary, { recursive: true, force: true }); },
  };
}
module.exports = { createServer };
