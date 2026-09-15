'use strict';

const assert = require('assert/strict');
const R = require('../js/rules.js');

const SHELTER = { gain: 1.5, loss: 0.5 };
const WEATHER = [
  { id: 'W1', targetRound: 6 },
  { id: 'W2', targetRound: 12 },
];

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

// ── applyMult / scaleReward (docs/social-welfare-relief.md §2) ──
test('shelter +1.5 gain table', () => {
  const table = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 8 };
  Object.entries(table).forEach(([raw, expected]) => {
    assert.equal(R.applyMult(+raw, 'fortune', SHELTER), expected, '+' + raw);
    assert.equal(R.applyMult(+raw, 'wisdom', SHELTER), expected);
  });
});

test('shelter ×0.5 loss table', () => {
  const table = { [-1]: 0, [-2]: -1, [-3]: -1, [-4]: -2, [-5]: -2 };
  Object.entries(table).forEach(([raw, expected]) => {
    assert.equal(R.applyMult(+raw, 'fortune', SHELTER), expected, String(raw));
    assert.equal(R.applyMult(+raw, 'wisdom', SHELTER), expected);
  });
});

test('civ and civAll ignore multipliers', () => {
  assert.equal(R.applyMult(4, 'civ', SHELTER), 4);
  assert.equal(R.applyMult(-3, 'civ', SHELTER), -3);
  assert.equal(R.applyMult(4, 'civAll', SHELTER), 4);
  assert.equal(R.applyMult(-3, 'civAll', { gain: 2, loss: 2 }), -3);
});

test('applyMult treats 0 as no-op', () => {
  assert.equal(R.applyMult(0, 'fortune', SHELTER), 0);
});

test('scaleReward applies per-stat and skips civ', () => {
  assert.deepEqual(
    R.scaleReward({ fortune: 2, wisdom: -4, civ: 3 }, SHELTER),
    { fortune: 3, wisdom: -2, civ: 3 }
  );
  assert.deepEqual(R.scaleReward({}, SHELTER), { fortune: 0, wisdom: 0, civ: 0 });
});

// ── expectedCiv / judgeWeather ──
test('expectedCiv is civGoal * turn / rounds', () => {
  assert.equal(R.expectedCiv(8, 160, 16), 80);
  assert.equal(R.expectedCiv(5, 100, 10), 50);
  assert.equal(R.expectedCiv(6, 100, 16), 100 * 6 / 16);
});

test('judgeWeather uses 1.2 / 0.8 bands inclusive', () => {
  // expected = 50 (turn 5, goal 100, 10 rounds)
  assert.equal(R.judgeWeather(60, 5, 100, 10), 'FAVORABLE');
  assert.equal(R.judgeWeather(59, 5, 100, 10), 'NORMAL');
  assert.equal(R.judgeWeather(40, 5, 100, 10), 'DISASTER');
  assert.equal(R.judgeWeather(41, 5, 100, 10), 'NORMAL');
  assert.equal(R.judgeWeather(50, 5, 100, 10), 'NORMAL');
});

// ── getPhase ──
test('getPhase maps N-2 / N-1 / N for each scheduled event', () => {
  assert.equal(R.getPhase(4, WEATHER).phase, 'FORECAST');
  assert.equal(R.getPhase(4, WEATHER).ev.id, 'W1');
  assert.equal(R.getPhase(5, WEATHER).phase, 'ADJUST');
  assert.equal(R.getPhase(6, WEATHER).phase, 'REPORT');
  assert.equal(R.getPhase(10, WEATHER).phase, 'FORECAST');
  assert.equal(R.getPhase(10, WEATHER).ev.id, 'W2');
  assert.equal(R.getPhase(11, WEATHER).phase, 'ADJUST');
  assert.equal(R.getPhase(12, WEATHER).phase, 'REPORT');
  assert.equal(R.getPhase(1, WEATHER).phase, 'NORMAL');
  assert.equal(R.getPhase(7, WEATHER).phase, 'NORMAL');
  assert.equal(R.getPhase(13, WEATHER).ev, null);
  assert.equal(R.getPhase(3, []).phase, 'NORMAL');
});

// ── computeCivGoal / clampDie ──
test('computeCivGoal is white × black + players × 10, dice clamped 1–6', () => {
  assert.equal(R.computeCivGoal(1, 1, 4), 41);
  assert.equal(R.computeCivGoal(6, 6, 4), 76);
  assert.equal(R.computeCivGoal(3, 2, 5), 56);
  assert.equal(R.computeCivGoal(0, 9, 4), 46); // clamp to 1 × 6 + 40
  assert.equal(R.computeCivGoal('3', '2', 6), 66);
  assert.equal(R.clampDie(''), 1);
  assert.equal(R.clampDie(99), 6);
});

