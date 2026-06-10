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

    test('로그인(모킹): 마이페이지 프로필 렌더', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await gotoSection(page, '#mypage');

        const content = page.locator('#mypage-content');
        await expect(content).toContainText('프로필');
        await expect(content).toContainText('테스트 사용자');
    });
});
