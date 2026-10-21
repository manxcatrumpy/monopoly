// 純規則：不讀取 DOM、時間或儲存，也不改動傳入的遊戲資料。
(function () {
  const CONFIG = typeof module === 'object' && module.exports ? require('./config.js') : GAME_CONFIG;
  const STATS = ['fortune', 'wisdom', 'civ'];

  function gameMinutes(count, config = CONFIG) {
    return config.TIME.BASE_MINUTES + Math.max(0, count - config.TIME.BASE_PLAYERS) * config.TIME.EXTRA_PLAYER_MINUTES;
  }
  function expectedCiv(turn, goal, config = CONFIG) {
    return goal * turn / config.EXPECTED_ROUNDS;
  }
  function judgeWeather(current, turn, goal, config = CONFIG) {
    const expected = expectedCiv(turn, goal, config);
    if (current >= expected * config.WEATHER.FAVORABLE_RATIO) return 'FAVORABLE';
    if (current <= expected * config.WEATHER.DISASTER_RATIO) return 'DISASTER';
    return 'NORMAL';
  }
  function weatherUpgradeTarget(weather, turn, goal, config = CONFIG) {
    const expected = expectedCiv(turn, goal, config);
    if (weather === 'DISASTER') return Math.floor(expected * config.WEATHER.DISASTER_RATIO) + 1;
    if (weather === 'NORMAL') return Math.ceil(expected * config.WEATHER.FAVORABLE_RATIO);
    return null;
  }
  function weatherPhase(turn, events) {
    for (const ev of events) {
      if (turn === ev.targetRound - 2) return { phase: 'FORECAST', ev };
      if (turn === ev.targetRound - 1) return { phase: 'ADJUST', ev };
      if (turn === ev.targetRound) return { phase: 'REPORT', ev };
    }
    return { phase: 'NORMAL', ev: null };
  }

  function calculateScoreBatch(players, operations) {
    const changes = new Map();
    for (const operation of operations) {
      const player = players.find(p => p.id === operation.playerId);
      if (!player) continue;
      let change = changes.get(player.id);
      if (!change) {
        const before = Object.fromEntries(STATS.map(stat => [stat, player[stat] || 0]));
        change = { playerId: player.id, before, after: { ...before } };
        changes.set(player.id, change);
      }
      for (const stat of STATS) {
        if (operation.values && operation.values[stat] !== undefined) {
          if (!Number.isSafeInteger(operation.values[stat])) throw new Error('Invalid score value');
          change.after[stat] = operation.values[stat];
        }
        if (operation.delta && operation.delta[stat] !== undefined) {
          if (!Number.isSafeInteger(operation.delta[stat])) throw new Error('Invalid score delta');
          change.after[stat] += operation.delta[stat];
        }
      }
    }
    // 全部變更合併後才夾到零，避免一張卡的中間值影響結算。
    return Array.from(changes.values(), change => {
      for (const stat of STATS) {
        if (!Number.isSafeInteger(change.after[stat])) throw new Error('Score exceeds safe integer range');
        change.after[stat] = Math.max(0, change.after[stat]);
      }
      change.changedStats = STATS.filter(stat => change.before[stat] !== change.after[stat]);
      return change;
    }).filter(change => change.changedStats.length > 0);
  }

  function evaluatePlayerProgress(player, before, navigatorClaimed, rules) {
    const notified = { ...player.notified };
    const claims = { ...navigatorClaimed };
    const events = [];
    const threshold = rules.graduation;
    const singleKey = 'single_' + threshold;
    for (const stat of ['fortune', 'wisdom']) {
      if (before[stat] < threshold && player[stat] >= threshold && !notified[singleKey]) {
        notified[singleKey] = true;
        events.push({ type: 'single', playerId: player.id, stat, threshold });
      }
    }
    const graduated = player.fortune >= threshold && player.wisdom >= threshold;
    if (graduated !== !!player.graduated) {
      events.push({ type: graduated ? 'graduated' : 'downgraded', playerId: player.id, threshold });
    }
    const both = Math.min(player.fortune || 0, player.wisdom || 0);
    for (const n of rules.navigator) {
      if (both >= n && claims[n] == null) {
        claims[n] = player.id;
        events.push({ type: 'navigator', playerId: player.id, threshold: n });
      }
    }
    for (const n of rules.self) {
      const key = 'self' + n;
      if (both >= n && !notified[key]) {
        notified[key] = true;
        events.push({ type: 'breakthrough', playerId: player.id, threshold: n });
      }
    }
    return { notified, graduated, navigatorClaimed: claims, events };
  }

  function evaluateGameStatus(game, { elapsed, maxSeconds, sprintSeconds }) {
    const started = game.players.length > 0;
    const goalReached = started && game.players.reduce((sum, p) => sum + (p.civ || 0), 0) >= game.civGoal;
    const allGraduated = started && game.players.every(p => p.graduated);
    const sprint = started && elapsed >= maxSeconds - sprintSeconds;
    const timeUp = started && elapsed >= maxSeconds;
    const events = [];
    if (goalReached && !game._civGoalNoticed) events.push({ type: 'civGoal', goal: game.civGoal });
    if (allGraduated && !game._allGradNoticed) events.push({ type: 'allGraduated' });
    if (sprint && !game._sprintNoticed) events.push({ type: 'sprint' });
    if (timeUp && !game._timeUpNoticed) events.push({ type: 'timeUp', minutes: maxSeconds / 60 });
    return {
      flags: {
        _civGoalNoticed: goalReached,
        _allGradNoticed: allGraduated,
        _sprintNoticed: !!game._sprintNoticed || sprint,
        _timeUpNoticed: !!game._timeUpNoticed || timeUp,
      },
      stopTimer: timeUp && game.timer.running,
      events,
    };
  }

  function applyMultiplier(value, stat, multiplier) {
    if (!value) return 0;
    if (stat === 'civ' || stat === 'civAll') return value;
    return value >= 0
      ? Math.round(value * multiplier.gain)
      : -Math.round(Math.abs(value) * multiplier.loss);
  }

  function qualifyingReliefStats(player, before, threshold) {
    return ['fortune', 'wisdom'].filter(stat =>
      player[stat] < before[stat] && player[stat] <= threshold &&
      !player.reliefUsed?.[stat] && !player.selfSelectedLow?.[stat]
    );
  }

  function canTrade(game, playerId) {
    return !!game.exchange?.opened && game.players.some(p => p.id === playerId) &&
      !game.actedThisTurn?.[playerId] && !game.skippedThisTurn?.[playerId] && game.exchange.movementThisTurn[playerId]?.mode !== 'navigation';
  }

  function planExchangePurchase(game, playerId, cart) {
    if (!canTrade(game, playerId)) throw new Error('exchange.unavailable');
    const quantities = ['navigation', 'shield', 'investment'].map(key => cart[key] ?? 0);
    if (quantities.some(n => !Number.isSafeInteger(n) || n < 0) || !quantities.some(n => n > 0)) throw new Error('exchange.invalid_quantity');
    const [navigation, shield, investment] = quantities;
    const cfg = CONFIG.EXCHANGE;
    const cost = { fortune: shield * cfg.SHIELD_COST + investment * cfg.INVESTMENT_COST, wisdom: navigation * cfg.NAVIGATION_COST };
    const p = game.players.find(p => p.id === playerId);
    if (![cost.fortune, cost.wisdom, p.navigationTokens + navigation, p.shieldTokens + shield, p.investmentTokens + investment].every(Number.isSafeInteger)) throw new Error('exchange.invalid_quantity');
    if (cost.fortune > p.fortune || cost.wisdom > p.wisdom) throw new Error('exchange.insufficient');
    const operations = [{ playerId, delta: { fortune: -cost.fortune, wisdom: -cost.wisdom } }];
    // Buying only charges points and adds inventory; no service is activated here.
    try { calculateScoreBatch(game.players, operations); }
    catch (error) { throw new Error('exchange.invalid_quantity', { cause: error }); }
    return { navigation, shield, investment, cost, operations };
  }

  function planInvestmentActivation(game, playerId, targetId, quantity) {
    if (!canTrade(game, playerId)) throw new Error('exchange.unavailable');
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('exchange.invalid_use_quantity');
    const p = game.players.find(p => p.id === playerId);
    if (quantity > p.investmentTokens) throw new Error('exchange.insufficient_stock');
    if (targetId === playerId || !game.players.some(p => p.id === targetId)) throw new Error('exchange.invalid_target');
    if (!Number.isSafeInteger(game.exchange.nextInvestmentId + 1)) throw new Error('exchange.invalid_use_quantity');
    const operations = [{ playerId: targetId, delta: { wisdom: quantity } }];
    try { calculateScoreBatch(game.players, operations); }
    catch (error) { throw new Error('exchange.invalid_use_quantity', { cause: error }); }
    return { operations };
  }

  // A qualifying receipt pays once per investment and observation round, even if later losses erase it.
  function evaluateInvestmentGrowth(game, changes) {
    const grown = new Set(changes.filter(c => ['fortune', 'wisdom'].some(stat => c.after[stat] > c.before[stat])).map(c => c.playerId));
    const operations = [], events = [];
    const investments = game.exchange.investments.map(item => {
      if (item.closed || !grown.has(item.targetId) || game.turnNum <= item.startTurn || game.turnNum > item.startTurn + 2 || item.rewardedTurns.includes(game.turnNum)) return item;
      operations.push({ playerId: item.investorId, delta: { civ: item.quantity } });
      events.push({ investorId: item.investorId, targetId: item.targetId, quantity: item.quantity, turn: game.turnNum });
      return { ...item, rewardedTurns: [...item.rewardedTurns, game.turnNum] };
    });
    return { investments, operations, events };
  }

  function closeInvestments(game, completedTurn) {
    const operations = [], events = [];
    const investments = game.exchange.investments.map(item => {
      if (item.closed || completedTurn < item.startTurn + 2) return item;
      const refund = item.rewardedTurns.length === 0 ? item.quantity * CONFIG.EXCHANGE.REFUND : 0;
      if (refund) operations.push({ playerId: item.investorId, delta: { fortune: refund } });
      events.push({ investorId: item.investorId, targetId: item.targetId, refund });
      return { ...item, closed: true };
    });
    return { investments, operations, events };
  }

  const rules = { canTrade, planExchangePurchase, planInvestmentActivation, evaluateInvestmentGrowth, closeInvestments,
    calculateScoreBatch, evaluatePlayerProgress, evaluateGameStatus, applyMultiplier, qualifyingReliefStats,
    gameMinutes, expectedCiv, judgeWeather, weatherUpgradeTarget, weatherPhase };
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else globalThis.GameRules = rules;
})();
