const assert = require('node:assert/strict');
const test = require('node:test');
const { createApp } = require('./app-fixture');
const model = require('../game-state');
const KEY = 'fuhui-dashboard-state-v2';

function game() {
  const app = createApp();
  app.run(`
    state.currentGame.players = Array.from({length:4}, (_,i)=>makePlayer({name:'First '+i,fortune:5,wisdom:5}));
    state.currentGame.turnNum=6;
    state.currentGame.weatherEvents[0].lockedWeather='DISASTER';
    state.currentGame.weatherEvents[0].civAtLock=0;
    state.currentGame.reliefSweepDone=true;
    state.currentGame.pendingDraws=[{id:'pd_first',text:'First pending',playerId:'p1',t:10}];
    state.currentGame.timer.accumulated=1000;
    state.currentGame.players[0].reliefUsed.fortune=true;
    state.currentGame.players[0].selfSelectedLow.wisdom=true;
    state.currentGame.players[0].shelterFromTurn=5;
    state.currentGame.players[0].shelterToTurn=7;
    state.currentGame.actedThisTurn={p1:true};
    state.currentGame.skippedThisTurn={p2:true};
    confirmModal=async()=>true;
  `);
  return app;
}

test('restore swaps complete games without leaking weather, draws, flags or relief state', async () => {
  const app = game();
  const expected = app.read('state.currentGame');
  app.run(`
    state.history=[snapshotRound()];
    state.currentGame=GameState.createGame(stateModelOptions());
    state.currentGame.roundNum=2;
    state.currentGame.players=Array.from({length:4}, (_,i)=>makePlayer({name:'Second '+i,fortune:8,wisdom:8}));
    state.currentGame.pendingDraws=[{id:'pd_second',text:'Second pending',playerId:'p5',t:3}];
    state.currentGame.timer={accumulated:30,lastStartedAt:Date.now(),running:true};
    state.settings.customDecks.boost=[];
    adjustTargetId='p5'; originTargetId='p5'; currentCard={name:'Old draft'}; currentChoiceOpt=1;
  `);
  app.advance(21);
  await app.run('restoreRound(0)');
  assert.deepEqual(app.read('state.currentGame'),expected);
  assert.equal(app.read('scoreMultiplier("p2").id'),'DISASTER');
  assert.equal(app.read('scoreMultiplier("p1").id'),'SHELTER');
  assert.equal(app.read('state.history[0].pendingDraws[0].text'),'Second pending');
  assert.deepEqual(app.read('state.history[0].timer'),{accumulated:51,lastStartedAt:null,running:false});
  assert.deepEqual(app.read('state.settings.customDecks.boost'),[]);
  assert.deepEqual(app.read('[adjustTargetId,originTargetId,currentCard,currentChoiceOpt]'),[null,null,null,null]);
  assert.equal(app.read('reliefPrompts.length'),0);
  const saved = JSON.parse(app.storage.get(KEY));
  assert.deepEqual(saved.currentGame,expected);
  assert.equal(saved.schemaVersion,2);
  app.advance(60);
  await app.run('restoreRound(0)');
  assert.equal(app.read('state.currentGame.roundNum'),2);
  assert.equal(app.read('elapsedSeconds()'),51);
  assert.equal(app.read('state.currentGame.pendingDraws[0].text'),'Second pending');
});

test('next game archives complete state, resets all game fields and keeps shared settings', async () => {
  const app = game();
  const previous = app.read('state.currentGame');
  app.run(`
    state.settings.customDecks.boost=[];
    setupTmp.mode='next';setupTmp.count=4;
    setupTmp.rolls=Array.from({length:4},()=>({name:'New',fortune:5,wisdom:5}));
  `);
  app.element('#setup-round').value='2';
  app.element('#setup-civ-white').value='2';
  app.element('#setup-civ-black').value='3';
  await app.run('applySetup()');
  const archived = app.read('state.history[0]');
  delete archived.completedAt;
  assert.deepEqual(archived,previous);
  assert.equal(app.read('state.currentGame.roundNum'),2);
  assert.equal(app.read('state.currentGame.civGoal'),46);
  assert.deepEqual(app.read('state.currentGame.pendingDraws'),[]);
  assert.equal(app.read('state.currentGame.weatherEvents[0].lockedWeather'),null);
  assert.equal(app.read('state.currentGame.reliefSweepDone'),false);
  assert.equal(app.read('state.currentGame._sprintNoticed'),false);
  assert.deepEqual(app.read('state.settings.customDecks.boost'),[]);
});

