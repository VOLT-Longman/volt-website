const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 격납고를 로컬스토리지에 미리 심는다(페이지 스크립트보다 먼저 실행).
async function seedHangar(page, shipIds) {
    await page.route('**/api/me/preferences', (route) => route.fulfill({ json: { preferences: { favorites: shipIds, planner: {} } } }));
}

async function routeRsvps(page, items) {
    await page.route('**/api/me/rsvps', (route) => route.fulfill({ json: { items } }));
}

test.describe('마이페이지 격납고', () => {
    test('격납고 empty state KO', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await gotoSection(page, '#mypage');
        await expect(page.locator('#mypage-content')).toContainText('격납고가 비어 있습니다');
    });

    test('격납고 empty state EN', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page, { loggedIn: true });
        await gotoSection(page, '#mypage');
        await expect(page.locator('#mypage-content')).toContainText('Your hangar is empty');
        await ctx.close();
    });

    test('격납고 함선 카드 + 제거 버튼 aria-label(KO)', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await seedHangar(page, ['aurora-es']);
        await gotoSection(page, '#mypage');

        const removeBtn = page.locator('#mypage-content [data-mypage-hangar-remove="aurora-es"]');
        await expect(removeBtn).toBeVisible();
        await expect(removeBtn).toHaveAttribute('aria-label', /격납고에서 제거/);
    });

    test('격납고 제거 버튼 aria-label(EN) + 제거 동작', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page, { loggedIn: true });
        await seedHangar(page, ['aurora-es']);
        await gotoSection(page, '#mypage');

        const removeBtn = page.locator('#mypage-content [data-mypage-hangar-remove="aurora-es"]');
        await expect(removeBtn).toHaveAttribute('aria-label', /Remove from hangar/);
        await removeBtn.click();
        // 제거 후 empty state로 회귀
        await expect(page.locator('#mypage-content')).toContainText('Your hangar is empty');
        await ctx.close();
    });
});

test.describe('마이페이지 RSVP', () => {
    test('RSVP empty state KO/EN', async ({ browser }) => {
        const koCtx = await browser.newContext({ locale: 'ko-KR' });
        const koPage = await koCtx.newPage();
        await mockApi(koPage, { loggedIn: true });
        await gotoSection(koPage, '#mypage');
        await expect(koPage.locator('#mypage-rsvp-list')).toContainText('참가한 일정이 없습니다');
        await koCtx.close();

        const enCtx = await browser.newContext({ locale: 'en-US' });
        const enPage = await enCtx.newPage();
        await mockApi(enPage, { loggedIn: true });
        await gotoSection(enPage, '#mypage');
        await expect(enPage.locator('#mypage-rsvp-list')).toContainText('No RSVPs yet');
        await enCtx.close();
    });

    test('RSVP 항목 상태 라벨 KO', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await routeRsvps(page, [{ title: 'Quarterly Fleet Event', status: '참가', dateLabel: '2026-07-10' }]);
        await gotoSection(page, '#mypage');
        const list = page.locator('#mypage-rsvp-list');
        await expect(list).toContainText('Quarterly Fleet Event');
        await expect(list).toContainText('참가');
    });

    test('RSVP 항목 상태 라벨 EN(참가 → Going)', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page, { loggedIn: true });
        await routeRsvps(page, [{ title: 'Quarterly Fleet Event', status: '참가', dateLabel: '2026-07-10' }]);
        await gotoSection(page, '#mypage');
        const list = page.locator('#mypage-rsvp-list');
        await expect(list).toContainText('Going');
        await expect(list).not.toContainText('참가');
        await ctx.close();
    });
});

test.describe('마이페이지 언어 토글', () => {
    test('KO → EN 전환 시 동적 영역 즉시 재렌더 + 새로고침 후 유지', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await ctx.newPage();
        await mockApi(page, { loggedIn: true });
        await seedHangar(page, ['aurora-es']);
        await gotoSection(page, '#mypage');

        const content = page.locator('#mypage-content');
        await expect(content).toContainText('프로필');

        await page.locator('.nav-lang [data-set-lang="en"]').click();
        // 동적 마이페이지 카드가 즉시 영어로 재렌더
        await expect(content).toContainText('Profile');
        await expect(content.locator('[data-mypage-hangar-remove="aurora-es"]')).toHaveAttribute('aria-label', /Remove from hangar/);

        await page.reload();
        await page.waitForSelector('#loading-splash', { state: 'hidden' });
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('#mypage-content')).toContainText('Profile');
        await ctx.close();
    });
});

