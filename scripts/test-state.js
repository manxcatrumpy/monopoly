'use strict';

const assert = require('assert/strict');
const S = require('../js/state.js');

const SCHEDULE = [
  { id: 'W1', targetRound: 6 },
  { id: 'W2', targetRound: 12 },
];
const opts = { navThresholds: [15, 35, 55], weatherSchedule: SCHEDULE };

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok  ' + name);
  } catch (err) {
    failed += 1;
    console.error('FAIL ' + name);
    console.error('  ' + (err && err.stack ? err.stack : err));
  }
}

test('defaultState has weatherEvents from schedule and empty round fields', () => {
  const st = S.defaultState(opts);
  assert.equal(st.weatherEvents.length, 2);
  assert.equal(st.weatherEvents[0].id, 'W1');
  assert.equal(st.weatherEvents[0].lockedWeather, null);
  assert.deepEqual(st.pendingDraws, []);
  assert.deepEqual(st.history, []);
  assert.deepEqual(st.customDecks, { action: null, boost: null });
  assert.equal(st.navigatorClaimed[15], null);
});

test('makeWeatherEvents does not mutate the schedule', () => {
  const src = [{ id: 'W1', targetRound: 6 }];
  const ev = S.makeWeatherEvents(src);
  ev[0].lockedWeather = 'NORMAL';
  assert.equal(src[0].lockedWeather, undefined);
});

test('migrateState fills missing fields, previousRound → history, strips UI flags', () => {
  const parsed = {
    players: [{ name: 'A', fortune: 1, wisdom: 2 }],
    previousRound: { roundNum: 1, players: [{ name: 'old' }] },
    _civGoalNoticed: true,
    _sprintNoticed: true,
    _timeUpNoticed: true,
    _allGradNoticed: true,
  };
  const st = S.migrateState(parsed, opts);
  assert.equal(st.history.length, 1);
  assert.equal(st.history[0].roundNum, 1);
  assert.equal(st.previousRound, undefined);
  assert.equal(st.turnNum, 1);
  assert.deepEqual(st.pendingDraws, []);
  assert.equal(st.weatherEvents.length, 2);
  assert.equal(st.actedThisTurn && typeof st.actedThisTurn, 'object');
  assert.equal(st.players[0].reliefUsed, false);
  assert.equal(st.players[0].shelterFromTurn, null);
  assert.equal(st._civGoalNoticed, undefined);
  assert.equal(st._sprintNoticed, undefined);
});

test('migrateState keeps locked weather from a save', () => {
  const parsed = {
    players: [],
    weatherEvents: [
      { id: 'W1', targetRound: 6, lockedWeather: 'DISASTER', upgraded: true, civAtLock: 8 },
    ],
  };
  const st = S.migrateState(parsed, opts);
  assert.equal(st.weatherEvents[0].lockedWeather, 'DISASTER');
  assert.equal(st.weatherEvents[0].upgraded, true);
  assert.equal(st.weatherEvents[0].civAtLock, 8);
});

test('snapshotRound includes weather and pending, excludes history and decks', () => {
  const live = S.defaultState(opts);
  live.weatherEvents[0].lockedWeather = 'NORMAL';
  live.pendingDraws.push({ id: 'pd1', text: '抽卡' });
  live.history.push({ roundNum: 1 });
  live.customDecks.action = { foo: true };
  live._civGoalNoticed = true;
  const snap = S.snapshotRound(live, opts);
  assert.equal(snap.weatherEvents[0].lockedWeather, 'NORMAL');
  assert.equal(snap.pendingDraws.length, 1);
  assert.equal(snap.history, undefined);
  assert.equal(snap.customDecks, undefined);
  assert.equal(snap._civGoalNoticed, undefined);
  snap.weatherEvents[0].lockedWeather = 'DISASTER';
  snap.pendingDraws.push({ id: 'pd2' });
  assert.equal(live.weatherEvents[0].lockedWeather, 'NORMAL');
  assert.equal(live.pendingDraws.length, 1);
});

test('applyRoundSnapshot restores weather/pending and leaves history/decks', () => {
  const live = S.defaultState(opts);
  live.history = [{ roundNum: 9 }];
  live.customDecks = { action: { a: 1 }, boost: null };
  live.pendingDraws = [{ id: 'now' }];
  live.weatherEvents[0].lockedWeather = 'FAVORABLE';
  const entry = {
    roundNum: 2,
    turnNum: 5,
    civGoal: 50,
    timer: { accumulated: 10, lastStartedAt: null, running: false },
    players: [{ id: 'p1', fortune: 1, wisdom: 1, civ: 0 }],
    log: [{ text: 'hi' }],
    weatherEvents: [
      { id: 'W1', targetRound: 6, lockedWeather: 'DISASTER', upgraded: false, civAtLock: 10 },
    ],
    pendingDraws: [{ id: 'old' }],
    actedThisTurn: { p1: true },
  };
  S.applyRoundSnapshot(live, entry, opts);
  assert.equal(live.roundNum, 2);
  assert.equal(live.turnNum, 5);
  assert.equal(live.civGoal, 50);
  assert.equal(live.weatherEvents[0].lockedWeather, 'DISASTER');
  assert.equal(live.pendingDraws[0].id, 'old');
  assert.equal(live.actedThisTurn.p1, true);
  assert.equal(live.history[0].roundNum, 9);
  assert.deepEqual(live.customDecks.action, { a: 1 });
  live.pendingDraws.push({ id: 'mut' });
  assert.equal(entry.pendingDraws.length, 1);
});

test('old snapshot missing weather/pending gets defaults (no live leakage)', () => {
  const snap = S.migrateRoundSnapshot({
    roundNum: 1,
    civGoal: 40,
    players: [{ name: 'A' }],
    timer: {},
    log: [],
  }, opts);
  assert.equal(snap.weatherEvents.length, 2);
  assert.equal(snap.weatherEvents[0].lockedWeather, null);
  assert.deepEqual(snap.pendingDraws, []);
  assert.equal(snap.players[0].reliefUsed, false);
  assert.equal(snap.turnNum, 1);
});

test('persistableState omits UI flags without mutating live state', () => {
  const st = S.defaultState(opts);
  st._timeUpNoticed = true;
  st._civGoalNoticed = true;
  const p = S.persistableState(st);
  assert.equal(p._timeUpNoticed, undefined);
  assert.equal(p._civGoalNoticed, undefined);
  assert.equal(st._timeUpNoticed, true);
  assert.ok(Array.isArray(p.players));
});

test('deriveUiFlags is boolean from current conditions', () => {
  assert.deepEqual(S.deriveUiFlags({}), {
    _civGoalNoticed: false,
    _sprintNoticed: false,
    _timeUpNoticed: false,
    _allGradNoticed: false,
  });
  assert.equal(S.deriveUiFlags({ civReached: true, allGraduated: 1 })._civGoalNoticed, true);
  assert.equal(S.deriveUiFlags({ civReached: true, allGraduated: 1 })._allGradNoticed, true);
});

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
