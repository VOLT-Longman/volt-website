const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// 카드 액션 버튼(무역 플래너에서 사용 / 비교 추가)의 공통 높이 계약:
// 두 버튼을 .ship-card-actions로 감싸고 --ship-card-action-height(48px)로 고정.
// 버튼 유무·설명 길이·뷰포트와 무관하게 각 버튼 높이는 항상 48px.
async function actionHeights(page) {
    return page.$$eval('.ship-card-actions .ship-compare-toggle, .ship-card-actions .ship-planner-toggle',
        (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
}

async function auditCardHeaders(page) {
    return page.$$eval('#ships-grid .ship-card', (cards) => cards.reduce((problems, card) => {
        const header = card.querySelector('.ship-card-header');
        const title = card.querySelector('.ship-card-title');
        const badges = card.querySelector('.ship-card-badges');
        const favorite = header?.querySelector(':scope > .hangar-toggle-btn');
        if (!header || !title || !badges || !favorite) {
            problems.push(`${card.dataset.shipId}: missing header element`);
            return problems;
        }
        const headerBox = header.getBoundingClientRect();
        const titleBox = title.getBoundingClientRect();
        const badgesBox = badges.getBoundingClientRect();
        const favoriteBox = favorite.getBoundingClientRect();
        const gap = 8;
        if (header.scrollWidth > header.clientWidth + 1) problems.push(`${card.dataset.shipId}: header overflow`);
        if (Math.abs(favoriteBox.right - headerBox.right) > 1) problems.push(`${card.dataset.shipId}: favorite not right-aligned`);
        if (titleBox.right > favoriteBox.left - gap + 1) problems.push(`${card.dataset.shipId}: title overlaps favorite`);
        if (badgesBox.top < Math.max(titleBox.bottom, favoriteBox.bottom) + 5) problems.push(`${card.dataset.shipId}: badges share title row`);
        return problems;
    }, []));
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

    test('데스크톱: 플래너 유무와 설명 길이와 무관하게 비교 버튼 기준선이 같다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card-actions .ship-compare-toggle');
        const firstRow = await page.$$eval('#ships-grid .ship-card', (cards) => {
            const entries = cards.map((card) => {
                const compare = card.querySelector('.ship-compare-toggle');
                const cardBox = card.getBoundingClientRect();
                const compareBox = compare?.getBoundingClientRect();
                return {
                    top: Math.round(cardBox.top),
                    compareBottom: Math.round(compareBox?.bottom || 0),
                    cardBottom: Math.round(cardBox.bottom),
                };
            }).filter((entry) => entry.compareBottom > 0);
            const top = Math.min(...entries.map((entry) => entry.top));
            return entries.filter((entry) => Math.abs(entry.top - top) <= 1);
        });
        expect(firstRow.length).toBeGreaterThanOrEqual(2);
        expect(Math.max(...firstRow.map((entry) => entry.compareBottom)) - Math.min(...firstRow.map((entry) => entry.compareBottom))).toBeLessThanOrEqual(1);
        expect(firstRow.every((entry) => entry.cardBottom - entry.compareBottom >= 16)).toBe(true);
    });

    test('카드 정보: 역할군 태그는 최대 두 개, 메타·격납고가 헤더 안에서 정렬된다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('[data-ship-id="350r"]');
        const result = await page.locator('[data-ship-id="350r"]').evaluate((card) => {
            const header = card.querySelector('.ship-card-header');
            return {
                roleTags: [...card.querySelectorAll('.ship-tag-role')].map((tag) => tag.textContent.trim()),
                roleDetailCount: card.querySelectorAll('.ship-card-role-detail').length,
                statCount: card.querySelectorAll('.ship-stat').length,
                headerFits: header.scrollWidth <= header.clientWidth + 1,
                favoriteInHeader: header.querySelector(':scope > .hangar-toggle-btn') !== null,
            };
        });
        expect(result.roleTags).toContain('레이싱');
        expect(result.roleTags.length).toBeLessThanOrEqual(2);
        expect(result.roleDetailCount).toBe(0);
        expect(result.statCount).toBe(2);
        expect(result.headerFits).toBe(true);
        expect(result.favoriteInHeader).toBe(true);
    });

    test('카드 헤더 전수: 제목·배지·즐겨찾기가 서로 침범하지 않는다', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid .ship-card').count()).toBe(249);
        expect(await auditCardHeaders(page)).toEqual([]);
    });

    test('필터 도구막대와 결과 요약: 높이와 현재 표시 수가 일관된다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        const heights = await page.$$eval('.ships-toolbar > *', (controls) => controls
            .map((control) => Math.round(control.getBoundingClientRect().height)));
        expect(heights).toEqual([48, 48, 48, 48]);
        await expect(page.locator('#ship-results-summary')).toContainText(/\d+척/);
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
        const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        expect(noOverflow).toBe(true);
        const e1 = page.locator('[data-ship-id="e1-spirit"]');
        await e1.scrollIntoViewIfNeeded();
        const mobileHeader = await e1.evaluate((card) => {
            const header = card.querySelector('.ship-card-header');
            const favorite = header.querySelector(':scope > .hangar-toggle-btn');
            const title = header.querySelector('.ship-card-title');
            return {
                headerWidth: header.getBoundingClientRect().width,
                favoriteRight: favorite.getBoundingClientRect().right,
                headerRight: header.getBoundingClientRect().right,
                titleRight: title.getBoundingClientRect().right,
                favoriteLeft: favorite.getBoundingClientRect().left,
            };
        });
        expect(Math.abs(mobileHeader.favoriteRight - mobileHeader.headerRight)).toBeLessThanOrEqual(1);
        expect(mobileHeader.titleRight).toBeLessThanOrEqual(mobileHeader.favoriteLeft - 7);
        await ctx.close();
    });
});
