const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { mockMapTextures, mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// "지도에서 보기" — 무역·임무·채광 화면에서 성계지도(#starmap)로 들어가는 링크와, 지도 정보 칸에서 그 화면들로 돌아가는 링크.
// 기대값(어느 장소가 지도에 있는지)은 data/starmap/links.json 과 각 화면의 자료에서 직접 계산한다.
// 계약: docs/starmap.md 3.1절(들어가는 링크) · 4절(나가는 링크)

const root = path.join(__dirname, '../..');
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const links = json('data/starmap/links.json');
const stanton = json('data/starmap/stanton.json');
const pyro = json('data/starmap/pyro.json');
const missions = json('data/contracts/missions.json');
const helper = json('data/mining/helper.json');
const hauling = json('data/contracts/hauling.json');
const FLAT = [...links.systems.flatMap((sys) => links.places[sys]), ...links.systems.flatMap((sys) => links.guess[sys])];
const ON_MAP = new Set(FLAT);
const S = new Map(stanton.objects.map((object) => [object.id, object]));
const P = new Map(pyro.objects.map((object) => [object.id, object]));
const siteObjects = (site) => [...new Set((site.at || []).flatMap((n) => (links.sites[missions.locations[n]?.id]?.at || []).map((at) => FLAT[at])))];

const STRICT_CSP = [
    "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self' https://forms.gle",
    "img-src 'self' data: https:", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com", "font-src 'self' data:", "object-src 'none'",
].join('; ');

const HOUR = 3600;
const ALL_BOXES = [1, 2, 4, 8, 16, 24, 32];
const C2 = { v: 1, ship: 'c2-hercules', budget: null, system: null, maxAgeDays: 3, time: {}, boxes: null };

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

// UEX 고정 자료. 터미널 번호는 data/trade/world.json 의 joins 에 있는 실제 번호다:
//   1 ARC-L1 (RR_ARC_L1) · 4 ARC-L4 (RR_ARC_L4) · 12 Area18 (Stanton3_Area18) · 85 Shubin SMCa-8 (Stanton4a_Shubin_SMCa_8) · 999999 지도에 없는 번호
function fixtures() {
    const now = Math.floor(Date.now() / 1000);
    const ago = (hours) => now - Math.round(hours * HOUR);
    return {
        terminals: [
            ...helper.refineryDesks.map((desk) => ({ id: desk.terminalId, type: 'refinery', name: desk.name.en, system: desk.system, live: true })),
            { id: 1, type: 'commodity', name: 'Admin - ARC-L1', nick: 'ARC-L1', code: 'ARCL1', live: true, system: 'Stanton', planet: 'ArcCorp', stationId: 1, station: 'ARC-L1 Wide Forest Station', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
            { id: 4, type: 'commodity', name: 'Admin - ARC-L4', nick: 'ARC-L4', code: 'ARCL4', live: true, system: 'Stanton', planet: 'ArcCorp', stationId: 4, station: 'ARC-L4 Faint Glen Station', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
            { id: 12, type: 'commodity', name: 'TDD - Area 18', nick: 'TDD Area 18', code: 'TDA18', live: true, system: 'Stanton', planet: 'ArcCorp', cityId: 1, city: 'Area 18', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
            { id: 85, type: 'commodity', name: 'Shubin Mining Facility SMCa-8', nick: 'Shubin SMCa-8', code: 'SMCA8', live: true, system: 'Stanton', planet: 'MicroTech', moon: 'Calliope', outpostId: 54, outpost: 'Shubin Mining Facility SMCa-8', flags: [], maxBox: 16 },
            { id: 999999, type: 'commodity', name: 'Nowhere Depot', nick: 'Nowhere', code: 'NOWH', live: true, system: 'Stanton', planet: 'ArcCorp', flags: [], maxBox: 32 },
        ],
        market: [
            { t: 1, c: 47, buy: 7000, stock: 500, sb: 5, box: ALL_BOXES, at: ago(2) },
            { t: 12, c: 47, sell: 8500, box: ALL_BOXES, at: ago(5) },
            { t: 999999, c: 47, sell: 7100, box: ALL_BOXES, at: ago(5) },
            { t: 1, c: 5, buy: 300, stock: 900, sb: 6, box: ALL_BOXES, at: ago(2) },
            { t: 4, c: 5, sell: 420, box: ALL_BOXES, at: ago(1) },
            { t: 85, c: 1, buy: 8000, stock: 46, sb: 2, box: [1, 2, 4, 8, 16], at: ago(30) },
            { t: 12, c: 1, sell: 10000, inv: 100, ss: 7, box: ALL_BOXES, at: ago(5) },
            { t: 12, c: 70, buy: 4000, stock: 200, sb: 4, box: ALL_BOXES, at: ago(4) },
            { t: 1, c: 70, sell: 5300, box: ALL_BOXES, at: ago(6) },
        ],
        commodities: [
            { id: 47, name: 'Laranite', code: 'LARA', kind: 'Metal', is_illegal: 0 },
            { id: 5, name: 'Aluminum', code: 'ALUM', kind: 'Metal', is_illegal: 0 },
            { id: 1, name: 'Agricium', code: 'AGRI', kind: 'Metal', is_illegal: 0 },
            { id: 70, name: 'Stims', code: 'STIM', kind: 'Vice', is_illegal: 0 },
        ],
    };
}

async function prepare(page, { lang = 'ko', access = { fleet: true } } = {}) {
    const problems = trackConsoleErrors(page);
    const requests = [];
    const data = fixtures();
    const meta = { source: 'uex', cached: true, ttlSeconds: 1800, fetchedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() };
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    page.on('response', (response) => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
    await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': STRICT_CSP } });
    });
    await mockMapTextures(page);
    await mockApi(page, access);
    await page.route('**/api/uex/market**', (route) => route.fulfill({ json: { status: 'ok', data: data.market, meta } }));
    await page.route('**/api/uex/terminals**', (route) => route.fulfill({ json: { status: 'ok', data: data.terminals, meta } }));
    await page.route('**/api/uex/commodities', (route) => route.fulfill({ json: { status: 'ok', data: data.commodities, meta } }));
    await page.addInitScript(([language, saved]) => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => { window.__cspViolations.push(`${event.violatedDirective} <- ${event.blockedURI || 'inline'}`); });
        if (!window.localStorage.getItem('volt-lang')) window.localStorage.setItem('volt-lang', language);
        if (!window.localStorage.getItem('volt-helper-state-v1')) window.localStorage.setItem('volt-helper-state-v1', JSON.stringify(saved));
    }, [lang, C2]);
    return { requests, problems: async () => [...problems, ...(await page.evaluate(() => window.__cspViolations || []))] };
}
const hrefOf = async (locator) => decodeURIComponent(await locator.getAttribute('href'));
const mapState = (page) => page.evaluate(() => { const d = window.VOLT_STARMAP.debug(); return { phase: d.phase, ...d.state }; });
// 링크를 눌러 성계지도가 그 값으로 열릴 때까지 기다린다.
async function follow(page, link) {
    // Playwright가 스크롤과 렌더 대기를 맡는다. 지도로 이동한 뒤 숨겨진 출발 링크를 다시 누르지 않는다.
    await link.click({ timeout: 15000 });
    await expect(page.locator('section#starmap')).toHaveClass(/active/);
    await expect.poll(async () => (await mapState(page)).phase, { timeout: 30000 }).toBe('ready');
    return mapState(page);
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// ── 들어가는 길: 각 화면 → 지도 ──────────────────────────────────────────

test('무역 경로: 목록의 줄과 경로 자세히에서 그 경로를 지도에 순서대로 연다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    await gotoSection(page, '#routes');
    const rowLink = page.locator('#routes-table tbody tr[data-route="1-12"] a.volt-map-link');
    await expect(rowLink).toBeVisible({ timeout: 20000 });
    await expect(rowLink).toContainText('지도에서 보기');
    expect(await hrefOf(rowLink)).toBe('#starmap?route=RR_ARC_L1,Stanton3_Area18&sys=stanton');
    // 두 곳이 모두 지도에 있는 줄마다 링크가 하나씩 있다. 지도에 없는 터미널(999999)로 가는 줄에는 없다.
    const keys = await page.locator('#routes-table tbody tr').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-route')));
    expect(keys).toContain('1-999999');
    await expect(page.locator('#routes-table tbody a.volt-map-link[data-map-link="route"]')).toHaveCount(keys.filter((key) => !key.includes('999999')).length);
    await expect(page.locator('#routes-table tbody tr[data-route="1-999999"] a.volt-map-link')).toHaveCount(0);

    await page.locator('#routes-open-1-12').click();
    const head = page.locator('#routes-detail .routes-detail-head a.volt-map-link');
    await expect(head).toBeVisible();
    await expect(head).toHaveAttribute('aria-label', /ARC-L1.*→.*지도에서 보기/);
    await expect(page.locator('#routes-detail .routes-block .routes-actions a.volt-map-link')).toHaveCount(1);
    const sourceHash = await page.evaluate(() => location.hash);
    const state = await follow(page, head);
    await expect(page.getByRole('link', { name: '이전 화면으로 돌아가기' })).toHaveAttribute('href', sourceHash);
    expect(state.route).toEqual(['RR_ARC_L1', 'Stanton3_Area18']);
    expect(state.sys).toBe('stanton');
    const card = page.locator('#starmap-app [data-over="route"]');
    await expect(card.locator('.starmap-route > li')).toHaveCount(2);
    await expect(card).toContainText(S.get('RR_ARC_L1').name.ko);
    await expect(card).toContainText(S.get('Stanton3_Area18').name.ko);
    await expect(card.locator('[data-leg="same"]')).toHaveCount(1);
    // 뒤로 가면 보던 경로 자세히로 돌아온다.
    await page.goBack();
    await expect(page.locator('section#routes')).toHaveClass(/active/);
    await expect(page.locator('#routes-detail')).toBeVisible();
    await follow(page, head);
    await page.getByRole('link', { name: '이전 화면으로 돌아가기' }).click();
    await expect(page.locator('#routes-detail')).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toBe(sourceHash);
    expect(await tracker.problems()).toEqual([]);
});

test('여러 곳 돌기: 들르는 곳 전부가 순서대로 지도에 열린다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    await gotoSection(page, '#tours?stops=1,12,4');
    const link = page.locator('#tours-app a.volt-map-link.tours-maplink').first();
    await expect(link).toBeVisible({ timeout: 20000 });
    expect(await hrefOf(link)).toBe('#starmap?route=RR_ARC_L1,Stanton3_Area18,RR_ARC_L4&sys=stanton');
    const state = await follow(page, link);
    expect(state.route).toEqual(['RR_ARC_L1', 'Stanton3_Area18', 'RR_ARC_L4']);
    await expect(page.locator('#starmap-app [data-over="route"] .starmap-route > li')).toHaveCount(3);
    await expect(page.locator('#starmap-app [data-over="route"] .starmap-stop-no')).toHaveText(['1', '2', '3']);

    // 출발지로 돌아오는 계획이면 마지막에 출발지가 한 번 더 들어간다.
    await page.evaluate(() => { window.location.hash = '#tours?stops=1,12,4&rt=1'; });
    await expect(page.locator('section#tours')).toHaveClass(/active/);
    await expect.poll(async () => hrefOf(page.locator('#tours-app a.volt-map-link.tours-maplink').first())).toBe('#starmap?route=RR_ARC_L1,Stanton3_Area18,RR_ARC_L4,RR_ARC_L1&sys=stanton');
    expect(await tracker.problems()).toEqual([]);
});

