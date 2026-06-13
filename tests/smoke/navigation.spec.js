const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('네비게이션', () => {
    test('네비: 함선DB/무역플래너/공지 섹션 전환', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');

        await page.locator('.nav-links a[href="#ships"]').click();
        await expect(page.locator('#ships')).toHaveClass(/active/);
        await expect(page.locator('#home')).toBeHidden();

        await page.locator('#nav-trade-toggle').click();
        await page.locator('#nav-trade-menu a[href="#trade-planner"]').click();
        await expect(page.locator('#trade-planner')).toHaveClass(/active/);

        await page.locator('.nav-links a[href="#notices"]').click();
        await expect(page.locator('#notices')).toHaveClass(/active/);
    });

    // js/navigation.js 분리 후에도 라우터 고유 동작(딥링크·active nav·뒤로가기)이 유지되는지.
    test('라우터: 해시 딥링크 진입 + active nav + popstate 복귀', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');

        // 딥링크로 진입하면 해당 섹션이 활성 + 해당 nav 링크가 강조된다.
        await expect(page.locator('#ships')).toHaveClass(/active/);
        await expect(page.locator('.nav-links a[href="#ships"]')).toHaveClass(/nav-active/);

        // 다른 섹션으로 이동 후 뒤로가기(popstate)하면 함선DB로 복귀한다.
        await page.locator('.nav-links a[href="#notices"]').click();
        await expect(page.locator('#notices')).toHaveClass(/active/);
        await page.goBack();
        await expect(page.locator('#ships')).toHaveClass(/active/);
    });

    test('모바일 메뉴: 열고 링크 클릭 시 닫힘 + 섹션 전환', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockApi(page);
        await gotoSection(page, '');

        await page.locator('#hamburger').click();
        await expect(page.locator('#mobileMenu')).toHaveClass(/active/);

        await page.locator('#mobileMenu a[href="#notices"]').click();
        await expect(page.locator('#mobileMenu')).not.toHaveClass(/active/);
        await expect(page.locator('#notices')).toHaveClass(/active/);
    });

    test('공지: 목록 렌더 (API 폴백 포함)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#notices');

        await expect(page.locator('#notices')).toHaveClass(/active/);
        await expect(page.locator('#notices-list .notice-card').first()).toBeVisible();
    });

    test('갤러리: API 항목 렌더 + 빈 응답 폴백', async ({ page }) => {
        await mockApi(page);
        // mockApi보다 나중에 등록한 라우트가 우선 적용된다.
        await page.route(/\/api\/gallery$/, (route) => route.fulfill({
            json: { items: [{ id: 'g1', title: '테스트 스크린샷', date: '2026-06-10', src: '/assets/images/VOLT_logo.webp', thumb: '/assets/images/VOLT_logo.webp' }] },
        }));
        await gotoSection(page, '#gallery');

        await expect(page.locator('#gallery')).toHaveClass(/active/);
        await expect(page.locator('#gallery-grid .gallery-item').first()).toBeVisible();
        await expect(page.locator('#gallery-grid')).toContainText('테스트 스크린샷');
    });

    test('갤러리: 데이터 없으면 준비 중 안내 렌더', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#gallery');

        await expect(page.locator('#gallery-grid .gallery-empty')).toBeVisible();
    });
});
