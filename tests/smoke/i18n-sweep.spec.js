const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// P2-5 최종 EN 스윕: 동적 렌더 문구(필터/검색/테마/모달 크롬)의 KO/EN 회귀 가드.
test.describe('i18n 스윕 (동적 UI 문구)', () => {
    test('공지 필터 "전체" → EN "All"', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '#notices');
        await expect(page.locator('#notice-filters .notice-filter-btn').first()).toHaveText('All');
        await ctx.close();
    });

    test('공지 필터 KO 회귀 "전체"', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#notices');
        await expect(page.locator('#notice-filters .notice-filter-btn').first()).toHaveText('전체');
    });

    test('검색: 결과 없음 EN "No results."', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        await page.locator('#search-toggle').click();
        const input = page.locator('#global-search-input');
        await input.fill('zzqx-nomatch-xyz');
        await expect(page.locator('#search-results .search-empty')).toHaveText('No results.');
        await ctx.close();
    });

    test('검색: 카테고리 라벨 EN(함선 → Ship)', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        await page.locator('#search-toggle').click();
        await page.locator('#global-search-input').fill('Hull');
        await expect(page.locator('#search-results .search-result-type', { hasText: 'Ship' }).first()).toBeVisible();
        // 카테고리 라벨 자체는 KO('함선')로 남지 않아야 한다(본문 데이터는 별개).
        await expect(page.locator('#search-results .search-result-type', { hasText: '함선' })).toHaveCount(0);
        await ctx.close();
    });

    test('테마 토글 aria-label: 언어 토글 후 EN 재렌더', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', /모드로 전환/);
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', /Switch to (dark|light) mode/);
        await ctx.close();
    });

    test('추천 무역 함선 버튼 EN(Ship details / Use in trade planner)', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '#trade-planner');
        const grid = page.locator('#recommended-trade-grid');
        await expect(grid).toContainText('Ship details');
        await expect(grid).toContainText('Use in trade planner');
        await ctx.close();
    });
});
