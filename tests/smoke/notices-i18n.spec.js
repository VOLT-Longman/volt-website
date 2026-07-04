const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 공지 CMS 다국어(EN) 표시 + KO fallback 회귀 가드.
const NOTICES = [
    {
        id: 'en1', title: '한국어 제목', content: '한국어 본문입니다.', tag: '공지',
        titleEn: 'English Title', contentEn: 'This is the English body.', tagEn: 'Notice',
        pinned: 1, published: true, date: '2026-07-01',
    },
    {
        id: 'ko1', title: '작전 공지', content: '작전 본문입니다.', tag: '작전',
        titleEn: '', contentEn: '', tagEn: '',
        pinned: 0, published: true, date: '2026-06-20',
    },
];

async function routeNotices(page) {
    // helpers의 포괄 라우트({})보다 나중에 등록해 우선 적용한다.
    await page.route('**/api/notices', (route) => route.fulfill({ json: { items: NOTICES } }));
}

test.describe('공지 다국어 (KO/EN)', () => {
    test('KO 모드: 기존 한국어 제목/태그/본문 표시', async ({ page }) => {
        await mockApi(page);
        await routeNotices(page);
        await gotoSection(page, '#notices');

        const list = page.locator('#notices-list');
        await expect(list).toContainText('한국어 제목');
        await expect(list).toContainText('한국어 본문');
        await expect(list).toContainText('작전 공지');
        await expect(list).not.toContainText('English Title');
    });

    test('EN 모드: title_en/content_en/tag_en 표시', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await routeNotices(page);
        await gotoSection(page, '#notices');

        const enCard = page.locator('#notices-list .notice-card').filter({ hasText: 'English Title' });
        await expect(enCard).toBeVisible();
        await expect(enCard).toContainText('English body');
        await expect(enCard.locator('.notice-tag')).toHaveText('Notice');
        await expect(enCard).not.toContainText('한국어 제목');
        await ctx.close();
    });

    test('EN 모드: EN 비어 있는 공지는 KO fallback', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await routeNotices(page);
        await gotoSection(page, '#notices');

        // ko1은 titleEn이 비어 있으므로 KO 제목으로 fallback.
        const koCard = page.locator('#notices-list .notice-card').filter({ hasText: '작전 공지' });
        await expect(koCard).toBeVisible();
        await ctx.close();
    });

    test('EN 모드: 모달도 영어 본문 표시', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await routeNotices(page);
        await gotoSection(page, '#notices');

        await page.locator('#notices-list .notice-card').filter({ hasText: 'English Title' }).click();
        const modal = page.locator('#global-modal');
        await expect(modal).toHaveClass(/active/);
        await expect(modal.locator('.modal-title')).toHaveText('English Title');
        await expect(modal).toContainText('This is the English body.');
        await expect(modal.locator('.notice-tag')).toHaveText('Notice');

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/);
        await ctx.close();
    });

    test('언어 토글: KO → EN 시 공지 카드 즉시 재렌더', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await ctx.newPage();
        await mockApi(page);
        await routeNotices(page);
        await gotoSection(page, '#notices');

        const list = page.locator('#notices-list');
        await expect(list).toContainText('한국어 제목');
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(list).toContainText('English Title');
        await expect(list).not.toContainText('한국어 제목');
        await ctx.close();
    });

    test('필터/모달 열고닫기 회귀 없음', async ({ page }) => {
        await mockApi(page);
        await routeNotices(page);
        await gotoSection(page, '#notices');

        // 태그 필터(KO 기준)로 좁히기
        await page.locator('#notice-filters .notice-filter-btn', { hasText: '작전' }).click();
        await expect(page.locator('#notices-list')).toContainText('작전 공지');
        await expect(page.locator('#notices-list')).not.toContainText('한국어 제목');

        // 전체로 되돌리기 + 모달 열고 닫기
        await page.locator('#notice-filters .notice-filter-btn', { hasText: '전체' }).click();
        await page.locator('#notices-list .notice-card').first().click();
        const modal = page.locator('#global-modal');
        await expect(modal).toHaveClass(/active/);
        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/);
    });
});
