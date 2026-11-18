const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

for (const width of [1440, 375]) test(`로드아웃 ${width}px: 최대 가동 부족을 현재 배정 경고와 구분한다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('stalker');
    await page.locator('[data-loadout-ship="aegs_avenger_stalker"]').click();
    await expect(page.locator('.loadout-power-budget')).toContainText('14 / 14칸 배정');
    await expect(page.locator('.loadout-system-facts')).toContainText('최대 소비 전력');
    await expect(page.locator('.loadout-system-facts')).toContainText('최대 가동 시 부족');
    await expect(page.locator('.loadout-system-facts')).toContainText('18.1');
    await expect(page.locator('.loadout-system-facts')).toContainText('4.1');
    const warning = page.locator('.loadout-kpi').filter({ hasText: '최대 가동 시 부족' });
    await expect(warning).not.toHaveClass(/is-warn/);
    const flight = page.locator('[data-loadout-fold="flight"]');
    const hull = page.locator('[data-loadout-fold="hull"]');
    if (width < 700) {
        await expect(flight).not.toHaveAttribute('open');
        await expect(hull).not.toHaveAttribute('open');
        await flight.locator('summary').click();
        await expect(flight).toHaveAttribute('open');
        await page.locator('[data-loadout-jump="power"]').click();
        await page.getByRole('button', { name: '무기 배정 줄이기', exact: true }).click();
        await expect(flight).toHaveAttribute('open');
    } else {
        await expect(flight).toHaveAttribute('open');
        await expect(hull).not.toHaveAttribute('open');
    }
    await page.locator('[data-loadout-jump="equipment"]').click();
    const tiny = () => page.locator('#loadout').evaluate(el => [...el.querySelectorAll('*')].filter(e => !e.children.length && e.textContent.trim() && e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 11).map(e => e.textContent.trim()));
    expect(await tiny()).toEqual([]);
    await page.locator('.loadout-slot [data-loadout-open]').first().click();
    expect(await tiny()).toEqual([]);
});
