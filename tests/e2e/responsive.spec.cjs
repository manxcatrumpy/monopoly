const { test, expect, openGame, player } = require('./fixtures.cjs');

for (const width of [320, 360, 393, 430, 640, 641, 768, 1024, 1440, 1601]) {
  test(`${width}px：標題、統計與分數不擠壓，抽卡入口可操作`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await openGame(page);

    const layout = await page.evaluate(() => {
      const title = document.createRange();
      title.selectNodeContents(document.querySelector('.brand-text .title'));
      const overflow = [...document.querySelectorAll('.topbar, .brand, .actions, .meta, .meta-item, .dashboard, .players-grid, .stat-label, .player-card')]
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => el.className);
      const labels = [...document.querySelectorAll('.stat-label > span:first-child')].map(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length;
      });
      return {
        pageWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        titleLines: title.getClientRects().length,
        overflow,
        labels,
      };
    });
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.titleLines).toBe(1);
    expect(layout.overflow).toEqual([]);
    expect(layout.labels.every(lines => lines === 1)).toBe(true);

    if (width === 393 || width === 1024) {
      await testInfo.attach('dashboard', { body: await page.screenshot(), contentType: 'image/png' });
    }
    if (width <= 640) {
      const controls = page.locator('.actions .btn:visible');
      for (const control of await controls.all()) {
        expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      const action = await page.locator('#btn-quick-action').boundingBox();
      const boost = await page.locator('#btn-quick-boost').boundingBox();
      expect(action.y).toBe(boost.y);
      expect(action.x + action.width).toBeLessThanOrEqual(boost.x);

      await player(page).locator('[data-act="adjust"]').click();
      await expect(page.locator('#adjust-modal')).toBeVisible();
      await page.keyboard.press('Escape');
      // The tall phone header must leave the viewport as the user scrolls.
      await page.evaluate(() => window.scrollTo(0, 600));
      expect((await page.locator('.topbar').boundingBox()).y).toBeLessThan(0);
      if (width === 393) {
        await testInfo.attach('scrolled', { body: await page.screenshot(), contentType: 'image/png' });
      }
      // The final control can scroll clear of the fixed dock.
      const last = page.locator('#btn-reset-game');
      await last.scrollIntoViewIfNeeded();
      const lastBox = await last.boundingBox();
      const dock = await page.locator('#quick-draw').boundingBox();
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(dock.y);
    }
    const draw = width <= 1024 ? '#btn-quick-action' : '#btn-draw-action';
    await page.locator(draw).click();
    await expect(page.locator('#card-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    if (width <= 640) {
      await page.locator('#btn-quick-boost').click();
      await expect(page.locator('#card-modal')).toBeVisible();
    }
  });
}
