const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('인증 게이팅', () => {
    test('비로그인: 마이페이지 진입 시 로그인 CTA 노출(KO)', async ({ page }) => {
        await mockApi(page, { loggedIn: false });
        await gotoSection(page, '#mypage');

        const content = page.locator('#mypage-content');
        await expect(content).toContainText('로그인이 필요합니다');
        await expect(content.locator('a[href="/auth/discord/login"]')).toBeVisible();
    });

    test('비로그인 EN: 로그인 CTA 영어 + 한국어 잔여 없음', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page, { loggedIn: false });
        await gotoSection(page, '#mypage');

        const content = page.locator('#mypage-content');
        await expect(content).toContainText('Sign in required');
        await expect(content.locator('a[href="/auth/discord/login"]')).toContainText('Sign in with Discord');
        // 로그인 전 CTA에는 함선명 등 사용자 데이터가 없으므로 한글이 남으면 안 된다.
        await expect(await content.innerText()).not.toMatch(/[가-힣]/);
        await ctx.close();
    });

    test('로그인 실패(?auth=error): 토스트 안내 + URL 정리', async ({ page }) => {
        await mockApi(page, { loggedIn: false });
        await page.goto('/?auth=error');
        await page.waitForSelector('#loading-splash', { state: 'hidden' });

        await expect(page.locator('#toast')).toContainText('로그인에 실패');
        await expect.poll(() => page.url()).not.toContain('auth=error');
    });

    test('로그인(모킹): 마이페이지 프로필 렌더(KO)', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await gotoSection(page, '#mypage');

        const content = page.locator('#mypage-content');
        await expect(content).toContainText('프로필');
        await expect(content).toContainText('테스트 사용자');
        await expect(content).toContainText('역할');
        await expect(content).toContainText('멤버 상태');
    });

    test('로그인 EN: 프로필 라벨 영어 표기', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page, { loggedIn: true });
        await gotoSection(page, '#mypage');

        const content = page.locator('#mypage-content');
        await expect(content).toContainText('Profile');
        await expect(content).toContainText('Role');
        await expect(content).toContainText('Member status');
        await expect(content).not.toContainText('프로필');
        await ctx.close();
    });
});
