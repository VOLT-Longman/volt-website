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

test('착용 시험: 방어구를 입히면 부위별 한 발 피해가 게임 파일 배율대로 바뀐다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openGear(page);
    await page.locator('#gear-search').fill('P4-AR');
    await page.locator('.gear-list [data-gear-pick]').first().click();
    await page.locator('[data-gear-shoot]').click();
    await expect(page.locator('.gear-tab.is-active')).toHaveText('착용 시험');
    await expect(page.locator('#gear-fit-weapon')).toHaveValue('behr_rifle_ballistic_01');
    const row = (name) => page.locator('.gear-fit-table tbody tr').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
    // 맨몸, 거리 10m: P4-AR 한 발 12. 머리 ×4 = 48, 몸통 ×2 = 24, 팔다리 ×1.5 = 18. 전체 체력 70.
    await expect(row('머리')).toContainText('맨몸');
    await expect(row('머리').locator('td').nth(1)).toHaveText('48');
    await expect(row('몸통').locator('td').nth(1)).toHaveText('24');
    await expect(row('몸통')).toContainText('3발');
    await expect(row('왼팔').locator('td').nth(1)).toHaveText('18');
    // 중(重)장갑 코어(피해 감소 40%)를 입히면 몸통은 12 × 1 × 0.6 = 7.2, 10발.
    await page.locator('[data-gear-slot="core"]').selectOption('cds_armor_heavy_core_01');
    await expect(page.locator('[data-gear-slot="core"]')).toBeFocused();
    await expect(row('몸통').locator('td').nth(1)).toHaveText('7.2');
    await expect(row('몸통')).toContainText('10발');
    await expect(page.locator('.gear-body-part.is-covered')).toHaveCount(1);
    // 거리 60m: 40m부터 미터당 0.05 감소 → 11. 몸통 6.6.
    await page.locator('#gear-fit-distance').fill('60');
    await page.locator('#gear-fit-distance').dispatchEvent('change');
    await expect(row('몸통').locator('td').nth(1)).toHaveText('6.6');
    // 다시 열어도 입힌 상태가 남는다.
    await page.reload();
    await page.locator('[data-gear-view="fit"]').click();
    await expect(page.locator('[data-gear-slot="core"]')).toHaveValue('cds_armor_heavy_core_01');
    await page.locator('[data-gear-clear-fit]').click();
    await expect(page.locator('[data-gear-slot="core"]')).toHaveValue('');
    expect(errors).toEqual([]);
});

test('방어구 상세에서 착용 시험으로 입히고, 장바구니에 담아 합계와 상점별 목록을 본다', async ({ page }) => {
    await openGear(page);
    await page.locator('[data-gear-view="armor"]').click();
    await page.locator('#gear-search').fill('ADP-mk4');
    await page.locator('#gear-slot').selectOption('core');
    await page.locator('.gear-list [data-gear-pick]').first().click();
    await page.locator('[data-gear-wear]').click();
    await expect(page.locator('.gear-tab.is-active')).toHaveText('착용 시험');
    await expect(page.locator('[data-gear-slot="core"]')).not.toHaveValue('');
    // 장바구니: 가격이 있는 P4-AR 기본형 두 개와 가격을 모르는 변종 하나.
    await page.locator('[data-gear-view="weapon"]').click();
    await page.locator('#gear-search').fill('P4-AR');
    await page.locator('.gear-list [data-gear-pick]').first().click();
    const priced = page.locator('.gear-variants tbody tr').filter({ hasText: 'Cubby Blast' }).locator('[data-gear-add]');
    await priced.click();
    await expect(priced).toBeFocused();
    await priced.click();
    await expect(priced).toHaveText('담김 2');
    await page.locator('.gear-variants tbody tr').filter({ hasText: '판매처 정보 없음' }).first().locator('[data-gear-add]').click();
    await expect(page.locator('[data-gear-view="cart"]')).toHaveText('장바구니 3');
    await page.locator('[data-gear-view="cart"]').click();
    await expect(page.locator('.gear-cart-total')).toContainText('10,260');
    await expect(page.locator('.gear-special')).toContainText('가격 미확인 1종');
    await expect(page.locator('.gear-shoplist')).toContainText('Cubby Blast');
    await page.locator('[data-gear-qty][data-step="-1"]').first().click();
    await expect(page.locator('.gear-cart-total')).toContainText('5,130');
    await page.reload();
    await expect(page.locator('[data-gear-view="cart"]')).toHaveText('장바구니 2');
    await page.locator('[data-gear-view="cart"]').click();
    await page.locator('[data-gear-clear-cart]').click();
    await expect(page.locator('.gear-empty')).toBeVisible();
});

for (const width of [1280, 390]) {
    test(`착용 시험·장바구니: ${width}px 에서 넘치지 않고 접근성 위반이 없다`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await openGear(page);
        await page.locator('.gear-list [data-gear-pick]').first().click();
        await page.locator('[data-gear-add]').first().click();
        await page.locator('[data-gear-shoot]').click();
        await expect(page.locator('.gear-fit-table')).toBeVisible();
        for (const view of ['fit', 'cart']) {
            await page.locator(`[data-gear-view="${view}"]`).click();
            await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            const results = await new AxeBuilder({ page }).include('#gear').analyze();
            expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
        }
    });
}
