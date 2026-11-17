const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { mockApi, gotoSection } = require('./helpers');

async function loadShip(page, cls = 'anvl_asgard') {
    await mockApi(page);
    await gotoSection(page, '#loadout');
    await page.locator(`[data-loadout-ship="${cls}"]`).click();
    await expect(page.locator('#loadout-ship-title')).toBeVisible();
}

test('감사: 엄격한 CSP에서도 피해·전력 막대와 하위 장착 들여쓰기가 그려진다', async ({ page }) => {
    const policy = fs.readFileSync(path.join(__dirname, '../../_headers'), 'utf8').split('\n').find(line => line.trim().startsWith('Content-Security-Policy:')).split('Content-Security-Policy:')[1].replace('; upgrade-insecure-requests', '').trim();
    await page.route('**/*', async route => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
    });
    const errors = [];
    page.on('console', message => { if (/content security policy|refused to apply/i.test(message.text())) errors.push(message.text()); });
    await loadShip(page);
    const widths = page.locator('.loadout-dmgbar i, .loadout-meter i');
    await expect.poll(() => widths.evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().width > 0))).toBe(true);
    const child = page.locator('.loadout-slot[data-loadout-level="1"]').first();
    await expect(child).toHaveCSS('--lo-level', '1');
    await child.locator('[data-loadout-open]').first().click();
    await expect(page.locator('.loadout-picker')).toBeVisible();
    await expect.poll(() => widths.evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().width > 0))).toBe(true);
    expect(errors).toEqual([]);
});

test('감사: 언어를 여러 번 바꿔도 FAQ가 열린다', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#faq');
    for (const lang of ['en', 'ko', 'en']) {
        await page.locator(`.nav-lang [data-set-lang="${lang}"]`).click();
        const question = page.locator('.faq-question').first();
        await question.click();
        await expect(question).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('.faq-answer').first()).toBeVisible();
        await question.click();
        await expect(question).toHaveAttribute('aria-expanded', 'false');
    }
});

test('감사: 닫힌 모바일 메뉴는 초점에서 제외되고 열고 닫을 때 복원된다', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSection(page, '#about');
    const menu = page.locator('#mobileMenu');
    await expect(menu).toHaveAttribute('inert', '');
    await expect(menu).toHaveAttribute('aria-hidden', 'true');
    await page.locator('#hamburger').click();
    await expect(menu).not.toHaveAttribute('inert');
    await expect(menu).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('inert', '');
    await expect(page.locator('#hamburger')).toBeFocused();
});

test('감사: 건너뛰기는 현재 화면을 유지하고 로그인 프로필은 마이페이지로 간다', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#ships');
    await page.locator('.skip-nav').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#ships$/);
    await expect(page.locator('#main-content')).toBeFocused();
    await page.locator('#nav-more-toggle').click();
    await page.locator('#volt-auth-desktop a[href="#mypage"]').click();
    await expect(page.locator('#mypage')).toHaveClass(/active/);
    await expect(page.locator('#mypage-content')).toContainText('격납고');
});

test('감사: 한글 조합 이벤트 도중 검색 입력 노드를 교체하지 않는다', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#loadout');
    const input = page.locator('#loadout-ship-search');
    await input.evaluate(node => { node.dataset.compositionProbe = 'original'; node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
    await input.fill('아스가르드');
    await expect(input).toHaveAttribute('data-composition-probe', 'original');
    await input.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '아스가르드' })));
    await expect(input).toHaveValue('아스가르드');
    await expect(page.locator('[data-loadout-ship="anvl_asgard"]')).toBeVisible();
    await expect(page.locator('#loadout-ship-results [data-loadout-ship]')).toHaveCount(1);
});

test('감사: 화물 입력·함선 적용·초기화가 UEX 수익과 수익표 버튼에 즉시 반영된다', async ({ page }) => {
    await mockApi(page);
    await page.route('**/api/uex/commodities', route => route.fulfill({ json: { status: 'ok', data: [{ id: 1, name: 'Gold', is_visible: 1, is_available_live: 1 }] } }));
    await page.route('**/api/uex/commodities/1/prices*', route => route.fulfill({ json: { status: 'ok', data: [
        { id_terminal: 1, terminal_name: 'A', price_buy: 100, price_sell: 0 },
        { id_terminal: 2, terminal_name: 'B', price_buy: 0, price_sell: 180 },
    ] } }));
    await gotoSection(page, '#trade-planner');
    await page.locator('#logistics-cargo').fill('100');
    await page.locator('#uex-commodity-search').fill('Gold');
    await page.locator('[data-commodity-id="1"]').click();
    await page.locator('#uex-refresh').click();
    const profit = page.locator('.uex-summary-card').filter({ has: page.getByText('예상 수익', { exact: true }) }).locator('strong');
    await expect(profit).toContainText('8,000');
    await page.locator('#logistics-cargo').fill('696');
    await expect(profit).toContainText('55,680');
    await page.locator('#planner-reset').click();
    await expect(profit).toHaveText('0 aUEC');
    await page.locator('#logistics-ship-search').fill('C2 Hercules');
    await page.locator('#logistics-ship-results [role="option"]').first().click();
    await expect(profit).toContainText('55,680');
});

