// 抽卡、抉擇、卡牌目錄與匯入／匯出介面；遊戲操作透過注入的回呼交給 app。
(function () {
  'use strict';
  function create({
    getDecks, draft, drawFromDeck, $, t, optionAvailable, previewOperations,
    modals, getGame, escapeHtml, comprehensiveScore, toast,
    applyCardReward, scoreMultiplier, describeReward, scaleReward, getWeatherLabel,
    choiceEffects, totalCiv, $$, applyChoiceCard, getActionDeck,
    getBoostDeck, getState, document, setTimeout, applyDecksImport,
    resetDecksToDefault,
  }) {

    function openCardDraw(deckKey) {
      if (!getDecks()[deckKey]) return;
      draft.currentDeckKey = deckKey;
      draft.currentCard = drawFromDeck(deckKey);
      draft.currentChoiceOpt = null;
      $('#card-title').textContent = deckKey === 'action' ? t('card.title_action') : t('card.title_boost');
      renderCard();
      modals.open('card-modal');
    }

    function closeCard() {
      modals.close('card-modal');
    }

    function cardPlayersRefHtml() {
      if (!getGame().players.length) return '';
      const items = getGame().players.map(p => `
        <div class="cpr-item${p.graduated ? ' graduated' : ''}">
          <span class="cpr-name">${escapeHtml(p.name || t('common.player'))}</span>
          <span class="cpr-stats"><b>福</b>${p.fortune || 0} <b>慧</b>${p.wisdom || 0} <b>文</b>${p.civ || 0}</span>
          <span class="cpr-tot">綜 ${comprehensiveScore(p)}</span>
        </div>`).join('');
      return `<div class="card-players-ref">
        <div class="cpr-label">玩家現況 · 判斷對象用</div>
        <div class="cpr-list">${items}</div>
      </div>`;
    }

    function updatePreview(c, choice = false) {
      const output = $('#card-preview');
      const index = choice ? draft.currentChoiceOpt : undefined;
      const both = (choice ? c.options[index]?.both : undefined) ?? c.both;
      const ids = [$('#card-recipient').value];
      if (both) ids.push($('#card-recipient2').value);
      const extraIds = c.extraReward?.role === 'answerer' ? [$('#card-answerer').value] :
        c.extraReward?.role === 'participants' ? $$('.card-participant', $('#card-foot')).filter(input => input.checked).map(input => input.value) : [];
      try {
        const ops = previewOperations(c, ids, { optionIndex: index, extraIds });
        const merged = new Map();
        ops.forEach(op => {
          const delta = merged.get(op.playerId) || {};
          Object.entries(op.delta).forEach(([key, value]) => { delta[key] = (delta[key] || 0) + value; });
          merged.set(op.playerId, delta);
        });
        output.textContent = t('card.preview') + ' ' + [...merged].map(([id, delta]) => {
          const player = getGame().players.find(p => p.id === id);
          const actual = Object.fromEntries(Object.entries(delta).map(([stat, amount]) => [stat, Math.max(0, player[stat] + amount) - player[stat]]));
          return (player.name || t('common.player')) + '：' + (describeReward(actual) || t('card.no_score_change'));
        }).join('；');
      } catch (error) {
        if (error.message !== 'card.invalid_selection') throw error;
        output.textContent = '';
      }
    }

    function bindPreview(c, choice = false) {
      $$('select, input', $('#card-foot')).forEach(input => input.addEventListener('change', () => updatePreview(c, choice)));
      updatePreview(c, choice);
    }

    function extraRewardHtml(c) {
      if (!c.extraReward) return '';
      const { role, reward } = c.extraReward;
      return `<p class="card-side">${escapeHtml(t('card.' + role))}：${escapeHtml(describeReward(reward))}</p>`;
    }

    function roleControls(c, selectHtml) {
      if (!c.extraReward) return '';
      if (c.extraReward.role === 'answerer') return selectHtml('card-answerer', t('card.answerer'));
      return `<fieldset class="card-participants"><legend>${t('card.participants')}</legend>` +
        getGame().players.map(p => `<label><input type="checkbox" class="card-participant" value="${escapeHtml(p.id)}"> ${escapeHtml(p.name || t('common.player'))}</label>`).join('') + '</fieldset>';
    }

    async function submitCard(callback) {
      const button = $('#card-apply');
      if (button.disabled) return;
      button.disabled = true;
      try { await callback(); } finally { button.disabled = false; }
    }

    function renderCard() {
      if (!draft.currentCard) return;
      const c = draft.currentCard;
      if (Array.isArray(c.options)) { renderChoiceCard(c); return; }   // 抉擇卡（文明反思／文明扣分）
      const bodyHtml = c.type === 'boost' ? renderBoostBody(c) : renderActionBody(c);
      $('#card-body').innerHTML = bodyHtml;

      const playerOpts = getGame().players.map(p =>
        `<option value="${p.id}">${escapeHtml(p.name || t('common.player'))}　（福 ${p.fortune} · 慧 ${p.wisdom} · 文 ${p.civ}）</option>`
      ).join('');
      const selectHtml = (id, label) => `
          <label class="row">
            <span>${label}</span>
            <select id="${id}">
              <option value="">${t('card.lbl_select_player')}</option>
              ${playerOpts}
            </select>
          </label>`;
      // 「雙方」卡（boost）要同時套用給本人與上一家，給兩個下拉；其餘卡用單一收受者。
      const recipientControls = c.both
        ? selectHtml('card-recipient', t('card.lbl_self')) + selectHtml('card-recipient2', t('card.lbl_prev_player'))
        : selectHtml('card-recipient', t('card.lbl_apply_to'));
      $('#card-foot').innerHTML = `
        ${cardPlayersRefHtml()}
        <div class="card-actions">
          ${recipientControls}
          ${roleControls(c, selectHtml)}
          <p id="card-preview" class="card-preview" aria-live="polite"></p>
          <div class="card-buttons">
            <button class="btn btn-ghost" id="card-redraw">${t('card.btn_redraw')}</button>
            <button class="btn btn-primary" id="card-apply">${t('card.btn_apply_reward')}</button>
          </div>
        </div>
      `;

      $('#card-redraw').addEventListener('click', () => {
        draft.currentCard = drawFromDeck(draft.currentDeckKey);
        renderCard();
      });
      if (c.extraReward?.role === 'participants') {
        $('#card-recipient').addEventListener('change', () => {
          $$('.card-participant', $('#card-foot')).forEach(input => {
            input.disabled = input.value === $('#card-recipient').value;
            if (input.disabled) input.checked = false;
          });
        });
      }
      bindPreview(c);
      $('#card-apply').addEventListener('click', () => {
        const pid = $('#card-recipient').value;
        if (!pid) { toast(t('messages.select_player')); return; }
        if (draft.currentCard.both) {
          const pid2 = $('#card-recipient2').value;
          if (!pid2) { toast(t('messages.select_prev_player')); return; }
          if (pid2 === pid) { toast(t('messages.same_player_error')); return; }
          submitCard(() => applyCardReward([pid, pid2], draft.currentCard));
        } else {
          const extraIds = c.extraReward?.role === 'answerer' ? [$('#card-answerer').value] :
            c.extraReward?.role === 'participants' ? $$('.card-participant', $('#card-foot')).filter(input => input.checked).map(input => input.value) : [];
          if (extraIds.includes('')) { toast(t('card.select_answerer')); return; }
          if (extraIds.includes(pid)) { toast(t('messages.same_player_error')); return; }
          submitCard(() => applyCardReward(pid, draft.currentCard, extraIds));
        }
      });
    }

    function rewardLineHtml(c) {
      const mult = scoreMultiplier();
      if (mult.id !== null) {
        const doubled = describeReward(scaleReward(c.reward || {}, mult));
        return `<div class="card-reward sprint">${t('weather.card_multiplier_applied', { weather: getWeatherLabel(mult.id), doubled: escapeHtml(doubled) })}` +
               `<span class="card-reward-base">${t('card.reward_original', {reward: escapeHtml(c.rewardText)})}</span></div>`;
      }
      return `<div class="card-reward">${t('card.reward_prefix')}${escapeHtml(c.rewardText)}</div>`;
    }

    function sideLineHtml(c) {
      if (!c.side) return '';
      const mult = scoreMultiplier();
      const note = mult.id !== null
        ? `<span class="card-side-x2">${t('weather.card_manual_calc', { weather: getWeatherLabel(mult.id) })}</span>`
        : '';
      return `<p class="card-side">${t('card.side_prefix')}${escapeHtml(c.side)}${note}</p>`;
    }

    function renderActionBody(c) {
      return `
        <div class="card-display">
          <div class="card-category">${escapeHtml(c.category)}</div>
          <h3 class="card-name">${escapeHtml(c.name)}</h3>
          <p class="card-desc">${escapeHtml(c.desc)}</p>
          ${sideLineHtml(c)}
          ${extraRewardHtml(c)}
          ${rewardLineHtml(c)}
        </div>
      `;
    }

    function renderBoostBody(c) {
      return `
        <div class="card-display">
          <div class="card-category">${t('card.title_boost')}</div>
          <h3 class="card-name">${escapeHtml(c.name)}</h3>
          <div class="card-section">
            <div class="card-section-label">${t('card.lbl_instant_action')}</div>
            <p class="card-section-text">${escapeHtml(c.action)}</p>
          </div>
          <div class="card-section">
            <div class="card-section-label">${t('card.lbl_insight')}</div>
            <p class="card-section-text">${escapeHtml(c.insight)}</p>
          </div>
          ${sideLineHtml(c)}
          ${extraRewardHtml(c)}
          ${rewardLineHtml(c)}
        </div>
      `;
    }

    function describeChoiceOption(card, opt) {
      const { each, civAll } = choiceEffects(opt);
      const parts = [];
      const eachTxt = describeReward(each);
      if (eachTxt) parts.push(((opt.both ?? card.both) ? t('card.each_prefix') : '') + eachTxt);
      if (opt.actor) parts.push(t('card.actor_effect', { reward: describeReward(scaleReward(opt.actor, scoreMultiplier())) }));
      if (opt.civAllExclude === 'actor') parts.push(t('card.except_actor'));
      if (opt.availableWhen) parts.push(t('card.condition', { op: opt.availableWhen.civGte === undefined ? '<' : '≥', threshold: opt.availableWhen.civGte ?? opt.availableWhen.civLt }));
      if (civAll) parts.push(t('card.collective_civ', { delta: (civAll > 0 ? '+' : '') + civAll }));
      return parts.length ? parts.join('　·　') : t('card.no_score_change');
    }

    function renderChoiceCard(c) {
      const mult = scoreMultiplier();
      const label = c.type === 'boost' ? (c.series || t('card.title_boost')) : (c.category || t('card.title_action'));

      const total = totalCiv();
      const available = c.options.map((_, index) => index).filter(index => optionAvailable(c, index, total));
      if (!available.includes(draft.currentChoiceOpt)) draft.currentChoiceOpt = null;
      if (available.length === 1) draft.currentChoiceOpt = available[0];
      const condHtml = c.conditional || c.options.some(opt => opt.availableWhen)
        ? `<p class="dilemma-cond">${t('card.current_civ', { total })}</p>` : '';

      const optionsHtml = (c.options || []).map((opt, i) => {
        const selected = draft.currentChoiceOpt === i;
        const disabled = !available.includes(i);
        return `
          <button type="button" class="dilemma-opt${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}"
                  data-opt="${i}" ${disabled ? 'disabled' : ''}>
            <span class="do-label">${escapeHtml(opt.label)}</span>
            <span class="do-effects">${escapeHtml(describeChoiceOption(c, opt))}</span>
            ${opt.side ? `<span class="do-side">${escapeHtml(t('card.manual_side', { side: opt.side }))}</span>` : ''}
            ${opt.insight ? `<span class="do-insight">${escapeHtml(opt.insight)}</span>` : ''}
          </button>`;
      }).join('');

      const sprintHtml = mult.id !== null
        ? `<div class="card-reward sprint">${t('weather.card_converted', { weather: getWeatherLabel(mult.id), gain: mult.gain, loss: mult.loss })}</div>` : '';

      $('#card-body').innerHTML = `
        <div class="card-display dilemma">
          <div class="card-category">${escapeHtml(label)}</div>
          <h3 class="card-name">${escapeHtml(c.name)}</h3>
          <p class="card-desc">${escapeHtml(c.scene || '')}</p>
          ${condHtml}
          <div class="dilemma-options">${optionsHtml}</div>
          ${sprintHtml}
          <p class="dilemma-note">${t('card.table_note')}</p>
        </div>
      `;

      const playerOpts = getGame().players.map(p =>
        `<option value="${p.id}">${escapeHtml(p.name || t('common.player'))}　（福 ${p.fortune} · 慧 ${p.wisdom} · 文 ${p.civ}）</option>`
      ).join('');
      const selectHtml = (id, lbl) => `
          <label class="row">
            <span>${lbl}</span>
            <select id="${id}">
              <option value="">${t('card.lbl_select_player')}</option>
              ${playerOpts}
            </select>
          </label>`;
      const recipientControls = c.both
        ? selectHtml('card-recipient', t('card.lbl_self')) + selectHtml('card-recipient2', t('card.lbl_other_player'))
        : selectHtml('card-recipient', t('card.lbl_apply_to'));
      $('#card-foot').innerHTML = `
        ${cardPlayersRefHtml()}
        <div class="card-actions">
          ${recipientControls}
          <p id="card-preview" class="card-preview" aria-live="polite"></p>
          <div class="card-buttons">
            <button class="btn btn-ghost" id="card-redraw">${t('card.btn_redraw')}</button>
            <button class="btn btn-primary" id="card-apply">${t('card.btn_apply_dilemma')}</button>
          </div>
        </div>
      `;

      $$('.dilemma-opt', $('#card-body')).forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.classList.contains('disabled')) return;
          draft.currentChoiceOpt = +btn.dataset.opt;
          $$('.dilemma-opt', $('#card-body')).forEach(b =>
            b.classList.toggle('selected', +b.dataset.opt === draft.currentChoiceOpt));
        });
      });

      $('#card-redraw').addEventListener('click', () => {
        draft.currentCard = drawFromDeck(draft.currentDeckKey);
        draft.currentChoiceOpt = null;
        renderCard();
      });
      const syncPartner = () => {
        if (!c.both) return;
        const select = $('#card-recipient2');
        const needed = draft.currentChoiceOpt == null || (c.options[draft.currentChoiceOpt].both ?? c.both);
        select.disabled = !needed;
        const row = select.closest?.('label');
        if (row) row.hidden = !needed;
      };
      $$('.dilemma-opt', $('#card-body')).forEach(btn => btn.addEventListener('click', syncPartner));
      syncPartner();
      bindPreview(c, true);
      $$('.dilemma-opt', $('#card-body')).forEach(btn => btn.addEventListener('click', () => updatePreview(c, true)));
      $('#card-apply').addEventListener('click', () => {
        if (draft.currentChoiceOpt == null) { toast(t('messages.select_choice')); return; }
        const pid = $('#card-recipient').value;
        if (!pid) { toast(t('messages.select_player')); return; }
        if (!optionAvailable(c, draft.currentChoiceOpt, totalCiv())) {
          toast(t('card.invalid_selection'));
          renderChoiceCard(c);
          return;
        }
        if (c.options[draft.currentChoiceOpt].both ?? c.both) {
          const pid2 = $('#card-recipient2').value;
          if (!pid2) { toast(t('messages.select_target')); return; }
          if (pid2 === pid) { toast(t('messages.same_player_error')); return; }
          submitCard(() => applyChoiceCard([pid, pid2], c, draft.currentChoiceOpt));
        } else {
          submitCard(() => applyChoiceCard([pid], c, draft.currentChoiceOpt));
        }
      });
    }

    function openCatalog(deckKey = 'action') {
      // Update tab labels with current counts
      $$('.catalog-tab').forEach(b => {
        const k = b.dataset.tab;
        const n = getDecks()[k] ? getDecks()[k].pool.length : 0;
        b.textContent = `${getDecks()[k].title} · ${n}`;
      });
      renderCatalog(deckKey);
      modals.open('catalog-modal');
    }

    function closeCatalog() {
      modals.close('catalog-modal');
    }

    function renderCatalog(deckKey) {
      $$('.catalog-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === deckKey);
      });
      const body = $('#catalog-body');
      if (deckKey === 'action') {
        body.innerHTML = Object.entries(getActionDeck()).map(([cat, data]) => `
          <section class="catalog-group">
            <header class="catalog-group-head">
              <span class="catalog-group-name">${escapeHtml(cat)}</span>
              <span class="catalog-group-reward">${escapeHtml(data.rewardText)}</span>
            </header>
            ${data.cards.map(c => catalogActionCardHtml(c, data)).join('')}
          </section>
        `).join('');
      } else if (deckKey === 'boost') {
        body.innerHTML = `
          <section class="catalog-group">
            ${getBoostDeck().map(catalogBoostCardHtml).join('')}
          </section>
        `;
      }
      body.scrollTop = 0;
    }

    function catalogActionCardHtml(c, deckData) {
      if (Array.isArray(c.options)) return catalogChoiceCardHtml(c);
      const rewardText = c.rewardText || deckData.rewardText;
      return `
        <article class="catalog-card">
          <header class="cc-head">
            <h4 class="cc-name">${escapeHtml(c.name)}</h4>
            <span class="cc-reward">${escapeHtml(rewardText)}</span>
          </header>
          <p class="cc-desc">${escapeHtml(c.desc)}</p>
          ${extraRewardHtml(c)}
          ${c.side ? `<p class="cc-side">附加：${escapeHtml(c.side)}</p>` : ''}
        </article>
      `;
    }

    function catalogChoiceCardHtml(c) {
      const opts = (c.options || []).map(o => {
        const parts = [];
        const eachTxt = describeReward(o.each || {});
        if (eachTxt) parts.push(((o.both ?? c.both) ? t('card.each_prefix') : '') + eachTxt);
        if (o.actor) parts.push(t('card.actor_effect', { reward: describeReward(o.actor) }));
        if (o.civAllExclude === 'actor') parts.push(t('card.except_actor'));
        if (o.availableWhen) parts.push(t('card.condition', { op: o.availableWhen.civGte === undefined ? '<' : '≥', threshold: o.availableWhen.civGte ?? o.availableWhen.civLt }));
        if (o.civAll) parts.push(t('card.collective_civ', { delta: (o.civAll > 0 ? '+' : '') + o.civAll }));
        const fx = parts.length ? parts.join('　·　') : t('card.no_score_change');
        return `
          <div class="cc-opt">
            <p class="cc-line"><span class="cc-section-label">${escapeHtml(o.label)}</span>${escapeHtml(fx)}</p>
            ${o.side ? `<p class="cc-side">附加：${escapeHtml(o.side)}</p>` : ''}
            ${o.insight ? `<p class="cc-insight">${escapeHtml(o.insight)}</p>` : ''}
          </div>`;
      }).join('');
      return `
        <article class="catalog-card">
          <header class="cc-head">
            <h4 class="cc-name">${escapeHtml(c.name)}${c.both ? '　<span class="cc-both">雙人</span>' : ''}</h4>
            ${c.conditional ? `<span class="cc-reward">條件卡 · 文明 ${c.conditional.civGte}</span>` : ''}
          </header>
          <p class="cc-desc">${escapeHtml(c.scene || '')}</p>
          ${opts}
        </article>
      `;
    }

    function catalogBoostCardHtml(c) {
      if (Array.isArray(c.options)) return catalogChoiceCardHtml(c);
      return `
        <article class="catalog-card">
          <header class="cc-head">
            <h4 class="cc-name">${escapeHtml(c.name)}</h4>
            <span class="cc-reward">${escapeHtml(c.rewardText)}</span>
          </header>
          <p class="cc-line"><span class="cc-section-label">${t('card.lbl_instant_action')}</span>${escapeHtml(c.action)}</p>
          <p class="cc-line"><span class="cc-section-label">${t('card.lbl_insight')}</span>${escapeHtml(c.insight)}</p>
          ${extraRewardHtml(c)}
          ${c.side ? `<p class="cc-side">附加：${escapeHtml(c.side)}</p>` : ''}
        </article>
      `;
    }

    function openDeckManager() {
      renderDeckManager();
      const p = $('#dm-paste'); if (p) p.value = '';
      modals.open('deck-manager-modal');
    }

    function closeDeckManager() {
      modals.close('deck-manager-modal');
    }

    function deckSourceLabel(side) {
      const custom = getState().settings.customDecks && getState().settings.customDecks[side];
      return t(custom ? 'dm.source_custom' : 'dm.source_default');
    }

    function deckCardCount(side) {
      if (side === 'action') {
        return Object.values(getActionDeck()).reduce((s, d) => s + (d.cards ? d.cards.length : 0), 0);
      }
      return getBoostDeck().length;
    }

    function renderDeckManager() {
      $('#dm-action-source').textContent = deckSourceLabel('action');
      $('#dm-action-count').textContent  = deckCardCount('action') + t('dm.count_suffix');
      $('#dm-boost-source').textContent  = deckSourceLabel('boost');
      $('#dm-boost-count').textContent   = deckCardCount('boost') + t('dm.count_suffix');
    }

    function exportDecks() {
      const data = {
        actionDeck: getActionDeck(),
        boostDeck:  getBoostDeck(),
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fuhui-decks-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      toast(t('messages.json_downloaded'));
    }

    function importDeckFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          applyDecksImport(data);
        } catch (err) {
          toast(t('messages.json_parse_error') + '：' + err.message);
        }
      };
      reader.onerror = () => toast(t('messages.read_fail'));
      reader.readAsText(file, 'utf-8');
    }

    function importPastedJSON() {
      const raw = $('#dm-paste').value.trim();
      if (!raw) { toast(t('messages.paste_json_first')); return; }
      try {
        const data = JSON.parse(raw);
        applyDecksImport(data);
      } catch (err) {
        toast(t('messages.json_parse_error') + '：' + err.message);
      }
    }

    let bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      $('#btn-draw-action').addEventListener('click', () => openCardDraw('action'));
      $('#btn-draw-boost').addEventListener('click', () => openCardDraw('boost'));
      $('#btn-quick-action').addEventListener('click', () => openCardDraw('action'));
      $('#btn-quick-boost').addEventListener('click', () => openCardDraw('boost'));
      $('#btn-browse-cards').addEventListener('click', () => openCatalog('action'));
      $('#catalog-close').addEventListener('click', closeCatalog);
      $$('.catalog-tab').forEach(b => {
        b.addEventListener('click', () => renderCatalog(b.dataset.tab));
      });

      // Deck manager
      $('#btn-deck-manager').addEventListener('click', openDeckManager);
      $('#dm-close').addEventListener('click', closeDeckManager);
      $('#dm-export').addEventListener('click', exportDecks);
      $('#dm-file-btn').addEventListener('click', () => $('#dm-file').click());
      $('#dm-file').addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) importDeckFile(f);
        e.target.value = '';  // allow re-selecting same file
      });
      $('#dm-paste-apply').addEventListener('click', importPastedJSON);
      $('#dm-reset').addEventListener('click', resetDecksToDefault);
      $('#card-close').addEventListener('click', closeCard);
    }

    return { openCardDraw, closeCard, renderCard, openCatalog, closeCatalog, renderCatalog, openDeckManager, closeDeckManager, describeChoiceOption, renderDeckManager, bind };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.CardsUI = api;
})();
