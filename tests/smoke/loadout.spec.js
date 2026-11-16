const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// 로드아웃 편집기: 함선 선택 → 부품 교체 → 요약·구매 목록 → 공유·저장 회귀 가드.
// 수치 자료는 저장소의 data/loadout(출처 Erkul Games)을 그대로 쓰고, 가격(UEX)만 모의한다.

async function openAsgard(page, { prices = {} } = {}) {
    await mockApi(page);
    await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: prices } }));
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('asgard');
    await page.locator('[data-loadout-ship="anvl_asgard"]').click();
    await expect(page.locator('#loadout-ship-title')).toHaveText('앤빌 아스가르드');
}
const stat = (page, label) => page.locator('.loadout-stat', { hasText: label }).locator('strong');
const firstGunSlot = (page) => page.locator('.loadout-slot', { hasText: 'CF-337 Panther Repeater' }).first();

test.describe('로드아웃 편집기', () => {
    test('메뉴에서 들어가 함선을 고르면 기본 장착 요약과 출처가 보인다', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {} } }));
        await gotoSection(page, '');
        await page.locator('.nav-links [data-section="loadout"]').click();
        await expect(page).toHaveURL(/#loadout$/);
        await expect(page.locator('#loadout .section-header h2')).toContainText('로드아웃');
        await expect(page.locator('#loadout-ship-results')).toContainText('225척');

        await page.locator('#loadout-ship-search').fill('아스가르드');
        await page.locator('[data-loadout-ship="anvl_asgard"]').click();
        await expect(page.locator('#loadout-ship-title')).toHaveText('앤빌 아스가르드');
        await expect(stat(page, '초당 화력')).toHaveText('4,910');
        await expect(page.locator('.loadout-stat', { hasText: '초당 화력' })).toContainText('조종사 3,274');
        await expect(stat(page, '실드')).not.toHaveText('0');
        await expect(page.locator('.loadout-group h4').first()).toHaveText('무기·터렛');

        // 자료 출처를 화면에 밝힌다.
        const sources = page.locator('#loadout-sources');
        await expect(sources.locator('a', { hasText: 'Erkul Games' })).toHaveAttribute('href', 'https://www.erkul.games/');
        await expect(sources.locator('a', { hasText: 'UEX' })).toHaveAttribute('href', 'https://uexcorp.space/');
        await expect(sources).toContainText(/게임 자료 버전 \d+\.\d+\.\d+-LIVE/);
        expect(errors).toEqual([]);
    });

    test('무기를 바꾸면 화력·구매 목록이 바뀌고, 기본값으로 되돌릴 수 있다', async ({ page }) => {
        const mantis = await page.request.get('/data/loadout/items.json').then((r) => r.json())
            .then((data) => Object.entries(data.items).find(([, item]) => item.name === 'Mantis GT-220 Gatling')[0]);
        await openAsgard(page, { prices: { [mantis]: [{ shop: 'CenterMass', place: 'Area 18', system: 'Stanton', price: 23500 }, { shop: 'Ship Weapons', place: 'MIC-L2', system: 'Stanton', price: 25000 }] } });
        await expect(stat(page, '초당 화력')).toHaveText('4,910');
        await expect(page.locator('.loadout-shopping')).toContainText('부품을 바꾸면');

        const slot = firstGunSlot(page);
        await slot.locator('[data-loadout-open]').click();
        const picker = page.locator('.loadout-picker');
        await expect(picker).toContainText(/맞는 부품 \d+종/);
        // 크기가 맞는 무기만 나온다(S3 자리).
        expect(await picker.locator('.loadout-options .loadout-meta').allInnerTexts().then((list) => list.every((line) => line.startsWith('S3')))).toBe(true);
        await picker.locator('#loadout-picker-search').fill('mantis');
        const option = picker.locator('.loadout-options li', { hasText: 'Mantis GT-220 Gatling' });
        await expect(option).toContainText('최저 23,500 aUEC');
        await option.locator('[data-loadout-pick]').click();

        await expect(page.locator('.loadout-picker')).toHaveCount(0);
        await expect(stat(page, '초당 화력')).not.toHaveText('4,910');
        const changed = page.locator('.loadout-slot.is-changed');
        await expect(changed).toHaveCount(1);
        await expect(changed).toContainText('Mantis GT-220 Gatling');
        const shopping = page.locator('.loadout-shopping');
        await expect(shopping).toContainText('CenterMass');
        await expect(shopping).toContainText('Area 18, Stanton');
        await expect(shopping.locator('tfoot')).toContainText('23,500 aUEC');
        await expect(stat(page, '바꾼 부품 구매 비용')).toHaveText('23,500 aUEC');

        await changed.locator('[data-loadout-reset]').click();
        await expect(stat(page, '초당 화력')).toHaveText('4,910');
        await expect(page.locator('.loadout-slot.is-changed')).toHaveCount(0);
    });

    test('편집 내용은 새로고침 후에도 남고, 공유 링크로 같은 구성이 열린다', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await openAsgard(page);
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await page.locator('.loadout-options li', { hasText: 'Mantis GT-220 Gatling' }).locator('[data-loadout-pick]').click();
        const changedDps = await stat(page, '초당 화력').innerText();
        expect(changedDps).not.toBe('4,910');

        await page.reload();
        await page.waitForSelector('#loading-splash', { state: 'hidden' });
        await expect(page.locator('#loadout-ship-title')).toHaveText('앤빌 아스가르드');
        await expect(stat(page, '초당 화력')).toHaveText(changedDps);

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
        await expect(stat(other, '초당 화력')).toHaveText(changedDps);

        await page.locator('[data-loadout-reset-all]').click();
        await expect(stat(page, '초당 화력')).toHaveText('4,910');
    });

    test('가격을 못 불러와도 편집은 되고, 영어 화면은 영어로 표시된다', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ status: 503, json: { error: 'down' } }));
        await gotoSection(page, '#loadout');
        await page.locator('#loadout-ship-search').fill('asgard');
        await page.locator('[data-loadout-ship="anvl_asgard"]').click();
        await expect(page.locator('#loadout-ship-title')).toHaveText('Asgard');
        await expect(stat(page, 'Damage per second')).toHaveText('4,910');
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await expect(page.locator('.loadout-options li').first()).toContainText('Couldn\'t load prices');
        await page.locator('.loadout-options li', { hasText: 'Mantis GT-220 Gatling' }).locator('[data-loadout-pick]').click();
        await expect(stat(page, 'Damage per second')).not.toHaveText('4,910');
        await expect(page.locator('.loadout-shopping')).toContainText('Mantis GT-220 Gatling');

        await page.locator('.nav-lang [data-set-lang="ko"]').click();
        await expect(page.locator('.loadout-stat', { hasText: '초당 화력' })).toBeVisible();
        await expect(page.locator('.loadout-slot.is-changed')).toHaveCount(1);
        await ctx.close();
    });

    test('모바일 390px: 가로 넘침 없이 부품을 바꿀 수 있다', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
        const page = await ctx.newPage();
        await openAsgard(page);
        await firstGunSlot(page).locator('[data-loadout-open]').click();
        await page.locator('.loadout-options li', { hasText: 'Mantis GT-220 Gatling' }).locator('[data-loadout-pick]').click();
        await expect(page.locator('.loadout-slot.is-changed')).toHaveCount(1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        const input = await page.locator('#loadout-ship-search').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(input).toBeGreaterThanOrEqual(16);
        await ctx.close();
    });
});
