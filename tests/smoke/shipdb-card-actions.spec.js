const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// 카드 액션 버튼(무역 플래너에서 사용 / 비교 추가)의 공통 높이 계약:
// 두 버튼을 .ship-card-actions로 감싸고 --ship-card-action-height(48px)로 고정.
// 버튼 유무·설명 길이·뷰포트와 무관하게 각 버튼 높이는 항상 48px.
async function actionHeights(page) {
    return page.$$eval('.ship-card-actions .ship-compare-toggle, .ship-card-actions .ship-planner-toggle',
        (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
}

test.describe('카드 액션 버튼 높이 계약 (48px)', () => {
    test('데스크톱: 모든 플래너·비교 버튼 높이 = 48px', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card-actions .ship-compare-toggle');
        const heights = await actionHeights(page);
        expect(heights.length).toBeGreaterThan(0);
        expect(heights.every((h) => h === 48)).toBe(true);
        // 두 버튼이 함께 있는 카드에서 플래너=비교 높이 동일
        const pair = await page.$$eval('.ship-card-actions', (conts) => {
            for (const c of conts) {
                const p = c.querySelector('.ship-planner-toggle');
                const cmp = c.querySelector('.ship-compare-toggle');
                if (p && cmp) return [Math.round(p.getBoundingClientRect().height), Math.round(cmp.getBoundingClientRect().height)];
            }
            return null;
        });
        expect(pair).not.toBeNull();
        expect(pair[0]).toBe(48);
        expect(pair[1]).toBe(48);
        expect(errors).toEqual([]);
    });

    test('모바일 390px: 버튼 높이 = 48px, 줄바꿈으로 늘어나지 않음', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card-actions .ship-compare-toggle');
        const heights = await actionHeights(page);
        expect(heights.length).toBeGreaterThan(0);
        expect(heights.every((h) => h === 48)).toBe(true);
        await ctx.close();
    });
});
