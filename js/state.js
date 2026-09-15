'use strict';

// Live game / save / history snapshot share one shape.
// No DOM, no localStorage. Browser: window.GameState. Node: module.exports.

const GameState = (function () {
  const ROUND_KEYS = [
    'roundNum',
    'turnNum',
    'civGoal',
    'timer',
    'players',
    'log',
    'navigatorClaimed',
    'actedThisTurn',
    'skippedThisTurn',
    'weatherEvents',
    'pendingDraws',
  ];

  const UI_FLAG_KEYS = [
    '_civGoalNoticed',
    '_sprintNoticed',
    '_timeUpNoticed',
    '_allGradNoticed',
  ];

  const DEFAULT_NAV = [15, 35, 55];

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function isFlagMap(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function emptyNavClaim(thresholds) {
    const nav = thresholds && thresholds.length ? thresholds : DEFAULT_NAV;
    return nav.reduce((o, n) => (o[n] = null, o), {});
  }

  function defaultTimer() {
    return { accumulated: 0, lastStartedAt: null, running: false };
  }

  function makeWeatherEvents(schedule) {
    return (schedule || []).map(ev => Object.assign({}, ev, {
      lockedWeather: null,
      upgraded: false,
      civAtLock: null,
    }));
  }

  function migrateWeatherEvents(events, schedule) {
    if (!Array.isArray(events)) return makeWeatherEvents(schedule);
    return events.map(ev => Object.assign({
      lockedWeather: null,
      upgraded: false,
      civAtLock: null,
    }, ev));
  }

  function migratePlayer(p) {
    if (!p || typeof p !== 'object') return p;
    if (p.reliefUsed !== true) p.reliefUsed = false;
    if (typeof p.shelterFromTurn !== 'number') p.shelterFromTurn = null;
    if (typeof p.shelterToTurn !== 'number') p.shelterToTurn = null;
    if (!p.notified || typeof p.notified !== 'object' || Array.isArray(p.notified)) {
      p.notified = {};
    }
    return p;
  }

  function defaultState(opts) {
    const o = opts || {};
    return {
      roundNum: 1,
      turnNum: 1,
      civGoal: 30,
      timer: defaultTimer(),
      players: [],
      log: [],
      pendingDraws: [],
      history: [],
      navigatorClaimed: emptyNavClaim(o.navThresholds),
      customDecks: { action: null, boost: null },
      actedThisTurn: {},
      skippedThisTurn: {},
      weatherEvents: makeWeatherEvents(o.weatherSchedule),
    };
  }

  function migrateRoundSnapshot(entry, opts) {
    const o = opts || {};
    const src = (!entry || typeof entry !== 'object') ? {} : clone(entry);
    const snap = {
      roundNum: src.roundNum || 1,
      turnNum: src.turnNum === undefined ? 1 : src.turnNum,
      civGoal: src.civGoal,
      timer: src.timer && typeof src.timer === 'object' ? src.timer : defaultTimer(),
      players: Array.isArray(src.players) ? src.players.map(migratePlayer) : [],
      log: Array.isArray(src.log) ? src.log : [],
      navigatorClaimed: Object.assign(emptyNavClaim(o.navThresholds), src.navigatorClaimed || {}),
      actedThisTurn: isFlagMap(src.actedThisTurn) ? src.actedThisTurn : {},
      skippedThisTurn: isFlagMap(src.skippedThisTurn) ? src.skippedThisTurn : {},
      weatherEvents: migrateWeatherEvents(src.weatherEvents, o.weatherSchedule),
      pendingDraws: Array.isArray(src.pendingDraws) ? src.pendingDraws : [],
    };
    if (src.completedAt) snap.completedAt = src.completedAt;
    return snap;
  }

  function migrateState(parsed, opts) {
    const base = defaultState(opts);
    if (!parsed || typeof parsed !== 'object') return base;
    const state = Object.assign({}, base, clone(parsed));

    if (!Array.isArray(state.history)) state.history = [];
    if (state.previousRound) {
      state.history.push(state.previousRound);
      delete state.previousRound;
    }
    state.history = state.history.map(entry => migrateRoundSnapshot(entry, opts));

    state.navigatorClaimed = Object.assign(
      emptyNavClaim(opts && opts.navThresholds),
      state.navigatorClaimed || {}
    );
    if (!Array.isArray(state.pendingDraws)) state.pendingDraws = [];
    state.customDecks = Object.assign({ action: null, boost: null }, state.customDecks || {});
    if (state.turnNum === undefined) state.turnNum = 1;
    if (!isFlagMap(state.actedThisTurn)) state.actedThisTurn = {};
    if (!isFlagMap(state.skippedThisTurn)) state.skippedThisTurn = {};
    state.weatherEvents = migrateWeatherEvents(state.weatherEvents, opts && opts.weatherSchedule);
    if (!Array.isArray(state.players)) state.players = [];
    state.players.forEach(migratePlayer);
    if (!state.timer || typeof state.timer !== 'object') state.timer = defaultTimer();
    if (!Array.isArray(state.log)) state.log = [];

    UI_FLAG_KEYS.forEach(k => { delete state[k]; });
    return state;
  }

  function snapshotRound(state, opts) {
    const raw = {};
    ROUND_KEYS.forEach(k => { raw[k] = state[k]; });
    return migrateRoundSnapshot(raw, opts);
  }

  function applyRoundSnapshot(live, entry, opts) {
    const snap = migrateRoundSnapshot(entry, opts);
    ROUND_KEYS.forEach(k => { live[k] = snap[k]; });
    return live;
  }

  function persistableState(state) {
    const copy = clone(state);
    UI_FLAG_KEYS.forEach(k => { delete copy[k]; });
    return copy;
  }

  function deriveUiFlags({ civReached, sprint, timeUp, allGraduated } = {}) {
    return {
      _civGoalNoticed: !!civReached,
      _sprintNoticed: !!sprint,
      _timeUpNoticed: !!timeUp,
      _allGradNoticed: !!allGraduated,
    };
  }

  return {
    ROUND_KEYS,
    UI_FLAG_KEYS,
    emptyNavClaim,
    defaultTimer,
    makeWeatherEvents,
    migratePlayer,
    defaultState,
    migrateRoundSnapshot,
    migrateState,
    snapshotRound,
    applyRoundSnapshot,
    persistableState,
    deriveUiFlags,
  };
})();

if (typeof module === 'object' && module.exports) {
  module.exports = GameState;
} else {
  window.GameState = GameState;
}
