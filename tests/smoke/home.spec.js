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

    test('멤버수: 디스코드 API 값으로 교체(정적 100+에서 갱신)', async ({ page }) => {
        await mockApi(page); // discord-stats: memberCount 1234 → 10단위 내림 "1,230+"
        await gotoSection(page, '');

        const counter = page.locator('[data-stat="members"]');
        await expect(counter).toHaveText('1,230+');
    });

    test('테마는 항상 다크로 고정된다 (F-2: 라이트 제거)', async ({ page }) => {
        // 과거 사용자의 light 저장값이 남아 있어도 무시하고 흔적을 지운다
        await page.addInitScript(() => localStorage.setItem('volt-theme', 'light'));
        await page.emulateMedia({ colorScheme: 'light' });
        await mockApi(page);
        await gotoSection(page, '');

        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        expect(await page.evaluate(() => localStorage.getItem('volt-theme'))).toBeNull();
    });

    test('라이트 테마 토글은 노출되지 않는다 (F-2)', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockApi(page);
        await gotoSection(page, '');

        await expect(page.locator('#theme-toggle')).toHaveCount(0);
        await page.locator('#hamburger').click();
        await expect(page.locator('#mobileMenu')).toBeVisible();
        await expect(page.locator('#mobile-theme-toggle')).toHaveCount(0);
    });
});
