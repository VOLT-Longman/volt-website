const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// ShipDB 재작성 — role 원자 이관(PM 계약).
//  OFF: 카드 focus 배지, role=레거시 VOLT 수기, 필터=focus/tags 카테고리, purpose 노출 — 완전 불변.
//  ON: 카드 canonical role 배지(EN 로케일=Erkul EN, KO=roleKo), focus 배지 제거,
//      필터=canonical role 칩(집합에서만), purpose 숨김, 비교·모달·검색 role=canonical.
//  검증 함선: freelancer = Erkul role "Light Freight" → KO "경 화물선".
const CARD = (id) => `[data-ship-id="${id}"]`;

test.describe('role 원자 이관 (OFF=레거시, ON=canonical role)', () => {
    test('OFF 강제(되돌림): 카드 focus 배지 · role 배지 없음 · 필터=카테고리 · purpose 노출', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; }); // 3.5-A 기본 ON → OFF 되돌림 검증
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        expect(await page.locator(`${CARD('freelancer')} .ship-focus-badge`).count()).toBe(1);
        expect(await page.locator(`${CARD('freelancer')} .ship-role-badge`).count()).toBe(0);
        // 필터에 Erkul EN role 키가 없다(OFF=KO 카테고리)
        expect(await page.locator('#ship-tag-filters [data-ship-tag-filter="Light Freight"]').count()).toBe(0);
        // purpose 행은 OFF에서 개별 숨김되지 않는다(상세 필터 패널 접힘과 무관하게 hidden 속성 없음)
        expect(await page.locator('#ship-purpose').evaluate((el) => el.closest('.ship-advanced-row').hidden)).toBe(false);
        expect(errors).toEqual([]);
    });

    test('ON: 카드 role 배지=canonical KO · focus 배지 제거 · purpose 숨김', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
        // 카드: role 배지=경 화물선, focus 배지 없음
        await expect(page.locator(`${CARD('freelancer')} .ship-role-badge`)).toHaveText('경 화물선');
        expect(await page.locator(`${CARD('freelancer')} .ship-focus-badge`).count()).toBe(0);
        // purpose(VOLT 편집 프리셋) 행 자체가 ON에서 숨김(hidden 속성)
        expect(await page.locator('#ship-purpose').evaluate((el) => el.closest('.ship-advanced-row').hidden)).toBe(true);
    });

    test('ON 필터(콤보박스): 옵션 키=Erkul EN·라벨=KO · 선택 시 해당 role만 노출', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
        // 옵션: 키=Erkul EN role, 라벨=roleKo
        const opt = page.locator('#ship-tag-filters [data-role-option="Light Freight"]');
        await expect(opt).toHaveText('경 화물선');
        // 콤보박스 열고 옵션 선택 → 보이는 모든 카드의 role 배지가 경 화물선(= Light Freight)만
        // textContent로 검증(reveal 애니메이션 미노출 카드도 정확 포착 — innerText는 '' 반환).
        await page.locator('#ship-role-search').click();
        await opt.click();
        await expect.poll(async () => {
            const badges = await page.$$eval('#ships-grid .ship-card', (cards) =>
                cards.map((c) => (c.querySelector('.ship-role-badge')?.textContent || '').trim()));
            return badges.length > 0 && badges.every((t) => t === '경 화물선');
        }).toBe(true);
        // freelancer(Light Freight)는 남고, caterpillar(Medium Freight)는 사라진다
        expect(await page.locator(CARD('freelancer')).count()).toBe(1);
        expect(await page.locator(CARD('caterpillar')).count()).toBe(0);
        // 선택 라벨이 입력에 반영
        await expect(page.locator('#ship-role-search')).toHaveValue('경 화물선');
    });

    test('ON 모달: 역할 = canonical KO(경 화물선)', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
        await page.locator(`${CARD('freelancer')} .ship-name-btn`).click();
        await page.waitForSelector('.ship-modal-grid');
        const grid = await page.locator('.ship-modal-grid').first().innerText();
        expect(grid).toContain('경 화물선');
    });

    test('ON EN 로케일: role 배지 = Erkul EN 원문(Light Freight)', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(page.locator(`${CARD('freelancer')} .ship-role-badge`)).toHaveText('Light Freight');
    });
});
