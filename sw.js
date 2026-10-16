importScripts('./pwa-manifest.js');
const RELEASE = PWA_RELEASE;
if (!RELEASE?.id) throw new Error('Build the PWA before installing its service worker');
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'fuhui-pwa:' + encodeURIComponent(SCOPE.pathname) + ':';
const CACHE = PREFIX + RELEASE.id;
const absolute = path => new URL(path, SCOPE).href;
const assets = new Set(RELEASE.assets.map(asset => absolute(asset.path)));
assets.add(absolute('./pwa-manifest.js'));
const unavailable = () => new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
const isAppClient = client => {
  const url = new URL(client.url);
  return url.origin === SCOPE.origin && [SCOPE.pathname, SCOPE.pathname + 'index.html'].includes(url.pathname);
};
const appClients = async () => (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(isAppClient);
async function cleanOldCaches() {
  for (const key of await caches.keys()) {
    // 活躍舊頁面回報就緒時，不能誤刪正在下載或等待套用的新版本。
    if (self.registration.installing || self.registration.waiting) return;
    if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  }
}

async function precache(release) {
  // 全部下載、檢查內容後才寫入新版本，舊版本的快取不會被修改。
  const downloaded = await Promise.all(release.assets.map(async asset => {
    const response = await fetch(new Request(absolute(asset.path), { cache: 'no-store' }));
    if (!response.ok || response.type === 'opaque') throw new Error('Asset unavailable: ' + asset.path);
    const bytes = await response.clone().arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== asset.sha256) throw new Error('Asset changed during installation: ' + asset.path);
    return [absolute(asset.path), response];
  }));
  const key = PREFIX + release.id, existed = await caches.has(key);
  try {
    const cache = await caches.open(key);
    for (const [url, response] of downloaded) await cache.put(url, response);
    await cache.put(absolute('./pwa-manifest.js'), new Response('var PWA_RELEASE = ' + JSON.stringify(release) + ';\n', { headers: { 'Content-Type': 'text/javascript' } }));
    return cache;
  } catch (error) { if (!existed) await caches.delete(key); throw error; }
}
self.addEventListener('install', event => { event.waitUntil(precache(RELEASE)); });

let recovering;
function recoverNavigation() {
  if (recovering) return recovering;
  recovering = (async () => {
    // 儲存空間回收後重新取得一整套版本；不能只撿回 HTML 再混用其他版的檔案。
    const response = await fetch(new Request(absolute('./pwa-manifest.js'), { cache: 'no-store' }));
    if (!response.ok) throw new Error('Release manifest unavailable');
    const match = /^var PWA_RELEASE = (\{[^\n]+\});\n?$/.exec(await response.text());
    if (!match) throw new Error('Invalid release manifest');
    const release = JSON.parse(match[1]);
    if (!/^[a-f\d]{24}$/.test(release.id) || !Array.isArray(release.assets) || !release.assets.some(asset => asset.path === './index.html')) throw new Error('Invalid release');
    for (const asset of release.assets) {
      const url = new URL(asset.path, SCOPE);
      if (!asset.path.startsWith('./') || !url.href.startsWith(SCOPE.href) || url.search || !/^[a-f\d]{64}$/.test(asset.sha256)) throw new Error('Invalid release asset');
    }
    return (await precache(release)).match(absolute('./index.html'));
  })().catch(() => unavailable()).finally(() => { recovering = null; });
  return recovering;
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // 還有舊頁面時先保留其版本，等新頁面存檔／重載完成後再清除。
    if (!(await appClients()).length) await cleanOldCaches();
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (!event.source || !isAppClient(event.source)) return;
  if (event.data?.type === 'PWA_ACTIVATE') {
    event.waitUntil((async () => {
      const clients = await appClients();
      const blocked = clients.some(client => client.id !== event.source.id);
      event.source.postMessage({ type: 'PWA_ACTIVATE_RESULT', requestId: event.data.requestId, blocked });
      if (!blocked) await self.skipWaiting();
    })());
  } else if (event.data?.type === 'PWA_CLIENT_READY' && event.data.release === RELEASE.id) {
    event.waitUntil((async () => {
      const clients = await appClients();
      if (clients.length === 1 && clients[0].id === event.source.id) await cleanOldCaches();
    })());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const revision = url.searchParams.get('rev');
  url.search = ''; url.hash = '';
  const navigation = request.mode === 'navigate' && [SCOPE.pathname, SCOPE.pathname + 'index.html'].includes(url.pathname);
  if (!navigation && !revision && !assets.has(url.href)) return;
  event.respondWith((async () => {
    if (revision && !/^[a-f\d]{24}$/.test(revision)) return unavailable();
    const key = PREFIX + (revision || RELEASE.id);
    if (!await caches.has(key)) return navigation && !revision ? recoverNavigation() : unavailable();
    const cache = await caches.open(key);
    // 只用指定版本，缺檔不以網路上另一版的 JS／語系湊數，也不擴張 runtime cache。
    const cached = await cache.match(navigation ? absolute('./index.html') : url.href);
    return cached || (navigation && !revision ? recoverNavigation() : unavailable());
  })());
});
