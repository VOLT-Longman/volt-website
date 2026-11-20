const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { mockMapTextures, mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// 성계지도(#starmap): 함대원 전용 3D 지도, 목록·검색, 정보 칸, 다른 화면에서 들어오는 주소(focus·route·mark·area).
// 기대값(거리, 이름, 연결)은 data/starmap/*.json 에서 직접 계산한다.
// 계약: docs/starmap.md, docs/starmap-data.md, docs/helper-tools.md

const root = path.join(__dirname, '../..');
const load = (name) => JSON.parse(fs.readFileSync(path.join(root, 'data/starmap', `${name}.json`), 'utf8'));
const index = load('index');
const stanton = load('stanton');
const pyro = load('pyro');
const cargo = JSON.parse(fs.readFileSync(path.join(root, 'data/trade/cargo.json'), 'utf8'));
const byId = (system) => new Map(system.objects.map((object) => [object.id, object]));
const S = byId(stanton);
const P = byId(pyro);
const metres = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const gm = (value) => `${(value / 1e9).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} Gm`;

const STRICT_CSP = [
    "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self' https://forms.gle",
    "img-src 'self' data: https:", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com", "font-src 'self' data:", "object-src 'none'",
].join('; ');
const PROTECTED = /\/data\/starmap\/|\/assets\/models\/starmap\/|starmap-viewer\.js|\/assets\/vendor\/three-/;
// 2x2 PNG. 게임 그림은 Git 에 없으므로, 그림 폴더가 없는 곳(CI)에서는 이 그림으로 대신한다.


// WebGL 이 필요한 테스트는 소프트웨어 렌더러를 쓴다 (총기 개조 화면 테스트와 같다).
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

async function prepare(page, options = { fleet: true }) {
    const problems = trackConsoleErrors(page);
    const requests = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname + new URL(request.url()).search));
    page.on('response', (response) => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
    await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': STRICT_CSP } });
    });
    await mockMapTextures(page);
    await mockApi(page, options);
    await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => { window.__cspViolations.push(`${event.violatedDirective} <- ${event.blockedURI || 'inline'}`); });
    });
    return { requests, problems: async () => [...problems, ...(await page.evaluate(() => window.__cspViolations || []))] };
}
const debug = (page) => page.evaluate(() => { const d = window.VOLT_STARMAP.debug(); return { phase: d.phase, view: d.view, state: d.state, loaded: d.loaded, viewer: d.viewer }; });
async function open3d(page, hash = '#starmap', lang = 'ko') {
    await gotoSection(page, `?lang=${lang}${hash}`);
    await expect(page.locator('#starmap-app .starmap-source')).toBeVisible({ timeout: 20000 });
    await expect.poll(async () => (await debug(page)).viewer?.ready, { timeout: 30000 }).toBe(true);
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('함대원: 지도와 목록이 열리고 캔버스에 그림이 그려진다 (1440px, CSP·콘솔 오류 없음)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    await open3d(page);
    await expect(page.locator('section#starmap .section-header h2')).toHaveText('성계 지도');
    await expect(page.locator('#starmap-app .starmap-canvas')).toBeVisible();
    await expect(page.locator('#starmap-app .starmap-scale')).toContainText('거리는 줄여서 그렸습니다');
    await expect(page.locator('#starmap-app .starmap-source')).toContainText(`게임 버전 ${index.gameVersion}`);
    await expect(page.locator('#starmap-app .starmap-tab[aria-pressed="true"]')).toHaveText(index.systems[0].name.ko);

    // 512 그림이 다 올라올 때까지 기다린 뒤 화면을 읽는다.
    const bodies = stanton.objects.filter((object) => object.tex).length;
    await expect.poll(async () => (await debug(page)).viewer.textures['512'] || 0, { timeout: 30000 }).toBe(bodies);
    const state = await debug(page);
    expect(state.viewer.bodies).toBe(stanton.objects.filter((object) => ['star', 'planet', 'moon'].includes(object.kind)).length);
    expect(state.viewer.painted, '배경이 아닌 픽셀이 있어야 함').toBeGreaterThan(300);
    expect(state.viewer.labels).toBeGreaterThan(5);
    expect(state.loaded).toEqual(['stanton']);

    // 지금 보는 항성계 자료만, 그림은 512 만 받는다.
    const data = tracker.requests.filter((url) => url.startsWith('/data/starmap/')).map((url) => url.split('?')[0]).sort();
    expect(data).toEqual(['/data/starmap/index.json', '/data/starmap/stanton.json', '/data/starmap/textures.json']);
    const textures = tracker.requests.filter((url) => url.startsWith('/assets/models/starmap/'));
    expect(textures).toHaveLength(bodies);
    for (const url of textures) expect(url).toMatch(/^\/assets\/models\/starmap\/tex\/ui_sm_stanton_[a-z0-9_]+_512\.webp\?v=/);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await tracker.problems()).toEqual([]);
});

for (const [name, options, text, links] of [['로그아웃', { loggedIn: false }, '함대원 전용 기능입니다', 1], ['함대원 아님', { fleet: false }, '함대원 역할이 필요합니다', 0]]) {
    test(`${name}: 안내만 보이고 보호 자료·그림·three.js 를 하나도 요청하지 않는다`, async ({ page }) => {
        const tracker = await prepare(page, options);
        await gotoSection(page, '?lang=ko#starmap?focus=Stanton1_Lorville&route=Stanton1_Lorville,RR_HUR_L1');
        const gate = page.locator('section#starmap .helper-access');
        await expect(gate).toContainText(text);
        await expect(gate.getByRole('link')).toHaveCount(links);
        await expect(page.locator('#starmap-app')).toBeHidden();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        expect(tracker.requests.filter((url) => PROTECTED.test(url))).toEqual([]);
        expect(await page.evaluate(() => window.VOLT_STARMAP.debug().phase)).toBe('loading');
        expect(await tracker.problems()).toEqual([]);
    });
}

