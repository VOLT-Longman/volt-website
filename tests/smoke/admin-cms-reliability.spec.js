const { test, expect } = require('@playwright/test');

const NOTICE = {
    id: 'n1', title: '기존 공지', content: '본문', tag: '공지',
    date: '2026-09-01', published: true, updatedAt: '2026-09-01T00:00:00.000Z',
};
const GALLERY = {
    id: 'g1', title: '기존 사진', description: '', category: '작전',
    date: '2026-09-01', src: 'https://images.example/old.png',
    thumb: 'https://images.example/old-thumb.webp', sortOrder: 3,
    published: true, updatedAt: '2026-09-01T00:00:00.000Z',
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/RZkAAAAASUVORK5CYII=', 'base64');

async function mockSession(page, notices = [NOTICE]) {
    await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
    await page.route('**/api/admin/notices{,?*}', (route) => route.fulfill({ json: { items: notices } }));
}

test('늦게 끝난 이전 탭 조회가 현재 목록을 덮지 않는다', async ({ page }) => {
    let releaseNotices;
    const holdNotices = new Promise((resolve) => { releaseNotices = resolve; });
    await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
    await page.route('**/api/admin/notices{,?*}', async (route) => {
        await holdNotices;
        await route.fulfill({ json: { items: [NOTICE] } });
    });
    await page.route('**/api/admin/events{,?*}', (route) => route.fulfill({ json: { items: [{ id: 'e1', title: '현재 일정', eventDate: '2026-09-30', published: true }] } }));
    await page.goto('/admin/');
    await page.locator('[data-tab="events"]').click();
    await expect(page.locator('#item-list [data-id="e1"]')).toBeVisible();
    releaseNotices();
    await expect(page.locator('#item-list [data-id="n1"]')).toHaveCount(0);
    await expect(page.locator('#form-title')).toHaveText('일정 작성');
});

test('관리 메뉴는 현재 선택 항목을 보조기기에 알린다', async ({ page }) => {
    await mockSession(page);
    await page.route('**/api/admin/events{,?*}', (route) => route.fulfill({ json: { items: [] } }));
    await page.goto('/admin/');
    await expect(page.locator('[data-tab="notices"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-tab="events"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-tab="events"]').click();
    await expect(page.locator('[data-tab="notices"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-tab="events"]')).toHaveAttribute('aria-pressed', 'true');
});

test('함선 오버라이드 조회 실패를 빈 설정으로 표시하지 않는다', async ({ page }) => {
    await mockSession(page);
    await page.route('**/api/admin/ships', (route) => route.fulfill({ status: 503, json: { error: '함선 설정 조회 실패' } }));
    await page.goto('/admin/');
    await page.locator('[data-tab="ships"]').click();
    await expect(page.locator('#ship-admin-results')).toContainText('함선 설정 조회 실패');
    await expect(page.locator('#ship-admin-results [data-id]')).toHaveCount(0);
});

test('일반 CMS 목록 조회 실패 시 이전 탭의 목록을 지운다', async ({ page }) => {
    await mockSession(page);
    await page.route('**/api/admin/gallery{,?*}', (route) => route.fulfill({ status: 503, json: { error: '갤러리 조회 실패' } }));
    await page.goto('/admin/');
    await expect(page.locator('#item-list [data-id="n1"]')).toBeVisible();
    await page.locator('[data-tab="gallery"]').click();
    await expect(page.locator('#item-list')).toContainText('갤러리 조회 실패');
    await expect(page.locator('#item-list [data-id="n1"]')).toHaveCount(0);
});

test('기존 분류값이 선택 목록 밖에 있어도 편집 시 보존한다', async ({ page }) => {
    await mockSession(page);
    await page.route('**/api/admin/events{,?*}', (route) => route.fulfill({
        json: { items: [{ id: 'e1', title: '기존 일정', type: '레거시 분류', status: '예정', published: true }] },
    }));
    await page.goto('/admin/');
    await page.locator('[data-tab="events"]').click();
    await page.locator('#item-list [data-id="e1"]').click();
    await expect(page.locator('#cms-form [name="type"]')).toHaveValue('레거시 분류');
    await expect(page.locator('#cms-form [name="type"] option[selected]')).toHaveCount(1);
});

test('삭제 요청에 수정 시점이 포함되고 충돌 시 편집 폼을 유지한다', async ({ page }) => {
    await mockSession(page);
    let deleteBody;
    await page.route('**/api/admin/notices/n1', (route) => {
        deleteBody = route.request().postDataJSON();
        return route.fulfill({ status: 409, json: { error: '다른 관리자가 먼저 수정했습니다.' } });
    });
    await page.goto('/admin/');
    await page.locator('#item-list [data-id="n1"]').click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#delete-button').click();
    await expect.poll(() => deleteBody?.expectedUpdatedAt).toBe(NOTICE.updatedAt);
    await expect(page.locator('#form-message')).toContainText('다른 관리자가');
    await expect(page.locator('#cms-form [name="title"]')).toHaveValue('기존 공지');
});

test('저장 요청 중에는 다른 항목·탭으로 이동해 편집 문맥을 바꿀 수 없다', async ({ page }) => {
    await mockSession(page);
    let releaseSave;
    const holdSave = new Promise((resolve) => { releaseSave = resolve; });
    await page.route('**/api/admin/notices/n1', async (route) => {
        await holdSave;
        await route.fulfill({ json: { item: NOTICE } });
    });
    await page.goto('/admin/');
    await page.locator('#item-list [data-id="n1"]').click();
    await page.locator('#cms-form [name="title"]').fill('수정 중');
    await page.locator('button[type="submit"][form="cms-form"]').click();
    await expect(page.locator('[data-tab="events"]')).toBeDisabled();
    await expect(page.locator('#cms-form [name="title"]')).toBeDisabled();
    releaseSave();
    await expect(page.locator('[data-tab="events"]')).toBeEnabled();
    await expect(page.locator('[data-tab="notices"]')).toHaveClass(/active/);
});

test('임원 사진을 올린 뒤 저장을 취소하면 임시 업로드 파일을 정리한다', async ({ page }) => {
    await mockSession(page);
    let releaseList;
    const listGate = new Promise((resolve) => { releaseList = resolve; });
    await page.route('**/api/admin/leadership{,?*}', async (route) => {
        await listGate;
        await route.fulfill({ json: { items: [{ id: 'other', name: '다른 임원', updatedAt: '2026-09-01T00:00:00.000Z' }] } });
    });
    const deletedKeys = [];
    await page.route('**/api/admin/upload', (route) => {
        if (route.request().method() === 'DELETE') {
            deletedKeys.push(route.request().postDataJSON().key);
            return route.fulfill({ json: { ok: true, deleted: true } });
        }
        return route.fulfill({ json: { key: 'gallery/temporary.png', imageUrl: 'https://images.example/temporary.png' } });
    });
    await page.goto('/admin/');
    await page.locator('[data-tab="leadership"]').click();
    await page.locator('[data-image-upload="avatarUrl"]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('[data-image-url="avatarUrl"]')).toHaveValue('https://images.example/temporary.png');
    // 늦은 목록 응답이 파일 선택 중인 폼을 다시 그리면 업로드 결과가 사라진다.
    releaseList();
    await expect(page.locator('#item-list [data-id="other"]')).toBeVisible();
    await expect(page.locator('[data-image-url="avatarUrl"]')).toHaveValue('https://images.example/temporary.png');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#cancel-button').click();
    await expect.poll(() => deletedKeys).toContain('gallery/temporary.png');
});

test('저장한 임원 사진은 임시 파일 정리 대상에서 제외한다', async ({ page }) => {
    await mockSession(page);
    let item = null;
    await page.route('**/api/admin/leadership{,?*}', (route) => {
        if (route.request().method() === 'POST') {
            const body = route.request().postDataJSON();
            item = { id: 'leader-1', ...body, updatedAt: '2026-09-02T00:00:00.000Z' };
            return route.fulfill({ json: { item } });
        }
        return route.fulfill({ json: { items: item ? [item] : [] } });
    });
    let cleanupCount = 0;
    await page.route('**/api/admin/upload', (route) => {
        if (route.request().method() === 'DELETE') {
            cleanupCount += 1;
            return route.fulfill({ json: { ok: true, deleted: false } });
        }
        return route.fulfill({ json: { key: 'gallery/kept.png', imageUrl: 'https://images.example/kept.png' } });
    });
    await page.goto('/admin/');
    await page.locator('[data-tab="leadership"]').click();
    await page.locator('#cms-form [name="name"]').fill('관리자');
    await page.locator('[data-image-upload="avatarUrl"]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('[data-image-url="avatarUrl"]')).toHaveValue('https://images.example/kept.png');
    await page.locator('button[type="submit"][form="cms-form"]').click();
    await expect(page.locator('#form-message')).toContainText('저장했습니다');
    expect(cleanupCount).toBe(0);
});

test('갤러리 이미지 수정 실패 후 업로드 파일을 유지하고 기존 항목으로 재시도한다', async ({ page }) => {
    await mockSession(page);
    let gallery = GALLERY;
    let putAttempts = 0;
    let galleryPosts = 0;
    const deletedKeys = [];
    await page.route('**/api/admin/gallery{,?*}', (route) => {
        if (route.request().method() === 'POST') galleryPosts += 1;
        return route.fulfill({ json: { items: [gallery] } });
    });
    await page.route('**/api/admin/gallery/g1', (route) => {
        putAttempts += 1;
        if (putAttempts === 1) return route.fulfill({ status: 500, json: { error: '저장 실패' } });
        const body = route.request().postDataJSON();
        expect(body.expectedUpdatedAt).toBe(GALLERY.updatedAt);
        gallery = { ...gallery, src: body.imageUrl, thumb: body.thumbUrl, updatedAt: '2026-09-02T00:00:00.000Z' };
        return route.fulfill({ json: { item: gallery } });
    });
    let uploadCount = 0;
    await page.route('**/api/admin/upload', (route) => {
        if (route.request().method() === 'DELETE') {
            deletedKeys.push(route.request().postDataJSON().key);
            return route.fulfill({ json: { ok: true } });
        }
        uploadCount += 1;
        return route.fulfill({ json: { key: `gallery/upload-${uploadCount}.png`, imageUrl: `https://images.example/upload-${uploadCount}.png` } });
    });
    await page.goto('/admin/');
    await page.locator('[data-tab="gallery"]').click();
    await page.locator('#item-list [data-id="g1"]').click();
    await page.locator('#upload-file').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: PNG });
    await page.locator('button[type="submit"][form="cms-form"]').click();
    await expect(page.locator('#form-message')).toContainText('실패 1건');
    await expect(page.locator('#upload-file-name')).toContainText('new.png');
    expect(deletedKeys).toContain('gallery/upload-1.png');
    await page.locator('button[type="submit"][form="cms-form"]').click();
    await expect(page.locator('#form-message')).toContainText('성공 1건, 실패 0건');
    expect(putAttempts).toBe(2);
    expect(galleryPosts).toBe(0);
    await expect(page.locator('#cms-form [name="title"]')).toHaveValue('기존 사진');
});

test('갤러리 다중 업로드에서 실패한 파일만 같은 번호로 재시도한다', async ({ page }) => {
    await mockSession(page);
    const items = [];
    const titles = [];
    let posts = 0;
    let uploads = 0;
    await page.route('**/api/admin/gallery{,?*}', (route) => {
        if (route.request().method() !== 'POST') return route.fulfill({ json: { items } });
        posts += 1;
        const body = route.request().postDataJSON();
        titles.push(body.title);
        if (posts === 2) return route.fulfill({ status: 500, json: { error: '일시적인 저장 실패' } });
        items.push({ id: `g${posts}`, ...body, src: body.imageUrl, thumb: body.thumbUrl, updatedAt: '2026-09-02T00:00:00.000Z' });
        return route.fulfill({ json: { item: items.at(-1) } });
    });
    await page.route('**/api/admin/upload', (route) => {
        if (route.request().method() === 'DELETE') return route.fulfill({ json: { ok: true } });
        uploads += 1;
        return route.fulfill({ json: { key: `gallery/${uploads}.png`, imageUrl: `https://images.example/${uploads}.png` } });
    });
    await page.goto('/admin/');
    await page.locator('[data-tab="gallery"]').click();
    await page.locator('#cms-form [name="title"]').fill('묶음');
    await page.locator('#upload-file').setInputFiles([
        { name: 'one.png', mimeType: 'image/png', buffer: PNG },
        { name: 'two.png', mimeType: 'image/png', buffer: PNG },
    ]);
    await page.locator('button[type="submit"][form="cms-form"]').click();
    await expect(page.locator('#form-message')).toContainText('성공 1건, 실패 1건');
    await expect(page.locator('#upload-file-name')).toContainText('two.png');
    await expect(page.locator('#upload-file-name')).not.toContainText('one.png');
    await page.locator('button[type="submit"][form="cms-form"]').click();
    await expect(page.locator('#form-message')).toContainText('성공 1건, 실패 0건');
    expect(titles).toEqual(['묶음 1', '묶음 2', '묶음 2']);
    expect(items).toHaveLength(2);
});

test('큰 갤러리 사진은 별도 WebP 썸네일 주소로 저장한다', async ({ page }) => {
    await mockSession(page);
    let savedBody;
    let uploads = 0;
    await page.route('**/api/admin/gallery{,?*}', (route) => {
        if (route.request().method() === 'POST') {
            savedBody = route.request().postDataJSON();
            return route.fulfill({ json: { item: { id: 'g2', ...savedBody } } });
        }
        return route.fulfill({ json: { items: [] } });
    });
    await page.route('**/api/admin/upload', (route) => {
        uploads += 1;
        const suffix = uploads === 1 ? 'original.png' : 'thumb.webp';
        return route.fulfill({ json: { key: `gallery/${suffix}`, imageUrl: `https://images.example/${suffix}` } });
    });
    await page.goto('/admin/');
    await page.locator('[data-tab="gallery"]').click();
    const base64 = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 1280, 720);
        gradient.addColorStop(0, '#13214b');
        gradient.addColorStop(1, '#b85a69');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 1280, 720);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#cms-form [name="title"]').fill('큰 사진');
    await page.locator('#upload-file').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
    await page.locator('button[type="submit"][form="cms-form"]').click();
    await expect.poll(() => savedBody?.thumbUrl).toBe('https://images.example/thumb.webp');
    expect(savedBody.imageUrl).toBe('https://images.example/original.png');
    expect(uploads).toBe(2);
});

test('새 갤러리 날짜는 한국 시간의 날짜를 사용한다', async ({ page }) => {
    await page.addInitScript(() => { Date.now = () => Date.parse('2026-09-28T16:00:00.000Z'); });
    await mockSession(page);
    await page.route('**/api/admin/gallery{,?*}', (route) => route.fulfill({ json: { items: [] } }));
    await page.goto('/admin/');
    await page.locator('[data-tab="gallery"]').click();
    await expect(page.locator('#cms-form [name="date"]')).toHaveValue('2026-09-29');
});
