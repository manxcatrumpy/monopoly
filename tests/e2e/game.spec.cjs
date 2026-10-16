const { test, expect, savedGame, openGame, player, score, readSave, adjust, assertTop } = require('./fixtures.cjs');

test('未暫停的計時跨多次重新整理持續累計，暫停後不再增加', async ({ page }) => {
  const start = new Date('2026-10-16T01:00:00Z');
  await page.clock.setFixedTime(start);
  await openGame(page);
  await page.locator('#btn-toggle-timer').click();
  await page.clock.setFixedTime(new Date(start.getTime() + 21_000));
  await expect(page.locator('#timer')).toHaveText('00:21');
  await page.reload();
  await expect(page.locator('#timer')).toHaveText('00:21');
  await expect(page.locator('#btn-toggle-timer')).toHaveText('暫停');
  await page.clock.setFixedTime(new Date(start.getTime() + 35_000));
  await page.reload();
  await expect(page.locator('#timer')).toHaveText('00:35');
  await page.locator('#btn-toggle-timer').click();
  await page.clock.setFixedTime(new Date(start.getTime() + 95_000));
  await page.reload();
  await expect(page.locator('#timer')).toHaveText('00:35');
  await expect(page.locator('#btn-toggle-timer')).toHaveText('開始');
  expect((await readSave(page)).currentGame.timer.running).toBe(false);
});

