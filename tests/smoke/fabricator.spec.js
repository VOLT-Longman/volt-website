const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockApi, gotoSection } = require('./helpers');

// 제작 설계도 (#fabricator) — js/fabricator.js. 실제 data/crafting/blueprints.json 과 data/contracts/missions.json 을 쓴다.
// 가격(UEX)은 쓰지 않는 화면이라 /api/uex 는 mockApi 의 빈 응답이면 된다.

const STRICT_CSP = [
    "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self' https://forms.gle",
    "img-src 'self' data: https:", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com", "font-src 'self' data:", "object-src 'none'",
].join('; ');

async function open(page, hash = '#fabricator', lang = 'ko') {
    const problems = [];
    const requests = [];
    await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': STRICT_CSP } });
    });
    await mockApi(page);
    await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => window.__cspViolations.push(`${event.violatedDirective} <- ${event.blockedURI || 'inline'}`));
    });
    page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
    page.on('pageerror', (error) => problems.push(String(error)));
    page.on('response', (response) => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
    page.on('request', (request) => requests.push(request.url()));
    await gotoSection(page, `?lang=${lang}${hash}`);
    await expect(page.locator('#fabricator-app .fab-tabs')).toBeVisible();
    return {
        requests,
        async problems() {
            return [...problems, ...(await page.evaluate(() => window.__cspViolations || []))];
        },
    };
}

async function noSidewaysScroll(page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, '가로 스크롤이 없어야 함').toBeLessThanOrEqual(1);
}

const app = (page) => page.locator('#fabricator-app');

