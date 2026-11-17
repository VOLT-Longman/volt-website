const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

async function openLoadout(page) {
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('asgard');
    await page.locator('[data-loadout-ship="anvl_asgard"]').click();
    await expect(page.locator('#loadout-ship-title')).toBeVisible();
}

test('카드와 메뉴가 등장해도 섹션은 고정 모달 좌표를 바꾸지 않는다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockApi(page); await gotoSection(page, '#about');
    await expect(page.locator('#about')).toHaveCSS('transform', 'none');
    await expect(page.locator('#about .section-header')).toHaveCSS('animation-name', 'volt-heading-in');
    const cards = page.locator('#about .reveal').filter({ visible: true });
    await cards.first().scrollIntoViewIfNeeded();
    await expect(cards.first()).toHaveClass(/revealed/);
    await expect(cards.first()).toHaveCSS('animation-name', 'volt-card-in');
    await page.locator('#nav-ships-toggle').click();
    await expect(page.locator('#nav-ships-menu')).toHaveCSS('animation-name', 'volt-menu-in');
    await page.locator('#search-toggle').click();
    await expect(page.locator('.search-panel')).toHaveCSS('animation-name', 'volt-dialog-in');
    await page.locator('#global-search-input').fill('Asgard');
    await expect(page.locator('.search-result').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-overlay')).not.toHaveClass(/active/);
    await expect(page.locator('#search-toggle')).toBeFocused();
    expect(errors).toEqual([]);
});

test('모션 스크립트가 없어도 콘텐츠와 메뉴는 표시된다', async ({ page }) => {
    await page.route('**/js/motion.js*', route => route.abort());
    await mockApi(page); await gotoSection(page, '#about');
    await page.locator('#about .reveal').first().scrollIntoViewIfNeeded();
    await expect(page.locator('#about .reveal').first()).toHaveCSS('opacity', '1');
    await page.locator('#nav-ships-toggle').click();
    await expect(page.locator('#nav-ships-menu')).toBeVisible();
});

test('동작 줄이기는 초기 및 실행 중 변경 모두에 적용된다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLoadout(page);
    await page.locator('.loadout-slot [data-loadout-open]').first().click();
    await expect(page.locator('.loadout-picker')).toBeVisible();
    expect(await page.locator('.loadout-picker').evaluate(el => el.getAnimations().length)).toBe(0);
    await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('.loadout-slot [data-loadout-open]').first().click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => page.locator('.loadout-picker').evaluate(el => el.getAnimations().length)).toBe(0);
    await expect(page.locator('.loadout-picker')).toHaveCSS('opacity', '1');
});

test('교체창은 열 때만 움직이고 검색으로 DOM이 바뀔 때 재생되지 않는다', async ({ page }) => {
    await openLoadout(page);
    // Instrument native animation calls, exercising real UI rather than invoking the motion helper.
    await page.evaluate(() => {
        const original = Element.prototype.animate;
        window.motionCalls = [];
        Element.prototype.animate = function (...args) {
            window.motionCalls.push({ className: this.className, text: this.textContent, frames: args[0] });
            return original.apply(this, args);
        };
    });
    await page.locator('.loadout-slot [data-loadout-open]').first().click();
    const count = () => page.evaluate(() => window.motionCalls.filter(c => /loadout-picker/.test(c.className)).length);
    await expect.poll(count).toBe(1);
    await page.locator('#loadout-picker-search').fill('Mantis');
    await expect(page.locator('.loadout-optrows tr')).toHaveCount(1);
    expect(await count()).toBe(1);
    await page.locator('.loadout-optrows [data-loadout-pick]').click();
    await expect.poll(() => page.evaluate(() => window.motionCalls.filter(c => /loadout-kpi/.test(c.className)).length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.motionCalls.some(c => /loadout-slot is-changed/.test(c.className)))).toBe(true);
    await expect(page.locator('.loadout-slot.is-changed')).toBeVisible();
    const exactValues = await page.locator('.loadout-kpi strong').allTextContents();
    await expect.poll(() => page.locator('.loadout-kpis').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await page.locator('.loadout-kpi strong').allTextContents()).toEqual(exactValues);
});

