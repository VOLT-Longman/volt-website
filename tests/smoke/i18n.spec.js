const { test, expect } = require('@playwright/test');

// 런타임 i18n(KO/EN) 회귀 가드.
async function load(ctx, url = '/') {
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForSelector('#loading-splash', { state: 'hidden' });
    return page;
}

test.describe('i18n (KO/EN)', () => {
    test('한국어 브라우저: 기본 한국어 유지(회귀 없음)', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await load(ctx);
        await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
        await expect(page.locator('.nav-links a[href="#about"]')).toHaveText('소개');
        await expect(page.locator('.hero .subtitle')).toHaveText('물류와 무역을 위해 여행하는 항해자');
        await ctx.close();
    });

    test('비한국어 브라우저: 기본 영어 노출', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await load(ctx);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('.nav-links a[href="#about"]')).toHaveText('About');
        await expect(page.locator('.hero .btn-primary')).toHaveText('Join our Discord');
        await ctx.close();
    });

    test('EN 토글 동작 + 새로고침 후 언어 유지', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await load(ctx);
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('.nav-links a[href="#about"]')).toHaveText('About');

        await page.reload();
        await page.waitForSelector('#loading-splash', { state: 'hidden' });
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('.nav-links a[href="#about"]')).toHaveText('About');
        await ctx.close();
    });

    test('해시 라우팅 + 언어 토글 충돌 없음 + 동적 About 카드 번역', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await load(ctx, '/#about');
        await expect(page.locator('#about')).toHaveClass(/active/);
        await expect(page.locator('#about-grid')).toContainText('물류 & 무역');

        await page.locator('.nav-lang [data-set-lang="en"]').click();
        // 섹션 유지 + 동적 부서 카드가 영어로 재렌더
        await expect(page.locator('#about')).toHaveClass(/active/);
        await expect(page.locator('#about-grid')).toContainText('Logistics & Trade');
        await ctx.close();
    });
});