test('시세: 상품은 사는 곳·파는 곳을 모두 표시하고, 거래소는 그곳을 고른다. 지도에 없는 터미널은 빠진다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    await gotoSection(page, '#market?tab=prices&c=47');
    const all = page.locator('#market-app a.volt-map-link.market-maplink-all');
    await expect(all).toBeVisible({ timeout: 20000 });
    // 라라나이트: 사는 곳 1(터미널 1), 파는 곳 2(터미널 12, 999999). 999999 는 지도에 없으니 2곳만 표시한다.
    expect(await hrefOf(all)).toBe('#starmap?mark=RR_ARC_L1,Stanton3_Area18&sys=stanton');
    await expect(all).toContainText('2곳');
    expect(await hrefOf(page.locator('#market-app a.market-maplink-buy'))).toBe('#starmap?mark=RR_ARC_L1&sys=stanton');
    expect(await hrefOf(page.locator('#market-app a.market-maplink-sell'))).toBe('#starmap?mark=Stanton3_Area18&sys=stanton');
    const state = await follow(page, all);
    expect(state.mark).toEqual(['RR_ARC_L1', 'Stanton3_Area18']);
    const marks = page.locator('#starmap-app [data-over="mark"]');
    await expect(marks).toContainText('표시한 곳 2곳');
    await expect(marks.locator('.starmap-marks > li')).toHaveCount(2);

    // 거래소 한 곳
    await page.evaluate(() => { window.location.hash = '#market?tab=stations&t=12'; });
    const station = page.locator('#market-app [data-market-station="12"] a.volt-map-link.market-maplink-station');
    await expect(station).toBeVisible();
    expect(await hrefOf(station)).toBe('#starmap?focus=Stanton3_Area18&sys=stanton');
    const focused = await follow(page, station);
    expect(focused.focus).toBe('Stanton3_Area18');
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('Stanton3_Area18').name.ko);

    // 지도에 없는 거래소(999999)에는 링크가 없다. 거래소 목록에서도 지도에 있는 4곳에만 링크가 있다.
    await page.evaluate(() => { window.location.hash = '#market?tab=stations&t=999999'; });
    await expect(page.locator('#market-app [data-market-station="999999"]')).toBeVisible();
    await expect(page.locator('#market-app [data-market-station="999999"] a.volt-map-link')).toHaveCount(0);
    await page.evaluate(() => { window.location.hash = '#market?tab=stations'; });
    await expect(page.locator('#market-app a.market-maplink-row')).toHaveCount(4);
    expect(await tracker.problems()).toEqual([]);
});

