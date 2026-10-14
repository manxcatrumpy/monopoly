const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 執行實際 app 流程；DOM adapter 只記錄顯示、焦點與事件，不替換救濟規則。
function createApp() {
  const elements = new Map();
  const storage = new Map();
  const noop = () => {};
  const document = {
    activeElement: null,
    querySelector: element,
    querySelectorAll: selector => element(selector).items || [],
    getElementById: id => element('#' + id),
    addEventListener: (type, fn) => element('document').addEventListener(type, fn),
    removeEventListener: (type, fn) => element('document').removeEventListener(type, fn),
  };
  function element(selector) {
    if (elements.has(selector)) return elements.get(selector);
    const classes = new Set(selector.endsWith('-modal') ? ['hidden'] : []);
    const events = new Map();
    const node = {
      value: '', checked: false, disabled: false, dataset: {},
      style: { setProperty: noop },
      classList: {
        add: cls => classes.add(cls), remove: cls => classes.delete(cls),
        contains: cls => classes.has(cls),
        toggle(cls, on = !classes.has(cls)) { on ? classes.add(cls) : classes.delete(cls); },
      },
      addEventListener(type, fn) {
        if (!events.has(type)) events.set(type, new Set());
        events.get(type).add(fn);
      },
      removeEventListener(type, fn) { events.get(type)?.delete(fn); },
      dispatch(type, event = {}) {
        if (type === 'click' && this.disabled) return;
        for (const fn of [...events.get(type) || []]) fn(event);
      },
      focus() { document.activeElement = node; },
      setAttribute: noop,
      querySelector: child => element(selector + ' ' + child),
      querySelectorAll: child => element(selector + ' ' + child).items || [],
    };
    elements.set(selector, node);
    return node;
  }
  const context = vm.createContext({
    window: { addEventListener: noop }, document,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    queueMicrotask, setTimeout: noop, clearTimeout: noop, setInterval: noop,
    t: (key, params = {}) => key + ':' + JSON.stringify(params),
  });
  for (const file of ['config.js', 'version.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    if (file === 'config.js') context.GAME_CONFIG = context.window.GAME_CONFIG;
  }
  const run = code => vm.runInContext(code, context);
  run(`
    updatePlayerCard = () => {};
    renderPlayers = () => {};
    flashCard = () => {};
    state.players = [
      makePlayer({ name: 'A', fortune: 5, wisdom: 8 }),
      makePlayer({ name: 'B', fortune: 8, wisdom: 8 }),
      makePlayer({ name: 'C', fortune: 8, wisdom: 8 }),
      makePlayer({ name: 'D', fortune: 8, wisdom: 8 }),
    ];
    state.civGoal = 41;
  `);
  return {
    run, element, storage, document,
    read: code => JSON.parse(run('JSON.stringify(' + code + ')')),
    visible: selector => !element(selector).classList.contains('hidden'),
    flush: () => new Promise(resolve => setImmediate(resolve)),
    approveRelief() {
      element('#relief-ack-cb').checked = true;
      element('#relief-ack-cb').dispatch('change');
      element('#relief-ok').dispatch('click');
    },
    key(key) {
      const event = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      element('document').dispatch('keydown', event);
    },
  };
}

module.exports = { createApp };
