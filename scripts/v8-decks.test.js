const assert = require('node:assert/strict');
const test = require('node:test');
const DeckModel = require('../deck-model');
const rules = require('../game-rules');
const { createApp } = require('./app-fixture');
const source = require('../locales/cards-zh-tw.json');
const actions = DeckModel.buildActionPool(source.actionDeck);
const action = name => actions.find(c => c.name === name);
const boost = name => source.boostDeck.find(c => c.name === name);
const players = () => Array.from({ length: 4 }, (_, i) => ({ id: 'p' + (i + 1), fortune: 5, wisdom: 5, civ: 0 }));
const plan = (card, ids, options = {}, table = players()) => rules.planCardOperations(table, card, ids, options);
const after = (card, ids, options = {}, table = players()) => rules.calculateScoreBatch(table, plan(card, ids, options, table));
const effectSignature = card => ({ reward: card.reward, both: card.both, extraReward: card.extraReward,
  options: card.options?.map(({ each, actor, civAll, civAllExclude, both, availableWhen }) => ({ each, actor, civAll, civAllExclude, both, availableWhen })) });

for (const lang of ['zh-tw', 'zh-cn', 'en']) {
  test(`V8 ${lang}: 42 actions and 30 boosts with matching effects and export roundtrip`, () => {
    const data = DeckModel.normalize(require('../locales/cards-' + lang + '.json'));
    const pool = DeckModel.buildActionPool(data.actionDeck);
    assert.equal(pool.length, 42);
    assert.equal(data.boostDeck.length, 30);
    assert.equal(new Set(pool.map(c => c.name)).size, 42);
    assert.equal(new Set(data.boostDeck.map(c => c.name)).size, 30);
    assert.deepEqual(pool.map(effectSignature), actions.map(effectSignature));
    assert.deepEqual(data.boostDeck.map(effectSignature), source.boostDeck.map(effectSignature));
    assert.deepEqual(DeckModel.normalize(JSON.parse(JSON.stringify(data))), data);
  });
}

for (const total of [19, 20, 21]) {
  test(`ecological dividend branches at collective civilization ${total}`, () => {
    const card = boost('生態紅利');
    assert.deepEqual(card.options.map((_, i) => rules.cardOptionAvailable(card, i, total)), total < 20 ? [false, true, true] : [true, false, false]);
    const table = players(); table[0].civ = total;
    assert.throws(() => plan(card, ['p1', 'p2'], { optionIndex: total < 20 ? 0 : 1 }, table), /invalid_selection/);
    const result = after(card, ['p1', 'p2'], { optionIndex: total < 20 ? 2 : 0 }, table);
    assert.equal(result.find(p => p.playerId === 'p1').after.fortune, total < 20 ? 3 : 7);
    if (total < 20) assert.equal(result.find(p => p.playerId === 'p4').after.civ, 1);
  });
}

test('learning preserves the full actor reward and automatically gives only civilization to the answerer', () => {
  const result = after(action('跨界學習'), ['p1'], { extraIds: ['p2'] });
  assert.deepEqual(result.map(c => c.after), [{ fortune: 7, wisdom: 7, civ: 2 }, { fortune: 5, wisdom: 5, civ: 1 }]);
  for (const extraIds of [[], ['p1'], ['p2', 'p2'], ['p9'], ['p2', 'p3']]) {
    assert.throws(() => plan(action('跨界學習'), ['p1'], { extraIds }), /invalid_selection/);
  }
});

test('anchoring gives the leader the base reward and only selected others the participant reward', () => {
  const result = after(action('靜心錨定'), ['p1'], { extraIds: ['p2', 'p4'], multipliers: { p2: { gain: 2, loss: 2 } } });
  assert.deepEqual(result.map(c => c.after), [{ fortune: 6, wisdom: 8, civ: 2 }, { fortune: 5, wisdom: 7, civ: 0 }, { fortune: 5, wisdom: 6, civ: 0 }]);
  assert.equal(plan(action('靜心錨定'), ['p1']).length, 1);
  assert.throws(() => plan(action('靜心錨定'), ['p1'], { extraIds: ['p1'] }), /invalid_selection/);
});

for (const name of ['啊，忘記關了', '永遠的下次一定', '隱形佔地王']) {
  test(`${name}: remedial actor is exempt even at zero, others still lose civilization`, () => {
    const table = players(); table.forEach((p, i) => { p.civ = i === 0 ? 0 : 2; });
    const result = after(action(name), ['p1'], { optionIndex: 1 }, table);
    assert.deepEqual(result.map(c => c.after.civ), [0, 1, 1, 1]);
    const noRemedy = after(action(name), ['p2'], { optionIndex: 0 }, table);
    assert.deepEqual(table.map(p => noRemedy.find(c => c.playerId === p.id)?.after.civ ?? p.civ), [0, 1, 1, 1]);
    assert.equal(table[1].civ, 2);
  });
}

