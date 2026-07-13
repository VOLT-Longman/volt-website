const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

async function trackStarfieldDraws(page) {
    await page.addInitScript(() => {
        window.__voltStarfieldDrawCount = 0;
        const original = CanvasRenderingContext2D.prototype.clearRect;
        CanvasRenderingContext2D.prototype.clearRect = function (...args) {
            if (this.canvas?.id === 'hero-starfield') window.__voltStarfieldDrawCount += 1;
            return original.apply(this, args);
        };
    });
}

test.describe('랜딩 스타필드 성능', () => {
    test('터치 환경에서는 스타필드를 정적으로 한 번만 렌더한다', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
        const page = await ctx.newPage();
        await trackStarfieldDraws(page);
        await mockApi(page);
        await gotoSection(page, '');
        await page.waitForTimeout(250);
        expect(await page.evaluate(() => window.__voltStarfieldDrawCount)).toBeLessThanOrEqual(2);
        await ctx.close();
    });

    test('마우스 환경에서는 스타필드 애니메이션을 유지한다', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false });
        const page = await ctx.newPage();
        await trackStarfieldDraws(page);
        await mockApi(page);
        await gotoSection(page, '');
        await page.waitForTimeout(250);
        expect(await page.evaluate(() => window.__voltStarfieldDrawCount)).toBeGreaterThan(2);
        await ctx.close();
    });
});
