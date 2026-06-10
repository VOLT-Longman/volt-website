const { test, expect } = require('@playwright/test');
const { mockApi, trackConsoleErrors, gotoSection } = require('./helpers');

test.describe('홈', () => {
    test('홈 로드: hero 렌더 + 콘솔 에러 0', async ({ page }) => {
        await mockApi(page);
        const errors = trackConsoleErrors(page);

        await gotoSection(page, '');

        await expect(page.locator('#home .hero-content')).toBeVisible();
        await expect(page.locator('.nav-logo-text')).toHaveText('VOLT');
        expect(errors).toEqual([]);
    });

    test('멤버수: 디스코드 API 값으로 교체(정적 49+에서 갱신)', async ({ page }) => {
        await mockApi(page); // discord-stats: memberCount 1234 → 10단위 내림 "1,230+"
        await gotoSection(page, '');

        const counter = page.locator('[data-stat="members"]');
        await expect(counter).toHaveText('1,230+');
    });

    test('테마 토글: light/dark 전환 + 저장', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');

        const initialTheme = await page.locator('html').getAttribute('data-theme');
        await page.locator('#theme-toggle').click();

        const toggledTheme = initialTheme === 'light' ? 'dark' : 'light';
        await expect(page.locator('html')).toHaveAttribute('data-theme', toggledTheme);
        expect(await page.evaluate(() => localStorage.getItem('volt-theme'))).toBe(toggledTheme);

        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', toggledTheme);
    });
});
