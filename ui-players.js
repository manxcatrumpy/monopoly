// 玩家卡、狀態徽章與調分／起始點控制；遊戲操作透過注入的回呼交給 app。
(function () {
  'use strict';
  function create({
    scoreMultiplier, t, getWeatherLabel, playerInShelter, shelterTurnsRemaining,
    escapeHtml, document, setTimeout, $, getGame,
    openSetup, hasActed, hasSkipped, comprehensiveScore, STATS,
    openOriginModal, openAdjustModal, toggleActed, toggleSkipped, requestRemovePlayer,
    renamePlayer, GRAD_THRESHOLD, MILESTONES, STAT_LABEL, closeOriginModal,
    closeAdjustModal, pickOrigin, applyAdjust, renderAdjustPreview, openExchange,
  }) {

    function syncMultiplierBanner(el, playerId, endgameKey) {
      if (!el) return;
      const mult = scoreMultiplier(playerId);
      if (mult.id == null) {
        el.classList.add('hidden');
        return;
      }
      el.classList.remove('hidden');
      if (mult.id === 'ENDGAME') el.textContent = t(endgameKey);
      else if (mult.id === 'SHELTER') el.textContent = t('relief.adjust_shelter');
      else el.textContent = t('relief.adjust_weather', {
        weather: getWeatherLabel(mult.id),
        gain: mult.gain,
        loss: mult.loss,
      });
    }

    function shelterBadgeHtml(p) {
      if (!playerInShelter(p)) {
        return '<div class="pc-shelter hidden"></div>';
      }
      const rem = shelterTurnsRemaining(p);
      return `<div class="pc-shelter">
          <span class="pc-shelter-title">${escapeHtml(t('relief.badge', { rem }))}</span>
          <span class="pc-shelter-rates">${escapeHtml(t('relief.badge_rates'))}</span>
        </div>`;
    }

    function syncShelterUI(card, p) {
      if (!card) return;
      let badge = card.querySelector('.pc-shelter');
      if (!badge) return;
      if (playerInShelter(p)) {
        badge.classList.remove('hidden');
        const rem = shelterTurnsRemaining(p);
        badge.innerHTML = `<span class="pc-shelter-title">${escapeHtml(t('relief.badge', { rem }))}</span>
          <span class="pc-shelter-rates">${escapeHtml(t('relief.badge_rates'))}</span>`;
      } else {
        badge.classList.add('hidden');
        badge.innerHTML = '';
      }
    }

    function flashCard(playerId, cls = 'pulse') {
      const card = document.querySelector(`[data-player-id="${playerId}"]`);
      if (!card) return;
      card.classList.remove(cls);
      void card.offsetWidth;
      card.classList.add(cls);
      setTimeout(() => card.classList.remove(cls), 1400);
    }

    function renderPlayers() {
      const grid = $('#players');
      grid.innerHTML = '';
      grid.style.setProperty('--cols', getGame().players.length <= 4 ? 2 : 3);
      // Quick-draw shortcuts only make sense with a running game
      $('#quick-draw').classList.toggle('hidden', !getGame().players.length);
      if (!getGame().players.length) {
        grid.innerHTML = `
          <div class="empty-getState()">
            <div class="empty-icon"><svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><g stroke="#E0A331" stroke-width="2.6" stroke-linecap="round"><line x1="32" y1="17" x2="32" y2="10.5"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(45 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(90 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(135 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(180 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(225 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(270 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(315 32 32)"></line></g><circle cx="32" cy="32" r="11.5" fill="#EFC158"></circle></svg></div>
            <h3>${t('messages.not_started_title')}</h3>
            <p>${t('messages.not_started_desc')}</p>
            <button class="btn btn-primary" id="empty-setup-btn">${t('ui.btn_new_game')}</button>
          </div>`;
        $('#empty-setup-btn').addEventListener('click', openSetup);
        return;
      }
      getGame().players.forEach(p => grid.appendChild(buildPlayerCard(p)));
    }

    function buildPlayerCard(p) {
      const card = document.createElement('article');
      const acted = hasActed(p.id);
      const skipped = hasSkipped(p.id);
      card.className = 'player-card'
        + (p.graduated ? ' graduated' : '')
        + (acted ? ' acted' : '')
        + (skipped ? ' skipped' : '');
      card.dataset.playerId = p.id;

      const total = comprehensiveScore(p);
      const fw = (p.fortune || 0) + (p.wisdom || 0);
      card.innerHTML = `
        <header class="pc-head">
          <input class="pc-name" value="${escapeHtml(p.name)}" placeholder="${t('ui.player_name_placeholder')}" maxlength="10" />
          <span class="pc-hat" title="${t('ui.graduated_badge')}">${t('ui.graduated_badge')}</span>
          <div class="pc-fw" title="${t('ui.fw_full')}">
            <span>${t('ui.fw_short')}</span>
            <strong>${fw}</strong>
          </div>
          <div class="pc-total">
            <span>${t('ui.total_score')}</span>
            <strong>${total}</strong>
          </div>
        </header>

        ${STATS.map(stat => statRow(p, stat)).join('')}

        ${shelterBadgeHtml(p)}
        <div class="pc-exchange ${getGame().exchange.opened ? '' : 'hidden'}">
          <span class="pc-exchange-stock">${escapeHtml(t('exchange.stock', { navigation: p.navigationTokens, shield: p.shieldTokens, investment: p.investmentTokens }))}</span>
          <span class="pc-exchange-movement"></span>
          <button class="btn btn-ghost" data-act="exchange">${t('exchange.title')}</button>
        </div>

        <div class="pc-actions">
          <button class="pc-origin-open" data-act="origin" title="${t('ui.origin_title')}">${t('ui.btn_origin')}</button>
          <button class="pc-adjust" data-act="adjust" title="${t('ui.adjust_title')}">${t('ui.btn_adjust')}</button>
          <div class="pc-turn-flags">
            <button class="pc-acted" data-act="acted" aria-pressed="${acted ? 'true' : 'false'}" title="${t('ui.acted_title')}">${acted ? t('ui.btn_acted_done') : t('ui.btn_acted')}</button>
            <button class="pc-skip" data-act="skip" aria-pressed="${skipped ? 'true' : 'false'}" title="${t('ui.skip_title')}">${skipped ? t('ui.btn_skip_done') : t('ui.btn_skip')}</button>
          </div>
        </div>

        <footer class="pc-foot">
          <span class="pc-status">${p.graduated ? t('ui.graduated_status') : statusHint(p)}</span>
          <button class="pc-remove" data-act="remove">${t('ui.btn_remove')}</button>
        </footer>
      `;

      // Event delegation
      card.addEventListener('click', (e) => {
        const el = e.target;
        if (el.closest('[data-act="exchange"]')) {
          openExchange(p.id);
        } else if (el.closest('[data-act="origin"]')) {
          openOriginModal(p.id);
        } else if (el.closest('[data-act="adjust"]')) {
          openAdjustModal(p.id);
        } else if (el.closest('[data-act="acted"]')) {
          toggleActed(p.id);
        } else if (el.closest('[data-act="skip"]')) {
          toggleSkipped(p.id);
        } else if (el.matches('[data-act="remove"]')) {
          requestRemovePlayer(p.id);
        }
      });

      const nameInput = $('.pc-name', card);
      nameInput.addEventListener('change', () => {
        renamePlayer(p.id, nameInput.value.trim());
      });

      syncExchangeUI(card, p);
      return card;
    }

    function syncExchangeUI(card, p) {
      const area = card.querySelector('.pc-exchange');
      if (!area) return;
      area.classList.toggle('hidden', !getGame().exchange.opened);
      card.querySelector('.pc-exchange-stock').textContent = t('exchange.stock', { navigation: p.navigationTokens, shield: p.shieldTokens, investment: p.investmentTokens });
      const movement = getGame().exchange.movementThisTurn[p.id];
      card.querySelector('.pc-exchange-movement').textContent = movement?.mode === 'navigation' ? t('exchange.moved_navigation', { steps: movement.steps }) : '';
    }

    function statusHint(p) {
      if (p.fortune >= GRAD_THRESHOLD - 5 && p.wisdom >= GRAD_THRESHOLD - 5) return t('ui.status_near_grad');
      if (p.fortune >= 15 || p.wisdom >= 15) return t('ui.status_mid');
      return t('ui.status_training');
    }

    function statRow(p, stat) {
      const v = p[stat];
      const max = stat === 'civ' ? Math.max(20, getGame().civGoal) : 60;
      const pct = Math.min(100, (v / max) * 100);
      const marks = stat === 'civ' ? '' : MILESTONES.map(m => {
        const pos = (m / max) * 100;
        return `<span class="stat-mark ${v >= m ? 'reached' : ''}" data-mark="${m}" style="left:${pos}%"></span>`;
      }).join('');
      const isFW = stat === 'fortune' || stat === 'wisdom';
      const quotaUsed = !!(isFW && p.reliefUsed && p.reliefUsed[stat]);
      const quotaDot = isFW
        ? `<span class="pc-quota-dot ${quotaUsed ? 'used' : 'avail'}" title="${escapeHtml(t(quotaUsed ? 'relief.quota_used' : 'relief.quota_avail'))}"></span>`
        : '';
      const selfLow = !!(isFW && p.selfSelectedLow && p.selfSelectedLow[stat]);
      const selfLowHtml = isFW
        ? `<div class="stat-self-low ${selfLow ? '' : 'hidden'}">${escapeHtml(t('relief.self_low_tag'))}</div>`
        : '';
      return `
        <div class="stat-row stat-${stat}">
          <div class="stat-label"><span>${STAT_LABEL(stat)}</span>${quotaDot}</div>
          <div class="stat-bar">
            <div class="stat-bar-fill" style="width:${pct}%"></div>
            ${marks}
          </div>
          <span class="stat-num">${v}</span>
          ${selfLowHtml}
        </div>
      `;
    }

    function updatePlayerCard(p) {
      const card = document.querySelector(`[data-player-id="${p.id}"]`);
      if (!card) { renderPlayers(); return; }

      card.classList.toggle('graduated', !!p.graduated);
      card.querySelector('.pc-total strong').textContent = comprehensiveScore(p);
      const fwEl = card.querySelector('.pc-fw strong');
      if (fwEl) fwEl.textContent = (p.fortune || 0) + (p.wisdom || 0);

      STATS.forEach(stat => {
        const row = card.querySelector(`.stat-${stat}`);
        if (!row) return;
        const v = p[stat];
        const max = stat === 'civ' ? Math.max(20, getGame().civGoal) : 60;
        const pct = Math.min(100, (v / max) * 100);
        const numEl = row.querySelector('.stat-num');
        if (numEl) numEl.textContent = v;
        row.querySelector('.stat-bar-fill').style.width = pct + '%';
        row.querySelectorAll('.stat-mark').forEach(mark => {
          mark.classList.toggle('reached', v >= +mark.dataset.mark);
        });

        if (stat === 'fortune' || stat === 'wisdom') {
          const dot = row.querySelector('.pc-quota-dot');
          if (dot) {
            const quotaUsed = !!(p.reliefUsed && p.reliefUsed[stat]);
            dot.className = `pc-quota-dot ${quotaUsed ? 'used' : 'avail'}`;
            dot.title = t(quotaUsed ? 'relief.quota_used' : 'relief.quota_avail');
          }
          const selfLowEl = row.querySelector('.stat-self-low');
          if (selfLowEl) {
            const selfLow = !!(p.selfSelectedLow && p.selfSelectedLow[stat]);
            selfLowEl.classList.toggle('hidden', !selfLow);
          }
        }
      });

      card.querySelector('.pc-status').textContent =
        p.graduated ? t('ui.graduated_status') : statusHint(p);

      syncShelterUI(card, p);
      applyTurnStatusUI(card, p.id);
    }

    function applyTurnStatusUI(card, playerId) {
      const player = getGame().players.find(p => p.id === playerId);
      if (player) syncExchangeUI(card, player);
      const acted = hasActed(playerId);
      const skipped = hasSkipped(playerId);
      card.classList.toggle('acted', acted);
      card.classList.toggle('skipped', skipped);
      const actedBtn = card.querySelector('[data-act="acted"]');
      if (actedBtn) {
        actedBtn.setAttribute('aria-pressed', acted ? 'true' : 'false');
        actedBtn.textContent = acted ? t('ui.btn_acted_done') : t('ui.btn_acted');
      }
      const skipBtn = card.querySelector('[data-act="skip"]');
      if (skipBtn) {
        skipBtn.setAttribute('aria-pressed', skipped ? 'true' : 'false');
        skipBtn.textContent = skipped ? t('ui.btn_skip_done') : t('ui.btn_skip');
      }
    }

    let bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      // 起始點加分 modal
      $('#origin-close').addEventListener('click', closeOriginModal);
      $('#origin-cancel').addEventListener('click', closeOriginModal);
      $('#origin-pass-btn').addEventListener('click', () => pickOrigin(false));
      $('#origin-stop-btn').addEventListener('click', () => pickOrigin(true));

      // 加減分 modal
      $('#adjust-close').addEventListener('click', closeAdjustModal);
      $('#adjust-cancel').addEventListener('click', closeAdjustModal);
      $('#adjust-apply').addEventListener('click', applyAdjust);
      $('#adjust-source').addEventListener('change', renderAdjustPreview);
      $('#adjust-rows').addEventListener('click', (e) => {
        const b = e.target.closest('.adjust-step'); if (!b) return;
        const inp = b.closest('.adjust-row').querySelector('.adjust-input');
        inp.value = String((parseInt(inp.value, 10) || 0) + parseInt(b.dataset.step, 10));
        renderAdjustPreview();
      });
      $('#adjust-rows').addEventListener('input', (e) => {
        if (e.target.classList.contains('adjust-input')) renderAdjustPreview();
      });
    }

    return { syncMultiplierBanner, flashCard, renderPlayers, updatePlayerCard, applyTurnStatusUI, bind };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.PlayersUI = api;
})();
