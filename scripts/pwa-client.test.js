const assert = require('node:assert/strict');
const test = require('node:test');
const PwaClient = require('../pwa-client');
class Target {
  constructor() { this.handlers = new Map(); }
  addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); }
  removeEventListener(type, fn) { this.handlers.get(type)?.delete(fn); }
  emit(type, event = {}) { for (const fn of this.handlers.get(type) || []) fn(event); }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const bus = new Target(), events = new Target(), waiting = new Target(), registration = new Target();
  const requests = [], states = [], timers = new Map(); let nextTimer = 0;
  const f = { saved: true, allowed: true, saves: 0, reloads: 0, registered: 0 };
  waiting.state = 'installed'; waiting.postMessage = request => requests.push(request);
  registration.waiting = waiting; registration.installing = null; registration.update = async () => {};
  bus.controller = { postMessage: () => {} };
  bus.register = async () => { f.registered++; return registration; }; bus.getRegistration = async () => registration;
  const client = PwaClient.create({ serviceWorker: bus, release: { id: 'a'.repeat(24) }, events,
    canReload: () => f.allowed, beforeReload: () => { f.saves++; return f.saved; },
    reload: () => f.reloads++, onStatus: state => states.push(state.kind),
    setTimeout(fn, delay) { const id = ++nextTimer; if (!delay) queueMicrotask(fn); else timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return { ...f, client, bus, events, waiting, registration, requests, states, timers, flags: f,
    respond(blocked) { bus.emit('message', { source: waiting, data: { type: 'PWA_ACTIVATE_RESULT', requestId: requests.at(-1).requestId, blocked } }); },
    async activated() { bus.emit('controllerchange'); await flush(); },
  };
}
test('registration is idempotent, bypasses script HTTP cache and waiting updates never activate automatically', async () => {
  const f = fixture(); let options;
  f.bus.register = async (_, value) => { options = value; f.flags.registered++; return f.registration; };
  await Promise.all([f.client.start(), f.client.start()]);
  assert.equal(f.flags.registered, 1); assert.equal(options.updateViaCache, 'none');
  assert.equal(f.client.status().kind, 'available'); assert.equal(f.requests.length, 0); assert.equal(f.flags.reloads, 0);
});
test('later remains deferred during update checks, but a newer waiting worker is offered', async () => {
  const f = fixture(); await f.client.start(); f.client.defer(); await f.client.check();
  assert.equal(f.client.status().kind, 'deferred');
  f.registration.waiting = new Target(); await f.client.check();
  assert.equal(f.client.status().kind, 'available'); assert.equal(f.flags.saves, 0);
});
test('an update flushes storage before activation and once more before reloading, with no timer changes', async () => {
  const f = fixture(); await f.client.start(); await f.client.apply();
  assert.equal(f.flags.saves, 1); assert.equal(f.requests.length, 1); assert.equal(f.flags.reloads, 0);
  f.respond(false); await f.activated(); await f.activated();
  assert.equal(f.flags.saves, 2); assert.equal(f.flags.reloads, 1);
});
for (const reason of ['dialog', 'storage']) {
  test(`${reason} blocks activation without reloading or discarding current work`, async () => {
    const f = fixture(); await f.client.start();
    f.flags.allowed = reason !== 'dialog'; f.flags.saved = reason !== 'storage';
    assert.equal(await f.client.apply(), false); assert.equal(f.requests.length, 0);
    assert.equal(f.client.status().kind, reason === 'dialog' ? 'busy' : 'save-failed');
  });
}
for (const reason of ['storage', 'dialog']) {
  test(`${reason} changing during activation preserves the open page and can retry the reload`, async () => {
    const f = fixture(); await f.client.start(); await f.client.apply();
    f.flags.saved = reason !== 'storage'; f.flags.allowed = reason !== 'dialog';
    await f.activated(); assert.equal(f.flags.reloads, 0); assert.equal(f.client.status().kind, reason === 'storage' ? 'save-failed' : 'busy');
    f.flags.saved = true; f.flags.allowed = true; await f.client.apply(); assert.equal(f.flags.reloads, 1);
  });
}
test('another window blocks activation and a second attempt can proceed after it closes', async () => {
  const f = fixture(); await f.client.start(); await f.client.apply();
  f.respond(true); assert.equal(f.client.status().kind, 'blocked'); assert.equal(f.flags.reloads, 0);
  await f.client.apply(); f.respond(false); await f.activated();
  assert.equal(f.requests.length, 2); assert.equal(f.flags.reloads, 1);
});
test('double clicks and unrelated worker messages cannot apply an update twice', async () => {
  const f = fixture(); await f.client.start(); const first = f.client.apply(); const second = f.client.apply();
  await Promise.all([first, second]); assert.equal(f.requests.length, 1);
  f.bus.emit('message', { source: {}, data: { type: 'PWA_ACTIVATE_RESULT', requestId: f.requests[0].requestId, blocked: true } });
  assert.equal(f.client.status().kind, 'applying'); await f.activated(); assert.equal(f.flags.reloads, 1);
});
test('controller changes that were not requested never force a game to reload', async () => {
  const f = fixture(); await f.client.start(); await f.activated();
  assert.equal(f.flags.reloads, 0); assert.equal(f.flags.saves, 0);
});
test('an activation timeout does not cause a late automatic reload', async () => {
  const f = fixture(); await f.client.start(); await f.client.apply();
  for (const fn of f.timers.values()) fn();
  assert.equal(f.client.status().kind, 'update-failed'); await f.activated(); assert.equal(f.flags.reloads, 0);
  await f.client.apply(); assert.equal(f.flags.reloads, 1);
});
test('offline registration can observe an installed waiting worker; failed registration remains retryable', async () => {
  const f = fixture(); f.bus.register = async () => { throw new Error('offline'); };
  await f.client.start(); assert.equal(f.client.status().kind, 'available');
  const other = fixture(); other.bus.register = async () => { throw new Error('offline'); }; other.bus.getRegistration = async () => null;
  await other.client.start(); assert.equal(other.client.status().kind, 'failed');
  other.bus.register = async () => other.registration; await other.client.start(); assert.equal(other.client.status().kind, 'available');
});
test('dispose removes observers and a late registration does not add new ones', async () => {
  const f = fixture(); let finish;
  f.bus.register = () => new Promise(resolve => { finish = resolve; });
  const pending = f.client.start(); f.client.dispose(); finish(f.registration); await pending;
  assert.equal(f.registration.handlers.size, 0);
  f.bus.emit('controllerchange'); assert.equal(f.flags.reloads, 0);
});

test('a first-install failure clears the failed registration so retry registers again', async () => {
  const f = fixture(), installing = new Target();
  f.bus.controller = null; f.registration.waiting = null; f.registration.installing = installing;
  await f.client.start(); assert.equal(f.client.status().kind, 'installing');
  f.registration.installing = null; installing.state = 'redundant'; installing.emit('statechange');
  assert.equal(f.client.status().kind, 'failed');
  f.registration.waiting = f.waiting; await f.client.start();
  assert.equal(f.flags.registered, 2); assert.equal(f.client.status().kind, 'available');
});
test('a registration that already lost its installing worker is reported as failed and remains retryable', async () => {
  const f = fixture(); f.bus.controller = null; f.registration.waiting = null;
  await f.client.start(); assert.equal(f.client.status().kind, 'failed');
  f.registration.waiting = f.waiting; await f.client.start(); assert.equal(f.flags.registered, 2);
});

test('source development mode and unsupported service workers never register or reload', async () => {
  const bus = new Target(); bus.controller = { postMessage: () => { throw new Error('Should not message'); } };
  bus.register = () => { throw new Error('Should not register'); };
  for (const serviceWorker of [bus, null]) {
    const client = PwaClient.create({ serviceWorker, release: null, events: new Target(), reload: () => { throw new Error('Should not reload'); } });
    assert.equal(await client.start(), null); assert.equal(await client.apply(), false);
    bus.emit('controllerchange'); assert.equal(client.status().kind, 'idle'); client.dispose();
  }
});
