const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

for (const width of [1920, 3440]) test(`${width}px 첫 화면에서 성능·무장·부품·전력을 나란히 읽는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('titan');
    await page.locator('[data-loadout-ship="aegs_avenger_titan"]').click();
    await expect(page.locator('.loadout-group.is-weapon .loadout-item-name').first()).toBeInViewport();
    await expect(page.locator('.loadout-power-channels')).toBeInViewport();
    await expect(page.locator('.loadout-group.is-shield .loadout-item-name').first()).toBeInViewport();
    const panels = await page.locator('.loadout-main-column, .loadout-systems-column, .loadout-control-column').evaluateAll(els => els.map(e => ({ x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y, right: e.getBoundingClientRect().right })));
    expect(panels[0].right).toBeLessThan(panels[1].x);
    expect(panels[1].right).toBeLessThan(panels[2].x);
    expect(Math.max(...panels.map(p => p.y)) - Math.min(...panels.map(p => p.y))).toBeLessThan(2);
    const pips = page.getByRole('group', { name: '무기', exact: true }).locator('button');
    for (const pip of await pips.all()) expect((await pip.boundingBox()).height).toBeGreaterThanOrEqual(14);
    await page.locator('[data-loadout-jump="equipment"]').click();
    await expect(page.locator('.loadout-topbar')).toHaveClass(/is-scrolled/);
    await expect(page.locator('.loadout-kpis')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
