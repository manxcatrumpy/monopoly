const assert = require('node:assert/strict');
const test = require('node:test');
const rules = require('../game-rules.js');

const thresholds = { graduation: 30, navigator: [10, 20, 30], self: [12, 22] };
function player(overrides = {}) {
  return { id: 'p1', fortune: 29, wisdom: 30, civ: 0, graduated: false, notified: { self12: true, self22: true }, ...overrides };
}

test('mixed gain and loss use final scores for dual milestones and graduation', () => {
  const p = player();
  const [change] = rules.calculateScoreBatch([p], [{ playerId: p.id, delta: { fortune: 1, wisdom: -1 } }]);
  const result = rules.evaluatePlayerProgress({ ...p, ...change.after }, change.before, { 10: 'p1', 20: 'p1', 30: null }, thresholds);
  assert.equal(result.graduated, false);
  assert.equal(result.navigatorClaimed[30], null);
  assert.deepEqual(result.events.map(e => e.type), ['single']);
  assert.equal(p.fortune, 29); // Inputs remain unchanged.
});

test('final graduation awards one single milestone and one navigator milestone', () => {
  const p = player({ wisdom: 29 });
  const [change] = rules.calculateScoreBatch([p], [{ playerId: p.id, delta: { fortune: 1, wisdom: 1 } }]);
  const claims = { 10: 'p1', 20: 'p1', 30: null };
  const result = rules.evaluatePlayerProgress({ ...p, ...change.after }, change.before, claims, thresholds);
  assert.equal(result.graduated, true);
  assert.deepEqual(result.events.map(e => e.type), ['single', 'graduated', 'navigator']);
  assert.equal(result.navigatorClaimed[30], 'p1');
  assert.equal(claims[30], null);
  assert.equal(p.notified.single_30, undefined);
});

test('all effects for one player are merged before clamping to zero', () => {
  const p = player({ civ: 1 });
  const changes = rules.calculateScoreBatch([p], [
    { playerId: p.id, delta: { civ: -3 } },
    { playerId: p.id, delta: { civ: 1 } },
    { playerId: 'missing', delta: { fortune: 100 } },
  ]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].after.civ, 0);
});

test('self-breakthrough and navigator stay claimed after falling below and regaining thresholds', () => {
  const p = player({ fortune: 11, wisdom: 11 });
  const claims = { 10: 'p1', 20: 'other', 30: null };
  const dropped = rules.evaluatePlayerProgress(p, { fortune: 22, wisdom: 22 }, claims, thresholds);
  assert.equal(dropped.notified.self12, true);
  const regained = rules.evaluatePlayerProgress({ ...p, fortune: 12, wisdom: 12, notified: dropped.notified }, p, dropped.navigatorClaimed, thresholds);
  assert.deepEqual(regained.events.map(e => e.type), []);
  assert.equal(regained.navigatorClaimed[10], 'p1');
});

test('single milestone is awarded once even after a later re-crossing', () => {
  const p = player({ fortune: 30, wisdom: 30, graduated: true, notified: { single_30: true, self12: true, self22: true } });
  const result = rules.evaluatePlayerProgress(p, { fortune: 29, wisdom: 29 }, { 10: 'p1', 20: 'p1', 30: 'p1' }, thresholds);
  assert.deepEqual(result.events, []);
});

test('shelter losses round absolute values and civilization bypasses multipliers', () => {
  const shelter = { gain: 1.5, loss: 0.5 };
  assert.equal(rules.applyMultiplier(1, 'fortune', shelter), 2);
  assert.equal(rules.applyMultiplier(-1, 'wisdom', shelter), -1);
  assert.equal(rules.applyMultiplier(-3, 'fortune', shelter), -2);
  assert.equal(rules.applyMultiplier(3, 'civ', { gain: 2, loss: 2 }), 3);
  assert.equal(rules.applyMultiplier(-3, 'civAll', { gain: 2, loss: 2 }), -3);
});

test('relief requires forced loss, available quota and no self-selected low tag', () => {
  const p = player({ fortune: 0, wisdom: 3, reliefUsed: {}, selfSelectedLow: {} });
  assert.deepEqual(rules.qualifyingReliefStats(p, { fortune: 1, wisdom: 5 }, 0), ['fortune']);
  assert.deepEqual(rules.qualifyingReliefStats(p, { fortune: 1, wisdom: 5 }, 3), ['fortune', 'wisdom']);
  assert.deepEqual(rules.qualifyingReliefStats({ ...p, reliefUsed: { fortune: true }, selfSelectedLow: { wisdom: true } }, { fortune: 1, wisdom: 5 }, 3), []);
  assert.deepEqual(rules.qualifyingReliefStats(p, { fortune: 0, wisdom: 3 }, 3), []);
});

test('game status emits boundary events once and permits victory after correction', () => {
  const game = { players: [player({ civ: 41, graduated: true })], civGoal: 41, timer: { running: true } };
  const time = { elapsed: 6000, maxSeconds: 6000, sprintSeconds: 900 };
  const result = rules.evaluateGameStatus(game, time);
  assert.deepEqual(result.events.map(e => e.type), ['civGoal', 'allGraduated', 'sprint', 'timeUp']);
  assert.equal(result.stopTimer, true);
  assert.equal(game._timeUpNoticed, undefined);
  const repeated = rules.evaluateGameStatus({ ...game, ...result.flags, timer: { running: false } }, time);
  assert.deepEqual(repeated.events, []);
  assert.equal(repeated.stopTimer, false);
  const corrected = { ...game, ...result.flags, players: [player()] };
  const below = rules.evaluateGameStatus(corrected, time);
  const reachedAgain = rules.evaluateGameStatus({ ...game, ...below.flags }, time);
  assert.deepEqual(reachedAgain.events.map(e => e.type), ['civGoal', 'allGraduated']);
});
