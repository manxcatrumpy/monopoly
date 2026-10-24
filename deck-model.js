// 牌組結構、匯入驗證與抽卡池共用的純資料模型。
(function () {
  const STATS = ['fortune', 'wisdom', 'civ'];
  const MAX_POINTS = 2147483647;
  const clone = value => JSON.parse(JSON.stringify(value));
  class DeckError extends Error {
    constructor(reason, path) { super(reason + ': ' + path); this.reason = reason; this.path = path; }
  }
  const fail = (reason, path) => { throw new DeckError(reason, path); };
  const record = (value, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object', path);
  };
  const text = (value, path, nonempty = false) => {
    if (typeof value !== 'string' || (nonempty && !value.trim())) fail('text', path);
  };
  const points = (value, path) => {
    if (!Number.isInteger(value) || Math.abs(value) > MAX_POINTS) fail('points', path);
  };
  function reward(value, path) {
    record(value, path);
    for (const [stat, amount] of Object.entries(value)) {
      if (!STATS.includes(stat)) fail('stat', path + '.' + stat);
      points(amount, path + '.' + stat);
    }
  }
  function card(value, path, kind, base) {
    record(value, path);
    text(value.name, path + '.name', true);
    for (const field of ['desc', 'side', 'scene', 'series', 'action', 'insight', 'rewardText']) {
      if (value[field] !== undefined) text(value[field], path + '.' + field);
    }
    for (const field of ['both', 'dual']) {
      if (value[field] !== undefined && typeof value[field] !== 'boolean') fail('boolean', path + '.' + field);
    }
    if (value.reward !== undefined) reward(value.reward, path + '.reward');
    if (value.extraReward !== undefined) {
      record(value.extraReward, path + '.extraReward');
      if (value.both || value.dual) fail('options', path + '.extraReward');
      if (!['answerer', 'participants'].includes(value.extraReward.role)) fail('text', path + '.extraReward.role');
      reward(value.extraReward.reward, path + '.extraReward.reward');
      if (value.options !== undefined) fail('options', path + '.extraReward');
    }
    if (value.options !== undefined) {
      text(value.scene, path + '.scene');
      if (!Array.isArray(value.options) || value.options.length < 2) fail('options', path + '.options');
      value.options.forEach((option, index) => {
        const optPath = path + '.options[' + index + ']';
        record(option, optPath);
        text(option.label, optPath + '.label', true);
        if (option.actor !== undefined) reward(option.actor, optPath + '.actor');
        if (option.both !== undefined && typeof option.both !== 'boolean') fail('boolean', optPath + '.both');
        if (option.both === true && !(value.both ?? value.dual)) fail('options', optPath + '.both');
        if (option.civAllExclude !== undefined && option.civAllExclude !== 'actor') fail('text', optPath + '.civAllExclude');
        if (option.availableWhen !== undefined) {
          record(option.availableWhen, optPath + '.availableWhen');
          const entries = Object.entries(option.availableWhen);
          if (value.conditional != null || entries.length !== 1) fail('conditional', optPath + '.availableWhen');
          for (const [key, amount] of entries) {
            if (!['civGte', 'civLt'].includes(key)) fail('conditional', optPath + '.availableWhen');
            points(amount, optPath + '.availableWhen.' + key);
            if (amount < 0) fail('conditional', optPath + '.availableWhen.' + key);
          }
        }
        if (option.each !== undefined) reward(option.each, optPath + '.each');
        if (option.civAll !== undefined) points(option.civAll, optPath + '.civAll');
        for (const field of ['side', 'insight']) {
          if (option[field] !== undefined) text(option[field], optPath + '.' + field);
        }
      });
      if (value.conditional !== undefined && value.conditional !== null) {
        record(value.conditional, path + '.conditional');
        points(value.conditional.civGte, path + '.conditional.civGte');
        if (value.conditional.civGte < 0 || value.options.length !== 2) fail('conditional', path + '.conditional');
      }
    } else {
      if (value.conditional !== undefined && value.conditional !== null) fail('conditional', path + '.conditional');
      if (kind === 'action') text(value.desc, path + '.desc');
      else { text(value.action, path + '.action'); text(value.insight, path + '.insight'); }
      reward(value.reward ?? base?.reward, path + '.reward');
      text(value.rewardText ?? base?.rewardText, path + '.rewardText');
    }
    const normalized = clone(value);
    // 行動指令與共好加速卡皆為一般遊戲；忽略舊版的命運／無常來源標記。
    delete normalized.damageSource;
    // 相容早期英文牌組的 dual 欄位，執行時統一使用 both。
    if (normalized.both === undefined && normalized.dual !== undefined) normalized.both = normalized.dual;
    delete normalized.dual;
    return normalized;
  }
  function normalize(data, { allowEmpty = false } = {}) {
    record(data, 'decks');
    if (data.actionDeck === undefined && data.boostDeck === undefined) fail('decks', 'decks');
    const normalized = {};
    if (data.actionDeck !== undefined) {
      record(data.actionDeck, 'actionDeck');
      if (!allowEmpty && !Object.keys(data.actionDeck).length) fail('empty', 'actionDeck');
      normalized.actionDeck = Object.fromEntries(Object.entries(data.actionDeck).map(([category, deck]) => {
        const path = 'actionDeck.' + category;
        text(category, path, true);
        record(deck, path);
        if (deck.reward !== undefined) reward(deck.reward, path + '.reward');
        if (deck.rewardText !== undefined) text(deck.rewardText, path + '.rewardText');
        if (!Array.isArray(deck.cards)) fail('array', path + '.cards');
        if (!allowEmpty && !deck.cards.length) fail('empty', path + '.cards');
        return [category, { ...clone(deck), cards: deck.cards.map((value, index) => card(value, path + '.cards[' + index + ']', 'action', deck)) }];
      }));
    }
    if (data.boostDeck !== undefined) {
      if (!Array.isArray(data.boostDeck)) fail('array', 'boostDeck');
      if (!allowEmpty && !data.boostDeck.length) fail('empty', 'boostDeck');
      normalized.boostDeck = data.boostDeck.map((value, index) => card(value, 'boostDeck[' + index + ']', 'boost'));
    }
    return normalized;
  }
  function inspect(data, options) {
    try { return { ok: true, data: normalize(data, options) }; }
    catch (error) {
      if (!(error instanceof DeckError)) throw error;
      return { ok: false, error: { key: 'deckValidation.' + error.reason, path: error.path } };
    }
  }
  function normalizeCustomDecks(source = {}) {
    record(source, 'customDecks');
    const data = {};
    if (source.action !== undefined && source.action !== null) data.actionDeck = source.action;
    if (source.boost !== undefined && source.boost !== null) data.boostDeck = source.boost;
    if (!Object.keys(data).length) return { action: null, boost: null };
    const valid = normalize(data, { allowEmpty: true });
    return { action: valid.actionDeck ?? null, boost: valid.boostDeck ?? null };
  }
  function buildActionPool(deck) {
    return Object.entries(deck).flatMap(([category, base]) => base.cards.map(value => {
      if (Array.isArray(value.options)) return { ...value, type: 'action', category };
      return { ...value, type: 'action', category, side: value.side || '', reward: value.reward ?? base.reward, rewardText: value.rewardText ?? base.rewardText };
    }));
  }
  function buildBoostPool(deck) {
    return deck.map(value => ({ ...value, type: 'boost', both: value.both ?? value.dual ?? false }));
  }
  const model = { normalize, inspect, normalizeCustomDecks, buildActionPool, buildBoostPool };
  if (typeof module === 'object' && module.exports) module.exports = model;
  else globalThis.DeckModel = model;
})();