// ── relief ──
test('reliefPhaseOk: turns 1–3 always ok; later needs civ < 25%', () => {
  const cfg = R.DEFAULTS.RELIEF;
  assert.equal(R.reliefPhaseOk({ turnNum: 1, civGoal: 100, totalCiv: 100 }, cfg), true);
  assert.equal(R.reliefPhaseOk({ turnNum: 3, civGoal: 100, totalCiv: 100 }, cfg), true);
  assert.equal(R.reliefPhaseOk({ turnNum: 4, civGoal: 100, totalCiv: 24 }, cfg), true);
  assert.equal(R.reliefPhaseOk({ turnNum: 4, civGoal: 100, totalCiv: 25 }, cfg), false);
  assert.equal(R.reliefPhaseOk({ turnNum: 4, civGoal: 0, totalCiv: 0 }, cfg), false);
});

test('reliefEligible / reliefNeeded', () => {
  const ok = { id: 'p1', reliefUsed: false, fortune: 4, wisdom: 0 };
  const used = { id: 'p2', reliefUsed: true, fortune: 0, wisdom: 0 };
  const full = { id: 'p3', reliefUsed: false, fortune: 2, wisdom: 2 };
  assert.equal(R.reliefEligible(ok, true), true);
  assert.equal(R.reliefEligible(used, true), false);
  assert.equal(R.reliefEligible(ok, false), false);
  assert.equal(R.reliefEligible(null, true), false);
  assert.equal(R.reliefNeeded(ok, true), true);
  assert.equal(R.reliefNeeded(full, true), false);
  assert.deepEqual(R.zeroedFwStats(ok), ['wisdom']);
  assert.deepEqual(R.zeroedFwStats(used), ['fortune', 'wisdom']);
  assert.deepEqual(R.zeroedFwStats(full), []);
});

test('playerInShelter is inclusive from–to and requires reliefUsed', () => {
  const p = { reliefUsed: true, shelterFromTurn: 4, shelterToTurn: 5 };
  assert.equal(R.playerInShelter(p, 3), false);
  assert.equal(R.playerInShelter(p, 4), true);
  assert.equal(R.playerInShelter(p, 5), true);
  assert.equal(R.playerInShelter(p, 6), false);
  assert.equal(R.playerInShelter({ reliefUsed: false, shelterFromTurn: 4, shelterToTurn: 5 }, 4), false);
  assert.equal(R.playerInShelter({ reliefUsed: true, shelterFromTurn: null, shelterToTurn: 5 }, 4), false);
});

test('isNewlyZeroed only when crossing from positive to 0', () => {
  assert.equal(R.isNewlyZeroed(3, 0), true);
  assert.equal(R.isNewlyZeroed(0, 0), false);
  assert.equal(R.isNewlyZeroed(3, 1), false);
  assert.equal(R.isNewlyZeroed(0, 3), false);
});

// ── chargeWeatherAdjust: fortune first, then wisdom, leftover unused ──
test('chargeWeatherAdjust deducts fortune then wisdom across players', () => {
  const contrib = [
    { id: 'p1', name: 'A', f: 5, w: 2 },
    { id: 'p2', name: 'B', f: 4, w: 1 },
  ];
  assert.deepEqual(R.chargeWeatherAdjust(contrib, 6), [
    { id: 'p1', name: 'A', f: 5, w: 1 },
    { id: 'p2', name: 'B', f: 0, w: 0 },
  ]);
  assert.deepEqual(R.chargeWeatherAdjust(contrib, 3), [
    { id: 'p1', name: 'A', f: 3, w: 0 },
    { id: 'p2', name: 'B', f: 0, w: 0 },
  ]);
  assert.deepEqual(R.chargeWeatherAdjust(contrib, 12), [
    { id: 'p1', name: 'A', f: 5, w: 2 },
    { id: 'p2', name: 'B', f: 4, w: 1 },
  ]);
  assert.deepEqual(R.chargeWeatherAdjust(contrib, 0), [
    { id: 'p1', name: 'A', f: 0, w: 0 },
    { id: 'p2', name: 'B', f: 0, w: 0 },
  ]);
});

// ── originReward ──
test('originReward: pass/stop × graduated civ extra', () => {
  const raw = { graduated: false };
  const grad = { graduated: true };
  assert.deepEqual(R.originReward(raw, false), { fortune: 1, wisdom: 1, civ: 0 });
  assert.deepEqual(R.originReward(raw, true), { fortune: 2, wisdom: 2, civ: 1 });
  assert.deepEqual(R.originReward(grad, false), { fortune: 1, wisdom: 1, civ: 1 });
  assert.deepEqual(R.originReward(grad, true), { fortune: 2, wisdom: 2, civ: 2 });
});

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
