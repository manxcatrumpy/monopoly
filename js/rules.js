'use strict';

// Pure game rules. No DOM, no global state. Browser: window.GameRules.
// Node tests: module.exports. Callers pass config / turn / civ totals in.

const GameRules = (function () {
  const STATS = ['fortune', 'wisdom', 'civ'];

  const DEFAULTS = {
    EXPECTED_ROUNDS: 16,
    CIV_PER_PLAYER: 10,
    DIE_MIN: 1,
    DIE_MAX: 6,
    WEATHER_FAVORABLE_RATIO: 1.2,
    WEATHER_DISASTER_RATIO: 0.8,
    RELIEF: {
      EARLY_TURNS: 3,
      RESTORE_TO: 3,
      SHELTER_TURNS: 2,
      LATE_CIV_PERCENT: 25,
    },
  };

  function expectedCiv(turn, civGoal, expectedRounds) {
    const rounds = expectedRounds == null ? DEFAULTS.EXPECTED_ROUNDS : expectedRounds;
    return civGoal * turn / rounds;
  }

  function judgeWeather(civCurrent, turn, civGoal, expectedRounds) {
    const expected = expectedCiv(turn, civGoal, expectedRounds);
    if (civCurrent >= expected * DEFAULTS.WEATHER_FAVORABLE_RATIO) return 'FAVORABLE';
    if (civCurrent <= expected * DEFAULTS.WEATHER_DISASTER_RATIO) return 'DISASTER';
    return 'NORMAL';
  }

  function getPhase(turn, weatherEvents) {
    const events = weatherEvents || [];
    for (const ev of events) {
      if (turn === ev.targetRound - 2) return { phase: 'FORECAST', ev };
      if (turn === ev.targetRound - 1) return { phase: 'ADJUST', ev };
      if (turn === ev.targetRound) return { phase: 'REPORT', ev };
    }
    return { phase: 'NORMAL', ev: null };
  }

  function applyMult(val, stat, multObj) {
    if (!val) return 0;
    if (stat === 'civ' || stat === 'civAll') return val;
    const rate = val >= 0 ? multObj.gain : multObj.loss;
    const n = Math.round(val * rate);
    return n === 0 ? 0 : n;
  }

  function scaleReward(base, mult) {
    const src = base || {};
    const rates = mult || { gain: 1, loss: 1 };
    const out = {};
    STATS.forEach(stat => { out[stat] = applyMult(src[stat] || 0, stat, rates); });
    return out;
  }

  function clampDie(v, dieMin, dieMax) {
    const min = dieMin == null ? DEFAULTS.DIE_MIN : dieMin;
    const max = dieMax == null ? DEFAULTS.DIE_MAX : dieMax;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function computeCivGoal(white, black, playerCount, opts) {
    const o = opts || {};
    const dieMin = o.dieMin == null ? DEFAULTS.DIE_MIN : o.dieMin;
    const dieMax = o.dieMax == null ? DEFAULTS.DIE_MAX : o.dieMax;
    const civPerPlayer = o.civPerPlayer == null ? DEFAULTS.CIV_PER_PLAYER : o.civPerPlayer;
    return clampDie(white, dieMin, dieMax) * clampDie(black, dieMin, dieMax)
      + playerCount * civPerPlayer;
  }

  function reliefCfg(relief) {
    return Object.assign({}, DEFAULTS.RELIEF, relief || {});
  }

  function reliefPhaseOk(ctx, cfg) {
    const c = reliefCfg(cfg);
    const turnNum = ctx && ctx.turnNum;
    const civGoal = (ctx && ctx.civGoal) || 0;
    const total = (ctx && ctx.totalCiv) || 0;
    if (turnNum <= c.EARLY_TURNS) return true;
    if (civGoal <= 0) return false;
    return total * 100 < civGoal * c.LATE_CIV_PERCENT;
  }

  function reliefEligible(p, phaseOk) {
    return !!(p && !p.reliefUsed && phaseOk);
  }

  function reliefNeeded(p, phaseOk) {
    return reliefEligible(p, phaseOk) && ((p.fortune || 0) === 0 || (p.wisdom || 0) === 0);
  }

  function zeroedFwStats(p) {
    const stats = [];
    if ((p.fortune || 0) === 0) stats.push('fortune');
    if ((p.wisdom || 0) === 0) stats.push('wisdom');
    return stats;
  }

  function playerInShelter(p, turnNum) {
    if (!p || !p.reliefUsed) return false;
    const from = p.shelterFromTurn;
    const to = p.shelterToTurn;
    if (typeof from !== 'number' || typeof to !== 'number') return false;
    return turnNum >= from && turnNum <= to;
  }

  function isNewlyZeroed(oldVal, newVal) {
    return (oldVal || 0) > 0 && (newVal || 0) === 0;
  }

  function chargeWeatherAdjust(contributions, spent) {
    let remain = spent;
    return contributions.map(c => {
      const f = Math.min(c.f, remain);
      remain -= f;
      const w = Math.min(c.w, remain);
      remain -= w;
      return { id: c.id, name: c.name, f, w };
    });
  }

  function originReward(p, stop) {
    const graduated = !!p.graduated;
    return {
      fortune: stop ? 2 : 1,
      wisdom:  stop ? 2 : 1,
      civ:     (stop ? 1 : 0) + (graduated ? 1 : 0),
    };
  }

  function nextStatValue(value) {
    return Math.max(0, value | 0);
  }

  function deltasToPatch(player, deltas, stats) {
    const list = stats || STATS;
    const src = deltas || {};
    const patch = {};
    list.forEach(stat => {
      if (!src[stat]) return;
      patch[stat] = (player[stat] || 0) + src[stat];
    });
    return patch;
  }

  function applyStatPatch(player, patch, stats) {
    const list = stats || STATS;
    const src = patch || {};
    const changes = [];
    list.forEach(stat => {
      if (src[stat] === undefined) return;
      const old = player[stat] || 0;
      const next = nextStatValue(src[stat]);
      if (next === old) return;
      player[stat] = next;
      changes.push({ stat, old, next });
    });
    return changes;
  }

  return {
    STATS,
    DEFAULTS,
    expectedCiv,
    judgeWeather,
    getPhase,
    applyMult,
    scaleReward,
    clampDie,
    computeCivGoal,
    reliefCfg,
    reliefPhaseOk,
    reliefEligible,
    reliefNeeded,
    zeroedFwStats,
    playerInShelter,
    isNewlyZeroed,
    chargeWeatherAdjust,
    originReward,
    nextStatValue,
    deltasToPatch,
    applyStatPatch,
  };
})();

if (typeof module === 'object' && module.exports) {
  module.exports = GameRules;
} else {
  window.GameRules = GameRules;
}
