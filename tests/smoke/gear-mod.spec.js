const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');
const { mockPrivateModelsWhenAbsent } = require('./gear-model-fixture');
test.beforeEach(async ({ page }) => { await mockPrivateModelsWhenAbsent(page); });

// 개인 장비 › 개조 화면.
// 3D 테스트는 소프트웨어 WebGL(SwiftShader)이 필요하다. 이 파일만 그 실행 옵션으로 브라우저를 띄운다.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
// 이 파일의 테스트는 한 작업자에서 차례로 돈다. 소프트웨어 WebGL 브라우저 여러 개가 한꺼번에 뜨면(이 파일만 8개 동시 실행)
// 기계가 느려져 첫 화면조차 30초 안에 못 뜬 적이 있다. 차례로 돌리면 전체 30초 남짓이다.
test.describe.configure({ mode: 'default' });

const P4AR = 'behr_rifle_ballistic_01';
const PHONE = { width: 375, height: 800 };
const DESKTOP = { width: 1440, height: 900 };
// 사이트 _headers 와 같은 정책 (http 로컬이라 upgrade-insecure-requests 만 뺀다).
const STRICT_CSP = ["default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self' https://forms.gle", "img-src 'self' data: https:",
    "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self'", "connect-src 'self' https://cloudflareinsights.com", "font-src 'self' data:", "object-src 'none'"].join('; ');

