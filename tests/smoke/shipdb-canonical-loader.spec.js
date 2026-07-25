const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// ShipDB 재작성 2단계 — canonical 내부 로더 + 비공개 플래그.
// 핵심 계약: 기본 OFF에서 라이브는 완전히 불변(로드/렌더 없음). ON은 테스트 경로에서만.
test.describe('ShipDB canonical 로더 (듀얼리드, 기본 OFF)', () => {
    test('OFF 기본: 함선DB 렌더는 레거시 그대로(로더 도입 무영향)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        expect(await page.locator('.ship-card').count()).toBeGreaterThan(0);
    });

    test('ON 테스트 훅: core 8계층은 무결성 검증으로 함께 로드한다', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        expect(await page.evaluate(() => window.VOLT_SHIPDB_CANONICAL.isEnabled())).toBe(true);
        const store = await page.evaluate(() => window.VOLT_SHIPDB_CANONICAL.load().then((s) => ({
            canonical: s.canonical && s.canonical.count,
            localization: s.localization && s.localization.count,
            operational: s.operational && s.operational.count,
            aliases: s.editionAliases && s.editionAliases.count,
            rsiOfficial: s.rsiOfficial && s.rsiOfficial.count,
            rsiLocalization: s.rsiLocalization && s.rsiLocalization.count,
            roleLocalization: s.roleLocalization && s.roleLocalization.summary && s.roleLocalization.summary.total,
            filterTaxonomy: s.filterTaxonomy && s.filterTaxonomy.summary && s.filterTaxonomy.summary.totalRoles,
        })));
        expect(store).toEqual({ canonical: 219, localization: 219, operational: 219, aliases: 7, rsiOfficial: 30, rsiLocalization: 30, roleLocalization: 67, filterTaxonomy: 67 });
        expect(await page.evaluate(() => window.VOLT_SHIPDB_CANONICAL.publicShipIds().size)).toBe(249);
    });

    test('ON 테스트 훅: canonical 로드 후에도 함선 카드가 정상 렌더된다', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        // 소비처 배선 후에도(price·crew·cargo·focus·tags·role 이관) ON 카드 렌더는 안정적이다.
        expect(await page.locator('.ship-card').count()).toBeGreaterThan(0);
    });
});
