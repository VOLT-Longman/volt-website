const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// 로드아웃 편집기: 함선 선택 → 부품 교체 → 요약·구매 목록 → 공유·저장 회귀 가드.
// 수치 자료는 저장소의 data/loadout(게임 파일에서 추출)을 그대로 쓰고, 가격(UEX)만 모의한다.
// 한국어 표기는 게임 한국어 패치 기준(data/loadout/ko.json)이다.
const MANTIS = 'b837397c-47b6-45e7-b409-db290a068b47'; // Mantis GT-220 Gatling = 맨티스 GT-220 개틀링
const DPS = '순간 DPS'; // 상단 핵심 수치의 이름표

async function openAsgard(page, { prices = {} } = {}) {
    await mockApi(page);
    await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: prices } }));
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('asgard');
    await page.locator('[data-loadout-ship="anvl_asgard"]').click();
    await expect(page.locator('#loadout-ship-title')).toHaveText('앤빌 아스가르드');
}
// 상단 핵심 수치·통계 패널의 수치: 이름표가 정확히 일치하는 칸의 값
const openBuilds = (page) => page.locator('[data-loadout-builds-toggle][aria-expanded="false"]').click();
const stat = (page, label) => page.locator('.loadout-stat, .loadout-kpi').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
const panel = (page) => page.locator('.loadout-panel');
const firstGunSlot = (page, name = 'CF-337 판터 리피터') => page.locator('.loadout-slot:not(.is-parent)', { hasText: name }).first();
// 첫 실드의 선택 창을 열어 그 안에서 전원을 끈다.
const shieldOff = async (page) => {
    await page.locator('.loadout-group.is-shield .loadout-slot').first().locator('[data-loadout-open]').click();
    await page.locator('.loadout-picker [data-loadout-power]').click();
};
const pick = (page, id) => page.locator(`.loadout-optrows [data-loadout-pick="${id}"]`);

