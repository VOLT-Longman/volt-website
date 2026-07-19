const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');
const canonical = require('../../data/canonical/ships-canonical.json');
const rsiOfficial = require('../../data/canonical/ships-rsi-official.json');
const aliases = require('../../data/canonical/edition-aliases.json');

// 재작성 3.1 — 전후(OFF/ON) 응답 비교 하네스(PM). 허용된 차이만 통과, 그 외 차이는 실패.
//  허용 차이: 메인 256→219 / RSI 카탈로그 30척 별도 / priceUsd·focus·tags 제거 / crew·cargo·role=Erkul
//            (role: 카드 focus 배지→canonical role 배지, 필터=canonical role 칩, purpose 숨김).
//  그 외(공유 219척의 name·manufacturer·size·cargo 값·동작)는 OFF와 동일해야 한다.
const CANONICAL_IDS = new Set(canonical.ships.map((s) => s.id));
const EXCLUDED_37 = new Set([...rsiOfficial.records.map((r) => r.id), ...aliases.aliases.map((a) => a.aliasId)]);
const APPROVED_CARGO_CHANGES = new Map([['intrepid', ['0 SCU', '8 SCU']]]);

// 메인 그리드 카드를 id→{표시필드}로 포착
async function captureCards(page) {
    return page.$$eval('#ships-grid .ship-card', (cards) => cards.map((card) => {
        const id = card.querySelector('[data-compare-ship-id]')?.getAttribute('data-compare-ship-id') || null;
        const name = card.querySelector('.ship-name, .ship-name-btn')?.textContent?.trim() || '';
        const mfr = card.querySelector('.ship-mfr')?.textContent?.trim() || '';
        let cargo = '';
        card.querySelectorAll('.ship-stat').forEach((st) => {
            const label = st.querySelector('.ship-stat-label')?.textContent || '';
            if (label.includes('화물')) cargo = st.querySelector('.ship-stat-value')?.textContent?.trim() || '';
        });
        return {
            id, name, mfr, cargo,
            focusBadge: !!card.querySelector('.ship-focus-badge'),
            canonicalRole: card.dataset.canonicalRole || '',
            tagCount: card.querySelectorAll('.ship-tag').length,
            priceStat: [...card.querySelectorAll('.ship-stat-label')].some((l) => l.textContent.includes('USD')),
        };
    }).filter((c) => c.id));
}
function byId(rows) { const m = {}; for (const r of rows) m[r.id] = r; return m; }

async function loadState(page, on) {
    // 3.5-A로 기본 ON이므로 OFF도 명시적으로 강제한다(전후 비교의 OFF 기준선 고정).
    await page.addInitScript((flag) => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = flag; }, on);
    await mockApi(page);
    await gotoSection(page, '#ships');
    if (on) await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
    else await page.waitForSelector('#ships-grid .ship-card');
    return byId(await captureCards(page));
}

