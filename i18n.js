window.i18n = {
  currentLang: localStorage.getItem('i18n_lang') || 'zh-tw',
  translations: {},

  async init() {
    await this.loadTranslations(this.currentLang);
    this.updateDOM();
  },

  async loadTranslations(lang) {
    try {
      const [uiRes, cardsRes] = await Promise.all([
        fetch(`./locales/${lang}.json`),
        fetch(`./locales/cards-${lang}.json`)
      ]);
      if (!uiRes.ok || !cardsRes.ok) throw new Error('Network response was not ok');
      this.translations = await uiRes.json();
      this.cards = await cardsRes.json();
      this.currentLang = lang;
      localStorage.setItem('i18n_lang', lang);
      document.documentElement.lang = lang === 'zh-tw' ? 'zh-Hant' : (lang === 'zh-cn' ? 'zh-Hans' : lang);
    } catch (error) {
      console.error(`Failed to load language: ${lang}`, error);
      if (lang !== 'zh-tw') {
        await this.loadTranslations('zh-tw');
      }
    }
  },

  async setLanguage(lang) {
    await this.loadTranslations(lang);
    this.updateDOM();
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  },

  t(path, params = {}) {
    const keys = path.split('.');
    let value = this.translations;
    for (const key of keys) {
      if (value === undefined || value === null) break;
      value = value[key];
    }
    
    if (typeof value !== 'string') {
      console.warn(`Translation missing for key: ${path}`);
      return path; // Fallback
    }

    return value.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  },

  updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const path = el.getAttribute('data-i18n');
      el.textContent = this.t(path);
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const path = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', this.t(path));
    });
  }
};

window.t = window.i18n.t.bind(window.i18n);

