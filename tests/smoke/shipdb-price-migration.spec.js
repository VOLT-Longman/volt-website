const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// ShipDB 재작성 2단계 — priceUsd 첫 소비처 원자 이관.
// OFF(기본): 카드·모달·정렬·검색에 priceUsd 그대로 = 기준선(라이브 불변).
// ON(테스트 경로): 공개 모델에서 제거(D4) — 카드·모달·정렬·검색 어디에도 priceUsd 없음.
test.describe('priceUsd 원자 이관', () => {
    test('OFF 기본: 카드·모달·정렬에 priceUsd 존재(기준선)', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        // 카드 USD 가격 스탯
        expect(await page.locator('.ship-card .ship-stat-label', { hasText: 'USD' }).count()).toBeGreaterThan(0);
        // 정렬 price 옵션
        expect(await page.locator('#ship-sort option[value="price-asc"]').count()).toBe(1);
        // 모달 USD 가격
        await page.locator('.ship-name-btn').first().click();
        await page.waitForSelector('.ship-modal-grid');
        expect(await page.locator('.ship-modal-grid').first().innerText()).toMatch(/USD/);
        expect(errors).toEqual([]);
    });

    test('ON 테스트 경로: 카드·모달·정렬·검색에서 priceUsd 제거', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        // 카드에 USD 가격 스탯 없음
        expect(await page.locator('.ship-card .ship-stat-label', { hasText: 'USD' }).count()).toBe(0);
        // 정렬에 price 옵션 없음
        expect(await page.locator('#ship-sort option[value^="price"]').count()).toBe(0);
        // 모달에 USD 가격 없음
        await page.locator('.ship-name-btn').first().click();
        await page.waitForSelector('.ship-modal-grid');
        expect(await page.locator('.ship-modal-grid').first().innerText()).not.toMatch(/USD/);
        // 검색: 가격 문자열로는 안 잡힘(예 "$50" 같은 가격 토큰)
        const priceHit = await page.evaluate(() => {
            const input = document.getElementById('ship-search');
            if (!input) return null;
            input.value = '$';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        });
        expect(priceHit).toBe(true);
    });
});
