const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

async function loadShip(page, cls, query) {
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill(query);
    await page.locator(`[data-loadout-ship="${cls}"]`).click();
}

async function changeLanguage(page, language, width) {
    if (width === 390) await page.locator('#hamburger').click();
    await page.locator(`${width === 390 ? '.lang-switch-mobile' : '.nav-lang'} [data-set-lang="${language}"]`).click();
    if (width === 390) await page.locator('#mobileMenuClose').click();
}

for (const width of [1440, 390]) test(`${width}px 운영진 피드백: 영문 병기·랙 교체·전원 상태·A/B`, async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.setViewportSize({ width, height: 900 });
    await loadShip(page, 'aegs_avenger_titan', 'titan');
    await expect(page.locator('.loadout-ship-select .loadout-origin')).toHaveText('Aegis Avenger Titan');
    const rack = page.locator('[data-loadout-mount="hardpoint_weapon_missilerack_left_wing"]');
    await expect(rack.locator('.loadout-origin')).toHaveText('MSD-322 Missile Rack');
    await rack.getByRole('button', { name: '랙 교체', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(rack.getByRole('button', { name: '랙 교체', exact: true })).toBeFocused();
    await rack.getByRole('button', { name: '랙 교체', exact: true }).click();
    const replacement = page.locator('.loadout-opttable tr').filter({ hasText: 'MSD-341 Missile Rack' });
    await expect(replacement.locator('.loadout-origin')).toBeVisible();
    await replacement.locator('[data-loadout-pick]').click();
    await expect(rack.locator('.loadout-origin')).toHaveText('MSD-341 Missile Rack');
    await page.locator('[data-loadout-undo]').click();
    await expect(rack.locator('.loadout-origin')).toHaveText('MSD-322 Missile Rack');
    const shield = page.locator('.loadout-group.is-shield .loadout-slot').first();
    const power = shield.locator('[data-loadout-power]');
    await expect(power.locator('svg')).toBeVisible();
    await expect(power).toHaveAttribute('aria-pressed', 'true');
    await power.click();
    await expect(power).toHaveAttribute('aria-pressed', 'false');
    await expect(power).toContainText('꺼짐');
    await page.locator('[data-loadout-undo]').click();
    await expect(power).toHaveAttribute('aria-pressed', 'true');
    await shield.locator('[data-loadout-detail]').click();
    await page.locator('.loadout-detail [data-loadout-cart-add]').click();
    await page.locator('#loadout-detail-close').click();
    await page.locator('[data-loadout-cart-open]').click();
    await expect(page.locator('.loadout-cart-drawer .loadout-origin')).toHaveText('Bulwark');
    await page.locator('#loadout-cart-close').click();
    await page.locator('[data-loadout-tab="compare"]').click();
    if (width === 390) await expect(page.locator('.loadout-abcompare [data-loadout-ab]')).toBeHidden();
    await page.locator('.loadout-identity [data-loadout-ab="B"]').click();
    await expect(page.locator('.loadout-abstate')).toHaveText('구성 B');
    await expect(page.locator('.loadout-abcompare table')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
});

for (const [cls, query, weapon, owner] of [
    ['crus_starfighter_ion', 'ion', 'SF7E', '아레스'],
    ['rsi_perseus', 'perseus', '메두사', '페르세우스'],
]) test(`전용 무장 표기: ${weapon}`, async ({ page }) => {
    await loadShip(page, cls, query);
    const card = page.locator('.loadout-slot').filter({ has: page.locator('.loadout-item-name', { hasText: weapon }) }).first();
    await expect(card.locator('.loadout-bespoke')).toContainText(owner);
    await expect(card.locator('.loadout-bespoke')).toContainText('전용 무장');
    await card.locator('[data-loadout-detail]').click();
    await expect(page.locator('.loadout-detail .loadout-bespoke')).toContainText(owner);
});

for (const width of [1440, 390]) test(`${width}px 함선 대분류에서 세부 역할·다른 분류·전체로 전환`, async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await gotoSection(page, '#ships');
    if (width === 390) await page.locator('#ship-advanced-toggle').click();
    await page.locator('[data-activity="combat"]').click();
    if (width === 390) {
        await page.locator('#ship-role-search').click();
        await expect(page.locator('[data-role-option="Medical"]')).toBeHidden();
        await page.locator('#ship-role-search').fill('Light Fighter');
        await page.locator('[data-role-option="Light Fighter"]').click();
    } else await page.locator('[data-activity-detail="Light Fighter"]').click();
    await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
    expect(await page.locator('#ships-grid .ship-card').evaluateAll((cards) => cards.every((card) => card.dataset.canonicalRole === 'Light Fighter'))).toBe(true);
    await page.locator('[data-activity="support"]').click();
    await expect(page.locator('[data-activity-detail="Light Fighter"]')).toHaveCount(0);
    await expect(page.locator('[data-activity-detail="Heavy Repair"]')).toBeVisible();
    await expect(page.locator('[data-activity-detail="Light Carrier"]')).toBeVisible();
    await page.locator('[data-activity-detail="Medical"]').click();
    await expect(page.locator('#ships-grid .ship-card')).toHaveCount(6);
    await changeLanguage(page, 'en', width);
    await expect(page.locator('[data-activity="support"]')).toHaveText('Support');
    await expect(page.locator('[data-activity="support"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-activity-detail="Medical"]')).toHaveText('Medical');
    await expect(page.locator('#ships-grid .ship-card')).toHaveCount(6);
    await changeLanguage(page, 'ko', width);
    await page.locator('[data-activity="industry"]').click();
    await page.locator('[data-activity-detail="Light Mining"]').click();
    await expect(page.locator('#ships-grid [data-ship-id="prospector"]')).toBeVisible();
    await page.locator('[data-axis-clear="activity"]').click();
    await expect(page.locator('#ship-role-search')).toBeVisible();
    await expect(page.locator('.ship-activity-details')).toBeHidden();
    await page.locator('[data-role-tag="combat"]').click();
    await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
    expect(await page.locator('#ships-grid .ship-card').evaluateAll((cards) => cards.every((card) => [...card.querySelectorAll('.ship-tag-role')].some((tag) => tag.textContent === '전투')))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
});
