const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 시네마틱 히어로 배경 (J-1) — 환경별 모션 계약.
// H-1 정신 유지: 터치/reduced-motion 환경에서 체감 없는 상시 GPU 비용(켄 번즈)을 켜지 않는다.
test.describe('시네마틱 히어로 배경', () => {
    test('마우스 환경: 첫 슬라이드 표시(computed opacity 1) + 켄 번즈 활성', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        const slide = page.locator('.hero-cine-slide.is-active').first();
        // 리빌류 회귀 가드: 보임 판정이 아니라 computed opacity로 단언 (f518c4a 교훈)
        await expect.poll(() => slide.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
        await expect(page.locator('.hero-cine.kb')).toHaveCount(1);
        const animation = await slide.evaluate((el) => getComputedStyle(el).animationName);
        expect(animation).toContain('heroKenBurns');
        await ctx.close();
    });

    test('터치 환경: 켄 번즈(.kb) 비활성, 크로스페이드 슬라이드만 유지', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        const slide = page.locator('.hero-cine-slide.is-active').first();
        await expect.poll(() => slide.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
        await expect(page.locator('.hero-cine.kb')).toHaveCount(0);
        // 모바일 변형(-m.webp)을 로드해야 한다
        expect(await slide.getAttribute('src')).toContain('-m.webp');
        await ctx.close();
    });

    test('reduced-motion: 첫 슬라이드 1장 정적 유지 (추가 슬라이드·켄 번즈 없음)', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        const slide = page.locator('.hero-cine-slide');
        await expect.poll(() => slide.first().evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
        // 지연 로드 창(4초 timeout)이 지나도 슬라이드가 늘지 않아야 한다
        await page.waitForTimeout(4500);
        await expect(slide).toHaveCount(1);
        await expect(page.locator('.hero-cine.kb')).toHaveCount(0);
        await ctx.close();
    });
});
