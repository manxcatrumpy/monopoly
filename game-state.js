// 存檔與歷史共用的資料模型。純資料轉換，不讀取 DOM 或 localStorage。
(function () {
  const SCHEMA_VERSION = 2;
  const NOTICE_FLAGS = ['_timeUpNoticed', '_sprintNoticed', '_civGoalNoticed', '_allGradNoticed'];
  const WEATHER_TYPES = ['FAVORABLE', 'NORMAL', 'DISASTER'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const present = value => value !== undefined && value !== null;

  function record(value, label) {
    if (!present(value)) return {};
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid ' + label);
    return value;
  }
  function array(value, label) {
    if (!present(value)) return [];
    if (!Array.isArray(value)) throw new Error('Invalid ' + label);
    return value;
  }
  function number(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    if (!present(value)) return fallback;
    if (!Number.isFinite(value) || value < minimum || value > maximum || !Number.isSafeInteger(Math.floor(value))) throw new Error('Invalid number');
    return Math.floor(value);
  }
  function text(value, fallback = '') {
    if (!present(value)) return fallback;
    if (typeof value !== 'string') throw new Error('Invalid text');
    return value;
  }
  function boolean(value, fallback = false) {
    if (!present(value)) return fallback;
    if (typeof value !== 'boolean') throw new Error('Invalid flag');
    return value;
  }
  function flagMap(value) {
    return Object.fromEntries(Object.entries(record(value, 'flags')).map(([key, flag]) => [key, boolean(flag)]));
  }
  function weatherType(value) {
    if (!present(value)) return null;
    if (!WEATHER_TYPES.includes(value)) throw new Error('Invalid weather');
    return value;
  }

  function createGame(options = {}) {
    return {
      roundNum: 1, turnNum: 1, civGoal: 30,
      timer: { accumulated: 0, lastStartedAt: null, running: false },
      players: [], log: [], pendingDraws: [],
      navigatorClaimed: Object.fromEntries((options.navigatorThresholds || [10, 20, 30]).map(n => [n, null])),
      actedThisTurn: {}, skippedThisTurn: {},
      weatherEvents: (options.weatherSchedule || []).map(event => ({
        id: event.id, targetRound: event.targetRound, lockedWeather: null,
        upgraded: false, civAtLock: null, oldWeather: null,
      })),
      reliefSweepDone: false,
      _timeUpNoticed: false, _sprintNoticed: false, _civGoalNoticed: false, _allGradNoticed: false,
      incompleteFields: [],
    };
  }

  function createPlayer(source, options = {}) {
    const p = record(source, 'player');
    const id = text(p.id);
    if (!/^p\d+$/.test(id)) throw new Error('Invalid player id');
    const fortune = number(p.fortune, 0), wisdom = number(p.wisdom, 0);
    const relief = typeof p.reliefUsed === 'boolean'
      ? { fortune: p.reliefUsed, wisdom: p.reliefUsed } : record(p.reliefUsed, 'relief quota');
    const selected = record(p.selfSelectedLow, 'self-selected low');
    return {
      id, name: text(p.name), fortune, wisdom, civ: number(p.civ, 0),
      graduated: boolean(p.graduated, fortune >= (options.graduationThreshold || 30) && wisdom >= (options.graduationThreshold || 30)),
      notified: flagMap(p.notified),
      reliefUsed: { fortune: boolean(relief.fortune), wisdom: boolean(relief.wisdom) },
      selfSelectedLow: { fortune: boolean(selected.fortune), wisdom: boolean(selected.wisdom) },
      shelterFromTurn: present(p.shelterFromTurn) ? number(p.shelterFromTurn, null, 1) : null,
      shelterToTurn: present(p.shelterToTurn) ? number(p.shelterToTurn, null, 1) : null,
    };
  }

  function normalizeGame(source, options = {}, historical = false) {
    const raw = record(source, 'game');
    if (!Array.isArray(raw.players)) throw new Error('Missing players');
    const game = createGame(options);
    game.roundNum = number(raw.roundNum, 1, 1);
    game.turnNum = number(raw.turnNum, 1, 1);
    game.civGoal = number(raw.civGoal, 30, 1);
    game.players = raw.players.map(player => createPlayer(player, options));
    if (new Set(game.players.map(p => p.id)).size !== game.players.length) throw new Error('Duplicate player ids');
    const timer = record(raw.timer, 'timer');
    game.timer.accumulated = number(timer.accumulated, 0);
    game.timer.running = boolean(timer.running);
    game.timer.lastStartedAt = game.timer.running
      ? number(timer.lastStartedAt, options.now, 1, 8640000000000000) : null;
    if (historical) {
      const completedAt = present(raw.completedAt) ? number(raw.completedAt, null, 1, 8640000000000000) : null;
      if (game.timer.running && completedAt && game.timer.lastStartedAt) {
        game.timer.accumulated += Math.max(0, Math.floor((completedAt - game.timer.lastStartedAt) / 1000));
      }
      game.timer.running = false;
      game.timer.lastStartedAt = null;
      game.completedAt = completedAt;
    }
    game.log = array(raw.log, 'log').map(entry => ({
      text: text(record(entry, 'log entry').text),
      kind: ['grad', 'milestone'].includes(entry.kind) ? entry.kind : '',
      t: number(entry.t, 0),
    })).slice(0, 40);
    game.pendingDraws = array(raw.pendingDraws, 'pending draws').map(draw => {
      record(draw, 'pending draw');
      return { id: text(draw.id), text: text(draw.text), playerId: text(draw.playerId), t: number(draw.t, 0) };
    });
    for (const [threshold, owner] of Object.entries(record(raw.navigatorClaimed, 'navigator claims'))) {
      game.navigatorClaimed[threshold] = present(owner) ? text(owner) : null;
    }
    game.actedThisTurn = flagMap(raw.actedThisTurn);
    game.skippedThisTurn = flagMap(raw.skippedThisTurn);
    if (present(raw.weatherEvents)) {
      game.weatherEvents = array(raw.weatherEvents, 'weather').map(event => {
        record(event, 'weather event');
        return {
          id: text(event.id), targetRound: number(event.targetRound, 6, 1),
          lockedWeather: weatherType(event.lockedWeather), upgraded: boolean(event.upgraded),
          civAtLock: present(event.civAtLock) ? number(event.civAtLock, null) : null,
          oldWeather: weatherType(event.oldWeather),
        };
      });
    }
    game.incompleteFields = array(raw.incompleteFields, 'missing fields').map(field => text(field));
    if (historical) {
      for (const field of ['weatherEvents', 'pendingDraws', 'reliefSweepDone']) {
        if (raw[field] === undefined && !game.incompleteFields.includes(field)) game.incompleteFields.push(field);
      }
    }
    const maxSeconds = (100 + Math.max(0, game.players.length - 4) * 5) * 60;
    const sprintSeconds = (options.endgameMinutes || 15) * 60;
    const firstForecast = Math.min(...game.weatherEvents.map(event => Math.max(1, event.targetRound - 2)));
    game.reliefSweepDone = boolean(raw.reliefSweepDone, historical &&
      (game.turnNum >= firstForecast || game.timer.accumulated >= maxSeconds - sprintSeconds));
    const pastNotices = {
      _timeUpNoticed: game.timer.accumulated >= maxSeconds,
      _sprintNoticed: game.timer.accumulated >= maxSeconds - sprintSeconds,
      _civGoalNoticed: game.players.reduce((sum, p) => sum + p.civ, 0) >= game.civGoal,
      _allGradNoticed: game.players.length > 0 && game.players.every(p => p.graduated),
    };
    for (const flag of NOTICE_FLAGS) game[flag] = boolean(raw[flag], historical && pastNotices[flag]);
    return game;
  }

  function settings(source) {
    const raw = record(source, 'settings');
    const decks = record(raw.customDecks, 'custom decks');
    if (present(decks.action)) {
      for (const deck of Object.values(record(decks.action, 'action deck'))) {
        record(deck, 'card category');
        if (!Array.isArray(deck.cards)) throw new Error('Invalid cards');
        if (deck.cards.some(card => !card || typeof card.name !== 'string')) throw new Error('Invalid card');
      }
    }
    if (present(decks.boost) && !Array.isArray(decks.boost)) throw new Error('Invalid boost deck');
    if (decks.boost?.some(card => !card || typeof card.name !== 'string')) throw new Error('Invalid boost card');
    return { customDecks: { action: clone(decks.action ?? null), boost: clone(decks.boost ?? null) } };
  }

  function createState(options = {}) {
    return { schemaVersion: SCHEMA_VERSION, currentGame: createGame(options), history: [], settings: settings() };
  }

  function normalizeState(raw, options = {}) {
    record(raw, 'save');
    const legacy = raw.schemaVersion === undefined || raw.schemaVersion === 1;
    if (!legacy && raw.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported save version');
    const state = createState(options);
    state.currentGame = normalizeGame(legacy ? raw : raw.currentGame, options);
    const history = array(raw.history, 'history').slice();
    if (legacy && raw.previousRound) history.push(raw.previousRound);
    state.history = history.map(entry => normalizeGame(entry, options, true));
    state.settings = settings(legacy ? { customDecks: raw.customDecks } : raw.settings);
    return { state, migrated: legacy };
  }

  function decode(rawText, options = {}) {
    return normalizeState(JSON.parse(rawText), options);
  }

  function serialize(state, options = {}) {
    if (state.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported save version');
    return JSON.stringify(normalizeState(state, options).state);
  }

  function snapshotGame(game, options) {
    return normalizeGame({ ...game, completedAt: options.now }, options, true);
  }

  function swapHistory(state, index, options) {
    if (!Number.isInteger(index) || !state.history[index]) return null;
    const next = clone(state);
    next.currentGame = normalizeGame(state.history[index], options);
    next.history[index] = snapshotGame(state.currentGame, options);
    return next;
  }

  const model = { SCHEMA_VERSION, createState, createGame, createPlayer, decode, serialize, snapshotGame, swapHistory };
  if (typeof module === 'object' && module.exports) module.exports = model;
  else globalThis.GameState = model;
})();
