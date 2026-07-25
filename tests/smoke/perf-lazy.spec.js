const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// P2-3 성능 lazy init: 무거운 섹션(함선DB·갤러리)은 첫 진입 전까지 렌더하지 않는다.
test.describe('lazy init (무거운 섹션 지연 렌더)', () => {
    test('함선DB: home 로드 시 미렌더 → #ships 진입 시 렌더', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        // 홈 로드 직후에는 함선 그리드가 비어 있어야 한다(지연).
        await expect(page.locator('#ships-grid .ship-card')).toHaveCount(0);

        // 함선DB 섹션으로 이동하면 그리드가 채워진다.
        await page.locator('.nav-links a[href="#ships"]').click();
        await expect(page.locator('#ships')).toHaveClass(/active/);
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
        const count = await page.locator('#ships-grid .ship-card').count();
        expect(count).toBeGreaterThan(10);
    });

    test('갤러리: home 로드 시 미렌더 → #gallery 진입 시 렌더', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        await expect(page.locator('#gallery-grid').locator(':scope > *')).toHaveCount(0);

        await gotoSection(page, '#gallery');
        await expect(page.locator('#gallery')).toHaveClass(/active/);
        // 갤러리 콘텐츠(카드 또는 "준비 중" 안내)가 채워진다.
        await expect(page.locator('#gallery-grid').locator(':scope > *').first()).toBeVisible();
    });

    test('딥링크 #ships: 첫 화면부터 함선 그리드 렌더', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships')).toHaveClass(/active/);
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
    });

    // ShipDB 2.0 live 레이어(~500KB)는 함선DB 진입 전까지 로드하지 않는다.
    test('live 레이어 lazy: home 로드 시 미로드 → #ships 진입 시 로드 + 모달 표시', async ({ page }) => {
        const liveRequests = [];
        page.on('request', (request) => {
            if (!/ship-live-stats\.js|ship-market\.js/.test(request.url())) return;
            // 미션 컨트롤 콘솔(F)의 헤더 Range 조회(~400B)는 전체 레이어 로드가 아니다
            if (request.headers().range) return;
            liveRequests.push(request.url());
        });
        await mockApi(page);
        await gotoSection(page, '');
        expect(liveRequests).toHaveLength(0);

        await page.locator('.nav-links a[href="#ships"]').click();
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
        await expect.poll(() => liveRequests.length).toBe(2);

        // 로드 완료 후 모달에서 live 섹션이 정상 표시된다
        await page.locator('#ship-search').fill('Asgard');
        await page.locator('#ships-grid .ship-card').first().click();
        await expect(page.locator('#global-modal .ship-live-summary')).toBeVisible();
    });

    test('언어 토글: #ships 미방문 시에도 오류 없음, 방문 후 재렌더', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await mockApi(page);
        await gotoSection(page, '');
        // 함선DB 미방문 상태에서 언어 토글 → 그리드는 여전히 미렌더
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(page.locator('#ships-grid .ship-card')).toHaveCount(0);
        // 이제 방문하면 렌더된다
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
        expect(errors).toEqual([]);
        await ctx.close();
    });
});
