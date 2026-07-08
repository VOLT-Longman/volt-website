const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// C-1: 화면에 표시되는 함선 설명(Erkul 번역)이 검색 색인에도 포함되어야 한다.
// 검증 문구는 Asgard 번역 설명의 첫 구절 — 번역 갱신(A-9 테이블) 시 함께 갱신한다.
const ASGARD_TRANSLATED_PHRASE = '오늘날의 전투가';

test.describe('검색 색인 정합성 (C-1)', () => {
    test('함선DB 검색: 표시 중인 번역 설명 문구로 Asgard가 잡힌다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        // live 레이어 로드 완료(카드 설명이 번역으로 갱신) 대기
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
        await expect.poll(() => page.evaluate(() => Boolean(window.VOLT_SHIP_LIVE_STATS))).toBe(true);

        await page.locator('#ship-search').fill(ASGARD_TRANSLATED_PHRASE);
        const cards = page.locator('#ships-grid .ship-card');
        await expect.poll(() => cards.count()).toBeGreaterThan(0);
        await expect(cards.first()).toContainText(/asgard|아스가드/i);
        // 화면 설명에도 같은 문구가 실제로 표시되고 있어야 함 (색인-표시 일치의 전제)
        await expect(cards.first().locator('.ship-desc')).toContainText(ASGARD_TRANSLATED_PHRASE);
    });

    test('전역 검색: live 로드 후 번역 설명 문구로 함선 결과가 나온다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(() => page.evaluate(() => Boolean(window.VOLT_SHIP_LIVE_STATS))).toBe(true);

        await page.locator('#search-toggle').click();
        await expect(page.locator('#search-overlay')).toHaveClass(/active/);
        await page.locator('#global-search-input').fill(ASGARD_TRANSLATED_PHRASE);
        const results = page.locator('#search-results');
        await expect(results).toContainText(/asgard|아스가드/i);
    });

    test('live 로드 전(홈): legacy 설명 검색은 기존대로 동작 + 에러 없음', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await mockApi(page);
        await gotoSection(page, '');
        // #ships 미방문 → live 미로드 상태에서 전역 검색이 정상 동작해야 한다
        await page.locator('#search-toggle').click();
        await page.locator('#global-search-input').fill('Carrack');
        await expect(page.locator('#search-results')).toContainText(/carrack|캐럭/i);
        expect(errors).toEqual([]);
    });
});
