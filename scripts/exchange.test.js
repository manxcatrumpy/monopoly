const assert = require('node:assert/strict');
const test = require('node:test');
const { createApp } = require('./app-fixture');
const model = require('../game-state');
const rules = require('../game-rules');
const decks = require('../deck-model');

function game() {
  const app = createApp();
  app.run(`
    state.currentGame.players=['A','B','C','D'].map(name=>makePlayer({name,fortune:20,wisdom:20}));
    state.currentGame.players.forEach(p=>p.notified={self12:true});
    state.currentGame.navigatorClaimed={10:'p1',20:'p1',30:null};
    state.currentGame.exchange.opened=true;
    state.currentGame.civGoal=999;
    state.currentGame.turnNum=5;
    state.currentGame.reliefSweepDone=true;
    confirmModal=async()=>true;
    async function buyAndActivate(id,cart,target) {
      if (!await purchaseExchange(id,cart)) return false;
      return activateInvestment(id,target,cart.investment);
    }
  `);
  return app;
}
const balances = app => app.read('state.currentGame.players.map(p=>[p.fortune,p.wisdom,p.civ,p.navigationTokens,p.shieldTokens])');

test('opening uses simultaneous >=12, opens once, stays open after loss and survives reload', async () => {
  const app = game();
  app.run('state.currentGame.exchange.opened=false; state.currentGame.players.forEach(p=>{p.fortune=11;p.wisdom=13;p.notified={};});');
  await app.run('processGameEvents()');
  assert.equal(app.read('state.currentGame.exchange.opened'), false);
  await app.run("settleScoreChanges([{playerId:'p2',delta:{fortune:2}}])");
  assert.equal(app.read('state.currentGame.exchange.openerId'), 'p2');
  assert.equal(app.read("modals.isOpen('exchange-open-modal')"), true);
  await app.run("settleScoreChanges([{playerId:'p2',delta:{wisdom:-10}}]); processGameEvents()");
  assert.equal(app.read('state.currentGame.log.filter(e=>e.text.startsWith("exchange.open_message")).length'), 1);
  const loaded = createApp({ storage: app.storage });
  loaded.run('load();');
  await loaded.run('processGameEvents()');
  assert.equal(loaded.read('state.currentGame.exchange.opened'), true);
  assert.equal(loaded.read("modals.isOpen('exchange-open-modal')"), false);
});

test('multiple products and quantities charge fixed costs, grant stocks and exclude investment gifts from growth', async () => {
  const app = game();
  app.run('state.currentGame.timer.accumulated=5100;'); // Endgame multiplier must not change transaction amounts.
  assert.equal(await app.run("purchaseExchange('p1',{navigation:2,shield:2,investment:2})"), true);
  assert.deepEqual(balances(app).slice(0, 2), [[8, 14, 0, 2, 2], [20, 20, 0, 0, 0]]);
  assert.equal(app.read('getPlayer("p1").investmentTokens'), 2);
  assert.deepEqual(app.read('state.currentGame.exchange.investments'), []);
  assert.deepEqual(app.read('state.currentGame.exchange.movementThisTurn'), {});
  assert.equal(await app.run("activateInvestment('p1','p2',2)"), true);
  assert.deepEqual(balances(app).slice(0, 2), [[8, 14, 0, 2, 2], [20, 22, 0, 0, 0]]);
  assert.deepEqual(app.read('state.currentGame.exchange.investments[0]'), { id: 1, investorId: 'p1', targetId: 'p2', quantity: 2, startTurn: 5, rewardedTurns: [], closed: false });
  assert.equal(app.read('hasActed("p1")'), false);
  assert.equal(await app.run("purchaseExchange('p1',{shield:1})"), true); // More than one purchase in the same turn.
});

test('invalid and unaffordable purchases leave inventory and balances unchanged', async () => {
  const app = game();
  const before = app.read('state.currentGame');
  for (const command of [
    "purchaseExchange('p1',{navigation:0.5})", "purchaseExchange('p1',{shield:-1})",
    "purchaseExchange('p1',{navigation:100})",
    "purchaseExchange('p1',{})", "purchaseExchange('p1',{shield:Number.MAX_SAFE_INTEGER})",
  ]) assert.equal(await app.run(command), false);
  assert.deepEqual(app.read('state.currentGame'), before);
});

