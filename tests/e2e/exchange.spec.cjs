const { test, expect, savedGame, openGame, player, score, readSave, adjust } = require('./fixtures.cjs');

async function finishRound(page) {
  for (const id of ['p1', 'p2', 'p3', 'p4']) await player(page, id).locator('[data-act="acted"]').click();
}

test('首次雙達開市，與里程彈窗共存，多組購買與導航庫存重新整理仍保留', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await openGame(page);
  await expect(page.locator('#btn-exchange')).toBeDisabled();
  await adjust(page, { fortune: 15, wisdom: 15 });
  await expect(page.locator('#exchange-open-modal')).toBeVisible();
  await expect(page.locator('#exchange-open-modal')).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#draw-modal')).toHaveJSProperty('inert', true);
  await page.locator('#exchange-open-close').click();
  await page.locator('#draw-later').click();
  await player(page, 'p1').locator('[data-act="exchange"]').click();
  await page.locator('#exchange-navigation').fill('2');
  await page.locator('#exchange-shield').fill('1');
  await page.locator('#exchange-investment').fill('1');
  await expect(page.locator('#exchange-cost')).toHaveText('本次花費：福報 6 · 智慧 6');
  await page.locator('#exchange-buy').click();
  await expect(page.locator('#exchange-stock')).toContainText('導航 ×2 · 平安符 ×1');
  await expect(score(page, 'fortune', 'p1')).toHaveText('14');
  await expect(score(page, 'wisdom', 'p2')).toHaveText('5');
  expect((await readSave(page)).currentGame.exchange.investments).toHaveLength(0);
  await expect(page.locator('#exchange-stock')).toContainText('投資 ×1');
  await page.locator('#exchange-store-close').click();
  await expect(page.locator('#exchange-modal')).toBeHidden();
  await expect(player(page, 'p1').locator('[data-act="acted"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-act="dice"]')).toHaveCount(0);
  await finishRound(page);
  await page.reload();
  await player(page, 'p1').locator('[data-act="exchange"]').click();
  await expect(page.locator('#exchange-stock')).toContainText('投資 ×1');
  expect((await readSave(page)).currentGame.exchange.investments).toHaveLength(0);
  await page.locator('#exchange-target').selectOption('p2');
  await page.locator('#exchange-activate-investment').click();
  await expect(score(page, 'wisdom', 'p2')).toHaveText('6');
  await expect(score(page, 'fortune', 'p1')).toHaveText('14');
  await expect(page.locator('#exchange-investments')).toContainText('A → B ×1');
  expect((await readSave(page)).currentGame.exchange.investments[0].startTurn).toBe(2);
  await testInfo.attach('exchange', { body: await page.screenshot(), contentType: 'image/png' });
  await page.locator('#exchange-steps').selectOption('6');
  await page.locator('#exchange-use-navigation').click();
  await expect(page.locator('#exchange-modal')).toBeHidden();
  await expect(player(page, 'p1').locator('.pc-exchange-stock')).toContainText('導航 ×1');
  await expect(player(page, 'p1').locator('[data-act="acted"]')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('#exchange-open-modal')).toBeHidden();
  await player(page, 'p1').locator('[data-act="exchange"]').click();
  await expect(page.locator('#exchange-use-navigation')).toBeDisabled();
  await expect(page.locator('#exchange-shop')).toHaveJSProperty('disabled', false);
  await expect(page.locator('#exchange-unavailable')).toBeHidden();
  await page.locator('#exchange-navigation').fill('1');
  await page.locator('#exchange-shield').fill('1');
  await page.locator('#exchange-investment').fill('1');
  await expect(page.locator('#exchange-buy')).toBeEnabled();
  await page.locator('#exchange-buy').click();
  await expect(page.locator('#exchange-stock')).toContainText('導航 ×2');
  await expect(score(page, 'fortune', 'p1')).toHaveText('8');
  await expect(score(page, 'wisdom', 'p1')).toHaveText('11');
  await page.locator('#exchange-target').selectOption('p3');
  await expect(page.locator('#exchange-activate-investment')).toBeEnabled();
  await page.locator('#exchange-activate-investment').click();
  await expect(score(page, 'wisdom', 'p3')).toHaveText('6');
  await expect(page.locator('#exchange-use-navigation')).toBeDisabled();
  await expect(page.locator('#exchange-movement')).toContainText('前進 6 步');
  expect((await readSave(page)).currentGame.exchange.investments).toHaveLength(2);
  await page.locator('#exchange-store-close').click();
  await player(page, 'p1').locator('[data-act="acted"]').click();
  await player(page, 'p1').locator('[data-act="exchange"]').click();
  await expect(page.locator('#exchange-shop')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#exchange-activate-investment')).toBeDisabled();
  await page.locator('#exchange-store-close').click();
  await player(page, 'p1').locator('[data-act="acted"]').click();
  await player(page, 'p1').locator('[data-act="exchange"]').click();
  await expect(page.locator('#exchange-shop')).toHaveJSProperty('disabled', false);
  await expect(page.locator('#exchange-use-navigation')).toBeDisabled();
});

