const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// ShipDB 재작성 2단계 — RSI 공식 카탈로그 탭/카드. 플래그 OFF에서는 완전 미노출(라이브 불변).
test.describe('RSI 공식 카탈로그 탭 (플래그 OFF=미노출)', () => {
    test('OFF 강제(되돌림): 카탈로그 칩·그리드 없음, 함선DB 불변', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; }); // 3.5-A 기본 ON → OFF 되돌림 검증
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        expect(await page.locator('[data-catalog-chip]').count()).toBe(0);
        expect(await page.locator('#rsi-catalog-grid').count()).toBe(0);
        expect(await page.locator('#ships-grid').isVisible()).toBe(true);
        expect(errors).toEqual([]);
    });
});

test.describe('RSI 공식 카탈로그 탭 (플래그 ON 테스트 경로)', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
    });

    test('ON: 칩 노출 → 클릭 시 30 카드, 배지 concept 28/flight-ready 2', async ({ page }) => {
        await gotoSection(page, '#ships');
        const chip = page.locator('[data-catalog-chip]');
        await expect(chip).toHaveCount(1);
        await chip.click();
        await expect(page.locator('#rsi-catalog-grid')).toBeVisible();
        await expect(page.locator('#ships-grid')).toBeHidden();
        await expect(page.locator('.rsi-catalog-card')).toHaveCount(30);
        expect(await page.locator('.rsi-catalog-badge-concept').count()).toBe(28);
        expect(await page.locator('.rsi-catalog-badge-flight-ready').count()).toBe(2);
    });

    test('ON: 출처 링크(RSI 공식)+확인일 모든 카드에 표시', async ({ page }) => {
        await gotoSection(page, '#ships');
        await page.locator('[data-catalog-chip]').click();
        expect(await page.locator('.rsi-catalog-source').count()).toBe(30);
        expect(await page.locator('.rsi-catalog-retrieved').count()).toBe(30);
        const href = await page.locator('.rsi-catalog-card[data-catalog-id="kraken"] .rsi-catalog-source').getAttribute('href');
        expect(href).toContain('robertsspaceindustries.com');
    });

    test('ON: expanse는 "RSI 공식 설명 미제공"', async ({ page }) => {
        await gotoSection(page, '#ships');
        await page.locator('[data-catalog-chip]').click();
        const card = page.locator('.rsi-catalog-card[data-catalog-id="expanse"]');
        await expect(card.locator('.rsi-catalog-desc-empty')).toHaveText(/미제공/);
    });

    test('ON: atls는 flight-ready 배지, RSI 비제공 게임플레이 값 미표시', async ({ page }) => {
        await gotoSection(page, '#ships');
        await page.locator('[data-catalog-chip]').click();
        const atls = page.locator('.rsi-catalog-card[data-catalog-id="atls"]');
        await expect(atls.locator('.rsi-catalog-badge-flight-ready')).toHaveCount(1);
        // 필드는 정확히 5개(제조사·역할·크기·승무원·화물)만 — HP·속도·DPS·시세 없음
        expect(await atls.locator('.rsi-catalog-field').count()).toBe(5);
        const text = await atls.innerText();
        expect(text).not.toMatch(/HP|SCM|DPS|aUEC|시세|구매처/);
    });

    // PM step3: 카탈로그 카드는 비교·플래너·행어(실전 소비처) 진입점이 없다.
    test('ON: 카탈로그 카드에 비교·플래너·행어 컨트롤 없음(실전 제외)', async ({ page }) => {
        await gotoSection(page, '#ships');
        await page.locator('[data-catalog-chip]').click();
        const catalog = page.locator('#rsi-catalog-grid');
        expect(await catalog.locator('[data-compare-ship-id]').count()).toBe(0);
        expect(await catalog.locator('.ship-compare-toggle').count()).toBe(0);
        expect(await catalog.locator('[data-hangar-ship-id]').count()).toBe(0);
        expect(await catalog.locator('.ship-planner-use, .ship-compare-use').count()).toBe(0);
    });
});