test('navigation is saved inventory: one use replaces rolling, never completes the turn early and cannot stack', async () => {
  const app = game();
  await app.run("purchaseExchange('p1',{navigation:2})");
  assert.equal(app.run("useNavigation('p1',7)"), false);
  assert.equal(app.run("useNavigation('p1',6)"), true);
  assert.equal(app.read('getPlayer("p1").navigationTokens'), 1);
  assert.equal(app.read('hasActed("p1")'), false);
  assert.equal(app.read('state.currentGame.turnNum'), 5);
  assert.equal(app.run("useNavigation('p1',1)"), false);
  assert.equal(app.run("beginDice('p1')"), false);
  assert.equal(await app.run("purchaseExchange('p1',{shield:1})"), false);
  app.run('saveNow();');
  const loaded = createApp({ storage: app.storage });
  loaded.run('load();');
  assert.equal(loaded.run("useNavigation('p1',1)"), false);
  await loaded.run('nextTurn()');
  assert.equal(loaded.run("useNavigation('p1',1)"), true);
});

test('rolling, completing and skipping close trading; undoing completion cannot reopen trading', async () => {
  const app = game();
  assert.equal(app.run("beginDice('p1')"), true);
  app.run("markActed('p2'); toggleActed('p2'); markSkipped('p3');");
  for (const id of ['p1', 'p2', 'p3']) assert.equal(await app.run(`purchaseExchange('${id}',{shield:1})`), false);
});

test('investment pays each group once per observation round even when later losses erase the gains', async () => {
  const app = game();
  await app.run("buyAndActivate('p1',{investment:2},'p2')");
  await app.run("settleScoreChanges([{playerId:'p2',delta:{fortune:1}}],{source:'normal'})");
  assert.equal(app.read('getPlayer("p1").civ'), 0); // Establishment round is excluded.
  await app.run('nextTurn()');
  await app.run("settleScoreChanges([{playerId:'p2',delta:{wisdom:1}}],{source:'normal'})");
  await app.run("settleScoreChanges([{playerId:'p2',delta:{fortune:1,wisdom:-10}}],{source:'normal'})");
  assert.equal(app.read('getPlayer("p1").civ'), 2);
  app.run('saveNow();');
  const loaded = createApp({ storage: app.storage });
  loaded.run('load();');
  await loaded.run("settleScoreChanges([{playerId:'p2',delta:{fortune:1}}],{source:'normal'})");
  assert.equal(loaded.read('getPlayer("p1").civ'), 2);
  await loaded.run('nextTurn()');
  await loaded.run("settleScoreChanges([{playerId:'p2',delta:{fortune:1}}],{source:'normal'})");
  assert.equal(loaded.read('getPlayer("p1").civ'), 4);
  await loaded.run('nextTurn()');
  assert.equal(loaded.read('getPlayer("p1").fortune'), 12); // No refund if either round grew.
  assert.equal(loaded.read('state.currentGame.exchange.investments[0].closed'), true);
});

for (const grownTurn of [null, 6, 7]) {
  test(`investment refunds only if neither round grows (growth round ${grownTurn})`, async () => {
    const app = game();
    await app.run("buyAndActivate('p1',{investment:2},'p2')");
    for (const turn of [6, 7]) {
      await app.run('nextTurn()');
      if (turn === grownTurn) await app.run("settleScoreChanges([{playerId:'p2',delta:{fortune:1}}],{source:'normal'})");
    }
    assert.equal(app.read('getPlayer("p1").fortune'), 12);
    await app.run('nextTurn()');
    assert.deepEqual(app.read('[getPlayer("p1").fortune,getPlayer("p1").civ]'), grownTurn ? [12, 2] : [16, 0]);
    await app.run('nextTurn(); nextTurn();');
    assert.equal(app.read('getPlayer("p1").fortune'), grownTurn ? 12 : 16);
  });
}

