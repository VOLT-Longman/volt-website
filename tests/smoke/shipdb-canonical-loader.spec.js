const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// ShipDB canonical 로더 — canonical이 유일 경로다(R2에서 듀얼리드 플래그 제거).
// 핵심 계약: core 계층은 manifest SHA-256 검증을 통과해야만 함께 적용된다.
test.describe('ShipDB canonical 로더', () => {
    test('함선DB가 canonical 데이터로 렌더된다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        expect(await page.locator('.ship-card').count()).toBeGreaterThan(0);
    });

    test('core 8계층은 무결성 검증으로 함께 로드한다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
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

    test('canonical 로드 후에도 함선 카드가 정상 렌더된다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        // 소비처 배선(price·crew·cargo·focus·tags·role 이관) 후에도 카드 렌더는 안정적이다.
        expect(await page.locator('.ship-card').count()).toBeGreaterThan(0);
    });
});