async function openMod(page, { hash = '#gear', viewport = PHONE, csp = false } = {}) {
    await page.setViewportSize(viewport);
    await mockApi(page, { fleet: true });
    await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {}, byName: [] } }));
    if (csp) {
        await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (event) => window.__csp.push(`${event.violatedDirective} ${event.blockedURI}`)); });
        await page.route('**/*', async (route) => {
            if (route.request().resourceType() !== 'document') return route.fallback();
            const response = await route.fetch();
            return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': STRICT_CSP } });
        });
    }
    await gotoSection(page, hash);
    if (!hash.includes('?')) await page.locator('[data-gear-view="mod"]').click();
    await expect(page.locator('#gear-mod-weapon')).toBeVisible();
}
const slotRow = (page, name) => page.locator(`[data-gear-mod-slot="${name}"]`);
const changeRow = (page, name) => page.locator('.gear-mod-table tbody tr').filter({ hasText: name });
const axeSerious = async (page) => (await new AxeBuilder({ page }).include('#gear').analyze()).violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length}`);

// 스크린샷 두 장을 페이지 안에서 풀어 본다: 색이 몇 가지인지, 두 장이 얼마나 다른지. (data: 그림은 CSP 가 허용한다)
async function comparePictures(page, first, second) {
    return page.evaluate(async ([a, b]) => {
        const read = async (base64) => {
            const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const one = await read(a); const two = b ? await read(b) : null;
        const colours = new Set(); let different = 0;
        for (let i = 0; i < one.length; i += 4) {
            colours.add((one[i] >> 3) << 10 | (one[i + 1] >> 3) << 5 | (one[i + 2] >> 3));
            if (two && two.length === one.length && (Math.abs(one[i] - two[i]) > 24 || Math.abs(one[i + 1] - two[i + 1]) > 24 || Math.abs(one[i + 2] - two[i + 2]) > 24)) different += 1;
        }
        return { colours: colours.size, different, sameSize: !two || two.length === one.length };
    }, [first.toString('base64'), second ? second.toString('base64') : null]);
}

test('개조: 휴대폰 너비에서는 그림으로 보여 주고, 자리·부품을 골라 달면 수치가 바뀌며 새로 고쳐도 남는다', async ({ page }) => {
    // 단계가 많고(고르기 → 달기 → 새로 고침 → 접근성 검사) 혼자 돌려도 8초쯤 걸린다. 여러 테스트가 같이 돌 때 기본 30초를 넘긴 적이 있다.
    test.setTimeout(90000);
    const errors = trackConsoleErrors(page);
    const heavy = [];
    page.on('request', (request) => { if (/gear-viewer\.js|\/assets\/vendor\/three-|\/assets\/models\//.test(request.url())) heavy.push(request.url()); });
    await openMod(page);
    await expect(page.locator('.gear-hint')).toContainText('개조할 무기를 고르면');
    await page.locator('#gear-mod-weapon').selectOption(P4AR);
    await expect(page.locator('#gear-mod-title')).toContainText('P4-AR 소총');
    // 3D 대신 그림 + 이유 한 문장. 캔버스도, 3D 파일 요청도 없다.
    await expect(page.locator('.gear-mod-why')).toHaveText('화면이 작거나 터치 기기에서는 3D 대신 그림으로 보여 줍니다.');
    await expect(page.locator('.gear-mod-stage img')).toBeVisible();
    await expect(page.locator('#gear canvas')).toHaveCount(0);
    // 자리 이름은 한국어 패치 표기.
    await expect(slotRow(page, 'optics_attach')).toContainText('조준경 부착물');
    await expect(slotRow(page, 'optics_attach')).toContainText('S1~S2');
    await expect(slotRow(page, 'barrel_attach')).toContainText('총열 부착물');
    await expect(slotRow(page, 'underbarrel_attach')).toContainText('총열하부 부착물');
    await expect(page.locator('.gear-mod-slot.is-fixed')).toContainText('무기 탄창');
    await expect(page.locator('.gear-mod-slot.is-fixed')).toContainText('P4-AR 탄창');
    await expect(page.locator('.gear-mod-stats')).toContainText('장착한 부착물이 없습니다.');
    // 총열 자리를 고르면 그 자리에 맞는 부품만 나온다 (조준경은 안 나온다).
    await slotRow(page, 'barrel_attach').click();
    await expect(slotRow(page, 'barrel_attach')).toBeFocused();
    await expect(slotRow(page, 'barrel_attach')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#gear-mod-parts-title')).toContainText('총열 부착물 고르기');
    await expect(page.locator('[data-gear-mod-part^="arma_barrel_"]').first()).toBeVisible();
    await expect(page.locator('[data-gear-mod-part*="optics"]')).toHaveCount(0);
    // 소음기를 단다 → 자리와 수치 표가 바뀐다.
    const part = page.locator('[data-gear-mod-part="arma_barrel_supp_s2"]');
    await part.click();
    await expect(part).toBeFocused();
    await expect(part).toHaveAttribute('aria-pressed', 'true');
    await expect(slotRow(page, 'barrel_attach')).toContainText('소음기');
    await expect(changeRow(page, '피해량')).toContainText('%');
    await expect(changeRow(page, '피해량')).toContainText('소음기');
    await expect(page.locator('.gear-mod-table')).not.toContainText('→');
    await expect(changeRow(page, '가청 범위')).toContainText('−');
    await expect(page.locator('.gear-mod-stats')).toContainText('최종 성능을 추정하지 않습니다');
    await expect(page.locator('.gear-mod-desc')).toContainText('게임 안 설명문');
    await expect(page).toHaveURL(/#gear\?mod=behr_rifle_ballistic_01&optics=-&barrel=arma_barrel_supp_s2&underbarrel=-$/);
    // 떼기 → 원래대로.
    await page.locator('[data-gear-mod-clear="barrel_attach"]').click();
    await expect(slotRow(page, 'barrel_attach')).toContainText('비어 있음');
    await expect(page.locator('.gear-mod-table')).toHaveCount(0);
    await expect(page.locator('[data-gear-mod-clear="barrel_attach"]')).toBeDisabled();
    // 다시 달고 조준경도 단 뒤 새로 고침 → 주소에서 되살아난다.
    await part.click();
    await slotRow(page, 'optics_attach').click();
    await page.locator('[data-gear-mod-part="behr_optics_holo_x1_s1"]').click();
    await expect(changeRow(page, '조준 시간')).toBeVisible();
    await page.reload();
    await page.waitForSelector('#loading-splash', { state: 'hidden' });
    await expect(slotRow(page, 'barrel_attach')).toContainText('소음기');
    await expect(slotRow(page, 'optics_attach')).not.toContainText('비어 있음');
    // 주소 없이 들어와도 이 브라우저에 저장된 조합이 열린다.
    await gotoSection(page, '#gear');
    await page.locator('[data-gear-view="mod"]').click();
    await expect(page.locator('#gear-mod-weapon')).toHaveValue(P4AR);
    await expect(slotRow(page, 'barrel_attach')).toContainText('소음기');
    const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('volt.gear.mod.v1')));
    expect(saved.builds[P4AR].barrel_attach).toBe('arma_barrel_supp_s2');
    // 모두 떼기 / 게임 기본 상태.
    await page.locator('[data-gear-mod-strip]').click();
    await expect(page.locator('.gear-mod-stats')).toContainText('장착한 부착물이 없습니다.');
    await page.locator('[data-gear-mod-defaults]').click();
    await expect(page.locator('[data-gear-mod-defaults]')).toBeFocused();
    // 다른 화면으로 가면 주소의 조합 표시가 사라진다.
    await page.locator('[data-gear-view="weapon"]').click();
    await expect(page).toHaveURL(/#gear$/);
    // 가로로 넘치지 않는다.
    await page.locator('[data-gear-view="mod"]').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(await axeSerious(page)).toEqual([]);
    expect(heavy).toEqual([]);
    expect(errors).toEqual([]);
});

test('개조: 무기 상세의 「이 무기 개조하기」로 들어가고, 기본 조준경이 달린 저격소총은 게임 기본 상태로 열린다', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await mockApi(page, { fleet: true });
    await page.route('**/api/uex/loadout-prices**', (route) => route.fulfill({ json: { status: 'ok', data: {}, byName: [] } }));
    await gotoSection(page, '#gear');
    await page.locator('#gear-search').fill('P4-AR');
    await page.locator('.gear-list [data-gear-pick]').first().click();
    await page.locator('.gear-detail [data-gear-mod]').click();
    await expect(page.locator('[data-gear-view="mod"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#gear-mod-title')).toBeFocused();
    await expect(page.locator('#gear-mod-weapon')).toHaveValue(P4AR);
    await page.locator('#gear-mod-weapon').selectOption('gmni_sniper_ballistic_01');
    await expect(slotRow(page, 'optics_attach')).not.toContainText('비어 있음');
    await expect(changeRow(page, '배율')).not.toHaveCount(0);
    // 영어 화면.
    await page.evaluate(() => window.VOLT_I18N.setLang('en'));
    await expect(page.locator('[data-gear-view="mod"]')).toHaveText('Modding');
    await expect(slotRow(page, 'optics_attach')).toContainText('Optics Attachment');
    await expect(page.locator('.gear-sources')).toContainText('© Cloud Imperium Games');
    await expect(page.locator('.gear-sources')).toContainText('unofficial fan site');
});

test('개조: 넓은 화면에서는 3D 모형이 뜨고, 부품을 바꾸면 그림이 바뀐다 (콘솔 오류·CSP 위반 없음)', async ({ page }) => {
    test.setTimeout(120000);
    const errors = trackConsoleErrors(page);
    const failed = [];
    page.on('requestfailed', (request) => failed.push(request.url()));
    page.on('response', (response) => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    await openMod(page, { viewport: DESKTOP, csp: true, hash: `#gear?mod=${P4AR}` });
    const stage = page.locator('.gear-mod-stage');
    await expect(stage).toHaveAttribute('data-gear-mod-3d', 'ready', { timeout: 60000 });
    const canvas = page.locator('canvas.gear-mod-canvas');
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toHaveAttribute('aria-label', 'P4-AR 소총 3D 모형');
    await expect(canvas).toHaveAttribute('role', 'img');
    await expect(page.locator('.gear-mod-why')).toHaveCount(0);
    // 빈 그림이 아니다.
    let before;
    await expect.poll(async () => { before = await canvas.screenshot(); return (await comparePictures(page, before)).colours; }, { timeout: 20000 }).toBeGreaterThan(40);
    // 조준경을 달면 그림이 바뀐다. 캔버스는 화면을 다시 그려도 같은 것이 남는다.
    await canvas.evaluate((node) => { node.dataset.testKeep = '1'; });
    await page.locator('[data-gear-mod-part="behr_optics_tsco_x4_s2"]').click();
    await expect(slotRow(page, 'optics_attach')).not.toContainText('비어 있음');
    await expect(canvas).toHaveAttribute('data-test-keep', '1');
    let after;
    await expect.poll(async () => { after = await canvas.screenshot(); return (await comparePictures(page, before, after)).different; }, { timeout: 30000 }).toBeGreaterThan(150);
    // 떼면 다시 바뀐다.
    await page.locator('[data-gear-mod-clear="optics_attach"]').click();
    await expect.poll(async () => (await comparePictures(page, after, await canvas.screenshot())).different, { timeout: 30000 }).toBeGreaterThan(150);
    // 보는 방향 단추.
    await page.locator('[data-gear-mod-view="side"]').click();
    await expect(page.locator('[data-gear-mod-view="side"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-gear-mod-view="side"]')).toBeFocused();
    // 저작권·출처 줄이 있고 모형 내려받기 단추는 없다.
    await expect(page.locator('.gear-sources')).toContainText('© Cloud Imperium Games');
    await expect(page.locator('.gear-sources')).toContainText('게임 빌드 4.');
    await expect(page.locator('#gear a[download], #gear a[href$=".glb"]')).toHaveCount(0);
    expect(await axeSerious(page)).toEqual([]);
    // 다른 화면으로 가면 3D 를 놓아 준다. 돌아오면 다시 뜬다.
    await page.locator('[data-gear-view="weapon"]').click();
    await expect(page.locator('#gear canvas')).toHaveCount(0);
    await page.locator('[data-gear-view="mod"]').click();
    await expect(stage).toHaveAttribute('data-gear-mod-3d', 'ready', { timeout: 60000 });
    // 다른 섹션으로 가도 놓아 준다.
    await page.evaluate(() => window.VOLT_NAV.showSection('faq'));
    await expect(page.locator('canvas.gear-mod-canvas')).toHaveCount(0);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
});