test('공개 지도는 인증 서버가 응답하지 않아도 성계를 바꿀 수 있다', async ({ page }) => {
    const tracker = await prepare(page, { loggedIn: false });
    await page.route('**/api/tool-access', route => route.fulfill({ json: { community: true, helpers: true } }));
    await page.route(/\/auth\/me(?:\?.*)?$/, route => route.fulfill({ status: 503, json: {} }));
    await open3d(page);
    for (const id of ['pyro', 'nyx', 'stanton']) {
        await page.locator('.starmap-tab[data-id="' + id + '"]').click();
        await expect(page.locator('.starmap-tab[aria-pressed="true"]')).toHaveAttribute('data-id', id);
    }
    expect(tracker.requests.filter(url => url.includes('/auth/me?refresh=1'))).toEqual([]);
});

test('focus 주소: 그 장소를 고르고, 1k 그림은 고른 천체 하나만, 다른 화면으로 가는 길이 연결 자료대로 나온다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    const lorville = S.get('Stanton1_Lorville');
    await open3d(page, '#starmap?focus=Stanton1_Lorville');
    const info = page.locator('#starmap-app .starmap-info');
    await expect(info.locator('.starmap-info-title')).toHaveText(lorville.name.ko);
    await expect(info).toContainText(gm(metres(lorville.pos, [0, 0, 0])));
    await expect(info).toContainText(index.laws[lorville.law].name.ko);
    for (const terminal of lorville.uex) {
        await expect(info.locator(`a.starmap-out[href="#market?t=${terminal}"]`)).toBeVisible();
        await expect(info.locator(`a.starmap-out[href="#routes?from=${terminal}"]`)).toBeVisible();
    }
    await expect(info.locator('a.starmap-out[href^="#mining"]')).toHaveCount(0);   // 채광 자료와 이어지지 않는 곳에는 링크가 없다
    await expect(page.locator('#starmap-app .starmap-row[aria-current="true"]')).toContainText(lorville.name.ko);

    await expect.poll(async () => (await debug(page)).viewer.activeTexture, { timeout: 30000 }).toBe('1k');
    const state = await debug(page);
    expect(state.viewer.active).toBe('Stanton1');
    const spot = await page.evaluate(() => window.VOLT_STARMAP.debug().screenOf('Stanton1_Lorville'));
    expect(spot.shown).toBe(true);
    await expect(page.locator('#starmap-app .starmap-label.is-selected')).toContainText('로어빌');
    const big = tracker.requests.filter((url) => /_1k\.webp/.test(url));
    expect(big).toHaveLength(1);
    expect(big[0]).toContain(`${S.get('Stanton1').tex}_1k.webp`);
    expect(tracker.requests.filter((url) => /_(2k|4k)\./.test(url))).toEqual([]);

    // 채광·임무와 이어지는 천체: 채광 링크와 임무 링크가 나온다.
    await info.locator('button.starmap-link', { hasText: S.get('Stanton1').name.ko }).click();
    await expect(info.locator('.starmap-info-title')).toHaveText(S.get('Stanton1').name.ko);
    await expect(info.locator('a.starmap-out[href="#mining?loc=Stanton1"]')).toBeVisible();
    await expect(info.locator('a.starmap-out[href="#missions?place=Stanton1"]')).toBeVisible();
    await expect(page).toHaveURL(/#starmap\?focus=Stanton1&sys=stanton$/);
    expect(await tracker.problems()).toEqual([]);
});

test('route 주소: 번호가 붙고 구간마다 실제 거리가 나오며, 다른 항성계로 넘어가는 구간은 점프 포인트를 알려 준다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    const stops = ['Stanton1_Lorville', 'RR_HUR_L1', 'Stanton2_Orison', 'RR_P3_L1'];
    await open3d(page, `#starmap?route=${stops.join(',')}`);
    const card = page.locator('#starmap-app [data-over="route"]');
    await expect(card.locator('.starmap-route > li')).toHaveCount(4);
    const legs = card.locator('.starmap-leg');
    await expect(legs).toHaveCount(3);
    await expect(legs.nth(0)).toContainText(gm(metres(S.get(stops[0]).pos, S.get(stops[1]).pos)));
    await expect(legs.nth(1)).toContainText(gm(metres(S.get(stops[1]).pos, S.get(stops[2]).pos)));
    const link = index.links.find((entry) => entry.a.sys === 'stanton' && entry.b.sys === 'pyro');
    await expect(legs.nth(2)).toHaveAttribute('data-leg', 'jump');
    await expect(legs.nth(2)).toContainText('다른 항성계로 넘어갑니다');
    await expect(legs.nth(2)).toContainText(S.get(link.a.station).name.ko.replace(/\s*\[.*$/, ''));
    await expect(legs.nth(2)).toContainText(gm(metres(S.get(stops[2]).pos, link.a.pos)));
    await expect(legs.nth(2)).toContainText(gm(metres(link.b.pos, P.get(stops[3]).pos)));
    await expect(card).toContainText('점프 구간의 길이와 걸리는 시간은 게임 자료에 없습니다');

    // 지도: 이 항성계의 세 곳에 번호, 구간 선 3개(마지막은 점프 포인트까지 점선).
    // 로어빌(1)과 HUR-L1(2)은 멀리서 보면 허스턴 한 점에 겹치므로 번호를 한 표지에 묶는다. 번호 셋이 모두 보여야 한다.
    const badges = await page.locator('#starmap-app .starmap-stop:not([hidden])').allTextContents();
    expect(badges.flatMap((text) => text.split('·')).sort()).toEqual(['1', '2', '3']);
    expect(badges).toContain('1·2');
    await expect(page.locator('#starmap-app .starmap-lines line.is-route')).toHaveCount(3);
    await expect(page.locator('#starmap-app .starmap-lines line.is-route.is-dashed')).toHaveCount(1);
    expect((await debug(page)).loaded.sort()).toEqual(['nyx', 'pyro', 'stanton']);   // 다른 항성계의 장소를 찾느라 자료만 더 받는다
    expect(tracker.requests.filter((url) => /\/tex\/ui_sm_(pyro|nyx)/.test(url))).toEqual([]);   // 그림은 지금 항성계 것만

    // 경로의 장소를 누르면 그 항성계로 넘어간다.
    await card.locator('button.starmap-link', { hasText: P.get('RR_P3_L1').name.ko }).click();
    await expect(page.locator('#starmap-app .starmap-tab[aria-pressed="true"]')).toHaveText('파이로');
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(P.get('RR_P3_L1').name.ko);
    await expect(page.locator('#starmap-app .starmap-stop:not([hidden])')).toHaveCount(1);
    expect(await tracker.problems()).toEqual([]);
});

