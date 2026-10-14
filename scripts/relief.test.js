const assert = require('node:assert/strict');
const test = require('node:test');
const { createApp } = require('./relief-fixture.js');

test('early phase only offers relief at zero and cancellation leaves quotas intact', async () => {
  const app = createApp();
  app.run("setStat('p1', 'fortune', 3)");
  await app.run("maybeCheckReliefAfterForcedLoss('p1', { fortune: 5, wisdom: 8 })");
  assert.equal(app.visible('#relief-modal'), false);
  app.run("setStat('p1', 'fortune', 0)");
  const pending = app.run("maybeCheckReliefAfterForcedLoss('p1', { fortune: 3, wisdom: 8 })");
  await app.flush();
  assert.equal(app.visible('#relief-modal'), true);
  assert.equal(app.element('#relief-ok').disabled, true);
  app.element('#relief-ok').dispatch('click');
  assert.equal(app.visible('#relief-modal'), true);
  app.element('#relief-later').dispatch('click');
  await pending;
  assert.equal(app.run("getPlayer('p1').fortune"), 0);
  assert.equal(app.run("getPlayer('p1').reliefUsed.fortune"), false);
});

test('late phase relieves both qualifying stats with one acknowledged prompt', async () => {
  const app = createApp();
  app.run("state.turnNum = 4; state.reliefSweepDone = true; setStat('p1', 'fortune', 3); setStat('p1', 'wisdom', 2);");
  const pending = app.run("maybeCheckReliefAfterForcedLoss('p1', { fortune: 5, wisdom: 8 })");
  await app.flush();
  app.approveRelief();
  await pending;
  assert.deepEqual(app.read("snapshotFw(getPlayer('p1'))"), { fortune: 5, wisdom: 5 });
  assert.deepEqual(app.read("getPlayer('p1').reliefUsed"), { fortune: true, wisdom: true });
  assert.equal(app.visible('#relief-modal'), false);
});

test('approval rechecks recovered scores without reducing points or using quota', async () => {
  const app = createApp();
  app.run("setStat('p1', 'fortune', 0)");
  const pending = app.run("maybeCheckReliefAfterForcedLoss('p1', { fortune: 5, wisdom: 8 })");
  await app.flush();
  app.run("setStat('p1', 'fortune', 7)");
  app.approveRelief();
  await pending;
  assert.equal(app.run("getPlayer('p1').fortune"), 7);
  assert.equal(app.run("getPlayer('p1').reliefUsed.fortune"), false);
  assert.equal(app.run("getPlayer('p1').shelterFromTurn"), null);
});

test('approval only rescues stats still qualifying when one of two recovers', async () => {
  const app = createApp();
  app.run("setStat('p1', 'fortune', 0); setStat('p1', 'wisdom', 0)");
  const pending = app.run("maybeCheckReliefAfterForcedLoss('p1', { fortune: 5, wisdom: 8 })");
  await app.flush();
  app.run("setStat('p1', 'fortune', 7)");
  app.approveRelief();
  await pending;
  assert.deepEqual(app.read("snapshotFw(getPlayer('p1'))"), { fortune: 7, wisdom: 5 });
  assert.deepEqual(app.read("getPlayer('p1').reliefUsed"), { fortune: false, wisdom: true });
});

test('queued relief skips a player who recovered before the prompt opens', async () => {
  const app = createApp();
  const first = app.run("showReliefModal({ name: 'B', items: ['fortune'], scores: { fortune: 0 } })");
  await app.flush();
  app.run("setStat('p1', 'fortune', 0)");
  const pending = app.run("maybeCheckReliefAfterForcedLoss('p1', { fortune: 5, wisdom: 8 })");
  app.run("setStat('p1', 'fortune', 7)");
  app.element('#relief-later').dispatch('click');
  await first;
  await pending;
  assert.equal(app.visible('#relief-modal'), false);
  assert.equal(app.run("getPlayer('p1').reliefUsed.fortune"), false);
});

test('queued relief displays the latest qualifying score', async () => {
  const app = createApp();
  app.run('state.turnNum = 4; state.reliefSweepDone = true;');
  const first = app.run("showReliefModal({ name: 'B', items: ['fortune'] })");
  await app.flush();
  app.run("setStat('p1', 'fortune', 3)");
  const pending = app.run("maybeCheckReliefAfterForcedLoss('p1', { fortune: 5, wisdom: 8 })");
  app.run("setStat('p1', 'fortune', 2)");
  app.element('#relief-later').dispatch('click');
  await first;
  await app.flush();
  assert.match(app.element('#relief-message').textContent, /"score":2/);
  app.element('#relief-later').dispatch('click');
  await pending;
});