test('임무: 싣는 곳과 내리는 곳이 한 곳씩이면 경로로, 후보가 여럿이면 표시로 연다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    // 싣는 곳 1곳 → 내리는 곳 1곳인 임무를 자료에서 고른다.
    const routeMission = missions.contracts.find((c) => {
        const from = [...new Set((c.sites || []).filter((site) => site.k === 'pickup').flatMap(siteObjects))];
        const to = [...new Set((c.sites || []).filter((site) => site.k === 'dropoff').flatMap(siteObjects))];
        return from.length === 1 && to.length === 1 && from[0] !== to[0];
    });
    const from = siteObjects(routeMission.sites.find((site) => site.k === 'pickup'))[0];
    const to = siteObjects(routeMission.sites.find((site) => site.k === 'dropoff'))[0];
    await gotoSection(page, `#missions?m=${routeMission.id}`);
    const whole = page.locator('#missions-app a.volt-map-link.missions-maplink-all');
    await expect(whole).toBeVisible({ timeout: 30000 });
    await expect(whole).toHaveAttribute('data-map-link', 'route');
    expect(await hrefOf(whole)).toContain(`route=${from},${to}`);
    // 줄마다: 후보가 한 곳인 줄은 그 임무 현장을 연다.
    const single = routeMission.sites.find((site) => site.at?.length === 1 && links.sites[missions.locations[site.at[0]].id]);
    await expect(page.locator(`#missions-app a.missions-maplink[href*="site=${encodeURIComponent(missions.locations[single.at[0]].id)}"]`).first()).toBeVisible();
    const state = await follow(page, whole);
    expect(state.route).toEqual([from, to]);
    await expect(page.locator('#starmap-app [data-over="route"] .starmap-route > li')).toHaveCount(2);

    // 후보가 여러 곳인 임무: 놓인 곳을 모두 표시한다.
    const markMission = missions.contracts.find((c) => (c.sites || []).length === 1 && (c.sites[0].at || []).length > 1 && siteObjects(c.sites[0]).length > 1 && siteObjects(c.sites[0]).length <= 20);
    const expected = siteObjects(markMission.sites[0]);
    await page.evaluate((id) => { window.location.hash = `#missions?m=${id}`; }, markMission.id);
    const row = page.locator('#missions-app a.volt-map-link.missions-maplink');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-map-link', 'mark');
    await expect(row).toContainText(`${expected.length}곳`);
    const marked = await follow(page, row);
    expect([...marked.mark].sort()).toEqual([...expected].sort());

    // 임무 현장 하나(site=)로 들어가면 지도가 그 현장 카드를 보여 준다.
    await page.evaluate((id) => { window.location.hash = `#missions?m=${id}`; }, routeMission.id);
    const siteLink = page.locator('#missions-app a.missions-maplink[data-map-link="site"]').first();
    await expect(siteLink).toBeVisible();
    const sited = await follow(page, siteLink);
    expect(sited.site).toBe(missions.locations[routeMission.sites.find((site) => site.at?.length === 1).at[0]].id);
    await expect(page.locator('#starmap-app [data-over="site"]')).toBeVisible();
    expect(await tracker.problems()).toEqual([]);
});