test.describe('3.1 전후 비교 (허용 차이만, 그 외 실패)', () => {
    test('메인 리스트: OFF 256 → ON 219, 제외 37=컨셉+별칭, 신규 추가 0', async ({ browser }) => {
        const off = await loadState(await (await browser.newContext()).newPage(), false);
        const on = await loadState(await (await browser.newContext()).newPage(), true);
        expect(Object.keys(off).length).toBe(256);
        expect(Object.keys(on).length).toBe(219);
        const removed = Object.keys(off).filter((id) => !on[id]);
        const added = Object.keys(on).filter((id) => !off[id]);
        expect(added).toEqual([]);
        expect(removed.length).toBe(37);
        expect(removed.every((id) => EXCLUDED_37.has(id))).toBe(true);
        expect(Object.keys(on).every((id) => CANONICAL_IDS.has(id))).toBe(true);
    });

    test('공유 219척: name·manufacturer·cargo 동일 / focus 배지→role 배지 이관 / tags·price 제거', async ({ browser }) => {
        const off = await loadState(await (await browser.newContext()).newPage(), false);
        const on = await loadState(await (await browser.newContext()).newPage(), true);
        const shared = Object.keys(on); // 219
        const unexpected = [];
        for (const id of shared) {
            const a = off[id]; const b = on[id];
            if (!a) { unexpected.push(`${id}: OFF 없음`); continue; }
            // 그 외 차이 없어야: 이름·제조사·화물값(cargo는 219척 Erkul==레거시)
            if (a.name !== b.name) unexpected.push(`${id}: name ${a.name}→${b.name}`);
            if (a.mfr !== b.mfr) unexpected.push(`${id}: mfr ${a.mfr}→${b.mfr}`);
            const approvedCargo = APPROVED_CARGO_CHANGES.get(id);
            if (a.cargo !== b.cargo && (!approvedCargo || a.cargo !== approvedCargo[0] || b.cargo !== approvedCargo[1])) unexpected.push(`${id}: cargo ${a.cargo}→${b.cargo}`);
            // 허용된 이관: OFF는 focus 배지, ON은 canonical role 배지(219/219 role 보유 → 전부 표시).
            if (!a.focusBadge) unexpected.push(`${id}: OFF focus 배지 없음(기준선 위반)`);
            if (b.focusBadge) unexpected.push(`${id}: ON focus 배지 잔존(role 배지로 이관돼야)`);
            if (!b.canonicalRole) unexpected.push(`${id}: ON canonical role 없음`);
            // 허용된 제거: 태그·가격 스탯
            if (b.tagCount !== 0) unexpected.push(`${id}: ON 태그 잔존(${b.tagCount})`);
            if (b.priceStat) unexpected.push(`${id}: ON priceUsd 잔존`);
        }
        expect(unexpected).toEqual([]);
    });

    test('컨트롤·비교: price 정렬 제거, 필터=canonical role 칩으로 이관, 비교 분류·price 행 제거·role=Erkul', async ({ page }) => {
        // ON
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
        expect(await page.locator('#ship-sort option[value^="price"]').count()).toBe(0);
        // 필터: VOLT focus/tags 칩 제거 → canonical role 단일 검색형 콤보박스(집합에서만 생성). 옵션 키는 Erkul EN role.
        await expect.poll(async () => page.locator('#ship-tag-filters [data-role-option]').count()).toBeGreaterThan(0);
        expect(await page.locator('#ship-tag-filters [data-ship-tag-filter]').count()).toBe(0);
        expect(await page.locator('#ship-tag-filters [data-role-option="Medium Freight"]').count()).toBe(1);
        // purpose(VOLT 편집 프리셋)는 ON에서 숨김
        await expect(page.locator('#ship-purpose')).toBeHidden();
        for (const id of ['freelancer', 'caterpillar']) await page.locator(`[data-compare-ship-id="${id}"]`).click();
        await page.locator('#ship-compare-open').click();
        await page.waitForSelector('.ship-compare-table');
        expect(await page.locator('.ship-compare-table tr', { hasText: '분류' }).count()).toBe(0);
        expect(await page.locator('.ship-compare-table tr', { hasText: 'USD' }).count()).toBe(0);
        // 역할 행 유지 + 값은 canonical role KO(freelancer=Light Freight→경 화물선, caterpillar=Medium Freight→중형 화물선)
        const roleRow = await page.locator('.ship-compare-table tr', { hasText: '역할' }).innerText();
        expect(roleRow).toContain('경 화물선');
        expect(roleRow).toContain('중형 화물선');
        // crew = Erkul(4), cargo Erkul 값 표시
        const crew = await page.locator('.ship-compare-table tr', { hasText: '승무원' }).innerText();
        expect(crew).toContain('4');
        expect(crew).not.toContain('1명');
    });

    test('RSI 카탈로그: ON에서만 30척 별도 표시(concept 28/flight-ready 2)', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.locator('[data-catalog-chip]').click();
        await expect(page.locator('.rsi-catalog-card')).toHaveCount(30);
        expect(await page.locator('.rsi-catalog-badge-concept').count()).toBe(28);
        expect(await page.locator('.rsi-catalog-badge-flight-ready').count()).toBe(2);
    });
});
