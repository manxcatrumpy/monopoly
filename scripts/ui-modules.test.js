const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createApp } = require('./app-fixture');
const { uiFiles } = require('./ui-sources');

test('UI modules can load before a document exists and expose factories without installing listeners', () => {
  const context = vm.createContext({});
  Object.defineProperty(context, 'document', { get: () => { throw new Error('DOM is not ready'); } });
  for (const file of uiFiles) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  const notReady = new Proxy({}, { get() { throw new Error('DOM is not ready'); } });
  const dependencies = new Proxy({}, { get: (_, key) => ['document', 'window'].includes(key) ? notReady
    : () => { throw new Error('Dependencies must not run before bind or render'); } });
  for (const name of ['FeedbackUI', 'PlayersUI', 'ExchangeUI', 'SetupUI', 'HistoryUI', 'CardsUI', 'WeatherUI', 'HighlightUI', 'PwaUI']) {
    assert.equal(typeof context[name].create, 'function');
    assert.equal(typeof context[name].create(dependencies).bind, 'function');
  }
});

test('rendering feature UIs does not mutate a frozen game, history or shared settings or save data', () => {
  const app = createApp();
  app.run(`
    state.currentGame.players = [makePlayer({name:'A',fortune:5,wisdom:5})];
    state.currentGame.turnNum=5; state.currentGame.weatherEvents[0].lockedWeather='DISASTER';
    state.history=[snapshotRound()];
    state.settings.customDecks.action={};
    state.settings.customDecks.boost=[{name:'Test',action:'Do',insight:'Think',reward:{fortune:1},rewardText:'+1'}];
    DECKS.boost.pool=[{...state.settings.customDecks.boost[0],type:'boost'}];
    function freezeTree(value) { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child==='object') freezeTree(child); }
    freezeTree(state);
  `);
  const before = app.read('state');
  const persisted = [...app.storage];
  app.run(`
    playersUI.renderPlayers();
    historyUI.renderHistoryList(); historyUI.viewRound(0);
    cardsUI.openCardDraw('boost'); cardsUI.renderCatalog('boost'); cardsUI.renderDeckManager();
    feedbackUI.renderLog(); feedbackUI.renderPendingDraws();
    weatherUI.openWeatherAdjustModal();
    exchangeUI.open('p1'); exchangeUI.refresh();
  `);
  assert.deepEqual(app.read('state'), before);
  assert.deepEqual([...app.storage], persisted);
});

test('UI getters use the replacement state after switching games instead of retaining the initial store', () => {
  const app = createApp();
  app.run('historyUI.refreshHistoryButton();');
  assert.equal(app.element('#btn-history').hidden, true);
  app.run(`
    state=defaultState();
    state.currentGame.players=[makePlayer({name:'Replacement',fortune:7,wisdom:8})];
    state.history=[snapshotRound(),snapshotRound()];
    state.settings.customDecks.action={};
    state.settings.customDecks.boost=[{name:'New',action:'Do',insight:'Think',reward:{fortune:1},rewardText:'+1'}];
    historyUI.refreshHistoryButton(); playersUI.renderPlayers(); cardsUI.renderDeckManager();
  `);
  assert.equal(app.element('#btn-history').textContent, '歷史 · 2');
  assert.equal(app.element('#btn-history').hidden, false);
  assert.match(app.element('#players').children.at(-1).innerHTML, /Replacement/);
  assert.equal(app.element('#dm-boost-source').textContent, 'dm.source_custom:{}');
  assert.match(app.element('#dm-boost-count').textContent, /^1/);
});

test('binding a feature twice does not run a draw command twice', () => {
  const app = createApp();
  app.run('var draws=0; drawFromDeck=()=>{draws++;return null;}; cardsUI.bind(); cardsUI.bind();');
  app.element('#btn-draw-boost').dispatch('click');
  assert.equal(app.run('draws'), 1);
});

test('a delayed player removal confirmation cannot remove a player from the replacement game', async () => {
  const app = createApp();
  const pending = app.run(`
    state.currentGame.players=[GameState.createPlayer({id:'p1',name:'Old',fortune:5,wisdom:5})];
    var approveRemoval;
    confirmModal=()=>new Promise(resolve=>{approveRemoval=resolve;});
    requestRemovePlayer('p1');
  `);
  app.run(`
    state=defaultState();
    state.currentGame.players=[GameState.createPlayer({id:'p1',name:'New',fortune:8,wisdom:8})];
    approveRemoval(true);
  `);
  await pending;
  assert.equal(app.run('state.currentGame.players.length'), 1);
  assert.equal(app.run("getPlayer('p1').name"), 'New');
});
