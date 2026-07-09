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

    test('언어 전환 토글: KO/EN active 상태 갱신 (F-2)', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');

        const ko = page.locator('.nav-lang [data-set-lang="ko"]');
        const en = page.locator('.nav-lang [data-set-lang="en"]');

        await expect(ko).toHaveClass(/lang-active/);
        await expect(ko).toHaveAttribute('aria-pressed', 'true');
        await expect(en).toHaveAttribute('aria-pressed', 'false');

        await en.click();

        await expect(en).toHaveClass(/lang-active/);
        await expect(en).toHaveAttribute('aria-pressed', 'true');
        await expect(ko).toHaveAttribute('aria-pressed', 'false');
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