test('개조: 3D 모형 목록이 없거나 모형이 없는 무기는 그림과 이유 한 문장으로 바뀐다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const viewer = [];
    page.on('request', (request) => { if (/gear-viewer\.js/.test(request.url())) viewer.push(request.url()); });
    // 모형이 없는 무기 (models.json 의 ok:false).
    await openMod(page, { viewport: DESKTOP, hash: '#gear?mod=lbco_pistol_energy_cen01' });
    await expect(page.locator('.gear-mod-why')).toHaveText('이 무기는 3D 모형이 준비되지 않아 그림으로 보여 줍니다.');
    await expect(page.locator('.gear-mod-slots')).toBeVisible();
    await expect(page.locator('.gear-mod-stats')).toBeVisible();
    await expect(page.locator('#gear canvas')).toHaveCount(0);
    expect(viewer).toEqual([]);
    expect(errors).toEqual([]);
});

test('개조: models.json 을 받지 못해도 자리·부품·수치는 그대로 쓸 수 있다', async ({ page }) => {
    await page.route('**/data/gear/models.json', (route) => route.fulfill({ status: 404, body: 'not found' }));
    await openMod(page, { viewport: DESKTOP, hash: `#gear?mod=${P4AR}&barrel=arma_barrel_supp_s2` });
    await expect(page.locator('.gear-mod-why')).toHaveText('3D 모형 목록을 받지 못해 그림으로 보여 줍니다.');
    await expect(page.locator('.gear-mod-stage img')).toBeVisible();
    await expect(slotRow(page, 'barrel_attach')).toContainText('소음기');
    await expect(changeRow(page, '피해량')).toBeVisible();
    await expect(page.locator('#gear canvas')).toHaveCount(0);
});