test('히어로의 큰 진입은 모바일에서도 넘치지 않고 끝나며 동작 줄이기로 즉시 멈춘다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page); await gotoSection(page, '');
    await expect(page.locator('#home')).toHaveClass(/hero-enter/);
    await expect(page.locator('#home')).toHaveClass(/cinematic-ready/);
    await expect(page.locator('.hero-cine-media')).toHaveCSS('animation-name', 'none');
    expect(await page.evaluate(() => window.gsap.getTweensOf('.hero-title-line', true).length)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.hero-cine-media')).toHaveCSS('transform', 'none');
    await expect(page.locator('#home h1')).toHaveCSS('opacity', '1');
    await expect(page.locator('#home h1')).toHaveCSS('filter', 'none');
    await expect(page.locator('.hero-title-line').first()).toHaveCSS('transform', 'none');
    expect(await page.evaluate(() => window.ScrollTrigger.getAll().length)).toBe(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(() => page.locator('.hero-cine-media').evaluate(el => el.getAnimations().length)).toBe(0);
    await expect(page.locator('.hero-cine-media')).toHaveCSS('transform', 'none');
    await expect(page.locator('#home h1')).toHaveCSS('translate', 'none');
    expect(await page.evaluate(() => window.gsap.getTweensOf('.hero-title-line', true).length)).toBe(0);
});

test('펼쳐 둔 요약은 편집 화면을 다시 그릴 때 등장 효과를 반복하지 않는다', async ({ page }) => {
    await openLoadout(page);
    await page.evaluate(() => {
        const original = Element.prototype.animate;
        window.foldAnimations = 0;
        Element.prototype.animate = function (...args) {
            if (this.classList.contains('loadout-fold-body')) window.foldAnimations += 1;
            return original.apply(this, args);
        };
    });
    await page.locator('[data-loadout-fold="flight"] > summary').click();
    await expect.poll(() => page.evaluate(() => window.foldAnimations)).toBe(1);
    await page.locator('#loadout-compact').check();
    await expect(page.locator('[data-loadout-fold="flight"]')).toHaveAttribute('open', '');
    // Wait for the native toggle event generated by reinserting an open details element.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => window.foldAnimations)).toBe(1);
});

test('모바일 메뉴와 상세창은 터치 환경에서 가로 넘침 없이 동작한다', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    await mockApi(page); await gotoSection(page, '');
    await page.locator('#hamburger').click();
    await expect(page.locator('#mobileMenu')).toHaveClass(/active/);
    await page.locator('#mobileMenu a[href="#loadout"]').click();
    await page.locator('#loadout-ship-search').fill('asgard');
    await page.locator('[data-loadout-ship="anvl_asgard"]').click();
    await page.locator('.loadout-slot [data-loadout-detail]').first().click();
    await expect(page.locator('.loadout-detail')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/motion-mobile.png', animations: 'disabled' });
    await context.close();
});


test('스크롤 모션은 사진만 움직이며 화면 왕복 후 감시자가 쌓이지 않는다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockApi(page); await gotoSection(page, '');
    await expect(page.locator('#home')).toHaveClass(/cinematic-ready/);
    const triggerCount = () => page.evaluate(() => window.ScrollTrigger.getAll().length);
    const initialCount = await triggerCount();
    expect(initialCount).toBeGreaterThan(0);
    const before = await page.locator('.hero-cine-image').evaluate(el => getComputedStyle(el).transform);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => page.locator('.hero-cine-image').evaluate(el => getComputedStyle(el).transform)).not.toBe(before);
    await expect(page.locator('.hero-layout')).toHaveCSS('opacity', '1');
    await expect(page.locator('.hero-layout')).toHaveCSS('transform', 'none');
    for (let visit = 0; visit < 3; visit += 1) {
        await page.locator('.nav-links a[href="#about"]').click();
        await expect.poll(triggerCount).toBe(0);
        await expect(page.locator('.hero-cine-image')).toHaveCSS('transform', 'none');
        await page.locator('.nav-logo').click();
        await expect(page.locator('#home')).toBeVisible();
        await expect.poll(triggerCount).toBe(initialCount);
    }
    await page.locator('[data-set-lang="en"]').first().click();
    await expect(page.locator('#home .subtitle')).toContainText('Voyagers');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});

for (const asset of ['assets/vendor/gsap/gsap.min.js', 'js/cinematic-motion.js']) {
    test(`시네마틱 모듈 실패 시에도 원래 화면과 탐색이 유지된다: ${asset}`, async ({ page }) => {
        await page.route(`**/${asset}*`, route => route.abort());
        await mockApi(page); await gotoSection(page, '');
        await expect(page.locator('#home')).not.toHaveClass(/cinematic-ready/);
        await expect(page.locator('#home h1')).toBeVisible();
        await expect(page.locator('.hero-cine-media')).toHaveCSS('animation-name', 'volt-hero-camera');
        await page.locator('.hero-action[href="#join"]').click();
        await expect(page.locator('#join')).toBeVisible();
    });
}

test('시네마틱 모션은 실제 보안 정책을 유지해도 재생된다', async ({ page }) => {
    const fs = require('node:fs');
    const path = require('node:path');
    const policy = fs.readFileSync(path.join(__dirname, '../../_headers'), 'utf8').split('\n')
        .find(line => line.trim().startsWith('Content-Security-Policy:')).split('Content-Security-Policy:')[1]
        .replace('; upgrade-insecure-requests', '').trim();
    const errors = trackConsoleErrors(page);
    await mockApi(page);
    await page.route('http://127.0.0.1:8787/', async route => {
        const response = await route.fetch();
        return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
    });
    await gotoSection(page, '');
    await expect(page.locator('#home')).toHaveClass(/cinematic-ready/);
    await expect.poll(() => page.locator('.hero-title-line').last().evaluate(el => el.style.opacity)).toBe('');
    await expect(page.locator('.hero-title-line').last()).toHaveCSS('opacity', '1');
    await page.locator('.landing-cta').scrollIntoViewIfNeeded();
    await expect(page.locator('.landing-cta-photo')).not.toHaveCSS('transform', 'none');
    expect(errors).toEqual([]);
});

test('함선 바꾸기는 카드가 차례로 나타나고 검색 시 다시 흔들리지 않는다', async ({ page }) => {
    await openLoadout(page);
    await page.evaluate(() => {
        const original = Element.prototype.animate;
        window.shipCardAnimations = 0;
        Element.prototype.animate = function (...args) {
            if (this.classList.contains('loadout-shipcard')) window.shipCardAnimations += 1;
            return original.apply(this, args);
        };
    });
    await page.locator('[data-loadout-browse]').click();
    await expect.poll(() => page.evaluate(() => window.shipCardAnimations)).toBe(8);
    await page.locator('#loadout-ship-search').fill('asgard');
    await expect(page.locator('.loadout-shipcard')).toHaveCount(1);
    expect(await page.evaluate(() => window.shipCardAnimations)).toBe(8);
    expect((await page.locator('.loadout-shipcard').boundingBox()).height).toBeGreaterThan(70);
});
