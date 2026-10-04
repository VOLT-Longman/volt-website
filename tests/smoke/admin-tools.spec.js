const { test, expect } = require('@playwright/test');

async function setup(page) {
  await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/admin/notices{,?*}', (route) => {
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get('page') || 1);
    const query = url.searchParams.get('q');
    return route.fulfill({ json: { items: [{ id: `n${pageNumber}`, title: query || `공지 ${pageNumber}`, content: '본문', updatedAt: 'v1' }], pagination: { page: pageNumber, pages: 3, total: 43 } } });
  });
  await page.goto('/admin/');
  await expect(page.locator('#item-list [data-id="n1"]')).toBeVisible();
}

test('CMS 페이지 이동과 검색은 편집 중인 내용을 유지한다', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#list-prev')).toBeDisabled();
  await expect(page.locator('#list-page')).toHaveText('1 / 3 페이지 · 43건');
  await page.locator('#item-list [data-id="n1"]').click();
  await page.locator('#cms-form [name="title"]').fill('작성 중인 내용');
  await page.locator('#list-next').click();
  await expect(page.locator('#item-list [data-id="n2"]')).toBeVisible();
  await expect(page.locator('#list-page')).toHaveText('2 / 3 페이지 · 43건');
  await expect(page.locator('#cms-form [name="title"]')).toHaveValue('작성 중인 내용');
  await expect(page.locator('#form-title')).toHaveText('공지 수정');
  await page.locator('#cms-search').fill('검색어');
  await expect(page.locator('#item-list')).toContainText('검색어');
  await expect(page.locator('#cms-search')).toBeFocused();
  await expect(page.locator('#cms-form [name="title"]')).toHaveValue('작성 중인 내용');
});

test('복구 충돌은 작성 내용을 유지하고 서버 오류를 표시한다', async ({ page }) => {
  await setup(page);
  let restoreBody;
  await page.route('**/api/admin/history{,?*}', (route) => {
    if (route.request().method() === 'POST') {
      restoreBody = route.request().postDataJSON();
      return route.fulfill({ status: 409, json: { error: '다른 관리자가 먼저 저장했습니다.' } });
    }
    return route.fulfill({ json: { items: [{ id: 1, itemId: 'n1', action: 'update', createdAt: '2026-10-04T00:00:00Z', currentUpdatedAt: 'v1', before: { title: '<script>이전 제목</script>' }, after: { title: '최신 제목' } }], next: null } });
  });
  await page.locator('#item-list [data-id="n1"]').click();
  await page.locator('#cms-form [name="title"]').fill('내 수정');
  await page.locator('#history-panel > summary').click();
  await page.locator('#history-load').click();
  await page.locator('.history-entry > summary').click();
  await expect(page.locator('.history-preview').first()).toContainText('<script>이전 제목</script>');
  await expect(page.locator('.history-preview script')).toHaveCount(0);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '변경 전 내용으로 복구' }).click();
  await expect(page.locator('#form-message')).toContainText('다른 관리자가');
  await expect(page.locator('#cms-form [name="title"]')).toHaveValue('내 수정');
  expect(restoreBody.expectedUpdatedAt).toBe('v1');
});

test('이미지 삭제는 선택한 후보만 보내고 보호된 파일 결과를 알린다', async ({ page }) => {
  await setup(page);
  let selected;
  await page.route('**/api/admin/maintenance{,?*}', (route) => {
    if (route.request().method() === 'POST') {
      selected = route.request().postDataJSON().keys;
      return route.fulfill({ json: { results: [{ key: 'candidate-1', deleted: false }] } });
    }
    return route.fulfill({ json: { candidates: [{ key: 'candidate-1', size: 5000 }, { key: 'candidate-2', size: 5000 }], orphanRsvps: 2, storageAvailable: true } });
  });
  await page.locator('#workspace-tools').click();
  await page.locator('#maintenance-panel > summary').click();
  await page.locator('#maintenance-scan').click();
  await expect(page.locator('#upload-candidates input')).toHaveCount(2);
  await page.locator('#upload-candidates input').first().check();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#maintenance-delete').click();
  await expect(page.locator('#maintenance-result')).toContainText('파일 0개를 삭제');
  expect(selected).toEqual(['candidate-1']);
});

test('기존 이미지 최적화는 원본을 보존하고 충돌한 썸네일을 정리한다', async ({ page }) => {
  await setup(page);
  const src = 'https://cdn.volt.ceo/gallery/original.png';
  await page.route('**/api/admin/gallery{,?*}', (route) => route.fulfill({ json: { items: [{ id: 'g1', title: '기존 사진', src, thumb: src, updatedAt: 'v1', published: true }] } }));
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
  await page.route('**/api/admin/image-source?*', (route) => route.fulfill({ body: Buffer.from(base64, 'base64'), contentType: 'image/png' }));
  let savedBody;
  let cleaned;
  await page.route('**/api/admin/upload', (route) => {
    if (route.request().method() === 'DELETE') { cleaned = route.request().postDataJSON().key; return route.fulfill({ json: { deleted: true } }); }
    return route.fulfill({ json: { key: 'gallery/thumb.webp', imageUrl: 'https://cdn.volt.ceo/gallery/thumb.webp' } });
  });
  await page.route('**/api/admin/gallery/g1', (route) => {
    savedBody = route.request().postDataJSON();
    return route.fulfill({ status: 409, json: { error: '다른 관리자가 먼저 저장했습니다.' } });
  });
  await page.locator('#workspace-tools').click();
  await page.locator('#maintenance-panel > summary').click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#gallery-optimize').click();
  await expect(page.locator('#maintenance-result')).toContainText('오류 1건');
  expect(savedBody.imageUrl).toBe(src);
  expect(savedBody.thumbUrl).toContain('thumb.webp');
  expect(savedBody.expectedUpdatedAt).toBe('v1');
  expect(cleaned).toBe('gallery/thumb.webp');
});
