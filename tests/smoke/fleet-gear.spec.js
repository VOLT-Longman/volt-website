const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');
const { mockPrivateModelsWhenAbsent } = require('./gear-model-fixture');
const hash = '#gear?mod=behr_rifle_ballistic_01&optics=-&barrel=arma_barrel_supp_s2&underbarrel=-';
const protectedRequest = (url) => /\/data\/gear\/(?:attachments|models)\.json|\/assets\/models\/gear\/|gear-viewer\.js|\/assets\/vendor\/three-/.test(url);
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
test.describe.configure({ mode: 'default' });

for (const [name, options] of [['guest', { loggedIn: false }], ['community-only', { fleet: false }], ['admin-only', { fleet: false, roles: ['대표이사'] }]]) {
    test(`fleet gate ${name}: shared links and detail actions never request protected files`, async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        const requests = []; page.on('request', (request) => { if (protectedRequest(request.url())) requests.push(request.url()); });
        await mockApi(page, options);
        await gotoSection(page, hash);
        await expect(page.locator('.gear-mod-gate')).toContainText('함대원 전용 기능입니다');
        if (options.loggedIn === false) {
            const link = page.locator('.gear-mod-gate a');
            await expect(link).toContainText('Discord로 로그인');
            const returnTo = new URL(await link.getAttribute('href'), 'https://www.volt.ceo').searchParams.get('returnTo');
            expect(returnTo).toBe('/' + hash);
        } else {
            await expect(page.locator('.gear-mod-gate')).toContainText('함대원 역할이 필요합니다');
            await expect(page.locator('.gear-mod-gate a')).toHaveCount(0);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        await page.locator('[data-gear-view="weapon"]').click();
        await page.locator('#gear-search').fill('P4-AR');
        await page.locator('.gear-list [data-gear-pick]').first().click();
        await page.locator('[data-gear-mod]').click();
        await expect(page.locator('.gear-mod-gate')).toBeVisible();
        expect(requests).toEqual([]);
    });
}

test('fleet gate: 503 fails closed, English retry grants access and preserves shared attachments', async ({ page }) => {
    await mockApi(page);
    let status = 503;
    await page.route(/\/auth\/me(?:\?.*)?$/, (route) => status === 503 ? route.fulfill({ status, json: { error: 'temporary' } })
        : route.fulfill({ json: { logged_in: true, user: { sub: 'test-fleet', roles: [] }, features: { communityTools: true, gunModding: true, fleetConfigured: true } } }));
    const requests = []; page.on('request', (request) => { if (protectedRequest(request.url())) requests.push(request.url()); });
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoSection(page, hash);
    await expect(page.locator('.gear-mod-gate')).toContainText('잠시 후 다시');
    expect(requests).toEqual([]);
    await page.evaluate(() => window.VOLT_I18N.setLang('en'));
    await expect(page.locator('.gear-mod-gate')).toContainText('Please try again later');
    status = 200;
    await page.locator('[data-gear-mod-access-retry]').click();
    await expect(page.locator('#gear-mod-weapon')).toHaveValue('behr_rifle_ballistic_01');
    await expect(page.locator('[data-gear-mod-slot="barrel_attach"]')).toContainText('Suppressor');
    await expect(page.locator('.gear-mod-gate')).toHaveCount(0);
});

test('fleet access: 3D closes on role removal, logout and auth outage; late data cannot reopen it', async ({ page }) => {
    test.setTimeout(120000);
    await mockPrivateModelsWhenAbsent(page);
    await mockApi(page, { fleet: true });
    let mode = 'fleet';
    await page.route(/\/auth\/me(?:\?.*)?$/, (route) => mode === 'error' ? route.fulfill({ status: 503, json: { error: 'temporary' } })
        : route.fulfill({ json: { logged_in: mode !== 'guest', user: { sub: 'test-fleet', roles: ['커뮤니티 멤버'] }, features: { communityTools: true, gunModding: mode === 'fleet', fleetConfigured: true } } }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoSection(page, hash);
    await expect(page.locator('[data-gear-mod-3d="ready"]')).toBeVisible({ timeout: 60000 });
    mode = 'community';
    await page.clock.setFixedTime(new Date(Date.now() + 31000));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.gear-mod-gate')).toContainText('함대원 역할이 필요합니다');
    await expect(page.locator('#gear canvas')).toHaveCount(0);
    mode = 'fleet'; await page.locator('[data-gear-mod-access-retry]').click();
    await expect(page.locator('[data-gear-mod-3d="ready"]')).toBeVisible({ timeout: 60000 });
    mode = 'guest'; await page.clock.setFixedTime(new Date(Date.now() + 62000));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.gear-mod-gate a')).toContainText('Discord');
    await expect(page.locator('#gear canvas')).toHaveCount(0);
    mode = 'error'; await page.locator('[data-gear-mod-access-retry]').click();
    await expect(page.locator('.gear-mod-gate')).toContainText('잠시 후 다시');
    await expect(page.locator('#gear canvas')).toHaveCount(0);
});

test('fleet gate: landing page never loads modding resources even for a fleet member', async ({ page }) => {
    await mockApi(page, { fleet: true });
    const requests = []; page.on('request', (request) => { if (protectedRequest(request.url())) requests.push(request.url()); });
    await gotoSection(page, '#home');
    await expect(page.locator('#home')).toBeVisible();
    expect(requests).toEqual([]);
});
