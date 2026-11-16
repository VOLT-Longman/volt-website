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

    test('모바일 390px: 가로 넘침 없이 부품을 바꿀 수 있다', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
        const page = await ctx.newPage();
        await openAsgard(page);
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await pick(page, MANTIS).click();
        await expect(page.locator('.loadout-slot.is-changed')).toHaveCount(1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        const input = await page.locator('#loadout-ship-search').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(input).toBeGreaterThanOrEqual(16);
        await ctx.close();
    });
});
