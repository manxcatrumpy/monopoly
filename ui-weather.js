// 天氣調節表單與花費預覽；遊戲操作透過注入的回呼交給 app。
(function () {
  'use strict';
  function create({
    GAME_CONFIG, $$, getPlayer, t, getPhase,
    getGame, modals, $, getWeatherLabel, escapeHtml,
    chargeWeatherAdjust, totalCiv, judgeWeather, GameRules, submitWeatherAdjust,
  }) {

    function readWeatherAdjustInputs() {
      const rate = GAME_CONFIG.WEATHER.EXCHANGE_RATE_COST;
      const contributions = [];
      let totalCost = 0;
      $$('#weather-adjust-players .weather-adj-row').forEach(row => {
        const id = row.getAttribute('data-id');
        const p = getPlayer(id);
        if (!p) return;
        const fEl = row.querySelector('.adj-fortune');
        const wEl = row.querySelector('.adj-wisdom');
        const fRaw = parseInt(fEl.value, 10);
        const wRaw = parseInt(wEl.value, 10);
        const f = Math.max(0, Math.min(Number.isFinite(fRaw) ? fRaw : 0, p.fortune));
        const w = Math.max(0, Math.min(Number.isFinite(wRaw) ? wRaw : 0, p.wisdom));
        if (String(f) !== fEl.value) fEl.value = f;
        if (String(w) !== wEl.value) wEl.value = w;
        contributions.push({ id, f, w, name: p.name || t('common.player') });
        totalCost += f + w;
      });
      return { contributions, totalCost, civGain: Math.floor(totalCost / rate), rate };
    }

    function openWeatherAdjustModal() {
      const { phase, ev } = getPhase(getGame().turnNum);
      if (phase !== 'ADJUST' || !ev) return;
      if (modals.isOpen('weather-adjust-modal')) return;
      $('#weather-adjust-current-label').textContent = getWeatherLabel(ev.lockedWeather);

      const container = $('#weather-adjust-players');
      container.innerHTML = getGame().players.map(p => `
        <div class="weather-adj-row" data-id="${p.id}">
          <div class="weather-adj-name">${escapeHtml(p.name)}</div>
          <div class="adjust-row">
            <span class="adjust-label"><span class="dot dot-fortune"></span>${escapeHtml(t('players.fortune'))}</span>
            <div class="adjust-ctrl">
              <button type="button" class="adjust-step" data-step="-1" aria-label="減少">−</button>
              <input class="adjust-input adj-fortune" type="number" inputmode="numeric" min="0" max="${p.fortune}" value="0" aria-label="${escapeHtml(t('players.fortune'))}">
              <button type="button" class="adjust-step" data-step="1" aria-label="增加">＋</button>
            </div>
            <span class="adjust-preview" data-remain="fortune">${escapeHtml(t('ui.lbl_current_val', { val: p.fortune }))}</span>
          </div>
          <div class="adjust-row">
            <span class="adjust-label"><span class="dot dot-wisdom"></span>${escapeHtml(t('players.wisdom'))}</span>
            <div class="adjust-ctrl">
              <button type="button" class="adjust-step" data-step="-1" aria-label="減少">−</button>
              <input class="adjust-input adj-wisdom" type="number" inputmode="numeric" min="0" max="${p.wisdom}" value="0" aria-label="${escapeHtml(t('players.wisdom'))}">
              <button type="button" class="adjust-step" data-step="1" aria-label="增加">＋</button>
            </div>
            <span class="adjust-preview" data-remain="wisdom">${escapeHtml(t('ui.lbl_current_val', { val: p.wisdom }))}</span>
          </div>
        </div>
      `).join('');

      updateWeatherAdjust();
      modals.open('weather-adjust-modal');
    }

    function updateWeatherAdjust() {
      const { contributions, totalCost, civGain, rate } = readWeatherAdjustInputs();
      const spent = civGain * rate;
      const charged = chargeWeatherAdjust(contributions, spent);

      charged.forEach(c => {
        const row = $(`#weather-adjust-players .weather-adj-row[data-id="${c.id}"]`);
        if (!row) return;
        const p = getPlayer(c.id);
        if (!p) return;
        const fEl = row.querySelector('[data-remain="fortune"]');
        const wEl = row.querySelector('[data-remain="wisdom"]');
        if (fEl) {
          const have = p.fortune;
          fEl.textContent = c.f ? `${have} → ${have - c.f}　(−${c.f})` : t('ui.lbl_current_val', { val: have });
        }
        if (wEl) {
          const have = p.wisdom;
          wEl.textContent = c.w ? `${have} → ${have - c.w}　(−${c.w})` : t('ui.lbl_current_val', { val: have });
        }
      });

      $('#weather-adjust-total-cost-container').innerHTML = t('weather.total_cost', { cost: `<span id="weather-adjust-total-cost">${spent}</span>` });
      $('#weather-adjust-civ-gain-container').innerHTML = t('weather.civ_gain', { civ: `<span id="weather-adjust-civ-gain">${civGain}</span>` });

      const { ev } = getPhase(getGame().turnNum);
      if (ev) {
        const currentCiv = totalCiv();
        const newCiv = currentCiv + civGain;
        const nowWeather = judgeWeather(newCiv, ev.targetRound - 2, getGame().civGoal);
        const ranks = { DISASTER: 0, NORMAL: 1, FAVORABLE: 2 };

        let gapMsg;
        if (ev.upgraded) {
          gapMsg = t('weather.adjust_already_upgraded');
        } else if (ranks[nowWeather] > ranks[ev.lockedWeather]) {
          const nextRankName = Object.keys(ranks).find(k => ranks[k] === ranks[ev.lockedWeather] + 1);
          gapMsg = '✨ ' + t('weather.adjust_sub_upgraded', {
            old: getWeatherLabel(ev.lockedWeather),
            new: getWeatherLabel(nextRankName),
          });
        } else if (ranks[ev.lockedWeather] < 2) {
          const targetCiv = GameRules.weatherUpgradeTarget(ev.lockedWeather, ev.targetRound - 2, getGame().civGoal, GAME_CONFIG);

          const civShort = targetCiv - newCiv;
          gapMsg = t('weather.gap_msg', { civ: civShort, pts: civShort * rate - (totalCost % rate) });
        } else {
          gapMsg = t('weather.adjust_maxed');
        }
        $('#weather-adjust-gap').textContent = gapMsg;
      }
    }

    let bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      $('#btn-weather-adjust').addEventListener('click', (e) => {
        e.stopPropagation();
        openWeatherAdjustModal();
      });
      $('#weather-adjust-close')?.addEventListener('click', () => modals.close('weather-adjust-modal'));
      $('#weather-banner')?.addEventListener('click', (e) => {
        if (e.target.closest('#btn-weather-adjust')) return;
        if (getPhase(getGame().turnNum).phase === 'ADJUST') openWeatherAdjustModal();
      });
      $('#weather-adjust-cancel')?.addEventListener('click', () => modals.close('weather-adjust-modal'));
      $('#weather-adjust-players')?.addEventListener('click', (e) => {
        const b = e.target.closest('.adjust-step'); if (!b) return;
        const inp = b.closest('.adjust-row').querySelector('.adjust-input');
        if (!inp) return;
        const max = parseInt(inp.max, 10);
        const next = (parseInt(inp.value, 10) || 0) + parseInt(b.dataset.step, 10);
        inp.value = String(Math.max(0, Number.isFinite(max) ? Math.min(max, next) : next));
        updateWeatherAdjust();
      });
      $('#weather-adjust-players')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('adjust-input')) updateWeatherAdjust();
      });
      $('#weather-adjust-submit')?.addEventListener('click', submitWeatherAdjust);
    }

    return { readWeatherAdjustInputs, openWeatherAdjustModal, updateWeatherAdjust, bind };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.WeatherUI = api;
})();