test('sprint sweep does not undo an origin reward earned before relief approval', async () => {
  const app = createApp();
  app.run("setStat('p1', 'fortune', 3); openOriginModal('p1'); state.timer.accumulated = 5100; updateTopbar();");
  await app.flush();
  assert.equal(app.visible('#relief-modal'), true);
  await app.run("scoreOrigin('p1', true)");
  assert.equal(app.run("getPlayer('p1').fortune"), 7);
  app.approveRelief();
  await app.flush();
  assert.equal(app.run("getPlayer('p1').fortune"), 7);
  assert.equal(app.run("getPlayer('p1').reliefUsed.fortune"), false);
});

test('multi-player sweep rechecks each player at approval', async () => {
  const app = createApp();
  app.run("state.turnNum = 4; state.reliefSweepDone = true; setStat('p1', 'fortune', 3); setStat('p2', 'fortune', 2);");
  const pending = app.run('sweepReliefOnBoundary()');
  await app.flush();
  app.run("setStat('p1', 'fortune', 7)");
  app.approveRelief();
  await pending;
  assert.equal(app.run("getPlayer('p1').fortune"), 7);
  assert.equal(app.run("getPlayer('p1').reliefUsed.fortune"), false);
  assert.equal(app.run("getPlayer('p2').fortune"), 5);
  assert.equal(app.run("getPlayer('p2').reliefUsed.fortune"), true);
});

test('second relief extends shelter without removing the current protected turn', async () => {
  const app = createApp();
  app.run("setStat('p1', 'fortune', 0)");
  await app.run("executeRelief('p1', ['fortune'])");
  app.run("state.turnNum = 2; setStat('p1', 'wisdom', 0)");
  assert.equal(app.run("scoreMultiplier('p1').id"), 'SHELTER');
  await app.run("executeRelief('p1', ['wisdom'])");
  assert.equal(app.run("scoreMultiplier('p1').id"), 'SHELTER');
  assert.equal(app.run("getPlayer('p1').shelterFromTurn"), 2);
  assert.equal(app.run("getPlayer('p1').shelterToTurn"), 4);
  app.run('state.turnNum = 4');
  assert.equal(app.run("playerInShelter(getPlayer('p1'))"), true);
  app.run('state.turnNum = 5');
  assert.equal(app.run("playerInShelter(getPlayer('p1'))"), false);
});

test('relief after expired shelter starts a new period on the following turn', async () => {
  const app = createApp();
  app.run("setStat('p1', 'fortune', 0)");
  await app.run("executeRelief('p1', ['fortune'])");
  app.run("state.turnNum = 5; setStat('p1', 'wisdom', 0)");
  await app.run("executeRelief('p1', ['wisdom'])");
  assert.equal(app.run("getPlayer('p1').shelterFromTurn"), 6);
  assert.equal(app.run("getPlayer('p1').shelterToTurn"), 7);
  assert.equal(app.run("playerInShelter(getPlayer('p1'))"), false);
});

test('used quotas and self-selected low tags are respected independently', async () => {
  const app = createApp();
  app.run("state.turnNum = 4; state.reliefSweepDone = true; setStat('p1', 'fortune', 0); setStat('p1', 'wisdom', 0); getPlayer('p1').selfSelectedLow.fortune = true;");
  await app.run("executeRelief('p1', ['fortune', 'wisdom'])");
  assert.deepEqual(app.read("snapshotFw(getPlayer('p1'))"), { fortune: 0, wisdom: 5 });
  assert.deepEqual(app.read("getPlayer('p1').reliefUsed"), { fortune: false, wisdom: true });
  app.run("setStat('p1', 'wisdom', 0)");
  assert.equal(await app.run("executeRelief('p1', ['wisdom'])"), false);
  app.run("setStat('p1', 'fortune', 4)");
  assert.equal(app.run("getPlayer('p1').selfSelectedLow.fortune"), false);
});

