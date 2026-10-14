(function () {
  const LANGUAGES = ['zh-tw', 'zh-cn', 'en'];
  const normalizeLanguage = lang => LANGUAGES.includes(lang) ? lang : 'zh-tw';
  let savedLanguage;
  try { savedLanguage = localStorage.getItem('i18n_lang'); } catch (_) {}
  let loadRevision = 0;
  function ruleParams() {
    const config = GAME_CONFIG;
    return {
      graduation: config.PROGRESSION.GRADUATION,
      scoreWeight: config.SCORING.CIV_WEIGHT, exampleTotal: 30 + 40 + 10 * config.SCORING.CIV_WEIGHT,
      shelterGain: config.MULTIPLIERS.SHELTER.gain, shelterLoss: config.MULTIPLIERS.SHELTER.loss,
      navigator: config.PROGRESSION.NAVIGATOR.join(' / '),
      breakthrough: config.PROGRESSION.SELF.join(' / '),
      reliefLow: config.RELIEF.THRESHOLD_LATE,
      clearAt: config.RELIEF.CLEAR_TAG_AT, restoreTo: config.RELIEF.RESTORE_TO,
      shelterTurns: config.RELIEF.SHELTER_TURNS,
      forecastTurn: Math.min(...config.WEATHER.SCHEDULE.map(ev => ev.targetRound - 2)),
      sprintMinutes: config.ENDGAME_MINUTES,
      exchangeRate: config.WEATHER.EXCHANGE_RATE_COST,
    };
  }
  window.i18n = {
    currentLang: normalizeLanguage(savedLanguage), translations: {}, cards: {},
    async init() { await this.loadTranslations(this.currentLang); this.updateDOM(); },
    async loadTranslations(lang) {
      const revision = ++loadRevision;
      const requested = normalizeLanguage(lang);
      const attempts = requested === 'zh-tw' ? [requested] : [requested, 'zh-tw'];
      for (const candidate of attempts) {
        try {
          const [uiRes, cardsRes] = await Promise.all([
            fetch(`./locales/${candidate}.json`), fetch(`./locales/cards-${candidate}.json`),
          ]);
          if (!uiRes.ok || !cardsRes.ok) throw new Error('Language request failed');
          const [translations, cards] = await Promise.all([uiRes.json(), cardsRes.json()]);
          if (!translations || typeof translations !== 'object' || Array.isArray(translations)) throw new Error('Invalid translations');
          if (!cards?.actionDeck || !Array.isArray(cards.boostDeck)) throw new Error('Missing language decks');
          const checked = DeckModel.inspect(cards);
          if (!checked.ok) throw new Error(checked.error.key + ': ' + checked.error.path);
          if (revision !== loadRevision) return false;
          // UI 與卡牌都成功後一次替換，失敗時保留原語系與牌組。
          this.translations = translations;
          this.cards = checked.data;
          this.currentLang = candidate;
          document.documentElement.lang = candidate === 'zh-tw' ? 'zh-Hant' : candidate === 'zh-cn' ? 'zh-Hans' : 'en';
          try { localStorage.setItem('i18n_lang', candidate); } catch (_) {}
          return true;
        } catch (error) {
          if (revision !== loadRevision) return false;
          console.error(`Failed to load language: ${candidate}`, error);
        }
      }
      return false;
    },
    async setLanguage(lang) {
      if (!await this.loadTranslations(lang)) return;
      this.updateDOM();
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: this.currentLang } }));
    },
    t(path, params = {}) {
      let value = this.translations;
      for (const key of path.split('.')) value = value?.[key];
      if (typeof value !== 'string') { console.warn(`Translation missing for key: ${path}`); return path; }
      const values = { ...ruleParams(), ...params };
      return value.replace(/\{(\w+)\}/g, (match, key) => values[key] !== undefined ? values[key] : match);
    },
    updateDOM() {
      document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = this.t(el.getAttribute('data-i18n')); });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-placeholder'))); });
    },
  };
  window.t = window.i18n.t.bind(window.i18n);
})();
