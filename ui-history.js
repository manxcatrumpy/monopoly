// 歷史局清單與唯讀明細；遊戲操作透過注入的回呼交給 app。
(function () {
  'use strict';
  function create({
    document, getState, modals, $, t,
    fmt, window, escapeHtml, comprehensiveScore, $$,
    restoreRound,
  }) {

    function refreshHistoryButton() {
      const btn = document.getElementById('btn-history');
      if (!btn) return;
      const n = (getState().history || []).length;
      if (n > 0) {
        btn.hidden = false;
        btn.textContent = `歷史 · ${n}`;
      } else {
        btn.hidden = true;
      }
    }

    function openHistory() {
      renderHistoryList();
      backToHistoryList(); // always open on the list, not a stale detail view
      modals.open('history-modal');
    }

    function closeHistory() {
      modals.close('history-modal');
    }

    function renderHistoryList() {
      const ul = $('#history-list');
      if (!getState().history || !getState().history.length) {
        ul.innerHTML = `<li class="history-empty">${t('messages.empty_history')}</li>`;
        return;
      }
      // Newest first
      const html = getState().history.map((entry, idx) => ({ entry, idx }))
        .sort((a, b) => b.entry.roundNum - a.entry.roundNum) // newest round first (array order can change after a swap)
        .map(({ entry, idx }) => {
          const dur = fmt(entry.timer && entry.timer.accumulated || 0);
          const when = entry.completedAt
            ? new Date(entry.completedAt).toLocaleString(window.i18n?.currentLang || 'zh-tw', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false,
              })
            : '—';
          const players = entry.players.map(p => `
            <div class="hi-player ${p.graduated ? 'graduated' : ''}">
              <div class="hp-name">${escapeHtml(p.name || t('common.player'))}</div>
              <div class="hp-scores">${escapeHtml(t('history.scores', { fortune: p.fortune, wisdom: p.wisdom, civ: p.civ }))}</div>
              <div class="hp-total">${t('history.total')} <strong>${comprehensiveScore(p)}</strong></div>
            </div>
          `).join('');
          return `
            <li class="history-item">
              <div class="hi-head">
                <div class="hi-title">${t('history.round', { round: entry.roundNum })} · ${t('history.goal', { goal: entry.civGoal })}</div>
                <div class="hi-time">${when} · ${t('history.duration', { duration: dur })}</div>
              </div>
              <div class="hi-players">${players}</div>
              ${entry.incompleteFields?.length ? `<p class="storage-warning">${escapeHtml(t('storage.history_incomplete'))}</p>` : ''}
              <div class="hi-actions">
                <button class="btn btn-ghost" data-view="${idx}">${t('ui.history_view')}</button>
                <button class="btn btn-ghost" data-restore="${idx}">${t('ui.history_restore')}</button>
              </div>
            </li>
          `;
        }).join('');
      ul.innerHTML = html;

      $$('button[data-view]', ul).forEach(b => {
        b.addEventListener('click', () => viewRound(+b.dataset.view));
      });
      $$('button[data-restore]', ul).forEach(b => {
        b.addEventListener('click', () => restoreRound(+b.dataset.restore));
      });
    }

    function viewRound(idx) {
      const entry = getState().history && getState().history[idx];
      const detail = $('#history-detail');
      const list = $('#history-list');
      if (!entry || !detail || !list) return;

      const dur = fmt((entry.timer && entry.timer.accumulated) || 0);
      const when = entry.completedAt
        ? new Date(entry.completedAt).toLocaleString(window.i18n?.currentLang || 'zh-tw', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false,
          })
        : '—';
      const players = entry.players || [];
      const sum = (k) => players.reduce((s, p) => s + (p[k] || 0), 0);
      const totalCiv = sum('civ'), reached = totalCiv >= (entry.civGoal || 0);

      const playerCards = players.map(p => `
        <div class="hd-player ${p.graduated ? 'graduated' : ''}">
          <div class="hd-pname">${escapeHtml(p.name || t('common.player'))}</div>
          <div class="hd-pstats">
            <span><span class="dot dot-fortune"></span>${t('players.fortune')} <b>${p.fortune || 0}</b></span>
            <span><span class="dot dot-wisdom"></span>${t('players.wisdom')} <b>${p.wisdom || 0}</b></span>
            <span><span class="dot dot-civ"></span>${t('players.civ')} <b>${p.civ || 0}</b></span>
          </div>
          <div class="hd-ptotal">${t('history.total')} <strong>${comprehensiveScore(p)}</strong></div>
        </div>`).join('');

      const logItems = (entry.log && entry.log.length)
        ? entry.log.map(e => `<li class="${e.kind || ''}">${escapeHtml(e.text)}<span class="ml-time">${fmt(e.t || 0)}</span></li>`).join('')
        : `<li class="empty">${t('history.empty_log')}</li>`;

      detail.innerHTML = `
        <div class="hd-head">
          <button class="btn btn-ghost" id="history-back">${t('history.back')}</button>
          <span class="hd-readonly">${t('ui.history_readonly')}</span>
        </div>
        <div class="hd-title">${t('history.round', { round: entry.roundNum })}</div>
        ${entry.incompleteFields?.length ? `<p class="storage-warning">${escapeHtml(t('storage.history_incomplete'))}</p>` : ''}
        <div class="hd-meta">${t('history.meta', { when, duration: dur, goal: entry.civGoal })}</div>
        <div class="hd-summary">
          <div class="hd-sum ${reached ? 'reached' : ''}"><span>${t('history.collective_civ')}</span><strong>${totalCiv} / ${entry.civGoal}</strong></div>
          <div class="hd-sum"><span>${t('meta.fortune_label')}</span><strong>${sum('fortune')}</strong></div>
          <div class="hd-sum"><span>${t('meta.wisdom_label')}</span><strong>${sum('wisdom')}</strong></div>
        </div>
        <div class="hd-players">${playerCards}</div>
        <div class="hd-log">
          <div class="hd-log-label">${t('history.log')}</div>
          <ul class="milestone-log hd-loglist">${logItems}</ul>
        </div>
      `;

      list.classList.add('hidden');
      detail.classList.remove('hidden');
      $('#history-title').textContent = t('history.title', { round: entry.roundNum });
      $('#history-back').addEventListener('click', backToHistoryList);
    }

    function backToHistoryList() {
      const detail = $('#history-detail');
      const list = $('#history-list');
      if (detail) detail.classList.add('hidden');
      if (list) list.classList.remove('hidden');
      const title = $('#history-title');
      if (title) title.textContent = t('ui.btn_history');
    }

    let bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      $('#btn-history').addEventListener('click', openHistory);
      $('#history-close').addEventListener('click', closeHistory);
    }

    return { refreshHistoryButton, openHistory, closeHistory, renderHistoryList, viewRound, backToHistoryList, bind };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.HistoryUI = api;
})();
