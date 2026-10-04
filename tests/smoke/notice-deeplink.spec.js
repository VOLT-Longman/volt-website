const { test, expect } = require('@playwright/test');
const { mockApi } = require('./helpers');

const notice = { id: 'cms-only-new', title: '새 CMS 공지', content: '비동기로 읽어 온 본문', tag: '시스템', date: '2026-10-05', published: true };

test('a CMS-only notice opens after its delayed API response, and a retry preserves a dismissed modal', async ({ page }) => {
  await mockApi(page);
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  let reads = 0;
  await page.route('**/api/notices', async route => {
    reads++;
    if (reads === 1) await hold;
    await route.fulfill({ json: { items: [notice] } });
  });
  await page.route('**/api/timeline', route => route.fulfill({ status: 503, json: { error: 'temporary' } }));
  await page.goto('/?notice=cms-only-new#notices');
  await expect(page.locator('#notices')).toHaveClass(/active/);
  await expect(page.locator('.modal-title')).toHaveCount(0);
  release();
  await expect(page.locator('.modal-title')).toHaveText(notice.title);
  await expect(page.locator('.notice-modal-body')).toContainText(notice.content);
  await page.locator('.modal-close').click();
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(page.locator('#notices-list')).toContainText(notice.title);
  await expect(page.locator('.modal-title')).toHaveCount(0);
});

test('a notice query waits for navigation to the notices section', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/notices', route => route.fulfill({ json: { items: [notice] } }));
  await page.goto('/?notice=cms-only-new#home');
  await expect(page.locator('#loading-splash')).toBeHidden();
  await expect(page.locator('.modal-title')).toHaveCount(0);
  await page.locator('.nav-links a[href="#notices"]').click();
  await expect(page.locator('.modal-title')).toHaveText(notice.title);
});
