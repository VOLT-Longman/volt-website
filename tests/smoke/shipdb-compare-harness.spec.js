const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');
const canonical = require('../../data/canonical/ships-canonical.json');
const rsiOfficial = require('../../data/canonical/ships-rsi-official.json');
const aliases = require('../../data/canonical/edition-aliases.json');

// 재작성 2단계 비교 하네스 — 이후 필드 이관의 안전장치(PM).
//  OFF: 기존 API·DOM·주요 ShipDB 화면 = 기준선.
//  ON: 허용된 차이만 — (1) RSI 공식 카탈로그 탭/카드 추가, (2) priceUsd 공개 표시·정렬·검색 제거,
//      (3) crew·cargo·role=Erkul canonical, (4) 필터=canonical role 칩(focus/tags 대체)·purpose 숨김.
//      그 밖(카드 수·비교/플래너/AI 대상)은 live canonical 219와 동일.
const CANONICAL_IDS = canonical.ships.map((s) => s.id).sort();
const EXCLUDED_37 = new Set([...rsiOfficial.records.map((r) => r.id), ...aliases.aliases.map((a) => a.aliasId)]);

async function mainShipIds(page) {
    return page.$$eval('#ships-grid [data-compare-ship-id]', (els) => els.map((e) => e.getAttribute('data-compare-ship-id')));
}

test.describe('비교 하네스 (OFF=기준선, ON=허용된 차이만)', () => {
    test('OFF: 메인 256 그대로 · priceUsd 존재 · 카탈로그 없음', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('#ships-grid .ship-card');
        const ids = await mainShipIds(page);
        expect(ids.length).toBe(256);
        expect(await page.locator('[data-catalog-chip]').count()).toBe(0);
        expect(await page.locator('.ship-card .ship-stat-label', { hasText: 'USD' }).count()).toBeGreaterThan(0);
        expect(await page.locator('#ship-sort option[value="price-asc"]').count()).toBe(1);
        expect(errors).toEqual([]);
    });

    test('ON: 메인 219(=canonical) · 카탈로그 30 · priceUsd 제거, 그 외 동일', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        // canonical 로드 후 219로 재렌더될 때까지 대기
        await expect.poll(async () => (await mainShipIds(page)).length).toBe(219);
        const onIds = (await mainShipIds(page)).sort();
        // 메인 = canonical 219 정확 일치
        expect(onIds).toEqual(CANONICAL_IDS);
        // 카탈로그 탭 30
        await page.locator('[data-catalog-chip]').click();
        expect(await page.locator('.rsi-catalog-card').count()).toBe(30);
        // priceUsd 제거
        expect(await page.locator('#ship-sort option[value^="price"]').count()).toBe(0);
    });

    test('허용된 차이만: OFF∖ON = 컨셉30+별칭7(37), ON에 신규 추가 0', async ({ browser }) => {
        const offCtx = await browser.newContext();
        const offPage = await offCtx.newPage();
        await mockApi(offPage);
        await gotoSection(offPage, '#ships');
        await offPage.waitForSelector('#ships-grid .ship-card');
        const offIds = new Set(await mainShipIds(offPage));
        await offCtx.close();

        const onCtx = await browser.newContext();
        const onPage = await onCtx.newPage();
        await onPage.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(onPage);
        await gotoSection(onPage, '#ships');
        await expect.poll(async () => (await mainShipIds(onPage)).length).toBe(219);
        const onIds = new Set(await mainShipIds(onPage));
        await onCtx.close();

        // ON에 OFF에 없던 함선이 추가되지 않았다(허용 외 신규 0)
        const added = [...onIds].filter((id) => !offIds.has(id));
        expect(added).toEqual([]);
        // OFF에서 빠진 함선 = 정확히 제외 37(컨셉30+별칭7)
        const removed = [...offIds].filter((id) => !onIds.has(id)).sort();
        expect(removed.length).toBe(37);
        expect(removed.every((id) => EXCLUDED_37.has(id))).toBe(true);
    });
});
