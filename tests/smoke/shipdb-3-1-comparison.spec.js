const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');
const canonical = require('../../data/canonical/ships-canonical.json');
const rsiOfficial = require('../../data/canonical/ships-rsi-official.json');
const aliases = require('../../data/canonical/edition-aliases.json');

const LIVE_IDS = new Set(canonical.ships.map((ship) => ship.id));
const RSI_IDS = new Set(rsiOfficial.records.map((record) => record.id));
const ALIAS_IDS = new Set(aliases.aliases.map((alias) => alias.aliasId));
const APPROVED_CARGO_CHANGES = new Map([['intrepid', ['0 SCU', '8 SCU']]]);

async function captureCards(page) {
    return page.$$eval('#ships-grid .ship-card', (cards) => cards.map((card) => {
        const id = card.dataset.shipId || null;
        const cargo = [...card.querySelectorAll('.ship-stat')].find((stat) => (
            stat.querySelector('.ship-stat-label')?.textContent.includes('화물')
        ))?.querySelector('.ship-stat-value')?.textContent?.trim() || '';
        return {
            id,
            name: card.querySelector('.ship-name, .ship-name-btn')?.textContent?.trim() || '',
            manufacturer: card.querySelector('.ship-mfr')?.textContent?.trim() || '',
            cargo,
            focusBadge: !!card.querySelector('.ship-focus-badge'),
            canonicalRole: card.dataset.canonicalRole || '',
            priceStat: [...card.querySelectorAll('.ship-stat-label')].some((label) => label.textContent.includes('USD')),
            rsiStatus: card.dataset.rsiStatus || '',
        };
    }).filter((card) => card.id));
}

function byId(cards) {
    return Object.fromEntries(cards.map((card) => [card.id, card]));
}

async function loadState(page, enabled) {
    await page.addInitScript((flag) => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = flag; }, enabled);
    await mockApi(page);
    await gotoSection(page, '#ships');
    if (enabled) await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
    else await page.waitForSelector('#ships-grid .ship-card');
    return byId(await captureCards(page));
}

test.describe('3.1 전후 비교 (공식 공개 집합)', () => {
    test('메인 목록: OFF 256 → ON 249, 제외 7척은 중복 에디션 별칭뿐', async ({ browser }) => {
        const off = await loadState(await (await browser.newContext()).newPage(), false);
        const on = await loadState(await (await browser.newContext()).newPage(), true);
        expect(Object.keys(off)).toHaveLength(256);
        expect(Object.keys(on)).toHaveLength(249);
        const removed = Object.keys(off).filter((id) => !on[id]).sort();
        expect(removed).toEqual([...ALIAS_IDS].sort());
        expect(Object.keys(on).filter((id) => !off[id])).toEqual([]);
    });

    test('Erkul live 219척은 승인된 값 이외에 표시 회귀가 없고, RSI 30척은 공식 상태를 갖는다', async ({ browser }) => {
        const off = await loadState(await (await browser.newContext()).newPage(), false);
        const on = await loadState(await (await browser.newContext()).newPage(), true);
        const unexpected = [];
        for (const id of LIVE_IDS) {
            const before = off[id];
            const after = on[id];
            if (!before || !after) { unexpected.push(id + ': shared missing'); continue; }
            if (before.name !== after.name) unexpected.push(id + ': name');
            if (before.manufacturer !== after.manufacturer) unexpected.push(id + ': manufacturer');
            const approvedCargo = APPROVED_CARGO_CHANGES.get(id);
            if (before.cargo !== after.cargo && (!approvedCargo || before.cargo !== approvedCargo[0] || after.cargo !== approvedCargo[1])) unexpected.push(id + ': cargo');
            if (!before.focusBadge || after.focusBadge || !after.canonicalRole || after.priceStat) unexpected.push(id + ': canonical presentation');
        }
        expect(unexpected).toEqual([]);
        expect([...RSI_IDS].every((id) => on[id]?.rsiStatus)).toBe(true);
    });

    test('컨트롤: price 정렬 제거, 공식 역할 필터 67개, RSI는 무역 플래너 제외', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        expect(await page.locator('#ship-sort option[value^="price"]').count()).toBe(0);
        await expect.poll(async () => page.locator('#ship-tag-filters [data-role-option]').count()).toBe(68);
        expect(await page.locator('#ship-tag-filters [data-ship-tag-filter]').count()).toBe(0);
        expect(await page.locator('#ships-grid [data-ship-id="arrastra"] [data-use-planner-ship-id]').count()).toBe(0);
        expect(await page.locator('#ships-grid [data-ship-id="atls"] [data-use-planner-ship-id]').count()).toBe(0);
    });
});
