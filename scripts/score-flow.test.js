const assert = require('node:assert/strict');
const test = require('node:test');
const { createApp } = require('./app-fixture');

function game() {
  const app = createApp();
  app.run('state.players = Array.from({length: 4}, (_, i) => makePlayer({name:\'Player \' + i, fortune:5, wisdom:5}));');
  return app;
}
function adjust(app, delta) {
  app.run('adjustTargetId = state.players[0].id;');
  for (const stat of ['fortune', 'wisdom', 'civ']) {
    app.element(`#adjust-rows .adjust-row[data-stat="${stat}"] .adjust-input`).value = String(delta[stat] || 0);
  }
  return app.run('applyAdjust()');
}
function nearGraduation(app) {
  app.run(`
    state.players[0].fortune = 29;
    state.players[0].wisdom = 30;
    state.players[0].notified = {self12:true,self22:true};
    state.navigatorClaimed = {10:'p1',20:'p1',30:null};
  `);
}

test('manual mixed adjustment cannot award a transient dual milestone or graduation', async () => {
  const app = game();
  nearGraduation(app);
  await adjust(app, { fortune: 1, wisdom: -1 });
  assert.deepEqual(app.read('[state.players[0].fortune,state.players[0].wisdom,state.players[0].graduated]'), [30, 29, false]);
  assert.equal(app.read('state.navigatorClaimed[30]'), null);
  assert.equal(app.read('state.pendingDraws.length'), 1); // Valid single-stat crossing only.
  assert.equal(app.read('state.log.some(e=>e.text.startsWith("messages.graduated_msg"))'), false);
  assert.deepEqual(app.read('uiCalls.players'), ['p1']);
  assert.equal(app.read('uiCalls.topbar'), 1);
});

test('ordinary card mixed scores are settled together', async () => {
  const app = game();
  nearGraduation(app);
  await app.run('applyCardReward(\'p1\', {name:\'Fixture\',reward:{fortune:1,wisdom:-1},rewardText:\'Fixture\'})');
  assert.equal(app.read('state.navigatorClaimed[30]'), null);
  assert.equal(app.read('state.players[0].graduated'), false);
  assert.equal(app.read('state.pendingDraws.length'), 1);
});

test('mixed adjustment does not briefly award self-breakthrough or collective graduation', async () => {
  const app = game();
  app.run(`
    state.players[0].fortune=11; state.players[0].wisdom=12;
    state.navigatorClaimed[10]='p1';
  `);
  await adjust(app, { fortune: 1, wisdom: -1 });
  assert.equal(app.read('state.players[0].notified.self12 || false'), false);
  assert.equal(app.read('state.pendingDraws.length'), 0);
  app.run(`
    state.players.forEach(p=>Object.assign(p,{fortune:30,wisdom:30,graduated:true,notified:{single_30:true,self12:true,self22:true}}));
    Object.assign(state.players[0],{fortune:29,graduated:false});
    state.navigatorClaimed[30]='p2';
  `);
  await adjust(app, { fortune: 1, wisdom: -1 });
  assert.equal(app.read('state._allGradNoticed'), false);
  assert.equal(app.read('state.log.some(e=>e.text.startsWith("messages.all_graduated_log"))'), false);
});

test('two-player card claims navigator once and evaluates collective graduation after both players', async () => {
  const app = game();
  app.run(`
    state.players = state.players.slice(0,2);
    state.players.forEach(p=>Object.assign(p,{fortune:29,wisdom:29,notified:{self12:true,self22:true}}));
    state.navigatorClaimed = {10:'p1',20:'p1',30:null};
  `);
  await app.run('applyCardReward([\'p1\',\'p2\'], {name:\'Fixture\',reward:{fortune:1,wisdom:1},rewardText:\'Fixture\'})');
  assert.equal(app.read('state.players.every(p=>p.graduated)'), true);
  assert.equal(app.read('state.navigatorClaimed[30]'), 'p1');
  assert.equal(app.read('state.pendingDraws.length'), 3);
  assert.equal(app.read('state.log.filter(e=>e.text.startsWith("messages.all_graduated_log")).length'), 1);
  assert.deepEqual(app.read('uiCalls.players'), ['p1', 'p2']);
  assert.equal(app.read('uiCalls.draws'), 1);
});