test.describe('로드아웃 편집기', () => {
    test('고정 장비도 장착 개수에 포함하고 교체 버튼은 제공하지 않는다', async ({ page }) => {
        await openAsgard(page);
        const other = page.locator('.loadout-group.is-other');
        await expect(other.locator('h4')).toContainText('2곳');
        await expect(other.locator('.loadout-slot.is-fixed')).toHaveCount(2);
        await expect(other.locator('[data-loadout-open]')).toHaveCount(0);
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(other.locator('h4')).toContainText('2 slots');
    });

    test('레이더 교체 후 내부 배터리 장착칸이 나타나지 않는다', async ({ page }) => {
        await openAsgard(page);
        const group = page.locator('.loadout-group.is-radar');
        await expect(group.locator('.loadout-slot')).toHaveCount(1);
        await group.locator('[data-loadout-open]').click();
        const replacement = page.locator('.loadout-optrows [data-loadout-pick]:not([disabled])').filter({ hasNot: page.locator('.loadout-equipped') }).first();
        await replacement.click();
        await expect(group.locator('.loadout-slot')).toHaveCount(1);
        await expect(page.locator('#loadout-app')).not.toContainText('BatteryPort');
        await expect(page.locator('[data-loadout-open*="BatteryPort"]')).toHaveCount(0);
    });

    test('메뉴에서 들어가 함선을 고르면 기본 장착 요약과 출처가 보인다', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {} } }));
        await gotoSection(page, '');
        await page.locator('#nav-ships-toggle').click();
        await page.locator('.nav-links [data-section="loadout"]').click();
        await expect(page).toHaveURL(/#loadout$/);
        await expect(page.locator('#loadout .section-header h2')).toContainText('로드아웃');
        // 함선을 고르기 전에는 전체 목록을 바로 훑어볼 수 있다.
        await expect(page.locator('#loadout-ship-count')).toHaveText('전체 217척');
        await expect(page.locator('#loadout-ship-results [data-loadout-ship]')).toHaveCount(217);

        await page.locator('#loadout-ship-search').fill('아스가르드');
        await expect(page.locator('#loadout-ship-count')).toHaveText('검색 결과 1척');
        await page.locator('[data-loadout-ship="anvl_asgard"]').click();
        await expect(page.locator('#loadout-ship-title')).toHaveText('앤빌 아스가르드');
        await expect(stat(page, DPS)).toHaveText('5,313');
        await expect(panel(page)).toContainText(/파일럿\s*3,274/);
        // 함선 사진·제조사·크기가 머리 영역에 나온다.
        await expect(page.locator('.loadout-shiphead img.loadout-shipphoto')).toBeVisible();
        await expect(page.locator('.loadout-shipfacts')).toContainText('크기 4');
        await expect(page.locator('.loadout-shipstate')).toHaveText('기본 장착 상태');
        await expect(stat(page, '실드')).not.toHaveText('0');
        // 함선을 고르면 목록은 접히고, "함선 바꾸기"로 다시 펼친다.
        await expect(page.locator('#loadout-ship-results')).toHaveCount(0);
        await page.locator('[data-loadout-browse]').click();
        await expect(page.locator('#loadout-ship-results [data-loadout-ship]')).toHaveCount(217);
        await page.locator('[data-loadout-browse]').click();

        // 용어와 부품 이름은 게임 한국어 패치 표기를 따른다.
        const groups = await page.locator('.loadout-group h4').allInnerTexts();
        for (const term of ['실드 제너레이터', '파워 플랜트', '쿨러', '퀀텀 드라이브']) expect(groups.some((label) => label.includes(term)), term).toBe(true);
        await expect(page.locator('.loadout-panel-section', { hasText: '퀀텀 속도' })).toContainText('스풀링');
        // 목록은 한국어 이름만, 게임 원문 이름은 선택 창의 상세 줄에 둔다.
        await expect(firstGunSlot(page)).not.toContainText('CF-337 Panther Repeater');
        await expect(page.locator('#loadout-app')).not.toContainText(/양자|동력 장치|냉각기/);

        // 자료 출처를 화면에 밝힌다.
        const sources = page.locator('#loadout-sources');
        await expect(sources).toContainText('함선·부품 수치: Star Citizen 게임 파일에서 직접 추출');
        await expect(sources.locator('a')).toHaveCount(1);
        await expect(sources.locator('a', { hasText: 'UEX' })).toHaveAttribute('href', 'https://uexcorp.space/');
        await expect(sources).toContainText('한국어 표기: 스타 시티즌 한국어 패치');
        await expect(sources).toContainText(/게임 자료 버전 \d+\.\d+\.\d+-LIVE/);
        expect(errors).toEqual([]);
    });

    test('무기를 바꾸면 화력·구매 목록이 바뀌고, 기본값으로 되돌릴 수 있다', async ({ page }) => {
        await openAsgard(page, { prices: { [MANTIS]: [{ shop: 'CenterMass', place: 'Area 18', system: 'Stanton', price: 23500 }, { shop: 'Ship Weapons', place: 'MIC-L2', system: 'Stanton', price: 25000 }] } });
        await expect(stat(page, DPS)).toHaveText('5,313');
        await expect(page.locator('.loadout-shopping')).toContainText('부품을 바꾸면');

        await firstGunSlot(page).locator('[data-loadout-open]').click();
        const picker = page.locator('.loadout-picker');
        await expect(picker).toContainText(/맞는 부품 \d+종/);
        // 크기가 맞는 무기만 나온다(S3 자리).
        expect(await picker.locator('.loadout-optrows .loadout-meta').allInnerTexts().then((list) => list.every((line) => line.startsWith('S3')))).toBe(true);
        // 한국어 이름으로도, 원문 이름으로도 찾을 수 있다.
        await picker.locator('#loadout-picker-search').fill('맨티스');
        const option = picker.locator('.loadout-optrows tr', { has: page.locator(`[data-loadout-pick="${MANTIS}"]`) });
        await expect(option).toContainText('맨티스 GT-220 개틀링');
        await picker.locator('#loadout-picker-search').fill('mantis');
        await expect(option.locator('strong')).toHaveAttribute('title', 'Mantis GT-220 Gatling');
        await expect(option).toContainText('최저 23,500 aUEC');
        // 지금 달린 무기보다 얼마나 센지 고르기 전에 보인다.
        await expect(option.locator('.loadout-cmp-cell').first()).toContainText(/DPS\s*853\s*\+\d/);
        await pick(page, MANTIS).click();

        await expect(page.locator('.loadout-picker')).toHaveCount(0);
        await expect(stat(page, DPS)).not.toHaveText('5,313');
        // 기본 장착보다 얼마나 달라졌는지 통계 패널에 표시된다.
        await expect(page.locator('.loadout-kpi').filter({ has: page.getByText(DPS, { exact: true }) }).locator('.loadout-change')).toHaveText(/^\+\d/);
        await expect(page.locator('.loadout-shipstate')).toHaveText('1곳 변경됨');
        const changed = page.locator('.loadout-slot.is-changed');
        await expect(changed).toHaveCount(1);
        await expect(changed).toContainText('맨티스 GT-220 개틀링');
        const shopping = page.locator('.loadout-shopping');
        await expect(shopping).toContainText('CenterMass');
        await expect(shopping).toContainText('Area 18, Stanton');
        await expect(shopping.locator('tfoot')).toContainText('23,500 aUEC');
        await expect(stat(page, '바꾼 부품 구매 비용')).toHaveText('23,500 aUEC');

        await changed.locator('[data-loadout-reset]').click();
        await expect(stat(page, DPS)).toHaveText('5,313');
        await expect(page.locator('.loadout-slot.is-changed')).toHaveCount(0);
    });

    test('상점에서 팔지 않는 부품(파밍 전용)도 후보에서 빠지지 않고 장착할 수 있다', async ({ page }) => {
        // 가격표에 아무 부품도 없는 상황: 군용 등 전리품 전용 부품이 이렇게 보인다.
        await openAsgard(page, { prices: {} });
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        const option = page.locator('.loadout-optrows tr', { has: page.locator(`[data-loadout-pick="${MANTIS}"]`) });
        await expect(option.locator('.loadout-price')).toHaveText('판매처 정보 없음');
        await expect(pick(page, MANTIS)).toBeEnabled();
        await pick(page, MANTIS).click();
        await expect(page.locator('.loadout-slot.is-changed')).toContainText('맨티스 GT-220 개틀링');
        await expect(panel(page)).toContainText('1종은 판매처 정보 없음');
        await expect(page.locator('.loadout-shopping')).toContainText('UEX 자료 누락·매칭 실패');
    });

    test('부품 선택 창: 같은 부품 여러 곳을 한 번에 바꾸고, 걸러 보고, Esc로 닫는다', async ({ page }) => {
        await openAsgard(page, { prices: { [MANTIS]: [{ shop: 'CenterMass', place: 'Area 18', system: 'Stanton', price: 23500 }] } });
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        const picker = page.locator('.loadout-picker');
        await expect(picker).toHaveAttribute('role', 'dialog');
        const total = await picker.locator('.loadout-optrows tr').count();

        // 상점에서 파는 것만 걸러 본다 → 가격표에 있는 맨티스만 남는다.
        await picker.locator('[data-loadout-buyable]').click();
        await expect(picker.locator('.loadout-optrows tr')).toHaveCount(1);
        await expect(picker.locator('.loadout-optrows tr')).toContainText('맨티스 GT-220 개틀링');
        await picker.locator('[data-loadout-buyable]').click();
        await expect(picker.locator('.loadout-optrows tr')).toHaveCount(total);

        // Esc로 닫으면 아무것도 바뀌지 않는다.
        await page.keyboard.press('Escape');
        await expect(page.locator('.loadout-picker')).toHaveCount(0);
        await expect(page.locator('.loadout-slot.is-changed')).toHaveCount(0);

        // 판터 리피터가 달린 6곳을 한 번에 바꾼다.
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await expect(page.locator('.loadout-bulk')).toContainText('6곳을 한 번에 교체');
        await page.locator('#loadout-bulk').check();
        await pick(page, MANTIS).click();
        await expect(page.locator('.loadout-slot.is-changed')).toHaveCount(6);
        await expect(page.locator('.loadout-shipstate')).toHaveText('6곳 변경됨');
        await expect(page.locator('.loadout-shopping tbody tr')).toHaveCount(1);
        await expect(page.locator('.loadout-shopping tbody tr')).toContainText('6');
        await expect(stat(page, '바꾼 부품 구매 비용')).toHaveText('141,000 aUEC');
    });

    test('편집 내용은 새로고침 후에도 남고, 공유 링크로 같은 구성이 열린다', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await openAsgard(page);
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await pick(page, MANTIS).click();
        const changedDps = await stat(page, DPS).innerText();
        expect(changedDps).not.toBe('5,313');

        await page.reload();
        await page.waitForSelector('#loading-splash', { state: 'hidden' });
        await expect(page.locator('#loadout-ship-title')).toHaveText('앤빌 아스가르드');
        await expect(stat(page, DPS)).toHaveText(changedDps);

        await page.locator('[data-loadout-share]').click();
        await expect(page.locator('#toast')).toContainText('공유 링크를 복사했습니다');
        const shared = await page.evaluate(() => navigator.clipboard.readText());
        expect(shared).toMatch(/\?loadout=anvl_asgard&set=.+#loadout$/);

        const other = await context.newPage();
        await mockApi(other);
        await other.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {} } }));
        await other.addInitScript(() => localStorage.removeItem('volt-loadout-v1'));
        await other.goto(shared.replace(/^https?:\/\/[^/]+/, ''));
        await other.waitForSelector('#loading-splash', { state: 'hidden' });
        await expect(other.locator('#loadout-ship-title')).toHaveText('앤빌 아스가르드');
        await expect(stat(other, DPS)).toHaveText(changedDps);

        await page.locator('[data-loadout-reset-all]').click();
        await expect(stat(page, DPS)).toHaveText('5,313');
    });

    test('가격을 못 불러와도 편집은 되고, 영어 화면은 원문으로 표시된다', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ status: 503, json: { error: 'down' } }));
        await gotoSection(page, '#loadout');
        await page.locator('#loadout-ship-search').fill('asgard');
        await page.locator('[data-loadout-ship="anvl_asgard"]').click();
        await expect(page.locator('#loadout-ship-title')).toHaveText('Anvil Asgard');
        await expect(stat(page, 'Burst DPS')).toHaveText('5,313');
        await firstGunSlot(page, 'CF-337 Panther Repeater').locator('[data-loadout-open]').click();
        await expect(page.locator('.loadout-optrows tr').first()).toContainText('Couldn\'t load prices');
        await pick(page, MANTIS).click();
        await expect(stat(page, 'Burst DPS')).not.toHaveText('5,313');
        await expect(page.locator('.loadout-shopping')).toContainText('Mantis GT-220 Gatling');
        await expect(page.locator('#loadout-app')).not.toContainText(/[가-힣]/);

        await page.locator('.nav-lang [data-set-lang="ko"]').click();
        await expect(stat(page, DPS)).toBeVisible();
        await expect(page.locator('.loadout-slot.is-changed')).toContainText('맨티스 GT-220 개틀링');
        await ctx.close();
    });

    test('장바구니: 부품을 담고 수량을 바꾸면 상점별 합계가 정리되고, 새로고침 후에도 남는다', async ({ page }) => {
        const prices = { [MANTIS]: [{ shop: 'CenterMass', place: 'Area 18', system: 'Stanton', price: 23500 }, { shop: 'Ship Weapons', place: 'MIC-L2', system: 'Stanton', price: 25000 }] };
        await openAsgard(page, { prices });
        await expect(page.locator('[data-loadout-tab="cart"] .loadout-badge')).toHaveCount(0);

        // 현재 장착 부품은 선택 창에서도 구매 목록에 담을 수 있다.
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await expect(page.locator('.loadout-picker [data-loadout-cart-add]')).toHaveCount(1);
        await page.keyboard.press('Escape');
        await page.locator('[data-loadout-tab="finder"]').click();
        await page.locator('#loadout-finder-search').fill('맨티스');
        await page.locator(`.loadout-finderlist [data-loadout-cart-add="${MANTIS}"]`).click();
        await expect(page.locator('#toast')).toContainText('장바구니에 담았습니다');
        await page.locator('[data-loadout-tab="slots"]').click();
        await expect(page.locator('.loadout-slot.is-changed')).toHaveCount(0);
        await expect(page.locator('[data-loadout-tab="cart"] .loadout-badge')).toHaveText('1');

        await page.locator('[data-loadout-tab="cart"]').click();
        const row = page.locator(`[data-loadout-cart-row="${MANTIS}"]`);
        await expect(row).toContainText('맨티스 GT-220 개틀링');
        await expect(row).toContainText('CenterMass');
        await row.locator('[data-loadout-cart-inc]').click();
        await row.locator('[data-loadout-cart-inc]').click();
        await expect(row.locator('.loadout-qty b')).toHaveText('3');
        await expect(page.locator('.loadout-carttable tfoot')).toContainText('70,500 aUEC');
        await expect(page.locator('.loadout-shoplist li')).toHaveCount(1);
        await expect(page.locator('.loadout-shoplist li')).toContainText('맨티스 GT-220 개틀링 ×3');
        await row.locator('[data-loadout-cart-dec]').click();
        await expect(page.locator('.loadout-carttable tfoot')).toContainText('47,000 aUEC');

        await page.reload();
        await page.waitForSelector('#loading-splash', { state: 'hidden' });
        await expect(page.locator('[data-loadout-tab="cart"] .loadout-badge')).toHaveText('2');
        await page.locator('[data-loadout-tab="cart"]').click();
        await page.locator(`[data-loadout-cart-row="${MANTIS}"] [data-loadout-cart-remove]`).click();
        await expect(page.locator('.loadout-view')).toContainText('장바구니가 비어 있습니다');
    });

    test('바꾼 부품을 장바구니에 담고, 무기 상세 표와 부품 찾기를 쓴다', async ({ page }) => {
        await openAsgard(page, { prices: { [MANTIS]: [{ shop: 'CenterMass', place: 'Area 18', system: 'Stanton', price: 23500 }] } });
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await page.locator('#loadout-bulk').check();
        await pick(page, MANTIS).click();
        await page.locator('[data-loadout-cart-changed]').click();
        await expect(page.locator('[data-loadout-tab="cart"] .loadout-badge')).toHaveText('6');

        // 무기 상세: 같은 무기를 묶어 수량과 DPS 합을 보여준다.
        await page.locator('[data-loadout-tab="weapons"]').click();
        const table = page.locator('.loadout-weapontable');
        const mantisRow = table.locator('tbody tr', { hasText: '맨티스 GT-220 개틀링' });
        await expect(mantisRow).toContainText('파일럿');
        await expect(mantisRow.locator('td').nth(2)).toHaveText('6');
        await expect(table.locator('tbody tr', { hasText: 'CF-447 라이노 리피터' })).toContainText('터렛');
        const total = await table.locator('tfoot th').nth(1).innerText();
        expect(total).toBe(await stat(page, DPS).innerText());
        // 표의 지속 DPS 합계도 상단 수치와 같다.
        expect(await table.locator('tfoot th').last().innerText()).toBe(`지속 DPS ${await stat(page, '지속 DPS').innerText()}`);

        // 부품 찾기: 종류·크기로 훑어보고 담는다.
        await page.locator('[data-loadout-tab="finder"]').click();
        await page.locator('[data-loadout-finder-type="Shield"]').click();
        await expect(page.locator('#loadout-finder-count')).toHaveText(/^\d+종$/);
        await page.locator('[data-loadout-finder-size="2"]').click();
        const metas = await page.locator('.loadout-finderlist .loadout-meta').allInnerTexts();
        expect(metas.length).toBeGreaterThan(0);
        expect(metas.every((line) => line.startsWith('S2'))).toBe(true);
        await page.locator('.loadout-finderlist li').first().locator('[data-loadout-cart-add]').click();
        await expect(page.locator('[data-loadout-tab="cart"] .loadout-badge')).toHaveText('7');
        await expect(page.locator('.loadout-finderlist li').first().locator('.loadout-delta')).toHaveText('담음 1');
    });

    test('로드아웃을 이름 붙여 저장하고 다시 불러온다', async ({ page }) => {
        await openAsgard(page);
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await pick(page, MANTIS).click();
        const changedDps = await stat(page, DPS).innerText();
        // 저장·불러오기는 함선 이름 옆(상단)에 모여 있다.
        await openBuilds(page);
        await page.locator('#loadout-build-name').fill('맨티스 시험');
        await page.locator('[data-loadout-build-save]').click();
        await expect(page.locator('.loadout-buildlist li')).toHaveCount(1);
        await expect(page.locator('.loadout-buildlist li')).toContainText('맨티스 시험');
        await expect(page.locator('.loadout-buildlist li')).toContainText('1곳 변경됨');

        await page.locator('[data-loadout-reset-all]').click();
        await expect(stat(page, DPS)).toHaveText('5,313');
        await page.locator('[data-loadout-build-load="0"]').click();
        await expect(stat(page, DPS)).toHaveText(changedDps);
        await openBuilds(page);
        await page.locator('[data-loadout-build-delete="0"]').click();
        await expect(page.locator('.loadout-buildlist li')).toHaveCount(0);
        // 실드 저항이 방어 구역에 표시된다.
        await expect(panel(page)).toContainText('물리 저항');
    });

    test('모바일 390px: 가로 넘침 없이 부품을 바꿀 수 있다', async ({ browser }, testInfo) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
        const page = await ctx.newPage();
        await openAsgard(page);
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await pick(page, MANTIS).click();
        await expect(page.locator('.loadout-slot.is-changed')).toHaveCount(1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        await page.screenshot({ path: testInfo.outputPath('workspace-mobile.png') });
        // 함선을 고른 뒤에는 검색창이 접혀 있으므로 "함선 바꾸기"로 다시 편다.
        await page.locator('[data-loadout-browse]').click();
        const input = await page.locator('#loadout-ship-search').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(input).toBeGreaterThanOrEqual(16);
        await ctx.close();
    });

    test('비행 성능·선체·장갑·퀀텀 항속과 이동 시간을 보여준다', async ({ page }) => {
        await openAsgard(page);
        await expect(stat(page, 'SCM 속도')).toContainText('203');
        await expect(stat(page, '최고 속도 (NAV)')).toContainText('1,075');
        await expect(stat(page, '롤')).toContainText('95');
        await expect(stat(page, '선체 내구도')).toHaveText('77,000');
        const hull = page.locator('.loadout-hull');
        await expect(hull).toContainText(/물리 피해 받는 비율\s*70%/);
        await expect(hull).toContainText(/에너지 피해 받는 비율\s*50%/);
        const quantum = page.locator('.loadout-panel-section', { hasText: '퀀텀 속도' });
        await expect(quantum).toContainText(/항속 거리\s*706 Gm/);
        await expect(quantum).toContainText(/퀀텀 연료\s*7\.7 SCU/);
        // 거리를 바꾸면 예상 이동 시간이 바로 바뀌고, 입력 중인 칸은 그대로 유지된다.
        await expect(page.locator('#loadout-qt-time')).toHaveText('2분 40초');
        await page.locator('#loadout-qt-distance').fill('60');
        await expect(page.locator('#loadout-qt-time')).toHaveText('4분 46초');
        await expect(page.locator('#loadout-qt-distance')).toBeFocused();
    });

    test('무기 상세에 미사일 표가 나오고, 저장한 구성과 지금 구성을 나란히 비교한다', async ({ page }) => {
        await openAsgard(page);
        await page.locator('[data-loadout-tab="weapons"]').click();
        const missiles = page.locator('.loadout-missiletable');
        await expect(missiles.locator('tbody tr')).not.toHaveCount(0);
        await expect(missiles.locator('thead')).toContainText('락온');

        // 저장한 구성이 없으면 비교 탭이 방법을 안내한다.
        await page.locator('[data-loadout-tab="compare"]').click();
        await expect(page.locator('.loadout-view')).toContainText('지금 구성을 먼저 저장해 보세요');

        // 기본 장착을 저장해 두고, 기총을 바꾼 뒤 비교한다.
        await openBuilds(page);
        await page.locator('#loadout-build-name').fill('기본형');
        await page.locator('[data-loadout-build-save]').click();
        await page.locator('[data-loadout-tab="slots"]').click();
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await page.locator('#loadout-bulk').check();
        await pick(page, MANTIS).click();
        // 비교 탭 안에서 바로 비교 대상을 고른다.
        await page.locator('[data-loadout-tab="compare"]').click();
        await page.locator('.loadout-comparelist [data-loadout-build-compare="0"]').click();
        await expect(page.locator('#loadout-compare-pick')).toHaveValue('0');
        const table = page.locator('.loadout-comparetable');
        await expect(table.locator('thead')).toContainText('기본형');
        const dpsRow = table.locator('tbody tr').first();
        await expect(dpsRow.locator('td').nth(1)).toHaveText('5,313');
        await expect(dpsRow.locator('td').nth(0)).not.toHaveText('5,313');
        await expect(dpsRow.locator('.loadout-change')).toBeVisible();
        await expect(table.locator('tbody tr', { hasText: '선체 내구도' })).toContainText('동일');
        await page.locator('[data-loadout-compare-clear]').click();
        await expect(page.locator('.loadout-comparetable')).toHaveCount(0);
    });

    test('부품 전원을 끄면 실드·소비 전력이 줄고, 새로고침과 전체 기본값에서 올바르게 유지·해제된다', async ({ page }) => {
        await openAsgard(page);
        await expect(stat(page, '실드')).toHaveText('42,240');
        const shield = page.locator('.loadout-group.is-shield .loadout-slot').first();
        // 장비 줄에서 바로 전원을 끌 수 있고 기존 선택 창 동작도 유지한다.
        await expect(shield.locator('[data-loadout-power]')).toHaveAttribute('aria-pressed', 'false');
        await shieldOff(page);
        await expect(stat(page, '실드')).toContainText('31,680');
        await expect(shield).toHaveClass(/is-off/);
        await expect(shield).toContainText('전원 꺼짐');
        await expect(panel(page)).toContainText('부품 1개의 전원을 꺼 둔 상태입니다');
        await expect(panel(page)).toContainText(/남는 출력|출력 부족/);

        await page.reload();
        await expect(stat(page, '실드')).toContainText('31,680');
        await page.locator('.loadout-group.is-shield .loadout-slot').first().locator('[data-loadout-power]').click();
        await expect(stat(page, '실드')).toHaveText('42,240');

        await shieldOff(page);
        await page.locator('[data-loadout-reset-all]').click();
        await expect(stat(page, '실드')).toHaveText('42,240');
        await expect(page.locator('.loadout-slot.is-off')).toHaveCount(0);
    });

    test('작업 도구형 화면: 「함선」 메뉴, 사진 카드로 함선 고르기, 상단 핵심 수치, 위치별 부품 행', async ({ page }) => {
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {} } }));
        await gotoSection(page, '');
        // 함선 DB와 함선 로드아웃은 「함선」 묶음 안에 있다(무역 메뉴와 같은 방식).
        await expect(page.locator('#nav-ships-menu')).toBeHidden();
        await page.locator('#nav-ships-toggle').click();
        await expect(page.locator('#nav-ships-menu a')).toHaveText(['함선DB', '함선 로드아웃']);
        await page.locator('#nav-ships-menu a[href="#loadout"]').click();
        await expect(page.locator('#nav-ships-menu')).toBeHidden();
        await expect(page.locator('#nav-ships-toggle')).toHaveClass(/nav-active/);

        // 함선 고르기: 사진 카드, 제조사·종류로 걸러 보기.
        await expect(page.locator('#loadout-ship-results .loadout-shipcard img').first()).toBeVisible();
        await page.locator('#loadout-ship-mfr').selectOption('Anvil Aerospace');
        await expect(page.locator('#loadout-ship-count')).toHaveText(/^검색 결과 \d+척$/);
        const anvil = await page.locator('#loadout-ship-results [data-loadout-ship]').count();
        expect(anvil).toBeGreaterThan(5);
        expect(anvil).toBeLessThan(222);
        await page.locator('[data-loadout-ship-kind="ground"]').click();
        expect(await page.locator('#loadout-ship-results [data-loadout-ship]').count()).toBeLessThan(anvil);
        await page.locator('[data-loadout-ship-kind=""]').click();
        await page.locator('[data-loadout-ship="anvl_asgard"]').click();

        // 함선을 고르면 큰 제목은 접히고, 상단 바에 핵심 수치가 모인다.
        await expect(page.locator('#loadout .section-header')).toBeHidden();
        const kpis = page.locator('.loadout-kpis');
        await expect(kpis.locator('.loadout-kpi').first()).toHaveText(/DPS\s*5,313/);
        await expect(kpis).toContainText(/실드\s*42,240/);
        await expect(kpis).toContainText(/선체\s*77,000/);
        await expect(kpis).toContainText(/항속\s*706 Gm/);
        // 출력이 모자라면 경고색과 문구로 구별한다.
        await expect(kpis.locator('.loadout-kpi.is-warn')).toContainText('출력 부족');

        // 부품은 큰 묶음(무장 / 방어·동력 / 이동·기타) 아래 한 줄씩, 위치 › 부품 순서로 보인다.
        await expect(page.locator('.loadout-super > h3')).toHaveText(['무장', '방어·동력', '이동·기타']);
        const gun = firstGunSlot(page);
        await expect(gun.locator('.loadout-slot-label')).toContainText('›');
        await expect(gun.locator('.loadout-metric')).toHaveText(/546\s*순간 DPS/);
        // 아래에 부품을 거느린 자리(퀀텀 드라이브 › 점프 모듈)는 들여쓰기로 관계를 보여준다.
        await expect(page.locator('.loadout-group.is-quantum .loadout-slot.is-mount')).toHaveCount(1);
        await expect(page.locator('.loadout-group.is-quantum .loadout-slot.is-child')).toHaveCount(1);
        // 성능 패널은 안쪽 스크롤 없이 펼쳐진다.
        const scrolls = await panel(page).evaluate((el) => el.scrollHeight - el.clientHeight);
        expect(scrolls).toBeLessThanOrEqual(1);

        // 부품 선택 창: 후보마다 대표 수치와 지금 부품과의 차이가 같은 열에 놓인다.
        await gun.locator('[data-loadout-open]').click();
        const option = page.locator('.loadout-optrows tr', { has: page.locator(`[data-loadout-pick="${MANTIS}"]`) });
        await expect(option.locator('.loadout-cmp-cell').first()).toContainText(/DPS\s*853\s*\+\d/);
    });

    test('중복 정리: 한영 어느 쪽으로 찾아도 같은 한 항목이 나오고, 이전에 저장한 구성도 계속 열린다', async ({ page }) => {
        const LOWPOLY = '83671df2-63e6-4683-8125-bdccd7d1cd7e'; // 레버넌트 개틀링의 내부 변형(_LowPoly)
        const REVENANT = 'df89e9ca-8a11-477c-8abd-f4837a277dbe';
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {} } }));
        await gotoSection(page, '#loadout');
        // 함선: 피닉스·타우러스가 한 번씩만, 한국어 이름으로 나온다.
        for (const [query, cls] of [['phoenix', 'rsi_constellation_phoenix_gs'], ['피닉스', 'rsi_constellation_phoenix_gs'], ['타우러스', 'rsi_constellation_taurus_gs']]) {
            await page.locator('#loadout-ship-search').fill(query);
            await expect(page.locator('#loadout-ship-results [data-loadout-ship]')).toHaveCount(1);
            await expect(page.locator(`[data-loadout-ship="${cls}"]`)).toContainText(/피닉스|타우러스/);
        }
        // 부품: 영어·한국어 검색이 같은 한 항목으로 이어진다(한국어 이름이 주, 영어 원문이 보조).
        await page.locator('#loadout-ship-search').fill('asgard');
        await page.locator('[data-loadout-ship="anvl_asgard"]').click();
        await firstGunSlot(page, 'CF-447 라이노 리피터').locator('[data-loadout-open]').click();
        const options = page.locator('.loadout-optrows tr');
        for (const query of ['Revenant', '레버넌트']) {
            await page.locator('#loadout-picker-search').fill(query);
            await expect(options).toHaveCount(1);
            await expect(options.first()).toContainText('레버넌트 개틀링');
            await expect(options.first().locator('strong')).toHaveAttribute('title', 'Revenant Gatling');
            await expect(options.first().locator(`[data-loadout-pick="${REVENANT}"]`)).toHaveCount(1);
        }
        await expect(page.locator(`[data-loadout-pick="${LOWPOLY}"]`)).toHaveCount(0);

        // 정리 이전에 만들어진 공유 링크(옛 함선 클래스 + 내부 변형 id)도 대표 제품으로 열린다.
        const path = await page.locator('.loadout-slot.is-open').getAttribute('data-loadout-slot');
        await page.goto(`/?loadout=anvl_asgard&set=${encodeURIComponent(`${encodeURIComponent(path)}=${LOWPOLY}`)}#loadout`);
        await expect(page.locator('.loadout-shipstate')).toHaveText('1곳 변경됨');
        await expect(page.locator(`[data-loadout-slot="${path}"]`)).toContainText('레버넌트 개틀링');
        await page.goto('/?loadout=rsi_constellation_phoenix#loadout');
        await expect(page.locator('#loadout-ship-title')).toContainText('피닉스');
    });

    test('넓은 교체창과 되돌리기: 후보를 열 맞춘 표로 견주고, 직전 변경을 취소할 수 있다', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openAsgard(page);
        const undo = page.locator('[data-loadout-undo]');
        await expect(undo).toBeDisabled();
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        // 편집하지 않을 때 빈 칸을 두지 않는다: 장비 목록과 요약 두 칸뿐이고, 장비는 화면 폭에 맞춰 두 줄로 놓인다.
        await page.keyboard.press('Escape');
        await expect(page.locator('.loadout-pickhint')).toHaveCount(0);
        const groupX = await page.locator('.loadout-super').first().locator('.loadout-group').evaluateAll((list) => new Set(list.map((el) => Math.round(el.getBoundingClientRect().x))).size);
        expect(groupX).toBeGreaterThan(1);
        // 교체창은 화면 대부분을 쓰는 창으로 뜨고, 후보의 같은 수치가 같은 열에 놓인다.
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        const box = await page.locator('.loadout-picker').boundingBox();
        expect(box.width).toBeGreaterThan(1000);
        await expect(page.locator('.loadout-opttable thead th')).toContainText(['부품', 'DPS', '지속 DPS', '알파', '사거리', '소비 전력', '최저가']);
        expect(await page.locator('.loadout-optrows tr').count()).toBeGreaterThan(8);
        const visibleRows = await page.locator('.loadout-optrows tr').evaluateAll((list) => { const wrap = document.querySelector('.loadout-optwrap').getBoundingClientRect(); return list.filter((el) => el.getBoundingClientRect().bottom <= wrap.bottom).length; });
        expect(visibleRows).toBeGreaterThan(7);
        // 열 제목을 누르면 그 수치로 줄을 세운다.
        await page.locator('[data-loadout-sort="m2"]').click();
        const alphas = await page.locator('.loadout-optrows tr td:nth-of-type(3) b').allInnerTexts().then((list) => list.map((value) => Number(value.replace(/,/g, ''))));
        expect(alphas).toEqual([...alphas].sort((x, y) => y - x));
        await page.locator('[data-loadout-sort="m0"]').click();
        // 무기는 피해 종류·형태로 거를 수 있다.
        const all = await page.locator('.loadout-optrows tr').count();
        await page.locator('[data-loadout-kind="gatling"]').click();
        const gatlings = await page.locator('.loadout-optrows tr th strong').allInnerTexts();
        expect(gatlings.length).toBeLessThan(all);
        expect(gatlings.every((name) => name.includes('개틀링'))).toBe(true);
        await page.locator('[data-loadout-dmg="energy"]').click();
        await page.locator('[data-loadout-dmg="energy"]').click();
        await expect(stat(page, DPS)).toBeVisible();
        await pick(page, MANTIS).click();
        await expect(stat(page, DPS)).not.toHaveText('5,313');
        // 되돌리기: 방금 바꾼 것만 취소하고, 더 취소할 것이 없으면 버튼이 꺼진다.
        await expect(undo).toBeEnabled();
        await undo.click();
        await expect(stat(page, DPS)).toHaveText('5,313');
        await expect(page.locator('.loadout-shipstate')).toHaveText('기본 장착 상태');
        await expect(undo).toBeDisabled();
        // 전원 끄기도 되돌릴 수 있다.
        await shieldOff(page);
        await expect(stat(page, '실드')).toContainText('31,680');
        await undo.click();
        await expect(stat(page, '실드')).toHaveText('42,240');
    });

    test('같은 미사일은 한 줄(×16)로 묶이고, 한 번에 바꾸거나 하나씩 풀어 볼 수 있다', async ({ page }) => {
        const THUNDERBOLT = '9a741b0a-200d-4f1a-92a8-f917510804e1'; // 썬더볼트 III 미사일
        await openAsgard(page);
        const missiles = page.locator('.loadout-group.is-missile');
        const rows = missiles.locator('.loadout-slot', { hasText: '어레스터 III 미사일' });
        await expect(rows).toHaveCount(1);
        await expect(rows.locator('.loadout-count')).toHaveText('×16');
        await expect(missiles.locator('h4')).toContainText('16곳');
        // 묶인 줄을 바꾸면 16발이 함께 바뀐다.
        await rows.locator('[data-loadout-open]').click();
        await expect(page.locator('.loadout-runnote')).toContainText('16곳');
        await pick(page, THUNDERBOLT).click();
        const swapped = missiles.locator('.loadout-slot', { hasText: '썬더볼트 III 미사일' });
        await expect(swapped).toHaveCount(1);
        await expect(swapped.locator('.loadout-count')).toHaveText('×16');
        await expect(page.locator('.loadout-shipstate')).toHaveText('16곳 변경됨');
        await expect(page.locator('.loadout-shopping tbody tr').first()).toContainText('16');
        // 기본값도 묶음 전체에 적용된다.
        await swapped.locator('[data-loadout-reset]').click();
        await expect(page.locator('.loadout-shipstate')).toHaveText('기본 장착 상태');
        // 하나씩 풀어서 한 발만 바꾸면 남은 15발은 다시 묶을 때 따로 묶인다.
        await rows.locator('[data-loadout-split]').click();
        await expect(rows).toHaveCount(16);
        await expect(missiles.locator('h4')).toContainText('16곳');
        await rows.nth(1).locator('[data-loadout-open]').click();
        await pick(page, THUNDERBOLT).click();
        await expect(page.locator('.loadout-shipstate')).toHaveText('1곳 변경됨');
        await missiles.locator('[data-loadout-split]').first().click();
        await expect(missiles.locator('.loadout-count')).toHaveText(['×14']);
        await expect(missiles.locator('.loadout-slot')).toHaveCount(3);
        await expect(missiles.locator('h4')).toContainText('16곳');
    });

    test('자주 안 보는 구역과 출처는 접혀 있고, 펼친 상태는 화면이 바뀌어도 유지된다', async ({ page }) => {
        await openAsgard(page);
        const flight = page.locator('.loadout-flight');
        await expect(flight.locator('summary')).toContainText('SCM 203');
        await expect(flight.locator('.loadout-fold-body')).toBeHidden();
        await flight.locator('summary').click();
        await expect(stat(page, '롤')).toBeVisible();
        // 부품 전원을 꺼서 화면이 다시 그려져도 펼친 채로 남는다.
        await shieldOff(page);
        await expect(stat(page, '롤')).toBeVisible();
        await expect(page.locator('.loadout-hull .loadout-fold-body')).toBeHidden();
        // 출처는 한 줄 요약으로 늘 보이고, 누르면 자세한 내용이 펼쳐진다.
        const sources = page.locator('#loadout-sources');
        await expect(sources.locator('summary')).toContainText(/자료 출처 · 게임 파일 \d+\.\d+\.\d+-LIVE.* · 가격 UEX · 한국어 패치 표기/);
        await expect(sources.locator('a')).toBeHidden();
        await sources.locator('summary').click();
        await expect(sources.locator('a')).toBeVisible();
    });

    test('늘면 불리한 값(소비 전력·시그니쳐)은 늘었을 때 불리한 색으로 표시한다', async ({ page }) => {
        await openAsgard(page);
        const row = (label) => page.locator('.loadout-panel .loadout-row').filter({ has: page.getByText(label, { exact: true }) });
        // 실드 하나의 전원을 끄면 실드는 줄어 불리, 소비 전력·EM 시그니쳐는 줄어 유리로 표시된다.
        await shieldOff(page);
        await expect(stat(page, '실드').locator('xpath=..').locator('.loadout-change')).toHaveClass(/is-bad/);
        await expect(row('소비 전력').locator('.loadout-change')).toHaveClass(/is-good/);
        await expect(row('소비 전력').locator('.loadout-change')).toContainText('−');
        await expect(row('소비 전력').locator('.loadout-change')).toContainText('유리');
        await expect(row('EM 시그니쳐').locator('.loadout-change')).toHaveClass(/is-good/);
        // 후보 목록: 소비 전력이 늘어나는 부품은 따로 불리한 색으로 알린다.
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        const option = page.locator('.loadout-optrows tr', { has: page.locator(`[data-loadout-pick="${MANTIS}"]`) });
        const draw = option.locator('.loadout-cmp-cell', { hasText: '소비 전력' }).locator('.loadout-delta');
        await expect(draw).toHaveClass(/is-good/);
        await expect(draw).toContainText('−0.9');
        // 같은 수치는 그 칸에서만 「동일」이라고 한다(전체가 같다는 뜻으로 읽히지 않게).
        await expect(page.locator('.loadout-optrows .loadout-cmp-cell', { hasText: '동일' }).first()).toContainText(/DPS|알파|사거리|소비 전력/);
        // 목록 전체에서 소비 전력이 늘어나는 후보는 모두 불리, 줄어드는 후보는 모두 유리로 표시된다.
        const chips = await page.locator('.loadout-optrows .loadout-cmp-cell', { hasText: '소비 전력' }).locator('.loadout-delta:not(:text-is("동일"))').evaluateAll((list) => list.map((el) => [el.textContent.includes('+'), el.classList.contains('is-bad')]));
        expect(chips.length).toBeGreaterThan(1);
        expect(chips.every(([up, bad]) => up === bad)).toBe(true);
    });

    test('함선 목록과 머리 영역의 제조사·역할을 한국어 패치 표기로 보여주고, 한국어로도 찾을 수 있다', async ({ page }) => {
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {} } }));
        await gotoSection(page, '#loadout');
        const card = page.locator('[data-loadout-ship="anvl_asgard"]');
        await expect(card).toContainText('앤빌 에어로스페이스');
        await expect(card).toContainText('드랍쉽');
        await expect(page.locator('#loadout-ship-results')).not.toContainText(/Anvil Aerospace|Light Fighter|Dropship/);
        await expect(page.locator('#loadout-ship-mfr option', { hasText: '앤빌 에어로스페이스' })).toHaveCount(1);
        await page.locator('#loadout-ship-search').fill('드랍쉽');
        await expect(card).toBeVisible();
        await expect(page.locator('#loadout-ship-count')).toHaveText(/검색 결과 \d+척/);
        await card.click();
        await expect(page.locator('.loadout-shipfacts')).toContainText('앤빌 에어로스페이스');
        await expect(page.locator('.loadout-shipfacts')).toContainText('드랍쉽');
    });
    test('교체해도 줄 구성이 유지되고, 미사일은 랙·탄 크기와 합계 피해를 구분해 보여 준다', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {} } }));
        await gotoSection(page, '#loadout');
        await page.locator('#loadout-ship-search').fill('stalker');
        await page.locator('[data-loadout-ship="aegs_avenger_stalker"]').click();
        const weapons = page.locator('.loadout-group.is-weapon');
        await expect(weapons.locator('h4')).toContainText('3곳');
        const nose = weapons.locator('.loadout-slot').first();
        await expect(nose.locator('.loadout-slot-label')).toContainText('기수');
        // 줄 안에서 바로 판단할 수 있게 순간 DPS와 지속 DPS·탄속·사거리가 보인다.
        await expect(nose.locator('.loadout-metric b')).toHaveText('1,266');
        await expect(nose.locator('.loadout-slot-facts')).toContainText('지속 879');
        await expect(nose.locator('.loadout-slot-facts')).toContainText('사거리');
        // 무기를 바꿔도 자리 수·위치 이름·수치가 그대로 유지되고 마운트가 따로 튀어나오지 않는다.
        await nose.locator('[data-loadout-open]').click();
        await pick(page, 'e4afc8b4-da61-4efb-af7e-f003d9900d96').click();
        await expect(weapons.locator('h4')).toContainText('3곳');
        await expect(weapons.locator('.loadout-slot')).toHaveCount(3);
        const swapped = weapons.locator('.loadout-slot').first();
        await expect(swapped).toContainText('AD4B 실탄 개틀링');
        await expect(swapped.locator('.loadout-slot-label')).toContainText('기수');
        await expect(swapped.locator('.loadout-metric b')).toHaveText('1,266');
        await expect(weapons).not.toContainText('짐벌 마운트');
        // 미사일: 랙 크기와 탄 크기를 따로 적고, 발당 피해와 합계 피해를 구분한다.
        const missile = page.locator('.loadout-group.is-missile .loadout-slot', { hasText: '이그나이트 II' }).first();
        await expect(missile.locator('.loadout-size')).toHaveText('S2');
        await expect(missile.locator('.loadout-slot-label')).toContainText('S3 미사일 랙');
        await expect(missile.locator('.loadout-slot-facts')).toContainText('S2 미사일');
        await expect(missile.locator('.loadout-slot-facts')).toContainText('발당 1,440');
        await expect(missile.locator('.loadout-metric')).toContainText('2,880');
        await expect(missile.locator('.loadout-metric')).toContainText('합계 피해');
    });

    test('구성 A/B: 저장하지 않고 복제한 구성에서 실험하고 바로 견준다', async ({ page }) => {
        await openAsgard(page);
        await expect(page.locator('.loadout-abstate')).toContainText('구성 A');
        // 저장한 구성이 없어도 비교 화면에서 바로 B를 시작할 수 있다.
        await page.locator('[data-loadout-tab="compare"]').click();
        await page.locator('.loadout-abcompare [data-loadout-ab="B"]').click();
        await expect(page.locator('.loadout-abstate')).toContainText('구성 B');
        await expect(page.locator('[data-loadout-ab="B"]').first()).toHaveAttribute('aria-pressed', 'true');
        // B에서만 무기를 바꾼다.
        await page.locator('[data-loadout-tab="slots"]').click();
        const before = await stat(page, DPS).innerText();
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await pick(page, MANTIS).click();
        await expect(stat(page, DPS)).not.toHaveText(before);
        // 비교 화면: B(지금)와 A가 나란히 나오고 차이가 표시된다.
        await page.locator('[data-loadout-tab="compare"]').click();
        const table = page.locator('.loadout-abcompare .loadout-comparetable');
        await expect(table.locator('thead')).toContainText('구성 B');
        await expect(table.locator('thead')).toContainText('구성 A');
        await expect(table.locator('tbody tr').first().locator('td').nth(1)).toHaveText(before);
        await expect(table.locator('tbody tr').first().locator('.loadout-change')).toBeVisible();
        // A로 돌아가면 원래 구성 그대로이고, 새로고침해도 두 구성이 남는다.
        await page.locator('.loadout-actions [data-loadout-ab="A"]').click();
        await expect(stat(page, DPS)).toHaveText(before);
        await page.reload();
        await expect(page.locator('.loadout-abstate')).toContainText('구성 A');
        await page.locator('.loadout-actions [data-loadout-ab="B"]').click();
        await expect(stat(page, DPS)).not.toHaveText(before);
    });
    test('장비 종류를 전환해도 교체한 구성과 전체 수치를 유지한다', async ({ page }, testInfo) => {
        await openAsgard(page);
        await page.screenshot({ path: testInfo.outputPath('workspace-desktop.png') });
        await page.locator('[data-loadout-category="superArms"]').click();
        await expect(page.locator('.loadout-group.is-shield')).toBeHidden();
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await pick(page, MANTIS).click();
        const changed = await stat(page, DPS).innerText();
        await page.locator('[data-loadout-category="superDefense"]').click();
        await expect(page.locator('.loadout-group.is-weapon')).toBeHidden();
        await expect(page.locator('.loadout-group.is-shield')).toBeVisible();
        await expect(stat(page, DPS)).toHaveText(changed);
        await page.locator('[data-loadout-category=""]').click();
        await expect(firstGunSlot(page, '맨티스 GT-220 개틀링')).toBeVisible();
        await expect(page.locator('.loadout-group.is-shield')).toBeVisible();
        await expect(stat(page, DPS)).toHaveText(changed);
    });

    test('후보가 없는 검색을 초기화하고 정렬 방향을 정확히 알린다', async ({ page }) => {
        await openAsgard(page);
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        const rows = page.locator('.loadout-optrows tr');
        const count = await rows.count();
        await page.locator('#loadout-picker-search').fill('no-such-component-xyz');
        await expect(page.locator('.loadout-picker')).toContainText('조건에 맞는 부품이 없습니다');
        await page.locator('[data-loadout-clear-filters]').click();
        await expect(rows).toHaveCount(count);
        await expect(page.locator('#loadout-picker-search')).toBeFocused();
        await expect(page.locator('#loadout-picker-search')).toHaveValue('');
        await page.locator('[data-loadout-sort="name"]').click();
        await expect(page.locator('.loadout-opttable th[aria-sort]')).toHaveAttribute('aria-sort', 'ascending');
        await page.locator('[data-loadout-sort="m0"]').click();
        await expect(page.locator('.loadout-opttable th[aria-sort]')).toHaveAttribute('aria-sort', 'descending');
    });
    test('구매 계획: 다품종 상점 묶기·직접 지정·방문 순서를 저장한다', async ({ page }, testInfo) => {
        const PANTHER = 'bd13235d-1261-4b71-b32f-aed1a8beb526';
        const prices = {
            [MANTIS]: [{ shop: 'Cheap M', place: 'Area 18', system: 'Stanton', price: 100 }, { shop: 'Shared Hub', place: 'New Babbage', system: 'Stanton', price: 120 }],
            [PANTHER]: [{ shop: 'Cheap P', place: 'Orison', system: 'Stanton', price: 200 }, { shop: 'Shared Hub', place: 'New Babbage', system: 'Stanton', price: 220 }],
        };
        await page.addInitScript(({ MANTIS, PANTHER }) => {
            if (!localStorage.getItem('volt-loadout-cart-v1')) localStorage.setItem('volt-loadout-cart-v1', JSON.stringify({ [MANTIS]: 2, [PANTHER]: 1 }));
        }, { MANTIS, PANTHER });
        await openAsgard(page, { prices });
        await page.locator('[data-loadout-tab="cart"]').click();
        await expect(page.locator('.loadout-shoplist li')).toHaveCount(2);
        await page.locator('[data-loadout-plan-mode="grouped"]').click();
        await expect(page.locator('.loadout-shoplist li')).toHaveCount(1);
        await expect(page.locator('.loadout-shoplist')).toContainText('Shared Hub');
        await expect(page.locator('.loadout-carttable tfoot')).toContainText('460');
        const row = page.locator(`[data-loadout-cart-row="${MANTIS}"]`);
        await row.locator('select').selectOption({ label: 'Stanton / Area 18 / Cheap M · 100 aUEC' });
        await expect(page.locator('.loadout-shoplist li')).toHaveCount(2);
        await expect(row.locator('select')).toHaveValue(JSON.stringify(['Stanton', 'Area 18', 'Cheap M']));
        await page.locator('.loadout-shoplist li').last().locator('[data-loadout-route-move="-1"]').click();
        await expect(page.locator('.loadout-shoplist li').first()).toContainText('Cheap P');
        await page.locator('.loadout-view').screenshot({ path: testInfo.outputPath('purchase-plan-desktop.png') });
        await page.reload();
        await page.locator('[data-loadout-tab="cart"]').click();
        await expect(page.locator('[data-loadout-plan-mode="grouped"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(row.locator('select')).toHaveValue(JSON.stringify(['Stanton', 'Area 18', 'Cheap M']));
        await expect(page.locator('.loadout-shoplist li').first()).toContainText('Cheap P');
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator('.loadout-shoplist')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await page.locator('.loadout-view').screenshot({ path: testInfo.outputPath('purchase-plan-mobile.png') });
    });

    test('레이더 UUID가 비어 있어도 정확한 이름·크기의 UEX 판매처를 찾고 다시 조회한다', async ({ page }) => {
        await openAsgard(page);
        let count = 0;
        await page.route('**/api/uex/loadout-prices?category=83*', (route) => {
            count += 1;
            return route.fulfill({ json: { status: 'ok', data: {}, byName: [{ name: 'Ecouter', size: 1, shops: [{ shop: 'Omega Pro', place: 'New Babbage', system: 'Stanton', price: count === 1 ? 100 : 120 }] }] } });
        });
        await page.locator('[data-loadout-tab="finder"]').click();
        await page.locator('[data-loadout-finder-type="Radar"]').click();
        await page.locator('#loadout-finder-search').fill('Ecouter');
        await expect(page.locator('.loadout-finderlist')).toContainText('100 aUEC');
        await page.locator('.loadout-finderlist [data-loadout-cart-add]').click();
        await page.locator('[data-loadout-tab="cart"]').click();
        await expect(page.locator('.loadout-shoplist')).toContainText('New Babbage');
        await page.locator('[data-loadout-refresh-prices]').click();
        await expect(page.locator('.loadout-carttable tfoot')).toContainText('120 aUEC');
        expect(count).toBe(2);
    });

    test('도색은 원형에서 펼쳐 선택하고, 연속 교체 중 목록과 최신 수치를 유지한다', async ({ page }) => {
        const PAINT = 'e4870a3c-b2f8-462b-8be2-dd04520551cf';
        const PANTHER = 'bd13235d-1261-4b71-b32f-aed1a8beb526';
        await openAsgard(page);
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await expect(pick(page, PAINT)).toHaveCount(0);
        await page.locator(`[data-loadout-family="${PANTHER}"]`).click();
        await expect(pick(page, PAINT)).toBeVisible();
        await page.locator('#loadout-keep-picker').check();
        await pick(page, PAINT).click();
        await expect(page.locator('.loadout-picker')).toBeVisible();
        await expect(pick(page, PAINT)).toBeDisabled();
        await expect(page.locator('.loadout-slot.is-changed').first()).toContainText('해저드');
        await pick(page, MANTIS).click();
        await expect(pick(page, MANTIS)).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(firstGunSlot(page, '맨티스 GT-220 개틀링')).toBeVisible();
    });

    test('미출시·출시 미확인 함선은 검색에서 제외한다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#loadout');
        await page.locator('#loadout-ship-search').fill('javelin');
        await expect(page.locator('[data-loadout-ship="aegs_javelin"]')).toHaveCount(0);
        await page.locator('#loadout-ship-search').fill('asgard');
        await expect(page.locator('[data-loadout-ship="anvl_asgard"]')).toBeVisible();
    });

});

