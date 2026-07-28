const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');
const canonical = require('../../data/canonical/ships-canonical.json');
const rsiOfficial = require('../../data/canonical/ships-rsi-official.json');

// role 필터 UX(PM): 역할 칩 → 단일 검색형 역할 선택 콤보박스. Erkul/RSI 공식 role 원문만(KO=UI 번역),
// 버킷팅 없음, 검색·선택·초기화·키보드, role 없는 함선 제외, OFF 완전 불변, 모바일 접근성.
const ROLE_COUNT = new Set([
    ...canonical.ships.map((ship) => ship.role),
    ...rsiOfficial.records.map((record) => record.rsi.role),
].filter(Boolean)).size;

async function onShips(page) {
    await mockApi(page);
    await gotoSection(page, '#ships');
    await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
}
async function allCanonicalRoles(page) {
    return page.$$eval('#ships-grid .ship-card', (cards) =>
        cards.map((card) => card.dataset.canonicalRole || ''));
}

test.describe('role 필터 UX — 단일 검색형 콤보박스 (ON 전용)', () => {
    test('ON: 콤보박스 구조 — combobox 입력 + 공식 role 전체 옵션(KO 라벨, 버킷 없음)', async ({ page }) => {
        await onShips(page);
        await expect(page.locator('#ship-role-search[role="combobox"]')).toBeVisible();
        // VOLT 칩 없음, 옵션 = 전체 + 공식 role 전량(그룹/버킷 헤더 없음: option만)
        expect(await page.locator('#ship-tag-filters [data-ship-tag-filter]').count()).toBe(0);
        expect(await page.locator('[data-role-option]').count()).toBe(ROLE_COUNT + 1);
        // 옵션 키=Erkul EN, 라벨=KO 번역
        await expect(page.locator('[data-role-option="Light Fighter"]')).toHaveText('경 전투기');
        // 리스트박스는 기본 닫힘
        await expect(page.locator('#ship-role-listbox')).toBeHidden();
    });

    test('ON 검색: 한 글자씩 타이핑해도 입력 포커스 유지 + 옵션 필터(그리드 미변경)', async ({ page }) => {
        await onShips(page);
        const input = page.locator('#ship-role-search');
        await input.click();
        await input.pressSequentially('fight', { delay: 40 }); // EN 원문 부분일치
        // 커서 안 풀림(admin 회귀 방지) — 타이핑은 renderShips를 부르지 않는다
        expect(await page.evaluate(() => document.activeElement?.id)).toBe('ship-role-search');
        await expect(page.locator('[data-role-option="Light Fighter"]')).toBeVisible();
        expect(await page.locator('[data-role-option="Heavy Freight"]').isVisible()).toBe(false);
        // 선택 전이므로 그리드는 그대로 249
        expect(await page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
    });

    test('ON 키보드: ArrowDown→Enter 선택, Escape 닫힘', async ({ page }) => {
        await onShips(page);
        const input = page.locator('#ship-role-search');
        await input.click();
        await input.fill('중형 화물'); // KO 라벨 검색
        await input.press('ArrowDown');
        await input.press('Enter');
        await expect(input).toHaveValue('중형 화물선'); // Medium Freight
        await expect.poll(async () => {
            const roles = await allCanonicalRoles(page);
            return roles.length > 0 && roles.every((role) => role === 'Medium Freight');
        }).toBe(true);
        // 다시 열고 Escape로 닫기
        await input.click();
        await input.press('Escape');
        await expect(page.locator('#ship-role-listbox')).toBeHidden();
    });

    test('ON 초기화: 선택 후 ✕로 전체 복귀', async ({ page }) => {
        await onShips(page);
        const input = page.locator('#ship-role-search');
        await input.click();
        await page.locator('[data-role-option="Light Fighter"]').click();
        await expect(input).toHaveValue('경 전투기');
        await expect.poll(async () => (await allCanonicalRoles(page)).every((role) => role === 'Light Fighter')).toBe(true);
        await page.locator('[data-role-clear]').click();
        await expect(input).toHaveValue('');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
    });

    test('ON 모바일 390px: 콤보박스 검색·선택 동작 + 가로 overflow 없음', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await onShips(page);
        const input = page.locator('#ship-role-search');
        await input.click();
        await input.fill('의료');
        await page.locator('[data-role-option="Medical"]').click();
        await expect(input).toHaveValue('의료선');
        await expect.poll(async () => {
            const roles = await allCanonicalRoles(page);
            return roles.length > 0 && roles.every((role) => role === 'Medical');
        }).toBe(true);
        const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        expect(noOverflow).toBe(true);
    });
});
