const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

const titan = { uuid: '0079c5d5-1678-4f8c-85ba-18ca8f642af6', name: 'Aegis Avenger Titan', shops: [
    { shop: 'New Deal', place: 'Lorville', system: 'Stanton', price: 1350000, updatedAt: 1700000000 },
    { shop: 'Astro Armada', place: 'Area18', system: 'Stanton', price: 1450000 },
] };
const asgard = { uuid: '8ffde65b-ee9b-4a50-b386-3111175736b2', name: 'Anvil Asgard', shops: [{ shop: 'Asgard seller', price: 9000000 }] };
const payload = (data) => ({ status: 'ok', data, meta: { source: 'uex', fetchedAt: '2026-11-18T01:00:00Z' } });
async function choose(page, query, cls) {
    if (!await page.locator('#loadout-ship-search').isVisible()) await page.locator('[data-loadout-browse]').click();
    await page.locator('#loadout-ship-search').fill(query);
    await page.locator(`[data-loadout-ship="${cls}"]`).click();
}

for (const width of [1440, 390, 320]) test(`${width}px 관련 성능을 묶고 함선 판매처를 펼쳐 본다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.route('**/api/uex/ship-prices', route => route.fulfill({ json: payload([titan, asgard]) }));
    await gotoSection(page, '#loadout');
    await choose(page, 'titan', 'aegs_avenger_titan');
    const market = page.locator('.loadout-ship-market');
    await expect(market).toContainText('1,350,000 aUEC');
    await expect(market.getByText('Astro Armada', { exact: true })).toBeHidden();
    await market.getByText('다른 판매처 1곳', { exact: true }).click();
    await expect(market.getByText('Astro Armada', { exact: true })).toBeVisible();
    await expect(page.locator('.loadout-power-plan .loadout-system-facts')).toContainText('파워 플랜트 출력');
    await expect(page.locator('.loadout-power-plan .loadout-system-facts')).toContainText('쿨러 냉각량');
    await expect(page.locator('.loadout-hull .loadout-signatures')).toContainText('EM 시그니쳐');
    await expect(page.locator('.loadout-power-plan')).not.toContainText('EM 시그니쳐');
    await page.locator('[data-loadout-jump="equipment"]').click();
    await page.locator('.loadout-group.is-shield [data-loadout-power]').first().click();
    await expect(page.locator('.loadout-system-facts .loadout-change').first()).toBeVisible();
    await expect(page.locator('.loadout-signatures .loadout-change').first()).toContainText('−');
    await page.locator('[data-loadout-undo]').click();
    await expect(market.getByText('Astro Armada', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width === 1440) {
        await page.locator('.lang-btn[data-set-lang="en"]').first().click();
        await expect(market).toContainText('Ship purchase locations');
        await expect(market).toContainText('UEX community reports');
    }
});

test('판매처 조회 실패는 다시 시도할 수 있고 부품 편집을 막지 않는다', async ({ page }) => {
    await mockApi(page); let calls = 0;
    await page.route('**/api/uex/ship-prices', route => ++calls === 1 ? route.fulfill({ status: 503, json: { error: 'unavailable' } }) : route.fulfill({ json: payload([{ ...titan, shops: [] }]) }));
    await gotoSection(page, '#loadout');
    await choose(page, 'titan', 'aegs_avenger_titan');
    await expect(page.locator('.loadout-ship-market')).toContainText('불러오지 못했습니다');
    await page.locator('[data-loadout-ship-market-retry]').click();
    await expect(page.locator('.loadout-ship-market')).toContainText('확인된 인게임 판매처가 없습니다');
    await page.locator('.loadout-slot [data-loadout-open]').first().click();
    await expect(page.locator('.loadout-picker')).toBeVisible();
});

test('판매처는 충돌하는 UUID나 여러 이름 후보를 연결하지 않고 고유번호 없는 정확한 이름만 구별한다', async ({ page }) => {
    await mockApi(page);
    let data = [{ ...titan, uuid: 'conflicting-uuid' }];
    await page.route('**/api/uex/ship-prices', route => route.fulfill({ json: payload(data) }));
    await gotoSection(page, '#loadout');
    await choose(page, 'titan', 'aegs_avenger_titan');
    await expect(page.locator('.loadout-ship-market')).toContainText('같은 함선을 확인하지 못했습니다');
    data = [{ ...titan, uuid: '' }, { ...titan, uuid: '' }];
    await page.reload();
    await expect(page.locator('.loadout-ship-market')).toContainText('같은 함선을 확인하지 못했습니다');
    data = [{ ...titan, uuid: '' }];
    await page.reload();
    await expect(page.locator('.loadout-ship-market')).toContainText('영문 이름 일치 기준');
    await expect(page.locator('.loadout-ship-market')).toContainText('New Deal');
});

test('느린 판매처 응답은 현재 함선에 연결되고 열린 교체창의 초점을 빼앗지 않는다', async ({ page }) => {
    await mockApi(page); let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/uex/ship-prices', async route => { await gate; await route.fulfill({ json: payload([titan, asgard]) }); });
    await gotoSection(page, '#loadout');
    await choose(page, 'titan', 'aegs_avenger_titan');
    await choose(page, 'asgard', 'anvl_asgard');
    await page.locator('.loadout-slot [data-loadout-open]').first().click();
    const search = page.locator('#loadout-picker-search');
    await search.fill('test');
    const delivered = page.waitForResponse('**/api/uex/ship-prices');
    release(); await delivered;
    await expect(search).toBeFocused();
    await search.press('Escape');
    await expect(page.locator('.loadout-ship-market')).toContainText('Asgard seller');
    await expect(page.locator('.loadout-ship-market')).not.toContainText('New Deal');
});
