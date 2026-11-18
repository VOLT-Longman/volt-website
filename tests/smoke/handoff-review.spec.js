const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');
const mining = require('../../data/mining/mining.json');
const hauling = require('../../data/contracts/hauling.json');

for (const width of [1280, 390]) test(`${width}px 장바구니에서 장착으로 돌아가는 탭을 고정 수치 막대가 가리지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('asgard');
    await page.locator('[data-loadout-ship="anvl_asgard"]').click();
    for (const tab of ['weapons', 'finder', 'cart', 'slots']) {
        await page.locator(`[data-loadout-tab="${tab}"]`).click({ timeout: 5000 });
        await expect(page.locator(`[data-loadout-tab="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
    }
    await page.locator('.loadout-slot [data-loadout-open]').first().click({ timeout: 5000 });
    await expect(page.locator('.loadout-picker')).toBeVisible();
});

test('광물별 상세도 같은 암석의 구성 두 줄과 소수 함량을 보존한다', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#mining');
    await page.locator('[data-mining-mineral="Ore_Aluminum"]').first().click();
    const expected = mining.locations.flatMap((l) => l.groups.flatMap((g) => g.rocks.flatMap((r) => r.minerals.filter((m) => m.id === 'Ore_Aluminum')))).length;
    await expect(page.locator('.mining-detail tbody tr')).toHaveCount(expected);
    await expect(page.locator('.mining-detail')).toContainText('2.8–6.8%');
    await expect(page.locator('.mining-detail')).toContainText('39.2–83.2%');
    await expect(page.locator('.mining-list')).toContainText('한 개의 판매 가격이 아닙니다');
    await page.locator('[data-mining-mode="ship"]').click();
    await expect(page.locator('[data-mining-mode="ship"]')).toBeFocused();
});

test('운송 주문 44·44·40을 합치거나 중복 제거하지 않는다', async ({ page }) => {
    await mockApi(page);
    const contract = hauling.contracts.find((c) => c.id === 'HaulCargo_SingleToMulti_Interstellar_Bulk_OrganiMass');
    await page.route('**/data/contracts/hauling.json*', (route) => route.fulfill({ json: { ...hauling, contracts: [contract] } }));
    await gotoSection(page, '#hauling');
    await expect(page.locator('.hauling-cargo li')).toHaveCount(3);
    await expect(page.locator('.hauling-cargo strong')).toHaveText(['최소 44 SCU (상한 미확인)', '최소 44 SCU (상한 미확인)', '최소 40 SCU (상한 미확인)']);
});

test('채광·운송 동적 이름과 분류는 HTML로 해석하지 않는다', async ({ page }) => {
    await mockApi(page);
    const attack = '<img src=x onerror="window.guideInjected=true">';
    const mineral = { ...mining.minerals[0], name: { en: attack, ko: attack }, modes: ['ship" data-injected="yes'] };
    await page.route('**/data/mining/mining.json*', (route) => route.fulfill({ json: { ...mining, minerals: [mineral] } }));
    await gotoSection(page, '#mining');
    await expect(page.locator('.mining-list')).toContainText(attack);
    await expect(page.locator('#mining-app img, #mining-app [data-injected]')).toHaveCount(0);
    expect(await page.evaluate(() => window.guideInjected)).toBeUndefined();
});

test('운송 동적 의뢰처 이름을 HTML로 해석하지 않는다', async ({ page }) => {
    await mockApi(page);
    const attack = '<img src=x onerror="window.guideInjected=true">';
    await page.route('**/data/contracts/hauling.json*', (route) => route.fulfill({ json: { ...hauling, contractors: Object.fromEntries(Object.keys(hauling.contractors).map((key) => [key, { en: attack, ko: attack }])) } }));
    await page.goto('/#hauling');
    await expect(page.locator('.hauling-table')).toContainText(attack);
    await expect(page.locator('#hauling-app img')).toHaveCount(0);
    expect(await page.evaluate(() => window.guideInjected)).toBeUndefined();
});
