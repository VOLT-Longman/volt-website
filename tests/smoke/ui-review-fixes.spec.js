const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 화면 평가(2026-11-16)에서 나온 사용성 보완의 회귀 가드.
test.describe('화면 평가 보완', () => {
    test('공지 미리보기: 소제목·구분선을 건너뛰고 실제 문장을 보여준다', async ({ page }) => {
        await mockApi(page);
        await page.route(/\/api\/notices$/, (route) => route.fulfill({ json: { items: [
            { id: 'n1', title: '함선DB 정리', tag: '업데이트', date: '2026-10-18', pinned: true, published: true,
                content: '■ 내용\n\n함선DB에서 사진이 없던 8개 항목을 정리했습니다.\n\n⸻\n\n■ 주요 변경 사항\n\n1. 이미지 미등록 항목 정리',
                titleEn: 'Ship DB cleanup', contentEn: '■ Overview\n\nWe removed eight entries without photos.\n\n---\n\n■ Changes' },
            { id: 'n2', title: '소제목 없는 공지', tag: '안내', date: '2026-10-17', pinned: false, published: true, content: '첫 문장입니다.\n둘째 문장입니다.' },
        ] } }));
        await gotoSection(page, '#notices');

        const first = page.locator('#notices-list .notice-card').first().locator('.notice-excerpt');
        await expect(first).toContainText('함선DB에서 사진이 없던 8개 항목을 정리했습니다.');
        await expect(first).not.toContainText('■');
        await expect(first).not.toContainText('⸻');
        await expect(page.locator('#notices-list .notice-card').nth(1).locator('.notice-excerpt')).toHaveText('첫 문장입니다. 둘째 문장입니다.');

        // 상세 보기에는 소제목과 나머지 본문이 그대로 남는다.
        await page.locator('#notices-list .notice-card').first().click();
        await expect(page.locator('#global-modal')).toContainText('주요 변경 사항');
        await expect(page.locator('#global-modal')).toContainText('이미지 미등록 항목 정리');
    });

    test('무역플래너: 언어를 바꾸면 상품 로드 상태 문구도 그 언어로 바뀐다', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await mockApi(page);
        await page.route(/\/api\/uex\/commodities$/, (route) => route.fulfill({
            json: { status: 'ok', data: [{ id: 1, name: 'Gold', code: 'GOLD', category_name: 'Metal', is_visible: 1, is_available_live: 1 }] },
        }));
        await gotoSection(page, '#trade-planner');
        const status = page.locator('#uex-status');
        await expect(status).toHaveText('Loaded 1 commodities.');

        await page.locator('.nav-lang [data-set-lang="ko"]').click();
        await expect(status).toHaveText('상품 1종을 불러왔습니다.');
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(status).toHaveText('Loaded 1 commodities.');
        await ctx.close();
    });

    test('모바일 360px: 입력창은 16px 이상(자동 확대 방지), 주요 버튼은 44px 이상, 가로 넘침 없음', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
        const page = await ctx.newPage();
        await mockApi(page);
        for (const [hash, inputs, targets] of [
            ['#notices', ['#notice-search'], ['#hamburger']],
            ['#ships', ['#ship-search'], ['.ship-filter-btn']],
            ['#trade-planner', ['#uex-commodity-search', '#ledger-qty'], ['#planner-reset']],
            ['#schedule', [], ['.schedule-rsvp-btn']],
            ['#policy', [], ['.policy-anchor-copy']],
        ]) {
            await gotoSection(page, hash);
            for (const selector of inputs) {
                const size = await page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
                expect(size, `${hash} ${selector} 글자 크기`).toBeGreaterThanOrEqual(16);
            }
            for (const selector of targets) {
                const box = await page.locator(selector).first().boundingBox();
                expect(box.height, `${hash} ${selector} 높이`).toBeGreaterThanOrEqual(44);
            }
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow, `${hash} 가로 넘침`).toBeLessThanOrEqual(1);
        }
        await ctx.close();
    });

    test('함선DB 모바일: 24척씩 보여주고 더 보기로 이어 붙이며, 검색하면 처음부터 다시 센다', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '#ships');
        const cards = page.locator('#ships-grid .ship-card');
        const more = page.locator('#ships-grid [data-ships-more]');
        await expect(cards).toHaveCount(24);
        await expect(page.locator('#ship-results-summary')).toContainText('246');
        await expect(more).toHaveText('더 보기 (222척 남음)');
        const firstId = await cards.first().getAttribute('data-ship-id');

        await more.click();
        await expect(cards).toHaveCount(48);
        await expect(more).toHaveText('더 보기 (198척 남음)');
        // 앞서 보던 목록은 그대로 유지된다.
        await expect(cards.first()).toHaveAttribute('data-ship-id', firstId);

        // 격납고 추가처럼 목록이 그대로인 다시 그리기는 펼친 개수를 유지한다.
        await cards.first().locator('.hangar-toggle-btn').click();
        await expect(cards).toHaveCount(48);

        // 검색으로 결과가 바뀌면 첫 묶음부터 다시 보여주고, 남은 것이 없으면 버튼이 사라진다.
        await page.locator('#ship-search').fill('Hercules');
        await expect(more).toHaveCount(0);
        expect(await cards.count()).toBeLessThanOrEqual(24);
        await page.locator('#ship-search').fill('');
        await expect(cards).toHaveCount(24);
        const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(pageHeight).toBeLessThan(20000);
        await ctx.close();
    });

    test('함선DB 데스크톱: 전체 목록을 그대로 보여주고 더 보기 버튼이 없다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships-grid .ship-card')).toHaveCount(246);
        await expect(page.locator('#ships-grid [data-ships-more]')).toHaveCount(0);
    });

    test('가입: 제목 바로 아래에서 지원서·Discord 버튼을 바로 누를 수 있다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#join');
        const top = page.locator('#join .join-buttons-top');
        const apply = top.locator('a', { hasText: '지원서 제출' });
        await expect(apply).toBeVisible();
        await expect(apply).toHaveAttribute('href', /^https:\/\/forms\.gle\//);
        await expect(top.locator('a', { hasText: 'Discord' })).toBeVisible();
        // 상단 버튼은 가입 절차 설명보다 위에 있다.
        const applyBox = await apply.boundingBox();
        const stepsBox = await page.locator('#join-steps').boundingBox();
        expect(applyBox.y).toBeLessThan(stepsBox.y);
        // 설명 뒤의 기존 버튼도 그대로 유지한다.
        await expect(page.locator('#join .join-cta .join-buttons a')).toHaveCount(2);
    });
});
