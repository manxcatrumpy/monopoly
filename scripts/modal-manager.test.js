const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ModalManager = require('../modal-manager');
const { createDOM } = require('./dom-fixture');
const { createApp } = require('./relief-fixture');

function fixture() {
  const dom = createDOM();
  let scope = {};
  const manager = ModalManager.create({ document: dom.document, getScope: () => scope });
  manager.register('normal-modal', { initialFocus: '#first', closeOnBackdrop: true });
  manager.register('other-modal', { initialFocus: '#other' });
  manager.register('relief-modal', { priority: 1, initialFocus: '#relief' });
  manager.register('confirm-modal', { priority: 2, initialFocus: '#accept' });
  const opener = dom.control('opener');
  const first = dom.control('first', 'normal-modal');
  const last = dom.control('last', 'normal-modal');
  const other = dom.control('other', 'other-modal');
  const relief = dom.control('relief', 'relief-modal');
  const accept = dom.control('accept', 'confirm-modal');
  opener.focus();
  return { ...dom, manager, opener, first, last, other, relief, accept,
    scope: () => scope, changeScope: value => { scope = value; } };
}

test('priority controls visual order, inert state and focus regardless of DOM or open order', () => {
  const f = fixture();
  f.manager.open('confirm-modal');
  f.manager.open('normal-modal');
  f.manager.open('relief-modal');
  assert.deepEqual(f.manager.stack(), ['normal-modal', 'relief-modal', 'confirm-modal']);
  assert.equal(f.document.activeElement, f.accept);
  assert.equal(f.element('#normal-modal').inert, true);
  assert.equal(f.element('#relief-modal').getAttribute('aria-hidden'), 'true');
  assert.equal(f.element('#confirm-modal').getAttribute('aria-modal'), 'true');
  assert.equal(f.element('#confirm-modal').style.getPropertyValue('--modal-order'), '2');
  f.manager.close('confirm-modal');
  assert.equal(f.document.activeElement, f.relief);
  assert.equal(f.element('#relief-modal').inert, false);
});

test('same-priority dialogs use open order and duplicate opens do not change it', () => {
  const f = fixture();
  f.manager.open('normal-modal'); f.manager.open('other-modal'); f.manager.open('normal-modal');
  assert.deepEqual(f.manager.stack(), ['normal-modal', 'other-modal']);
  assert.equal(f.document.activeElement, f.other);
});

test('nested close restores the previous control and final close restores the opener', () => {
  const f = fixture();
  f.manager.open('normal-modal'); f.last.focus(); f.manager.open('confirm-modal');
  f.manager.close('confirm-modal');
  assert.equal(f.document.activeElement, f.last);
  f.manager.close('normal-modal');
  assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.main.inert, false);
  assert.equal(f.document.body.style.overflow, '');
});

test('closing a lower dialog does not steal focus from the top dialog', () => {
  const f = fixture(); f.manager.open('normal-modal'); f.manager.open('confirm-modal');
  f.manager.close('normal-modal');
  assert.equal(f.document.activeElement, f.accept);
  assert.equal(f.manager.topId(), 'confirm-modal');
});

test('Tab and Shift+Tab wrap within the top dialog and skip unavailable controls', () => {
  const f = fixture();
  f.control('disabled', 'normal-modal').disabled = true;
  f.control('negative', 'normal-modal').setAttribute('tabindex', '-1');
  f.control('hidden', 'normal-modal').classList.add('hidden');
  f.manager.open('normal-modal');
  f.last.focus(); assert.equal(f.key('Tab').defaultPrevented, true);
  assert.equal(f.document.activeElement, f.first);
  f.key('Tab', { shiftKey: true });
  assert.equal(f.document.activeElement, f.last);
  f.opener.focus();
  assert.equal(f.document.activeElement, f.last);
});

