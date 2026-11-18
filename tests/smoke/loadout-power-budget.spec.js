const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

for (const width of [1440, 390]) test(`${width}px 파워플랜트 공급량이 배정 칸을 제한하고 교체·제거·복원에 반영된다`, async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { ok: true, items: {} } }));
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('titan');
    await page.locator('[data-loadout-ship="aegs_avenger_titan"]').click();
    const power = page.locator('.loadout-power-plan');
    const meter = power.locator('meter');
    const values = () => power.locator('[data-loadout-power-value]').evaluateAll((inputs) => inputs.map((input) => Number(input.value)));
    await expect(power.locator('.loadout-power-supply')).toContainText('파워플랜트 공급 15칸');
    await expect(meter).toHaveAttribute('value', '15');
    await expect(meter).toHaveAttribute('max', '15');
    await expect(power.getByRole('button', { name: '무기 배정 늘리기', exact: true })).toBeDisabled();
    const weapon = page.locator('#loadout-power-weapons');
    const before = await values();
    await weapon.fill('999'); await weapon.press('Enter');
    expect(await values()).toEqual(before);
    await power.getByRole('button', { name: '무기 배정 줄이기', exact: true }).click();
    await expect(meter).toHaveAttribute('value', '14');
    await expect(power.getByRole('button', { name: '무기 배정 늘리기', exact: true })).toBeEnabled();
    await page.locator('[data-loadout-undo]').click();
    await expect(meter).toHaveAttribute('value', '15');
    const plant = page.locator('.loadout-group.is-power [data-loadout-open]').first();
    await plant.click();
    await page.locator('.loadout-picker [data-loadout-pick="0a713a9d-7e70-4586-87a6-ce08c337a8ea"]').click(); // DeltaMax
    await expect(meter).toHaveAttribute('max', '13');
    await expect(meter).toHaveAttribute('value', '13');
    await expect(power.locator('.loadout-power-supply')).toContainText('DeltaMax');
    await plant.click();
    await page.locator('.loadout-picker [data-loadout-pick=""]').click();
    await expect(power.locator('.loadout-power-supply')).toContainText('공급 0칸');
    expect((await values()).every((value) => value === 0)).toBe(true);
    await page.locator('[data-loadout-undo]').click();
    await expect(meter).toHaveAttribute('value', '13');
    await plant.click();
    await page.locator('.loadout-picker [data-loadout-pick="d89b535f-8187-4840-b5f4-3230c789dfd1"]').click(); // QuadraCell
    await expect(meter).toHaveAttribute('max', '17');
    await expect(meter).toHaveAttribute('value', '13');
    await page.locator('[data-loadout-power-rated]').click();
    await expect(meter).toHaveAttribute('value', '17');
    await page.locator('[data-loadout-power-clear]').click();
    await expect(meter).toHaveAttribute('value', '0');
    await power.getByRole('button', { name: '실드 배정 늘리기', exact: true }).click();
    await expect(page.locator('#loadout-power-shields')).toHaveValue('4'); // Minimum working allocation
    await page.reload();
    await expect(meter).toHaveAttribute('max', '17');
    await expect(meter).toHaveAttribute('value', '4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
});
