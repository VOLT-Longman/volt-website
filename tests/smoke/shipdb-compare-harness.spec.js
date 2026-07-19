const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');
const canonical = require('../../data/canonical/ships-canonical.json');
const rsiOfficial = require('../../data/canonical/ships-rsi-official.json');
const aliases = require('../../data/canonical/edition-aliases.json');

const PUBLIC_IDS = new Set([
    ...canonical.ships.map((ship) => ship.id),
    ...rsiOfficial.records.map((record) => record.id),
]);
const ALIAS_IDS = new Set(aliases.aliases.map((alias) => alias.aliasId));

async function mainShipIds(page) {
    return page.$$eval('#ships-grid [data-compare-ship-id]', (elements) => elements.map((element) => element.getAttribute('data-compare-ship-id')));
}

test.describe('비교 하네스 (OFF=레거시, ON=공식 공개 집합)', () => {
    test('OFF 강제: 메인 256 그대로 · priceUsd 존재 · 별도 카탈로그 없음', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('#ships-grid .ship-card');
        expect((await mainShipIds(page)).length).toBe(256);
        expect(await page.locator('[data-catalog-chip], #rsi-catalog-grid').count()).toBe(0);
        expect(await page.locator('.ship-card .ship-stat-label', { hasText: 'USD' }).count()).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });

    test('ON: 메인 공개 집합 249척 · 가격 공개 제거 · RSI 상태 표기', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => (await mainShipIds(page)).length).toBe(249);
        expect(new Set(await mainShipIds(page))).toEqual(PUBLIC_IDS);
        expect(await page.locator('#ship-sort option[value^="price"]').count()).toBe(0);
        expect(await page.locator('.ship-rsi-status-concept').count()).toBe(28);
        expect(await page.locator('.ship-rsi-status-flight-ready').count()).toBe(2);
    });

    test('ON 공개 집합은 레거시 256에서 중복 에디션 별칭 7척만 제외한다', async ({ browser }) => {
        const offContext = await browser.newContext();
        const offPage = await offContext.newPage();
        await offPage.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; });
        await mockApi(offPage);
        await gotoSection(offPage, '#ships');
        await offPage.waitForSelector('#ships-grid .ship-card');
        const offIds = new Set(await mainShipIds(offPage));
        await offContext.close();

        const onContext = await browser.newContext();
        const onPage = await onContext.newPage();
        await onPage.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(onPage);
        await gotoSection(onPage, '#ships');
        await expect.poll(async () => (await mainShipIds(onPage)).length).toBe(249);
        const onIds = new Set(await mainShipIds(onPage));
        await onContext.close();

        const removed = [...offIds].filter((id) => !onIds.has(id)).sort();
        const added = [...onIds].filter((id) => !offIds.has(id));
        expect(removed).toEqual([...ALIAS_IDS].sort());
        expect(added).toEqual([]);
    });
});