test('choice card personal and collective civilization do not produce a transient victory', async () => {
  const app = game();
  app.run('state.players = state.players.slice(0,2); state.players[0].civ=4; state.players[1].civ=5; state.civGoal=10;');
  await app.run('applyChoiceCard([\'p1\'],{name:\'Fixture\',options:[{label:\'Choice\',each:{civ:3},civAll:-2}]},0)');
  assert.equal(app.read('totalCiv()'), 8);
  assert.equal(app.read('state._civGoalNoticed'), false);
  assert.equal(app.read('state.log.some(e=>e.text.startsWith("messages.civ_goal_reached_log"))'), false);
  assert.deepEqual(app.read('uiCalls.players'), ['p1', 'p2']);
});

test('origin scores graduate after the whole reward and mark the actor', async () => {
  const app = game();
  nearGraduation(app);
  app.run('state.players[0].wisdom = 29;');
  await app.run('scoreOrigin(\'p1\',true)');
  assert.deepEqual(app.read('[state.players[0].fortune,state.players[0].wisdom,state.players[0].civ,state.players[0].graduated]'), [31, 31, 1, true]);
  assert.equal(app.read('hasActed("p1")'), true);
  assert.equal(app.read('state.pendingDraws.length'), 2);
});

test('rendering cannot pause time, mutate flags, trigger relief or announce victory', () => {
  const app = game();
  app.run(`
    state.players.forEach(p=>Object.assign(p,{civ:20,graduated:true}));
    state.timer = {accumulated:6000,lastStartedAt:Date.now(),running:true};
  `);
  const before = app.read('state');
  app.run('renderAll(); renderAll();');
  assert.deepEqual(app.read('state'), before);
  assert.equal(app.read('reliefPrompts.length'), 0);
});

test('game flow stops an expired timer once and persists boundary notifications', async () => {
  const app = game();
  app.run('state.timer = {accumulated:6000,lastStartedAt:Date.now(),running:true};');
  await app.run('processGameEvents()');
  await app.run('processGameEvents()');
  assert.equal(app.read('state.timer.running'), false);
  assert.equal(app.read('state.log.filter(e=>e.text.startsWith("messages.time_up_log")).length'), 1);
  assert.equal(app.read('state.log.filter(e=>e.text.startsWith("messages.sprint_started_log")).length'), 1);
  assert.equal(JSON.parse(app.storage.get('fuhui-dashboard-state-v1'))._timeUpNoticed, true);
});

test('timer tick detects expiry independently of rendering', async () => {
  const app = game();
  app.run('state.timer = {accumulated:5999,lastStartedAt:Date.now(),running:true}; startTimerLoop();');
  app.advance(1);
  app.tick();
  await app.run('Promise.resolve()');
  assert.equal(app.read('state.timer.running'), false);
  assert.equal(app.read('state._timeUpNoticed'), true);
});

test('one forced-loss adjustment prompts once for both stats and grants independent quotas', async () => {
  const app = game();
  app.run('state.players[0].fortune=1; state.players[0].wisdom=1; approveRelief=true;');
  await adjust(app, { fortune: -2, wisdom: -2 });
  assert.equal(app.read('reliefPrompts.length'), 1);
  assert.deepEqual(app.read('reliefPrompts[0].items'), ['fortune', 'wisdom']);
  assert.deepEqual(app.read('[state.players[0].fortune,state.players[0].wisdom]'), [5, 5]);
  assert.deepEqual(app.read('state.players[0].reliefUsed'), { fortune: true, wisdom: true });
  assert.deepEqual(app.read('[state.players[0].shelterFromTurn,state.players[0].shelterToTurn]'), [2, 3]);
});

test('declined relief keeps scores and quotas unchanged', async () => {
  const app = game();
  app.run('state.players[0].fortune=1;');
  await adjust(app, { fortune: -2 });
  assert.equal(app.read('state.players[0].fortune'), 0);
  assert.equal(app.read('state.players[0].reliefUsed.fortune'), false);
});

