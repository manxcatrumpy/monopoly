const fs = require('node:fs/promises');
const { test: base, expect, savedGame, score, adjust, readSave } = require('./fixtures.cjs');
const { createServer } = require('./pwa-server.cjs');
const GameState = require('../../game-state.js');
const test = base.extend({
  legacy: [false, { option: true }],
  pwa: async ({ context, legacy }, use) => {
    const server = await createServer({ legacy });
    const save = savedGame();
    save.currentGame.pendingDraws = [{ id: 'pd-kept', text: '保留待抽卡', playerId: 'p1', t: 0 }];
    save.currentGame.players[0].reliefUsed.wisdom = true;
    save.history = [GameState.snapshotGame({ ...save.currentGame, roundNum: 2 }, { now: 1700000000000 })];
    save.settings.customDecks.boost = [{ name: '保留牌組', action: '一起前進', insight: '感恩', reward: { fortune: 1 }, rewardText: '福 +1' }];
    await context.addInitScript(value => {
      if (!localStorage.getItem('fuhui-dashboard-state-v2')) localStorage.setItem('fuhui-dashboard-state-v2', JSON.stringify(value));
    }, save);
    try { await use(server); } finally { await context.close(); await server.close(); }
  },
});
test.use({ serviceWorkers: 'allow' });
async function open(page, pwa) {
  await page.goto(pwa.url);
  await expect(page.locator('#players .player-card')).toHaveCount(4);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
}
async function check(page) { await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); }); }
const displayed = (page, build) => expect(page.locator('.ver-tag')).toContainText('build ' + build);

test('更新先存檔再重載，保留運行中的計時、分數、救濟額度與待抽卡，並可離線啟動', async ({ page, context, pwa }, testInfo) => {
  const start = new Date('2026-10-16T01:00:00Z'); await page.clock.setFixedTime(start);
  await open(page, pwa); await displayed(page, pwa.releases.a.build);
  await page.locator('#btn-toggle-timer').click();
  await adjust(page, { fortune: 2 });
  const before = await readSave(page);
  pwa.publish('b'); await check(page);
  await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'available');
  await displayed(page, pwa.releases.a.build);
  const pinned = await page.evaluate(async id => (await fetch('./version.js?rev=' + id)).text(), pwa.releases.a.id);
  expect(pinned).toContain('APP_BUILD = ' + pwa.releases.a.build);
  await page.screenshot({ path: testInfo.outputPath('pwa-update-ready.png'), fullPage: true });
  await page.clock.setFixedTime(new Date(start.getTime() + 21_000));
  await Promise.all([page.waitForEvent('domcontentloaded'), page.locator('#pwa-apply').click()]);
  await displayed(page, pwa.releases.b.build);
  await expect(page.locator('#timer')).toHaveText('00:21');
  await expect(page.locator('#btn-toggle-timer')).toHaveText('暫停');
  await expect(score(page, 'fortune')).toHaveText('7');
  const after = await readSave(page);
  expect(after.currentGame.players).toEqual(before.currentGame.players);
  expect(after.currentGame.pendingDraws).toEqual(before.currentGame.pendingDraws);
  expect(after.history).toEqual(before.history);
  expect(after.settings).toEqual(before.settings);
  await context.setOffline(true); await page.clock.setFixedTime(new Date(start.getTime() + 35_000));
  await page.reload(); await displayed(page, pwa.releases.b.build);
  await expect(page.locator('#timer')).toHaveText('00:35');
  await expect(score(page, 'fortune')).toHaveText('7');
});

test('選擇稍後可繼續操作與離線重載舊版，不會自動更新', async ({ page, context, pwa }) => {
  await open(page, pwa); pwa.publish('b'); await check(page);
  await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'available');
  await page.locator('#pwa-later').click(); await expect(page.locator('#pwa-notice')).toBeHidden();
  await adjust(page, { fortune: 1 }); await displayed(page, pwa.releases.a.build);
  await context.setOffline(true); await page.reload();
  await displayed(page, pwa.releases.a.build); await expect(score(page, 'fortune')).toHaveText('6');
  await context.setOffline(false); await check(page);
  await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'available');
  await Promise.all([page.waitForEvent('domcontentloaded'), page.locator('#pwa-apply').click()]);
  await displayed(page, pwa.releases.b.build); await expect(score(page, 'fortune')).toHaveText('6');
});