test.describe('天氣調節', () => {
  const save = savedGame();
  save.currentGame.turnNum = 5;
  save.currentGame.reliefSweepDone = true;
  save.currentGame.weatherEvents[0].lockedWeather = 'DISASTER';
  save.currentGame.players[0].civ = 8;
  test.use({ save });

  test('救回天氣後，下一次低點確認仍在表單上方，取消不扣點', async ({ page }, testInfo) => {
    await openGame(page);
    await page.locator('#btn-weather-adjust').click();
    await page.locator('.weather-adj-row[data-id="p1"] .adj-fortune').fill('3');
    await expect(page.locator('#weather-adjust-gap')).toContainText('災害交加 → 歲事如常');
    await page.locator('#weather-adjust-submit').click();
    await assertTop(page, 'confirm-modal', '#confirm-ok');
    await expect(page.locator('#weather-adjust-modal')).toHaveJSProperty('inert', true);
    await page.locator('#confirm-ok').click();
    await expect(score(page, 'fortune')).toHaveText('2');
    await expect(page.locator('#weather-adjust-modal')).toBeHidden();
    await expect(page.locator('#toast')).toContainText('災害交加 → 歲事如常');

    await page.locator('#btn-weather-adjust').click();
    await page.locator('.weather-adj-row[data-id="p1"] .adj-fortune').fill('2');
    await page.locator('.weather-adj-row[data-id="p1"] .adj-wisdom').fill('1');
    await page.locator('#weather-adjust-submit').focus();
    await page.keyboard.press('Enter');
    await assertTop(page, 'confirm-modal', '#confirm-ok');
    await expect(page.locator('#confirm-message')).toContainText('社會救濟');
    await page.screenshot({ path: testInfo.outputPath('weather-confirm.png'), fullPage: true });
    await page.keyboard.press('Tab');
    await expect(page.locator('#confirm-cancel')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#confirm-ok')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('#confirm-modal')).toBeHidden();
    await expect(page.locator('#weather-adjust-modal')).toBeVisible();
    await expect(page.locator('#weather-adjust-submit')).toBeFocused();
    await expect(score(page, 'fortune')).toHaveText('2');
    await expect(page.locator('#civ-total')).toHaveText('9');
    await expect(page.locator('.weather-adj-row[data-id="p1"] .adj-fortune')).toHaveValue('2');
    await page.keyboard.press('Escape');
    await expect(page.locator('#weather-adjust-modal')).toBeHidden();
    await expect(page.locator('.topbar')).toHaveJSProperty('inert', false);
  });
});

test.describe('救濟與抽卡重疊', () => {
  const save = savedGame();
  save.currentGame.players[0].fortune = 1;
  save.currentGame.players[0].wisdom = 29;
  test.use({ save });
  for (const approve of [true, false]) {
    test(`扣分同時觸發單項里程，救濟在抽卡上方；${approve ? '勾選才可接受' : 'Escape 只取消救濟'}`, async ({ page }) => {
      await openGame(page);
      await adjust(page, { fortune: -1, wisdom: 1 });
      await assertTop(page, 'relief-modal', '#relief-ack-cb');
      await expect(page.locator('#draw-modal')).toBeVisible();
      await expect(page.locator('#draw-modal')).toHaveJSProperty('inert', true);
      await expect(page.locator('#relief-ok')).toBeDisabled();
      await page.keyboard.press('Enter');
      await expect(page.locator('#relief-modal')).toBeVisible();
      if (approve) {
        await page.locator('#relief-ack-cb').check();
        await expect(page.locator('#relief-ok')).toBeEnabled();
        await page.locator('#relief-ok').click();
      } else await page.keyboard.press('Escape');
      await expect(page.locator('#relief-modal')).toBeHidden();
      await expect(score(page, 'fortune')).toHaveText(approve ? '5' : '0');
      await expect(page.locator('#draw-modal')).toHaveAttribute('aria-modal', 'true');
      await expect(page.locator('#draw-modal')).toHaveJSProperty('inert', false);
      await page.locator('#draw-later').click();
      await page.reload();
      await expect(score(page, 'fortune')).toHaveText(approve ? '5' : '0');
      await expect(score(page, 'wisdom')).toHaveText('30');
      const current = (await readSave(page)).currentGame;
      expect(current.players[0].reliefUsed.fortune).toBe(approve);
      expect(current.pendingDraws).toHaveLength(1);
      await expect(page.locator('#relief-modal')).toBeHidden();
    });
  }
});

test('開下一局保存完整歷史，切回後不留下新局 UI 草稿', async ({ page }) => {
  await openGame(page);
  await adjust(page, { fortune: 2, civ: 3 });
  const original = (await readSave(page)).currentGame;
  await page.locator('#btn-next-round').click();
  const rows = page.locator('.setup-player-row');
  for (let i = 0; i < 4; i++) {
    await rows.nth(i).locator('.fortune').fill('8');
    await rows.nth(i).locator('.wisdom').fill('9');
  }
  await page.locator('#setup-start').click();
  await expect(page.locator('#round-num')).toHaveText('2');
  await expect(score(page, 'fortune')).toHaveText('8');
  await page.locator('#btn-history').click();
  await page.locator('#history-list [data-view]').click();
  await expect(page.locator('#history-detail')).toContainText('A');
  await expect(page.locator('#round-num')).toHaveText('2');
  await page.keyboard.press('Escape');
  await player(page).locator('[data-act="adjust"]').click();
  await page.locator('#adjust-rows [data-stat="fortune"] input').fill('99');
  await page.keyboard.press('Escape');
  await page.locator('#btn-history').click();
  await page.locator('#history-list [data-restore]').click();
  await assertTop(page, 'confirm-modal', '#confirm-ok');
  await page.keyboard.press('Enter');
  await expect(page.locator('#round-num')).toHaveText('1');
  await expect(page.locator('.modal:not(.hidden)')).toHaveCount(0);
  const restored = await readSave(page);
  expect(restored.currentGame.players).toEqual(original.players);
  expect(restored.currentGame.weatherEvents).toEqual(original.weatherEvents);
  expect(restored.currentGame.pendingDraws).toEqual(original.pendingDraws);
  expect(restored.currentGame.reliefSweepDone).toBe(original.reliefSweepDone);
  expect(restored.history[0].roundNum).toBe(2);
  await player(page).locator('[data-act="adjust"]').click();
  await expect(page.locator('#adjust-rows [data-stat="fortune"] input')).toHaveValue('0');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(score(page, 'fortune')).toHaveText('7');
  await expect(page.locator('#round-num')).toHaveText('1');
});

test.describe('切局取消等待中的救濟', () => {
  const save = savedGame();
  save.currentGame.players[0].fortune = 3;
  save.currentGame.timer.accumulated = 5099;
  test.use({ save });
  test('開局確認期間進入終局倒數，切局後舊救濟不會套用或重新跳出', async ({ page }) => {
    const start = new Date('2026-10-16T01:00:00Z');
    await page.clock.setFixedTime(start);
    await openGame(page);
    await page.locator('#btn-toggle-timer').click();
    await page.locator('#btn-next-round').click();
    await page.locator('#setup-start').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.clock.setFixedTime(new Date(start.getTime() + 1000));
    await expect(page.locator('#relief-modal')).toBeVisible();
    await expect(page.locator('#relief-modal')).toHaveJSProperty('inert', true);
    await assertTop(page, 'confirm-modal', '#confirm-ok');
    await page.locator('#confirm-ok').click();
    await expect(page.locator('#round-num')).toHaveText('2');
    await expect(page.locator('.modal:not(.hidden)')).toHaveCount(0);
    await expect(score(page, 'fortune')).toHaveText('0');
    const next = await readSave(page);
    expect(next.currentGame.players[0].reliefUsed.fortune).toBe(false);
    expect(next.history[0].players[0].fortune).toBe(3);
    expect(next.history[0].reliefSweepDone).toBe(true);
    await page.reload();
    await expect(page.locator('.modal:not(.hidden)')).toHaveCount(0);
    await expect(score(page, 'fortune')).toHaveText('0');
    await expect(page.locator('#timer')).toHaveText('00:00');
  });
});

test('牌組匯入失敗保留原資料，取消不套用，確認後重新整理仍保留', async ({ page }) => {
  await openGame(page);
  await page.locator('#btn-deck-manager').click();
  const deck = [{ name: '瀏覽器匯入卡', action: '做一件小事', insight: '測試匯入', rewardText: '福報 +2', reward: { fortune: 2 } }];
  await page.locator('#dm-paste').fill(JSON.stringify({ boostDeck: [{ ...deck[0], reward: { fortune: '2' } }] }));
  await page.locator('#dm-paste-apply').click();
  await expect(page.locator('#toast')).toContainText('匯入失敗');
  await expect(page.locator('#confirm-modal')).toBeHidden();
  expect((await readSave(page)).settings.customDecks.boost).toBeNull();
  await page.locator('#dm-paste').fill(JSON.stringify({ boostDeck: deck }));
  await page.locator('#dm-paste-apply').click();
  await expect(page.locator('#confirm-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await readSave(page)).settings.customDecks.boost).toBeNull();
  await page.locator('#dm-paste-apply').click();
  await expect(page.locator('#confirm-modal')).toBeVisible();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#dm-boost-count')).toContainText('1');
  await page.locator('#dm-close').click();
  await page.reload();
  expect((await readSave(page)).settings.customDecks.boost).toEqual(deck);
  await page.locator('#btn-draw-boost').click();
  await expect(page.locator('#card-body')).toContainText('瀏覽器匯入卡');
});

test('語系切換後重新整理保留語言及分數', async ({ page }) => {
  await openGame(page);
  await page.locator('#btn-toggle-lang').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await expect(page.locator('#btn-setup')).toHaveText('设置');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await expect(score(page, 'fortune')).toHaveText('5');
  await expect(page.locator('#btn-setup')).toHaveText('设置');
});

test('第四階段的 7 項彈窗瀏覽器檢查全部通過', async ({ page }) => {
  await page.goto('/scripts/modal-browser.html');
  await expect(page.locator('#results')).toHaveAttribute('data-status', 'passed');
  await expect(page.locator('#results')).toHaveAttribute('data-count', '7');
});

test.describe('離線啟動', () => {
  test.use({ serviceWorkers: 'allow' });
  test('SW 快取完成後，離線重新整理仍可開啟、調分與使用彈窗', async ({ page, context }) => {
    await openGame(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#players .player-card')).toHaveCount(4);
    await adjust(page, { fortune: 1 });
    await expect(score(page, 'fortune')).toHaveText('6');
    await page.reload();
    await expect(score(page, 'fortune')).toHaveText('6');
    await expect(page.locator('#storage-warning')).toBeHidden();
  });
});
