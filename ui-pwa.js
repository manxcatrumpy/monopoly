// 更新提示不搶焦點，所有套用／稍後／重試操作交回 PWA client。
(function () {
  'use strict';
  function create({ $, t, apply, defer, retry }) {
    let bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      $('#pwa-apply').addEventListener('click', () => { void apply(); });
      $('#pwa-later').addEventListener('click', defer);
      $('#pwa-retry').addEventListener('click', () => { void retry(); });
    }
    function render({ kind }) {
      const visible = ['available', 'applying', 'blocked', 'busy', 'save-failed', 'failed', 'update-failed'].includes(kind);
      const notice = $('#pwa-notice');
      notice.hidden = !visible;
      notice.dataset.status = kind;
      if (!visible) return;
      $('#pwa-message').textContent = t('pwa.' + kind);
      $('#pwa-apply').hidden = ['failed', 'update-failed'].includes(kind);
      $('#pwa-apply').disabled = kind === 'applying';
      $('#pwa-later').hidden = kind === 'applying';
      $('#pwa-retry').hidden = !['failed', 'update-failed'].includes(kind);
    }
    return { bind, render };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.PwaUI = api;
})();
