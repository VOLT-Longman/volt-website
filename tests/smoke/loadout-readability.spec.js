const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { mockApi, gotoSection } = require('./helpers');

for (const width of [1440, 390, 320]) test(`${width}px 최소 전력 묶음을 한 번에 배정하고 바로가기로 장비를 편집한다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('titan');
    await page.locator('[data-loadout-ship="aegs_avenger_titan"]').click();
    await page.locator('[data-loadout-jump="power"]').click();
    await expect(page.locator('#loadout-power-title')).toBeFocused();
    expect((await page.locator('#loadout-power-title').boundingBox()).y).toBeGreaterThan(100);
    const pips = page.getByRole('group', { name: '실드', exact: true });
    const minimum = pips.locator('.is-minimum');
    expect((await page.locator('#loadout-power-shields').boundingBox()).width).toBeGreaterThanOrEqual(24);
    await expect(minimum).toHaveCount(2);
    await expect(minimum.first()).toContainText('2');
    await expect(minimum.last()).toContainText('2');
    await expect(pips.locator('button')).toHaveCount(4); // two independent 2-pip devices, then 5 and 6
    const sizes = await pips.locator('button').evaluateAll((buttons) => buttons.map((b) => ({ minimum: b.classList.contains('is-minimum'), height: b.getBoundingClientRect().height })));
    expect(sizes.filter(b => b.minimum).every(b => b.height >= 64)).toBe(true);
    expect(sizes.find((b) => b.minimum).height).toBeGreaterThan(sizes.find((b) => !b.minimum).height * 2);
    // Every column in a grid row shares a floor; short bars must not float in the middle.
    const floors = await page.locator('.loadout-power-channel').evaluateAll((channels) => channels.map((channel) => {
        const bounds = channel.getBoundingClientRect();
        const pips = channel.querySelector('.loadout-power-pips');
        const last = pips.lastElementChild;
        return { top: bounds.top, floor: pips.getBoundingClientRect().bottom, last: last?.getBoundingClientRect().bottom, input: channel.querySelector('input').getBoundingClientRect().top };
    }));
    for (const floor of floors) {
        if (floor.last !== undefined) expect(Math.abs(floor.floor - floor.last)).toBeLessThan(2);
        for (const peer of floors.filter((item) => Math.abs(item.top - floor.top) < 2)) {
            expect(Math.abs(peer.floor - floor.floor)).toBeLessThan(2);
            expect(Math.abs(peer.input - floor.input)).toBeLessThan(2);
        }
    }
    await minimum.first().press('Enter');
    await expect(page.locator('#loadout-power-shields')).toHaveValue('2');
    await expect(minimum.first()).toHaveAttribute('aria-pressed', 'false');
    await expect(minimum.last()).toHaveAttribute('aria-pressed', 'true');
    await minimum.last().press('Enter');
    await expect(page.locator('#loadout-power-shields')).toHaveValue('0');
    await minimum.first().press('Enter');
    await expect(page.locator('#loadout-power-shields')).toHaveValue('2');
    await page.getByRole('button', { name: '실드 배정 늘리기', exact: true }).click();
    await expect(page.locator('#loadout-power-shields')).toHaveValue('3');
    await page.getByRole('button', { name: '실드 배정 줄이기', exact: true }).click();
    await page.getByRole('button', { name: '실드 배정 줄이기', exact: true }).click();
    await expect(page.locator('#loadout-power-shields')).toHaveValue('0');
    await expect(minimum.first()).toHaveClass(/is-unfunded/);
    await expect(minimum.first()).toContainText('미배정');
    const accessibility = await new AxeBuilder({ page }).include('.loadout-power-plan').analyze();
    expect(accessibility.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
    await page.locator('[data-loadout-jump="equipment"]').click();
    await expect(page.locator('[data-loadout-tab="slots"]')).toBeFocused();
    const top = await page.locator('[data-loadout-tab="slots"]').boundingBox();
    expect(top.y).toBeGreaterThan(50);
    expect(top.y + top.height).toBeLessThan(900);
    await page.locator('.loadout-slot [data-loadout-open]').first().click();
    await expect(page.locator('.loadout-picker')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