test.describe('逐輪投資結算', () => {
  const save = savedGame();
  Object.assign(save.currentGame, { turnNum: 7, reliefSweepDone: true, civGoal: 999 });
  Object.assign(save.currentGame.exchange, { opened: true, nextInvestmentId: 3, investments: [
    { id: 1, investorId: 'p1', targetId: 'p2', quantity: 2, startTurn: 7, rewardedTurns: [], closed: false },
    { id: 2, investorId: 'p3', targetId: 'p4', quantity: 1, startTurn: 7, rewardedTurns: [], closed: false },
  ] });
  test.use({ save });
  test('每組每輪只發一次文明，兩輪皆無收入才退半，重新整理不重發', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page);
    await finishRound(page);
    await expect(page.locator('#turn-num-container')).toContainText('8');
    await adjust(page, { wisdom: 1 }, 'p2');
    await expect(score(page, 'civ', 'p1')).toHaveText('2');
    await adjust(page, { fortune: 1 }, 'p2');
    await expect(score(page, 'civ', 'p1')).toHaveText('2');
    await page.reload();
    await finishRound(page);
    await expect(page.locator('#turn-num-container')).toContainText('9');
    await adjust(page, { fortune: 1 }, 'p2');
    await expect(score(page, 'civ', 'p1')).toHaveText('4');
    await finishRound(page);
    await expect(page.locator('#turn-num-container')).toContainText('10');
    await expect(score(page, 'fortune', 'p3')).toHaveText('7');
    await expect(score(page, 'fortune', 'p1')).toHaveText('5');
    await page.reload();
    await expect(score(page, 'civ', 'p1')).toHaveText('4');
    await expect(score(page, 'fortune', 'p3')).toHaveText('7');
    expect((await readSave(page)).currentGame.exchange.investments.every(item => item.closed)).toBe(true);
  });
});

