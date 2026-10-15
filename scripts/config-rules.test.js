const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../config');
const rules = require('../game-rules');
const model = require('../game-state');

test('shared rule defaults are frozen and reused by state and game calculations', () => {
  assert.ok(Object.isFrozen(config.PROGRESSION.NAVIGATOR));
  assert.ok(Object.isFrozen(config.RELIEF));
  assert.deepEqual(Object.keys(model.createGame().navigatorClaimed).map(Number), config.PROGRESSION.NAVIGATOR);
  assert.equal(model.createPlayer({id:'p1',fortune:config.PROGRESSION.GRADUATION,wisdom:config.PROGRESSION.GRADUATION}).graduated, true);
  assert.deepEqual([4, 5, 6].map(count => rules.gameMinutes(count)), [100, 105, 110]);
});

test('weather targets are the first integer that actually upgrades the locked weather', () => {
  // 預期 10.25，災害上界 8.2：9 已可升級，原本 Math.ceil(...)+1 誤報需 10。
  assert.equal(rules.expectedCiv(4, 41), 10.25);
  assert.equal(rules.weatherUpgradeTarget('DISASTER', 4, 41), 9);
  assert.equal(rules.judgeWeather(8, 4, 41), 'DISASTER');
  assert.equal(rules.judgeWeather(9, 4, 41), 'NORMAL');
  assert.equal(rules.weatherUpgradeTarget('NORMAL', 4, 41), 13);
  assert.equal(rules.judgeWeather(12, 4, 41), 'NORMAL');
  assert.equal(rules.judgeWeather(13, 4, 41), 'FAVORABLE');
  assert.equal(rules.weatherUpgradeTarget('FAVORABLE', 4, 41), null);
});

test('weather forecast, adjustment and report use the supplied schedule without changing it', () => {
  const events = [{ id: 'W', targetRound: 9, lockedWeather: 'NORMAL' }];
  const before = JSON.stringify(events);
  assert.equal(rules.weatherPhase(7, events).phase, 'FORECAST');
  assert.equal(rules.weatherPhase(8, events).phase, 'ADJUST');
  assert.equal(rules.weatherPhase(9, events).phase, 'REPORT');
  assert.equal(rules.weatherPhase(10, events).phase, 'NORMAL');
  assert.equal(JSON.stringify(events), before);
});

test('time and weather functions follow a modified config rather than embedded constants', () => {
  const changed = JSON.parse(JSON.stringify(config));
  changed.TIME.BASE_MINUTES = 60;
  changed.TIME.EXTRA_PLAYER_MINUTES = 10;
  changed.EXPECTED_ROUNDS = 20;
  changed.WEATHER.DISASTER_RATIO = 0.5;
  assert.equal(rules.gameMinutes(6, changed), 80);
  assert.equal(rules.expectedCiv(4, 40, changed), 8);
  assert.equal(rules.weatherUpgradeTarget('DISASTER', 4, 40, changed), 5);
  assert.equal(rules.judgeWeather(4, 4, 40, changed), 'DISASTER');
});

test('valid score totals above 32 bits do not wrap around to zero', () => {
  const player = { id: 'p1', fortune: 5, wisdom: 5, civ: 0 };
  const result = rules.calculateScoreBatch([player], [{ playerId: 'p1', delta: { fortune: 2147483647 } }]);
  assert.equal(result[0].after.fortune, 2147483652);
  assert.equal(player.fortune, 5);
});

test('invalid numeric operations fail before changing any player', () => {
  const player = { id: 'p1', fortune: 5, wisdom: 5, civ: 0 };
  for (const amount of ['2', NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => rules.calculateScoreBatch([player], [{ playerId: 'p1', delta: { fortune: amount } }]));
    assert.equal(player.fortune, 5);
  }
});