test.describe('마이페이지 보완 (저장 실패 안내·격납고 전체 보기·참가 일정 영문)', () => {
    // 실제 함선 id 15개 — 12척 미리보기 한도를 넘긴다.
    const MANY_SHIPS = require('../../data/canonical/ships-canonical.json').ships.slice(0, 15).map((ship) => ship.id);

    test('격납고 12척 초과 시 전체 보기로 모두 표시하고 접을 수 있다', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await seedHangar(page, MANY_SHIPS);
        await gotoSection(page, '#mypage');
        const rows = page.locator('#mypage-content [data-mypage-hangar-remove]');
        const toggle = page.locator('#mypage-content [data-mypage-hangar-toggle]');
        await expect(rows).toHaveCount(12);
        await expect(toggle).toHaveText('전체 15척 보기');
        await toggle.click();
        await expect(rows).toHaveCount(15);
        await expect(toggle).toHaveText('접기');
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await toggle.click();
        await expect(rows).toHaveCount(12);
    });

    test('격납고 12척 이하에서는 전체 보기 버튼이 없다', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await seedHangar(page, MANY_SHIPS.slice(0, 12));
        await gotoSection(page, '#mypage');
        await expect(page.locator('#mypage-content [data-mypage-hangar-remove]')).toHaveCount(12);
        await expect(page.locator('#mypage-content [data-mypage-hangar-toggle]')).toHaveCount(0);
    });

    test('자동 저장 실패를 화면에 알리고 다시 시도해 성공하면 저장됨을 알린다', async ({ page }) => {
        await page.clock.install();
        await mockApi(page, { loggedIn: true });
        let puts = 0;
        await page.route('**/api/me/preferences', (route) => {
            if (route.request().method() !== 'PUT') return route.fulfill({ json: { preferences: { favorites: ['aurora-es'], planner: {} } } });
            puts += 1;
            return puts === 1 ? route.fulfill({ status: 503, json: { error: 'unavailable' } }) : route.fulfill({ json: { preferences: {} } });
        });
        await gotoSection(page, '#mypage');
        await page.locator('#mypage-content [data-mypage-hangar-remove="aurora-es"]').click();
        await page.clock.runFor(1000);
        await expect(page.locator('#toast')).toContainText('설정을 저장하지 못했습니다');
        expect(puts).toBe(1);
        await page.clock.runFor(5000);
        await expect(page.locator('#toast')).toContainText('설정을 저장했습니다');
        expect(puts).toBe(2);
    });

    test('다시 시도해도 소용없는 저장 오류(4xx)는 재시도하지 않고 안내한다', async ({ page }) => {
        await page.clock.install();
        await mockApi(page, { loggedIn: true });
        let puts = 0;
        await page.route('**/api/me/preferences', (route) => {
            if (route.request().method() !== 'PUT') return route.fulfill({ json: { preferences: { favorites: ['aurora-es'], planner: {} } } });
            puts += 1;
            return route.fulfill({ status: 409, json: { error: 'Account changed' } });
        });
        await gotoSection(page, '#mypage');
        await page.locator('#mypage-content [data-mypage-hangar-remove="aurora-es"]').click();
        await page.clock.runFor(1000);
        await expect(page.locator('#toast')).toContainText('새로고침 후 다시 시도');
        await page.clock.runFor(60000);
        expect(puts).toBe(1);
    });

    test('참가 일정: 영어 화면은 영문 제목·날짜, 한국어 화면은 원문', async ({ browser }) => {
        const items = [{ title: 'TSG 작전', titleEn: 'TSG operation', status: '참가', dateLabel: '2026.05.31', dateLabelEn: '2026-05-31' }, { title: '번역 없는 일정', titleEn: '', status: '대기', dateLabel: '미정', dateLabelEn: '' }];
        const enCtx = await browser.newContext({ locale: 'en-US' });
        const enPage = await enCtx.newPage();
        await mockApi(enPage, { loggedIn: true });
        await routeRsvps(enPage, items);
        await gotoSection(enPage, '#mypage');
        const enList = enPage.locator('#mypage-rsvp-list');
        await expect(enList).toContainText('TSG operation');
        await expect(enList).toContainText('2026-05-31');
        await expect(enList).not.toContainText('TSG 작전');
        await expect(enList).toContainText('번역 없는 일정');
        await enCtx.close();

        const koCtx = await browser.newContext({ locale: 'ko-KR' });
        const koPage = await koCtx.newPage();
        await mockApi(koPage, { loggedIn: true });
        await routeRsvps(koPage, items);
        await gotoSection(koPage, '#mypage');
        await expect(koPage.locator('#mypage-rsvp-list')).toContainText('TSG 작전');
        await expect(koPage.locator('#mypage-rsvp-list')).not.toContainText('TSG operation');
        await koCtx.close();
    });
});
