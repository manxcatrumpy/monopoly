// 儲存 adapter：失敗不覆寫原資料，舊格式轉換前保留原始備份。
(function () {
  function create({ storage, key, legacyKey, model, options }) {
    let blocked = false;
    let original = null;
    let backupPending = false;
    function backup() {
      if (backupPending && original !== null) {
        storage.setItem(key + '-backup', original);
        backupPending = false;
      }
    }
    return {
      get blocked() { return blocked; },
      read() {
        try {
          original = storage.getItem(key);
          const fromLegacyKey = original === null && !!legacyKey;
          if (fromLegacyKey) original = storage.getItem(legacyKey);
          if (original === null) { blocked = false; return { status: 'empty' }; }
          const decoded = model.decode(original, options());
          blocked = false;
          backupPending = decoded.migrated || fromLegacyKey;
          return { status: 'loaded', ...decoded };
        } catch (error) {
          blocked = true;
          return { status: 'invalid', error };
        }
      },
      write(state) {
        if (blocked) return { ok: false, blocked: true };
        try {
          const serialized = model.serialize(state, options());
          backup();
          storage.setItem(key, serialized);
          return { ok: true };
        } catch (error) { return { ok: false, error }; }
      },
      replaceUnreadable() {
        try {
          backupPending = original !== null;
          backup();
          blocked = false;
          return { ok: true };
        } catch (error) { return { ok: false, error }; }
      },
    };
  }
  const adapter = { create };
  if (typeof module === 'object' && module.exports) module.exports = adapter;
  else globalThis.GameStorage = adapter;
})();