test('감사: 설정 조회 실패 중 변경을 보관하고 다시 접속하면 서버에 저장한다', async ({ page }) => {
    await mockApi(page);
    let unavailable = true; let saved;
    await page.route('**/api/me/preferences', route => {
        if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); return route.fulfill({ json: { preferences: saved } }); }
        return unavailable ? route.fulfill({ status: 503, json: { error: 'offline' } }) : route.fulfill({ json: { preferences: { favorites: [], planner: { cargo: '50' } } } });
    });
    await gotoSection(page, '#trade-planner');
    await page.locator('#logistics-cargo').fill('696');
    // A fresh visit must not replace the local unsaved edit with the older server value.
    unavailable = false;
    await page.reload();
    await expect(page.locator('#logistics-cargo')).toHaveValue('696');
    await expect.poll(() => saved?.planner?.cargo).toBe('696');
});

for (const width of [1280, 390]) {
    test(`감사: 함선 변경 목록이 세로로 압축되지 않고 스크롤로 선택된다 ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 844 });
        await loadShip(page);
        await page.locator('[data-loadout-browse]').click();
        const list = page.locator('#loadout-ship-results');
        await expect(list.locator('[data-loadout-ship]')).toHaveCount(217);
        const cards = list.locator('.loadout-shipcard');
        const metrics = await cards.evaluateAll(nodes => nodes.map(node => {
            const card = node.getBoundingClientRect();
            const visual = node.querySelector('img, .loadout-shipcard-blank').getBoundingClientRect();
            const label = node.querySelector('.loadout-shipcard-text').getBoundingClientRect();
            return { cardHeight: card.height, visualHeight: visual.height, visualWidth: visual.width, clipped: label.bottom > card.bottom + 1 };
        }));
        await list.screenshot({ path: testInfo.outputPath('ship-picker.png') });
        expect(Math.min(...metrics.map(row => row.cardHeight))).toBeGreaterThan(130);
        expect(metrics.filter(row => row.clipped)).toHaveLength(0);
        for (const row of metrics) expect(row.visualHeight / row.visualWidth).toBeCloseTo(9 / 16, 1);
        const scroll = await list.evaluate(node => ({ content: node.scrollHeight, visible: node.clientHeight }));
        expect(scroll.content).toBeGreaterThan(scroll.visible * 2);
        await list.locator('[data-loadout-ship="anvl_arrow"]').click();
        await expect(page.locator('#loadout-ship-title')).toContainText('애로우');
    });
}

test('감사: 함선 크기순 정렬이 S1–S6 수치를 따른다', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#ships');
    await page.locator('#ship-sort').selectOption('size-asc');
    const sizes = await page.locator('#ships-grid [data-ship-id]').evaluateAll(cards => cards.map(card => window.VOLT_SHIPDB_CANONICAL.getShip(card.dataset.shipId)?.size).filter(size => /^S\d+$/.test(size)).map(size => Number(size.slice(1))));
    expect(sizes.length).toBeGreaterThan(200);
    expect(new Set(sizes).size).toBeGreaterThan(3);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
});

test('감사: 설정 조회를 자동 재시도한 뒤 그동안 편집한 화물량을 저장한다', async ({ page }) => {
    await mockApi(page);
    let unavailable = true; let saved;
    await page.route('**/api/me/preferences', route => {
        if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); return route.fulfill({ json: {} }); }
        return unavailable ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { preferences: { favorites: [], planner: { cargo: '50' } } } });
    });
    await gotoSection(page, '#trade-planner');
    await page.locator('#logistics-cargo').fill('120');
    unavailable = false;
    await expect.poll(() => saved?.planner?.cargo, { timeout: 10000 }).toBe('120');
    await expect(page.locator('#logistics-cargo')).toHaveValue('120');
});
