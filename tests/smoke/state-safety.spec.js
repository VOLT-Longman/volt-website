const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 검수(2026-11-16)에서 나온 저장·상태 처리 문제의 회귀 가드.
// 느린 응답, 저장 공간 오류, 실패 후 재시도처럼 "잘 안 될 때" 사용자의 작업을 지키는지 확인한다.
const MANTIS = 'b837397c-47b6-45e7-b409-db290a068b47';

async function openAsgard(page) {
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('asgard');
    await page.locator('[data-loadout-ship="anvl_asgard"]').click();
    await expect(page.locator('#loadout-ship-title')).toHaveText('앤빌 아스가르드');
}
const firstGun = (page) => page.locator('.loadout-slot', { hasText: 'CF-337 판터 리피터' }).first();

test.describe('저장·상태 안전', () => {
    test('설정 응답이 늦게 와도 그 사이 고친 화물량을 덮어쓰지 않고, 고친 값을 서버에 저장한다', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const saved = [];
        await page.route('**/api/me/preferences', async (route) => {
            if (route.request().method() === 'PUT') { saved.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); }
            await gate;
            return route.fulfill({ json: { account: 'test-user', preferences: { favorites: ['server-ship'], planner: { shipId: '', shipSearch: '', cargo: '100' } } } });
        });
        await gotoSection(page, '#trade-planner');
        const cargo = page.locator('#logistics-cargo');
        await cargo.fill('250');
        await cargo.dispatchEvent('change');
        release();
        // 서버 값(100)이 도착해도 사용자가 방금 넣은 값이 남는다.
        await expect.poll(() => saved.length, { timeout: 8000 }).toBeGreaterThan(0);
        await expect(cargo).toHaveValue('250');
        expect(saved.at(-1).planner.cargo).toBe('250');
        // 손대지 않은 항목(격납고)은 서버 값을 따른다.
        expect(saved.at(-1).favorites).toEqual(['server-ship']);
    });

    test('설정 응답이 늦을 때 손대지 않았으면 서버 값을 그대로 적용한다', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await page.route('**/api/me/preferences', async (route) => {
            if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
            await new Promise((resolve) => setTimeout(resolve, 400));
            return route.fulfill({ json: { account: 'test-user', preferences: { favorites: [], planner: { shipId: '', shipSearch: '', cargo: '100' } } } });
        });
        await gotoSection(page, '#trade-planner');
        await expect(page.locator('#logistics-cargo')).toHaveValue('100');
    });

    test('로드아웃: 브라우저 저장에 실패하면 "저장했습니다"가 아니라 실패를 알리고 이름을 남긴다', async ({ page }) => {
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {} } }));
        await openAsgard(page);
        await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
        await page.locator('[data-loadout-builds-toggle]').click();
        await page.locator('#loadout-build-name').fill('내 구성');
        await page.locator('[data-loadout-build-save]').click();
        await expect(page.locator('#toast')).toContainText('저장하지 못했습니다');
        await expect(page.locator('#toast')).not.toContainText('저장했습니다');
        await expect(page.locator('#loadout-build-name')).toHaveValue('내 구성');
        await expect(page.locator('.loadout-buildlist li')).toHaveCount(0);
    });

    test('일정: 화면을 다시 열어도 내가 고른 참가 상태가 버튼에 표시된다', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await page.route(/\/api\/events\/[^/]+\/rsvp$/, (route) => route.fulfill({ json: { items: [], counts: { 참가: 3, 대기: 1, 불참: 0 }, mine: '대기' } }));
        await gotoSection(page, '#schedule');
        const control = page.locator('[data-rsvp-event-id]').first();
        await expect(control.locator('[data-rsvp-summary]')).toContainText('3');
        await expect(control.locator('[data-rsvp-status="대기"]')).toHaveClass(/is-selected/);
        await expect(control.locator('[data-rsvp-status="대기"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(control.locator('[data-rsvp-status="참가"]')).toHaveAttribute('aria-pressed', 'false');
        await expect(control.locator('[data-rsvp-status="참가"]')).not.toHaveClass(/is-selected/);
    });

    test('로드아웃: 가격 조회가 실패하면 다시 시도할 수 있다', async ({ page }) => {
        await mockApi(page);
        let calls = 0;
        await page.route('**/api/uex/loadout-prices**', (route) => {
            calls += 1;
            if (calls === 1) return route.fulfill({ status: 502, json: { status: 'error' } });
            return route.fulfill({ json: { status: 'ok', data: { [MANTIS]: [{ shop: 'CenterMass', place: 'Area 18', system: 'Stanton', price: 23500 }] } } });
        });
        await openAsgard(page);
        await firstGun(page).locator('[data-loadout-open]').click();
        const option = page.locator('.loadout-optrows tr', { has: page.locator(`[data-loadout-pick="${MANTIS}"]`) });
        await expect(option).toContainText('가격을 불러오지 못했습니다');
        await option.locator('[data-loadout-price-retry]').click();
        await expect(option).toContainText('23,500');
        expect(calls).toBe(2);
    });

    test('로드아웃: 부품 선택 창 안에서 Tab이 돌고, 닫으면 눌렀던 변경 버튼으로 초점이 돌아온다', async ({ page }) => {
        // 화면을 덮는 창으로 뜨는 너비(넓은 화면에서는 가운데 칸에 놓여 가두지 않는다).
        await page.setViewportSize({ width: 1100, height: 800 });
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {} } }));
        await openAsgard(page);
        const change = firstGun(page).locator('[data-loadout-open]');
        const path = await change.getAttribute('data-loadout-open');
        await change.click();
        const inside = () => page.evaluate(() => Boolean(document.activeElement?.closest('.loadout-picker')));
        await expect(page.locator('#loadout-picker-search')).toBeFocused();
        // 뒤로(Shift+Tab) 여러 번, 앞으로(Tab) 여러 번 가도 창 밖으로 나가지 않는다.
        for (let i = 0; i < 4; i += 1) { await page.keyboard.press('Shift+Tab'); expect(await inside()).toBe(true); }
        for (let i = 0; i < 6; i += 1) { await page.keyboard.press('Tab'); expect(await inside()).toBe(true); }
        await page.keyboard.press('Escape');
        await expect(page.locator('.loadout-picker')).toHaveCount(0);
        await expect(page.locator(`[data-loadout-open="${path}"]`)).toBeFocused();
        // 부품을 고른 뒤에도 같은 자리의 변경 버튼으로 돌아온다.
        await page.locator(`[data-loadout-open="${path}"]`).click();
        await page.locator(`.loadout-optrows [data-loadout-pick="${MANTIS}"]`).click();
        await expect(page.locator(`[data-loadout-open="${path}"]`)).toBeFocused();
    });
});
