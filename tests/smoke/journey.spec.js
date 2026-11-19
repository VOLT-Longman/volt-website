const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

function market(id, stale = false) {
    const date_modified = Math.floor(Date.now() / 1000) - (stale ? 4 * 86400 : 0);
    return [
        { id_commodity: id, commodity_name: id === 1 ? 'Gold' : 'Iron', id_terminal: 101, terminal_name: 'Port A', price_buy: 100, price_sell: 0, scu_buy: 12, date_modified },
        { id_commodity: id, commodity_name: id === 1 ? 'Gold' : 'Iron', id_terminal: 102, terminal_name: 'Port B', price_buy: id === 1 ? 120 : 0, price_sell: 180, scu_sell: 9, date_modified },
    ];
}
async function setup(page, requests = [], { stale = false, missingDeparture = false } = {}) {
    await mockApi(page, { fleet: true });
    let preferences = { favorites: [], planner: {} };
    await page.route('**/api/me/preferences', route => {
        if (route.request().method() === 'PUT') preferences = { ...preferences, ...route.request().postDataJSON() };
        return route.fulfill({ json: { preferences } });
    });
    const { toolReviewJourney, validateJourneyContext } = await import('../../functions/_shared/ai-journey.js');
    const env = { ASSETS: { fetch: async url => new Response(await readFile(path.join(__dirname, '../..', new URL(url).pathname))) } };
    await page.route('**/api/uex/**', route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname === '/api/uex/commodities') data = [{ id: 1, name: 'Gold', is_visible: 1, is_available_live: 1 }, { id: 2, name: 'Iron', is_visible: 1, is_available_live: 1 }];
        if (/\/commodities\/\d+\/prices/.test(url.pathname)) {
            data = market(Number(url.pathname.split('/')[4]), stale);
            if (missingDeparture) data = data.map(row => row.id_terminal === 102 ? { ...row, price_buy: 0 } : row);
        }
        if (url.pathname === '/api/uex/location-prices') data = [market(1)[1]];
        return route.fulfill({ json: { status: 'ok', data } });
    });
    await page.route('**/api/ai/chat', async route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true, mode: 'data', memberOnly: true } });
        const body = route.request().postDataJSON(); requests.push(body);
        const original = globalThis.fetch;
        globalThis.fetch = async url => Response.json({ data: market(Number(new URL(url).pathname.split('/')[4]), stale) });
        try {
            const result = await toolReviewJourney(env, new Request(route.request().url()), validateJourneyContext(body.context), body.lang);
            return route.fulfill({ json: { ok: true, intent: 'journey', ...result } });
        } finally { globalThis.fetch = original; }
    });
}
async function selectTransport(page) {
    await page.locator('#logistics-ship-search').fill('titan');
    await page.locator('#logistics-ship-results [data-planner-ship-id="avenger-titan"]').click();
    await expect(page.locator('#logistics-cargo')).toHaveValue('8');
}
async function chooseIron(page) {
    await page.locator('#uex-commodity-search').fill('Iron');
    await page.locator('#uex-commodity-results [data-commodity-id="2"]').click();
    await page.locator('#uex-refresh').click();
    await expect(page.locator('#journey-trade-plan')).toContainText('Port B');
}

