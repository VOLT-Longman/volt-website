const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// ShipDB 2.0 A-6: Erkul live 스펙/구매처 레이어(data/ship-live-stats.js, ship-market.js) 모달 표시.
// 검증값은 A-1~A-5에서 확정한 Erkul live 스냅샷(2026-07-05) 기준.
async function openShipModalByName(page, query) {
    await page.locator('#ship-search').fill(query);
    const card = page.locator('#ships-grid .ship-card').first();
    await expect(card).toBeVisible();
    await card.click();
    const modal = page.locator('#global-modal');
    await expect(modal).toHaveClass(/active/);
    return modal;
}

test.describe('함선DB Live 레이어 (A-6)', () => {
    test('Asgard 모달: Live 요약 표시 (Size/HP/SCM/최저가)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, 'Asgard');

        const summary = modal.locator('.ship-live-summary');
        await expect(summary).toBeVisible();
        await expect(summary).toContainText('S4');
        await expect(summary).toContainText('77,000');
        await expect(summary).toContainText('203 m/s');
        await expect(summary).toContainText('1075 m/s');
        await expect(summary).toContainText('17,860,500 aUEC');
        await expect(summary.locator('.ship-live-meta')).toContainText('Erkul live');
    });

    test('Asgard 모달: 구매처 Astro Armada/Area18/가격/재고 표시', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, 'Asgard');

        const market = modal.locator('.ship-market-panel');
        await expect(market).toBeVisible();
        const row = market.locator('.ship-market-row').first();
        await expect(row).toContainText('Astro Armada');
        await expect(row).toContainText('Area18');
        await expect(row).toContainText('17,860,500 aUEC');
        await expect(row).toContainText('재고 3');
    });

    test('100i 모달: 구매 2곳 + 렌탈 가격 미표기', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, '100i');

        const market = modal.locator('.ship-market-panel');
        await expect(market.locator('.ship-market-row:not(.is-rental)')).toHaveCount(2);
        const rental = market.locator('.ship-market-row.is-rental');
        await expect(rental).toHaveCount(1);
        await expect(rental).toContainText('Regal Luxury Rentals');
        await expect(rental).toContainText('가격 미표기');
    });

    test('890 Jump 모달: 상점별 가격 2개 + 오름차순 정렬', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, '890');

        const rows = modal.locator('.ship-market-panel .ship-market-row');
        await expect(rows).toHaveCount(2);
        // 가격 오름차순: New Deal(62,088,392)이 Astro Armada(65,356,200)보다 먼저.
        await expect(rows.nth(0)).toContainText('62,088,392 aUEC');
        await expect(rows.nth(1)).toContainText('65,356,200 aUEC');
    });

    test('구매처 없는 matched 함선: noMarket 폴백 표시', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, 'Carrack Expedition');

        await expect(modal.locator('.ship-live-summary')).toBeVisible();
        await expect(modal.locator('.ship-market-panel')).toContainText('확인된 인게임 구매처 없음');
    });

    test('상세 스펙 details: 접힘 → 클릭 시 보험/회전 그룹 표시', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, 'Asgard');

        const details = modal.locator('.ship-live-details');
        await expect(details).toBeVisible();
        await expect(details.locator('.ship-live-detail-groups')).not.toBeVisible();
        await details.locator('summary').click();
        await expect(details.locator('.ship-live-detail-groups')).toBeVisible();
        await expect(details).toContainText('00:17:00');
        await expect(details).toContainText('425 m/s');
        await expect(details).toContainText('95 °/s');
    });

    test('EN 모드: Erkul 정제 설명 우선 표시', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, 'Asgard');

        await expect(modal.locator('.modal-body > p').first()).toContainText('As the battles of today');
        // 헤더 라인은 정제로 제거됨
        await expect(modal.locator('.modal-body > p').first()).not.toContainText('Manufacturer:');
        await ctx.close();
    });

    test('KO 모드: 기존 KO 설명 유지 (Erkul EN 미사용)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, 'Asgard');

        const desc = modal.locator('.modal-body > p').first();
        await expect(desc).toContainText('중형급 수송선');
        await expect(desc).not.toContainText('As the battles of today');
    });

    test('레이어 없는 함선(미출시): Live 섹션 없이 기존 모달 정상 + 콘솔 에러 없음', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, 'Javelin');

        await expect(modal.locator('.ship-modal-grid').first()).toBeVisible();
        await expect(modal.locator('.ship-live-summary')).toHaveCount(0);
        await expect(modal.locator('.ship-market-panel')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('모바일 390px: Asgard 모달 가로 overflow 없음', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, 'Asgard');

        await modal.locator('.ship-live-details summary').click();
        const card = modal.locator('.modal-card');
        const overflow = await card.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(bodyOverflow).toBeLessThanOrEqual(1);
    });
});