test('shelter loss rounding and endgame priority retain v2.1 behavior', () => {
  const app = createApp();
  assert.deepEqual(app.read("[-1, -2, -3, -4].map(n => applyMult(n, 'fortune', GAME_CONFIG.MULTIPLIERS.SHELTER))"), [-1, -1, -2, -2]);
  app.run("state.turnNum = 6; state.weatherEvents[0].lockedWeather = 'DISASTER'; getPlayer('p1').shelterFromTurn = 6; getPlayer('p1').shelterToTurn = 7;");
  assert.equal(app.run("scoreMultiplier('p1').id"), 'SHELTER');
  app.run('state.timer.accumulated = 5100');
  assert.equal(app.run("scoreMultiplier('p1').id"), 'ENDGAME');
});

test('restored completed sweep does not replay and the leaving game keeps its own flag', async () => {
  const app = createApp();
  app.run("state.turnNum = 5; state.reliefSweepDone = true; setStat('p1', 'fortune', 2); state.history = [snapshotRound()]; state.roundNum = 2; state.turnNum = 1; state.reliefSweepDone = false; confirmModal = async () => true;");
  assert.equal(app.run('state.history[0].reliefSweepDone'), true);
  await app.run('restoreRound(0)');
  assert.equal(app.run('state.reliefSweepDone'), true);
  assert.equal(app.run('state.history[0].reliefSweepDone'), false);
  await app.run('nextTurn()');
  assert.equal(app.visible('#relief-modal'), false);
});

test('restored game before forecast still performs its first sweep', async () => {
  const app = createApp();
  app.run("state.turnNum = 3; setStat('p1', 'fortune', 2); state.history = [snapshotRound()]; state.roundNum = 2; state.turnNum = 5; state.reliefSweepDone = true; confirmModal = async () => true;");
  await app.run('restoreRound(0)');
  assert.equal(app.run('state.reliefSweepDone'), false);
  const pending = app.run('nextTurn()');
  await app.flush();
  assert.equal(app.visible('#relief-modal'), true);
  app.element('#relief-later').dispatch('click');
  await pending;
  assert.equal(app.run('state.reliefSweepDone'), true);
});

for (const [turn, elapsed, expected] of [[5, 0, true], [1, 5100, true], [3, 0, false]]) {
  test(`old history without sweep flag restores safely at turn ${turn}, elapsed ${elapsed}`, async () => {
    const app = createApp();
    app.run(`state.turnNum = ${turn}; state.timer.accumulated = ${elapsed}; state.history = [snapshotRound()]; delete state.history[0].reliefSweepDone; state.roundNum = 2; state.turnNum = 1; state.timer.accumulated = 0; state.reliefSweepDone = ${!expected}; confirmModal = async () => true;`);
    await app.run('restoreRound(0)');
    assert.equal(app.run('state.reliefSweepDone'), expected);
  });
}

test('old pending relief cannot consume a replacement players quota', async () => {
  const app = createApp();
  app.run("setStat('p1', 'fortune', 0)");
  const pending = app.run("maybeCheckReliefAfterForcedLoss('p1', { fortune: 5, wisdom: 8 })");
  await app.flush();
  app.run("state.players = [makePlayer({ name: 'New', fortune: 0, wisdom: 8 })]; state.players[0].id = 'p1';");
  app.approveRelief();
  await pending;
  assert.equal(app.run("getPlayer('p1').fortune"), 0);
  assert.equal(app.run("getPlayer('p1').reliefUsed.fortune"), false);
});

for (const key of ['Enter', 'Escape']) {
  test(`${key} only operates the top confirmation when relief is also open`, async () => {
    const app = createApp();
    app.run("setStat('p1', 'fortune', 0)");
    const relief = app.run("maybeCheckReliefAfterForcedLoss('p1', { fortune: 5, wisdom: 8 })");
    await app.flush();
    app.element('#relief-ack-cb').checked = true;
    app.element('#relief-ack-cb').dispatch('change');
    const confirm = app.run("confirmModal({ message: 'Another confirmation' })");
    app.key(key);
    assert.equal(await confirm, key === 'Enter');
    assert.equal(app.visible('#relief-modal'), true);
    assert.equal(app.run("getPlayer('p1').reliefUsed.fortune"), false);
    assert.equal(app.document.activeElement, app.element('#relief-ack-cb'));
    app.key('Escape');
    await relief;
  });
}

test('a queued relief opening beneath confirmation does not steal keyboard focus', async () => {
  const app = createApp();
  const confirm = app.run("confirmModal({ message: 'Another confirmation' })");
  const relief = app.run("showReliefModal({ name: 'A', items: ['fortune'] })");
  await app.flush();
  assert.equal(app.document.activeElement, app.element('#confirm-ok'));
  app.key('Escape');
  await confirm;
  app.key('Escape');
  await relief;
});
