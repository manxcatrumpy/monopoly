// 在真實瀏覽器執行，不模擬 CSS、焦點、inert 或 DOM 命中測試。
(async function () {
  const results = document.getElementById('results');
  const output = [];
  let scope = {};
  const manager = ModalManager.create({ document, getScope: () => scope });
  const node = id => document.getElementById(id);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const key = (value, options = {}) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options }));
  manager.register('standard-modal', { initialFocus: '#first', closeOnBackdrop: true });
  manager.register('draw-modal', { initialFocus: '#draw-later' });
  manager.register('relief-modal', { priority: 1, initialFocus: '#relief-input', closeOnBackdrop: true });
  manager.register('confirm-modal', { priority: 2, initialFocus: '#ok', closeOnBackdrop: true });
  const ask = () => manager.prompt('confirm-modal', {
    onEnter: accept => accept(),
    onOpen({ listen, close }) {
      listen(node('ok'), 'click', () => close(true));
      listen(node('cancel'), 'click', () => close(false));
    },
  });
  async function check(name, fn) {
    manager.cancelScope(scope); scope = {}; node('opener').focus();
    await fn(); output.push('✓ ' + name);
    results.textContent = output.join('\n');
  }
  try {
    await check('優先序覆蓋 DOM 順序，背景及下層視窗 inert，焦點留在確認', () => {
      manager.open('confirm-modal'); manager.open('draw-modal'); manager.open('relief-modal');
      assert(manager.topId() === 'confirm-modal', '錯誤的最上層');
      assert(document.activeElement === node('ok'), '開啟下層視窗不應搶走焦點');
      assert(node('relief-modal').inert && document.querySelector('main').inert, '下層仍可操作');
      const rect = node('ok').getBoundingClientRect();
      assert(node('ok').contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)), '確認按鈕被其他圖層遮住');
    });
    await check('Tab／Shift+Tab 圍在最上層，跳過停用控制', () => {
      manager.open('standard-modal'); node('last').focus(); key('Tab');
      assert(document.activeElement === node('first'), 'Tab 跑到背景');
      key('Tab', { shiftKey: true });
      assert(document.activeElement === node('last'), 'Shift+Tab 未回到最後一項');
    });
    await check('關閉子視窗恢復原控制，關閉最後視窗恢復來源與捲動', () => {
      manager.open('standard-modal'); node('last').focus(); manager.open('confirm-modal');
      manager.close('confirm-modal'); assert(document.activeElement === node('last'), '焦點未返回下層控制');
      manager.close('standard-modal'); assert(document.activeElement === node('opener'), '焦點未返回來源');
      assert(!document.querySelector('main').inert && document.body.style.overflow === '', '背景未解鎖');
    });
    await check('Enter 尊重目前選取的取消按鈕，不會誤確認', async () => {
      const pending = ask(); node('cancel').focus(); key('Enter');
      assert(await pending === false, '取消被當成確定');
    });
    await check('同一確認視窗排隊，一次 Enter 只處理一筆', async () => {
      const first = ask(), second = ask();
      key('Enter'); assert(await first === true, '第一筆未確認');
      assert(manager.isOpen('confirm-modal'), '第二筆被一起關閉');
      key('Escape'); assert(await second === false, '第二筆未取消');
    });
    await check('背景視窗遮罩不會取消上層視窗，背景焦點無法穿透', () => {
      manager.open('standard-modal'); manager.open('relief-modal');
      node('standard-modal').querySelector('.modal-backdrop').click();
      assert(manager.isOpen('standard-modal') && manager.isOpen('relief-modal'), '背景遮罩誤關閉');
      node('first').focus(); assert(document.activeElement === node('relief-input'), '焦點穿透 inert 視窗');
    });
    await check('切局同時取消救濟、確認與所有佇列，解除背景鎖定', async () => {
      const first = ask(), second = ask(), relief = manager.prompt('relief-modal');
      manager.cancelScope(scope); scope = {};
      assert((await Promise.all([first, second, relief])).every(value => value === false), '舊操作未取消');
      assert(manager.stack().length === 0 && !document.querySelector('main').inert, '切局後仍有舊視窗');
    });
    manager.cancelScope(scope); manager.destroy();
    results.dataset.status = 'passed'; results.dataset.count = String(output.length);
    results.textContent = '全部 ' + output.length + ' 項通過\n\n' + output.join('\n');
  } catch (error) {
    manager.destroy(); results.dataset.status = 'failed';
    results.textContent = output.join('\n') + '\n✗ ' + error.message;
    console.error(error);
  }
})();
