const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 시네마틱 히어로 배경 (J-2) — 단일 장면과 반응형 원본 계약.
test.describe('시네마틱 히어로 배경', () => {
    test('데스크톱: 단일 대표 장면이 표시되고 지속 애니메이션이 없다', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        const image = page.locator('.hero-cine-image');
        await expect(image).toHaveCount(1);
        await expect.poll(() => image.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
        await expect(image).toHaveAttribute('src', /hercules-hero-1920\.webp$/);
        await expect(image).toHaveCSS('animation-name', 'none');
        await ctx.close();
    });

    test('터치 환경: 작은 원본을 중복 다운로드 없이 사용한다', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        const image = page.locator('.hero-cine-image');
        await expect(image).toHaveCount(1);
        await expect.poll(() => image.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
        expect(await image.evaluate((el) => el.currentSrc)).toContain('hercules-hero-960.webp');
        const downloads = await page.evaluate(() => performance.getEntriesByType('resource')
            .filter(entry => /hercules-hero-\d+\.webp/.test(entry.name)).map(entry => entry.name));
        expect(downloads).toHaveLength(1);
        await ctx.close();
    });

    test('고해상도 화면: 4,000px 원본을 사용하고 사진 링크를 유지한다', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        const image = page.locator('.hero-cine-image');
        await expect.poll(() => image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
        expect(await image.evaluate(el => el.currentSrc)).toContain('hercules-hero-4000.webp');
        await expect(page.locator('.landing-card-photo')).toHaveCount(3);
        await expect(page.locator('.landing-card-photo').first()).toHaveAttribute('loading', 'lazy');
        await expect(page.locator('.footer-image-credit a')).toHaveCount(2);
        await ctx.close();
    });
});
