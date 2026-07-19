const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// 커밋 C: 2축 태그 필터(규모·플랫폼 + 역할) + 세부 역할 검색. 같은 축 OR·축 간 AND·세부는 원문 role 단일.
async function onShips(page) {
    await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
    await mockApi(page);
    await gotoSection(page, '#ships');
    await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
}
// 보이는 카드가 특정 태그(클래스+라벨)를 가졌는지: card 텍스트로 판별
async function visibleCardTagTexts(page, sel) {
    return page.$$eval(`#ships-grid .ship-card ${sel}`, (els) => els.map((e) => e.textContent.trim()));
}
async function visibleCanonicalRoles(page) {
    return page.$$eval('#ships-grid .ship-card', (cards) => cards.map((card) => card.dataset.canonicalRole || ''));
}

test.describe('2축 태그 필터 (규모·플랫폼 + 역할, 커밋 C)', () => {
    test('OFF 강제(되돌림): 콤보박스·2축 없음, 레거시 focus/tags 칩 유지', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; }); // 3.5-A 기본 ON → OFF 되돌림
        await mockApi(page); await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        expect(await page.locator('#ship-tag-filters [data-ship-tag-filter]').count()).toBeGreaterThan(0);
        expect(await page.locator('[data-size-tag], [data-role-tag]').count()).toBe(0);
        expect(errors).toEqual([]);
    });

    test('ON: 규모·플랫폼 축(지상+4규모)·역할 축(정제 숨김)·세부 역할 검색', async ({ page }) => {
        await onShips(page);
        // 규모·플랫폼: 지상 + 소형/중형/대형/캐피탈
        for (const k of ['ground', 'small', 'medium', 'large', 'capital']) {
            expect(await page.locator(`[data-size-tag="${k}"]`).count()).toBe(1);
        }
        // 역할: 전투 등 존재, 정제(0척)는 숨김
        expect(await page.locator('[data-role-tag="combat"]').count()).toBe(1);
        expect(await page.locator('[data-role-tag="refining"]').count()).toBe(0);
        // 세부 역할 검색 콤보박스
        await expect(page.locator('#ship-role-search[role="combobox"]')).toBeVisible();
    });

    test('ON 규모: 지상 선택 → 보이는 카드 전부 지상(cyclone-tr 포함, freelancer 제외)', async ({ page }) => {
        await onShips(page);
        await page.locator('[data-size-tag="ground"]').click();
        await expect.poll(async () => {
            const sizes = await visibleCardTagTexts(page, '.ship-tag-size');
            return sizes.length > 0 && sizes.every((t) => t === '지상');
        }).toBe(true);
        expect(await page.locator('[data-ship-id="cyclone-tr"]').count()).toBe(1);
        expect(await page.locator('[data-ship-id="freelancer"]').count()).toBe(0);
    });

    test('ON 역할: 전투 선택 → 보이는 카드 전부 전투 태그', async ({ page }) => {
        await onShips(page);
        await page.locator('[data-role-tag="combat"]').click();
        await expect.poll(async () => {
            const roleTags = await page.$$eval('#ships-grid .ship-card', (cards) =>
                cards.map((c) => [...c.querySelectorAll('.ship-tag-role')].map((r) => r.textContent.trim())));
            return roleTags.length > 0 && roleTags.every((tags) => tags.includes('전투'));
        }).toBe(true);
    });

    test('ON 같은 축 OR: 지상 + 소형 → 보이는 카드는 지상 또는 소형', async ({ page }) => {
        await onShips(page);
        await page.locator('[data-size-tag="ground"]').click();
        await page.locator('[data-size-tag="small"]').click();
        await expect.poll(async () => {
            const sizes = await visibleCardTagTexts(page, '.ship-tag-size');
            return sizes.length > 0 && sizes.every((t) => t === '지상' || t === '소형');
        }).toBe(true);
        // 순수 소형 우주선(freelancer는 중형이라 제외될 수 있음) — cyclone-tr(지상) 포함
        expect(await page.locator('[data-ship-id="cyclone-tr"]').count()).toBe(1);
    });

    test('ON 축 간 AND: 지상(규모) + 전투(역할) → 지상이면서 전투', async ({ page }) => {
        await onShips(page);
        await page.locator('[data-size-tag="ground"]').click();
        await page.locator('[data-role-tag="combat"]').click();
        await expect.poll(async () => {
            const cards = await page.$$eval('#ships-grid .ship-card', (cs) => cs.map((c) => ({
                size: c.querySelector('.ship-tag-size')?.textContent.trim(),
                roles: [...c.querySelectorAll('.ship-tag-role')].map((r) => r.textContent.trim()),
            })));
            return cards.length > 0 && cards.every((c) => c.size === '지상' && c.roles.includes('전투'));
        }).toBe(true);
    });

    test('ON 세부 역할 검색: 태그 결과를 추가로 좁힘 + 초기화(축별 전체)', async ({ page }) => {
        await onShips(page);
        // 역할=전투 선택 후 세부로 Light Fighter만
        await page.locator('[data-role-tag="combat"]').click();
        const input = page.locator('#ship-role-search');
        await input.click();
        await page.locator('[data-role-option="Light Fighter"]').click();
        await expect.poll(async () => {
            const roles = await visibleCanonicalRoles(page);
            return roles.length > 0 && roles.every((role) => role === 'Light Fighter');
        }).toBe(true);
        // 역할 축 전체 → 역할 태그 해제(세부는 유지되어 여전히 경 전투기)
        await page.locator('[data-axis-clear="role"]').click();
        await expect.poll(async () => {
            const roles = await visibleCanonicalRoles(page);
            return roles.length > 0 && roles.every((role) => role === 'Light Fighter');
        }).toBe(true);
    });

    test('ON 카드 태그: 규모·플랫폼 1 + 역할 최대 2 + 원문 KO 라벨', async ({ page }) => {
        await onShips(page);
        const card = page.locator('[data-ship-id="freelancer"]');
        expect(await card.locator('.ship-tag-size').count()).toBe(1);
        expect(await card.locator('.ship-tag-role').count()).toBeLessThanOrEqual(2);
        await expect(card.locator('.ship-card-role-detail')).toHaveText('경 화물선');
    });

    test('ON 모바일 390px: 축 가로 스크롤 + 태그 선택 동작', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await onShips(page);
        const axis = page.locator('.ship-filter-axis').first();
        expect(await axis.evaluate((el) => getComputedStyle(el).flexWrap)).toBe('nowrap');
        expect(['auto', 'scroll']).toContain(await axis.evaluate((el) => getComputedStyle(el).overflowX));
        await page.locator('[data-size-tag="ground"]').click();
        const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        expect(noOverflow).toBe(true);
    });
});