for (const width of [1440, 390]) test(`${width}px 제작 → 채광 → 운송 → AI 검토와 복귀`, async ({ page }) => {
    const requests = [], errors = trackConsoleErrors(page);
    await page.setViewportSize({ width, height: 900 }); await setup(page, requests);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('prospector');
    await page.locator('[data-loadout-ship="misc_prospector"]').click();
    await expect(page.locator('#loadout-ship-title')).toContainText('프로스펙터');
    await page.locator('.loadout-slot:not(.is-parent)', { hasText: '아버 MH1 채광 레이저' }).first().locator('[data-loadout-detail]').click();
    await page.locator('[data-loadout-detail-tab="craft"]').click();
    await page.locator('[data-loadout-craft-plan]').click();
    await expect(page.locator('#journey-crafts h3')).toBeFocused();
    await page.locator('#journey-crafts input[type="number"]').fill('2');
    await expect(page.locator('[data-journey-resource="Iron"]')).toContainText('0.72 SCU');
    await expect(page.locator('[data-journey-resource="Sadaryx"]')).toContainText('14 개');
    await page.locator('[data-journey-resource="Iron"]').getByRole('button', { name: '캐는 곳', exact: true }).click();
    await expect(page.locator('.mining-detail h3')).toContainText('철 (광석)');
    await page.locator('.journey-mining-next').getByRole('button', { name: '팔 곳 찾기' }).click();
    await expect(page).toHaveURL(/#trade-planner$/);
    await expect(page.locator('#journey-trade-mode')).toHaveValue('sell');
    await expect(page.locator('#uex-commodity-select')).toHaveValue('2');
    await selectTransport(page);
    await page.locator('#journey-quantity').fill('8');
    await expect(page.locator('.journey-totals')).toContainText('1,440 aUEC');
    await expect(page.locator('.journey-totals')).not.toContainText('매매 차익');
    await page.locator('#journey-trade-mode').selectOption('buy');
    await page.locator('#journey-budget').fill('500');
    await expect(page.locator('.journey-totals')).toContainText('5 SCU');
    await expect(page.locator('.journey-totals')).toContainText('400 aUEC');
    await page.locator('#journey-trade-plan').getByRole('button', { name: 'AI로 이 운송 계획 검토' }).click();
    expect(requests).toHaveLength(0);
    await page.locator('#volt-ai-send').click();
    await expect(page.locator('.volt-ai-review')).toContainText('400');
    expect(requests[0].context).toMatchObject({ kind: 'journey', origin: 'trade', shipId: 'prospector', transportShipId: 'avenger-titan', loadout: { ship: 'misc_prospector' }, crafts: [{ count: 2 }], commodityId: 2, buyTerminal: 101, sellTerminal: 102 });
    await page.locator('.volt-ai-review').getByRole('button', { name: '무역 계획으로 돌아가기' }).click();
    await expect(page.locator('#journey-budget')).toHaveValue('500');
    await expect(page.locator('#logistics-ship')).toHaveValue('avenger-titan');
    await page.locator('#journey-trade-plan').getByRole('button', { name: '판매한 곳에서 다음 운송 찾기' }).click();
    await page.locator('#journey-next-cargo').getByRole('button', { name: /Gold/ }).click();
    await page.locator('#journey-quantity').fill('4');
    await expect(page.locator('.journey-totals')).toContainText('480 aUEC');
    await page.reload();
    await expect(page.locator('#uex-commodity-select')).toHaveValue('1');
    await expect(page.locator('.journey-totals')).toContainText('480 aUEC');
    await expect(page.locator('#journey-budget')).toHaveValue('500');
    const audit = await new AxeBuilder({ page }).include('#journey-trade').include('#journey-trade-plan').analyze();
    expect(audit.violations.filter(row => ['serious', 'critical'].includes(row.impact))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
});

test('오래된 시세는 계산을 보류하고 상품 변경 중 이전 거래를 AI에 전달하지 않는다', async ({ page }) => {
    const requests = []; await setup(page, requests, { stale: true });
    await gotoSection(page, '#trade-planner'); await selectTransport(page); await chooseIron(page);
    await page.locator('#journey-budget').fill('500'); await page.locator('#journey-quantity').fill('8');
    await expect(page.locator('.journey-trade-result')).toContainText('3일');
    await expect(page.locator('.journey-totals')).toHaveCount(0);
    await page.locator('#uex-commodity-search').fill('Gold');
    await page.locator('#uex-commodity-results [data-commodity-id="1"]').click();
    await page.locator('#journey-trade').getByRole('button', { name: 'AI로 현재 계획 검토' }).click();
    await page.locator('#volt-ai-send').click();
    await expect(page.locator('.volt-ai-review')).toContainText('금액 계산 보류');
    expect(requests[0].context).toMatchObject({ commodityId: 1, buyTerminal: null, sellTerminal: null });
});

test('다음 출발지 가격이 없어지면 더 싼 다른 장소로 몰래 바꾸지 않는다', async ({ page }) => {
    await setup(page, [], { missingDeparture: true }); await gotoSection(page, '#trade-planner'); await selectTransport(page); await chooseIron(page);
    await page.locator('#journey-trade-plan').getByRole('button', { name: '판매한 곳에서 다음 운송 찾기' }).click();
    await page.locator('#journey-next-cargo').getByRole('button', { name: /Gold/ }).click();
    await expect(page.locator('#uex-results')).toContainText('선택한 출발지의 구매 가격 자료가 없습니다');
    await expect(page.locator('.journey-totals')).toHaveCount(0);
});

test('채광 장소와 광물 선택을 AI 왕복 후에도 유지하고 운송 화면을 영어로 바꾼다', async ({ page }) => {
    const requests = []; await setup(page, requests); await gotoSection(page, '#mining');
    await page.getByRole('button', { name: '철 (광석)', exact: true }).click();
    const place = page.locator('.mining-detail [data-mining-location]').first();
    const locationId = await place.getAttribute('data-mining-location');
    await place.click();
    const title = await page.locator('.mining-detail h3').innerText();
    await page.locator('#journey-mining').getByRole('button', { name: 'AI로 현재 계획 검토' }).click();
    await page.locator('#volt-ai-send').click();
    await expect(page.locator('.volt-ai-review')).toContainText('선택한 채광 장소');
    expect(requests[0].context.locationId).toBe(locationId);
    await page.locator('.volt-ai-review').getByRole('button', { name: '채광 안내로 돌아가기' }).click();
    await expect(page.locator('.mining-detail h3')).toHaveText(title);
    await expect(page.locator('#mining-view-location')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#journey-mining').getByRole('button', { name: '무역', exact: true }).click();
    await page.locator('.nav-lang [data-set-lang="en"]').click();
    await expect(page.locator('#journey-trade-plan h3')).toHaveText('This trip');
    await expect(page.locator('#journey-trade-mode')).toContainText('Sell cargo already held');
});

test('광물에서 그 재료를 사용하는 부품을 찾아 제작 계획에 추가한다', async ({ page }) => {
    const errors = trackConsoleErrors(page); await setup(page); await gotoSection(page, '#mining');
    await page.getByRole('button', { name: '철 (광석)', exact: true }).click();
    await page.locator('.journey-mining-next').getByRole('button', { name: '제작에 쓰는 부품 보기' }).click();
    await page.getByRole('searchbox', { name: '부품 이름 검색' }).fill('아버 MH1');
    await page.locator('.journey-recipe-list').getByRole('button', { name: '아버 MH1 채광 레이저 +' }).click();
    await expect(page.locator('[data-journey-resource="Iron"]')).toContainText('0.36 SCU');
    await expect(page.locator('[data-journey-resource="Sadaryx"]')).toContainText('7 개');
    expect(errors).toEqual([]);
});