test('a dialog without enabled controls focuses its own root', () => {
  const f = fixture(); f.first.disabled = true; f.last.disabled = true;
  f.manager.open('normal-modal');
  assert.equal(f.document.activeElement, f.element('#normal-modal'));
  f.key('Tab');
  assert.equal(f.document.activeElement, f.element('#normal-modal'));
});

test('background inert and scroll settings restore their original values', () => {
  const f = fixture(); f.main.inert = true; f.document.body.style.overflow = 'auto';
  f.manager.open('normal-modal'); f.manager.close('normal-modal');
  assert.equal(f.main.inert, true);
  assert.equal(f.document.body.style.overflow, 'auto');
});

test('backdrop and Escape only close the top dialog with the allowed policy', () => {
  const f = fixture(); f.manager.open('normal-modal'); f.manager.open('confirm-modal');
  f.element('#normal-modal .modal-backdrop').click();
  assert.equal(f.manager.isOpen('normal-modal'), true);
  f.element('#confirm-modal .modal-backdrop').click();
  assert.equal(f.manager.isOpen('confirm-modal'), true);
  f.key('Escape');
  assert.equal(f.manager.isOpen('confirm-modal'), false);
  f.element('#normal-modal .modal-backdrop').click();
  assert.equal(f.manager.isOpen('normal-modal'), false);
});

test('prompts with the same id run FIFO and each cleanup runs once', async () => {
  const f = fixture(), titles = [];
  let cleanupCount = 0, firstControls;
  const ask = label => f.manager.prompt('confirm-modal', {
    prepare: () => { titles.push(label); return true; },
    onClose: () => cleanupCount++,
    onOpen(controls) { if (!firstControls) firstControls = controls; controls.listen(f.accept, 'click', () => controls.close(true)); },
  });
  const first = ask('first'), second = ask('second');
  assert.deepEqual(titles, ['first']);
  f.accept.click(); assert.equal(await first, true);
  assert.deepEqual(titles, ['first', 'second']);
  firstControls.close(true);
  assert.equal(f.manager.isOpen('confirm-modal'), true);
  f.key('Escape'); assert.equal(await second, false);
  assert.equal(cleanupCount, 2);
  assert.equal(f.document.activeElement, f.opener);
});

test('scope cancellation resolves active and queued prompts without reopening them', async () => {
  const f = fixture();
  const first = f.manager.prompt('confirm-modal');
  const second = f.manager.prompt('confirm-modal');
  const relief = f.manager.prompt('relief-modal');
  f.manager.open('normal-modal');
  f.manager.cancelScope(f.scope());
  assert.deepEqual(await Promise.all([first, second, relief]), [false, false, false]);
  assert.deepEqual(f.manager.stack(), []);
  assert.equal(f.manager.pendingCount('confirm-modal'), 0);
  assert.equal(f.main.inert, false);
});

test('a queued prompt owned by an old game skips preparation after game replacement', async () => {
  const f = fixture(); let prepared = false;
  const first = f.manager.prompt('confirm-modal');
  const second = f.manager.prompt('confirm-modal', { prepare: () => { prepared = true; return true; } });
  f.changeScope({}); f.manager.close('confirm-modal');
  assert.equal(await first, false); assert.equal(await second, false);
  assert.equal(prepared, false);
});

test('Enter respects a focused cancel button instead of accepting the prompt', async () => {
  const f = fixture(); const cancel = f.control('cancel', 'confirm-modal');
  const pending = f.manager.prompt('confirm-modal', { onEnter: accept => accept(), onOpen: controls => {
    controls.listen(cancel, 'click', () => controls.close(false));
  } });
  cancel.focus(); f.key('Enter');
  assert.equal(await pending, false);
});

test('IME, repeated keys and textarea Enter do not accidentally accept prompts', async () => {
  const f = fixture(); const input = f.control('message', 'confirm-modal', 'TEXTAREA');
  const pending = f.manager.prompt('confirm-modal', { onEnter: accept => accept() });
  f.key('Enter', { isComposing: true }); f.key('Enter', { repeat: true });
  input.focus(); assert.equal(f.key('Enter').defaultPrevented, false);
  assert.equal(f.manager.isOpen('confirm-modal'), true);
  f.key('Escape'); assert.equal(await pending, false);
});

