const assert = require('node:assert/strict');
const test = require('node:test');
const { worker, absolute, hash } = require('./sw-fixture');

test('install verifies a complete release, stores its manifest and never activates a waiting update automatically', async () => {
  const sw = worker(); await sw.event('install');
  assert.equal(await (await sw.fetch('./app.js')).text(), 'const value = 1;');
  assert.match(await (await sw.fetch('./pwa-manifest.js')).text(), /PWA_RELEASE/);
  assert.equal(sw.stats.skipped, 0);
});
for (const reason of ['HTTP', 'integrity', 'storage']) {
  test(`failed ${reason} staging leaves the current release intact`, async () => {
    const store = new Map([['old-release', new Map([[absolute('./app.js'), new Response('old')]])]]);
    const sw = worker({ store, failPut: reason === 'storage', network: reason === 'storage' ? undefined
      : async () => new Response('wrong file', { status: reason === 'HTTP' ? 503 : 200 }) });
    await assert.rejects(sw.event('install'));
    assert.equal(store.has(sw.key), false);
    assert.equal(await store.get('old-release').get(absolute('./app.js')).clone().text(), 'old');
    assert.equal(sw.stats.skipped, 0);
  });
}
test('known assets stay on the installed release even when the server deploys different files', async () => {
  const sw = worker(); await sw.event('install');
  sw.stats.fetches.length = 0;
  assert.equal(await (await sw.fetch('./app.js?rev=' + sw.release.id)).text(), 'const value = 1;');
  assert.equal(await (await sw.fetch('./?launch=pwa', { mode: 'navigate' })).text(), '<h1>Release A</h1>');
  assert.equal(sw.stats.fetches.length, 0);
});
test('missing pinned versions fail closed and do not create empty runtime caches', async () => {
  const sw = worker(); await sw.event('install'); const count = sw.store.size;
  assert.equal((await sw.fetch('./app.js?rev=' + 'b'.repeat(24))).status, 503);
  assert.equal((await sw.fetch('./app.js?rev=invalid')).status, 503);
  sw.store.get(sw.key).delete(absolute('./app.js'));
  assert.equal((await sw.fetch('./app.js')).status, 503);
  assert.equal(sw.store.size, count);
});
test('an old pinned asset can finish loading after another release activates', async () => {
  const sw = worker(); await sw.event('install');
  const old = sw.prefix + 'b'.repeat(24);
  sw.store.set(old, new Map([[absolute('./app.js'), new Response('previous version')]]));
  assert.equal(await (await sw.fetch('./app.js?rev=' + 'b'.repeat(24))).text(), 'previous version');
});
test('unrelated requests, other origins and writes bypass application caching', () => {
  const sw = worker();
  for (const [url, options] of [['./api', {}], ['https://cdn.example.test/lib.js', {}], ['./app.js', { method: 'POST' }], ['../other/app.js', {}]]) assert.equal(sw.fetch(url, options), undefined);
});
test('activation keeps in-use old releases; confirmed reload cleans only this app scope', async () => {
  const sw = worker(); await sw.event('install');
  const old = sw.prefix + 'b'.repeat(24), other = 'fuhui-pwa:%2Fother%2F:old';
  for (const key of [old, other, 'other-application', 'fuhui-dashboard-v68']) sw.store.set(key, new Map());
  const client = { id: 'page1', url: absolute('./') };
  sw.setClients([client]); await sw.event('activate');
  assert.equal(sw.store.has(old), true);
  assert.equal(sw.stats.claimed, 1);
  await sw.event('message', { source: client, data: { type: 'PWA_CLIENT_READY', release: sw.release.id } });
  assert.equal(sw.store.has(old), false);
  for (const key of [other, 'other-application', 'fuhui-dashboard-v68']) assert.equal(sw.store.has(key), true);
});
test('an old ready page cannot delete a waiting or installing release', async () => {
  for (const phase of ['waiting', 'installing']) {
    const sw = worker(); await sw.event('install');
    const pending = sw.prefix + 'b'.repeat(24); sw.store.set(pending, new Map()); sw.registration[phase] = {};
    const client = { id: 'page1', url: absolute('./') }; sw.setClients([client]);
    await sw.event('message', { source: client, data: { type: 'PWA_CLIENT_READY', release: sw.release.id } });
    assert.equal(sw.store.has(pending), true);
  }
});
test('a second app window blocks forced activation; unrelated apps do not', async () => {
  const sw = worker(), results = [];
  const client = { id: 'one', url: absolute('./'), postMessage: value => results.push(value) };
  sw.setClients([client, { id: 'two', url: absolute('./index.html') }]);
  await sw.event('message', { source: client, data: { type: 'PWA_ACTIVATE', requestId: 'request' } });
  assert.equal(results[0].blocked, true); assert.equal(sw.stats.skipped, 0);
  sw.setClients([client, { id: 'other', url: absolute('../other/') }]);
  await sw.event('message', { source: client, data: { type: 'PWA_ACTIVATE', requestId: 'request2' } });
  assert.equal(results[1].blocked, false); assert.equal(sw.stats.skipped, 1);
});

test('online navigation repairs an evicted cache from a complete verified release, even if the server has moved on', async () => {
  const resources = { './index.html': '<h1>Recovered B</h1>', './new.js': 'new version' };
  const release = { id: 'b'.repeat(24), assets: Object.entries(resources).map(([path, body]) => ({ path, sha256: hash(body) })) };
  const sw = worker({ network: async request => new Response(request.url.endsWith('pwa-manifest.js')
    ? 'var PWA_RELEASE = ' + JSON.stringify(release) + ';\n' : resources['./' + new URL(request.url).pathname.slice('/game/'.length)]) });
  assert.equal(await (await sw.fetch('./', { mode: 'navigate' })).text(), '<h1>Recovered B</h1>');
  assert.equal(sw.store.has(sw.key), false);
  assert.equal(await (await sw.fetch('./new.js?rev=' + release.id)).text(), 'new version');
});
test('evicted caches with an invalid or unavailable manifest fail without installing partial files', async () => {
  const sw = worker({ network: async () => new Response('<html>server error</html>') });
  assert.equal((await sw.fetch('./', { mode: 'navigate' })).status, 503);
  assert.equal(sw.store.size, 0);
});