test('임무: 지도에 놓인 곳이 없는 임무 장소에는 링크가 없다', async ({ page }) => {
    const tracker = await prepare(page);
    // 후보 목록이 자료에 없거나(n 만 있음) 후보가 지도에 하나도 없는 임무
    const bare = missions.contracts.find((c) => (c.sites || []).length > 0 && c.sites.every((site) => !site.at || (site.at.length !== 1 && !siteObjects(site).length) || (site.at.length === 1 && !links.sites[missions.locations[site.at[0]].id]))
        && ![...(c.loc || []), ...(c.at || [])].some((id) => ON_MAP.has(id)));
    expect(bare, '그런 임무가 자료에 있어야 함').toBeTruthy();
    await gotoSection(page, `#missions?m=${bare.id}`);
    await expect(page.locator('#missions-app .missions-block').first()).toBeVisible({ timeout: 30000 });
    await expect.poll(() => page.evaluate(() => window.VOLT_STARMAP.links.ready())).toBe(true);
    await expect(page.locator('#missions-app a.volt-map-link')).toHaveCount(0);
    expect(await tracker.problems()).toEqual([]);
});

test('운송 계약: 계약이 나오는 지역의 천체들을 지도에 표시한다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    await gotoSection(page, '#hauling');
    const link = page.locator('#hauling-app .hauling-table tbody a.volt-map-link').first();
    await expect(link).toBeVisible({ timeout: 20000 });
    await expect(link).toHaveAttribute('data-map-link', 'mark');
    const ids = (await hrefOf(link)).match(/mark=([^&]+)/)[1].split(',');
    const members = new Set(Object.values(hauling.localities).flatMap((place) => (place.members || []).map((member) => member.id)));
    for (const id of ids) { expect(ON_MAP.has(id), id).toBe(true); expect(members.has(id), id).toBe(true); }
    const state = await follow(page, link);
    expect(state.mark).toEqual(ids);
    await expect(page.locator('#starmap-app [data-over="mark"]')).toContainText(`표시한 곳 ${ids.length}곳`);
    expect(await tracker.problems()).toEqual([]);
});