test('mark · area 주소: UEX 터미널 번호와 게임 파일에 놓인 자리가 없는 곳도 받고, 채광 구역은 고리와 있는 곳을 보여 준다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    const terminal = S.get('RR_HUR_L1').uex[0];
    await open3d(page, `#starmap?sys=pyro&mark=RR_P3_L1,RR_P1_L2,${terminal}`);
    const marks = page.locator('#starmap-app [data-over="mark"]');
    await expect(marks.locator('.starmap-h')).toHaveText('표시한 곳 3곳 · 이 항성계 2곳');
    await expect(marks.locator('.starmap-marks > li').nth(1)).toContainText('놓인 자리 없음');
    await expect(marks.locator('.starmap-marks > li').nth(2)).toContainText(S.get('RR_HUR_L1').name.ko);
    await expect(marks.locator('.starmap-marks > li').nth(2)).toContainText('스탠턴');
    expect(await page.evaluate(() => window.VOLT_STARMAP.debug().screenOf('RR_P3_L1').shown)).toBe(true);

    // 게임 파일에 놓인 자리도 UEX 터미널도 없는 정거장: 추정 자리를 찍지 않고, 거래·정제 연결도 걸지 않고, 그렇다고 알려 준다.
    expect(P.get('RR_P1_L2')).toMatchObject({ nopos: 1, unplaced: 1 });
    expect([P.get('RR_P1_L2').trade, P.get('RR_P1_L2').refinery, P.get('RR_P1_L2').guess]).toEqual([undefined, undefined, undefined]);
    await marks.locator('button.starmap-link', { hasText: 'PYAM-FARSTAT-1-2' }).click();
    const info = page.locator('#starmap-app .starmap-info');
    await expect(info).toContainText('놓인 자리 없음');
    await expect(info.locator('.starmap-warn')).toContainText('게임 파일에 이곳이 놓인 자리가 없습니다');
    await expect(info.locator('.starmap-tag.is-guess')).toHaveCount(0);
    await expect(info.locator('a.starmap-out[href^="#market"], a.starmap-out[href^="#routes"], a.starmap-out[href*="tab=ref"]')).toHaveCount(0);
    await expect(info.locator('[data-act="refocus"]')).toHaveCount(0);
    expect((await debug(page)).viewer.active).toBeNull();
    // 정거장 목록에서는 고를 수 있고 위치가 없음을 알려 준다.
    await expect(page.locator('#starmap-app .starmap-tree [data-id="RR_P1_L2"]')).toContainText('놓인 자리 없음');


    // 채광 구역 (점이 아닌 곳)
    await page.evaluate(() => window.VOLT_STARMAP.open({ area: 'AaronHalo' }));
    const area = page.locator('#starmap-app [data-over="area"]');
    await expect(area).toContainText('아론 헤일로');
    await expect(area).toContainText('19 Gm');
    await expect(area).toContainText('게임 수치');
    await expect(area.locator('a.starmap-out[href="#mining?loc=AaronHalo"]')).toBeVisible();
    await expect(page.locator('#starmap-app .starmap-tab[aria-pressed="true"]')).toHaveText(index.systems[0].name.ko);
    await page.evaluate(() => window.VOLT_STARMAP.open({ area: 'Nyx_KeegerBelt' }));
    await expect(area).toContainText('추정');
    await expect(page.locator('#starmap-app .starmap-tab[aria-pressed="true"]')).toHaveText('닉스');
    expect(await tracker.problems()).toEqual([]);
});

test('지도에서 누르기 · 항성계 옮기기 · 거리 재기 · 떠나면 3D 를 내려놓는다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const ship = cargo.ships.find((row) => row.qd && cargo.drives[row.qd]);
    await page.addInitScript((id) => { window.localStorage.setItem('volt-helper-state-v1', JSON.stringify({ v: 1, ship: id })); }, ship.id);
    const tracker = await prepare(page);
    await open3d(page);

    // 지도의 행성을 누르면 고른다.
    const spot = await page.evaluate(() => window.VOLT_STARMAP.debug().screenOf('Stanton4'));
    expect(spot.shown).toBe(true);
    const box = await page.locator('#starmap-app .starmap-canvas').boundingBox();
    await page.mouse.click(box.x + spot.x, box.y + spot.y);
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('Stanton4').name.ko);
    await expect(page).toHaveURL(/#starmap\?focus=Stanton4&sys=stanton$/);

    // 거리 재기: 목록에서 두 곳.
    await page.locator('#starmap-app [data-act="measure"]').click();
    await page.locator('#starmap-q').fill('Everus');
    await page.locator('#starmap-app .starmap-results [data-act="pick"]', { hasText: 'Everus Harbor' }).first().click();
    await page.locator('#starmap-q').fill('Baijini');
    await page.locator('#starmap-app .starmap-results [data-act="pick"]', { hasText: 'Baijini Point' }).first().click();
    const everus = stanton.objects.find((object) => object.name?.en === 'Everus Harbor');
    const baijini = stanton.objects.find((object) => object.name?.en === 'Baijini Point');
    const measure = page.locator('#starmap-app [data-over="measure"]');
    await expect(measure).toContainText(`같은 항성계 · 직선 거리 ${gm(metres(everus.pos, baijini.pos))}`);
    await expect(measure.locator('.starmap-estimate')).toContainText('추정');
    await expect(measure).toContainText(cargo.drives[ship.qd].name.ko || cargo.drives[ship.qd].name.en);
    await expect(page.locator('#starmap-app .starmap-lines line.is-measure')).toHaveCount(1);

    // 게이트웨이로 다른 항성계에: 그 항성계 자료와 그림만 새로 받는다.
    await page.locator('#starmap-app .starmap-exit', { hasText: '파이로' }).click();
    await expect(page.locator('#starmap-app .starmap-tab[aria-pressed="true"]')).toHaveText('파이로');
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(P.get('RR_JP_PyroStanton').name.ko);
    await expect(page.locator('#starmap-app .starmap-jump')).toContainText('스탠턴으로 이어지는 점프 포인트');
    await expect.poll(async () => (await debug(page)).viewer.textures['512'] || 0, { timeout: 30000 }).toBe(pyro.objects.filter((object) => object.tex).length);
    expect(tracker.requests.filter((url) => /\/tex\/ui_sm_nyx/.test(url))).toEqual([]);

    // 다른 화면으로 가면 3D 를 버리고, 돌아오면 다시 만든다.
    await page.evaluate(() => { window.location.hash = '#about'; });
    await expect(page.locator('section#about')).toHaveClass(/active/);
    await expect.poll(async () => (await debug(page)).viewer).toBeNull();
    await expect(page.locator('#starmap-app canvas')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('section#starmap')).toHaveClass(/active/);
    await expect.poll(async () => (await debug(page)).viewer?.ready, { timeout: 30000 }).toBe(true);
    expect((await debug(page)).state.sys).toBe('pyro');
    expect(await tracker.problems()).toEqual([]);
});

