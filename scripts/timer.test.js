const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const GameRules = require('../game-rules.js');
const GameState = require('../game-state.js');
const GameStorage = require('../storage.js');

const sources = ['config.js', 'version.js', 'app.js'].map(file =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
);

function createSession() {
  const clock = { now: 1700000000000 };
  const storage = new Map();
  const noop = () => {};
  const element = { addEventListener: noop, querySelector: () => element, classList: { toggle: noop } };

  function openApp() {
    const context = vm.createContext({
      GameRules, GameState, GameStorage,
      window: { addEventListener: noop },
      document: { querySelector: () => element, addEventListener: noop },
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
      Date: class extends Date {
        static now() { return clock.now; }
      },
      // Persist synchronously so each new context models a completed page reload.
      queueMicrotask: fn => fn(),
    });
    vm.runInContext(sources[0], context);
    context.GAME_CONFIG = context.window.GAME_CONFIG;
    vm.runInContext(sources[1], context);
    vm.runInContext(sources[2], context);
    // Timer tests exercise storage and elapsed time without rendering the UI.
    vm.runInContext('updateTopbar = () => {};', context);
    return code => vm.runInContext(code, context);
  }

  let run = openApp();
  run('state.currentGame.players.push(makePlayer({ fortune: 5, wisdom: 5 })); saveNow();');
  return {
    run: code => run(code),
    advance: seconds => { clock.now += seconds * 1000; },
    reload: () => {
      run = openApp();
      assert.equal(run('load()'), true);
    },
  };
}

test('running timer retains accumulated and current elapsed time after reload', () => {
  const app = createSession();
  app.run('startTimer()');
  app.advance(30);
  app.run('pauseTimer(); startTimer();');
  app.advance(21);
  assert.equal(app.run('elapsedSeconds()'), 51);
  app.reload();
  assert.equal(app.run('elapsedSeconds()'), 51);
  app.advance(9);
  assert.equal(app.run('elapsedSeconds()'), 60);
});

test('repeated reloads do not reset or double-count running time', () => {
  const app = createSession();
  app.run('startTimer()');
  app.advance(21);
  app.reload();
  app.advance(14);
  app.reload();
  assert.equal(app.run('elapsedSeconds()'), 35);
  app.run('pauseTimer()');
  app.reload();
  assert.equal(app.run('elapsedSeconds()'), 35);
});

test('paused timer stays paused across reload and resumes from saved elapsed time', () => {
  const app = createSession();
  app.run('startTimer()');
  app.advance(21);
  app.run('pauseTimer()');
  app.advance(60);
  app.reload();
  assert.equal(app.run('elapsedSeconds()'), 21);
  assert.equal(app.run('state.currentGame.timer.running'), false);
  app.run('startTimer()');
  app.advance(9);
  app.reload();
  assert.equal(app.run('elapsedSeconds()'), 30);
});

test('running timer includes time spent away from the page', () => {
  const app = createSession();
  app.run('startTimer()');
  app.advance(600);
  app.reload();
  assert.equal(app.run('elapsedSeconds()'), 600);
});

test('legacy running timer with a missing start time preserves accumulated time', () => {
  const app = createSession();
  app.run('state.currentGame.timer = { accumulated: 30, running: true, lastStartedAt: null }; saveNow();');
  app.reload();
  assert.equal(app.run('elapsedSeconds()'), 30);
  app.advance(9);
  assert.equal(app.run('elapsedSeconds()'), 39);
});
