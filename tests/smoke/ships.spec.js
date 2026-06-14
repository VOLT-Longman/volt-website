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
        // 표시명 정책 적용 후 제목은 한글일 수 있어, 영문은 모달 보조 표기에 존재.
        await expect(modal).toContainText(/carrack/i);

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/);
    });

    // Phase 2 표시명 정책: 한글명 기본 표시 + 영문명 보조, 한글/영문 검색 모두 동작.
    test('한글명 검색: 결과 카드 제목 한글 + 영문 보조 표기', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');

        const cards = page.locator('#ships-grid .ship-card');
        const totalCount = await cards.count();
        expect(totalCount).toBeGreaterThan(0);

        await page.locator('#ship-search').fill('어벤저 타이탄');
        await expect.poll(() => cards.count()).toBeLessThan(totalCount);
        await expect(cards.first().locator('.ship-name')).toHaveText(/어벤저 타이탄/);
        await expect(cards.first().locator('.ship-name-en')).toHaveText(/Avenger Titan/i);
    });

    test('영문명 검색: 동일 함선 노출 + 한글 우선 표시', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');

        const cards = page.locator('#ships-grid .ship-card');
        await page.locator('#ship-search').fill('Avenger Titan');
        await expect.poll(() => cards.count()).toBeGreaterThan(0);
        await expect(cards.first().locator('.ship-name')).toHaveText(/어벤저 타이탄/);
    });

    test('상세 모달: 제목 한글 + 영문 보조 표기', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');

        await page.locator('#ship-search').fill('어벤저 타이탄');
        await page.locator('#ships-grid .ship-card').first().click();
        const modal = page.locator('#global-modal');
        await expect(modal).toHaveClass(/active/);
        await expect(modal.locator('.modal-title')).toHaveText(/어벤저 타이탄/);
        await expect(modal.locator('.modal-subtitle-en')).toHaveText(/Avenger Titan/i);
    });

    test('모바일 390px: 긴 한글 함선명이 카드 밖으로 넘치지 않음', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockApi(page);
        await gotoSection(page, '#ships');

        await page.locator('#ship-search').fill('이지스');
        const cards = page.locator('#ships-grid .ship-card');
        await expect(cards.first()).toBeVisible();
        const count = Math.min(await cards.count(), 8);
        for (let i = 0; i < count; i += 1) {
            const overflow = await cards.nth(i).evaluate((el) => el.scrollWidth - el.clientWidth);
            expect(overflow).toBeLessThanOrEqual(1);
        }
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
