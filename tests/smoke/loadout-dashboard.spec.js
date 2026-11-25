const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

for (const width of [1366, 1920, 3440]) test(`${width}px 화면 폭에 맞춰 장비와 전력을 읽는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('titan');
    await page.locator('[data-loadout-ship="aegs_avenger_titan"]').click();
    await expect(page.locator('.loadout-group.is-weapon .loadout-item-name').first()).toBeInViewport();
    await expect(page.locator('.loadout-power-channels')).toBeInViewport();
    const panels = await page.locator('.loadout-main-column, .loadout-systems-column, .loadout-control-column').evaluateAll(els => els.map(e => { const box = (getComputedStyle(e).display === "contents" ? e.parentElement : e).getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, width: box.width }; }));
    if (width >= 2200) {
        await expect(page.locator('.loadout-group.is-shield .loadout-item-name').first()).toBeInViewport();
        expect(panels[0].right).toBeLessThan(panels[1].x);
        expect(panels[1].right).toBeLessThan(panels[2].x);
        expect(Math.max(...panels.map(p => p.y)) - Math.min(...panels.map(p => p.y))).toBeLessThan(2);
    } else {
        expect(panels[0].width).toBeGreaterThan(width * .6);
        expect(panels[0].right).toBeLessThan(panels[2].x);
        expect(panels[1].x).toBe(panels[0].x);
    }
    const pips = page.getByRole('group', { name: '무기', exact: true }).locator('button');
    for (const pip of await pips.all()) expect((await pip.boundingBox()).height).toBeGreaterThanOrEqual(14);
    await page.locator('[data-loadout-jump="equipment"]').click();
    await expect(page.locator('.loadout-topbar')).toHaveClass(/is-scrolled/);
    await expect(page.locator('.loadout-kpis')).toBeInViewport();
    expect(await page.locator('.loadout-kpis').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

test('375px 장비 바로가기는 전력 패널을 지나 실제 장비에 도착하고 비교 핵심 수치부터 표시한다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('liberator');
    await page.locator('[data-loadout-ship="anvl_liberator"]').click();
    await page.locator('[data-loadout-jump="equipment"]').click();
    await expect(page.locator('.loadout-group.is-weapon .loadout-item-name').first()).toBeInViewport();
    const header = await page.locator('.loadout-topbar').boundingBox();
    const weapon = await page.locator('.loadout-group.is-weapon').boundingBox();
    expect(weapon.y).toBeGreaterThan(header.y + header.height);
    const device = page.getByRole('group', { name: '실드', exact: true }).locator('.loadout-power-device').first();
    await expect(device.locator('span').first()).toHaveText('#1');
    await expect(device.locator('span').first()).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
    await expect(page.locator('#pwa-install-prompt')).toBeVisible();
    await page.locator('.loadout-group.is-weapon [data-loadout-component-open]').first().click();
    await expect(page.locator('#pwa-install-prompt')).toBeHidden();
    const row = page.locator('.loadout-optrows tr').first();
    await expect(row.locator('.loadout-cmp-cell:visible')).toHaveCount(4);
    await page.locator('.loadout-picker-baseline summary').click();
    await page.getByLabel('상세 수치·변화량', { exact: true }).check();
    expect(await row.locator('.loadout-cmp-cell:visible').count()).toBeGreaterThan(4);
    await page.getByLabel('상세 수치·변화량', { exact: true }).uncheck();
    await expect(row.locator('.loadout-cmp-cell:visible')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pwa-install-prompt')).toBeVisible();
});

test('같은 랙을 펼쳐도 각각 교체하며 다른 랙의 미사일은 유지한다', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 975 });
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('liberator');
    await page.locator('[data-loadout-ship="anvl_liberator"]').click();
    await expect(page.locator('.loadout-rack-heading')).toContainText('같은 구성의 랙 4개');
    await expect(page.locator('.loadout-group.is-missile [data-loadout-rack-open]:visible')).toHaveCount(1);
    await page.getByRole('button', { name: '나머지 3개 랙 편집', exact: true }).click();
    await expect(page.locator('.loadout-group.is-missile [data-loadout-rack-open]:visible')).toHaveCount(4);
    await page.locator('.loadout-group.is-shield').scrollIntoViewIfNeeded();
    await expect(page.locator('.loadout-topbar')).toBeInViewport();
    const missiles = page.locator('.loadout-group.is-missile .loadout-item-name');
    const original = await missiles.allTextContents();
    await missiles.nth(1).locator('button').click();
    const option = page.locator('.loadout-optrows tr:not(.is-current)').first();
    await option.locator('[data-loadout-pick]').click();
    await expect(page.locator('.loadout-swap')).toHaveCount(0);
    const after = await missiles.allTextContents();
    expect(after[1]).not.toBe(original[1]);
    expect([after[0], ...after.slice(2)]).toEqual([original[0], ...original.slice(2)]);
    await page.getByRole('button', { name: '직전 변경 취소', exact: true }).click();
    await expect(page.locator('.loadout-rack-heading')).toContainText('같은 구성의 랙 4개');
});
