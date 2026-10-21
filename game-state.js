// 存檔與歷史共用的資料模型。純資料轉換，不讀取 DOM 或 localStorage。
(function () {
  const CONFIG = typeof module === 'object' && module.exports ? require('./config.js') : GAME_CONFIG;
  const decksModel = typeof module === 'object' && module.exports ? require('./deck-model.js') : DeckModel;
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
  function strictCount(value, fallback, minimum = 0) {
    if (present(value) && !Number.isSafeInteger(value)) throw new Error('Invalid exchange integer');
    return number(value, fallback, minimum);
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
      navigatorClaimed: Object.fromEntries((options.navigatorThresholds || CONFIG.PROGRESSION.NAVIGATOR).map(n => [n, null])),
      actedThisTurn: {}, skippedThisTurn: {},
      exchange: { opened: false, openerId: null, openedTurn: null, nextInvestmentId: 1, investments: [], movementThisTurn: {} },
      weatherEvents: (options.weatherSchedule || CONFIG.WEATHER.SCHEDULE).map(event => ({
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
    const notified = flagMap(p.notified);
    // Older saves reset a previously claimed breakthrough to false after a score drop.
    // Presence of that flag still proves the threshold was claimed in this game.
    for (const threshold of CONFIG.PROGRESSION.SELF) {
      const key = 'self' + threshold;
      if (Object.hasOwn(notified, key)) notified[key] = true;
    }
    return {
      id, name: text(p.name), fortune, wisdom, civ: number(p.civ, 0),
      graduated: boolean(p.graduated, fortune >= (options.graduationThreshold ?? CONFIG.PROGRESSION.GRADUATION) && wisdom >= (options.graduationThreshold ?? CONFIG.PROGRESSION.GRADUATION)),
      notified,
      reliefUsed: { fortune: boolean(relief.fortune), wisdom: boolean(relief.wisdom) },
      selfSelectedLow: { fortune: boolean(selected.fortune), wisdom: boolean(selected.wisdom) },
      navigationTokens: strictCount(p.navigationTokens, 0), shieldTokens: strictCount(p.shieldTokens, 0),
      investmentTokens: strictCount(p.investmentTokens, 0),
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
    const exchange = record(raw.exchange, 'exchange');
    const playerId = value => {
      const id = text(value);
      if (!game.players.some(p => p.id === id)) throw new Error('Invalid exchange player');
      return id;
    };
    game.exchange.opened = boolean(exchange.opened);
    game.exchange.openerId = present(exchange.openerId) ? text(exchange.openerId) : null;
    game.exchange.openedTurn = present(exchange.openedTurn) ? strictCount(exchange.openedTurn, null, 1) : null;
    game.exchange.nextInvestmentId = strictCount(exchange.nextInvestmentId, 1, 1);
    game.exchange.movementThisTurn = Object.fromEntries(Object.entries(record(exchange.movementThisTurn, 'movement')).map(([id, value]) => {
      playerId(id); record(value, 'movement');
      if (!['dice', 'navigation'].includes(value.mode)) throw new Error('Invalid movement mode');
      const steps = value.mode === 'navigation' ? strictCount(value.steps, 0, 1) : null;
      if (steps !== null && steps > 6) throw new Error('Invalid navigation steps');
      return [id, { mode: value.mode, steps }];
    }));
    game.exchange.investments = array(exchange.investments, 'investments').map(value => {
      record(value, 'investment');
      const startTurn = strictCount(value.startTurn, 0, 1);
      const rewardedTurns = array(value.rewardedTurns, 'investment rewards').map(n => strictCount(n, 0, 1));
      if (new Set(rewardedTurns).size !== rewardedTurns.length || rewardedTurns.some(n => n <= startTurn || n > startTurn + 2 || n > game.turnNum)) throw new Error('Invalid investment rewards');
      const item = { id: strictCount(value.id, 0, 1), investorId: playerId(value.investorId), targetId: playerId(value.targetId),
        quantity: strictCount(value.quantity, 0, 1), startTurn, rewardedTurns, closed: boolean(value.closed) };
      if (item.investorId === item.targetId || startTurn > game.turnNum || !Number.isSafeInteger(item.quantity * CONFIG.EXCHANGE.INVESTMENT_COST)) throw new Error('Invalid investment');
      return item;
    });
    const investmentIds = game.exchange.investments.map(item => item.id);
    if (new Set(investmentIds).size !== investmentIds.length || investmentIds.some(id => id >= game.exchange.nextInvestmentId)) throw new Error('Invalid investment ids');
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
    const maxSeconds = (CONFIG.TIME.BASE_MINUTES + Math.max(0, game.players.length - CONFIG.TIME.BASE_PLAYERS) * CONFIG.TIME.EXTRA_PLAYER_MINUTES) * 60;
    const sprintSeconds = (options.endgameMinutes ?? CONFIG.ENDGAME_MINUTES) * 60;
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
    return { customDecks: decksModel.normalizeCustomDecks(record(raw.customDecks, 'custom decks')) };
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