test('WebGL 을 못 쓰면 오류 화면 없이 목록·검색·정보 칸으로 쓴다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const tracker = await prepare(page);
    await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(type) ? null : original.call(this, type, ...rest); };
    });
    await gotoSection(page, '?lang=ko#starmap');
    await expect(page.locator('#starmap-app .starmap-fallback')).toContainText('3D 지도를 그릴 수 없습니다');
    expect((await debug(page)).view).toBe('none');
    await expect(page.locator('#starmap-app canvas')).toHaveCount(0);
    await expect(page.locator('#starmap-app .starmap-view')).toBeHidden();
    // 3D 를 못 그리는 기기는 3D 파일(three.js, 지도 3D 코드)과 그림을 아예 받지 않는다.
    expect(tracker.requests.filter((url) => /three-|starmap-viewer|\/assets\/models\/starmap\//.test(url))).toEqual([]);
    await expect(page.locator('#starmap-app .helper-soon-error')).toHaveCount(0);

    // 키보드만으로: 찾기 → 결과 → 고르기 → 정보.
    await page.locator('#starmap-q').focus();
    await page.keyboard.type('FARSTAT-1-2');
    const result = page.locator('#starmap-app .starmap-results [data-act="pick"]').first();
    await expect(result).toHaveAttribute('data-id', 'RR_P1_L2');   // 마지막 글자까지 반영된 결과
    await expect(result).toContainText('놓인 자리 없음');
    await page.keyboard.press('Tab');
    await expect(result).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#starmap-app .starmap-tab[aria-pressed="true"]')).toHaveText('파이로');
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText('PYAM-FARSTAT-1-2');

    // 목록(나무): 펼치고 고른다.
    await page.locator('#starmap-app [data-act="sys"][data-id="stanton"]').click();
    await page.locator('#starmap-q').fill('');
    const toggle = page.locator('#starmap-app .starmap-toggle[data-id="b:Stanton1"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toBeFocused();
    await page.locator('#starmap-app .starmap-tree [data-act="pick"][data-id="Stanton1_Lorville"]').click();
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('Stanton1_Lorville').name.ko);
    await expect(page.locator('#starmap-app .starmap-info a.starmap-out').first()).toBeVisible();
    // 할 일로 거르기: 정제소만.
    await page.locator('#starmap-app [data-act="need"][data-id="refinery"]').click();
    const group = page.locator('#starmap-app .starmap-toggle[data-id="g:station"]');
    if (await group.getAttribute('aria-expanded') !== 'true') await group.click();
    const rows = page.locator('#starmap-app .starmap-branch:has(> .starmap-toggle[data-id="g:station"]) .starmap-list.is-nested [data-act="pick"]');
    await expect(rows.first()).toBeVisible();
    for (const id of await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.id))) expect(S.get(id).refinery, id).toBe(1);
    await expect(page).toHaveURL(/with=refinery/);
    expect(await tracker.problems()).toEqual([]);
});

test('휴대폰 390px: 가로 스크롤 없이, 누를 자리 44px, 정보 칸은 아래 판, 손가락으로 고른다', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'ko-KR' });
    const page = await context.newPage();
    const tracker = await prepare(page);
    await open3d(page);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    const small = await page.locator('#starmap-app button:visible, #starmap-app a:visible, #starmap-app summary:visible, #starmap-q').evaluateAll((nodes) => nodes
        .map((node) => ({ text: (node.textContent || node.getAttribute('aria-label') || node.id).trim().slice(0, 30), height: node.getBoundingClientRect().height, width: node.getBoundingClientRect().width }))
        .filter((box) => box.height < 43.5 || box.width < 43.5));
    expect(small).toEqual([]);
    const painted = (await debug(page)).viewer.painted;
    expect(painted).toBeGreaterThan(200);

    const spot = await page.evaluate(() => window.VOLT_STARMAP.debug().screenOf('Stanton2'));
    const box = await page.locator('#starmap-app .starmap-canvas').boundingBox();
    await page.locator('#starmap-app .starmap-canvas').scrollIntoViewIfNeeded();
    const after = await page.locator('#starmap-app .starmap-canvas').boundingBox();
    await page.touchscreen.tap(after.x + spot.x, after.y + spot.y);
    expect(box.width).toBeLessThanOrEqual(390);
    const info = page.locator('#starmap-app .starmap-info');
    await expect(info.locator('.starmap-info-title')).toHaveText(S.get('Stanton2').name.ko);
    const sheet = await info.evaluate((node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return { position: style.position, bottom: Math.round(window.innerHeight - rect.bottom), height: rect.height, vh: window.innerHeight }; });
    expect(sheet.position).toBe('fixed');
    expect(sheet.bottom).toBe(0);
    expect(sheet.height).toBeLessThanOrEqual(sheet.vh * 0.35);
    await info.locator('[data-act="sheet"]').click();
    await expect(info.locator('[data-act="sheet"]')).toHaveAttribute('aria-expanded', 'true');
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await info.locator('[data-act="clear"]').click();
    await expect(info).toContainText('장소를 고르면');
    expect(await tracker.problems()).toEqual([]);
    await context.close();
});