test('initialization failure closes the dialog and rejects without trapping the background', async () => {
  const f = fixture();
  await assert.rejects(f.manager.prompt('confirm-modal', { onOpen: () => { throw new Error('Fixture'); } }), /Fixture/);
  assert.equal(f.main.inert, false);
  assert.deepEqual(f.manager.stack(), []);
  f.manager.open('normal-modal'); assert.equal(f.manager.topId(), 'normal-modal');
});

test('destroy resolves pending prompts and releases background and keyboard handlers', async () => {
  const f = fixture(); const pending = f.manager.prompt('confirm-modal');
  f.manager.destroy(); assert.equal(await pending, false);
  assert.equal(f.main.inert, false);
  assert.equal(f.key('Escape').defaultPrevented, false);
});

test('app confirmation requests keep separate messages and never both accept on one Enter', async () => {
  const app = createApp();
  const first = app.run("confirmModal({message:'First'})"), second = app.run("confirmModal({message:'Second'})");
  assert.equal(app.element('#confirm-message').textContent, 'First');
  app.key('Enter'); assert.equal(await first, true);
  assert.equal(app.element('#confirm-message').textContent, 'Second');
  app.key('Escape'); assert.equal(await second, false);
});

test('game UI cleanup cancels confirmation, relief and their queues together', async () => {
  const app = createApp();
  const confirm = app.run("confirmModal({message:'Old'})"), queued = app.run("confirmModal({message:'Queued'})");
  const relief = app.run("showReliefModal({name:'A',items:['fortune']})");
  app.run("modals.open('adjust-modal'); adjustTargetId='p1'; clearGameUi(); state.currentGame=GameState.createGame(stateModelOptions());");
  assert.deepEqual(await Promise.all([confirm, queued, relief]), [false, false, false]);
  assert.equal(app.run('adjustTargetId'), null);
  assert.deepEqual(app.read('modals.stack()'), []);
});

for (const approve of [false, true]) {
  test(`weather adjustment confirmation stays above its form and ${approve ? 'applies' : 'cancels'} the charge`, async () => {
    const app = createApp();
    const row = app.element('weather-row');
    row.setAttribute('data-id', 'p1');
    row.querySelector('.adj-fortune').value = '3';
    row.querySelector('.adj-wisdom').value = '0';
    app.element('#weather-adjust-players .weather-adj-row').items = [row];
    app.run("state.currentGame.turnNum=5; state.currentGame.reliefSweepDone=true; state.currentGame.weatherEvents[0].lockedWeather='DISASTER'; openWeatherAdjustModal();");
    const submitted = app.element('#weather-adjust-submit').listeners.click();
    assert.equal(app.run('modals.topId()'), 'confirm-modal');
    assert.equal(app.element('#weather-adjust-modal').inert, true);
    assert.equal(app.run("getPlayer('p1').fortune"), 5);
    if (!approve) app.element('#confirm-cancel').focus();
    app.key('Enter');
    await submitted;
    assert.equal(app.run("getPlayer('p1').fortune"), approve ? 2 : 5);
    assert.equal(app.run('totalCiv()'), approve ? 1 : 0);
    assert.equal(app.visible('#weather-adjust-modal'), !approve);
    assert.equal(app.element('#weather-adjust-modal').inert, false);
  });
}

test('every page modal is registered and shown/hidden only by the manager', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const ids = Array.from(html.matchAll(/id="([\w-]+-modal)" class="modal hidden"/g), match => match[1]);
  assert.equal(ids.length, 13);
  for (const id of ids) assert.ok(app.includes("'" + id + "':"), id);
  assert.doesNotMatch(app, /addEventListener\('keydown'/);
  assert.doesNotMatch(app, /\$\('#[\w-]+-modal'\)\.classList\.(add|remove)\('hidden'\)/);
});
