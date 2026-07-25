const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// ShipDB 2.0 A-6: Erkul live 스펙/구매처 레이어(data/ship-live-stats.js, ship-market.js) 모달 표시.
// 기대값 전략(A-7): Erkul 동기화로 가격/수치가 바뀔 수 있으므로, exact 값 검증은
// Asgard 대표값(HP·최저가) 1곳만 회귀 기준으로 유지하고 나머지는 표시 형식/정렬/존재 중심으로 검증한다.
// Asgard 대표값이 동기화로 바뀌면 이 파일의 기준값도 함께 갱신한다.
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
        // 가격/재고는 동기화로 바뀔 수 있어 형식만 검증
        await expect(row).toContainText(/[\d,]+ aUEC/);
        await expect(row).toContainText(/재고 \d+/);
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
        const count = await rows.count();
        expect(count).toBeGreaterThanOrEqual(2);
        // 가격은 exact 값 대신 형식 + 오름차순 정렬만 검증 (동기화 내성)
        const prices = [];
        for (let i = 0; i < count; i += 1) {
            const text = await rows.nth(i).locator('.ship-market-price').textContent();
            expect(text).toMatch(/[\d,]+ aUEC/);
            prices.push(Number(text.replace(/[^\d]/g, '')));
        }
        expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    });

    test('수동매핑 market 보강: Aurora ES 모달에 New Deal 구매처 표시', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, 'Aurora ES');

        // marketOnlyMappings로 구형 rsi_aurora_es의 상점 행이 병합됨 (stats는 현 선체 기준 유지)
        const market = modal.locator('.ship-market-panel');
        await expect(market).toContainText('New Deal');
        await expect(market.locator('.ship-market-row.is-rental').first()).toBeVisible();
        await expect(modal.locator('.ship-live-summary')).toBeVisible();
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
        // 보험/속도/회전 값은 동기화로 바뀔 수 있어 표시 형식만 검증
        await expect(details).toContainText(/\d{2}:\d{2}:\d{2}/);
        await expect(details).toContainText(/\d+ m\/s/);
        await expect(details).toContainText(/[\d.]+ °\/s/);
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

    test('KO 모드: Erkul 기반 한국어 번역 설명 우선 (A-9 정책)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const modal = await openShipModalByName(page, 'Asgard');

        const desc = modal.locator('.modal-body > p').first();
        // Erkul EN의 한국어 번역본이 기존 VOLT 설명("중형급 수송선...")을 대체한다
        await expect(desc).toContainText('Anvil Aerospace');
        await expect(desc).toContainText(/[가-힣]/);
        await expect(desc).not.toContainText('중형급 수송선');
        await expect(desc).not.toContainText('As the battles of today');
    });

    test('카드/모달 설명 통합: 외부 카드 .ship-desc도 Erkul 번역으로 일치(A-9)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.locator('#ship-search').fill('Asgard');
        const card = page.locator('#ships-grid .ship-card').first();
        await expect(card).toBeVisible();
        // live 로드 후 재렌더로 카드 설명이 Erkul 번역으로 갱신된다(기존 legacy 설명 대체).
        await expect.poll(() => card.locator('.ship-desc').textContent(), { timeout: 10000 })
            .toContain('Anvil Aerospace');
        await expect(card.locator('.ship-desc')).not.toContainText('중형급 수송선');
        // 카드(외부) 설명과 모달(내부) 설명이 동일해야 한다.
        const cardDesc = (await card.locator('.ship-desc').textContent())?.trim();
        await card.click();
        await expect(page.locator('#global-modal')).toHaveClass(/active/);
        const modalDesc = (await page.locator('#global-modal .modal-body > p').first().textContent())?.trim();
        expect(modalDesc).toBe(cardDesc);
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
