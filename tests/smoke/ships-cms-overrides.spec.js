const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 함선 CMS 확장(0010): hidden=true 소프트 삭제 + nameKo 한글명 오버라이드가
// 공개 함선DB에 반영되는지 검증. /api/ship-overrides를 테스트별로 덮어써 주입한다.
test.describe('함선 CMS 오버라이드 (숨김 + 한글명)', () => {
    async function withShipOverrides(page, items) {
        await mockApi(page);
        // mockApi의 기본 ship-overrides 라우트를 나중에 등록해 우선 적용한다(Playwright last-wins).
        await page.route('**/api/ship-overrides', (route) => route.fulfill({ json: { items } }));
    }

    test('hidden=true 함선은 공개 그리드에서 제외된다(소프트 삭제)', async ({ page }) => {
        await withShipOverrides(page, [{ shipId: 'ares-inferno', hidden: true }]);
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
        // 오버라이드 반영 후 재렌더되면 Ares Inferno 카드는 사라진다.
        await expect(page.locator('#ships-grid .ship-card', { hasText: 'Ares Inferno' })).toHaveCount(0);
    });

    test('nameKo 오버라이드가 KO 표시명으로 우선 적용된다', async ({ page }) => {
        await withShipOverrides(page, [{ shipId: '100i', nameKo: '테스트 한글 함선명' }]);
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships-grid .ship-card', { hasText: '테스트 한글 함선명' })).toHaveCount(1);
    });

    test('오버라이드 없으면 기존 그리드 그대로(회귀 가드)', async ({ page }) => {
        await withShipOverrides(page, []);
        await gotoSection(page, '#ships');
        const count = await page.locator('#ships-grid .ship-card').count();
        expect(count).toBeGreaterThan(100);
    });
});
