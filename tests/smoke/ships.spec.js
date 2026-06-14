const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('함선 DB', () => {
    test('검색 입력 → 결과 갱신, 카드 모달 열기/닫기(Escape)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');

        const cards = page.locator('#ships-grid .ship-card');
        const totalCount = await cards.count();
        expect(totalCount).toBeGreaterThan(0);

        await page.locator('#ship-search').fill('Carrack');
        await expect.poll(() => cards.count()).toBeLessThan(totalCount);
        await expect(cards.first()).toContainText(/carrack/i);

        await cards.first().click();
        const modal = page.locator('#global-modal');
        await expect(modal).toHaveClass(/active/);
        await expect(modal.locator('.modal-title')).toContainText(/carrack/i);

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/);
    });

    // global.ini 한글 데이터(Phase 1): 한글 함선명이 검색 alias로 동작하고
    // 표시명은 기존 영문 이름이 유지되는지 회귀 가드.
    test('한글 alias 검색: 한글 함선명으로 필터 + 영문 표시명 유지', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');

        const cards = page.locator('#ships-grid .ship-card');
        const totalCount = await cards.count();
        expect(totalCount).toBeGreaterThan(0);

        await page.locator('#ship-search').fill('어벤저 스토커');
        await expect.poll(() => cards.count()).toBeLessThan(totalCount);
        await expect(cards.first()).toContainText(/avenger stalker/i);
        await expect(cards.first().locator('.ship-name')).toHaveText(/avenger stalker/i);
    });

    test('함선 모달: Tab 포커스 트랩 + 닫을 때 포커스 복귀', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');

        const firstCard = page.locator('#ships-grid .ship-card').first();
        await firstCard.click();
        const modal = page.locator('#global-modal');
        await expect(modal).toHaveClass(/active/);

        // Tab을 모달 내 포커스 가능한 요소 수보다 많이 눌러도 포커스가 모달 안에 머문다.
        for (let i = 0; i < 12; i += 1) {
            await page.keyboard.press('Tab');
            const inModal = await page.evaluate(() => document.getElementById('global-modal').contains(document.activeElement));
            expect(inModal).toBe(true);
        }

        // Shift+Tab 역방향 순환도 모달 안에 머문다.
        await page.keyboard.press('Shift+Tab');
        expect(await page.evaluate(() => document.getElementById('global-modal').contains(document.activeElement))).toBe(true);

        // 닫으면 트리거(카드)로 포커스 복귀
        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/);
        await expect(firstCard).toBeFocused();
    });
});
