const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

async function typeKorean(page, selector) {
    const field = page.locator(selector);
    await field.focus();
    const initial = await field.elementHandle();
    const cdp = await page.context().newCDPSession(page);
    try {
        for (const [partial, syllable] of [['ㅌ', '타'], ['ㅇ', '이']]) {
            for (const text of [partial, syllable]) {
                await cdp.send('Input.imeSetComposition', { text, selectionStart: 1, selectionEnd: 1 });
                expect(await initial.evaluate((el) => el === document.activeElement && el.isConnected)).toBe(true);
            }
            await cdp.send('Input.insertText', { text: syllable });
            expect(await initial.evaluate((el) => el === document.activeElement && el.isConnected)).toBe(true);
        }
        await expect(field).toHaveValue('타이');
    } finally { await cdp.detach(); }
}

test('장비와 함선 검색에서 한글 조합과 초점을 유지한다', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#gear');
    await typeKorean(page, '#gear-search');
    await gotoSection(page, '#loadout');
    await typeKorean(page, '#loadout-ship-search');
    await page.locator('[data-loadout-ship="aegs_avenger_titan"]').click();
    await page.locator('.loadout-slot [data-loadout-open]').first().click();
    await typeKorean(page, '#loadout-picker-search');
    await page.keyboard.press('Escape');
    await page.locator('[data-loadout-tab="finder"]').click();
    await typeKorean(page, '#loadout-finder-search');
});

test('장비 패널을 제목으로 옮기고 좁은 화면에서 배치를 복원한다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('titan');
    await page.locator('[data-loadout-ship="aegs_avenger_titan"]').click();
    const panel = (key) => page.locator('[data-panel-key="' + key + '"]');
    const grip = (key) => panel(key).locator('[data-panel-handle]');
    await grip('cooler').dragTo(panel('shield').locator('[data-panel-heading]'));
    const order = () => page.locator('[data-panel-column="1"] [data-panel-key]').evaluateAll((els) => els.map(el => el.dataset.panelKey));
    expect((await order()).indexOf('cooler')).toBeLessThan((await order()).indexOf('shield'));
    await page.reload();
    await expect(panel('cooler')).toBeVisible();
    expect((await order()).indexOf('cooler')).toBeLessThan((await order()).indexOf('shield'));
    await page.setViewportSize({ width: 390, height: 844 });
    await grip('cooler').focus();
    await page.keyboard.press('Enter');
    await panel('cooler').locator('[data-panel-move="other"]').click();
    await expect(page.locator('[data-panel-column="0"] [data-panel-key="cooler"]')).toBeVisible();
    await expect(grip('cooler')).toBeFocused();
    await page.locator('[data-panel-reset]').click();
    await expect(page.locator('[data-panel-column="1"] [data-panel-key="cooler"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('터치 손잡이로 쉴드와 파워 플랜트 순서를 바꾼다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('titan');
    await page.locator('[data-loadout-ship="aegs_avenger_titan"]').click();
    for (const key of ['shield', 'power']) {
        const toggle = page.locator('[data-loadout-collapse="' + key + '"]');
        if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    }
    const handle = key => page.locator('[data-panel-key="' + key + '"] [data-panel-handle]');
    await handle('shield').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const from = await handle('power').boundingBox(), to = await handle('shield').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    try {
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
        const x = from.x + from.width / 2, y = from.y + 12;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 9 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: to.y + 4 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect(page.locator('[data-panel-key="power"] + [data-panel-key="shield"]')).toBeVisible();
    } finally { await cdp.detach(); }
});