test('설계도 찾기: 검색 · 분류 · 얻는 방법 · 재료 포함/제외', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await open(page);
    await expect(app(page).locator('.fab-count')).toHaveText('1,634개 중 60개 표시');
    await expect(app(page).locator('.fab-source')).toContainText('게임 버전 4.10.200.58746');

    // 처음부터 가진 설계도 8개
    await app(page).locator('[data-act="own"][data-id="default"]').click();
    await expect(app(page).locator('.fab-count')).toHaveText('8개');
    await expect(page).toHaveURL(/#fabricator\?own=default$/);
    await app(page).locator('[data-act="own"][data-id="default"]').click();

    // 큰 분류 → 종류 → 크기
    await app(page).locator('[data-act="cat"][data-id="shipComponent"]').click();
    await expect(app(page).locator('.fab-count')).toHaveText('381개 중 60개 표시');
    await app(page).locator('[data-act="sub"][data-id="Shield"]').click();
    await expect(app(page).locator('.fab-count')).toHaveText('62개 중 60개 표시');
    await expect(app(page).locator('[data-act="sub"][data-id="Shield"]')).toHaveAttribute('aria-pressed', 'true');
    await app(page).locator('[data-act="more"]').click();
    await expect(app(page).locator('.fab-list > li')).toHaveCount(62);
    await app(page).locator('[data-act="clear"]').click();
    await expect(app(page).locator('.fab-count')).toHaveText('1,634개 중 60개 표시');

    // 재료 칩: 포함 → 제외 → 상관없음
    await app(page).locator('.fab-matfilter summary').click();
    const carinite = app(page).locator('[data-act="mat"][data-id="Carinite"]');
    await carinite.click();
    await expect(app(page).locator('.fab-count')).toHaveText('8개');
    await expect(app(page).locator('[data-act="mat"][data-id="Carinite"]')).toHaveAttribute('aria-label', '카리나이트: 포함');
    await expect(page).toHaveURL(/#fabricator\?mat=Carinite$/);
    await app(page).locator('[data-act="mat"][data-id="Carinite"]').click();
    await expect(app(page).locator('[data-act="mat"][data-id="Carinite"]')).toHaveAttribute('aria-label', '카리나이트: 제외');
    await expect(app(page).locator('.fab-count')).toHaveText('1,626개 중 60개 표시');
    await expect(page).toHaveURL(/#fabricator\?mat=-Carinite$/);
    await app(page).locator('[data-act="mat"][data-id="Carinite"]').click();
    await expect(app(page).locator('.fab-count')).toHaveText('1,634개 중 60개 표시');

    // 검색: 글자를 치는 동안 입력 칸이 그대로 남는다
    const search = app(page).locator('#fab-q');
    await search.pressSequentially('S-38 권총');
    await expect(search).toBeFocused();
    await expect(app(page).locator('.fab-list > li')).toHaveCount(3);
    const row = app(page).locator('.fab-list > li').filter({ has: page.locator('[data-act="bp"][data-id="BP_CRAFT_behr_pistol_ballistic_01"]') });
    await expect(row.locator('.fab-rowname')).toHaveText('S-38 권총');
    await expect(row.locator('.fab-tag')).toHaveText('처음부터 가진 설계도');
    // 검색어와 이름이 똑같은 설계도가 맨 앞에 온다
    await expect(app(page).locator('.fab-list > li').first().locator('.fab-rowname')).toHaveText('S-38 권총');
    // 줄의 ＋ 는 화면을 다시 그리지 않고 탭 숫자와 안내만 바꾼다
    await row.locator('[data-act="add"]').click();
    await expect(app(page).locator('[data-act="tab"][data-id="cart"] .fab-badge')).toHaveText('1');
    await expect(app(page).locator('.fab-live')).toContainText('모을 재료 목록에 담았습니다: S-38 권총 (지금 1개)');
    await expect(row.locator('[data-act="add"]')).toBeFocused();
    await noSidewaysScroll(page);
    expect(await tracker.problems()).toEqual([]);
});

test('설계도 상세: 칸별 재료 · 단위 · 최소 품질 · 품질에 따른 값 · 제작 시간', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await open(page, '#fabricator?bp=BP_CRAFT_behr_pistol_ballistic_01');
    const detail = app(page).locator('.fab-detail');
    await expect(detail.locator('h3')).toHaveText('S-38 권총');
    await expect(detail.locator('.fab-facts')).toContainText('1분 30초');
    await expect(detail.locator('.fab-headside')).toContainText('처음부터 가진 설계도');
    await expect(detail).toContainText('처음부터 가지고 있는 설계도입니다.');

    const slots = detail.locator('.fab-slot');
    await expect(slots).toHaveCount(3);
    await expect(slots.nth(0).locator('h5')).toHaveText('프레임');
    await expect(slots.nth(0).locator('.fab-optionmain')).toContainText('알루미늄');
    await expect(slots.nth(0).locator('.fab-amount')).toHaveText('0.02 SCU');
    await expect(slots.nth(0).locator('.fab-optionmain')).toContainText('최소 품질 0');
    await expect(slots.nth(0).locator('.fab-optionsrc a')).toHaveAttribute('href', '#mining?m=Ore_Aluminum');

    // 게임 기본 품질 500 → 1, 품질 1000 → 0.8 (게임 파일 값 그대로)
    const recoil = slots.nth(0).locator('.fab-effects li').first();
    await expect(recoil.locator('.fab-stat')).toHaveText('반동 일관성');
    await expect(recoil.locator('.fab-range')).toHaveText('0~1,000: 1.2 → 0.8');
    await expect(recoil.locator('.fab-modval')).toHaveText('품질 500일 때 1');
    await detail.locator('#fab-quality').fill('1000');
    await expect(recoil.locator('.fab-modval')).toHaveText('품질 1,000일 때 0.8');
    await expect(detail.locator('#fab-quality-out')).toHaveText('1,000');
    await detail.locator('#fab-quality').focus();
    await page.keyboard.press('Home');
    await expect(recoil.locator('.fab-modval')).toHaveText('품질 0일 때 1.2');
    await expect(detail).toContainText('우리의 해석입니다');
    // 품질은 주소에 남아서 새로 열어도 그대로다 (기본 품질이면 주소에 적지 않는다)
    await expect(page).toHaveURL(/#fabricator\?bp=BP_CRAFT_behr_pistol_ballistic_01&ql=0$/);
    await page.goto('/?lang=ko#fabricator?bp=BP_CRAFT_behr_pistol_ballistic_01&ql=750');
    await expect(detail.locator('#fab-quality')).toHaveValue('750');
    await expect(recoil.locator('.fab-modval')).toHaveText('품질 750일 때 0.9');
    await page.goto('/?lang=ko#fabricator?bp=BP_CRAFT_behr_pistol_ballistic_01&ql=abc');
    await expect(detail.locator('#fab-quality')).toHaveValue('500');
    expect(await tracker.problems()).toEqual([]);
});

test('낱개 재료 · 얻는 곳 없는 재료 · 골라 채우는 칸은 그대로 알려 준다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '#fabricator?bp=BP_CRAFT_volt_lmg_energy_01');
    const detail = app(page).locator('.fab-detail');
    await expect(detail.locator('h3')).toHaveText('프레넬 에너지 LMG');
    const janalite = detail.locator('.fab-slot').nth(2);
    await expect(janalite.locator('.fab-amount')).toHaveText('1개');
    await expect(janalite.locator('.fab-optionsrc')).toContainText('분해해도 돌려받지 못함');

    // 3칸 중 2칸만 채우는 설계도
    await page.goto('/?lang=ko#fabricator?bp=BP_CRAFT_thp_light_legs_01_01_01');
    await expect(detail.locator('h3')).toHaveText('아즈탈란 레그');
    await expect(detail.locator('.fab-choose')).toContainText('2칸만 채우면 됩니다');
    // 게임 파일 값 9 → 1.1 은 그대로 보여 주되, 다른 값들과 크게 다르다고 알려 준다
    const oddSlot = detail.locator('.fab-slot').first();
    await expect(oddSlot.locator('.fab-range')).toHaveText('0~1,000: 9 → 1.1');
    await expect(oddSlot.locator('.fab-effects .fab-unknown')).toContainText('게임 파일에 잘못 적힌 값일 수 있습니다');
    await expect(detail.locator('.fab-effects .fab-unknown')).toHaveCount(1);

    // 만들어지는 물건이 없는 설계도는 물건 이름을 지어내지 않는다
    await page.goto('/?lang=ko#fabricator?bp=BP_CRAFT_COOL_S04_CNOU_Pioneer');
    await expect(detail.locator('h3')).toHaveText('BP_CRAFT_COOL_S04_CNOU_Pioneer');
    await expect(detail).toContainText('이 설계도로 만들어지는 물건이 게임 자료에 없습니다.');
    // 값 범위가 없는 칸은 같은 말을 두 번 적지 않는다
    const texts = await detail.locator('.fab-effects li').allTextContents();
    expect(texts.filter((text) => (text.match(/값 범위가 게임 자료에 없음/g) || []).length > 1)).toEqual([]);

    // 재료 표: 캐는 곳이 없는 재료는 없다고 적는다
    await app(page).locator('[data-act="tab"][data-id="mats"]').click();
    const rows = app(page).locator('.fab-table tbody tr');
    await expect(rows).toHaveCount(37);
    const carinite = rows.filter({ hasText: '카리나이트' });
    await expect(carinite).toContainText('얻는 곳이 우리 자료에 없음');
    await expect(carinite).toContainText('낱개');
    await carinite.locator('[data-act="mat-show"]').click();
    await expect(page).toHaveURL(/#fabricator\?mat=Carinite$/);
    await expect(app(page).locator('.fab-count')).toHaveText('8개');
});

test('이 설계도를 주는 임무: 누를 때만 임무 자료를 받고 임무 찾기로 이어진다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await open(page, '#fabricator?bp=BP_CRAFT_volt_lmg_energy_01');
    const detail = app(page).locator('.fab-detail');
    await expect(detail.locator('.fab-headside')).toContainText('임무 · 보상으로 얻음');
    await expect(detail.locator('.fab-poolrefs')).toContainText('BP_MISSIONREWARD_ASD2A');
    expect(tracker.requests.some((url) => url.includes('/data/contracts/missions.json'))).toBe(false);

    await detail.locator('[data-act="missions"]').click();
    const missions = detail.locator('.fab-missionlist li');
    await expect(missions.first()).toBeVisible({ timeout: 20000 });
    expect(tracker.requests.filter((url) => url.includes('/data/contracts/missions.json'))).toHaveLength(1);
    await expect(missions.first().locator('a')).toHaveAttribute('href', /^#missions\?m=[0-9a-f-]{36}$/);
    await expect(missions.first()).toContainText('묶음을 받을 확률 값');
    await expect(detail.locator('.fab-missions')).toContainText('게임 자료에 없습니다');

    // 게임 내부 낱말(InProgress)을 그대로 보여 주지 않는다
    await page.goto('/?lang=ko#fabricator?pool=BP_REWARD_CollectorMaterial_002');
    await expect(app(page).locator('.fab-detail h3')).toHaveText('BP_REWARD_CollectorMaterial_002');
    await expect(app(page).locator('.fab-missionlist li').first()).toContainText('결과 구분: 진행 중');
    await expect(app(page).locator('.fab-missionlist')).not.toContainText('InProgress');
    await page.goBack();
    await expect(missions.first()).toBeVisible();

    // 임무 찾기 화면으로 넘어간다
    await missions.first().locator('a').click();
    await expect(page.locator('section#missions')).toHaveClass(/active/);
    await expect(page).toHaveURL(/#missions\?m=/);
    expect(await tracker.problems()).toEqual([]);
});

test('묶음 보기: 들어 있는 설계도와 쓰이는 곳, 설계도로 돌아가기', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '#fabricator?tab=pools');
    await expect(app(page).locator('.fab-title')).toHaveText('설계도 묶음 176개');
    await app(page).locator('#fab-q').fill('Xenothreat2_15_01');
    await expect(app(page).locator('.fab-list > li')).toHaveCount(1);
    await app(page).locator('.fab-list [data-act="pool"]').click();
    await expect(page).toHaveURL(/#fabricator\?pool=BP_REWARDS_Xenothreat2_15_01&q=Xenothreat2_15_01&tab=pools$/);
    const detail = app(page).locator('.fab-detail');
    await expect(detail.locator('h3')).toHaveText('BP_REWARDS_Xenothreat2_15_01');
    await expect(detail).toContainText('18,000점 이상');
    await expect(detail).toContainText('이벤트가 열려 있는지는 서버가 정하므로');
    await expect(detail).toContainText('하나만 나오는지 전부 주는지');
    const first = detail.locator('.fab-poolitems [data-act="bp"]').first();
    const name = await first.textContent();
    await first.click();
    await expect(app(page).locator('.fab-detail h3')).toHaveText(name);
    await expect(page).toHaveURL(/#fabricator\?bp=/);
    await page.goBack();
    await expect(app(page).locator('.fab-detail h3')).toHaveText('BP_REWARDS_Xenothreat2_15_01');
});

test('위켈로 교환: 가져갈 것 · 받는 것 · 조건, 수량 0 은 적지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await open(page, '#fabricator?tab=trades');
    await expect(app(page).locator('.fab-title')).toHaveText('위켈로 교환 69건');
    await expect(app(page).locator('.fab-trade')).toHaveCount(69);
    await app(page).locator('#fab-q').fill('폴라리스를 원하오');
    const card = app(page).locator('.fab-trade');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('퀀터늄 24 SCU');
    await expect(card).toContainText('확인되지 않은 추가 화물 설정');
    await expect(card).toContainText('범죄 등급 0 ~ 2');
    await app(page).locator('#fab-q').fill('');
    await expect(app(page).locator('.fab-trade')).toHaveCount(69);
    const zeros = await app(page).locator('.fab-trade li').evaluateAll((items) => items.filter((item) => /× 0$/.test(item.textContent.trim())).length);
    expect(zeros).toBe(0);
    await app(page).locator('[data-act="trade-type"][data-id="WIkelo_Ships"]').click();
    await expect(app(page).locator('.fab-trade').first()).toContainText('함선 교환');
    await expect(page).toHaveURL(/#fabricator\?tab=trades&tt=ships$/);
    const shipCount = await app(page).locator('.fab-trade').count();
    await page.reload();
    await expect(app(page).locator('[data-act="trade-type"][data-id="WIkelo_Ships"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(app(page).locator('.fab-trade')).toHaveCount(shipCount);
    // 교환에 딸린 설계도 묶음으로 이동
    await app(page).locator('[data-act="trade-type"][data-id=""]').click();
    await app(page).locator('.fab-trade [data-act="pool"]').first().click();
    await expect(app(page).locator('.fab-detail')).toContainText('위켈로 교환:');
    expect(await tracker.problems()).toEqual([]);
});

test('모을 재료 목록: 여러 설계도 합계 · 수량 · 글자로 복사 · 주소로 공유', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '#fabricator?bp=BP_CRAFT_behr_pistol_ballistic_01');
    await app(page).locator('.fab-detail [data-act="add"]').click();
    await expect(app(page).locator('.fab-live')).toContainText('모을 재료 목록에 담았습니다: S-38 권총 (지금 1개)');
    await app(page).locator('.fab-detail [data-act="add"]').click();
    await page.goto('/?lang=ko#fabricator?bp=BP_CRAFT_thp_light_legs_01_01_01');
    await expect(app(page).locator('.fab-detail h3')).toHaveText('아즈탈란 레그');
    await app(page).locator('.fab-detail [data-act="add"]').click();
    await expect(app(page).locator('[data-act="tab"][data-id="cart"] .fab-badge')).toHaveText('2');

    await app(page).locator('[data-act="tab"][data-id="cart"]').click();
    await expect(page).toHaveURL(/list=BP_CRAFT_behr_pistol_ballistic_01\.2%2CBP_CRAFT_thp_light_legs_01_01_01\.1/);
    const totals = app(page).locator('.fab-table tbody tr');
    await expect(totals).toHaveCount(3);
    await expect(totals.filter({ hasText: '알루미늄' })).toContainText('0.04 SCU');
    await expect(totals.filter({ hasText: '철' })).toContainText('0.02 SCU');
    await expect(app(page).locator('.fab-cart')).toContainText('골라야 하는 칸 (합계에 넣지 않음)');
    await expect(app(page).locator('.fab-cart .fab-facts')).toContainText('5분 20초');

    await app(page).locator('[data-act="qty-up"][data-id="BP_CRAFT_behr_pistol_ballistic_01"]').click();
    await expect(totals.filter({ hasText: '알루미늄' })).toContainText('0.06 SCU');
    await app(page).locator('[data-act="cart-copy"]').click();
    await expect(app(page).locator('.fab-live')).toHaveText('모을 재료 목록을 복사했습니다.');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('VOLT 제작 준비물');
    expect(copied).toContain('- S-38 권총 × 3');
    expect(copied).toContain('- 알루미늄 0.06 SCU (최소 품질 0)');
    expect(copied).toContain('게임 버전 4.10.200.58746');

    // 새로 열어도 남아 있고, 주소의 목록이 있으면 그 목록을 보여 준다
    await page.goto('/?lang=ko#fabricator');
    await expect(app(page).locator('[data-act="tab"][data-id="cart"] .fab-badge')).toHaveText('2');
    const saved = () => page.evaluate(() => window.localStorage.getItem('volt-fabricator-list-v1'));
    const mine = 'BP_CRAFT_behr_pistol_ballistic_01.3,BP_CRAFT_thp_light_legs_01_01_01.1';
    expect(await saved()).toBe(mine);

    // 남이 준 주소: 받은 목록으로만 보여 주고 내 목록은 그대로 둔다
    await page.goto('/?lang=ko#fabricator?tab=cart&list=BP_CRAFT_volt_lmg_energy_01.4,NOPE.2');
    await expect(app(page).locator('.fab-shared')).toContainText('내 모을 재료 목록(2개)은 그대로 저장되어 있고');
    await expect(app(page).locator('.fab-cartrow')).toHaveCount(1);
    await expect(app(page).locator('.fab-cartrow input')).toHaveValue('4');
    await expect(app(page).locator('.fab-table tbody tr').filter({ hasText: '자나라이트' })).toContainText('4개');
    await app(page).locator('[data-act="qty-up"]').click();
    await expect(app(page).locator('.fab-cartrow input')).toHaveValue('5');
    expect(await saved()).toBe(mine);

    // 받은 목록을 보다가 설계도 탭에서 ＋ 를 눌러도 내 목록에만 더해진다
    await app(page).locator('[data-act="tab"][data-id="list"]').click();
    await app(page).locator('#fab-q').fill('프레넬 에너지 LMG');
    await app(page).locator('.fab-list [data-act="add"]').first().click();
    expect(await saved()).toBe(`${mine},BP_CRAFT_volt_lmg_energy_01.1`);
    await app(page).locator('[data-act="tab"][data-id="cart"]').click();
    await expect(app(page).locator('.fab-shared')).toHaveCount(0);
    await expect(app(page).locator('.fab-cartrow')).toHaveCount(3);

    // 받은 목록을 내 목록에 더하기
    await page.goto('/?lang=ko#fabricator?tab=cart&list=BP_CRAFT_volt_lmg_energy_01.4');
    await app(page).locator('[data-act="shared-merge"]').click();
    await expect(app(page).locator('.fab-live')).toHaveText('받은 목록을 내 목록에 더했습니다.');
    await expect(app(page).locator('.fab-shared')).toHaveCount(0);
    expect(await saved()).toBe(`${mine},BP_CRAFT_volt_lmg_energy_01.5`);

    // 받은 목록을 비워도 내 목록은 남고, "내 목록 보기"로 돌아간다
    await page.goto('/?lang=ko#fabricator?tab=cart&list=BP_CRAFT_volt_lmg_energy_01.2');
    await app(page).locator('[data-act="remove"]').click();
    await expect(app(page).locator('.fab-hint')).toHaveText('받은 목록이 비어 있습니다.');
    await app(page).locator('[data-act="shared-mine"]').click();
    await expect(app(page).locator('.fab-cartrow')).toHaveCount(3);
    expect(await saved()).toBe(`${mine},BP_CRAFT_volt_lmg_energy_01.5`);

    // 바꾸기는 눌렀을 때만 바꾼다
    await page.goto('/?lang=ko#fabricator?tab=cart&list=BP_CRAFT_volt_lmg_energy_01.2');
    await app(page).locator('[data-act="shared-replace"]').click();
    await expect(app(page).locator('.fab-live')).toHaveText('내 목록을 받은 목록으로 바꿨습니다.');
    expect(await saved()).toBe('BP_CRAFT_volt_lmg_energy_01.2');
    await app(page).locator('[data-act="remove"]').click();
    await expect(app(page).locator('.fab-hint')).toContainText('담은 설계도가 없습니다');

    // 내 목록이 비어 있을 때 받은 주소는 그대로 내 목록이 된다 (잃을 것이 없다)
    await page.goto('/?lang=ko#fabricator?tab=cart&list=BP_CRAFT_behr_pistol_ballistic_01.2');
    await expect(app(page).locator('.fab-cartrow')).toHaveCount(1);
    await expect(app(page).locator('.fab-shared')).toHaveCount(0);
    expect(await saved()).toBe('BP_CRAFT_behr_pistol_ballistic_01.2');
});

test('주소에 이상한 묶음 · 종류 이름이 와도 화면이 멈추지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let tracker = null;
    for (const word of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
        tracker = await open(page, `#fabricator?pool=${word}&v=${word}`);
        await expect(app(page).locator('.fab-title')).toHaveText('설계도 묶음 176개');
        await expect(app(page).locator('.fab-hint')).toHaveText('묶음을 고르면 들어 있는 설계도와 쓰이는 곳이 나옵니다.');
        expect(await tracker.problems()).toEqual([]);
        await page.goto('about:blank');
    }
    tracker = await open(page, '#fabricator?sub=constructor&cat=toString&sz=__proto__&own=valueOf&tab=constructor&tt=constructor&mat=constructor,-__proto__');
    await expect(app(page).locator('.fab-count')).toHaveText('1,634개 중 60개 표시');
    expect(await tracker.problems()).toEqual([]);
});

test('1440px: 목록을 한참 내려 골라도 상세가 바로 옆에 보인다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const inView = (selector) => app(page).locator(selector).evaluate((node) => {
        const box = node.getBoundingClientRect();
        return box.top >= 80 && box.top < window.innerHeight - 200 && box.height > 0;
    });
    const detailShown = () => expect.poll(() => inView('#fab-detail-title'), { message: '상세 제목이 머리글 아래 화면 안에 있어야 함' }).toBe(true);
    const row = app(page).locator('.fab-list > li').nth(55);
    await row.scrollIntoViewIfNeeded();
    await row.locator('[data-act="bp"]').click();
    await expect(app(page).locator('#fab-detail-title')).toBeFocused();
    await detailShown();
    // 고른 줄도 그대로 보인다 (목록이 맨 위로 튀지 않는다)
    await expect(app(page).locator('.fab-row.is-selected')).toBeInViewport();
    expect(await app(page).locator('.fab-listpane').evaluate((node) => node.scrollTop)).toBeGreaterThan(1000);

    // 더 보기로 늘린 뒤 맨 아래 줄
    await app(page).locator('[data-act="more"]').click();
    const last = app(page).locator('.fab-list > li').nth(119);
    await last.scrollIntoViewIfNeeded();
    await last.locator('[data-act="bp"]').click();
    await detailShown();
    await expect(app(page).locator('.fab-row.is-selected')).toBeInViewport();

    // 묶음 탭도 같은 배치
    await app(page).locator('[data-act="tab"][data-id="pools"]').click();
    const pool = app(page).locator('.fab-list > li').nth(150);
    await pool.scrollIntoViewIfNeeded();
    await pool.locator('[data-act="pool"]').click();
    await detailShown();
    await expect(app(page).locator('.fab-row.is-selected')).toBeInViewport();
    await noSidewaysScroll(page);
});

