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

    test('같은 화면에서 숨김이 해제되면 canonical 함선이 다시 나타난다', async ({ page }) => {
        await mockApi(page);
        let hidden = true;
        await page.route('**/api/ship-overrides', (route) => route.fulfill({ json: { items: hidden ? [{ shipId: '100i', hidden: true }] : [] } }));
        // 실패 안내의 재시도로 모든 컬렉션을 같은 페이지에서 다시 가져온다.
        await page.route('**/api/timeline', (route) => route.fulfill({ status: 503, json: { items: [], warning: 'unavailable' } }));
        await page.addInitScript(() => {
            const originalFetch = window.fetch;
            window.__shipCacheModes = [];
            window.fetch = (input, options = {}) => {
                if (String(input).endsWith('/api/ship-overrides')) window.__shipCacheModes.push(options.cache);
                return originalFetch(input, options);
            };
        });
        await gotoSection(page, '#ships');
        await expect.poll(() => page.locator('#ships-grid .ship-card').count()).toBeGreaterThan(100);
        await expect(page.locator('#ships-grid [data-ship-id="100i"]')).toHaveCount(0);
        await expect(page.locator('#cms-load-status')).toBeVisible();
        hidden = false;
        await page.locator('#cms-load-status button').click();
        await expect(page.locator('#ships-grid [data-ship-id="100i"]')).toHaveCount(1);
        await expect.poll(() => page.evaluate(() => window.__shipCacheModes)).toEqual(['default', 'reload']);
    });
});
