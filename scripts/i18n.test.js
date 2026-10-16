const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DeckModel = require('../deck-model');
const config = require('../config');
const root = path.join(__dirname, '..');
const { uiFiles } = require('./ui-sources.js');
const locale = file => JSON.parse(fs.readFileSync(path.join(root, 'locales', file)));
const response = data => ({ ok: true, json: async () => data });
function runtime({ fetch, failStorage = false, saved = 'zh-tw', rules = config } = {}) {
  const events = [], warnings = [];
  const document = { documentElement: {}, querySelectorAll: () => [] };
  const context = vm.createContext({
    GAME_CONFIG: rules, DeckModel, document,
    fetch: fetch || (async url => response(locale(url.split('/').pop()))),
    localStorage: {
      getItem() { if (failStorage) throw new Error('Unavailable'); return saved; },
      setItem() { if (failStorage) throw new Error('Unavailable'); },
    },
    window: { dispatchEvent: event => events.push(event.detail.lang) },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts.detail; } },
    console: { error: (...args) => warnings.push(args), warn: (...args) => warnings.push(args) },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'), context);
  return { i18n: context.window.i18n, events, document, warnings };
}

for (const lang of ['zh-tw', 'zh-cn', 'en']) {
  test(`${lang} rule text follows shared config and all referenced UI keys exist`, async () => {
    const app = runtime({ saved: lang });
    await app.i18n.init();
    assert.equal(app.i18n.currentLang, lang);
    const hint = app.i18n.t('tools.milestone_hint');
    assert.ok(hint.includes(String(config.PROGRESSION.GRADUATION)));
    assert.ok(hint.includes(config.PROGRESSION.NAVIGATOR.join(' / ')));
    assert.ok(hint.includes(config.PROGRESSION.SELF.join(' / ')));
    assert.doesNotMatch(hint, /\{|55|25 \/ 45/);
    const code = ['app.js', ...uiFiles].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const keys = new Set([...code.matchAll(/\bt\('([\w.]+)'/g), ...html.matchAll(/data-i18n(?:-placeholder)?="([\w.]+)"/g)].map(match => match[1]));
    for (const key of keys) {
      if (!key.endsWith('.')) assert.notEqual(app.i18n.t(key), key, lang + ': ' + key);
    }
    for (const key of Object.keys(app.i18n.translations.deckValidation)) assert.notEqual(app.i18n.t('deckValidation.' + key), 'deckValidation.' + key);
    for (const key of ['guide.s3_sub2_li1', 'guide.s5_li2_sub1', 'guide.s5_li2_sub2', 'guide.s11_li1', 'guide.s11_li4', 'guide.s11_li5', 'guide.s11_li6']) assert.doesNotMatch(app.i18n.t(key), /\{\w+\}/);
  });
}

test('rule text changes with configuration and explicit message parameters still override defaults', async () => {
  const rules = JSON.parse(JSON.stringify(config));
  rules.PROGRESSION.GRADUATION = 40;
  rules.PROGRESSION.NAVIGATOR = [8, 16, 40];
  rules.RELIEF.THRESHOLD_LATE = 2;
  rules.SCORING.CIV_WEIGHT = 4;
  const app = runtime({ rules });
  await app.i18n.init();
  assert.match(app.i18n.t('tools.milestone_hint'), /40/);
  assert.match(app.i18n.t('tools.milestone_hint'), /8 \/ 16 \/ 40/);
  assert.match(app.i18n.t('weather.adjust_self_low_warn', { stat: 'A' }), /2/);
  assert.match(app.i18n.t('guide.s3_sub2_li1', { graduation: 99 }), /99/);
  assert.match(app.i18n.t('guide.s4_formula'), /4/);
  assert.match(app.i18n.t('guide.s4_p2_bold'), /110/);
});

test('failed language and fallback loads retain the complete previous language without dispatching a change', async () => {
  let fail = false;
  const app = runtime({ fetch: async url => {
    if (fail && url.includes('cards-')) return { ok: false };
    return response(locale(url.split('/').pop()));
  } });
  await app.i18n.init();
  const before = { ui: app.i18n.translations, cards: app.i18n.cards, lang: app.i18n.currentLang, html: app.document.documentElement.lang };
  fail = true;
  await app.i18n.setLanguage('en');
  assert.equal(app.i18n.translations, before.ui);
  assert.equal(app.i18n.cards, before.cards);
  assert.equal(app.i18n.currentLang, before.lang);
  assert.equal(app.document.documentElement.lang, before.html);
  assert.deepEqual(app.events, []);
});

test('fallback events name the language actually loaded', async () => {
  const app = runtime({ fetch: async url => url.includes('en.json') ? { ok: false } : response(locale(url.split('/').pop())) });
  await app.i18n.setLanguage('en');
  assert.equal(app.i18n.currentLang, 'zh-tw');
  assert.deepEqual(app.events, ['zh-tw']);
});

test('late language responses cannot overwrite a newer language selection', async () => {
  const waiting = new Map();
  const app = runtime({ fetch: url => new Promise(resolve => waiting.set(url, resolve)) });
  const old = app.i18n.setLanguage('en');
  const latest = app.i18n.setLanguage('zh-cn');
  for (const file of ['zh-cn.json', 'cards-zh-cn.json']) waiting.get('./locales/' + file)(response(locale(file)));
  await latest;
  for (const file of ['en.json', 'cards-en.json']) waiting.get('./locales/' + file)(response(locale(file)));
  await old;
  assert.equal(app.i18n.currentLang, 'zh-cn');
  assert.deepEqual(app.events, ['zh-cn']);
});

test('storage denial and an unsupported saved language do not prevent initialization', async () => {
  const denied = runtime({ failStorage: true });
  await denied.i18n.init();
  assert.equal(denied.i18n.currentLang, 'zh-tw');
  const unsupported = runtime({ saved: '../../invalid' });
  await unsupported.i18n.init();
  assert.equal(unsupported.i18n.currentLang, 'zh-tw');
});