test('English: UI text, place names and distances are in English', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    await open3d(page, '#starmap?focus=RR_HUR_L1', 'en');
    await expect(page.locator('section#starmap .section-header h2')).toHaveText('Star Map');
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('RR_HUR_L1').name.en);
    await expect(page.locator('#starmap-app .starmap-scale')).toContainText('Distances are not to scale');
    await expect(page.locator('#starmap-app .starmap-info')).toContainText('Distance from the star');
    await expect(page.locator('#starmap-app .starmap-info a.starmap-out[href="#mining?ref=RR_HUR_L1&tab=ref"]')).toHaveText('Open in the refinery finder');
    await expect(page.locator('#starmap-app .starmap-exit').first()).toContainText('Go to');
    await expect(page.locator('#starmap-app .starmap-label.is-selected')).toContainText('Green Glade');
    await expect(page.locator('#starmap-app')).not.toContainText(/[가-힣]/);
    // 언어를 바꾸면 화면과 이름표가 따라온다.
    await page.evaluate(() => window.VOLT_I18N.setLang('ko'));
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('RR_HUR_L1').name.ko);
    await expect(page.locator('#starmap-app .starmap-label.is-selected')).toContainText('그린 글레이드');
    expect(await tracker.problems()).toEqual([]);
});

test('다른 화면이 쓰는 입구: href 가 계약한 주소를 만들고, 그 주소가 같은 화면을 되살린다', async ({ page }) => {
    const tracker = await prepare(page);
    await open3d(page);
    const made = await page.evaluate(() => ({
        focus: window.VOLT_STARMAP.href({ focus: 'Stanton1_Lorville' }),
        route: window.VOLT_STARMAP.href({ route: ['Stanton1_Lorville', 'RR_HUR_L1'], sys: 'stanton' }),
        mark: window.VOLT_STARMAP.href({ mark: [44, 18] }),
    }));
    expect(made).toEqual({ focus: '#starmap?focus=Stanton1_Lorville', route: '#starmap?route=Stanton1_Lorville%2CRR_HUR_L1&sys=stanton', mark: '#starmap?mark=44%2C18' });
    await page.evaluate(() => window.VOLT_STARMAP.open({ mark: [44, 18] }));
    await expect(page.locator('#starmap-app [data-over="mark"] .starmap-marks > li')).toHaveCount(2);
    // 모르는 값은 조용히 넘어간다.
    await page.evaluate(() => { window.location.hash = '#starmap?sys=nowhere&focus=NoSuchPlace&route=x,y&zzz=1'; });
    await expect(page.locator('#starmap-app .starmap-info')).toContainText('찾을 수 없는 장소');
    await expect(page.locator('#starmap-app .starmap-canvas')).toBeVisible();
    // 주소 복사 버튼
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => window.VOLT_STARMAP.open({ focus: 'Stanton3', sys: 'stanton' }));
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('Stanton3').name.ko);
    await page.locator('#starmap-app [data-act="share"]').click();
    await expect(page.locator('#starmap-app .starmap-flash')).toHaveText('주소를 복사했습니다.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/#starmap\?focus=Stanton3&sys=stanton$/);
    expect(await tracker.problems()).toEqual([]);
});

