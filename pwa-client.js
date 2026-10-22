// PWA 生命週期：等待更新、明確套用與存檔後重載；不讀寫遊戲資料。
(function () {
  'use strict';
  function create({ serviceWorker, release, events, canReload = () => true, beforeReload = () => true,
    onStatus = () => {}, reload, setTimeout, clearTimeout }) {
    let registration, starting, checking, waiting, deferred, target, timer, requestId;
    let applying = false, needsReload = false, reloaded = false, sequence = 0, disposed = false;
    let current = { kind: 'idle' };
    const cleanups = [], observed = new WeakSet();
    function status(kind) { current = { kind }; if (!disposed) onStatus(current); }
    function listen(node, type, fn) {
      node?.addEventListener(type, fn);
      if (node) cleanups.push(() => node.removeEventListener(type, fn));
    }
    function clearTimer() { if (timer !== undefined) clearTimeout(timer); timer = undefined; }
    function ready() { if (release?.id) serviceWorker?.controller?.postMessage({ type: 'PWA_CLIENT_READY', release: release.id }); }
    function inspect() {
      if (!release?.id || disposed || applying || needsReload) return;
      waiting = registration?.waiting;
      if (waiting) status(waiting === deferred ? 'deferred' : 'available');
      else if (registration?.installing) status('installing');
      else if (serviceWorker.controller || registration?.active) status('ready');
      else { registration = null; starting = null; status('failed'); }
    }
    function observe(worker) {
      if (!worker || observed.has(worker)) return;
      observed.add(worker);
      listen(worker, 'statechange', () => {
        if (disposed) return;
        if (worker.state === 'redundant') {
          const updating = !!serviceWorker.controller;
          if (!updating) { registration = null; starting = null; }
          status(updating ? 'update-failed' : 'failed');
        }
        else if (worker.state === 'installed') setTimeout(inspect, 0);
        else if (worker.state === 'activated' && !target) { ready(); inspect(); }
      });
    }
    async function reloadSafely() {
      if (reloaded || disposed) return;
      if (!canReload()) { applying = false; status('busy'); return; }
      try {
        if (!await beforeReload()) { applying = false; status('save-failed'); return; }
        if (!canReload()) { applying = false; status('busy'); return; }
        reloaded = true; needsReload = false; clearTimer(); reload();
      } catch (_) { applying = false; status('save-failed'); }
    }
    listen(serviceWorker, 'controllerchange', () => {
      if (target) {
        needsReload = true; clearTimer();
        if (applying) void reloadSafely();
      } else { ready(); inspect(); }
    });
    listen(serviceWorker, 'message', event => {
      if (event.source !== target || event.data?.type !== 'PWA_ACTIVATE_RESULT' || event.data.requestId !== requestId) return;
      if (event.data.blocked) { clearTimer(); target = null; applying = false; status('blocked'); }
    });
    function configure(value) {
      if (disposed) return null;
      registration = value;
      listen(registration, 'updatefound', () => { observe(registration.installing); inspect(); });
      observe(registration.installing); ready(); inspect();
      return registration;
    }
    async function start() {
      if (!serviceWorker || !release?.id || disposed) return null;
      if (starting) return starting;
      starting = (async () => {
        try { return configure(await serviceWorker.register('./sw.js', { updateViaCache: 'none' })); }
        catch (_) {
          // 離線時仍可使用已安裝的版本與待更新版本。
          try { const existing = await serviceWorker.getRegistration('./'); if (existing) return configure(existing); } catch (_) {}
          starting = null; status('failed'); return null;
        }
      })();
      return starting;
    }
    async function check() {
      if (checking || disposed) return checking;
      checking = (async () => {
        const reg = registration || await start();
        if (!reg) return;
        try { await reg.update(); observe(reg.installing); inspect(); }
        catch (_) { status('update-failed'); }
      })();
      try { await checking; } finally { checking = null; }
    }
    async function apply() {
      if (!release?.id || !serviceWorker || applying || reloaded || disposed) return false;
      if (!canReload()) { status('busy'); return false; }
      applying = true; status('applying');
      try {
        if (!await beforeReload()) { applying = false; status('save-failed'); return false; }
      } catch (_) { applying = false; status('save-failed'); return false; }
      if (needsReload) { await reloadSafely(); return reloaded; }
      waiting = registration?.waiting;
      if (!waiting) { applying = false; inspect(); return false; }
      target = waiting; requestId = 'activate-' + (++sequence);
      timer = setTimeout(() => { applying = false; status('update-failed'); }, 10_000);
      try { target.postMessage({ type: 'PWA_ACTIVATE', requestId }); }
      catch (_) { clearTimer(); target = null; applying = false; status('update-failed'); return false; }
      return true;
    }
    function defer() { if (!applying) { deferred = waiting; status('deferred'); } }
    function dispose() { disposed = true; clearTimer(); for (const cleanup of cleanups) cleanup(); }
    listen(events, 'online', () => { void check(); });
    listen(events, 'focus', () => { if (registration && !applying) void check(); });
    return { start, check, apply, defer, dispose, status: () => current };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.PwaClient = api;
})();
