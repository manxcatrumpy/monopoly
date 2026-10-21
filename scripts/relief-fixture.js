const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const GameRules = require('../game-rules.js');
const GameState = require('../game-state.js');
const DeckModel = require('../deck-model.js');
const GameStorage = require('../storage.js');
const ModalManager = require('../modal-manager.js');
const { createDOM } = require('./dom-fixture.js');
const { uiFiles } = require('./ui-sources.js');

// 執行實際 app 流程；DOM adapter 只記錄顯示、焦點與事件，不替換救濟規則。
function createApp() {
  const { document, element, key } = createDOM();
  const storage = new Map();
  const noop = () => {};
  const context = vm.createContext({
    GameRules, GameState, GameStorage, DeckModel, ModalManager,
    window: { addEventListener: noop }, document,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    queueMicrotask, setTimeout: noop, clearTimeout: noop, setInterval: noop,
    t: (key, params = {}) => key + ':' + JSON.stringify(params),
  });
  for (const file of ['config.js', 'version.js', 'pwa-client.js', ...uiFiles, 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    if (file === 'config.js') context.GAME_CONFIG = context.window.GAME_CONFIG;
  }
  const run = code => vm.runInContext(code, context);
  run('weatherUI.bind();');
  run(`
    updatePlayerCard = () => {};
    renderPlayers = () => {};
    flashCard = () => {};
    state.currentGame.players = [
      makePlayer({ name: 'A', fortune: 5, wisdom: 8 }),
      makePlayer({ name: 'B', fortune: 8, wisdom: 8 }),
      makePlayer({ name: 'C', fortune: 8, wisdom: 8 }),
      makePlayer({ name: 'D', fortune: 8, wisdom: 8 }),
    ];
    state.currentGame.civGoal = 41;
  `);
  return {
    run, element, storage, document,
    read: code => JSON.parse(run('JSON.stringify(' + code + ')')),
    visible: selector => !element(selector).classList.contains('hidden'),
    flush: () => new Promise(resolve => setImmediate(resolve)),
    approveRelief() {
      element('#relief-ack-cb').checked = true;
      element('#relief-ack-cb').dispatch('change');
      element('#relief-ok').dispatch('click');
    },
    key,
  };
}

module.exports = { createApp };
