const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// ShipDB 재작성 2단계 — canonical 내부 로더 + 비공개 플래그.
// 핵심 계약: 기본 OFF에서 라이브는 완전히 불변(로드/렌더 없음). ON은 테스트 경로에서만.
test.describe('ShipDB canonical 로더 (듀얼리드, 기본 OFF)', () => {
    test('OFF 기본: 플래그 비활성 + load() null + canonical fetch 0', async ({ page }) => {
        const canonicalRequests = [];
        page.on('request', (r) => { if (r.url().includes('/data/canonical/')) canonicalRequests.push(r.url()); });
        const errors = trackConsoleErrors(page);
        await mockApi(page);
        await gotoSection(page, '#ships');
        expect(await page.evaluate(() => window.VOLT_SHIPDB_CANONICAL.isEnabled())).toBe(false);
        const result = await page.evaluate(() => window.VOLT_SHIPDB_CANONICAL.load());
        expect(result).toBeNull();
        expect(await page.evaluate(() => window.VOLT_SHIPDB_CANONICAL.state)).toBe('idle');
        expect(canonicalRequests).toHaveLength(0);
        expect(errors).toEqual([]);
    });

    test('OFF 기본: 함선DB 렌더는 레거시 그대로(로더 도입 무영향)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        expect(await page.locator('.ship-card').count()).toBeGreaterThan(0);
    });

    test('ON 테스트 훅: canonical 6계층 로드(219 canonical · 30 rsi-official)', async ({ page }) => {
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
        })));
        expect(store).toEqual({ canonical: 219, localization: 219, operational: 219, aliases: 7, rsiOfficial: 30, rsiLocalization: 30 });
    });

    test('ON 테스트 훅: 데이터 로드돼도 함선DB UI는 불변(소비처 미배선)', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        // 이 커밋 범위: 로더만 존재, 어떤 소비처도 canonical을 읽지 않음 → 카드 렌더는 레거시와 동일
        expect(await page.locator('.ship-card').count()).toBeGreaterThan(0);
    });
});
