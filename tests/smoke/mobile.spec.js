const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 모바일 공통 폴리시(Step 1) 회귀 가드. 데스크톱 회귀는 기존 스모크가 커버.
test.describe('모바일 공통 폴리시 (390px)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('섹션 상단 여백 축소 + 필터 칩 가로 스크롤', async ({ page }) => {
        await mockApi(page);

        // 섹션 상하 패딩 축소(100px → 56px)로 콘텐츠 시작 위치를 위로
        await gotoSection(page, '#ships');
        const padTop = await page.locator('#ships').evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
        expect(padTop).toBeLessThan(70);

        // 필터 칩 줄: 줄바꿈(wrap) 대신 가로 스크롤(nowrap + overflow-x)
        await gotoSection(page, '#notices');
        const filters = page.locator('#notice-filters');
        await expect(filters).toBeVisible();
        expect(await filters.evaluate((el) => getComputedStyle(el).flexWrap)).toBe('nowrap');
        expect(['auto', 'scroll']).toContain(await filters.evaluate((el) => getComputedStyle(el).overflowX));
    });
});
