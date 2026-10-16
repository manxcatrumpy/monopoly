const { test: base, expect } = require('@playwright/test');
const GameState = require('../../game-state.js');
const SAVE_KEY = 'fuhui-dashboard-state-v2';

function savedGame() {
  const save = GameState.createState();
  save.currentGame.civGoal = 41;
  save.currentGame.players = ['A', 'B', 'C', 'D'].map((name, index) =>
    GameState.createPlayer({ id: 'p' + (index + 1), name, fortune: 5, wisdom: 5 }));
  return save;
}

const test = base.extend({
  save: [savedGame(), { option: true }],
  storageState: async ({ baseURL, save }, use) => {
    await use({ cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [
      { name: SAVE_KEY, value: GameState.serialize(save) }, { name: 'i18n_lang', value: 'zh-tw' },
    ] }] });
  },
  page: async ({ page }, use, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    if (errors.length) await testInfo.attach('page-errors', { body: errors.join('\n'), contentType: 'text/plain' });
    expect(errors, '瀏覽器不應有未捕捉例外').toEqual([]);
  },
});

const player = (page, id) => id ? page.locator(`[data-player-id="${id}"]`) : page.locator('#players .player-card').first();
const score = (page, stat, id) => player(page, id).locator(`.stat-${stat} .stat-num`);
const readSave = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
async function openGame(page) {
  await page.goto('/');
  await expect(page.locator('#players .player-card')).toHaveCount(4);
  await expect(page.locator('#setup-modal')).toBeHidden();
}
async function adjust(page, changes, id) {
  await player(page, id).locator('[data-act="adjust"]').click();
  for (const [stat, value] of Object.entries(changes)) {
    await page.locator(`#adjust-rows [data-stat="${stat}"] input`).fill(String(value));
  }
  if (await page.locator('#adjust-as-turn').isVisible()) await page.locator('#adjust-as-turn').uncheck();
  await page.locator('#adjust-apply').click();
  await expect(page.locator('#adjust-modal')).toBeHidden();
}
async function assertTop(page, id, control) {
  await expect(page.locator('#' + id)).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#' + id)).toHaveJSProperty('inert', false);
  // 原生點擊的 actionability 檢查會驗證實際遮擋；不使用 force 或派發 click。
  await page.locator(control).click({ trial: true });
  await expect(page.locator(control)).toBeFocused();
}
module.exports = { test, expect, savedGame, openGame, player, score, readSave, adjust, assertTop };
