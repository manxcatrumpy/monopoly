const { test, expect, savedGame, openGame, score, player, readSave } = require('./fixtures.cjs');
const decks = require('../../locales/cards-zh-tw.json');
const DeckModel = require('../../deck-model');
const pool = DeckModel.buildActionPool(decks.actionDeck);
function cardSave(name, kind = 'action') {
  const save = savedGame();
  const card = (kind === 'action' ? pool : decks.boostDeck).find(c => c.name === name);
  save.settings.customDecks[kind] = kind === 'action' ? { V8: { cards: [card] } } : [card];
  return save;
}

test.describe('跨界學習角色獎勵', () => {
  test.use({ save: cardSave('跨界學習') });
  test('兩個不同角色一次結算，保留福報並只記錄行動者', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-draw-action').click();
    await page.locator('#card-recipient').selectOption('p1');
    await page.locator('#card-answerer').selectOption('p1');
    await page.locator('#card-apply').click();
    await expect(page.locator('#card-modal')).toBeVisible();
    await expect(score(page, 'fortune', 'p1')).toHaveText('5');
    await page.locator('#card-answerer').selectOption('p2');
    await expect(page.locator('#card-preview')).toContainText('A');
    await expect(page.locator('#card-preview')).toContainText('B');
    await page.locator('#card-apply').click();
    await expect(score(page, 'fortune', 'p1')).toHaveText('7');
    await expect(score(page, 'wisdom', 'p1')).toHaveText('7');
    await expect(score(page, 'civ', 'p1')).toHaveText('2');
    await expect(score(page, 'civ', 'p2')).toHaveText('1');
    await expect(player(page, 'p2').locator('[data-act="acted"]')).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(score(page, 'civ', 'p2')).toHaveText('1');
  });
});

test.describe('靜心錨定參與者', () => {
  test.use({ save: cardSave('靜心錨定') });
  test('帶領者不可兼領，只發給勾選的其他人', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-draw-action').click();
    await page.locator('.card-participant[value="p1"]').check();
    await page.locator('#card-recipient').selectOption('p1');
    await expect(page.locator('.card-participant[value="p1"]')).toBeDisabled();
    await expect(page.locator('.card-participant[value="p1"]')).not.toBeChecked();
    await page.locator('.card-participant[value="p2"]').check();
    await page.locator('.card-participant[value="p4"]').check();
    await page.locator('#card-apply').click();
    await expect(score(page, 'wisdom', 'p1')).toHaveText('8');
    await expect(score(page, 'wisdom', 'p2')).toHaveText('6');
    await expect(score(page, 'wisdom', 'p3')).toHaveText('5');
    await expect(score(page, 'wisdom', 'p4')).toHaveText('6');
  });
});

for (const total of [19, 20]) {
  test.describe('生態紅利文明 ' + total, () => {
    const save = cardSave('生態紅利', 'boost');
    save.currentGame.players[0].civ = total;
    test.use({ save });
    test('門檻限制分支，低文明可選微光行動', async ({ page }) => {
      await openGame(page);
      await page.locator('#btn-draw-boost').click();
      const high = page.locator('.dilemma-opt[data-opt="0"]');
      if (total < 20) {
        await expect(high).toBeDisabled();
        await expect(page.locator('.dilemma-opt[data-opt="1"]')).toBeEnabled();
        await page.locator('.dilemma-opt[data-opt="2"]').click();
      } else {
        await expect(high).toHaveClass(/selected/);
        await expect(page.locator('.dilemma-opt[data-opt="1"]')).toBeDisabled();
        await expect(page.locator('.dilemma-opt[data-opt="2"]')).toBeDisabled();
      }
      await page.locator('#card-recipient').selectOption('p1');
      await page.locator('#card-recipient2').selectOption('p2');
      await page.locator('#card-apply').click();
      await expect(score(page, 'fortune', 'p1')).toHaveText(total < 20 ? '3' : '7');
      await expect(score(page, 'civ', 'p3')).toHaveText(total < 20 ? '1' : '0');
    });
  });
}

test.describe('情緒垃圾車行動者成本', () => {
  test.use({ save: cardSave('情緒垃圾車') });
  test('補救不需要夥伴，僅行動者支付智慧', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-draw-action').click();
    await expect(page.locator('#card-recipient2')).toBeVisible();
    await page.locator('.dilemma-opt[data-opt="1"]').click();
    await expect(page.locator('#card-recipient2')).toBeHidden();
    await page.locator('#card-recipient').selectOption('p1');
    await page.locator('#card-apply').click();
    await expect(score(page, 'wisdom', 'p1')).toHaveText('4');
    await expect(score(page, 'fortune', 'p1')).toHaveText('5');
    await expect(score(page, 'wisdom', 'p2')).toHaveText('5');
    for (const id of ['p1', 'p2', 'p3', 'p4']) await expect(score(page, 'civ', id)).toHaveText('1');
  });
});

test.describe('本人免扣文明', () => {
  const save = cardSave('啊，忘記關了');
  save.currentGame.players.forEach((p, i) => { p.civ = i === 0 ? 0 : 2; });
  test.use({ save });
  test('本人在零分時不會誤加文明，其他人仍扣一分', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-draw-action').click();
    await page.locator('.dilemma-opt[data-opt="1"]').click();
    await page.locator('#card-recipient').selectOption('p1');
    await page.locator('#card-apply').click();
    await expect(score(page, 'civ', 'p1')).toHaveText('0');
    for (const id of ['p2', 'p3', 'p4']) await expect(score(page, 'civ', id)).toHaveText('1');
    const save = await readSave(page);
    expect(save.currentGame.players[0].fortune).toBe(3);
    expect(save.currentGame.players[0].wisdom).toBe(4);
  });
});
