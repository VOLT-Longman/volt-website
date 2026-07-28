const { test, expect } = require('@playwright/test');

// 관리자 CMS 회귀 가드 (API는 전부 모킹 — 정적 dev 서버에는 Functions가 없음).
// ① 함선 검색: 타이핑 중 목록 재렌더가 검색 input을 파괴해 포커스(한글 IME)가 끊기던 버그
// ② 동시 편집: 수정 시작 시점 updatedAt(expectedUpdatedAt) 에코 + 409 시 폼 유지

const NOTICES = [
    { id: 'n1', title: '첫 공지', content: '내용1', tag: '공지', pinned: false, published: true, date: '2026-06-10', updatedAt: '2026-06-20T10:00:00.000Z' },
];

async function mockAdminApi(page, { conflictOnPut = false, notices = NOTICES } = {}) {
    await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
    await page.route('**/api/admin/notices', (route) => route.fulfill({ json: { items: notices } }));
    await page.route('**/api/admin/notices/n1', (route) => {
        if (route.request().method() !== 'PUT') return route.fulfill({ json: { ok: true } });
        if (conflictOnPut) {
            return route.fulfill({ status: 409, json: { error: '다른 관리자가 먼저 저장했습니다. 목록을 새로고침해 최신 내용을 확인한 뒤 다시 수정해 주세요.' } });
        }
        return route.fulfill({ json: { item: { ...NOTICES[0], title: '수정됨' } } });
    });
    await page.route('**/api/admin/ships', (route) => route.fulfill({ json: { items: [] } }));
}

test('admin notices list always shows latest notices first', async ({ page }) => {
    const notices = [
        { id: 'pinned-old', title: 'Pinned old', content: 'old', tag: 'notice', pinned: true, published: true, date: '2026.05.15', updatedAt: '2026-05-15T10:00:00.000Z' },
        { id: 'same-day', title: 'Same day', content: 'same', tag: 'notice', pinned: false, published: true, date: '2026-07-10', updatedAt: '2026-07-10T09:00:00.000Z' },
        { id: 'latest', title: 'Latest', content: 'latest', tag: 'notice', pinned: false, published: true, date: '2026-07-11', updatedAt: '2026-07-11T09:00:00.000Z' },
    ];
    await mockAdminApi(page, { notices });
    await page.goto('/admin/');

    await expect(page.locator('#list-title')).toHaveText('\uacf5\uc9c0 \ubaa9\ub85d · \ucd5c\uc2e0\uc21c');
    await expect(page.locator('#item-list [data-id]').nth(0)).toHaveAttribute('data-id', 'latest');
    await expect(page.locator('#item-list [data-id]').nth(1)).toHaveAttribute('data-id', 'same-day');
    await expect(page.locator('[data-id="pinned-old"]')).toContainText('\uace0\uc815');
});