test('부품 상세는 후보 비교·판매처·장착으로 이어지고 Escape가 선택 목록으로 돌아간다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openAsgard(page, { prices: { [MANTIS]: [{ shop: 'Test shop', place: 'New Babbage', system: 'Stanton', price: 100 }] } });
    await firstGunSlot(page).locator('[data-loadout-open]').click();
    await page.locator('#loadout-picker-search').fill('Mantis');
    await page.locator(`.loadout-picker [data-loadout-detail="${MANTIS}"]`).click();
    await expect(page.locator('.loadout-detail')).toContainText('현재 장착 부품과 비교');
    await page.locator('[data-loadout-detail-tab="shops"]').click();
    await expect(page.locator('.loadout-detail-shops')).toContainText('New Babbage');
    await page.keyboard.press('Escape');
    await expect(page.locator('#loadout-picker-search')).toHaveValue('Mantis');
    await page.locator(`.loadout-picker [data-loadout-detail="${MANTIS}"]`).click();
    await page.locator('[data-loadout-detail-equip]').click();
    await expect(page.locator('.loadout-detail')).toHaveCount(0);
    await expect(page.locator('.loadout-slot.is-changed')).toContainText('맨티스');
    expect(errors).toEqual([]);
});

test('장비 접기·간결 보기·변경 필터와 다시 실행을 함께 사용할 수 있다', async ({ page }) => {
    await openAsgard(page);
    await page.locator('[data-loadout-collapse="weapon"]').click();
    await expect(page.locator('#loadout-rows-weapon')).toBeHidden();
    await page.locator('[data-loadout-collapse-all]').click();
    await expect(page.locator('#loadout-rows-weapon')).toBeVisible();
    await page.locator('#loadout-compact').check();
    await expect(page.locator('#loadout-app')).toHaveClass(/is-compact/);
    await firstGunSlot(page).locator('[data-loadout-open]').click();
    await pick(page, MANTIS).click();
    await page.locator('[data-loadout-undo]').click();
    await expect(page.locator('[data-loadout-redo]')).toBeEnabled();
    await page.locator('[data-loadout-redo]').click();
    await expect(page.locator('.loadout-slot.is-changed')).toContainText('맨티스');
    await page.locator('#loadout-changed-only').check();
    await expect(page.locator('.loadout-slot:visible')).toHaveCount(1);
});