test('375px: 목록으로 돌아가면 보던 줄이 화면에 있다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page);
    const row = app(page).locator('.fab-list > li').nth(45);
    await row.scrollIntoViewIfNeeded();
    const id = await row.locator('[data-act="bp"]').getAttribute('data-id');
    await row.locator('[data-act="bp"]').click();
    await expect(app(page).locator('#fab-detail-title')).toBeFocused();
    await expect(app(page).locator('#fab-detail-title')).toBeInViewport();
    await app(page).locator('[data-act="back"]').click();
    const again = app(page).locator(`.fab-list [data-act="bp"][data-id="${id}"]`);
    await expect(again).toBeFocused();
    await expect(again).toBeInViewport();
});

test('영어 화면 · 모르는 주소 값은 조용히 버린다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await open(page, '#fabricator?bp=NOPE&mat=Nothing&cat=zzz&pool=none&sub=x&sz=y&own=q', 'en');
    await expect(app(page).locator('.fab-count')).toHaveText('showing 60 of 1,634');
    await expect(app(page).locator('.fab-hint')).toHaveText('Pick a blueprint to see its materials and how to get it.');
    await expect(app(page).locator('.fab-source')).toContainText('Data: game files');
    await app(page).locator('#fab-q').fill('S-38 Pistol');
    await app(page).locator('.fab-list [data-act="bp"][data-id="BP_CRAFT_behr_pistol_ballistic_01"]').click();
    const detail = app(page).locator('.fab-detail');
    await expect(detail.locator('h3')).toHaveText('S-38 Pistol');
    await expect(detail.locator('.fab-facts')).toContainText('1 min 30 s');
    await expect(detail.locator('.fab-slot').first().locator('.fab-modval').first()).toHaveText('at quality 500: 1');
    // 언어를 바꾸면 같은 설계도가 한국어로 다시 그려진다
    await detail.locator('#fab-quality').fill('800');
    await page.evaluate(() => window.VOLT_I18N.setLang('ko'));
    await expect(detail.locator('h3')).toHaveText('S-38 권총');
    await expect(detail.locator('#fab-quality')).toHaveValue('800');
    await page.evaluate(() => window.VOLT_I18N.setLang('en'));
    await app(page).locator('[data-act="tab"][data-id="mats"]').click();
    await app(page).locator('[data-act="tab"][data-id="trades"]').click();
    await expect(app(page).locator('.fab-count')).toHaveText('69 found');
    await app(page).locator('[data-act="trade-type"][data-id="WIkelo_Ships"]').click();
    await expect(app(page).locator('.fab-trade .fab-meta').first()).toHaveText('Ship trade');
    expect(await tracker.problems()).toEqual([]);
});

