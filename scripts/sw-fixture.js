const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const scope = 'https://example.test/game/';
const absolute = relative => new URL(relative, scope).href;

function worker({ resources = { './index.html': '<h1>Release A</h1>', './app.js': 'const value = 1;' },
  release = { id: 'a'.repeat(24), assets: Object.entries(resources).map(([path, body]) => ({ path, sha256: hash(body) })) },
  network, failPut = false, store = new Map() } = {}) {
  const listeners = {}, stats = { fetches: [], skipped: 0, claimed: 0 };
  let clients = [];
  const registration = { scope, installing: null, waiting: null };
  const caches = {
    keys: async () => [...store.keys()], has: async name => store.has(name), delete: async name => store.delete(name),
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const entries = store.get(name);
      return {
        async put(url, response) { if (failPut) throw new Error('Quota exceeded'); entries.set(typeof url === 'string' ? url : url.url, response.clone()); },
        async match(url) { return entries.get(typeof url === 'string' ? url : url.url)?.clone(); },
      };
    },
  };
  const context = vm.createContext({ PWA_RELEASE: release, URL, Request, Response, crypto: webcrypto, caches,
    importScripts: () => {},
    fetch: async request => {
      stats.fetches.push(request.url);
      return network ? network(request) : new Response(resources['./' + new URL(request.url).pathname.slice('/game/'.length)], { status: 200 });
    },
    self: { registration, clients: { matchAll: async () => clients, claim: async () => { stats.claimed++; } },
      skipWaiting: async () => { stats.skipped++; }, addEventListener: (type, handler) => { listeners[type] = handler; } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), context);
  async function event(type, data = {}) {
    const waits = []; listeners[type]({ ...data, waitUntil: value => waits.push(value) });
    await Promise.all(waits);
  }
  return { caches, store, stats, registration, release, absolute, event,
    key: vm.runInContext('CACHE', context), prefix: vm.runInContext('PREFIX', context), setClients: value => { clients = value; },
    fetch(url, options = {}) {
      let result;
      listeners.fetch({ request: { url: absolute(url), method: 'GET', mode: 'cors', ...options }, respondWith: value => { result = value; } });
      return result;
    },
  };
}
module.exports = { worker, hash, absolute };