test('forecast and sprint boundaries each perform the first relief sweep only once', async () => {
  for (const boundary of ['forecast', 'sprint']) {
    const app = game();
    app.run('state.players[0].fortune=2; state.players[0].wisdom=3;');
    if (boundary === 'forecast') {
      app.run('state.turnNum=3;');
      await app.run('nextTurn()');
    } else {
      app.run('state.timer.accumulated=5100;');
      await app.run('processGameEvents()');
    }
    await app.run('processGameEvents()');
    assert.equal(app.read('reliefPrompts.length'), 1);
    assert.deepEqual(app.read('reliefPrompts[0].items'), ['fortune', 'wisdom']);
    assert.equal(app.read('state.reliefSweepDone'), true);
  }
});

test('second relief extends protection without removing the current protected turn', async () => {
  const app = game();
  app.run(`
    state.turnNum=6; state.reliefSweepDone=true;
    Object.assign(state.players[0], {fortune:5,wisdom:0,shelterFromTurn:5,shelterToTurn:6,reliefUsed:{fortune:true,wisdom:false}});
  `);
  await app.run('executeRelief(\'p1\',[\'wisdom\'])');
  assert.equal(app.read('playerInShelter(state.players[0])'), true);
  assert.deepEqual(app.read('[state.players[0].shelterFromTurn,state.players[0].shelterToTurn]'), [5, 8]);
});

test('queued relief cannot consume quota or reduce a recovered score', async () => {
  const app = game();
  app.run('state.players[0].fortune=10;');
  assert.equal(await app.run('executeRelief(\'p1\',[\'fortune\'])'), false);
  assert.equal(app.read('state.players[0].fortune'), 10);
  assert.equal(app.read('state.players[0].reliefUsed.fortune'), false);
});

test('shelter overrides weather and endgame overrides shelter with civilization unchanged', async () => {
  const app = game();
  app.run(`
    state.turnNum=6; state.reliefSweepDone=true; state.weatherEvents[0].lockedWeather='DISASTER';
    Object.assign(state.players[0],{fortune:10,wisdom:10,shelterFromTurn:5,shelterToTurn:7});
  `);
  await app.run('applyCardReward(\'p1\',{name:\'Fixture\',reward:{fortune:1,wisdom:-3,civ:2},rewardText:\'Fixture\'})');
  assert.deepEqual(app.read('[state.players[0].fortune,state.players[0].wisdom,state.players[0].civ]'), [12, 8, 2]);
  app.run('state.timer.accumulated=5100;');
  await app.run('applyCardReward(\'p1\',{name:\'Fixture\',reward:{fortune:1,wisdom:-3,civ:2},rewardText:\'Fixture\'})');
  assert.deepEqual(app.read('[state.players[0].fortune,state.players[0].wisdom,state.players[0].civ]'), [14, 2, 4]);
});

test('weather spending sets self-selected tags before later loss and clears them on recovery', async () => {
  const app = game();
  app.run('state.turnNum=5; state.reliefSweepDone=true; state.weatherEvents[0].lockedWeather="DISASTER"; confirmModal=async()=>true;');
  const row = app.element('fixture-weather-row');
  row.getAttribute = () => 'p1';
  row.querySelector('.adj-fortune').value = '3';
  row.querySelector('.adj-wisdom').value = '0';
  app.element('#weather-adjust-players .weather-adj-row').items = [row];
  await app.element('#weather-adjust-submit').listeners.click();
  assert.equal(app.read('state.players[0].fortune'), 2);
  assert.equal(app.read('totalCiv()'), 1);
  assert.equal(app.read('state.players[0].selfSelectedLow.fortune'), true);
  assert.equal(app.read('reliefPrompts.length'), 0);
  await adjust(app, { fortune: -1 });
  assert.equal(app.read('reliefPrompts.length'), 0);
  await adjust(app, { fortune: 3 });
  assert.equal(app.read('state.players[0].fortune'), 4);
  assert.equal(app.read('state.players[0].selfSelectedLow.fortune'), false);
  await adjust(app, { fortune: -1 });
  assert.equal(app.read('reliefPrompts.length'), 1);
});