test('자료를 못 받으면 안내와 다시 시도 버튼을 보여 준다', async ({ page }) => {
    await mockApi(page);
    let fail = true;
    await page.route('**/data/crafting/blueprints.json*', (route) => (fail ? route.fulfill({ status: 500, body: 'no' }) : route.fallback()));
    await gotoSection(page, '?lang=ko#fabricator');
    await expect(app(page).locator('.fab-status')).toContainText('게임 자료를 불러오지 못했습니다');
    fail = false;
    await app(page).locator('[data-act="reload"]').click();
    await expect(app(page).locator('.fab-count')).toHaveText('1,634개 중 60개 표시');
});

for (const width of [375, 1440]) {
    test(`${width}px: 가로 스크롤 없음 · 누를 자리 44px · 접근성 검사`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
        const tracker = await open(page);
        await noSidewaysScroll(page);
        if (width === 375) {
            await expect(app(page).locator('.fab-detailpane')).toBeHidden();
        }
        await app(page).locator('#fab-q').fill('프레넬 에너지 LMG');
        await app(page).locator('.fab-list [data-act="bp"]').first().click();
        const title = app(page).locator('#fab-detail-title');
        await expect(title).toBeFocused();
        await noSidewaysScroll(page);
        await app(page).locator('.fab-detail [data-act="missions"]').click();
        await expect(app(page).locator('.fab-missionlist li').first()).toBeVisible({ timeout: 20000 });
        const targets = 'button:visible, input:visible, summary:visible, a:visible';
        const tooSmall = (nodes) => nodes
            .map((node) => ({ label: node.textContent.trim().slice(0, 20) || node.id, height: node.getBoundingClientRect().height }))
            .filter((box) => box.height < 43.5);
        const tinyText = (nodes) => [...new Set(nodes
            .filter((node) => [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim()) && node.getClientRects().length)
            .map((node) => ({ tag: node.tagName, cls: node.className, size: Number.parseFloat(getComputedStyle(node).fontSize) }))
            .filter((item) => item.size < 11)
            .map((item) => `${item.tag}.${item.cls} ${item.size}`))];
        expect(await app(page).locator(targets).evaluateAll(tooSmall)).toEqual([]);
        expect(await app(page).locator('*').evaluateAll(tinyText)).toEqual([]);
        const results = await new AxeBuilder({ page }).include('#fabricator-app').analyze();
        expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);

        if (width === 375) {
            await expect(app(page).locator('.fab-listpane')).toBeHidden();
            await app(page).locator('[data-act="back"]').click();
            await expect(app(page).locator('.fab-listpane')).toBeVisible();
            await expect(app(page).locator('.fab-list [data-act="bp"]').first()).toBeFocused();
        }
        await app(page).locator('.fab-list [data-act="add"]').first().click();
        for (const tab of ['mats', 'pools', 'trades', 'cart', 'list']) {
            if (tab === 'pools' || tab === 'trades') await app(page).locator(`[data-act="tab"][data-id="${tab === 'pools' ? 'list' : 'mats'}"]`).click();
            await app(page).locator(`[data-act="tab"][data-id="${tab}"]`).click();
            await expect(app(page).locator(`.fab-body-${tab}`)).toBeVisible();
            if (tab === 'pools') await app(page).locator('.fab-list [data-act="pool"]').nth(3).click();
            if (tab === 'list') {
                await app(page).locator('[data-act="cat"][data-id="armor"]').click();
                await app(page).locator('.fab-matfilter summary').click();
                await app(page).locator('[data-act="mat"]').first().click();
            }
            await noSidewaysScroll(page);
            expect(await app(page).locator(targets).evaluateAll(tooSmall), `${tab}: 누를 자리`).toEqual([]);
            expect(await app(page).locator('*').evaluateAll(tinyText), `${tab}: 글자 크기`).toEqual([]);
            if (tab === 'pools' && width === 375) await app(page).locator('[data-act="back"]').click();
        }
        expect(await tracker.problems()).toEqual([]);
    });
}

test('키보드만으로 설계도를 고르고 준비물에 담는다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await app(page).locator('#fab-q').focus();
    await page.keyboard.type('S-38 권총');
    await expect(app(page).locator('.fab-list > li')).toHaveCount(3);
    await app(page).locator('.fab-list [data-act="bp"][data-id="BP_CRAFT_behr_pistol_ballistic_01"]').focus();
    await page.keyboard.press('Enter');
    await expect(app(page).locator('#fab-detail-title')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(app(page).locator('.fab-detail [data-act="add"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(app(page).locator('.fab-detail [data-act="add"]')).toBeFocused();
    await expect(app(page).locator('[data-act="tab"][data-id="cart"] .fab-badge')).toHaveText('1');
});
