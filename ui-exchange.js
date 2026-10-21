// 交易所表單只管理 UI 草稿；庫存、扣點與投資結算交給 app。
(function () {
  'use strict';
  function create({ $, t, escapeHtml, modals, getGame, canTrade, config, purchase, activateInvestment, useNavigation, beginDice }) {
    let selectedId = null, bound = false, busy = false;
    const esc = value => escapeHtml(String(value));
    function cart() {
      return Object.fromEntries(['navigation', 'shield', 'investment'].map(key => [key, Number($('#exchange-' + key).value)]));
    }
    function preview() {
      const game = getGame(), p = game.players.find(p => p.id === selectedId);
      const amounts = cart();
      const valid = Object.values(amounts).every(n => Number.isSafeInteger(n) && n >= 0);
      const fortune = amounts.shield * config.SHIELD_COST + amounts.investment * config.INVESTMENT_COST;
      const wisdom = amounts.navigation * config.NAVIGATION_COST;
      $('#exchange-cost').textContent = valid && Number.isSafeInteger(fortune) && Number.isSafeInteger(wisdom)
        ? t('exchange.cost', { fortune, wisdom }) : t('exchange.invalid_quantity');
      $('#exchange-buy').disabled = busy || !p || !canTrade(game, selectedId) || !valid ||
        !Object.values(amounts).some(n => n > 0) || fortune > p.fortune || wisdom > p.wisdom;
      const quantity = Number($('#exchange-activate-quantity').value);
      $('#exchange-activate-investment').disabled = busy || !p || !canTrade(game, selectedId) ||
        !Number.isSafeInteger(quantity) || quantity < 1 || quantity > p.investmentTokens || !$('#exchange-target').value;
    }
    function render() {
      const game = getGame();
      if (!game.players.some(p => p.id === selectedId)) selectedId = game.players[0]?.id || null;
      const p = game.players.find(p => p.id === selectedId);
      $('#exchange-player').innerHTML = game.players.map(player => `<option value="${player.id}">${esc(player.name)}</option>`).join('');
      $('#exchange-player').value = selectedId || '';
      const targetId = $('#exchange-target').value;
      $('#exchange-target').innerHTML = `<option value="">${esc(t('exchange.choose_target'))}</option>` + game.players.filter(player => player.id !== selectedId).map(player => `<option value="${player.id}">${esc(player.name)}</option>`).join('');
      $('#exchange-target').value = game.players.some(player => player.id === targetId && player.id !== selectedId) ? targetId : '';
      $('#exchange-balance').textContent = p ? t('exchange.balance', { fortune: p.fortune, wisdom: p.wisdom }) : '';
      $('#exchange-stock').textContent = p ? t('exchange.stock', { navigation: p.navigationTokens, shield: p.shieldTokens, investment: p.investmentTokens }) : '';
      const available = !!p && canTrade(game, selectedId);
      $('#exchange-shop').disabled = !available || busy;
      $('#exchange-activation').disabled = !available || busy || !p.investmentTokens;
      $('#exchange-activate-quantity').max = String(p?.investmentTokens || 0);
      $('#exchange-unavailable').hidden = available;
      $('#exchange-use-navigation').disabled = !available || busy || !p.navigationTokens;
      $('#exchange-begin-dice').disabled = !available || busy;
      const movement = game.exchange.movementThisTurn[selectedId];
      $('#exchange-movement').textContent = movement ? (movement.mode === 'navigation' ? t('exchange.moved_navigation', { steps: movement.steps }) : t('exchange.moved_dice')) : '';
      $('#exchange-investments').innerHTML = game.exchange.investments.filter(item => !item.closed).map(item => {
        const investor = game.players.find(p => p.id === item.investorId), target = game.players.find(p => p.id === item.targetId);
        return `<li>${esc(t('exchange.investment_status', { name: investor?.name || '', target: target?.name || '', count: item.quantity,
          first: item.startTurn + 1, second: item.startTurn + 2, firstResult: t(item.rewardedTurns.includes(item.startTurn + 1) ? 'exchange.grown' : 'exchange.waiting'),
          secondResult: t(item.rewardedTurns.includes(item.startTurn + 2) ? 'exchange.grown' : 'exchange.waiting') }))}</li>`;
      }).join('') || `<li>${esc(t('exchange.no_investments'))}</li>`;
      preview();
    }
    function refresh() {
      $('#btn-exchange').disabled = !getGame().exchange.opened;
      $('#exchange-status').textContent = t(getGame().exchange.opened ? 'exchange.open_status' : 'exchange.closed_status');
      if (modals.isOpen('exchange-modal')) render();
    }
    function open(id) {
      selectedId = id || getGame().players[0]?.id || null;
      for (const key of ['navigation', 'shield', 'investment']) $('#exchange-' + key).value = '0';
      $('#exchange-steps').value = '1';
      $('#exchange-activate-quantity').value = '1';
      $('#exchange-target').value = '';
      render();
      modals.open('exchange-modal');
    }
    function announce(player) {
      $('#exchange-open-message').textContent = t('exchange.open_message', { name: player.name });
      modals.open('exchange-open-modal');
    }
    function bind() {
      if (bound) return;
      bound = true;
      $('#btn-exchange').addEventListener('click', () => open());
      $('#exchange-close').addEventListener('click', () => modals.close('exchange-modal'));
      $('#exchange-store-close').addEventListener('click', () => modals.close('exchange-modal'));
      $('#exchange-open-close').addEventListener('click', () => modals.close('exchange-open-modal'));
      $('#exchange-player').addEventListener('change', () => { selectedId = $('#exchange-player').value; render(); });
      for (const key of ['navigation', 'shield', 'investment']) $('#exchange-' + key).addEventListener('input', preview);
      $('#exchange-target').addEventListener('change', preview);
      $('#exchange-activate-quantity').addEventListener('input', preview);
      $('#exchange-buy').addEventListener('click', async () => {
        if (busy) return;
        const game = getGame();
        busy = true;
        try {
          const pending = purchase(selectedId, cart());
          render();
          if (await pending && getGame() === game) for (const key of ['navigation', 'shield', 'investment']) $('#exchange-' + key).value = '0';
        } finally { busy = false; if (getGame() === game) render(); }
      });
      $('#exchange-activate-investment').addEventListener('click', async () => {
        if (busy) return;
        const game = getGame();
        busy = true;
        try {
          const pending = activateInvestment(selectedId, $('#exchange-target').value, Number($('#exchange-activate-quantity').value));
          render();
          if (await pending && getGame() === game) $('#exchange-activate-quantity').value = '1';
        } finally { busy = false; if (getGame() === game) render(); }
      });
      $('#exchange-use-navigation').addEventListener('click', () => useNavigation(selectedId, Number($('#exchange-steps').value)));
      $('#exchange-begin-dice').addEventListener('click', () => beginDice(selectedId));
    }
    return { bind, open, render, refresh, announce };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.ExchangeUI = api;
})();