test('gifts, relief, refunds and corrections do not count as growth; ordinary cards and origin rewards do', async () => {
  const app = game();
  await app.run("buyAndActivate('p1',{investment:1},'p2').then(()=>nextTurn())");
  await app.run("buyAndActivate('p3',{investment:1},'p2')");
  await app.run("settleScoreChanges([{playerId:'p2',values:{fortune:5}}])");
  await app.run("settleScoreChanges([{playerId:'p2',delta:{fortune:2}}],{source:'correction'})");
  assert.equal(app.read('getPlayer("p1").civ'), 0);
  await app.run("scoreOrigin('p2',false)");
  assert.equal(app.read('getPlayer("p1").civ'), 1);
  await app.run('nextTurn()');
  await app.run("applyCardReward('p2',{name:'growth',reward:{wisdom:1},rewardText:'+1'})");
  assert.equal(app.read('getPlayer("p1").civ'), 2);
});

test('shield is optional and consumes exactly one for all multiplied Fortune/Wisdom losses, not Civilization', async () => {
  const app = game();
  app.run("Object.assign(getPlayer('p1'),{shieldTokens:3,fortune:5,wisdom:5,civ:4}); state.currentGame.timer.accumulated=5100;");
  await app.run("applyCardReward('p1',{name:'fate',damageSource:'fate',reward:{fortune:-3,wisdom:-2,civ:-1},rewardText:'loss'})");
  assert.deepEqual(balances(app)[0], [5, 5, 3, 0, 2]);
  assert.equal(app.read('reliefPrompts.length'), 0);
  app.run('confirmModal=async()=>false;');
  await app.run("applyCardReward('p1',{name:'impermanence',damageSource:'impermanence',reward:{fortune:-1,wisdom:-1,civ:-1},rewardText:'loss'})");
  assert.deepEqual(balances(app)[0], [3, 3, 2, 0, 2]);
  assert.equal(app.read('reliefPrompts.length'), 1);
});

test('shield preserves positive effects and does not intercept ordinary loss, civilization-only loss or spending', async () => {
  const app = game();
  app.run("getPlayer('p1').shieldTokens=3;");
  await app.run("applyCardReward('p1',{name:'mixed',damageSource:'fate',reward:{fortune:2,wisdom:-3},rewardText:'mixed'})");
  assert.deepEqual(balances(app)[0], [22, 20, 0, 0, 2]);
  await app.run("applyCardReward('p1',{name:'ordinary',reward:{wisdom:-1},rewardText:'loss'})");
  await app.run("applyCardReward('p1',{name:'civilization',damageSource:'fate',reward:{civ:-1},rewardText:'loss'})");
  assert.equal(app.read('getPlayer("p1").shieldTokens'), 2);
  assert.equal(app.read('getPlayer("p1").wisdom'), 19);
});

test('both recipients independently choose shields and collective Civilization still applies to everyone', async () => {
  const app = game();
  app.run("state.currentGame.players.forEach(p=>{p.shieldTokens=2;p.civ=3;}); confirmModal=async ({message})=>message.includes('A');");
  await app.run("applyChoiceCard(['p1','p2'],{name:'choice',damageSource:'fate',options:[{label:'loss',each:{fortune:-2,wisdom:-1},civAll:-1}]},0)");
  assert.deepEqual(balances(app)[0], [20, 20, 2, 0, 1]);
  assert.deepEqual(balances(app)[1], [18, 19, 2, 0, 2]);
  assert.equal(app.read('getPlayer("p3").civ'), 2);
});

test('pending shield confirmation cannot double-consume, advance the round or apply to a replacement game', async () => {
  const app = game();
  app.run("getPlayer('p1').shieldTokens=2; var resolveShield; confirmModal=()=>new Promise(resolve=>{resolveShield=resolve;});");
  const pending = app.run("applyCardReward('p1',{name:'fate',damageSource:'fate',reward:{fortune:-2},rewardText:'loss'})");
  await app.run("applyCardReward('p1',{name:'fate',damageSource:'fate',reward:{fortune:-2},rewardText:'loss'})");
  await app.run('nextTurn()');
  assert.equal(app.read('state.currentGame.turnNum'), 5);
  app.run("clearGameUi(); state=defaultState(); state.currentGame.players=[GameState.createPlayer({id:'p1',name:'New',fortune:10,wisdom:10,shieldTokens:5})]; resolveShield(true);");
  await pending;
  assert.deepEqual(balances(app)[0], [10, 10, 0, 0, 5]);
});