test('접근성: 심각한 axe 위반이 없다 (지도·정보 칸·경로 요약, 한국어·영어)', async ({ page }) => {
    const AxeBuilder = require('@axe-core/playwright').default;
    await page.setViewportSize({ width: 1280, height: 900 });
    const tracker = await prepare(page);
    for (const [lang, hash] of [['ko', '#starmap?focus=Stanton1_Lorville&route=Stanton1_Lorville,RR_HUR_L1,RR_P3_L1'], ['en', '#starmap?sys=nyx&area=Nyx_KeegerBelt&mark=Nyx_Levski']]) {
        await open3d(page, hash, lang);
        const axe = await new AxeBuilder({ page }).include('#starmap-app').analyze();
        expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${lang}: ${v.id} ${v.nodes[0]?.target} ${v.nodes[0]?.failureSummary}`)).toEqual([]);
    }
    expect(await tracker.problems()).toEqual([]);
});

// ── 점검에서 나온 문제들 (2026-11-19) ──────────────────────────────────────
const nyx = load('nyx');
const N = byId(nyx);
const canvasBox = (page) => page.locator('#starmap-app .starmap-canvas').boundingBox();
const screenOf = (page, id) => page.evaluate((key) => window.VOLT_STARMAP.debug().screenOf(key), id);

test('휴대폰: 이름표 위에서 시작한 끌기·벌리기도 지도만 움직이고(페이지는 그대로), 이름표를 누르면 그 장소를 고른다', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'ko-KR' });
    const page = await context.newPage();
    const tracker = await prepare(page);
    await open3d(page);
    await page.evaluate(() => { const canvas = document.querySelector('#starmap-app .starmap-canvas'); window.scrollTo({ top: canvas.getBoundingClientRect().top + window.scrollY - 90, behavior: 'instant' }); });
    await page.waitForTimeout(300);
    const labels = async () => page.locator('#starmap-app .starmap-label:not([hidden])').evaluateAll((nodes) => nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { id: node.dataset.id, x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, events: getComputedStyle(node).pointerEvents };
    }));
    const state = () => page.evaluate(() => ({ scrollY: Math.round(window.scrollY), scale: window.visualViewport.scale, at: window.VOLT_STARMAP.debug().screenOf('Stanton4') }));
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });

    let shown = await labels();
    expect(shown.length).toBeGreaterThan(3);
    expect([...new Set(shown.map((label) => label.events))]).toEqual(['none']);
    const view = await canvasBox(page);
    const central = (list) => list.filter((label) => label.y > view.y + 70 && label.y < view.y + view.height - 70 && label.x > 60 && label.x < 330).sort((a, b) => b.width - a.width)[0];
    const wide = central(shown);
    expect(wide).toBeTruthy();
    const before = await state();

    // 한 손가락으로 세로로 끈다: 이름표 위에서 시작해도 페이지는 스크롤되지 않고 지도가 돈다.
    await touch('touchStart', [[wide.x, wide.y]]);
    for (let step = 1; step <= 10; step++) { await touch('touchMove', [[wide.x, wide.y - step * 12]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    await page.waitForTimeout(300);
    const dragged = await state();
    expect(dragged.scrollY).toBe(before.scrollY);
    expect(Math.hypot(dragged.at.x - before.at.x, dragged.at.y - before.at.y)).toBeGreaterThan(4);

    // 두 손가락으로 벌린다: 사이트 전체가 커지지 않고 지도만 가까워진다.
    shown = await labels();
    const other = central(shown) || shown[0];
    const framesBefore = (await debug(page)).viewer.frames;
    await touch('touchStart', [[other.x - 20, other.y], [other.x + 20, other.y]]);
    for (let step = 1; step <= 10; step++) { await touch('touchMove', [[other.x - 20 - step * 8, other.y], [other.x + 20 + step * 8, other.y]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    await page.waitForTimeout(300);
    const pinched = await state();
    expect(pinched.scale).toBe(1);
    expect(pinched.scrollY).toBe(before.scrollY);
    expect((await debug(page)).viewer.frames).toBeGreaterThan(framesBefore);

    // 이름표를 짧게 누르면 그 장소를 고른다 (전체 보기로 돌아가서). 글자 줄 바로 아래를 눌러도 된다: 손가락 여유(누를 자리 44px).
    await page.locator('#starmap-app [data-act="home"]').tap();
    await page.waitForTimeout(900);
    const target = (await labels()).find((label) => label.id === 'Stanton4');
    expect(target).toBeTruthy();
    await page.touchscreen.tap(target.x, target.y + 16);
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('Stanton4').name.ko);
    expect(await tracker.problems()).toEqual([]);
    await context.close();
});

test('천체에 딸리지 않은 장소(레브스키, 게이트웨이)를 열면 항성과 가까운 행성이 함께 보인다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    for (const [hash, id, star, system] of [['#starmap?focus=Nyx_Levski', 'Nyx_Levski', 'NyxStar', nyx], ['#starmap?focus=RR_JP_PyroStanton', 'RR_JP_PyroStanton', 'PyroStar', pyro]]) {
        await open3d(page, hash);
        await page.waitForTimeout(400);
        const box = await canvasBox(page);
        const inside = (spot) => Boolean(spot && spot.shown && spot.x > 0 && spot.x < box.width && spot.y > 0 && spot.y < box.height);
        expect(inside(await screenOf(page, id)), `${id} on screen`).toBe(true);
        expect(inside(await screenOf(page, star)), `${star} on screen`).toBe(true);
        const seen = [];
        for (const planet of system.objects.filter((object) => object.kind === 'planet' && object.pos)) if (inside(await screenOf(page, planet.id))) seen.push(planet.id);
        expect(seen.length, `${id}: a planet on screen`).toBeGreaterThan(0);
        await expect(page.locator('#starmap-app .starmap-label.is-selected:not([hidden])')).toBeVisible();
        expect(await page.locator('#starmap-app .starmap-label:not([hidden])').count()).toBeGreaterThan(3);
    }
    expect(await tracker.problems()).toEqual([]);
});

test('휴대폰: 목록·검색에서 장소를 고르면 지도가 머리글 바로 아래로 오고, 정보 판이 고른 곳을 가리지 않는다', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'ko-KR' });
    const page = await context.newPage();
    const tracker = await prepare(page);
    await open3d(page);
    const geometry = () => page.evaluate(() => {
        const canvas = document.querySelector('#starmap-app .starmap-canvas').getBoundingClientRect();
        const sheet = document.querySelector('#starmap-app .starmap-info').getBoundingClientRect();
        return { top: Math.round(canvas.top), bottom: Math.round(canvas.bottom), sheetTop: Math.round(sheet.top), pageHeight: document.documentElement.scrollHeight };
    });
    // 검색에서 고른다.
    await page.locator('#starmap-q').fill('area');
    await page.locator('#starmap-app .starmap-results [data-act="pick"]', { hasText: 'Area18' }).first().tap();
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('Stanton3_Area18').name.ko);
    await expect.poll(async () => { const at = await geometry(); return at.top >= 50 && at.bottom <= at.sheetTop + 4; }).toBe(true);
    let now = await geometry();
    expect(now.top).toBeLessThan(140);
    expect(now.bottom).toBeLessThanOrEqual(now.sheetTop + 4);
    // 목록에서 고른다: 목록을 다 펼쳐도 페이지가 끝없이 길어지지 않는다.
    await page.locator('#starmap-q').fill('');
    const closed = (await geometry()).pageHeight;
    for (const key of ['b:Stanton1', 'b:Stanton4', 'g:station']) await page.locator(`#starmap-app .starmap-toggle[data-id="${key}"]`).evaluate((node) => { if (node.getAttribute('aria-expanded') !== 'true') node.click(); });
    expect(await page.locator('#starmap-app .starmap-tree [data-act="pick"]').count()).toBeGreaterThan(120);
    expect((await geometry()).pageHeight - closed).toBeLessThan(844 * 0.7);
    await page.locator('#starmap-app .starmap-tree [data-act="pick"][data-id="RR_HUR_L1"]').evaluate((node) => node.click());
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('RR_HUR_L1').name.ko);
    await expect.poll(async () => { const at = await geometry(); return at.top >= 50 && at.bottom <= at.sheetTop + 4; }).toBe(true);
    now = await geometry();
    expect(now.top).toBeLessThan(140);
    expect(now.bottom).toBeLessThanOrEqual(now.sheetTop + 4);
    // 지도에서 천체를 눌렀을 때도 그 천체가 판 위에 보인다 (지도가 화면 아래쪽에 걸쳐 있던 경우).
    await page.locator('#starmap-app .starmap-info [data-act="clear"]').tap();
    await page.locator('#starmap-app [data-act="home"]').tap();
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollBy(0, -260));
    await page.waitForTimeout(200);
    const spot = await screenOf(page, 'Stanton1');
    const box = await canvasBox(page);
    await page.touchscreen.tap(box.x + spot.x, box.y + spot.y);
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('Stanton1').name.ko);
    await page.waitForTimeout(300);
    now = await geometry();
    const after = await screenOf(page, 'Stanton1');
    expect(now.top + after.y).toBeLessThan(now.sheetTop);
    expect(now.bottom).toBeLessThanOrEqual(now.sheetTop + 4);
    expect(await tracker.problems()).toEqual([]);
    await context.close();
});