test.describe('관리자 CMS', () => {
    test('함선 검색: 연속 타이핑에도 검색 입력 포커스 유지(커서 풀림 회귀)', async ({ page }) => {
        await mockAdminApi(page);
        await page.goto('/admin/');
        await expect(page.locator('#dashboard')).toBeVisible();

        await page.locator('[data-tab="ships"]').click();
        const search = page.locator('#ship-admin-search');
        await expect(search).toBeVisible();

        await search.click();
        // 디바운스(200ms) 뒤 renderList()가 #ship-admin-results의 innerHTML을 통째로 교체한다.
        // 고정 대기 대신 "직전 자식 노드가 DOM에서 떨어졌는가"를 재렌더 완료 신호로 쓴다.
        for (const ch of ['h', 'u', 'l', 'l']) {
            const stale = await page.locator('#ship-admin-results').evaluateHandle((el) => el.firstElementChild);
            await page.keyboard.type(ch);
            await expect.poll(async () => stale.evaluate((el) => !el || !el.isConnected)).toBe(true);
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

// P2-1: 공지 폼 KO/EN 그룹 분리 + 미리보기 + validation 회귀 가드.
test.describe('관리자 공지 UX (P2-1)', () => {
    test('공지 폼: KO/EN 그룹 + 안내 + 미리보기 표시', async ({ page }) => {
        await mockAdminApi(page);
        await page.goto('/admin/');
        await expect(page.locator('#dashboard')).toBeVisible();
        await page.locator('#new-button').click();

        const form = page.locator('#cms-form');
        await expect(form.locator('legend', { hasText: '한국어 공지' })).toBeVisible();
        await expect(form.locator('legend', { hasText: '영어 공지' })).toBeVisible();
        await expect(form.locator('#notice-en-hint')).toContainText('비워두면 한국어');
        // EN 입력이 안내와 aria로 연결됨
        await expect(page.locator('#notice-title-en')).toHaveAttribute('aria-describedby', 'notice-en-hint');
        await expect(form.locator('legend', { hasText: '미리보기' })).toBeVisible();
        await expect(page.locator('#notice-preview-ko')).toBeVisible();
        await expect(page.locator('#notice-preview-en')).toBeVisible();
    });

    test('미리보기: 라이브 갱신 + EN 비면 fallback 배지, 채우면 숨김', async ({ page }) => {
        await mockAdminApi(page);
        await page.goto('/admin/');
        await page.locator('#new-button').click();

        await page.locator('#cms-form [name="title"]').fill('한글 제목');
        await page.locator('#cms-form [name="content"]').fill('한글 본문');
        await expect(page.locator('#notice-preview-ko')).toContainText('한글 제목');
        // EN 비어 있음 → EN 미리보기가 KO fallback + 배지 표시
        await expect(page.locator('#notice-preview-en')).toContainText('한글 제목');
        await expect(page.locator('#notice-preview-en-fallback')).toBeVisible();

        await page.locator('#notice-title-en').fill('EN Title');
        await page.locator('#notice-content-en').fill('EN body');
        await page.locator('#notice-tag-en').fill('Notice');
        await expect(page.locator('#notice-preview-en')).toContainText('EN Title');
        await expect(page.locator('#notice-preview-en-fallback')).toBeHidden();
    });

    test('validation: KO 제목 누락 시 명확한 메시지', async ({ page }) => {
        await mockAdminApi(page);
        await page.goto('/admin/');
        await page.locator('#new-button').click();
        await page.locator('#cms-form [name="content"]').fill('본문만');
        await page.locator('button[type="submit"][form="cms-form"]').click();
        await expect(page.locator('#form-message')).toContainText('한국어 제목은 필수');
    });

    test('EN 비워도 저장 성공 + 저장 후 dirty 초기화', async ({ page }) => {
        await mockAdminApi(page);
        await page.goto('/admin/');
        await page.locator('#new-button').click();
        await page.locator('#cms-form [name="title"]').fill('제목만');
        await page.locator('#cms-form [name="content"]').fill('본문만');
        await page.locator('button[type="submit"][form="cms-form"]').click();
        await expect(page.locator('#form-message')).toContainText('저장');

        // dirty가 초기화되어 탭 이동 시 확인 대화상자 없이 전환된다.
        await page.locator('[data-tab="events"]').click();
        await expect(page.locator('[data-tab="events"]')).toHaveClass(/active/);
    });

    test('수정 화면: 기존 EN 값이 폼에 로드됨', async ({ page }) => {
        const withEn = [{
            id: 'n2', title: '한글', content: '본문', tag: '공지',
            titleEn: 'English T', contentEn: 'English B', tagEn: 'Notice',
            pinned: false, published: true, date: '2026-07-01', updatedAt: 'x',
        }];
        await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
        await page.route('**/api/admin/notices', (route) => route.fulfill({ json: { items: withEn } }));
        await page.route('**/api/admin/ships', (route) => route.fulfill({ json: { items: [] } }));
        await page.goto('/admin/');
        await expect(page.locator('#dashboard')).toBeVisible();

        await page.locator('[data-id="n2"]').click();
        await expect(page.locator('#notice-title-en')).toHaveValue('English T');
        await expect(page.locator('#notice-content-en')).toHaveValue('English B');
        await expect(page.locator('#notice-tag-en')).toHaveValue('Notice');
        await expect(page.locator('#cms-form [name="title"]')).toHaveValue('한글');
    });
});
