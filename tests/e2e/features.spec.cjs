const { test, expect, savedGame, openGame, player, score, readSave } = require('./fixtures.cjs');

test('開局介面可完成實際骰子動畫、調整人數與文明目標，再交給流程建立新局', async ({ page }) => {
  await openGame(page);
  await page.locator('#btn-setup').click();
  await expect(page.locator('#die10 .kface').first()).toHaveAttribute('d', /^M/);
  const first = page.locator('.setup-player-row').first();
  await first.locator('.fortune').fill('0');
  await first.locator('[data-roll="fortune"]').click();
  await expect(first.locator('.fortune')).toHaveValue(/^(10|[1-9])$/);
  const rolled = await first.locator('.fortune').inputValue();
  await page.locator('.player-count-pick [data-count="5"]').click();
  await expect(page.locator('.setup-player-row')).toHaveCount(5);
  await page.locator('.setup-player-row').last().locator('.fortune').fill('5');
  await page.locator('.setup-player-row').last().locator('.wisdom').fill('5');
  await page.locator('#setup-civ-white').fill('2');
  await page.locator('#setup-civ-black').fill('3');
  await expect(page.locator('#civ-calc-goal')).toHaveText('56');
  await page.locator('#setup-start').click();
  await expect(page.locator('#setup-modal')).toBeHidden();
  expect(await page.locator('#die10').evaluate(die => die.getAnimations().length)).toBe(0);
  await expect(page.locator('#players .player-card')).toHaveCount(5);
  await expect(score(page, 'fortune')).toHaveText(rolled);
  await expect(page.locator('#civ-goal')).toHaveText('56');
  expect((await readSave(page)).currentGame.players).toHaveLength(5);
});

test.describe('一般雙人卡介面', () => {
  const save = savedGame();
  save.settings.customDecks.boost = [{ name: '一起向前', action: '共同完成任務', insight: '互助', both: true,
    reward: { fortune: 1, wisdom: 2, civ: 1 }, rewardText: '雙方各福 +1 慧 +2 文明 +1' }];
  test.use({ save });
  test('選擇相同對象會阻擋，改選兩位玩家後只送出一次批次獎勵', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-draw-boost').click();
    await expect(page.locator('#card-body')).toContainText('一起向前');
    await page.locator('#card-recipient').selectOption('p1');
    await page.locator('#card-recipient2').selectOption('p1');
    await page.locator('#card-apply').click();
    await expect(page.locator('#card-modal')).toBeVisible();
    await expect(score(page, 'fortune')).toHaveText('5');
    await page.locator('#card-recipient2').selectOption('p2');
    await page.locator('#card-apply').click();
    await expect(page.locator('#card-modal')).toBeHidden();
    for (const id of ['p1', 'p2']) {
      await expect(score(page, 'fortune', id)).toHaveText('6');
      await expect(score(page, 'wisdom', id)).toHaveText('7');
      await expect(score(page, 'civ', id)).toHaveText('1');
    }
    await expect(page.locator('#civ-total')).toHaveText('2');
    await expect(player(page, 'p1').locator('[data-act="acted"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(player(page, 'p2').locator('[data-act="acted"]')).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(score(page, 'fortune', 'p2')).toHaveText('6');
  });
});

test.describe('條件抉擇卡介面', () => {
  const save = savedGame();
  save.settings.customDecks.boost = [{ name: '共同選擇', scene: '依文明決定分支', both: true,
    conditional: { civGte: 1 }, options: [
      { label: '文明充足', each: { fortune: 1 }, civAll: 1 },
      { label: '累積智慧', each: { wisdom: 1 }, civAll: 2 },
    ] }];
  test.use({ save });
  test('依文明鎖定分支，兩位收受者與全體文明交給同一個結算流程', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-draw-boost').click();
    await expect(page.locator('.dilemma-opt[data-opt="0"]')).toBeDisabled();
    await expect(page.locator('.dilemma-opt[data-opt="1"]')).toHaveClass(/selected/);
    await page.locator('#card-recipient').selectOption('p1');
    await page.locator('#card-recipient2').selectOption('p2');
    await page.locator('#card-apply').click();
    await expect(page.locator('#card-modal')).toBeHidden();
    await expect(score(page, 'fortune')).toHaveText('5');
    await expect(score(page, 'wisdom', 'p1')).toHaveText('6');
    await expect(score(page, 'wisdom', 'p2')).toHaveText('6');
    for (const id of ['p1', 'p2', 'p3', 'p4']) await expect(score(page, 'civ', id)).toHaveText('2');
    await expect(page.locator('#civ-total')).toHaveText('8');
  });
});

test('金句預覽反映輸入，取消後重新開啟不保留草稿，也不改遊戲資料', async ({ page }) => {
  await openGame(page);
  const before = await readSave(page);
  await page.locator('#btn-highlight').click();
  await page.locator('#highlight-quote-input').fill('一念善意');
  await page.locator('#highlight-author-input').fill('主持人');
  await expect(page.locator('#hc-quote-display')).toHaveText('一念善意');
  await expect(page.locator('#hc-author-display')).toHaveText('— 主持人');
  await expect(page.locator('#highlight-char-count')).toHaveText('4 / 200');
  await page.keyboard.press('Escape');
  await expect(page.locator('#highlight-modal')).toBeHidden();
  await page.locator('#btn-highlight').click();
  await expect(page.locator('#highlight-quote-input')).toHaveValue('');
  await expect(page.locator('#highlight-author-input')).toHaveValue('');
  await expect(page.locator('#highlight-char-count')).toHaveText('0 / 200');
  await expect(page.locator('#hc-quote-display')).not.toHaveText('一念善意');
  expect(await readSave(page)).toEqual(before);
});

test('玩家卡將改名與移除交給流程；取消保留玩家，確認後才移除', async ({ page }) => {
  await openGame(page);
  await player(page).locator('.pc-name').fill('改名後');
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await readSave(page)).currentGame.players[0].name).toBe('改名後');
  await player(page).locator('[data-act="remove"]').click();
  await page.locator('#confirm-cancel').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#players .player-card')).toHaveCount(4);
  await player(page).locator('[data-act="remove"]').click();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#players .player-card')).toHaveCount(3);
  await expect(player(page, 'p1')).toHaveCount(0);
  expect((await readSave(page)).currentGame.players.map(p => p.name)).toEqual(['B', 'C', 'D']);
});
