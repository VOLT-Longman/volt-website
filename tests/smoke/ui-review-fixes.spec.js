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