test('채광: 광물은 나오는 천체와 구역을, 장소는 그 천체나 구역을, 정제소는 그 정거장을 지도에 연다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    // 광물 → 나오는 곳 전부 (천체는 mark, 점이 아닌 구역은 area)
    const mineral = helper.minerals.find((item) => item.id === 'Ore_Gold');
    const sources = helper.locations.filter((location) => !location.unplaced && (location.groups || []).some((group) => (group.rocks || []).some((rock) => (rock.minerals || []).some((part) => part.id === mineral.id))));
    const bodies = sources.filter((location) => location.kind !== 'area' && ON_MAP.has(location.id)).map((location) => location.id);
    const areas = sources.filter((location) => location.kind === 'area' && links.areas[location.id]).map((location) => location.id);
    expect(bodies.length + areas.length).toBeGreaterThan(2);
    await gotoSection(page, `#mining?m=${mineral.id}`);
    const mineralLink = page.locator('#mining-app a.volt-map-link.mining-maplink-mineral');
    await expect(mineralLink).toBeVisible({ timeout: 20000 });
    await expect(mineralLink).toContainText(`${bodies.length + areas.length}곳`);
    const href = await hrefOf(mineralLink);
    expect((href.match(/mark=([^&]+)/)?.[1] || '').split(',').filter(Boolean).sort()).toEqual([...bodies].sort());
    expect((href.match(/area=([^&]+)/)?.[1] || '').split(',').filter(Boolean).sort()).toEqual([...areas].sort());
    const state = await follow(page, mineralLink);
    expect([...state.mark].sort()).toEqual([...bodies].sort());
    expect([...state.area].sort()).toEqual([...areas].sort());
    await expect(page.locator('#starmap-app [data-over="mark"]')).toBeVisible();

    // 장소(천체) → 그 천체
    await page.evaluate(() => { window.location.hash = '#mining?loc=Stanton1'; });
    const body = page.locator('#mining-app a.volt-map-link.mining-maplink-location');
    await expect(body).toBeVisible();
    expect(await hrefOf(body)).toBe('#starmap?focus=Stanton1&sys=stanton');
    const focused = await follow(page, body);
    expect(focused.focus).toBe('Stanton1');
    await expect(page.locator('#starmap-app .starmap-info-title')).toHaveText(S.get('Stanton1').name.ko);

    // 장소(구역) → 그 구역
    await page.evaluate(() => { window.location.hash = '#mining?loc=AaronHalo'; });
    await expect.poll(async () => hrefOf(page.locator('#mining-app a.volt-map-link.mining-maplink-location'))).toBe('#starmap?area=AaronHalo&sys=stanton');
    const area = await follow(page, page.locator('#mining-app a.volt-map-link.mining-maplink-location'));
    expect(area.area).toEqual(['AaronHalo']);
    await expect(page.locator('#starmap-app [data-over="area"]')).toContainText('아론 헤일로');

    // 위치 자료가 없는 채광 장소와 지도에 구역으로 잡히지 않은 표에는 링크가 없다.
    for (const id of ['Pyro_AkiroCluster', 'Lagrange_G']) {
        await page.evaluate((loc) => { window.location.hash = `#mining?loc=${loc}`; }, id);
        await expect(page.locator('#mining-app #mining-detail-title')).toBeVisible();
        await expect(page.locator('#mining-app a.volt-map-link.mining-maplink-location')).toHaveCount(0);
    }

    // 정제소 찾기 → 그 정거장. 게임 파일에 놓인 자리도 UEX 터미널도 없는 파이로 정거장(PYAM-FARSTAT-*)에는 지도 링크가 없다.
    await page.evaluate(() => { window.location.hash = '#mining?tab=ref'; });
    await page.locator('#mining-app .mining-ref-full > summary').click();
    const refLinks = page.locator('#mining-app .mining-ref-table a.volt-map-link.mining-maplink-ref');
    await expect(refLinks).toHaveCount(helper.refineryDesks.filter((desk) => ON_MAP.has(desk.id)).length);
    const arcL1 = page.locator('#mining-app .mining-ref-table a.mining-maplink-ref[href*="focus=RR_ARC_L1&"]');
    await expect(arcL1).toHaveCount(1);
    await expect(arcL1.locator('.volt-map-link-guess')).toHaveCount(0);
    const unplaced = helper.refineries.filter((refinery) => P.get(refinery.id)?.unplaced === 1).map((refinery) => refinery.id);
    expect(unplaced.length).toBe(12);
    expect(links.guess).toEqual({ stanton: [], pyro: [], nyx: [] });
    for (const id of unplaced) await expect(page.locator(`#mining-app .mining-ref-table a.mining-maplink-ref[href*="focus=${id}&"]`)).toHaveCount(0);
    await expect(page.locator('#mining-app .mining-ref-table .volt-map-link-guess')).toHaveCount(0);
    const ref = await follow(page, arcL1);
    expect(ref.focus).toBe('RR_ARC_L1');
    expect(await tracker.problems()).toEqual([]);
});

test('영어 화면: 링크 글자가 영어로 나오고 언어를 바꾸면 따라 바뀐다', async ({ page }) => {
    const tracker = await prepare(page, { lang: 'en' });
    await gotoSection(page, '?lang=en#mining?loc=Stanton1');
    const link = page.locator('#mining-app a.volt-map-link.mining-maplink-location');
    await expect(link).toBeVisible({ timeout: 20000 });
    await expect(link).toHaveText('Show on the map');
    await expect(link).toHaveAttribute('aria-label', 'Show Hurston on the map');
    await page.evaluate(() => window.VOLT_I18N.setLang('ko'));
    await expect(link).toHaveText('지도에서 보기');
    expect(await tracker.problems()).toEqual([]);
});

test('390px: 링크는 44px 이상이고 옆으로 넘치지 않으며, 눌러서 지도까지 간다', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'ko-KR' });
    const page = await context.newPage();
    const tracker = await prepare(page);
    for (const [hash, selector] of [['#routes?from=1&to=12', '#routes-detail .routes-detail-head a.volt-map-link'], ['#market?tab=prices&c=47', '#market-app a.market-maplink-all'],
        ['#mining?loc=Stanton1', '#mining-app a.mining-maplink-location'], ['#tours?stops=1,12,4', '#tours-app a.tours-maplink']]) {
        await gotoSection(page, hash);
        const link = page.locator(selector).first();
        await expect(link, hash).toBeVisible({ timeout: 20000 });
        const box = await link.boundingBox();
        expect(box.height, hash).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width, hash).toBeLessThanOrEqual(390);
        expect(await overflow(page), hash).toBeLessThanOrEqual(1);
    }
    const link = page.locator('#tours-app a.tours-maplink').first();
    await link.scrollIntoViewIfNeeded();
    await link.tap();
    await expect(page.locator('section#starmap')).toHaveClass(/active/);
    await expect.poll(async () => (await mapState(page)).phase, { timeout: 30000 }).toBe('ready');
    expect((await mapState(page)).route).toEqual(['RR_ARC_L1', 'Stanton3_Area18', 'RR_ARC_L4']);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await tracker.problems()).toEqual([]);
    await context.close();
});

