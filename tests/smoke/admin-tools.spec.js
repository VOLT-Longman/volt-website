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

async function enforceThumbnailCsp(page) {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self'; connect-src 'self'" } });
  });
}

for (const conflict of [false, true]) {
test(`기존 이미지 최적화는 CSP 아래 원본을 보존하고 ${conflict ? '충돌한 썸네일을 정리한다' : '640px WebP 썸네일을 저장한다'}`, async ({ page }) => {
  await enforceThumbnailCsp(page);
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
  let uploadBody;
  await page.route('**/api/admin/upload', (route) => {
    if (route.request().method() === 'DELETE') { cleaned = route.request().postDataJSON().key; return route.fulfill({ json: { deleted: true } }); }
    uploadBody = route.request().postDataBuffer();
    return route.fulfill({ json: { key: 'gallery/thumb.webp', imageUrl: 'https://cdn.volt.ceo/gallery/thumb.webp' } });
  });
  await page.route('**/api/admin/gallery/g1', (route) => {
    savedBody = route.request().postDataJSON();
    return conflict
      ? route.fulfill({ status: 409, json: { error: '다른 관리자가 먼저 저장했습니다.' } })
      : route.fulfill({ json: { item: { id: 'g1' } } });
  });
  await page.locator('#workspace-tools').click();
  await page.locator('#maintenance-panel > summary').click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#gallery-optimize').click();
  await expect(page.locator('#maintenance-result')).toContainText(conflict ? '오류 1건' : '최적화 1건');
  expect(savedBody.imageUrl).toBe(src);
  expect(savedBody.thumbUrl).toContain('thumb.webp');
  expect(savedBody.expectedUpdatedAt).toBe('v1');
  expect(cleaned).toBe(conflict ? 'gallery/thumb.webp' : undefined);
  const start = uploadBody.indexOf(Buffer.from('RIFF'));
  const webp = uploadBody.subarray(start, start + uploadBody.readUInt32LE(start + 4) + 8);
  expect(webp.subarray(8, 12).toString()).toBe('WEBP');
  expect(webp.length).toBeLessThan(Buffer.from(base64, 'base64').length);
  const dimensions = await page.evaluate(async (bytes) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/webp' }));
    const result = [image.width, image.height];
    image.close();
    return result;
  }, Array.from(webp));
  expect(dimensions).toEqual([640, 360]);
});
}

test('디코딩 실패는 크기 유지로 오인하지 않고 원본과 저장 내용을 보존한다', async ({ page }) => {
  await enforceThumbnailCsp(page);
  await setup(page);
  const src = 'https://cdn.volt.ceo/gallery/broken.png';
  await page.route('**/api/admin/gallery{,?*}', (route) => route.fulfill({ json: { items: [{ id: 'g1', src, thumb: src, updatedAt: 'v1' }] } }));
  await page.route('**/api/admin/image-source?*', (route) => route.fulfill({ body: 'not an image', contentType: 'image/png' }));
  let writes = 0;
  await page.route('**/api/admin/upload', (route) => { writes++; return route.fulfill({ status: 500 }); });
  await page.route('**/api/admin/gallery/g1', (route) => { writes++; return route.fulfill({ status: 500 }); });
  await page.locator('#workspace-tools').click();
  await page.locator('#maintenance-panel > summary').click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#gallery-optimize').click();
  await expect(page.locator('#maintenance-result')).toContainText('크기 유지 0건, 오류 1건');
  expect(writes).toBe(0);
});
