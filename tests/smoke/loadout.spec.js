const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// 로드아웃 편집기: 함선 선택 → 부품 교체 → 요약·구매 목록 → 공유·저장 회귀 가드.
// 수치 자료는 저장소의 data/loadout(게임 파일에서 추출)을 그대로 쓰고, 가격(UEX)만 모의한다.
// 한국어 표기는 게임 한국어 패치 기준(data/loadout/ko.json)이다.
const MANTIS = 'b837397c-47b6-45e7-b409-db290a068b47'; // Mantis GT-220 Gatling = 맨티스 GT-220 개틀링
const DPS = 'DPS (초당 피해)';

async function openAsgard(page, { prices = {} } = {}) {
    await mockApi(page);
    await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: prices } }));
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('asgard');
    await page.locator('[data-loadout-ship="anvl_asgard"]').click();
    await expect(page.locator('#loadout-ship-title')).toHaveText('앤빌 아스가르드');
}
// 통계 패널의 수치: 이름표가 정확히 일치하는 칸의 값
const stat = (page, label) => page.locator('.loadout-stat').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
const panel = (page) => page.locator('.loadout-panel');
const firstGunSlot = (page, name = 'CF-337 판터 리피터') => page.locator('.loadout-slot:not(.is-parent)', { hasText: name }).first();
const pick = (page, id) => page.locator(`.loadout-options [data-loadout-pick="${id}"]`);