test('saved full games survive a new app instance without replaying a relief boundary', async () => {
  const app = game();
  app.run('saveNow()');
  const reloaded = createApp({storage:app.storage,now:app.now()+60000});
  assert.equal(reloaded.run('load()'),true);
  await reloaded.run('processGameEvents()');
  assert.deepEqual(reloaded.read('state.currentGame'),app.read('state.currentGame'));
  assert.equal(reloaded.read('reliefPrompts.length'),0);
});

test('legacy migration saves versioned state with a byte-for-byte original backup', async () => {
  const app = game();
  const legacy = {...app.read('state.currentGame'),history:[],customDecks:{action:null,boost:[]}};
  legacy.players[0].reliefUsed=true;
  legacy.previousRound={roundNum:3,turnNum:6,civGoal:41,players:[{id:'p90',name:'Old',fortune:5,wisdom:5,civ:0}],timer:{accumulated:1000,running:false}};
  const original = JSON.stringify(legacy);
  app.storage.set('fuhui-dashboard-state-v1',original);
  assert.equal(app.run('load()'),true);
  await app.run('Promise.resolve()');
  assert.equal(app.storage.get(KEY+'-backup'),original);
  assert.equal(app.storage.get('fuhui-dashboard-state-v1'),original);
  const saved = JSON.parse(app.storage.get(KEY));
  assert.equal(saved.schemaVersion,2);
  assert.equal(saved.currentGame.reliefSweepDone,true);
  assert.equal(saved.history[0].roundNum,3);
  assert.equal(app.read('makePlayer().id'),'p91');
  await app.run('restoreRound(0)');
  assert.equal(app.read('state.currentGame.weatherEvents[0].lockedWeather'),null);
  assert.deepEqual(app.read('state.currentGame.pendingDraws'),[]);
  assert.equal(app.read('reliefPrompts.length'),0);
  assert.ok(app.read('state.currentGame.incompleteFields.length')>0);
});

test('history viewing leaves game state untouched', () => {
  const app = game();
  app.run('state.history=[snapshotRound()];');
  const before = app.read('state');
  app.run('viewRound(0); renderHistoryList();');
  assert.deepEqual(app.read('state'),before);
});

test('storage failure is visible and retry clears the warning after successful persistence', () => {
  const app = game();
  app.run('saveNow()');
  const original = app.storage.get(KEY);
  const set = app.storage.set.bind(app.storage);
  app.storage.set = () => { throw new Error('Quota exceeded'); };
  app.run('state.currentGame.roundNum=2;');
  assert.equal(app.run('saveNow()'),false);
  assert.equal(app.storage.get(KEY),original);
  assert.equal(app.read('storageWarningKey'),'storage.write_failed');
  assert.equal(app.element('#storage-warning').hidden,false);
  app.storage.set=set;
  assert.equal(app.run('saveNow()'),true);
  assert.equal(app.read('storageWarningKey'),null);
  assert.equal(app.element('#storage-warning').hidden,true);
  assert.equal(JSON.parse(app.storage.get(KEY)).currentGame.roundNum,2);
});

test('bad saves cannot partially replace the live state or be overwritten by background saving', async () => {
  const app = game();
  const originalState = app.read('state');
  app.storage.set(KEY,'{broken');
  assert.equal(app.run('load()'),false);
  assert.deepEqual(app.read('state'),originalState);
  assert.equal(app.run('saveNow()'),false);
  assert.equal(app.storage.get(KEY),'{broken');
  app.run('confirmModal=async()=>false;');
  assert.equal(await app.run('allowReplacingUnreadableSave()'),false);
  assert.equal(app.storage.get(KEY),'{broken');
  app.run('confirmModal=async()=>true;');
  assert.equal(await app.run('allowReplacingUnreadableSave()'),true);
  assert.equal(app.storage.get(KEY+'-backup'),'{broken');
});

