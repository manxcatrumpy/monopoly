const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../game-state.js');

const options = { now: 1700000000000, weatherSchedule: [{id:'W1',targetRound:6},{id:'W2',targetRound:12}], navigatorThresholds: [10,20,30], graduationThreshold:30 };
const player = overrides => model.createPlayer({ id:'p1',name:'Fixture',fortune:10,wisdom:10,...overrides }, options);
function completeGame(roundNum = 1) {
  const game = model.createGame(options);
  Object.assign(game, {
    roundNum, turnNum:6, players:[player({reliefUsed:{fortune:true,wisdom:false},selfSelectedLow:{wisdom:true},shelterFromTurn:5,shelterToTurn:7})],
    timer:{accumulated:600,lastStartedAt:null,running:false},
    pendingDraws:[{id:'pd_fixture',text:'Pending',playerId:'p1',t:500}],
    log:[{text:'Fixture event',kind:'grad',t:500}],
    navigatorClaimed:{10:'p1',20:null,30:null},
    actedThisTurn:{p1:true}, skippedThisTurn:{}, reliefSweepDone:true,
    _sprintNoticed:true, _timeUpNoticed:true, _civGoalNoticed:true, _allGradNoticed:true,
  });
  Object.assign(game.weatherEvents[0], {lockedWeather:'NORMAL',upgraded:true,civAtLock:10,oldWeather:'DISASTER'});
  return game;
}

test('complete current game, history and shared settings round-trip without missing fields', () => {
  const state = model.createState(options);
  state.currentGame = completeGame();
  state.history = [model.snapshotGame(completeGame(2),options)];
  state.settings.customDecks.boost = [{name:'Custom',action:'Do',insight:'Think',reward:{fortune:1},rewardText:'+1'}];
  const decoded = model.decode(JSON.stringify(state),options);
  assert.equal(decoded.migrated, false);
  assert.deepEqual(decoded.state,state);
});

test('snapshots are complete independent copies and freeze a running timer at archive time', () => {
  const game = completeGame();
  game.timer = {accumulated:30,running:true,lastStartedAt:options.now-21000};
  const snapshot = model.snapshotGame(game,options);
  assert.deepEqual(snapshot.timer,{accumulated:51,running:false,lastStartedAt:null});
  assert.equal(game.timer.running,true);
  snapshot.players[0].fortune=99;
  snapshot.weatherEvents[0].lockedWeather='DISASTER';
  snapshot.pendingDraws[0].text='Changed';
  assert.equal(game.players[0].fortune,10);
  assert.equal(game.weatherEvents[0].lockedWeather,'NORMAL');
  assert.equal(game.pendingDraws[0].text,'Pending');
});

test('history swapping replaces all game fields and preserves the shared deck', () => {
  const state = model.createState(options);
  state.currentGame = completeGame(2);
  state.currentGame.weatherEvents[0].lockedWeather='FAVORABLE';
  state.currentGame.pendingDraws[0].text='Second game';
  const first = completeGame(1);
  first.pendingDraws[0].text='First game';
  first._timeUpNoticed=false;
  state.history=[model.snapshotGame(first,options)];
  state.settings.customDecks.boost=[];
  const restored = model.swapHistory(state,0,options);
  assert.deepEqual(restored.currentGame,first);
  assert.equal(restored.history[0].roundNum,2);
  assert.equal(restored.history[0].weatherEvents[0].lockedWeather,'FAVORABLE');
  assert.equal(restored.history[0].pendingDraws[0].text,'Second game');
  assert.deepEqual(restored.settings,state.settings);
  assert.equal(state.currentGame.roundNum,2);
  restored.currentGame.players[0].fortune=1;
  assert.equal(state.history[0].players[0].fortune,10);
});

test('old flat saves and previousRound migrate into separate game and settings records', () => {
  const old = {...completeGame(),customDecks:{action:null,boost:[]},history:[],previousRound:completeGame(3)};
  old.players[0].reliefUsed=true;
  delete old.players[0].notified;
  const result = model.decode(JSON.stringify(old),options);
  assert.equal(result.migrated,true);
  assert.equal(result.state.schemaVersion,2);
  assert.equal(result.state.history[0].roundNum,3);
  assert.deepEqual(result.state.currentGame.players[0].reliefUsed,{fortune:true,wisdom:true});
  assert.deepEqual(result.state.currentGame.players[0].notified,{});
  assert.deepEqual(result.state.settings.customDecks,{action:null,boost:[]});
  assert.equal(result.state.currentGame.customDecks,undefined);
  assert.equal(result.state.previousRound,undefined);
});

test('incomplete old history uses its own defaults and records irrecoverable omissions', () => {
  const oldHistory = {roundNum:1,turnNum:6,civGoal:41,players:[player({fortune:2,wisdom:3})],timer:{accumulated:500,running:false}};
  const old = {...completeGame(2),history:[oldHistory]};
  const state = model.decode(JSON.stringify(old),options).state;
  const restored = model.swapHistory(state,0,options).currentGame;
  assert.equal(restored.weatherEvents[0].lockedWeather,null);
  assert.deepEqual(restored.pendingDraws,[]);
  assert.equal(restored.reliefSweepDone,true); // Do not replay an unrecorded old boundary sweep.
  assert.deepEqual(restored.incompleteFields,['weatherEvents','pendingDraws','reliefSweepDone']);
  assert.equal(restored.players[0].fortune,2);
});

test('live timer anchors survive loading and missing legacy anchors are repaired from supplied time', () => {
  const old = completeGame();
  old.timer={accumulated:30,running:true,lastStartedAt:options.now-21000};
  let game = model.decode(JSON.stringify(old),options).state.currentGame;
  assert.equal(game.timer.lastStartedAt,options.now-21000);
  old.timer.lastStartedAt=null;
  game = model.decode(JSON.stringify(old),options).state.currentGame;
  assert.equal(game.timer.lastStartedAt,options.now);
  assert.equal(game.timer.accumulated,30);
});

test('old historical running timers stop at the recorded archive timestamp, not today', () => {
  const old = {...completeGame(),history:[{...completeGame(2),completedAt:options.now-100000,timer:{accumulated:30,running:true,lastStartedAt:options.now-121000}}]};
  const historical = model.decode(JSON.stringify(old),options).state.history[0];
  assert.deepEqual(historical.timer,{accumulated:51,running:false,lastStartedAt:null});
});

test('invalid data and unsupported future formats are rejected before any caller state changes', () => {
  for (const raw of ['{', 'null', '[]', JSON.stringify({schemaVersion:99}), JSON.stringify({players:[{id:'p1',fortune:'bad'}]}), JSON.stringify({players:[player(),player()]}), JSON.stringify({schemaVersion:2,currentGame:{players:[]},history:[{players:'bad'}]})]) {
    assert.throws(()=>model.decode(raw,options));
  }
  assert.equal(model.swapHistory(model.createState(options),-1,options),null);
  assert.equal(model.swapHistory(model.createState(options),0.5,options),null);
});

test('serialization excludes UI drafts and rejects invalid live state without changing it', () => {
  const state = model.createState(options);
  state.currentGame = completeGame();
  state.ui = {card:{name:'Draft'}};
  state.currentGame.adjustDraft = {fortune:100};
  const saved = JSON.parse(model.serialize(state,options));
  assert.equal(saved.ui,undefined);
  assert.equal(saved.currentGame.adjustDraft,undefined);
  assert.equal(state.currentGame.adjustDraft.fortune,100);
  state.currentGame.players[0].fortune=NaN;
  assert.throws(()=>model.serialize(state,options));
});