test('모바일 상세창은 넘치지 않고 키보드 초점이 창 안에서 순환한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAsgard(page);
    await firstGunSlot(page).locator('[data-loadout-detail]').click();
    await expect(page.locator('#loadout-detail-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.loadout-detail-actions button').last()).toBeFocused();
    const box = await page.locator('.loadout-detail').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: 'test-results/loadout-detail-mobile.png' });
    await page.keyboard.press('Escape');
    await expect(firstGunSlot(page).locator('[data-loadout-detail]')).toBeFocused();
});

test('판매처는 숨긴 alias에서 대표 부품으로 복원되고 채광 모듈 분류도 조회한다', async ({ page }) => {
    await mockApi(page);
    const types = [];
    await page.route('**/api/uex/loadout-prices**', (route) => {
        const category = new URL(route.request().url()).searchParams.get('category'); types.push(category);
        return route.fulfill({ json: { status: 'ok', data: category === '29' ? { '5b5d11f8-a2b0-4e6e-80c3-2437cc0accae': [{ shop: 'Shubin', place: 'New Babbage', system: 'Stanton', price: 100 }] } : {} } });
    });
    await gotoSection(page, '#loadout');
    await page.locator('[data-loadout-tab="finder"]').click();
    await page.locator('[data-loadout-finder-type="WeaponMining"]').click();
    await page.locator('#loadout-finder-search').fill('Arbor MH1');
    await page.locator('.loadout-finderlist [data-loadout-detail]').click();
    await page.locator('[data-loadout-detail-tab="shops"]').click();
    await expect(page.locator('.loadout-detail-shops')).toContainText('New Babbage');
    await page.keyboard.press('Escape');
    await page.locator('[data-loadout-finder-type="MiningModifier"]').click();
    await expect.poll(() => types.includes('30')).toBe(true);
});