test('returning to a notified endgame does not duplicate time or victory announcements', async () => {
  const app = game();
  app.run(`
    state.currentGame.timer.accumulated=6000;
    state.currentGame._timeUpNoticed=true;state.currentGame._sprintNoticed=true;
    state.currentGame.players.forEach(p=>{p.civ=20;p.graduated=true;p.fortune=30;p.wisdom=30;});
    state.currentGame._civGoalNoticed=true;state.currentGame._allGradNoticed=true;
    state.history=[snapshotRound()];
    state.currentGame=GameState.createGame(stateModelOptions());
    state.currentGame.roundNum=2;state.currentGame.players=[makePlayer({fortune:5,wisdom:5})];
  `);
  await app.run('restoreRound(0)');
  assert.deepEqual(app.read('state.currentGame.log'),[]);
  assert.equal(app.read('state.currentGame.timer.running'),false);
  assert.equal(app.read('reliefPrompts.length'),0);
});

test('pending relief from another game cannot mutate the newly activated game', async () => {
  const app = game();
  app.run(`
    state.currentGame.players[0].wisdom=0;
    state.currentGame.players[0].selfSelectedLow.wisdom=false;
    var answerRelief;
    showReliefModal=()=>new Promise(resolve=>{answerRelief=resolve;});
    var oldAction=maybeCheckReliefAfterForcedLoss('p1',{fortune:5,wisdom:5});
    state.currentGame=GameState.createGame(stateModelOptions());
    state.currentGame.players=[GameState.createPlayer({id:'p1',fortune:0,wisdom:0},stateModelOptions())];
    answerRelief(true);
  `);
  await app.run('oldAction');
  assert.equal(app.read('state.currentGame.players[0].wisdom'),0);
  assert.equal(app.read('state.currentGame.players[0].reliefUsed.wisdom'),false);
});

test('active relief dialogs are cancelled when the current game changes', async () => {
  const app = game();
  app.run(`
    var prompt=showReliefPromptNow({name:'Fixture',items:['wisdom'],scores:{wisdom:0}});
    clearGameUi();
    state.currentGame=GameState.createGame(stateModelOptions());
  `);
  assert.equal(await app.run('prompt'),false);
});

test('queued relief dialogs cannot open after another game is activated', async () => {
  const app = game();
  app.run(`
    var firstPrompt=originalReliefModal({name:'First',items:['fortune'],scores:{fortune:0}});
    var secondPrompt=originalReliefModal({name:'Second',items:['wisdom'],scores:{wisdom:0}});
  `);
  await app.run('Promise.resolve()');
  assert.equal(app.run('cancelReliefPrompt !== null'),true);
  app.run('clearGameUi(); state.currentGame=GameState.createGame(stateModelOptions());');
  assert.equal(await app.run('Promise.all([firstPrompt,secondPrompt]).then(values=>values.every(value=>value===false))'),true);
  assert.equal(app.run('cancelReliefPrompt === null'),true);
});

test('a deferred round-switch confirmation cannot swap a different current game', async () => {
  const app = game();
  app.run(`
    state.history=[snapshotRound()];
    var answerSwitch;
    confirmModal=()=>new Promise(resolve=>{answerSwitch=resolve;});
    var switchAction=restoreRound(0);
    state.currentGame=GameState.createGame(stateModelOptions());
    state.currentGame.roundNum=9;
    answerSwitch(true);
  `);
  await app.run('switchAction');
  assert.equal(app.read('state.currentGame.roundNum'),9);
  assert.equal(app.read('state.history[0].roundNum'),1);
});

test('a newer saved format remains intact until explicitly replaced', () => {
  const state = model.createState();
  state.schemaVersion=99;
  const original = JSON.stringify(state);
  const storage = new Map([[KEY,original]]);
  const app = createApp({storage});
  assert.equal(app.run('load()'),false);
  assert.equal(app.run('saveNow()'),false);
  assert.equal(storage.get(KEY),original);
  assert.equal(app.read('storageWarningKey'),'storage.read_failed');
});