test('emotional garbage truck costs only the actor wisdom on remedy and requires two players for complaints', () => {
  const card = action('情緒垃圾車');
  const result = after(card, ['p1'], { optionIndex: 1 });
  assert.deepEqual(result.map(c => c.after), [{ fortune: 5, wisdom: 4, civ: 1 }, ...Array.from({ length: 3 }, () => ({ fortune: 5, wisdom: 5, civ: 1 }))]);
  assert.throws(() => plan(card, ['p1'], { optionIndex: 0 }), /invalid_selection/);
  assert.throws(() => plan(card, ['p1', 'p2'], { optionIndex: 1 }), /invalid_selection/);
  const table = players(); table.forEach(p => { p.civ = 2; });
  const negative = after(card, ['p1', 'p2'], { optionIndex: 0 }, table);
  assert.deepEqual(negative.map(c => c.after.fortune), [4, 4, 5, 5]);
  assert.ok(negative.every(c => c.after.civ === 1));
});

test('new shared responsibility options pay both costs and give civilization to every player', () => {
  for (const [name, wisdom, civ] of [['理所當然的巨嬰', 4, 2], ['不留痕跡的過客', 5, 1]]) {
    const result = after(boost(name), ['p1', 'p2'], { optionIndex: 1 });
    assert.deepEqual(result.slice(0, 2).map(c => [c.after.fortune, c.after.wisdom]), [[4, wisdom], [4, wisdom]]);
    assert.ok(result.every(c => c.after.civ === civ));
  }
  assert.deepEqual(action('善意隨機發送').reward, { fortune: 2 });
  assert.deepEqual(action('跨越情緒').reward, { fortune: 2, wisdom: 2, civ: 2 });
  assert.equal(action('跨越情緒').extraReward, undefined);
  assert.equal(action('覆盤總結').reward.civ, 3);
});

test('new schema rejects malformed effects and incompatible role/choice definitions', () => {
  const mutations = [
    c => { c.options[0].availableWhen = { civLt: '20' }; },
    c => { c.options[0].availableWhen = { unknown: 20 }; },
    c => { c.options[0].availableWhen = { civLt: -1 }; },
    c => { c.options[0].civAllExclude = 'everyone'; },
    c => { c.options[0].actor = { wisdom: '1' }; },
    c => { c.options[0].both = 'true'; },
    c => { c.conditional = { civGte: 20 }; },
    c => { c.extraReward = { role: 'participants', reward: { wisdom: 1 } }; },
  ];
  for (const mutate of mutations) {
    const card = structuredClone(boost('生態紅利')); mutate(card);
    assert.equal(DeckModel.inspect({ boostDeck: [card] }).ok, false);
  }
  for (const extraReward of [{ role: 'other', reward: { civ: 1 } }, { role: 'answerer', reward: { civ: '1' } }]) {
    const card = { ...action('跨界學習'), extraReward };
    assert.equal(DeckModel.inspect({ actionDeck: { test: { cards: [card] } } }).ok, false);
  }
});

function appWith(card) {
  const app = createApp();
  app.run("state.currentGame.players = Array.from({length:4}, (_, i) => makePlayer({name:'Player '+i,fortune:5,wisdom:5}));");
  app.run('var v8Card = ' + JSON.stringify(card) + ';');
  return app;
}

test('role rewards use the normal settlement, persist and mark only the actor', async () => {
  const app = appWith(action('跨界學習'));
  await app.run("applyCardReward('p1', v8Card, ['p2'])");
  assert.deepEqual(app.read('state.currentGame.players.map(p=>[p.fortune,p.wisdom,p.civ])'), [[7, 7, 2], [5, 5, 1], [5, 5, 0], [5, 5, 0]]);
  assert.equal(app.run("hasActed('p1')"), true);
  assert.equal(app.run("hasActed('p2')"), false);
  app.run('saveNow();');
  assert.ok([...app.storage.values()].some(value => value.includes('跨界學習')));
});

test('stale branch and invalid role requests do not mutate state', async () => {
  const app = appWith(boost('生態紅利'));
  const before = app.read('state.currentGame');
  assert.equal(await app.run("applyChoiceCard(['p1','p2'],v8Card,0)"), false);
  assert.deepEqual(app.read('state.currentGame'), before);
});

test('card re-entry is blocked while an asynchronous settlement is pending', async () => {
  const app = appWith(action('跨越情緒'));
  app.run('var resumeCard; var originalSettleCard = settleScoreChanges; settleScoreChanges = async (...args) => { await new Promise(resolve => {resumeCard=resolve;}); return originalSettleCard(...args); };');
  const pending = app.run("applyCardReward('p1',v8Card)");
  assert.equal(await app.run("applyCardReward('p1',v8Card)"), false);
  app.run('resumeCard();');
  await pending;
  assert.equal(app.run('state.currentGame.players[0].fortune'), 7);
});

test('saved custom V8 decks retain all role, exemption and condition fields after reload', () => {
  const model = require('../game-state');
  const state = model.createState();
  state.settings.customDecks = { action: source.actionDeck, boost: source.boostDeck };
  const restored = model.decode(model.serialize(state)).state;
  assert.deepEqual(restored.settings.customDecks, state.settings.customDecks);
  const legacy = { test: { reward: { fortune: 1 }, rewardText: '+1', cards: [{ name: 'Legacy', desc: 'Unchanged' }] } };
  state.settings.customDecks.action = legacy;
  assert.deepEqual(model.decode(model.serialize(state)).state.settings.customDecks.action, legacy);
});
