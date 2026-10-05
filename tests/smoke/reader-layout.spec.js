const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

for (const width of [320, 390, 1280]) {
    test(`reading workspaces remain usable at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await mockApi(page);
        await page.route('**/api/notices', route => route.fulfill({ json: { items: [{
            id: 'reader', title: '읽기 화면 개선', tag: '시스템', date: '2026-10-05',
            content: '■ 변경 사항\n\n<img src=x onerror=alert(1)>\n\n⸻\n\n■ 사용 방법\n\n' + '긴 공지도 편하게 읽을 수 있습니다.\n\n'.repeat(30)
        }] } }));
        await gotoSection(page, '#notices');
        const trigger = page.locator('[data-notice-id="reader"]');
        await trigger.click();
        const dialog = page.locator('#global-modal .modal-card');
        await expect(dialog.getByRole('heading', { name: '변경 사항', exact: true })).toBeVisible();
        await expect(dialog.locator('article img')).toHaveCount(0);
        await expect(dialog.locator('article')).toContainText('<img src=x onerror=alert(1)>');
        expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        await gotoSection(page, '#ships');
        await page.locator('#ship-search').fill('Asgard');
        await page.locator('.ship-name-btn').first().click();
        await expect(dialog.locator('.ship-reader-actions')).toBeVisible();
        const actions = await dialog.locator('.ship-reader-actions').boundingBox();
        expect(actions.y + actions.height).toBeLessThanOrEqual(844);
        await dialog.locator('.ship-live-details summary').click();
        expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
    });
}