for (const failure of ['http', 'integrity']) {
  test(`${failure} 更新失敗保留可用舊版，重試完整版本後才提供套用`, async ({ page, context, pwa }) => {
    await open(page, pwa); await adjust(page, { wisdom: 1 });
    pwa.publish('b', failure); await check(page);
    await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'update-failed');
    await displayed(page, pwa.releases.a.build);
    await context.setOffline(true); await page.reload();
    await displayed(page, pwa.releases.a.build); await expect(score(page, 'wisdom')).toHaveText('6');
    await context.setOffline(false); pwa.publish('b'); await check(page);
    await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'available');
    await Promise.all([page.waitForEvent('domcontentloaded'), page.locator('#pwa-apply').click()]);
    await displayed(page, pwa.releases.b.build); await expect(score(page, 'wisdom')).toHaveText('6');
  });
}

test('多視窗暫不接管；關閉其他視窗後可套用，且保留其他 App 的快取', async ({ page, context, pwa }) => {
  await open(page, pwa);
  await page.evaluate(async () => { await caches.open('other-app-cache'); await caches.open('fuhui-pwa:%2Felse%2F:other'); });
  const other = await context.newPage(); await open(other, pwa);
  pwa.publish('b'); await check(page);
  await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'available');
  await page.locator('#pwa-apply').click();
  await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'blocked');
  await displayed(page, pwa.releases.a.build); await displayed(other, pwa.releases.a.build);
  await other.close();
  await Promise.all([page.waitForEvent('domcontentloaded'), page.locator('#pwa-apply').click()]);
  await displayed(page, pwa.releases.b.build);
  const keys = await page.evaluate(() => caches.keys());
  expect(keys).toContain('other-app-cache'); expect(keys).toContain('fuhui-pwa:%2Felse%2F:other');
});

test('離線金句產圖使用本機工具，能下載真正的 JPEG', async ({ page, context, pwa }) => {
  await open(page, pwa); await context.setOffline(true); await page.reload();
  await page.locator('#btn-highlight').click(); await page.locator('#highlight-quote-input').fill('離線也能分享善意');
  const pending = page.waitForEvent('download'); await page.locator('#highlight-download').click();
  const download = await pending; const bytes = await fs.readFile(await download.path());
  expect(download.suggestedFilename()).toMatch(/^highlight-.*\.jpg$/);
  expect(bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
  expect(bytes.length).toBeGreaterThan(1000);
  await expect(page.locator('#highlight-modal')).toBeHidden();
});

test('首次離線安裝失敗可繼續在線上操作，重試後離線重載保留資料', async ({ page, context, pwa }) => {
  pwa.publish('a', 'http'); await page.goto(pwa.url);
  await expect(page.locator('#players .player-card')).toHaveCount(4);
  await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'failed');
  await adjust(page, { fortune: 1 }); pwa.publish('a');
  await page.locator('#pwa-retry').click();
  await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'ready');
  await context.setOffline(true); await page.reload();
  await expect(score(page, 'fortune')).toHaveText('6');
});

test.describe('舊快取策略遷移', () => {
  test.use({ legacy: true });
  test('舊 network-first 頁面重新整理後可升級為隔離版本並保留遊戲', async ({ page, context, pwa }) => {
    await open(page, pwa); await adjust(page, { fortune: 2 });
    pwa.publish('b'); await page.reload();
    await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'available');
    await Promise.all([page.waitForEvent('domcontentloaded'), page.locator('#pwa-apply').click()]);
    await displayed(page, pwa.releases.b.build);
    await context.setOffline(true); await page.reload();
    await expect(score(page, 'fortune')).toHaveText('7');
    expect(await page.evaluate(() => caches.keys())).toContain('fuhui-dashboard-v' + pwa.releases.a.build);
  });
});

for (const revision of ['a', 'b']) {
  test(`瀏覽器清除快取後可在線上修復完整 ${revision} 版本，遊戲仍保留`, async ({ page, context, pwa }) => {
    await open(page, pwa); await adjust(page, { fortune: 2 });
    await page.evaluate(async () => { for (const key of await caches.keys()) if (key.startsWith('fuhui-pwa:')) await caches.delete(key); });
    pwa.publish(revision); await page.reload();
    await displayed(page, pwa.releases[revision].build); await expect(score(page, 'fortune')).toHaveText('7');
    if (revision === 'b') {
      await expect(page.locator('#pwa-notice')).toHaveAttribute('data-status', 'available');
      await Promise.all([page.waitForEvent('domcontentloaded'), page.locator('#pwa-apply').click()]);
    }
    await context.setOffline(true); await page.reload(); await expect(score(page, 'fortune')).toHaveText('7');
  });
}
