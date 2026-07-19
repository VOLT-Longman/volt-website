const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// ShipDB 재작성 2단계 — cargo 단독 원자 이관.
// cargo는 Erkul live를 기본으로 하되, RSI 공식 사양으로 승인된 Intrepid 8 SCU 예외를 적용한다.
// 검증: ON 카드 화물이 canonical cargoScu에서 정확 포맷(콤마 유지 "1,326 SCU")으로 렌더 =
//       OFF(레거시)와 동일. 표시가 깨지지 않고 canonical 경로가 올바른 포맷을 낸다.
function cargoStat(page, id) {
    const card = page.locator('.ship-card', { has: page.locator(`[data-compare-ship-id="${id}"]`) });
    return card.locator('.ship-stat', { hasText: '화물' }).locator('.ship-stat-value');
}

test.describe('cargo 원자 이관 (OFF=레거시, ON=Erkul 기본값+RSI 공식 보정)', () => {
    test('OFF 강제(되돌림): idris-m 카드 화물 = "1,326 SCU"(콤마)', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; }); // 3.5-A 기본 ON → OFF 되돌림 검증
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        await expect(cargoStat(page, 'idris-m')).toHaveText('1,326 SCU');
        expect(errors).toEqual([]);
    });

    test('ON: idris-m 카드 화물 = "1,326 SCU"(canonical cargoScu, 콤마 포맷 유지)', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
        await expect(cargoStat(page, 'idris-m')).toHaveText('1,326 SCU');
    });

    test('Intrepid: OFF 0 SCU, ON RSI 공식 사양 8 SCU', async ({ browser }) => {
        const offContext = await browser.newContext();
        const offPage = await offContext.newPage();
        await offPage.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; });
        await mockApi(offPage);
        await gotoSection(offPage, '#ships');
        await expect(cargoStat(offPage, 'intrepid')).toHaveText('0 SCU');

        const onContext = await browser.newContext();
        const onPage = await onContext.newPage();
        await onPage.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(onPage);
        await gotoSection(onPage, '#ships');
        await expect.poll(async () => onPage.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
        await expect(cargoStat(onPage, 'intrepid')).toHaveText('8 SCU');
        await offContext.close();
        await onContext.close();
    });
});
