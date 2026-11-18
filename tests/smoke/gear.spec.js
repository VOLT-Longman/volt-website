const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

const P4AR = '02d4cd2e-fa98-4086-aee1-6b2dfce8ea27'; // behr_rifle_ballistic_01 = P4-AR 소총 (기본형)

// 가격은 UEX 프록시를 모의한다. 기본형 하나에만 판매처를 준다.
async function openGear(page, { prices = { [P4AR]: [{ shop: 'Cubby Blast', place: 'Area18', system: 'Stanton', price: 5130 }, { shop: 'Live Fire Weapons', place: 'Port Tressler', system: 'Stanton', price: 5400 }] } } = {}) {
    await mockApi(page);
    await page.route('**/api/uex/loadout-prices**', (route) => {
        const category = new URL(route.request().url()).searchParams.get('category');
        return route.fulfill({ json: { status: 'ok', data: category === '18' ? prices : {}, byName: [] } });
    });
    await gotoSection(page, '#gear');
    await expect(page.locator('#gear-app .gear-table').first()).toBeVisible();
}

test('개인 장비: 무기를 고르면 수치와 발사 방식, 변종별 판매처가 나온다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openGear(page);
    await expect(page.locator('#gear h2')).toContainText('개인');
    await page.locator('#gear-search').fill('P4-AR');
    const row = page.locator('.gear-list tbody tr').first();
    await expect(row).toContainText('P4-AR 소총');
    await expect(row).toContainText('변종');
    await expect(row).toContainText('5,130');
    await row.locator('[data-gear-pick]').click();
    const detail = page.locator('.gear-detail');
    await expect(detail.locator('h3')).toBeFocused();
    await expect(detail).toContainText('탄창');
    await expect(detail).toContainText('발사 방식');
    await expect(detail).toContainText('게임 파일 값');
    // 변종: 수치는 같고 판매처만 다르다. 기본형에는 가장 싼 상점이, 나머지에는 "판매처 정보 없음"이 나온다.
    const variants = detail.locator('.gear-variants tbody tr');
    expect(await variants.count()).toBeGreaterThan(5);
    await expect(variants.filter({ hasText: 'Cubby Blast' })).toHaveCount(1);
    await expect(variants.filter({ hasText: 'Cubby Blast' })).toContainText('2곳');
    await expect(variants.filter({ hasText: '판매처 정보 없음' }).first()).toBeVisible();
    expect(errors).toEqual([]);
});

test('개인 장비: 변종 이름으로 찾아도 그 묶음이 나오고, 순차 발사 무기는 계산한 연사를 보여 준다', async ({ page }) => {
    await openGear(page);
    await page.locator('#gear-search').fill('워호크');
    // 같은 스킨 이름이 여러 무기에 있다. 변종 이름으로 찾으면 그 변종을 가진 묶음들이 나온다.
    await expect(page.locator('.gear-list tbody tr').filter({ hasText: 'P4-AR 소총' })).toHaveCount(1);
    expect(await page.locator('.gear-list tbody tr').count()).toBeLessThan(15);
    await page.locator('#gear-search').fill('스칼펠');
    await page.locator('.gear-list [data-gear-pick]').first().click();
    await expect(page.locator('.gear-detail')).toContainText('한 번 당겨 2발');
    await expect(page.locator('.gear-detail')).toContainText('발사 순서의 대기 시간으로 계산한 값');
    await page.locator('#gear-search').fill('');
    await page.locator('#gear-kind').selectOption('sniper');
    for (const cell of await page.locator('.gear-list tbody td:nth-child(2)').allTextContents()) expect(cell).toContain('저격소총');
    await page.locator('#gear-sort').selectOption('dps');
    await expect(page.locator('#gear-sort')).toBeFocused();
});

test('개인 장비: 방어구는 부위·등급으로 거르고 피해 감소와 변종을 보여 준다', async ({ page }) => {
    await openGear(page);
    await page.locator('[data-gear-view="armor"]').click();
    await expect(page.locator('.gear-tab.is-active')).toHaveText('방어구');
    await expect(page.locator('.gear-list tbody tr').first()).toBeVisible();
    await page.locator('#gear-slot').selectOption('core');
    await page.locator('#gear-class').selectOption('heavy');
    for (const cell of await page.locator('.gear-list tbody td:nth-child(3)').allTextContents()) expect(cell).toBe('중(重)장갑');
    await page.locator('#gear-search').fill('ADP-mk4');
    await page.locator('.gear-list [data-gear-pick]').first().click();
    const detail = page.locator('.gear-detail');
    await expect(detail).toContainText('피해 감소');
    await expect(detail).toContainText('40%');
    await expect(detail).toContainText('견디는 온도');
    await expect(detail.locator('.gear-variants tbody tr').first()).toBeVisible();
    await page.locator('.nav-lang [data-set-lang="en"]').click();
    await expect(page.locator('.gear-tab').first()).toHaveText('Weapons');
    await expect(page.locator('.gear-sources')).toContainText('game files');
});

test('개인 장비: 가격을 받지 못해도 수치는 보이고, 자료 실패는 다시 시도할 수 있다', async ({ page }) => {
    await mockApi(page);
    await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ status: 503, json: { error: 'down' } }));
    let fail = true;
    await page.route('**/data/gear/weapons.json*', (route) => (fail ? route.fulfill({ status: 500, body: 'x' }) : route.continue()));
    await gotoSection(page, '#gear');
    await expect(page.locator('#gear-app [role="alert"]')).toBeVisible();
    fail = false;
    await page.locator('[data-gear-retry]').click();
    await expect(page.locator('.gear-list tbody tr').first()).toBeVisible();
    await page.locator('.gear-list [data-gear-pick]').first().click();
    await expect(page.locator('.gear-variants')).toContainText('가격을 불러오지 못했습니다');
});

test('개인 장비: 자료의 이름과 분류 값은 화면에 요소나 속성으로 들어가지 않는다', async ({ page }) => {
    await mockApi(page);
    await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {}, byName: [] } }));
    await page.route('**/data/gear/weapons.json*', (route) => route.fulfill({ json: { version: 'x', groups: [{ id: 'x" onmouseover="alert(1)', name: { en: '<img src=x onerror=alert(1)>', ko: '<b>굵게</b>' }, kind: 'rifle"><script>alert(1)</script>', size: 2, modes: [{ k: 'rapid', rpm: 600, basis: 'automatic' }], mag: 30, ammo: { dmg: { physical: 10 }, speed: 500, range: 900 }, variants: [['u1', '<i>v</i>', '<i>변종</i>']] }] } }));
    await gotoSection(page, '#gear');
    await expect(page.locator('.gear-list tbody tr')).toHaveCount(1);
    await page.locator('.gear-list [data-gear-pick]').click();
    await expect(page.locator('#gear-app img, #gear-app script, #gear-app b, #gear-app i')).toHaveCount(0);
    await expect(page.locator('#gear-app [onmouseover]')).toHaveCount(0);
    await expect(page.locator('.gear-detail h3')).toHaveText('<b>굵게</b>');
});

for (const width of [1280, 390]) {
    test(`개인 장비: ${width}px 에서 넘치지 않고 접근성 위반이 없다`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await openGear(page);
        await page.locator('.gear-list [data-gear-pick]').first().click();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const results = await new AxeBuilder({ page }).include('#gear').analyze();
        expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
}