test('low-point purchasing warns, tags voluntary spending and cannot duplicate a pending transaction', async () => {
  const app = game();
  app.run("getPlayer('p1').fortune=5; var finishPurchase; confirmModal=()=>new Promise(resolve=>{finishPurchase=resolve;});");
  const pending = app.run("purchaseExchange('p1',{shield:1})");
  assert.equal(await app.run("purchaseExchange('p1',{shield:1})"), false);
  assert.equal(app.read('getPlayer("p1").shieldTokens'), 0);
  app.run('finishPurchase(true);');
  assert.equal(await pending, true);
  assert.equal(app.read('getPlayer("p1").shieldTokens'), 1);
  assert.equal(app.read('getPlayer("p1").selfSelectedLow.fortune'), true);
  assert.equal(app.read('reliefPrompts.length'), 0);
});

test('history swaps preserve exchange inventories, movement and per-round investment rewards', async () => {
  const app = game();
  await app.run("buyAndActivate('p1',{navigation:2,shield:2,investment:1},'p2').then(()=>nextTurn())");
  await app.run("settleScoreChanges([{playerId:'p2',delta:{fortune:1}}],{source:'normal'})");
  app.run("useNavigation('p1',3); state.history=[snapshotRound()]; state.currentGame=GameState.createGame(stateModelOptions()); state.currentGame.players=[makePlayer({fortune:5,wisdom:5})];");
  const expected = app.read('state.history[0].exchange');
  await app.run('restoreRound(0)');
  assert.deepEqual(app.read('state.currentGame.exchange'), expected);
  assert.deepEqual(app.read('[getPlayer("p1").navigationTokens,getPlayer("p1").shieldTokens]'), [1, 2]);
});

test('self12 and self22 are independently once per player per game, while graduation can be regained', () => {
  const thresholds = { graduation: 30, navigator: [], self: [12, 22] };
  let p = { id: 'p1', fortune: 12, wisdom: 12, notified: {}, graduated: false };
  let result = rules.evaluatePlayerProgress(p, { fortune: 11, wisdom: 11 }, {}, thresholds);
  assert.equal(result.events.filter(e => e.type === 'breakthrough').length, 1);
  p = { ...p, notified: result.notified, fortune: 9 };
  result = rules.evaluatePlayerProgress(p, { fortune: 12, wisdom: 12 }, {}, thresholds);
  result = rules.evaluatePlayerProgress({ ...p, notified: result.notified, fortune: 22, wisdom: 22 }, p, {}, thresholds);
  assert.deepEqual(result.events.filter(e => e.type === 'breakthrough').map(e => e.threshold), [22]);
  const graduated = { ...p, fortune: 30, wisdom: 30, notified: result.notified, graduated: true };
  assert.equal(rules.evaluatePlayerProgress({ ...graduated, wisdom: 29 }, graduated, {}, thresholds).graduated, false);
  assert.equal(rules.evaluatePlayerProgress({ ...graduated, graduated: false }, { ...graduated, wisdom: 29 }, {}, thresholds).graduated, true);
});

