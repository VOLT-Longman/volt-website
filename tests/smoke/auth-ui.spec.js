const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 헤더/모바일 auth UI(js/auth-ui.js) i18n + 상태 렌더 회귀 가드.
test.describe('헤더 인증 UI (KO/EN)', () => {
    test('KO 비로그인: 데스크톱/모바일 로그인 버튼 한국어', async ({ page }) => {
        await mockApi(page, { loggedIn: false });
        await gotoSection(page, '');
        await expect(page.locator('#volt-auth-desktop')).toContainText('Discord 로그인');
        await expect(page.locator('#volt-auth-mobile')).toContainText('Discord 로그인');
    });

    test('EN 비로그인: 로그인 버튼 영어', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page, { loggedIn: false });
        await gotoSection(page, '');
        await expect(page.locator('#volt-auth-desktop')).toContainText('Sign in with Discord');
        await expect(page.locator('#volt-auth-desktop .volt-auth-login')).toHaveAttribute('aria-label', 'Sign in');
        await ctx.close();
    });

    test('KO 로그인(mock): 계정 이름 + 로그아웃 표시', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await gotoSection(page, '');
        const desktop = page.locator('#volt-auth-desktop');
        await expect(desktop).toContainText('테스트 사용자');
        await expect(desktop.locator('.volt-auth-logout')).toHaveText('로그아웃');
        await expect(desktop.locator('.volt-auth-logout')).toHaveAttribute('href', '/auth/logout');
        await expect(page.locator('#volt-auth-mobile')).toContainText('테스트 사용자');
    });

    test('EN 로그인(mock): 로그아웃/계정 문구 영어', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page, { loggedIn: true });
        await gotoSection(page, '');
        const desktop = page.locator('#volt-auth-desktop');
        await expect(desktop.locator('.volt-auth-logout')).toHaveText('Sign out');
        await expect(desktop.locator('.volt-auth-user')).toHaveAttribute('aria-label', /Signed in as/);
        await ctx.close();
    });

    test('언어 토글: 로그인 상태 auth UI 즉시 재렌더', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await ctx.newPage();
        await mockApi(page, { loggedIn: true });
        await gotoSection(page, '');
        const desktop = page.locator('#volt-auth-desktop');
        await expect(desktop.locator('.volt-auth-logout')).toHaveText('로그아웃');
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(desktop.locator('.volt-auth-logout')).toHaveText('Sign out');
        await ctx.close();
    });

    test('/auth/me 실패: 재시도 문구 i18n(KO/EN)', async ({ page }) => {
        await mockApi(page, { loggedIn: false });
        await page.route('**/auth/me', (route) => route.fulfill({ status: 500, json: {} }));
        await gotoSection(page, '');
        await expect(page.locator('#volt-auth-desktop')).toContainText('인증 재시도');
        await expect(page.locator('#volt-auth-desktop .volt-auth-warning')).toHaveCount(1);
    });

    test('EN /auth/me 실패: 재시도 문구 영어', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page, { loggedIn: false });
        await page.route('**/auth/me', (route) => route.fulfill({ status: 500, json: {} }));
        await gotoSection(page, '');
        await expect(page.locator('#volt-auth-desktop')).toContainText('Retry sign-in');
        await ctx.close();
    });
});
