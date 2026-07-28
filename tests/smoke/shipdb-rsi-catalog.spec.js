const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('RSI 공식 함선 통합 목록', () => {
    test('ON: RSI 공식 30척이 메인 목록에 포함되고 별도 탭은 없다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        expect(await page.locator('[data-catalog-chip], #rsi-catalog-grid').count()).toBe(0);
        expect(await page.locator('#ships-grid [data-rsi-status="concept"]').count()).toBe(28);
        expect(await page.locator('#ships-grid [data-rsi-status="flight-ready"]').count()).toBe(2);
    });

    test('ON: 컨셉은 미구현 제외에 숨고 출시 상태 RSI 함선은 남는다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships-grid [data-ship-id="arrastra"]')).toHaveCount(1);
        await expect(page.locator('#ships-grid [data-ship-id="atls"]')).toHaveCount(1);
        await page.locator('#ship-advanced-toggle').click();
        await page.locator('#ship-hide-unreleased').check();
        await expect(page.locator('#ships-grid [data-ship-id="arrastra"]')).toHaveCount(0);
        await expect(page.locator('#ships-grid [data-ship-id="atls"]')).toHaveCount(1);
    });

    test('ON: 제조사 필터는 RSI 공식 제조사와 기존 약칭을 하나로 묶는다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);

        const manufacturer = page.locator('#ship-manufacturer');
        await expect(manufacturer.locator('option', { hasText: 'RSI' })).toHaveCount(1);
        await manufacturer.selectOption('roberts-space-industries');
        await expect(page.locator('#ships-grid [data-ship-id="aurora-es"]')).toHaveCount(1);
        await expect(page.locator('#ships-grid [data-ship-id="arrastra"]')).toHaveCount(1);

        await manufacturer.selectOption('misc');
        await expect(page.locator('#ships-grid [data-ship-id="freelancer"]')).toHaveCount(1);
        await expect(page.locator('#ships-grid [data-ship-id="endeavor"]')).toHaveCount(1);
    });

    test('ON: RSI 공식 레코드는 레거시 설명·플래너 진입 없이 공식 값만 표시한다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        const expanse = page.locator('#ships-grid [data-ship-id="expanse"]');
        await expect(expanse).toContainText(/RSI 공식 미제공/);
        expect(await expanse.locator('[data-use-planner-ship-id]').count()).toBe(0);
        const atls = page.locator('#ships-grid [data-ship-id="atls"]');
        expect(await atls.locator('[data-use-planner-ship-id]').count()).toBe(0);
        await atls.locator('[data-open-ship-id="atls"]').click();
        const officialUrl = await page.locator('.ship-modal-link[href*="robertsspaceindustries.com"]').getAttribute('href');
        expect(officialUrl).toContain('robertsspaceindustries.com');
    });

    test('ON: RSI 상태 배지는 카드 폭 안에 머물고 전체 상태는 접근 가능하다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        for (const id of ['e1-spirit', 'genesis']) {
            const card = page.locator(`#ships-grid [data-ship-id="${id}"]`);
            const status = card.locator('.ship-rsi-status');
            await expect(status).toContainText('컨셉 · RSI 공식');
            await expect(status).toHaveAttribute('aria-label', '컨셉 · RSI 공식 사양 · 변경 가능');
            expect(await card.locator('.ship-card-header').evaluate((header) => header.scrollWidth <= header.clientWidth + 1)).toBe(true);
        }
    });
});