test('old saves receive empty exchange defaults and corrupt inventory or investment data is rejected', () => {
  const save = model.createState();
  save.currentGame.players = [model.createPlayer({ id: 'p1' }), model.createPlayer({ id: 'p2' })];
  delete save.currentGame.exchange;
  delete save.currentGame.players[0].shieldTokens;
  const restored = model.decode(JSON.stringify(save)).state;
  assert.equal(restored.currentGame.exchange.opened, false);
  assert.equal(restored.currentGame.players[0].shieldTokens, 0);
  for (const quantity of [-1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    const bad = structuredClone(restored);
    bad.currentGame.players[0].navigationTokens = quantity;
    assert.throws(() => model.serialize(bad));
  }
  const bad = structuredClone(restored);
  bad.currentGame.exchange.investments = [{ id: 1, investorId: 'p1', targetId: 'p2', quantity: 1, startTurn: 1, rewardedTurns: [2, 2], closed: false }];
  bad.currentGame.exchange.nextInvestmentId = 2;
  assert.throws(() => model.serialize(bad));
});

test('imported Fate/Impermanence classification survives deck normalization and rejects unknown sources', () => {
  const card = { name: 'Fate', action: '', insight: '', rewardText: '-1', reward: { fortune: -1 }, damageSource: 'fate' };
  assert.equal(decks.normalize({ boostDeck: [card] }).boostDeck[0].damageSource, 'fate');
  assert.equal(decks.inspect({ boostDeck: [{ ...card, damageSource: 'all-loss' }] }).ok, false);
});

test('investment Civilization joins the growth batch before collective victory is evaluated', async () => {
  const app = game();
  await app.run("buyAndActivate('p1',{investment:2},'p2').then(()=>nextTurn())");
  app.run('state.currentGame.civGoal=2;');
  await app.run("settleScoreChanges([{playerId:'p2',delta:{wisdom:1}}],{source:'normal'})");
  assert.equal(app.read('state.currentGame._civGoalNoticed'), true);
  assert.equal(app.read('state.currentGame.log.filter(e=>e.text.startsWith("messages.civ_goal_reached_log")).length'), 1);
});

test('declined or cross-round low-point confirmation cannot grant free inventory', async () => {
  const app = game();
  app.run("getPlayer('p1').fortune=5; confirmModal=async()=>false;");
  assert.equal(await app.run("purchaseExchange('p1',{shield:1})"), false);
  assert.deepEqual(balances(app)[0], [5, 20, 0, 0, 0]);
  app.run('var resolvePurchase; confirmModal=()=>new Promise(resolve=>{resolvePurchase=resolve;});');
  const pending = app.run("purchaseExchange('p1',{shield:1})");
  await app.run('nextTurn()');
  app.run('resolvePurchase(true);');
  assert.equal(await pending, false);
  assert.deepEqual(balances(app)[0], [5, 20, 0, 0, 0]);
});

test('refunds cannot make another investment grow, including under endgame multipliers', async () => {
  const app = game();
  await app.run("buyAndActivate('p1',{investment:1},'p2').then(()=>nextTurn())");
  await app.run("buyAndActivate('p3',{investment:1},'p1').then(()=>nextTurn())");
  app.run('state.currentGame.timer.accumulated=5100;');
  await app.run('nextTurn()'); // First investor receives exactly 2, not 4, Fortune.
  assert.equal(app.read('getPlayer("p1").fortune'), 18);
  assert.equal(app.read('getPlayer("p3").civ'), 0);
  await app.run('nextTurn()');
  assert.equal(app.read('getPlayer("p3").fortune'), 18);
});

test('manual physical Fate card offers a shield while score corrections bypass multipliers, growth and relief', async () => {
  const app = game();
  await app.run("buyAndActivate('p2',{investment:1},'p1').then(()=>nextTurn())");
  app.run("Object.assign(getPlayer('p1'),{fortune:5,wisdom:5,shieldTokens:2}); state.currentGame.timer.accumulated=5100; adjustTargetId='p1';");
  app.element('#adjust-source').value = 'correction';
  app.element('#adjust-rows .adjust-row[data-stat="fortune"] .adjust-input').value = '-2';
  await app.run('applyAdjust()');
  assert.equal(app.read('getPlayer("p1").fortune'), 3);
  assert.equal(app.read('reliefPrompts.length'), 0);
  app.run("adjustTargetId='p1';");
  app.element('#adjust-source').value = 'fate';
  app.element('#adjust-rows .adjust-row[data-stat="fortune"] .adjust-input').value = '-2';
  app.element('#adjust-rows .adjust-row[data-stat="wisdom"] .adjust-input').value = '1';
  await app.run('applyAdjust()');
  assert.deepEqual(app.read('[getPlayer("p1").fortune,getPlayer("p1").wisdom,getPlayer("p1").shieldTokens,getPlayer("p2").civ]'), [3, 7, 1, 1]);
});

test('an overflowing activation gift leaves purchased inventory intact without charging again', async () => {
  const app = game();
  app.run('getPlayer("p2").wisdom=Number.MAX_SAFE_INTEGER;');
  assert.equal(await app.run("purchaseExchange('p1',{investment:1})"), true);
  const before = balances(app);
  assert.equal(await app.run("activateInvestment('p1','p2',1)"), false);
  assert.deepEqual(balances(app), before);
  assert.equal(app.read('getPlayer("p1").investmentTokens'), 1);
  assert.equal(app.read('state.currentGame.exchange.investments.length'), 0);
});

test('old rearmed breakthrough flags remain claimed after migration and still establish market eligibility', async () => {
  const app = game();
  app.run(`
    state.currentGame.exchange.opened=false;
    state.currentGame.players.forEach(p=>{p.fortune=5;p.wisdom=5;p.notified={};});
    getPlayer('p1').notified={self12:false,self22:false};
    saveNow();
  `);
  const loaded = createApp({ storage: app.storage });
  loaded.run('load();');
  assert.deepEqual(loaded.read('getPlayer("p1").notified'), { self12: true, self22: true });
  await loaded.run('processGameEvents()');
  assert.equal(loaded.read('state.currentGame.exchange.opened'), true);
  await loaded.run("settleScoreChanges([{playerId:'p1',values:{fortune:22,wisdom:22}}])");
  assert.equal(loaded.read('state.currentGame.log.filter(e=>e.text.startsWith("messages.breakthrough_encounter")).length'), 0);
});

test('all services can be bought and kept across rounds; investment observation starts only on later activation', async () => {
  const app = game();
  await app.run("purchaseExchange('p1',{navigation:2,shield:2,investment:2})");
  assert.equal(app.run("beginDice('p1')"), true);
  for (let i = 0; i < 3; i++) await app.run('nextTurn()');
  assert.equal(app.read('state.currentGame.exchange.investments.length'), 0);
  assert.equal(app.read('getPlayer("p2").wisdom'), 20);
  assert.equal(app.read('getPlayer("p1").fortune'), 8); // No refunds on unused tokens.
  app.run('saveNow();');
  const loaded = createApp({ storage: app.storage });
  loaded.run('load();');
  assert.deepEqual(loaded.read('[getPlayer("p1").navigationTokens,getPlayer("p1").shieldTokens,getPlayer("p1").investmentTokens]'), [2, 2, 2]);
  assert.equal(await loaded.run("activateInvestment('p1','p2',1)"), true);
  assert.deepEqual(loaded.read('[getPlayer("p1").fortune,getPlayer("p1").investmentTokens,getPlayer("p2").wisdom]'), [8, 1, 21]);
  assert.equal(loaded.read('state.currentGame.exchange.investments[0].startTurn'), 8);
  await loaded.run('nextTurn()');
  await loaded.run("settleScoreChanges([{playerId:'p2',delta:{fortune:1}}],{source:'normal'})");
  assert.equal(loaded.read('getPlayer("p1").civ'), 1);
});

test('activation validates quantity, recipient and turn before consuming any stored investments', async () => {
  const app = game();
  await app.run("purchaseExchange('p1',{investment:2})");
  const before = app.read('state.currentGame');
  for (const command of ["activateInvestment('p1','p1',1)", "activateInvestment('p1','p99',1)",
    "activateInvestment('p1','p2',0)", "activateInvestment('p1','p2',0.5)", "activateInvestment('p1','p2',3)"]) {
    assert.equal(await app.run(command), false);
    assert.deepEqual(app.read('state.currentGame'), before);
  }
  app.run("beginDice('p1');");
  assert.equal(await app.run("activateInvestment('p1','p2',1)"), false);
  assert.equal(app.read('getPlayer("p1").investmentTokens'), 2);
});

test('repeat activation clicks cannot consume or gift twice while one activation is settling', async () => {
  const app = game();
  await app.run("purchaseExchange('p1',{investment:2})");
  const first = app.run("activateInvestment('p1','p2',1)");
  assert.equal(await app.run("activateInvestment('p1','p2',1)"), false);
  assert.equal(await first, true);
  assert.equal(app.read('getPlayer("p1").investmentTokens'), 1);
  assert.equal(app.read('getPlayer("p2").wisdom'), 21);
  assert.equal(app.read('state.currentGame.exchange.investments.length'), 1);
});
