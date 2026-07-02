const { test, expect } = require('@playwright/test');

// 관리자 CMS 회귀 가드 (API는 전부 모킹 — 정적 dev 서버에는 Functions가 없음).
// ① 함선 검색: 타이핑 중 목록 재렌더가 검색 input을 파괴해 포커스(한글 IME)가 끊기던 버그
// ② 동시 편집: 수정 시작 시점 updatedAt(expectedUpdatedAt) 에코 + 409 시 폼 유지

const NOTICES = [
    { id: 'n1', title: '첫 공지', content: '내용1', tag: '공지', pinned: false, published: true, date: '2026-06-10', updatedAt: '2026-06-20T10:00:00.000Z' },
];

async function mockAdminApi(page, { conflictOnPut = false } = {}) {
    await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
    await page.route('**/api/admin/notices', (route) => route.fulfill({ json: { items: NOTICES } }));
    await page.route('**/api/admin/notices/n1', (route) => {
        if (route.request().method() !== 'PUT') return route.fulfill({ json: { ok: true } });
        if (conflictOnPut) {
            return route.fulfill({ status: 409, json: { error: '다른 관리자가 먼저 저장했습니다. 목록을 새로고침해 최신 내용을 확인한 뒤 다시 수정해 주세요.' } });
        }
        return route.fulfill({ json: { item: { ...NOTICES[0], title: '수정됨' } } });
    });
    await page.route('**/api/admin/ships', (route) => route.fulfill({ json: { items: [] } }));
}

test.describe('관리자 CMS', () => {
    test('함선 검색: 연속 타이핑에도 검색 입력 포커스 유지(커서 풀림 회귀)', async ({ page }) => {
        await mockAdminApi(page);
        await page.goto('/admin/');
        await expect(page.locator('#dashboard')).toBeVisible();

        await page.locator('[data-tab="ships"]').click();
        const search = page.locator('#ship-admin-search');
        await expect(search).toBeVisible();

        await search.click();
        // 디바운스(200ms)를 넘겨 재렌더를 유발하며 한 글자씩 입력
        for (const ch of ['h', 'u', 'l', 'l']) {
            await page.keyboard.type(ch);
            await page.waitForTimeout(300);
            const focused = await page.evaluate(() => document.activeElement?.id);
            expect(focused).toBe('ship-admin-search');
        }
        await expect(search).toHaveValue('hull');
        // 검색 결과도 갱신되어야 함(Hull 시리즈 존재)
        await expect(page.locator('#ship-admin-results')).toContainText(/Hull/i);
    });

    test('동시 편집: PUT에 expectedUpdatedAt 동봉 + 409 시 작성 내용 유지', async ({ page }) => {
        await mockAdminApi(page, { conflictOnPut: true });
        let putBody = null;
        page.on('request', (request) => {
            if (request.method() === 'PUT' && request.url().includes('/api/admin/notices/n1')) {
                putBody = request.postDataJSON();
            }
        });
        await page.goto('/admin/');
        await expect(page.locator('#dashboard')).toBeVisible();

        // 기존 공지 선택 → 제목 수정 → 저장(서버는 409 응답)
        await page.locator('[data-id="n1"]').click();
        const title = page.locator('#cms-form [name="title"]');
        await expect(title).toHaveValue('첫 공지');
        await title.fill('내가 수정한 제목');
        await page.locator('button[type="submit"][form="cms-form"]').click();

        // 잠금 토큰이 동봉되었는지
        await expect.poll(() => putBody?.expectedUpdatedAt).toBe('2026-06-20T10:00:00.000Z');
        // 409 안내가 표시되고, 작성하던 내용은 폼에 그대로 남아야 한다
        await expect(page.locator('#form-message')).toContainText('다른 관리자가 먼저 저장');
        await expect(title).toHaveValue('내가 수정한 제목');
    });

    test('저장하지 않은 변경: 탭 이동 시 확인 대화상자(작성 내용 보호)', async ({ page }) => {
        await mockAdminApi(page);
        await page.goto('/admin/');
        await expect(page.locator('#dashboard')).toBeVisible();

        await page.locator('[data-id="n1"]').click();
        await page.locator('#cms-form [name="title"]').fill('작성 중인 내용');

        let confirmShown = false;
        page.once('dialog', (dialog) => { confirmShown = true; dialog.dismiss(); });
        await page.locator('[data-tab="events"]').click();
        expect(confirmShown).toBe(true);
        // 취소했으므로 공지 탭·폼 유지
        await expect(page.locator('#cms-form [name="title"]')).toHaveValue('작성 중인 내용');
    });
});