test('장착 부품 상세에서 교체창으로 이동하고 열 정렬 방향을 바꿀 수 있다', async ({ page }) => {
    await openAsgard(page);
    await firstGunSlot(page).locator('[data-loadout-detail]').click();
    await page.locator('#loadout-detail-tab-stats').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#loadout-detail-tab-shops')).toHaveAttribute('aria-selected', 'true');
    await page.locator('[data-loadout-detail-swap]').click();
    await expect(page.locator('#loadout-picker-search')).toBeFocused();
    await page.locator('[data-loadout-sort="m0"]').click();
    await expect(page.locator('.loadout-opttable th[aria-sort]')).toHaveAttribute('aria-sort', 'descending');
    await page.locator('[data-loadout-sort="m0"]').click();
    await expect(page.locator('.loadout-opttable th[aria-sort]')).toHaveAttribute('aria-sort', 'ascending');
    await page.screenshot({ path: 'test-results/loadout-picker-desktop.png' });
});

test('항속 초과와 잘못된 거리 입력을 즉시 안내한다', async ({ page }) => {
    await openAsgard(page);
    const distance = page.locator('#loadout-qt-distance');
    await distance.fill('999');
    await expect(page.locator('#loadout-qt-warning')).toContainText('중간 급유');
    await distance.fill('-1');
    await expect(distance).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#loadout-qt-time')).toHaveText('—');
    await distance.fill('30');
    await expect(page.locator('#loadout-qt-warning')).toBeHidden();
    await expect(distance).toHaveAttribute('aria-invalid', 'false');
});

