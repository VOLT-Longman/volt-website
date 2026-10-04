const { test, expect } = require('@playwright/test');

test('the isolated preview environment is clearly labeled even before login', async ({ page }) => {
  await page.route('**/api/admin/session', route => route.fulfill({ json: { authenticated: false, discordLoginEnabled: false, environment: 'preview' } }));
  await page.goto('/admin/');
  await expect(page.locator('#preview-environment')).toBeVisible();
  await expect(page.locator('#preview-environment')).toContainText('운영 홈페이지에 반영되지 않습니다');
  await expect(page.locator('#discord-login-button')).toBeHidden();
});

test('CMS Discord login displays the personal account and logs out only the CMS session', async ({ page }) => {
  let authenticated = false;
  await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated, discordLoginEnabled: true, identity: authenticated ? { method: 'discord', displayName: '관리자 A', roles: ['대표이사'] } : null } }));
  await page.route('**/api/admin/discord-login', (route) => { authenticated = true; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/admin/logout', (route) => { authenticated = false; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/admin/notices{,?*}', (route) => route.fulfill({ json: { items: [], pagination: { page: 1, pages: 1, total: 0 } } }));
  await page.goto('/admin/');
  await page.locator('#discord-login-button').click();
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#admin-identity')).toHaveText('관리자 A · 대표이사 · Discord 로그인');
  await page.locator('#logout-button').click();
  await expect(page.locator('#login-panel')).toBeVisible();
  await expect(page.locator('#dashboard')).toBeHidden();
});

test('CMS OAuth return signs in once and removes the callback marker from the URL', async ({ page }) => {
  let logins = 0;
  await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: logins > 0, discordLoginEnabled: true, identity: { method: 'discord', displayName: '관리자 B', roles: ['임원진'] } } }));
  await page.route('**/api/admin/discord-login', (route) => { logins++; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/admin/notices{,?*}', (route) => route.fulfill({ json: { items: [] } }));
  await page.goto('/admin/?discord=1');
  await expect(page.locator('#admin-identity')).toContainText('관리자 B');
  await expect(page).toHaveURL(/\/admin\/$/);
  await page.reload();
  await expect(page.locator('#dashboard')).toBeVisible();
  expect(logins).toBe(1);
});

test('a rejected Discord role stays on the login screen and explains the denial', async ({ page }) => {
  await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: false, discordLoginEnabled: true } }));
  await page.route('**/api/admin/discord-login', (route) => route.fulfill({ status: 403, json: { error: '대표이사 또는 임원진 역할의 관리자만 접근할 수 있습니다.' } }));
  await page.goto('/admin/');
  await page.locator('#discord-login-button').click();
  await expect(page.locator('#login-message')).toContainText('대표이사 또는 임원진');
  await expect(page.locator('#dashboard')).toBeHidden();
  await expect(page.locator('#discord-login-button')).toBeEnabled();
});
