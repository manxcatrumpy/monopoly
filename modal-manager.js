// UI 專用：集中管理彈窗堆疊、焦點、鍵盤與等待確認，不讀寫遊戲資料。
(function () {
  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  function create({ document, getScope = () => null }) {
    const definitions = new Map(), active = new Map(), queues = new Map();
    const background = new Map();
    let sequence = 0, suspended = 0, previousOverflow = null;
    const stack = () => Array.from(active.values()).sort((a, b) => a.options.priority - b.options.priority || a.sequence - b.sequence);
    const top = () => stack().at(-1);
    function usable(node) {
      if (!node || node.isConnected === false || node.disabled || typeof node.focus !== 'function') return false;
      for (let current = node; current; current = current.parentElement) {
        if (current.inert || current.hidden || current.classList?.contains('hidden')) return false;
      }
      return !node.getClientRects || node.getClientRects().length > 0;
    }
    const focusables = entry => Array.from(entry.node.querySelectorAll(FOCUSABLE))
      .filter(node => node.getAttribute('tabindex') !== '-1' && usable(node));
    function focusTop(preferred) {
      const entry = top();
      if (!entry) { if (usable(preferred)) preferred.focus(); return; }
      const initial = typeof entry.options.initialFocus === 'string'
        ? entry.node.querySelector(entry.options.initialFocus) : entry.options.initialFocus;
      const target = [preferred, entry.lastFocus, initial, ...focusables(entry)]
        .find(node => entry.node.contains(node) && usable(node));
      (target || entry.node).focus();
    }
    function sync() {
      const entries = stack(), highest = entries.at(-1);
      entries.forEach((entry, index) => {
        entry.node.style.setProperty('--modal-order', String(index));
        entry.node.inert = entry !== highest;
        entry.node.setAttribute('aria-modal', String(entry === highest));
        entry.node.setAttribute('aria-hidden', String(entry !== highest));
      });
      if (highest) {
        if (previousOverflow === null && document.body) {
          previousOverflow = document.body.style.overflow || '';
          document.body.style.overflow = 'hidden';
        }
        for (const node of Array.from(document.body?.children || [])) {
          if (node.classList.contains('modal') || node.matches('script, style, link, [role="status"], [role="alert"]')) continue;
          if (!background.has(node)) background.set(node, node.inert);
          node.inert = true;
        }
      } else {
        for (const [node, inert] of background) node.inert = inert;
        background.clear();
        if (previousOverflow !== null) {
          document.body.style.overflow = previousOverflow;
          previousOverflow = null;
        }
      }
    }
    function register(id, options = {}) {
      if (definitions.has(id)) throw new Error('Modal already registered: ' + id);
      definitions.set(id, { options: { priority: 0, closeOnEscape: true, closeOnBackdrop: false, ...options } });
    }
    function definition(id) {
      const value = definitions.get(id);
      if (!value) throw new Error('Unknown modal: ' + id);
      if (!value.node) {
        value.node = document.getElementById(id);
        if (!value.node) throw new Error('Missing modal: ' + id);
        value.node.setAttribute('tabindex', '-1');
        value.backdrop = value.node.querySelector('.modal-backdrop');
        value.onBackdrop = () => {
          const entry = active.get(id);
          if (entry && top() === entry && entry.options.closeOnBackdrop) closeEntry(entry, false, 'backdrop');
        };
        value.backdrop?.addEventListener('click', value.onBackdrop);
      }
      return value;
    }
    function openEntry(id, options, request = null) {
      const def = definition(id);
      const oldTop = top();
      const entry = { id, node: def.node, options: { ...def.options, ...options },
        scope: Object.hasOwn(options, 'scope') ? options.scope : getScope(),
        sequence: ++sequence, opener: request?.opener || document.activeElement, request, cleanups: [] };
      active.set(id, entry);
      entry.node.classList.remove('hidden');
      const controls = {
        close: value => { if (active.get(id) === entry && top() === entry) closeEntry(entry, value, 'action'); },
        listen(node, type, handler) {
          if (!node) return;
          const guarded = event => { if (active.get(id) === entry && top() === entry) handler(event); };
          node.addEventListener(type, guarded);
          entry.cleanups.push(() => node.removeEventListener(type, guarded));
        },
      };
      try {
        entry.options.onOpen?.(controls);
      } catch (error) {
        entry.request = null;
        suspended++;
        try { closeEntry(entry, false, 'error'); } finally { suspended--; }
        throw error;
      }
      sync();
      if (oldTop !== top()) focusTop();
      return entry;
    }
    function open(id, options = {}) {
      if (active.has(id)) return; // 同一個來源重複通知，不重設焦點或覆寫內容。
      openEntry(id, options);
    }
    function pump(id) {
      if (suspended || active.has(id)) return;
      const queue = queues.get(id) || [];
      while (queue.length) {
        const request = queue.shift();
        if (request.scope !== null && request.scope !== getScope()) { request.resolve(false); continue; }
        try {
          if (request.options.prepare?.() === false) { request.resolve(false); continue; }
          openEntry(id, request.options, request);
          return;
        } catch (error) { request.reject(error); }
      }
    }
    function prompt(id, options = {}) {
      const scope = Object.hasOwn(options, 'scope') ? options.scope : getScope();
      const current = active.get(id);
      const opener = current?.node.contains(document.activeElement) ? current.opener : document.activeElement;
      return new Promise((resolve, reject) => {
        if (!queues.has(id)) queues.set(id, []);
        queues.get(id).push({ scope, opener, options: { ...options, scope }, resolve, reject });
        pump(id);
      });
    }
    function closeEntry(entry, value = false, reason = 'close', restoreFocus = true) {
      if (active.get(entry.id) !== entry) return;
      const wasTop = top() === entry;
      active.delete(entry.id);
      for (const cleanup of entry.cleanups) cleanup();
      entry.node.classList.add('hidden');
      entry.node.inert = false;
      entry.node.setAttribute('aria-hidden', 'true');
      entry.node.setAttribute('aria-modal', 'false');
      entry.node.style.removeProperty('--modal-order');
      entry.options.onClose?.(reason);
      sync();
      if (wasTop && restoreFocus && !suspended) focusTop(entry.opener);
      entry.request?.resolve(value);
      pump(entry.id);
    }
    function close(id, value = false) { const entry = active.get(id); if (entry) closeEntry(entry, value); }
    function cancelScope(scope, { restoreFocus = false } = {}) {
      suspended++;
      let opener;
      try {
        for (const [id, queue] of queues) {
          queues.set(id, queue.filter(request => {
            if (request.scope !== scope) return true;
            request.resolve(false);
            return false;
          }));
        }
        for (const entry of stack().reverse()) {
          if (entry.scope === scope) { opener = entry.opener; closeEntry(entry, false, 'scope', false); }
        }
      } finally { suspended--; }
      if (restoreFocus) focusTop(opener);
      for (const id of queues.keys()) pump(id);
    }
    function onKey(event) {
      const entry = top();
      if (!entry || event.defaultPrevented || event.isComposing) return;
      if (event.repeat && ['Enter', 'Escape'].includes(event.key)) { event.preventDefault(); return; }
      if (event.key === 'Tab') {
        const nodes = focusables(entry), current = document.activeElement;
        if (!nodes.length) { event.preventDefault(); entry.node.focus(); }
        else if (event.shiftKey && (current === nodes[0] || !nodes.includes(current))) { event.preventDefault(); nodes.at(-1).focus(); }
        else if (!event.shiftKey && (current === nodes.at(-1) || !nodes.includes(current))) { event.preventDefault(); nodes[0].focus(); }
      } else if (event.key === 'Escape' && entry.options.closeOnEscape) {
        event.preventDefault();
        closeEntry(entry, false, 'escape');
      } else if (event.key === 'Enter' && entry.options.onEnter && event.target?.tagName !== 'TEXTAREA') {
        event.preventDefault();
        const focused = document.activeElement;
        if (focused?.tagName === 'BUTTON' && entry.node.contains(focused)) {
          if (!focused.disabled) focused.click();
        } else entry.options.onEnter(() => { if (top() === entry) closeEntry(entry, true, 'enter'); });
      }
    }
    function onFocus(event) {
      const entry = top();
      if (!entry) return;
      if (entry.node.contains(event.target)) entry.lastFocus = event.target;
      else focusTop();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    function destroy() {
      const scopes = new Set([...Array.from(active.values(), entry => entry.scope), ...Array.from(queues.values()).flat().map(request => request.scope)]);
      suspended++;
      for (const scope of scopes) cancelScope(scope);
      suspended--;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      for (const def of definitions.values()) def.backdrop?.removeEventListener('click', def.onBackdrop);
    }
    return { register, open, close, prompt, cancelScope, destroy,
      isOpen: id => active.has(id), topId: () => top()?.id || null,
      stack: () => stack().map(entry => entry.id), pendingCount: id => queues.get(id)?.length || 0 };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.ModalManager = api;
})();
