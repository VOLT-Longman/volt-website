const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

async function openLoadout(page) {
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('asgard');
    await page.locator('[data-loadout-ship="anvl_asgard"]').click();
    await expect(page.locator('#loadout-ship-title')).toBeVisible();
}

test('카드와 메뉴는 짧게 등장하며 섹션은 고정 모달 좌표를 바꾸지 않는다', async ({ page }) => {
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
    await expect.poll(() => page.evaluate(() => window.motionCalls.filter(c => c.frames[0]?.scale === '1.045').length)).toBeGreaterThan(0);
    await expect(page.locator('.loadout-slot.is-changed')).toBeVisible();
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