for (const [name, access] of [['로그아웃', { loggedIn: false }], ['함대원 아님', { fleet: false }]]) {
    test(`${name}: 무역·임무·채광 화면을 열어도 지도 연결 목록을 요청하지 않는다`, async ({ page }) => {
        const tracker = await prepare(page, { access });
        for (const hash of ['#routes', '#market', '#missions', '#mining', '#hauling', '#trade-planner']) {
            await gotoSection(page, hash);
            await page.waitForTimeout(400);
        }
        expect(tracker.requests.filter((url) => url.startsWith('/data/starmap/'))).toEqual([]);
        await expect(page.locator('a.volt-map-link')).toHaveCount(0);
    });
}

test('함대원: 다른 화면은 작은 연결 목록(links.json)만 받고, 항성계 자료는 지도를 열 때 받는다', async ({ page }) => {
    const tracker = await prepare(page);
    await gotoSection(page, '#routes');
    await expect(page.locator('#routes-table tbody a.volt-map-link').first()).toBeVisible({ timeout: 20000 });
    expect([...new Set(tracker.requests.filter((url) => url.startsWith('/data/starmap/')))]).toEqual(['/data/starmap/links.json']);
    expect(tracker.requests.filter((url) => /starmap-viewer|\/assets\/vendor\/three-|\/assets\/models\/starmap\//.test(url))).toEqual([]);
    expect(await tracker.problems()).toEqual([]);
});

// ── 돌아가는 길: 지도 정보 칸 → 각 화면 ───────────────────────────────────

test('지도 → 시세·무역 경로: 고른 거래소의 터미널로 열린다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    await gotoSection(page, '#starmap?focus=Stanton3_Area18');
    const info = page.locator('#starmap-app .starmap-info');
    await expect(info.locator('.starmap-info-title')).toHaveText(S.get('Stanton3_Area18').name.ko, { timeout: 30000 });
    const terminal = S.get('Stanton3_Area18').uex[0];
    expect(terminal).toBe(12);

    await info.locator(`a.starmap-out[href="#market?t=${terminal}"]`).click();
    await expect(page.locator('section#market')).toHaveClass(/active/);
    const station = page.locator(`#market-app [data-market-station="${terminal}"]`);
    await expect(station).toBeVisible({ timeout: 20000 });
    await expect(station.locator('h3')).toHaveText(S.get('Stanton3_Area18').name.ko);
    // 그 거래소 화면에서 다시 지도로 돌아갈 수 있다 (왕복).
    expect(await hrefOf(station.locator('a.market-maplink-station'))).toBe('#starmap?focus=Stanton3_Area18&sys=stanton');

    await page.goBack();
    await expect(page.locator('section#starmap')).toHaveClass(/active/);
    await expect(info.locator('.starmap-info-title')).toHaveText(S.get('Stanton3_Area18').name.ko);
    await info.locator(`a.starmap-out[href="#routes?from=${terminal}"]`).click();
    await expect(page.locator('section#routes')).toHaveClass(/active/);
    await expect(page.locator('#routes-table tbody tr').first()).toBeVisible({ timeout: 20000 });
    // 사는 곳이 그 터미널로 정해져 있고, 보이는 경로는 모두 거기서 출발한다.
    await expect(page.locator('#routes-from')).toHaveValue(String(terminal));
    const froms = await page.locator('#routes-table tbody tr').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-route').split('-')[0]));
    expect(froms.length).toBeGreaterThan(0);
    expect(new Set(froms)).toEqual(new Set([String(terminal)]));
    expect(await tracker.problems()).toEqual([]);
});

test('지도 → 채광: 천체는 그 장소로, 구역은 그 구역으로, 정제소는 정제소 찾기로 열린다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    await gotoSection(page, '#starmap?focus=Stanton1');
    const info = page.locator('#starmap-app .starmap-info');
    await expect(info.locator('.starmap-info-title')).toHaveText(S.get('Stanton1').name.ko, { timeout: 30000 });
    await info.locator('a.starmap-out[href="#mining?loc=Stanton1"]').click();
    await expect(page.locator('section#mining')).toHaveClass(/active/);
    await expect(page.locator('#mining-app #mining-detail-title')).toContainText('허스턴', { timeout: 20000 });
    expect(await page.evaluate(() => window.VOLT_HELPER.readHash('mining').loc)).toBe('Stanton1');

    // 구역: 항성(아론 헤일로가 딸려 있다) → #mining?loc=AaronHalo
    await page.evaluate(() => { window.location.hash = '#starmap?focus=StantonStar'; });
    await expect(info.locator('.starmap-info-title')).toHaveText(S.get('StantonStar').name.ko);
    await info.locator('a.starmap-out[href="#mining?loc=AaronHalo"]').click();
    await expect(page.locator('section#mining')).toHaveClass(/active/);
    await expect(page.locator('#mining-app #mining-detail-title')).toContainText('아론 헤일로');

    // 정제소: ARC-L1 → 정제소 찾기 표에 그 정거장이 있다
    await page.evaluate(() => { window.location.hash = '#starmap?focus=RR_ARC_L1'; });
    await expect(info.locator('.starmap-info-title')).toHaveText(S.get('RR_ARC_L1').name.ko);
    await info.locator('a.starmap-out[href="#mining?ref=RR_ARC_L1&tab=ref"]').click();
    await expect(page.locator('section#mining')).toHaveClass(/active/);
    await expect(page.locator('#mining-app #mining-ref-title')).toBeVisible();
    // 넘어온 정제소가 바로 보인다: 접혀 있던 표가 펼쳐지고 그 줄이 강조된다. 다시 지도로 가는 링크도 그 줄에 있다.
    await expect(page.locator('#mining-app details.mining-ref-full')).toHaveAttribute('open', '');
    const picked = page.locator('#mining-app .mining-ref-table tr.is-picked');
    await expect(picked).toHaveCount(1);
    await expect(picked.locator('th')).toContainText('ARC-L1');
    await expect(picked.locator('a.mining-maplink-ref[href*="focus=RR_ARC_L1&"]')).toBeVisible();
    expect(await page.evaluate(() => window.VOLT_HELPER.readHash('mining').ref)).toBe('RR_ARC_L1');
    expect(await tracker.problems()).toEqual([]);
});

