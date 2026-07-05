const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// P2-4 CSS 정리 회귀 가드: 통합한 .gallery-empty 계산값 유지 + 주요 섹션 모바일 overflow 없음.
test.describe('CSS 회귀 (P2-4)', () => {
    test('.gallery-empty 통합: 최종 계산값 유지', async ({ page }) => {
        await mockApi(page);
        await page.route('**/api/gallery', (route) => route.fulfill({ json: { items: [] } }));
        await gotoSection(page, '#gallery');

        const empty = page.locator('.gallery-empty');
        await expect(empty).toBeVisible();
        const styles = await empty.evaluate((el) => {
            const s = getComputedStyle(el);
            return { display: s.display, padding: s.padding, textAlign: s.textAlign, justifyItems: s.justifyItems };
        });
        // last-wins 통합 결과: display grid / padding 64px 24px / center 정렬.
        expect(styles.display).toBe('grid');
        expect(styles.padding).toBe('64px 24px');
        expect(styles.textAlign).toBe('center');
        expect(styles.justifyItems).toBe('center');
    });

    for (const section of ['trade-planner', 'ships', 'notices', 'leadership', 'gallery']) {
        test(`모바일 390px: #${section} 가로 overflow 없음`, async ({ browser }) => {
            const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
            const page = await ctx.newPage();
            await mockApi(page);
            await gotoSection(page, `#${section}`);
            await page.waitForTimeout(150);
            const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            expect(noOverflow, `#${section} 가로 스크롤 발생`).toBe(true);
            await ctx.close();
        });
    }
});
