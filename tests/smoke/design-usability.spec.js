const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { mockApi, gotoSection } = require('./helpers');

async function admin(page) {
  await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/admin/notices{,?*}', (route) => route.fulfill({ json: { items: [] } }));
  await page.goto('/admin/');
  await expect(page.locator('#cms-form [name="title"]')).toBeVisible();
}

test('모바일 작성: 선택 입력은 접히고 저장은 스크롤 위치와 관계없이 접근 가능하다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await admin(page);
  await expect(page.locator('#notice-en-section')).not.toHaveAttribute('open', '');
  await expect(page.locator('#notice-preview-section')).not.toHaveAttribute('open', '');
  await page.locator('#cms-form [name="title"]').fill('작성 중');
  await expect(page.locator('#editor-status')).toHaveText('저장하지 않은 변경');
  await page.evaluate(() => window.scrollTo(0, 0));
  const save = page.locator('button[type="submit"][form="cms-form"]');
  const bounds = await save.boundingBox();
  expect(bounds.y).toBeGreaterThan(700);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#workspace-tools').click();
  await expect(page.locator('#content-workspace')).toBeHidden();
  await expect(save).toBeHidden();
  await page.locator('#workspace-content').click();
  await expect(page.locator('#cms-form [name="title"]')).toHaveValue('작성 중');
});

test('저장 상태와 충돌 오류를 구분하고 수정 입력을 보존한다', async ({ page }) => {
  let release;
  await admin(page);
  await page.route('**/api/admin/notices', async (route) => {
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ status: 409, json: { error: '다른 관리자가 먼저 저장했습니다.' } });
  });
  await page.locator('#cms-form [name="title"]').fill('내 제목');
  await page.locator('#cms-form [name="content"]').fill('내 내용');
  await page.locator('button[type="submit"][form="cms-form"]').click();
  await expect(page.locator('#editor-status')).toHaveText('처리 중');
  await expect(page.locator('#workspace-tools')).toBeDisabled();
  release();
  await expect(page.locator('#editor-status')).toHaveText('확인 필요');
  await expect(page.locator('#form-message')).toHaveAttribute('data-tone', 'error');
  await expect(page.locator('#cms-form [name="title"]')).toHaveValue('내 제목');
  await page.locator('#cms-form [name="title"]').fill('다시 수정');
  await expect(page.locator('#editor-status')).toHaveText('저장하지 않은 변경');
});

test('관리자 편집·정리 화면의 접근성: critical/serious 위반 없음', async ({ page }) => {
  await admin(page);
  for (const tools of [false, true]) {
    if (tools) await page.locator('#workspace-tools').click();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact))).toEqual([]);
  }
});

test('등록된 일정이 없을 때 한국어·영어 안내를 표시한다', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/events', (route) => route.fulfill({ json: { items: [] } }));
  await gotoSection(page, '#schedule');
  await expect(page.locator('#schedule-list .content-empty')).toContainText('등록된 일정이 없습니다.');
  await page.locator('.nav-lang [data-set-lang="en"]').click();
  await expect(page.locator('#schedule-list .content-empty')).toContainText('No events scheduled.');
});
