// 最小 DOM adapter：記錄事件、焦點、屬性與父子關係，不替換彈窗管理器。
function createDOM() {
  const elements = new Map();
  let document;
  const prefixes = {
    'setup-': 'setup-modal', 'dm-': 'deck-manager-modal', 'catalog-': 'catalog-modal',
    'card-': 'card-modal', 'history-': 'history-modal', 'confirm-': 'confirm-modal',
    'relief-': 'relief-modal', 'origin-': 'origin-modal', 'adjust-': 'adjust-modal',
    'guide-': 'guide-modal', 'draw-': 'draw-modal', 'highlight-': 'highlight-modal',
    'weather-adjust-': 'weather-adjust-modal',
  };
  function element(selector) {
    if (elements.has(selector)) return elements.get(selector);
    const id = /^#[\w-]+$/.test(selector) ? selector.slice(1) : '';
    const isModal = id.endsWith('-modal');
    const classes = new Set(isModal ? ['modal', 'hidden'] : []);
    const attributes = new Map(id ? [['id', id]] : []);
    const events = new Map(), properties = new Map();
    const node = {
      id, value: '', checked: false, disabled: false, hidden: false, inert: false,
      isConnected: true, dataset: {}, children: [], parentElement: null, listeners: {}, tagName: 'DIV',
      style: {
        overflow: '', setProperty: (key, value) => properties.set(key, value),
        removeProperty: key => properties.delete(key), getPropertyValue: key => properties.get(key) || '',
      },
      classList: {
        add: cls => classes.add(cls), remove: cls => classes.delete(cls), contains: cls => classes.has(cls),
        toggle(cls, on = !classes.has(cls)) { on ? classes.add(cls) : classes.delete(cls); },
      },
      getAttribute: key => attributes.get(key) ?? null,
      setAttribute(key, value) { attributes.set(key, String(value)); },
      removeAttribute: key => attributes.delete(key),
      addEventListener(type, fn) {
        if (!events.has(type)) events.set(type, new Set());
        events.get(type).add(fn); node.listeners[type] = fn;
      },
      removeEventListener(type, fn) {
        events.get(type)?.delete(fn);
        if (node.listeners[type] === fn) delete node.listeners[type];
      },
      dispatch(type, event = {}) {
        if (type === 'click' && node.disabled) return;
        if (!event.target) event.target = node;
        for (const fn of [...events.get(type) || []]) fn(event);
      },
      click() { node.dispatch('click'); },
      appendChild(child) { return attach(child, node); },
      focus() { document.activeElement = node; document.dispatch('focusin', { target: node }); },
      contains(child) { for (let current = child; current; current = current.parentElement) if (current === node) return true; return false; },
      matches(selector) {
        if (selector === ':disabled') return node.disabled;
        return ['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName) || ['status', 'alert'].includes(node.getAttribute('role'));
      },
      querySelector(child) {
        const found = element(child.startsWith('#') ? child : selector + ' ' + child);
        if (!found.parentElement && found !== node) attach(found, node);
        return found;
      },
      querySelectorAll(child) {
        if (child.startsWith('button, ')) return Array.from(elements.values()).filter(value => value !== node && node.contains(value) &&
          (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(value.tagName) || value.getAttribute('tabindex') === '0'));
        return element(selector + ' ' + child).items || [];
      },
    };
    elements.set(selector, node);
    if (id) {
      if (id.endsWith('-cb')) node.tagName = 'INPUT';
      else if (/-(ok|cancel|close|later|start|apply|pass-btn|stop-btn)$/.test(id)) node.tagName = 'BUTTON';
      if (isModal) attach(node, element('body'));
      else {
        const prefix = Object.keys(prefixes).find(prefix => id.startsWith(prefix));
        if (prefix) attach(node, element('#' + prefixes[prefix]));
      }
    }
    return node;
  }
  function attach(node, parent) {
    if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
    node.parentElement = parent;
    if (!parent.children.includes(node)) parent.children.push(node);
    return node;
  }
  document = {
    activeElement: null, body: element('body'),
    querySelector: element, querySelectorAll: selector => element(selector).items || [],
    getElementById: id => element('#' + id),
    createElement: tag => { const node = element(tag + ':' + elements.size); node.tagName = tag.toUpperCase(); return node; },
    addEventListener: (type, fn) => element('document').addEventListener(type, fn),
    removeEventListener: (type, fn) => element('document').removeEventListener(type, fn),
    dispatch: (type, event) => element('document').dispatch(type, event),
  };
  document.activeElement = document.body;
  const main = attach(element('main'), document.body);
  return {
    document, element, attach, main,
    control(id, modalId, tagName = 'BUTTON') {
      const node = element('#' + id); node.tagName = tagName;
      return attach(node, modalId ? element('#' + modalId) : main);
    },
    key(key, options = {}) {
      const event = { key, target: document.activeElement, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...options };
      document.dispatch('keydown', event);
      return event;
    },
  };
}
module.exports = { createDOM };
