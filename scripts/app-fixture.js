const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const GameRules = require('../game-rules.js');
const GameState = require('../game-state.js');
const GameStorage = require('../storage.js');

// 流程測試使用最小 UI adapter；純規則測試直接載入 game-rules.js。
function createApp({ storage = new Map(), now = 1700000000000 } = {}) {
  const clock = { now };
  const elements = new Map();
  const intervals = [];
  const noop = () => {};
  function element(selector) {
    if (elements.has(selector)) return elements.get(selector);
    const node = {
      value: '', checked: false, dataset: {}, listeners: {},
      style: { setProperty: noop },
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      addEventListener(type, handler) { this.listeners[type] = handler; },
      removeEventListener(type, handler) { if (this.listeners[type] === handler) delete this.listeners[type]; },
      focus: noop,
      querySelector: child => element(selector + ' ' + child),
      querySelectorAll: child => element(selector + ' ' + child).items || [],
      setAttribute: noop, appendChild: noop,
    };
    elements.set(selector, node);
    return node;
  }
  const context = vm.createContext({
    GameRules, GameState, GameStorage,
    window: { addEventListener: noop },
    document: {
      querySelector: element, querySelectorAll: selector => element(selector).items || [],
      getElementById: id => element('#' + id),
      createElement: tag => element(tag), addEventListener: noop, removeEventListener: noop,
    },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    Date: class extends Date { static now() { return clock.now; } },
    setTimeout: noop, clearTimeout: noop,
    setInterval: fn => { intervals.push(fn); },
    queueMicrotask,
    t: (key, params = {}) => key + ':' + JSON.stringify(params),
  });
  for (const file of ['config.js', 'version.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    if (file === 'config.js') context.GAME_CONFIG = context.window.GAME_CONFIG;
  }
  const run = code => vm.runInContext(code, context);
  // Count presentation calls while retaining the actual event presenter and rules.
  run(`
    var uiCalls = { players: [], topbar: 0, draws: 0, log: 0 };
    var originalTopbar = updateTopbar;
    updatePlayerCard = p => uiCalls.players.push(p.id);
    updateTopbar = () => { uiCalls.topbar++; originalTopbar(); };
    renderPendingDraws = () => uiCalls.draws++;
    renderLog = () => uiCalls.log++;
    flashCard = () => {};
    var reliefPrompts = [];
    var approveRelief = false;
    var originalReliefModal = showReliefModal;
    showReliefModal = async opts => { reliefPrompts.push(opts); return approveRelief; };
  `);
  return {
    run,
    read: code => JSON.parse(run('JSON.stringify(' + code + ')')),
    element,
    storage,
    now: () => clock.now,
    advance: seconds => { clock.now += seconds * 1000; },
    tick: () => intervals.forEach(fn => fn()),
  };
}

module.exports = { createApp };
