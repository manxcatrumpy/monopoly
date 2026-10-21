// 通知、確認、救濟提示與待抽卡的呈現；遊戲操作透過注入的回呼交給 app。
(function () {
  'use strict';
  function create({
    reliefCfg, STAT_LABEL, t, getGame, modals,
    $, clearTimeout, setTimeout, window, escapeHtml,
    fmt, resolvePendingDraw, resolveAllDraws,
  }) {
    let toastTimer;
    function reliefAnnounceText({ name, items = [], scores = {}, restore, multiPlayers }) {
      const cfg = reliefCfg();
      const rest = restore || cfg.RESTORE_TO;
      if (multiPlayers && multiPlayers.length > 0) {
        const names = multiPlayers.map(m => {
          const statsStr = m.items.map(s => STAT_LABEL(s)).join('、');
          return `${m.name}（${statsStr}）`;
        }).join('、');
        return t('relief.body_multi', { names, restore: rest });
      }
      if (items.length === 2) {
        return t('relief.body_both', { name, restore: rest });
      }
      const statKey = items[0] || 'fortune';
      const scoreVal = scores[statKey] !== undefined ? scores[statKey] : 0;
      return t('relief.body_one', {
        name,
        stat: STAT_LABEL(statKey),
        score: scoreVal,
        restore: rest,
      });
    }

    function showReliefModal(opts) {
      const game = getGame();
      return modals.prompt('relief-modal', {
        scope: game,
        prepare() {
          if (game !== getGame()) return false;
          const current = typeof opts === 'function' ? opts() : opts;
          if (!current) return false;
          $('#relief-title').textContent = current.title || t('relief.title');
          $('#relief-message').textContent = current.message || reliefAnnounceText(current);
          $('#relief-ack-wrap').classList.remove('hidden');
          $('#relief-ack-cb').checked = false;
          $('#relief-ok').textContent = current.okText || t('relief.offer_start');
          $('#relief-ok').disabled = true;
          $('#relief-later').textContent = current.laterText || t('relief.offer_later');
          $('#relief-later').classList.remove('hidden');
          return true;
        },
        onEnter(accept) { if (!$('#relief-ok').disabled) accept(); },
        onOpen({ listen, close }) {
          listen($('#relief-ack-cb'), 'change', () => { $('#relief-ok').disabled = !$('#relief-ack-cb').checked; });
          listen($('#relief-ok'), 'click', () => { if (!$('#relief-ok').disabled) close(true); });
          listen($('#relief-later'), 'click', () => close(false));
        },
      });
    }

    function toast(msg, kind = '') {
      const el = $('#toast');
      el.textContent = msg;
      el.className = 'toast ' + kind;
      void el.offsetWidth;
      el.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
    }

    function confirmModal({ title = t('confirm.title'), message = '', confirmText = t('confirm.btn_ok'), cancelText = t('confirm.btn_cancel'), danger = false } = {}) {
      if (!$('#confirm-modal')) return Promise.resolve(window.confirm(message || title));
      return modals.prompt('confirm-modal', {
        prepare() {
          $('#confirm-title').textContent = title;
          $('#confirm-message').textContent = message;
          $('#confirm-ok').textContent = confirmText;
          $('#confirm-cancel').textContent = cancelText;
          $('#confirm-ok').classList.toggle('btn-danger', !!danger);
          $('#confirm-ok').classList.toggle('btn-primary', !danger);
          return true;
        },
        onEnter: accept => accept(),
        onOpen({ listen, close }) {
          listen($('#confirm-ok'), 'click', () => close(true));
          listen($('#confirm-cancel'), 'click', () => close(false));
        },
      });
    }

    function renderLog() {
      const ul = $('#milestone-log');
      if (!getGame().log.length) {
        ul.innerHTML = `<li class="empty">${t('messages.empty_log')}</li>`;
        return;
      }
      ul.innerHTML = getGame().log.map(e =>
        `<li class="${e.kind}">${escapeHtml(e.text)}<span class="ml-time">${fmt(e.t)}</span></li>`
      ).join('');
    }

    function renderDrawModal() {
      const modal = $('#draw-modal');
      const listEl = $('#draw-list');
      if (!modal || !listEl) return;
      const list = getGame().pendingDraws || [];
      if (!list.length) { modals.close('draw-modal'); return; }
      listEl.innerHTML = list.map(d =>
        `<li><span class="dl-text">${escapeHtml(d.text)}</span>` +
        `<button class="btn btn-primary dl-done" data-pd-id="${d.id}" type="button">已抽</button></li>`
      ).join('');
      listEl.querySelectorAll('.dl-done').forEach(btn =>
        btn.addEventListener('click', () => resolvePendingDraw(btn.dataset.pdId)));
    }

    function openDrawModal() {
      if (!(getGame().pendingDraws || []).length) return;
      renderDrawModal();
      modals.open('draw-modal');
    }

    function renderPendingDraws() {
      const ul = $('#pending-draws');
      if (!ul) return;
      const list = getGame().pendingDraws || [];
      const wrap = $('#pending-wrap');
      if (wrap) wrap.classList.toggle('hidden', list.length === 0);
      ul.innerHTML = list.map(d => `
        <li>
          <span class="pd-text">${escapeHtml(d.text)}</span>
          <span class="pd-time">${fmt(d.t)}</span>
          <button class="pd-done" data-pd-id="${d.id}" aria-label="已抽卡、清除待辦">已抽</button>
        </li>`).join('');
      ul.querySelectorAll('.pd-done').forEach(btn =>
        btn.addEventListener('click', () => resolvePendingDraw(btn.dataset.pdId)));
    }

    let bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      // 抽卡里程 modal：稍後再抽（保留面板待辦）/ 全部已抽（清空）
      $('#draw-later').addEventListener('click', () => modals.close('draw-modal'));
      $('#draw-all-done').addEventListener('click', () => {
        resolveAllDraws();
        modals.close('draw-modal');
      });
    }

    return { showReliefModal, toast, confirmModal, renderLog, renderDrawModal, openDrawModal, renderPendingDraws, bind };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.FeedbackUI = api;
})();