test.describe('로드아웃 편집기', () => {
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
        await expect(page.locator('#loadout-ship-count')).toHaveText('전체 224척');
        await expect(page.locator('#loadout-ship-results [data-loadout-ship]')).toHaveCount(224);

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
        await expect(page.locator('#loadout-ship-results [data-loadout-ship]')).toHaveCount(224);
        await page.locator('[data-loadout-browse]').click();

        // 용어와 부품 이름은 게임 한국어 패치 표기를 따른다.
        const groups = await page.locator('.loadout-group h4').allInnerTexts();
        for (const term of ['실드 제너레이터', '파워 플랜트', '쿨러', '퀀텀 드라이브']) expect(groups.some((label) => label.includes(term)), term).toBe(true);
        await expect(page.locator('.loadout-panel-section', { hasText: '퀀텀 속도' })).toContainText('스풀링');
        await expect(firstGunSlot(page)).toContainText('CF-337 Panther Repeater');
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
        expect(await picker.locator('.loadout-options .loadout-meta').allInnerTexts().then((list) => list.every((line) => line.startsWith('S3')))).toBe(true);
        // 한국어 이름으로도, 원문 이름으로도 찾을 수 있다.
        await picker.locator('#loadout-picker-search').fill('맨티스');
        const option = picker.locator('.loadout-options li', { has: page.locator(`[data-loadout-pick="${MANTIS}"]`) });
        await expect(option).toContainText('맨티스 GT-220 개틀링');
        await picker.locator('#loadout-picker-search').fill('mantis');
        await expect(option).toContainText('Mantis GT-220 Gatling');
        await expect(option).toContainText('최저 23,500 aUEC');
        // 지금 달린 무기보다 얼마나 센지 고르기 전에 보인다.
        await expect(option.locator('.loadout-delta')).toHaveText(/^DPS \+\d/);
        await pick(page, MANTIS).click();

        await expect(page.locator('.loadout-picker')).toHaveCount(0);
        await expect(stat(page, DPS)).not.toHaveText('5,313');
        // 기본 장착보다 얼마나 달라졌는지 통계 패널에 표시된다.
        await expect(page.locator('.loadout-stat').filter({ has: page.getByText(DPS, { exact: true }) }).locator('.loadout-change')).toHaveText(/^\+\d/);
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
        const option = page.locator('.loadout-options li', { has: page.locator(`[data-loadout-pick="${MANTIS}"]`) });
        await expect(option.locator('.loadout-price')).toHaveText('상점 판매 없음 · 파밍 획득');
        await expect(pick(page, MANTIS)).toBeEnabled();
        await pick(page, MANTIS).click();
        await expect(page.locator('.loadout-slot.is-changed')).toContainText('맨티스 GT-220 개틀링');
        await expect(panel(page)).toContainText('1종은 상점 판매 없음 (파밍 획득)');
        await expect(page.locator('.loadout-shopping')).toContainText('파밍(전리품)으로 얻는 부품');
    });

    test('부품 선택 창: 같은 부품 여러 곳을 한 번에 바꾸고, 걸러 보고, Esc로 닫는다', async ({ page }) => {
        await openAsgard(page, { prices: { [MANTIS]: [{ shop: 'CenterMass', place: 'Area 18', system: 'Stanton', price: 23500 }] } });
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        const picker = page.locator('.loadout-picker');
        await expect(picker).toHaveAttribute('role', 'dialog');
        const total = await picker.locator('.loadout-options li').count();

        // 상점에서 파는 것만 걸러 본다 → 가격표에 있는 맨티스만 남는다.
        await picker.locator('[data-loadout-buyable]').click();
        await expect(picker.locator('.loadout-options li')).toHaveCount(1);
        await expect(picker.locator('.loadout-options li')).toContainText('맨티스 GT-220 개틀링');
        await picker.locator('[data-loadout-buyable]').click();
        await expect(picker.locator('.loadout-options li')).toHaveCount(total);

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
        await expect(stat(page, 'Damage per second')).toHaveText('5,313');
        await firstGunSlot(page, 'CF-337 Panther Repeater').locator('[data-loadout-open]').click();
        await expect(page.locator('.loadout-options li').first()).toContainText('Couldn\'t load prices');
        await pick(page, MANTIS).click();
        await expect(stat(page, 'Damage per second')).not.toHaveText('5,313');
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

        // 부품 선택 창에서 바꾸지 않고 담기만 한다.
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await page.locator('.loadout-options li', { has: page.locator(`[data-loadout-pick="${MANTIS}"]`) }).locator('[data-loadout-cart-add]').click();
        await expect(page.locator('#toast')).toContainText('장바구니에 담았습니다');
        await page.keyboard.press('Escape');
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
        const total = await table.locator('tfoot th').last().innerText();
        expect(total).toBe(await stat(page, DPS).innerText());

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
        await page.locator('#loadout-build-name').fill('맨티스 시험');
        await page.locator('[data-loadout-build-save]').click();
        await expect(page.locator('.loadout-buildlist li')).toHaveCount(1);
        await expect(page.locator('.loadout-buildlist li')).toContainText('맨티스 시험');
        await expect(page.locator('.loadout-buildlist li')).toContainText('1곳 변경됨');

        await page.locator('[data-loadout-reset-all]').click();
        await expect(stat(page, DPS)).toHaveText('5,313');
        await page.locator('[data-loadout-build-load="0"]').click();
        await expect(stat(page, DPS)).toHaveText(changedDps);
        await page.locator('[data-loadout-build-delete="0"]').click();
        await expect(page.locator('.loadout-buildlist li')).toHaveCount(0);
        // 실드 저항이 방어 구역에 표시된다.
        await expect(panel(page)).toContainText('물리 저항');
    });

    test('모바일 390px: 가로 넘침 없이 부품을 바꿀 수 있다', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
        const page = await ctx.newPage();
        await openAsgard(page);
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await pick(page, MANTIS).click();
        await expect(page.locator('.loadout-slot.is-changed')).toHaveCount(1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
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
        await expect(page.locator('.loadout-view')).toContainText('먼저 구성을 하나 저장해 보세요');

        // 기본 장착을 저장해 두고, 기총을 바꾼 뒤 비교한다.
        await page.locator('#loadout-build-name').fill('기본형');
        await page.locator('[data-loadout-build-save]').click();
        await page.locator('[data-loadout-tab="slots"]').click();
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await page.locator('#loadout-bulk').check();
        await pick(page, MANTIS).click();
        await page.locator('[data-loadout-build-compare="0"]').click();
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
        await shield.locator('[data-loadout-power]').click();
        await expect(stat(page, '실드')).toContainText('31,680');
        await expect(shield).toHaveClass(/is-off/);
        await expect(shield).toContainText('전원 꺼짐');
        await expect(panel(page)).toContainText('부품 1개의 전원을 꺼 둔 상태입니다');
        await expect(panel(page)).toContainText(/남는 출력|출력 부족/);

        await page.reload();
        await expect(stat(page, '실드')).toContainText('31,680');
        await page.locator('.loadout-group.is-shield .loadout-slot').first().locator('[data-loadout-power]').click();
        await expect(stat(page, '실드')).toHaveText('42,240');

        await page.locator('.loadout-group.is-shield .loadout-slot').first().locator('[data-loadout-power]').click();
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
        expect(anvil).toBeLessThan(224);
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
        await expect(gun.locator('.loadout-metric')).toHaveText(/546\s*DPS/);
        // 아래에 부품을 거느린 자리(퀀텀 드라이브 › 점프 모듈)는 들여쓰기로 관계를 보여준다.
        await expect(page.locator('.loadout-group.is-quantum .loadout-slot.is-mount')).toHaveCount(1);
        await expect(page.locator('.loadout-group.is-quantum .loadout-slot.is-child')).toHaveCount(1);
        // 성능 패널은 안쪽 스크롤 없이 펼쳐진다.
        const scrolls = await panel(page).evaluate((el) => el.scrollHeight - el.clientHeight);
        expect(scrolls).toBeLessThanOrEqual(1);

        // 부품 선택 창: 후보마다 대표 수치와 지금 부품과의 차이가 같은 열에 놓인다.
        await gun.locator('[data-loadout-open]').click();
        const option = page.locator('.loadout-options li', { has: page.locator(`[data-loadout-pick="${MANTIS}"]`) });
        await expect(option.locator('.loadout-metric')).toHaveText(/853\s*DPS/);
        await expect(option.locator('.loadout-delta')).toHaveText(/^DPS \+\d/);
    });
});
