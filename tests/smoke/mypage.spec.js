const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 격납고를 로컬스토리지에 미리 심는다(페이지 스크립트보다 먼저 실행).
async function seedHangar(page, shipIds) {
    await page.addInitScript((ids) => {
        localStorage.setItem('volt-hangar', JSON.stringify(ids));
    }, shipIds);
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
