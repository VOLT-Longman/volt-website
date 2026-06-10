const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('인증 게이팅', () => {
    test('비로그인: 마이페이지 진입 시 로그인 CTA 노출', async ({ page }) => {
        await mockApi(page, { loggedIn: false });
        await gotoSection(page, '#mypage');

        const content = page.locator('#mypage-content');
        await expect(content).toContainText('로그인이 필요합니다');
        await expect(content.locator('a[href="/auth/discord/login"]')).toBeVisible();
    });

    test('로그인 실패(?auth=error): 토스트 안내 + URL 정리', async ({ page }) => {
        await mockApi(page, { loggedIn: false });
        await page.goto('/?auth=error');
        await page.waitForSelector('#loading-splash', { state: 'hidden' });

        await expect(page.locator('#toast')).toContainText('로그인에 실패');
        await expect.poll(() => page.url()).not.toContain('auth=error');
    });

    test('로그인(모킹): 마이페이지 프로필 렌더', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await gotoSection(page, '#mypage');

        const content = page.locator('#mypage-content');
        await expect(content).toContainText('프로필');
        await expect(content).toContainText('테스트 사용자');
    });
});