test('개조: 3D 를 시작하지 못하면(모형 파일 오류) 그림으로 바뀌고 화면은 계속 동작한다', async ({ page }) => {
    await page.route('**/assets/models/gear/weapons/**/manifest.json*', (route) => route.fulfill({ status: 500, body: 'broken' }));
    await openMod(page, { viewport: DESKTOP, hash: `#gear?mod=${P4AR}` });
    await expect(page.locator('.gear-mod-why')).toHaveText('3D 모형을 불러오지 못해 그림으로 보여 줍니다.', { timeout: 30000 });
    await expect(page.locator('#gear canvas')).toHaveCount(0);
    await expect(page.locator('[data-gear-mod-retry3d]')).toHaveText('3D 다시 불러오기');
    await slotRow(page, 'barrel_attach').click();
    await page.locator('[data-gear-mod-part="arma_barrel_supp_s2"]').click();
    await expect(changeRow(page, '피해량')).toBeVisible();
    // 다시 불러오기: 이번에는 파일이 오므로 3D 가 뜬다.
    await page.unroute('**/assets/models/gear/weapons/**/manifest.json*');
    await page.locator('[data-gear-mod-retry3d]').click();
    await expect(page.locator('[data-gear-mod-3d="ready"]')).toBeVisible({ timeout: 60000 });
});