// 임무 자료에서 직접 센다: 그 장소에서 나오거나(지역이면 그 지역에 든 곳), 임무 장소 후보가 지도에서 그곳에 놓인 임무.
function missionsAt(place) {
    return missions.contracts.filter((c) => [...(c.at || []), ...(c.loc || [])].some((id) => id === place || id.replace(/SolarSystem$/, 'Star') === place
        || (missions.localities[id]?.members || []).some((member) => member === place || member.replace(/SolarSystem$/, 'Star') === place))
        || (c.sites || []).some((site) => siteObjects(site).includes(place))).length;
}
const shownCount = async (page) => Number(((await page.locator('#missions-app .missions-count').first().innerText()).match(/중\s*([\d,]+)개/) || [])[1]?.replace(/,/g, ''));

test('지도 → 임무: 그 장소의 임무만 걸러서 열고, 장소 조건을 풀 수 있다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    // (1) 임무가 나오는 곳: 이름 검색으로는 하나도 안 나오던 파이로 휴게소
    const place = P.get('RR_P3_L1');
    expect(place.mission).toBe(1);
    const expected = missionsAt(place.id);
    expect(expected).toBeGreaterThan(0);
    await gotoSection(page, `#starmap?focus=${place.id}`);
    const info = page.locator('#starmap-app .starmap-info');
    async function verifyPreview(id) {
        const link = info.locator('a.starmap-out[href="#missions?place=' + id + '"]');
        await link.click();
        const preview = page.locator('dialog[open]');
        await expect(preview).toContainText('이곳의 임무 ' + missionsAt(id).toLocaleString('ko-KR') + '개');
        const details = preview.getByRole('link', { name: '자세히 보기 (새 탭)', exact: true });
        const href = await details.getAttribute('href');
        await expect(details).toHaveAttribute('target', '_blank');
        await page.keyboard.press('Escape');
        await expect(link).toBeFocused();
        await gotoSection(page, new URL(href).hash);
    }
    await expect(info.locator('.starmap-info-title')).toHaveText(place.name.ko || place.name.en, { timeout: 30000 });
    await verifyPreview(place.id);
    await expect(page.locator('section#missions')).toHaveClass(/active/);
    const bar = page.locator('#missions-app [data-ms-placebar]');
    await expect(bar).toContainText(`장소: ${place.name.ko || place.name.en}`, { timeout: 30000 });
    await expect.poll(() => shownCount(page)).toBe(expected);
    // 왕복: 장소 조건 줄에서 다시 지도로
    expect(await hrefOf(bar.locator('a.volt-map-link'))).toBe(`#starmap?focus=${place.id}&sys=pyro`);
    // 장소 조건을 풀면 전체 목록으로 돌아가고 주소에서도 빠진다.
    await bar.locator('[data-ms-placeclear]').click();
    await expect(page.locator('#missions-app [data-ms-placebar]')).toHaveCount(0);
    await expect.poll(() => shownCount(page)).toBe(missions.contracts.length);
    expect(await page.evaluate(() => window.VOLT_HELPER.readHash('missions').place)).toBeUndefined();

    // (2) 임무 현장이 놓인 곳(임무가 나오는 곳은 아님)에도 링크가 있고, 그 현장을 쓰는 임무만 나온다.
    const siteOnly = stanton.objects.find((object) => object.mission !== 1 && object.pos && Object.values(stanton.sites).some((site) => (site.at || []).includes(object.id)) && missionsAt(object.id) > 0);
    expect(siteOnly, '임무 현장만 놓인 장소가 자료에 있어야 함').toBeTruthy();
    await page.evaluate((id) => { window.location.hash = `#starmap?focus=${id}`; }, siteOnly.id);
    await expect(page.locator('section#starmap')).toHaveClass(/active/);
    await expect.poll(async () => (await mapState(page)).focus).toBe(siteOnly.id);
    await verifyPreview(siteOnly.id);
    await expect(page.locator('section#missions')).toHaveClass(/active/);
    await expect(page.locator('#missions-app [data-ms-placebar]')).toBeVisible();
    await expect.poll(() => shownCount(page)).toBe(missionsAt(siteOnly.id));

    // (3) 지도에서 고른 이름 그대로: 에어리어 18은 임무 자료에 이름이 없지만, 조건 줄에는 지도와 같은 이름이 나온다.
    expect(missions.places.Stanton3_Area18).toBeUndefined();
    await page.evaluate(() => { window.location.hash = '#starmap?focus=Stanton3_Area18'; });
    await expect(info.locator('.starmap-info-title')).toHaveText(S.get('Stanton3_Area18').name.ko);
    await verifyPreview('Stanton3_Area18');
    await expect(page.locator('section#missions')).toHaveClass(/active/);
    await expect(page.locator('#missions-app [data-ms-placebar] strong')).toHaveText(`장소: ${S.get('Stanton3_Area18').name.ko}`);
    // 주소로 바로 들어와도(지도 자료를 아직 받지 않은 상태) 같은 이름이 된다.
    await page.reload();
    await expect(page.locator('section#missions')).toHaveClass(/active/, { timeout: 20000 });
    await expect(page.locator('#missions-app [data-ms-placebar] strong')).toHaveText(`장소: ${S.get('Stanton3_Area18').name.ko}`, { timeout: 30000 });
    expect(await page.evaluate(() => window.VOLT_STARMAP.debug().loaded)).toEqual(['stanton']);   // 이름을 알려고 그 항성계 자료 하나만 받았다

    // (4) 항성계 전체에서 나오는 임무: "나오는 곳"에 항성 하나를 찍는 링크를 달지 않는다.
    const systemWide = missions.contracts.find((c) => (c.at || []).length === 1 && c.at[0] === 'StantonStar' && !(c.loc || []).length);
    expect(systemWide, '항성계 전체 임무가 자료에 있어야 함').toBeTruthy();
    await page.evaluate((id) => { window.location.hash = `#missions?m=${id}`; }, systemWide.id);
    await expect(page.locator('#missions-app .missions-kv').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#missions-app a.missions-maplink-offer')).toHaveCount(0);
    await expect(page.locator('#missions-app a.volt-map-link[href*="mark=StantonStar"]')).toHaveCount(0);

    // 모르는 장소는 조용히: 조건 줄은 보이고 결과는 0개, 오류 없음.
    await page.evaluate(() => { window.location.hash = '#missions?place=No_Such_Place'; });
    await expect(page.locator('#missions-app [data-ms-placebar]')).toContainText('No_Such_Place');
    await expect.poll(() => shownCount(page)).toBe(0);
    expect(await tracker.problems()).toEqual([]);
});

