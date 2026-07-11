const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// G3: 전수 감사에서 발견된 상호작용 흐름 회귀망 공백을 메운다 —
// RSVP 제출, 갤러리 라이트박스, 검색 결과 클릭 내비게이션, 모바일 하위 메뉴.
test.describe('상호작용 흐름 (G3)', () => {
    test('RSVP 제출: 버튼 클릭 → POST → 집계·선택 상태 갱신', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        // mockApi의 rsvp 라우트를 덮어써(나중 등록 우선) GET/POST 집계를 구분 반환
        await page.route(/\/api\/events\/[^/]+\/rsvp$/, (route) => {
            if (route.request().method() === 'POST') {
                return route.fulfill({ json: { counts: { 참가: 3, 대기: 1, 불참: 0 } } });
            }
            return route.fulfill({ json: { counts: { 참가: 2, 대기: 1, 불참: 0 } } });
        });
        await gotoSection(page, '#schedule');

        const control = page.locator('[data-rsvp-event-id]').first();
        await expect(control.locator('[data-rsvp-summary]')).toContainText('참가 2명');

        await control.locator('[data-rsvp-status="참가"]').click();
        await expect(control.locator('[data-rsvp-summary]')).toContainText('참가 3명');
        await expect(control.locator('[data-rsvp-status="참가"]')).toHaveClass(/is-selected/);
    });

    test('RSVP 비로그인: 버튼이 auth 게이트로 비활성', async ({ page }) => {
        await mockApi(page); // loggedIn: false
        await gotoSection(page, '#schedule');
        const button = page.locator('[data-rsvp-status="참가"]').first();
        await expect(button).toBeDisabled();
        await expect(button).toHaveClass(/is-auth-locked/);
    });

    test('갤러리 라이트박스: 항목 클릭 → 모달 이미지 → Escape 닫기', async ({ page }) => {
        await mockApi(page);
        await page.route(/\/api\/gallery$/, (route) => route.fulfill({
            json: { items: [{ id: 'g1', title: '테스트 스크린샷', date: '2026-06-10', src: '/assets/images/VOLT_logo.webp', thumb: '/assets/images/VOLT_logo.webp' }] },
        }));
        await gotoSection(page, '#gallery');

        await page.locator('#gallery-grid .gallery-item').first().click();
        await expect(page.locator('#global-modal')).toHaveClass(/active/);
        await expect(page.locator('#global-modal .gallery-lightbox-image')).toBeVisible();
        await expect(page.locator('#global-modal')).toContainText('테스트 스크린샷');

        await page.keyboard.press('Escape');
        await expect(page.locator('#global-modal')).not.toHaveClass(/active/);
    });

    test('검색: 함선 결과 클릭 → 함선DB 전환 + 상세 모달 오픈', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');

        await page.locator('#search-toggle').click();
        await page.locator('#global-search-input').fill('Asgard');
        await page.locator('.search-result[data-search-section="ships"]').first().click();

        await expect(page.locator('#ships')).toHaveClass(/active/);
        await expect(page.locator('#global-modal')).toHaveClass(/active/);
        await expect(page.locator('#global-modal')).toContainText('Asgard');
    });

    test('모바일 메뉴: 무역 그룹 하위 항목 → 무역플래너 이동 + 메뉴 닫힘', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');

        await page.locator('#hamburger').click();
        await expect(page.locator('#mobileMenu')).toHaveClass(/active/);
        await page.locator('#mobileMenu a[href="#trade-planner"]').click();

        await expect(page.locator('#trade-planner')).toHaveClass(/active/);
        // 닫힘은 active 클래스 제거로 판정 (오프스크린 전환이라 visibility는 유지됨)
        await expect(page.locator('#mobileMenu')).not.toHaveClass(/active/);
        await ctx.close();
    });
});