test('채광 구역 여러 개는 카드 한 장에 묶고, 다른 항성계의 이름이 붙은 구역은 그 이름을 이곳 이름처럼 쓰지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    const areas = ['Nyx_GlaciemRing', 'Nyx_KeegerBelt', 'Lagrange_A', 'Pyro_Warm01', 'Pyro_Cool01', 'Stanton2c_Belt', 'AaronHalo', 'Pyro_DeepSpaceAsteroids'];
    await open3d(page, `#starmap?area=${areas.join(',')}&mark=Pyro5b,Pyro5c,Pyro6&sys=pyro`);
    const cards = page.locator('#starmap-app [data-over="area"]');
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('.starmap-h').first()).toHaveText('채광 구역 8곳');
    await expect(cards.locator('.starmap-area')).toHaveCount(4);   // 파이로에 있는 것: 고온 1, 저온 1, 옐라 목록을 함께 쓰는 터미너스, 심우주 소행성
    await expect(cards.locator('.starmap-area-else')).toContainText('닉스 항성계에 2곳');   // 글레시엠 고리, 키거 소행성대 (파이로에도 있는 구역은 위에 자세히 나온다)
    await expect(cards.locator('.starmap-area-else')).toContainText('스탠턴 항성계에 2곳');   // 라그랑주 A형, 아론 헤일로
    const shared = cards.locator('.starmap-area[data-area="Stanton2c_Belt"]');
    await expect(shared.locator('.starmap-big')).toHaveText('옐라 소행성대와 같은 광물이 나오는 곳');
    await expect(shared).toContainText(P.get('Pyro6').name.ko);
    // 표시한 위성 둘과 파이로 V 둘레의 구역 지점들은 멀리서 한 점에 겹치므로, 행성 이름표에 개수를 붙인다.
    const counted = await page.locator('#starmap-app .starmap-label[data-id="Pyro5"]:not([hidden])').innerText();
    expect(counted).toMatch(/^파이로 V · [0-9]+$/);
    expect(Number(counted.split('· ')[1])).toBeGreaterThanOrEqual(2);

    // 터미너스의 정보 칸: "옐라 소행성대"가 이곳 이름처럼 읽히지 않는다.
    await page.evaluate(() => window.VOLT_STARMAP.open({ focus: 'Pyro6' }));
    const link = page.locator('#starmap-app .starmap-info a.starmap-out[href="#mining?loc=Stanton2c_Belt"]');
    await expect(link).toHaveText('여기서 나오는 광물 · 옐라 소행성대와 같은 광물이 나오는 곳');

    // 닉스 키거 소행성대: 같은 이름을 쓰는 소행성 무리는 한 줄로 묶는다.
    await page.evaluate(() => window.VOLT_STARMAP.open({ area: 'Nyx_KeegerBelt' }));
    await expect(page.locator('#starmap-app .starmap-tab[aria-pressed="true"]')).toHaveText('닉스');
    const keeger = page.locator('#starmap-app [data-over="area"]');
    const sameName = nyx.regions.find((region) => region.id === 'Nyx_KeegerBelt').at.map((id) => N.get(id)).filter((object) => object.kind === 'asteroid' && object.name?.en === 'QV Breaker Station').length;
    expect(sameName).toBeGreaterThan(10);
    await expect(keeger.locator('.starmap-marks > li', { hasText: 'QV 브레이커 스테이션' }).filter({ hasText: '소행성' })).toHaveCount(1);
    await expect(keeger).toContainText(`같은 이름 ${sameName}곳`);

    // 라그랑주 C형: 다른 라그랑주 점 안의 광구까지 켜지 않는다.
    await page.evaluate(() => window.VOLT_STARMAP.open({ area: 'Lagrange_C' }));
    const typeC = stanton.regions.find((region) => region.id === 'Lagrange_C');
    expect(typeC.at).not.toContain('PrivateMiningPoint_Stanton1_L1_001');
    expect(typeC.also).toContain('PrivateMiningPoint_Stanton1_L1_001');
    await expect(page.locator('#starmap-app [data-over="area"]')).toContainText(`이 구역이 있는 곳 ${typeC.at.length}곳`);
    await expect(page.locator('#starmap-app [data-over="area"]')).toContainText(`다른 곳에 ${typeC.also.length}곳 더`);
    expect(await tracker.problems()).toEqual([]);
});