// ── 무역플래너 (커뮤니티 화면이라 함대원에게만 링크가 붙는다) ───────────────

async function plannerTrip(page, access) {
    const tracker = await prepare(page, { access });
    const now = Math.floor(Date.now() / 1000);
    // 플래너는 UEX 가격 줄을 그대로 쓴다. 터미널 1 = ARC-L1, 12 = Area18 (지도에 있는 실제 번호).
    const rows = [
        { id_commodity: 2, commodity_name: 'Iron', id_terminal: 1, terminal_name: 'ARC-L1', price_buy: 100, price_sell: 0, scu_buy: 12, date_modified: now },
        { id_commodity: 2, commodity_name: 'Iron', id_terminal: 12, terminal_name: 'Area 18', price_buy: 0, price_sell: 180, scu_sell: 9, date_modified: now },
    ];
    await page.route('**/api/me/preferences', (route) => route.fulfill({ json: { preferences: { favorites: [], planner: {} } } }));
    await page.route('**/api/uex/**', (route) => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname === '/api/uex/commodities') data = [{ id: 2, name: 'Iron', is_visible: 1, is_available_live: 1 }];
        if (/\/commodities\/\d+\/prices/.test(url.pathname)) data = rows;
        return route.fulfill({ json: { status: 'ok', data } });
    });
    await gotoSection(page, '#trade-planner');
    await page.locator('#logistics-ship-search').fill('titan');
    await expect(page.locator('#logistics-ship-results [data-planner-ship-id="avenger-titan"]')).toBeVisible({ timeout: 20000 });
    await page.locator('#logistics-ship-results [data-planner-ship-id="avenger-titan"]').click();
    await page.locator('#uex-commodity-search').fill('Iron');
    await page.locator('#uex-commodity-results [data-commodity-id="2"]').click();
    await page.locator('#uex-refresh').click();
    await expect(page.locator('#journey-trade-plan')).toContainText('Area 18');
    return tracker;
}

test('무역플래너: 함대원에게는 이번 운송 계획에 사는 곳 → 파는 곳 지도 링크가 붙는다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await plannerTrip(page, { fleet: true });
    const link = page.locator('#journey-trade-plan a.volt-map-link.journey-maplink');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('지도에서 보기');
    expect(await hrefOf(link)).toBe('#starmap?route=RR_ARC_L1,Stanton3_Area18&sys=stanton');
    const state = await follow(page, link);
    expect(state.route).toEqual(['RR_ARC_L1', 'Stanton3_Area18']);
    expect(await tracker.problems()).toEqual([]);
});

test('무역플래너: 함대원이 아닌 커뮤니티 멤버에게는 링크가 없고 지도 자료도 요청하지 않는다', async ({ page }) => {
    const tracker = await plannerTrip(page, { fleet: false });
    await expect(page.locator('#journey-trade-plan .journey-links button').first()).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.locator('#journey-trade-plan a.volt-map-link')).toHaveCount(0);
    expect(tracker.requests.filter((url) => url.startsWith('/data/starmap/'))).toEqual([]);
});
