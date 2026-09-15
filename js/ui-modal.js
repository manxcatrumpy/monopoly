(function(global) {
  const $ = (sel, ctx = document) => (ctx || document).querySelector(sel);

  function openModal(modalSel) {
    const m = typeof modalSel === 'string' ? $(modalSel) : modalSel;
    if (m) m.classList.remove('hidden');
  }

  function closeModal(modalSel) {
    const m = typeof modalSel === 'string' ? $(modalSel) : modalSel;
    if (m) m.classList.add('hidden');
  }

  function bindModal(modalSel, options = {}) {
    const m = typeof modalSel === 'string' ? $(modalSel) : modalSel;
    if (!m) return;
    const backdrop = $('.modal-backdrop', m);
    if (backdrop && options.backdrop !== false) {
      backdrop.addEventListener('click', () => closeModal(m));
    }
    if (options.close) {
      options.close.forEach(sel => {
        const btn = $(sel, m) || $(sel);
        if (btn) btn.addEventListener('click', () => closeModal(m));
      });
    }
  }

  function promptDialog({
    modalSel = '#confirm-modal',
    titleSel = '#confirm-title',
    messageSel = '#confirm-message',
    okSel = '#confirm-ok',
    cancelSel = '#confirm-cancel',
    title = '',
    message = '',
    ok = '確定',
    cancel = '取消',
    danger = false,
    hideCancel = false
  } = {}) {
    return new Promise((resolve) => {
      const modal = $(modalSel);
      const okBtn = okSel ? $(okSel, modal) : null;
      const cancelBtn = cancelSel ? $(cancelSel, modal) : null;
      const backdrop = $('.modal-backdrop', modal);
      if (!modal) { resolve(window.confirm(message || title)); return; }

      const titleEl = titleSel ? $(titleSel, modal) : null;
      const messageEl = messageSel ? $(messageSel, modal) : null;

      if (titleEl) titleEl.textContent = title;
      if (messageEl) {
        if (typeof message === 'string') {
          messageEl.textContent = message;
        } else {
          // If message is a DOM element or fragment (like in reliefBodyText)
          messageEl.innerHTML = '';
          messageEl.appendChild(message);
        }
      }

      if (okBtn) {
        okBtn.textContent = ok;
        okBtn.classList.toggle('btn-danger', !!danger);
        okBtn.classList.toggle('btn-primary', !danger);
      }

      if (cancelBtn) {
        cancelBtn.textContent = cancel;
        cancelBtn.classList.toggle('hidden', hideCancel);
      }

      const done = (result) => {
        closeModal(modal);
        if (okBtn) okBtn.removeEventListener('click', onOk);
        if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
        if (backdrop) backdrop.removeEventListener('click', onCancelBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };

      const onOk = () => done(true);
      const onCancel = () => done(false);
      const onCancelBackdrop = () => { if (!hideCancel) done(false); else done(true); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); if (!hideCancel) done(false); else done(true); }
        else if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      };

      if (okBtn) okBtn.addEventListener('click', onOk);
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
      if (backdrop) backdrop.addEventListener('click', onCancelBackdrop);
      document.addEventListener('keydown', onKey);

      openModal(modal);
    });
  }

  const UiModal = { openModal, closeModal, bindModal, promptDialog };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = UiModal;
  } else {
    global.UiModal = UiModal;
  }
})(typeof window !== 'undefined' ? window : this);