test('정보 칸: 임시 천체의 크기·그림 없는 천체·숨은 곳 수·이름과 다른 점프 포인트를 사실대로 적는다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    const info = page.locator('#starmap-app .starmap-info');
    const fieldOf = (label) => info.locator('.starmap-field', { has: page.locator('dt', { hasText: label }) }).locator('dd');
    // 닉스 I: 게임 파일에 임시 천체로만 놓여 있다. 1,000 km 를 사실처럼 적지 않는다.
    expect(N.get('Nyx1')).toMatchObject({ stub: 1, r: 1000000 });
    await open3d(page, '#starmap?focus=Nyx1');
    await expect(fieldOf('반지름')).toContainText('게임 자료에 없음');
    await expect(fieldOf('반지름')).not.toContainText('1,000 km');
    // 파이로 V: 표면 그림이 게임 자료에 없다.
    expect(P.get('Pyro5').tex).toBeUndefined();
    await page.evaluate(() => window.VOLT_STARMAP.open({ focus: 'Pyro5' }));
    await expect(fieldOf('표면 그림')).toContainText('게임 자료에 없음');
    await page.evaluate(() => window.VOLT_STARMAP.open({ focus: 'Pyro6' }));
    await expect(info.locator('.starmap-info-title')).toHaveText(P.get('Pyro6').name.ko);
    await expect(fieldOf('표면 그림')).toHaveCount(0);
    // 크루세이더: 목록의 곳 수(게임 지도에 나오는 곳)와 정보 칸의 곳 수(전부)가 다르면 둘 다 적는다.
    await page.evaluate(() => window.VOLT_STARMAP.open({ focus: 'Stanton2' }));
    await expect(info.locator('.starmap-info-title')).toHaveText(S.get('Stanton2').name.ko);
    const listed = Number((await page.locator('#starmap-app .starmap-tree [data-act="pick"][data-id="Stanton2"] .starmap-tag.is-count').innerText()).replace(/\D/g, ''));
    const heading = await info.locator('.starmap-links .starmap-h', { hasText: '이 천체에 있는 곳' }).innerText();
    const [all, onGameMap] = heading.match(/\d+/g).map(Number);
    expect(all).toBeGreaterThan(onGameMap);
    expect(onGameMap).toBe(listed);
    expect(heading).toContain(`${all}곳 (게임 지도에 나오는 곳 ${onGameMap}곳)`);
    // 기록 이름은 매그너스인데 파일에서 닉스로 이어지는 점프 포인트.
    await page.evaluate(() => window.VOLT_STARMAP.open({ focus: 'JumpPoint_Stanton_Magnus' }));
    await expect(info.locator('.starmap-jump')).toContainText('닉스로 이어지는 점프 포인트');
    await expect(info).toContainText('기록 이름에 적힌 곳: Magnus · 게임 파일에서 이어진 곳: 닉스');
    // 파이로 게이트웨이: 지금 쓰이는 터미널 하나만 건다.
    expect(S.get('RR_JP_StantonPyro').uexLive).toEqual([252]);
    await page.evaluate(() => window.VOLT_STARMAP.open({ focus: 'RR_JP_StantonPyro' }));
    await expect(info.locator('a.starmap-out[href^="#market"]')).toHaveCount(1);
    await expect(info.locator('a.starmap-out[href="#market?t=252"]')).toHaveText('여기서 사고파는 상품 보기');
    expect(await tracker.problems()).toEqual([]);
});

test('항성계를 오가도 같은 그림을 다시 받지 않고, 가장 가까이 가도 구가 화면을 넘치지 않으며, 전체 보기는 캔버스를 넉넉히 쓴다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    await open3d(page);
    const texCount = (system) => system.objects.filter((object) => object.tex).length;
    await expect.poll(async () => (await debug(page)).viewer.textures['512'] || 0, { timeout: 30000 }).toBe(texCount(stanton));
    // 전체 보기: 행성과 점프 포인트가 캔버스의 가로나 세로를 절반 넘게 쓴다 (축척 안내는 지도 안 아래쪽에 있다).
    const box = await canvasBox(page);
    const spots = [];
    for (const object of stanton.objects.filter((item) => item.pos && item.parent === 'StantonStar' && ['planet', 'jump', 'station'].includes(item.kind) && item.h !== 1)) { const spot = await screenOf(page, object.id); if (spot?.shown) spots.push(spot); }
    const span = (key) => Math.max(...spots.map((spot) => spot[key])) - Math.min(...spots.map((spot) => spot[key]));
    expect(Math.max(span('x') / box.width, span('y') / box.height)).toBeGreaterThan(0.6);
    for (const spot of spots) { expect(spot.x).toBeGreaterThan(0); expect(spot.x).toBeLessThan(box.width); expect(spot.y).toBeGreaterThan(0); expect(spot.y).toBeLessThan(box.height); }
    const scale = await page.locator('#starmap-app .starmap-scale').boundingBox();
    expect(scale.y).toBeGreaterThan(box.y + box.height / 2);
    expect(scale.y + scale.height).toBeLessThanOrEqual(box.y + box.height);

    for (const id of ['pyro', 'stanton', 'pyro', 'stanton']) {
        await page.locator(`#starmap-app [data-act="sys"][data-id="${id}"]`).click();
        await expect.poll(async () => (await debug(page)).viewer.textures['512'] || 0, { timeout: 30000 }).toBe(texCount(id === 'pyro' ? pyro : stanton));
    }
    const counts = new Map();
    for (const url of tracker.requests.filter((item) => /\/assets\/models\/starmap\/tex\//.test(item))) counts.set(url, (counts.get(url) || 0) + 1);
    expect(counts.size).toBe(texCount(stanton) + texCount(pyro));
    expect([...counts.values()].filter((count) => count > 1)).toEqual([]);

    // 가장 가까이: 에어리어 18을 고르고 ＋를 30번. 구가 화면 높이를 조금 넘는 데서 멈추고, 고른 곳은 화면 안에 있다.
    await page.evaluate(() => window.VOLT_STARMAP.open({ focus: 'Stanton3_Area18' }));
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('Stanton3_Area18').name.ko);
    await page.waitForTimeout(900);
    for (let n = 0; n < 30; n++) await page.locator('#starmap-app [data-act="zoom-in"]').click();
    await page.waitForTimeout(200);
    const globe = await screenOf(page, 'Stanton3');
    const city = await screenOf(page, 'Stanton3_Area18');
    expect(globe.px).toBeLessThan(box.height * 0.62);
    expect(city.shown).toBe(true);
    expect(city.x > 0 && city.x < box.width && city.y > 0 && city.y < box.height).toBe(true);
    expect(await tracker.problems()).toEqual([]);
});

test('English: one place is "1 place", not "1 places"', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    const single = Object.entries(stanton.sites).find(([, site]) => (site.at || []).length === 1 && !site.spots && !site.near)[0];
    await open3d(page, `#starmap?site=${single}`, 'en');
    await expect(page.locator('#starmap-app [data-over="site"]')).toContainText('Found at 1 place');
    await expect(page.locator('#starmap-app [data-over="site"]')).not.toContainText('1 places');
});
