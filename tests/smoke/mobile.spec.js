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

    // Step 3: 함선DB 모바일 — 역할 필터 칩 가로 스크롤 + 상세 모달 2열·CTA 풀폭.
    test('함선DB: 역할 칩 가로 스크롤 + 상세 모달 2열 스펙·세로 CTA', async ({ page }) => {
        // 역할 칩 가로 스크롤은 레거시(focus/tags 칩) 모바일 레이아웃 — OFF 강제로 검증.
        // 3.5-A 실전 ON의 콤보박스 모바일 동작은 shipdb-role-filter-ux(ON 모바일)가 커버.
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; });
        await mockApi(page);
        await gotoSection(page, '#ships');

        // 역할 태그 필터: 줄바꿈 대신 가로 스크롤
        const tagFilters = page.locator('#ship-tag-filters');
        await expect(tagFilters).toBeVisible();
        expect(await tagFilters.evaluate((el) => getComputedStyle(el).flexWrap)).toBe('nowrap');
        expect(['auto', 'scroll']).toContain(await tagFilters.evaluate((el) => getComputedStyle(el).overflowX));

        // 상세 모달 열기 (A-6 Live 요약도 같은 grid 클래스를 쓰므로 기본 스펙 그리드는 first로 지정)
        await page.locator('.ship-card').first().click();
        const modal = page.locator('.ship-modal-grid').first();
        await expect(modal).toBeVisible();

        // 스펙 그리드는 좁은 화면에서도 2열(세로 과밀 방지)
        const cols = await modal.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        expect(cols).toBe(2);

        // CTA는 세로 스택 + 풀폭(터치 일관성)
        const actions = page.locator('.ship-modal-actions');
        expect(await actions.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('column');
        const firstBtn = actions.locator('.btn').first();
        const actionsBox = await actions.boundingBox();
        const btnBox = await firstBtn.boundingBox();
        expect(btnBox.width).toBeGreaterThan(actionsBox.width - 4);
    });
});