test.describe('平安符選擇', () => {
  const save = savedGame();
  save.currentGame.exchange.opened = true;
  save.currentGame.players[0].shieldTokens = 2;
  save.currentGame.players[0].civ = 3;
  save.settings.customDecks.boost = [{ name: '命運試煉', action: '遭遇事件', insight: '選擇是否防護', damageSource: 'fate', rewardText: '福 -2 慧 -2 文明 -1', reward: { fortune: -2, wisdom: -2, civ: -1 } }];
  test.use({ save });
  test('保留平安符承受傷害，下一次使用一枚擋全部福慧而保留文明扣分', async ({ page }) => {
    await openGame(page);
    for (const use of [false, true]) {
      await page.locator('#btn-draw-boost').click();
      await expect(page.locator('#card-damage-source')).toHaveValue('fate');
      await page.locator('#card-recipient').selectOption('p1');
      await page.locator('#card-apply').click();
      await expect(page.locator('#confirm-title')).toHaveText('是否使用平安符？');
      await page.locator(use ? '#confirm-ok' : '#confirm-cancel').click();
      await expect(page.locator('#confirm-modal')).toBeHidden();
      await expect(score(page, 'fortune')).toHaveText('3');
      await expect(score(page, 'wisdom')).toHaveText('3');
      await expect(score(page, 'civ')).toHaveText(use ? '1' : '2');
      await expect(player(page, 'p1').locator('.pc-exchange-stock')).toContainText(use ? '平安符 ×1' : '平安符 ×2');
      await expect(page.locator('#relief-modal')).toBeHidden();
    }
    await page.reload();
    expect((await readSave(page)).currentGame.players[0].shieldTokens).toBe(1);
  });
  test('手動扣分依庫存提示，明確選擇後才扣分或使用平安符', async ({ page }, testInfo) => {
    await openGame(page);
    await player(page, 'p1').locator('[data-act="adjust"]').click();
    await expect(page.locator('#adjust-source')).toHaveCount(0);
    await page.locator('#adjust-rows [data-stat="fortune"] input').fill('-2');
    await page.locator('#adjust-rows [data-stat="wisdom"] input').fill('-2');
    await page.locator('#adjust-rows [data-stat="civ"] input').fill('-1');
    await page.locator('#adjust-apply').click();
    await expect(page.locator('#confirm-modal')).toHaveClass(/action-toast/);
    await expect(page.locator('#confirm-message')).toContainText('命運／無常卡');
    await expect(page.locator('#confirm-cancel')).toHaveText('直接扣分');
    await expect(page.locator('#confirm-cancel')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.locator('#confirm-modal .modal-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await expect(score(page, 'fortune')).toHaveText('5');
    await expect(player(page, 'p1').locator('[data-act="acted"]')).toHaveAttribute('aria-pressed', 'false');
    expect((await readSave(page)).currentGame.players[0].shieldTokens).toBe(2);
    await testInfo.attach('shield-confirmation', { body: await page.screenshot(), contentType: 'image/png' });
    await page.locator('#confirm-ok').click();
    await expect(score(page, 'fortune')).toHaveText('5');
    await expect(score(page, 'wisdom')).toHaveText('5');
    await expect(score(page, 'civ')).toHaveText('2');
    await expect(player(page, 'p1').locator('[data-act="acted"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(player(page, 'p1').locator('.pc-exchange-stock')).toContainText('平安符 ×1');
    await player(page, 'p1').locator('[data-act="adjust"]').click();
    await page.locator('#adjust-rows [data-stat="fortune"] input').fill('-1');
    await page.locator('#adjust-apply').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.locator('#confirm-cancel').click();
    await expect(score(page, 'fortune')).toHaveText('4');
    await expect(page.locator('#confirm-modal')).toBeHidden();
    await expect(page.locator('#relief-modal')).toBeHidden();
    expect((await readSave(page)).currentGame.players[0].shieldTokens).toBe(1);
  });
});

test.describe('手機交易所', () => {
  const save = savedGame();
  save.currentGame.exchange.opened = true;
  save.currentGame.players[0].navigationTokens = 1;
  test.use({ save });
  test('窄螢幕只需在結算後標記已行動，沒有額外的開始擲骰操作', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openGame(page);
    await player(page, 'p1').locator('[data-act="exchange"]').click();
    await expect(page.locator('#exchange-title')).toBeVisible();
    await expect.poll(async () => (await page.locator('#exchange-player').boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.locator('.exchange-panel').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await testInfo.attach('mobile-exchange', { body: await page.screenshot(), contentType: 'image/png' });
    await expect(page.locator('#exchange-begin-dice')).toHaveCount(0);
    await expect(page.locator('[data-act="dice"]')).toHaveCount(0);
    await expect(page.locator('#exchange-use-navigation')).toBeEnabled();
    await page.locator('#exchange-store-close').click();
    await player(page, 'p1').locator('[data-act="acted"]').click();
    await expect(page.locator('#turn-num-container')).toContainText('1');
    await player(page, 'p1').locator('[data-act="exchange"]').click();
    await expect(page.locator('#exchange-shop')).toHaveJSProperty('disabled', true);
    await expect(page.locator('#exchange-navigation')).toBeDisabled();
    await expect(page.locator('#exchange-use-navigation')).toBeDisabled();
    await expect(page.locator('#exchange-movement')).toBeEmpty();
  });
});