test('개조: 자료와 주소에 든 문자열은 글자 그대로만 나온다 (XSS)', async ({ page }) => {
    const evil = '<img src=x onerror="window.__xss=1">';
    await page.route('**/data/gear/attachments.json', async (route) => {
        const response = await route.fetch(); const data = await response.json();
        const port = data.weapons[P4AR].ports.find((item) => item.name === 'barrel_attach');
        port.label = { en: evil, ko: `${evil}자리` };
        const part = data.attachments.arma_barrel_supp_s2;
        part.name = { en: evil, ko: `${evil}이름` }; part.type = { en: evil, ko: evil }; part.mfr = evil; part.mfrKo = evil; part.desc = { en: [evil], ko: [evil] };
        data.statFields.damage.label = { en: evil, ko: `${evil}피해` };
        port.compatible.push('"><script>window.__xss=2</script>');
        data.attachments['"><script>window.__xss=2</script>'] = { ...part, name: { en: 'odd', ko: 'odd' } };
        return route.fulfill({ response, json: data });
    });
    // 주소의 값: 모르는 무기·부품·이상한 글자는 버린다.
    await openMod(page, { hash: `#gear?mod=${P4AR}&barrel=arma_barrel_supp_s2&optics=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&underbarrel=no_such_part` });
    await expect(slotRow(page, 'barrel_attach')).toContainText(`${evil}이름`);
    await expect(slotRow(page, 'barrel_attach')).toContainText(`${evil}자리`);
    await expect(slotRow(page, 'optics_attach')).toContainText('비어 있음');
    await expect(slotRow(page, 'underbarrel_attach')).toContainText('비어 있음');
    await slotRow(page, 'barrel_attach').click();
    await expect(page.locator('.gear-mod-desc')).toContainText(evil);
    await expect(changeRow(page, `${evil}피해`)).toBeVisible();
    await page.locator('.gear-mod-partlist button').last().click();
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(page.locator('#gear img[src="x"], #gear script')).toHaveCount(0);
    // 없는 무기 주소는 무기 고르기 화면으로 연다.
    await gotoSection(page, '#gear?mod=%3Cscript%3E');
    await expect(page.locator('#gear-app')).toBeVisible();
    await gotoSection(page, '#gear?mod=no_such_weapon');
    await expect(page.locator('.gear-hint')).toContainText('개조할 무기를 고르면');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('개조: 받은 주소를 열어도 저장해 둔 내 조합은 지워지지 않고, 부품을 바꾸면 그때 저장된다', async ({ page }) => {
    await page.addInitScript((id) => {
        if (!window.localStorage.getItem('volt.gear.mod.v1')) window.localStorage.setItem('volt.gear.mod.v1', JSON.stringify({ weapon: id, builds: { [id]: { optics_attach: null, barrel_attach: 'arma_barrel_supp_s2', underbarrel_attach: null } } }));
    }, P4AR);
    await openMod(page, { hash: `#gear?mod=${P4AR}&optics=behr_optics_holo_x1_s1&barrel=-&underbarrel=-` });
    // 화면은 받은 조합을 보여 준다.
    await expect(slotRow(page, 'optics_attach')).not.toContainText('비어 있음');
    await expect(slotRow(page, 'barrel_attach')).toContainText('비어 있음');
    await expect(page.locator('.gear-mod-notice')).toContainText('받은 주소의 조합');
    // 저장소의 내 조합은 그대로다.
    const kept = await page.evaluate(() => JSON.parse(window.localStorage.getItem('volt.gear.mod.v1')));
    expect(kept.builds[P4AR].barrel_attach).toBe('arma_barrel_supp_s2');
    expect(kept.builds[P4AR].optics_attach).toBeNull();
    // 부품을 바꾸면 지금 보이는 조합이 내 조합이 된다.
    await slotRow(page, 'barrel_attach').click();
    await page.locator('[data-gear-mod-part="arma_barrel_supp_s2"]').click();
    const adopted = await page.evaluate(() => JSON.parse(window.localStorage.getItem('volt.gear.mod.v1')));
    expect(adopted.builds[P4AR].optics_attach).toBe('behr_optics_holo_x1_s1');
    expect(adopted.builds[P4AR].barrel_attach).toBe('arma_barrel_supp_s2');
});

test('개조: 3D가 준비되어 화면을 다시 그려도 키보드 포커스가 같은 단추에 남고, 그림 위 휠은 누르기 전에는 페이지를 내린다', async ({ page }) => {
    await page.route('**/assets/models/**/*.glb*', async (route) => { await new Promise((resolve) => setTimeout(resolve, 1200)); return route.fallback(); });
    await openMod(page, { hash: `#gear?mod=${P4AR}`, viewport: DESKTOP });
    await slotRow(page, 'barrel_attach').focus();
    await expect(page.locator('[data-gear-mod-3d="ready"]')).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-gear-mod-slot'))).toBe('barrel_attach');
    // 모형 주소에는 판 표시(?v=)가 붙는다: 다시 내보낸 뒤 옛 파일과 섞이지 않게.
    const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/assets/models/')));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((name) => !/\?v=[\w.-]+$/.test(name))).toEqual([]);
    // 휠: 그림을 누르기 전에는 페이지가 내려간다.
    const canvas = page.locator('canvas.gear-mod-canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 200));
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
});
