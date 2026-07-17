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
        await expect(image).toHaveAttribute('src', /hero-01\.webp$/);
        await expect(image).toHaveCSS('animation-name', 'none');
        await ctx.close();
    });

    test('터치 환경: 모바일 원본 하나만 사용한다', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        const image = page.locator('.hero-cine-image');
        await expect(image).toHaveCount(1);
        await expect.poll(() => image.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
        expect(await image.evaluate((el) => el.currentSrc)).toContain('hero-01-m.webp');
        await ctx.close();
    });
});
