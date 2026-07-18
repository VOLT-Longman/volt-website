const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// ShipDB 2.0 A-9: KO 모드 함선 설명 = Erkul EN 설명의 한국어 번역본 (descriptions.ko).
// 우선순위 — KO 모드: descriptions.ko → 기존 ship.description / EN 모드: descriptions.en → ship.description_en.
// 레이어에 없는 함선(미출시 등)은 기존 volt-data 설명으로 폴백한다.

async function openShipModalByName(page, query) {
    await page.locator('#ship-search').fill(query);
    const card = page.locator('#ships-grid .ship-card').first();
    await expect(card).toBeVisible();
    await card.click();
    const modal = page.locator('#global-modal');
    await expect(modal).toHaveClass(/active/);
    return modal.locator('.modal-body > p').first();
}

test.describe('함선 설명 KO 번역 (A-9)', () => {
    test('KO 모드 Asgard: Erkul 기반 한국어 번역 표시 + 기존 VOLT 설명 미표시', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const desc = await openShipModalByName(page, 'Asgard');

        // Erkul EN("As the battles of today...")의 번역본 — 한국어 + 고유명사 영문 유지
        await expect(desc).toContainText(/[가-힣]/);
        await expect(desc).toContainText('Anvil Aerospace');
        await expect(desc).toContainText('Asgard');
        // 기존 VOLT 큐레이션 설명은 legacy로 밀려나 표시되지 않는다
        await expect(desc).not.toContainText('중형급 수송선');
    });

    test('EN 모드 Asgard: Erkul 영어 설명 표시', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '#ships');
        const desc = await openShipModalByName(page, 'Asgard');

        await expect(desc).toContainText('As the battles of today');
        await ctx.close();
    });

    test('레이어 없는 함선(Javelin): 기존 KO 설명 폴백 + 콘솔 에러 없음', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        // 비-live 함선(Javelin)은 3.5-A 실전 ON의 canonical 219에 없다 → 레거시 폴백은 OFF 강제로 검증.
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        const desc = await openShipModalByName(page, 'Javelin');

        // 미출시 함선은 live 레이어가 없으므로 volt-data 한국어 설명이 그대로 표시된다
        await expect(desc).toContainText(/[가-힣]/);
        expect(errors).toEqual([]);
    });

    test('KO 번역 일관성: 다른 함선(Carrack)도 번역 설명 표시', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const desc = await openShipModalByName(page, 'Carrack');

        await expect(desc).toContainText(/[가-힣]/);
        await expect(desc).toContainText('Anvil Aerospace');
    });

    test('모바일 390px: 긴 한국어 번역 설명 overflow 없음', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await openShipModalByName(page, '890');

        const card = page.locator('#global-modal .modal-card');
        const overflow = await card.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
    });
});