test('전원 상태와 변경 필터, 교체창 비교 기준을 표시한다', async ({ page }) => {
    await openAsgard(page);
    await page.locator('.loadout-group.is-shield [data-loadout-open]').first().click();
    await expect(page.locator('.loadout-current-metrics')).toContainText('실드');
    await page.locator('.loadout-picker [data-loadout-power]').click();
    await expect(page.locator('.loadout-shipstate')).toContainText('전원 꺼짐 1곳');
    if (await page.locator('.loadout-picker').isVisible()) await page.keyboard.press('Escape');
    await page.locator('#loadout-changed-only').check();
    await expect(page.locator('.loadout-group.is-shield')).toBeVisible();
    await expect(page.locator('.loadout-group.is-weapon')).toBeHidden();
});

test('기본 채광 헤드의 빈 모듈 슬롯에 실제 모듈을 장착한다', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('prospector');
    await page.locator('[data-loadout-ship="misc_prospector"]').click();
    const moduleSlot = page.locator('[data-loadout-open*="BONE_ItemPort_Consumable_1"]').first();
    await moduleSlot.click();
    await expect(page.locator('.loadout-picker-count')).not.toContainText('맞는 부품 0종');
    await pick(page, '2ceb0de9-105b-434e-a152-8af1fd1660d0').click();
    await expect(page.locator('[data-loadout-detail="2ceb0de9-105b-434e-a152-8af1fd1660d0"]')).toBeVisible();
});

test('스토커 랙 교체에서 임시 폭탄 랙을 숨기고 닫으면 원래 버튼으로 돌아간다', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('stalker');
    await page.locator('[data-loadout-ship="aegs_avenger_stalker"]').click();
    const opener = page.locator('.loadout-group.is-missile [data-loadout-open]').first();
    await opener.click();
    await page.getByRole('button', { name: '랙 변경', exact: true }).click();
    await expect(pick(page, '549964bb-a674-41ba-86d5-55a6d3c25931')).toHaveCount(0);
    await expect(pick(page, 'f8d3a1e1-0d75-45bb-a453-898a7cf83382')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
});
