const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const decks = require('../deck-model');
const stateModel = require('../game-state');
const { createApp } = require('./app-fixture');
const boost = () => ({ name: 'Fixture', action: 'Do', insight: 'Think', reward: { fortune: 1 }, rewardText: '+1' });
const choice = () => ({ name: 'Choice', scene: 'Decide', both: true, options: [{ label: 'A', each: { fortune: -1 }, civAll: -2 }, { label: 'B', each: { wisdom: 1 } }] });

for (const lang of ['zh-tw', 'zh-cn', 'en']) {
  test(`${lang} default decks validate, build pools and survive export/import`, () => {
    const original = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'cards-' + lang + '.json')));
    const normalized = decks.normalize(original);
    assert.deepEqual(decks.normalize(JSON.parse(JSON.stringify(normalized))), normalized);
    const actions = decks.buildActionPool(normalized.actionDeck);
    const boosts = decks.buildBoostPool(normalized.boostDeck);
    assert.ok(actions.length && boosts.length);
    assert.ok(actions.every(card => card.options || card.reward));
    assert.ok(boosts.every(card => card.options || card.reward));
    if (lang === 'en') assert.equal(boosts[0].both, true);
  });
}

test('action card overrides take precedence over category rewards', () => {
  const data = { actionDeck: { Category: { reward: { fortune: 1 }, rewardText: '+1', cards: [{ name: 'Own', desc: 'Own reward', reward: { wisdom: 2 }, rewardText: '+2' }, { name: 'Base', desc: 'Base reward' }, choice()] } } };
  const pool = decks.buildActionPool(decks.normalize(data).actionDeck);
  assert.deepEqual(pool[0].reward, { wisdom: 2 });
  assert.deepEqual(pool[1].reward, { fortune: 1 });
  assert.equal(pool[2].reward, undefined);
  assert.deepEqual(pool[2].options, data.actionDeck.Category.cards[2].options);
});

for (const value of ['2', null, NaN, Infinity, 1.5, 2147483648]) {
  test(`reject invalid reward amount ${String(value)} before replacing any decks`, () => {
    const card = boost(); card.reward.fortune = value;
    const result = decks.inspect({ boostDeck: [card] });
    assert.equal(result.ok, false);
    assert.equal(result.error.key, 'deckValidation.points');
    assert.equal(result.error.path, 'boostDeck[0].reward.fortune');
  });
}

test('reject unknown stats, arrays in objects and mistyped flags', () => {
  const unknown = boost(); unknown.reward.luck = 1;
  assert.equal(decks.inspect({ boostDeck: [unknown] }).error.key, 'deckValidation.stat');
  const array = boost(); array.reward = [];
  assert.equal(decks.inspect({ boostDeck: [array] }).error.key, 'deckValidation.object');
  const flagged = boost(); flagged.both = 'true';
  assert.equal(decks.inspect({ boostDeck: [flagged] }).error.key, 'deckValidation.boolean');
});

test('choice cards validate nested points, manual fields and conditional branches', () => {
  const valid = choice(); valid.conditional = { civGte: 0 };
  assert.equal(decks.inspect({ boostDeck: [valid] }).ok, true);
  for (const mutate of [c => { c.options = []; }, c => { c.options[0].each = []; }, c => { c.options[0].civAll = '2'; }, c => { c.options[0].side = 3; }, c => { c.conditional = { civGte: -1 }; }, c => { c.conditional = {}; }]) {
    const card = choice(); mutate(card);
    assert.equal(decks.inspect({ boostDeck: [card] }).ok, false);
  }
});

test('new imports reject empty decks while old empty saved decks remain compatible', () => {
  assert.equal(decks.inspect({ boostDeck: [] }).error.key, 'deckValidation.empty');
  assert.equal(decks.inspect({ actionDeck: {} }).error.key, 'deckValidation.empty');
  assert.deepEqual(decks.normalizeCustomDecks({ action: null, boost: [] }), { action: null, boost: [] });
});

test('malformed saved card effects are rejected before loading the game', () => {
  const state = stateModel.createState();
  const card = boost(); card.reward.fortune = '2';
  state.settings.customDecks.boost = [card];
  assert.throws(() => stateModel.decode(JSON.stringify(state)), /points/);
});

test('failed import keeps both decks and never opens confirmation', async () => {
  const app = createApp();
  const before = app.read('state.settings.customDecks');
  app.run('var confirmations = 0; confirmModal = async () => { confirmations++; return true; };');
  await app.run("applyDecksImport({ boostDeck: [{ name: 'Bad', action: '', insight: '', reward: { fortune: '2' }, rewardText: '+2' }] })");
  assert.equal(app.run('confirmations'), 0);
  assert.deepEqual(app.read('state.settings.customDecks'), before);
});

test('import copies validated data before confirmation and replaces only supplied decks', async () => {
  const app = createApp();
  app.run(`
    window.i18n = { cards: { actionDeck: { Base: {reward:{fortune:1},rewardText:'+1',cards:[{name:'Base',desc:'Base'}]} }, boostDeck: [] } };
    var importData = { boostDeck: [{ name:'New',action:'Do',insight:'Think',reward:{fortune:2},rewardText:'+2' }] };
    var approveImport;
    confirmModal = () => new Promise(resolve => { approveImport = resolve; });
  `);
  const pending = app.run('applyDecksImport(importData)');
  app.run("importData.boostDeck[0].reward.fortune = 'bad'; approveImport(true);");
  await pending;
  assert.equal(app.run('state.settings.customDecks.boost[0].reward.fortune'), 2);
  assert.equal(app.run('state.settings.customDecks.action'), null);
  assert.equal(app.run('DECKS.boost.pool[0].name'), 'New');
});
