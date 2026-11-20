const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');
const data = require('../../data/contracts/missions.json');

// 임무 찾기(#missions): 목록 · 거르기 · 상세 · 등급 계산기 · 등급 길잡이 · 공유 주소.
// 기대값은 data/contracts/missions.json 에서 직접 계산한다 (자료가 바뀌어도 테스트가 자료를 따라간다).

const STRICT_CSP = [
    "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self' https://forms.gle",
    "img-src 'self' data: https:", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com", "font-src 'self' data:", "object-src 'none'",
].join('; ');

const total = data.contracts.length;
const ko = (n) => n.toLocaleString('ko-KR');
const countText = (n) => `${ko(total)}개 중 ${ko(n)}개`;
const title = (c) => data.texts[c.t][1] || data.texts[c.t][0];

async function open(page, hash = '#missions') {
    await mockApi(page, { fleet: true });
    await gotoSection(page, hash);
    await expect(page.locator('#missions-app .missions-source')).toBeVisible({ timeout: 20000 });
}

test('임무 목록: 전체 수를 보여 주고, 검색하는 동안 입력 칸이 끊기지 않는다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await open(page);
    await expect(page.locator('.missions-count')).toHaveText(countText(total));
    await expect(page.locator('.missions-tile')).toHaveCount(30); // 한 번에 30개만 그린다
    await expect(page.locator('.missions-source')).toContainText('빈칸은 값 미확인');
    await expect(page.locator('.missions-source a[href="#hauling"]')).toBeVisible();

    const input = page.locator('#missions-q');
    await input.click();
    await input.pressSequentially('covalex', { delay: 20 });
    await expect(page.locator('.missions-count')).not.toHaveText(countText(total));
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('covalex');
    await expect(page).toHaveURL(/#missions\?q=covalex$/);

    await page.locator('[data-ms-more]').click();
    await expect(page.locator('.missions-tile')).toHaveCount(60);
    expect(errors).toEqual([]);
});

test('임무 목록: 포함/제외 칩과 화물 조건으로 거르고 주소에 남긴다', async ({ page }) => {
    await open(page);
    await page.locator('.missions-filters > summary').click();
    const bp = page.locator('[data-ms-chip="flag"][data-id="bp"]');
    await bp.click();
    await expect(bp).toHaveAttribute('data-state', 'include');
    await expect(bp).toHaveAttribute('aria-label', '설계도 보상: 포함');
    await expect(bp).toBeFocused();
    await expect(page.locator('.missions-count')).toHaveText(countText(data.contracts.filter((c) => c.bp?.length).length));

    const illegal = page.locator('[data-ms-chip="flag"][data-id="illegal"]');
    await illegal.click();
    await illegal.click();
    await expect(illegal).toHaveAttribute('data-state', 'exclude');
    await expect(page.locator('.missions-count')).toHaveText(countText(data.contracts.filter((c) => c.bp?.length && c.illegal !== 1).length));
    await expect(page).toHaveURL(/flag=bp%2C-illegal/);

    await page.locator('[data-ms-clear]').click();
    await page.locator('#missions-box').selectOption('4');
    // 상자 크기가 자료에 없는 임무는 '너무 큼'이 아니다: 더 큰 상자가 필요하다고 적힌 임무만 빠진다.
    const small = data.contracts.filter((c) => !(c.haul?.maxBox > 4));
    await expect(page.locator('.missions-count')).toHaveText(countText(small.length));
    const unknownBox = small.filter((c) => c.haul && !c.haul.maxBox).length;
    await expect(page.locator('[data-ms-listnote]')).toContainText(`${ko(unknownBox)}개는 화물 상자 크기가 게임 자료에 없어`);
    await page.locator('#missions-scu-min').fill('100');
    const big = small.filter((c) => c.haul && c.haul.scu !== undefined && (Array.isArray(c.haul.scu) ? c.haul.scu[1] : c.haul.scu) >= 100);
    await expect(page.locator('.missions-count')).toHaveText(countText(big.length));
    await expect(page).toHaveURL(/scu=100-/);
    // 소수도 받는다. 최소가 최대보다 크면 까닭을 알려 준다.
    await page.locator('#missions-scu-min').fill('1.5');
    await expect(page).toHaveURL(/scu=1\.5-/);
    await page.locator('#missions-scu-min').fill('50');
    await page.locator('#missions-scu-max').fill('20');
    await expect(page.locator('[data-ms-listnote]').first()).toHaveText('최소 화물 양이 최대보다 큽니다. 두 값을 바꿔 보세요.');

    // 평판 종류를 하나만 포함하면 내 등급으로 거를 수 있다.
    await page.locator('[data-ms-clear]').click();
    await expect(page.locator('#missions-rank')).toBeDisabled();
    await page.locator('[data-ms-chip="scope"][data-id="ReputationScope_Hauling"]').click();
    await page.locator('#missions-rank').selectOption('3');
    const atRank = data.contracts.filter((c) => c.scope === 'ReputationScope_Hauling' && (c.min ?? 0) <= 3 && (c.max ?? 99) >= 3);
    await expect(page.locator('.missions-count')).toHaveText(countText(atRank.length));
    await expect(page).toHaveURL(/rank=3/);
});

test('임무 목록: 표 보기와 정렬, 공유 주소가 같은 화면을 되살린다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, '#missions?type=Hauling_Planetary');
    await page.locator('[data-ms-view="table"]').click();
    await expect(page.locator('.missions-table')).toBeVisible();
    await page.locator('[data-ms-sort="rep"]').click();
    await page.locator('[data-ms-sort="rep"]').click();
    await expect(page.locator('.missions-table th[aria-sort="descending"]')).toContainText('평판');
    const best = Math.max(...data.contracts.filter((c) => c.type === 'Hauling_Planetary').flatMap((c) => (c.rep || []).filter((r) => r.on === undefined && r.n).map((r) => r.n)));
    await expect(page.locator('.missions-table tbody tr').first()).toContainText(`+${ko(best)}`);
    await expect(page).toHaveURL(/sort=-rep/);

    await page.locator('[data-ms-share]').click();
    await expect(page.locator('[data-ms-status]')).toHaveText('주소를 복사했습니다.');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('#missions?sort=-rep&type=Hauling_Planetary&view=table');
    const firstRow = await page.locator('.missions-table tbody tr').first().innerText();
    const count = await page.locator('.missions-count').innerText();

    const other = await context.newPage();
    await mockApi(other, { fleet: true });
    await other.goto(link);
    await expect(other.locator('.missions-table tbody tr').first()).toBeVisible({ timeout: 20000 });
    expect(await other.locator('.missions-table tbody tr').first().innerText()).toBe(firstRow);
    await expect(other.locator('.missions-count')).toHaveText(count);
    await expect(other.locator('[data-ms-chip="type"][data-id="Hauling_Planetary"]')).toHaveAttribute('data-state', 'include');
});

test('임무 상세: 보수는 추정하지 않고, 화물 · 설계도 링크를 보여 준다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const c = data.contracts.find((x) => x.haul?.orders?.[0]?.rows?.[0]?.r && x.bp?.length && x.pay === 'calc' && x.time !== undefined);
    await open(page);
    await page.locator('#missions-q').fill(c.n);
    await page.locator(`[data-ms-open="${c.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#missions\\?m=${c.id}`));
    const detail = page.locator('.missions-detail');
    await expect(detail.locator('h3')).toBeFocused();
    await expect(detail.locator('h3')).toContainText(title(c).replace(/\{[^}]*\}.*/, '').trim());
    await expect(detail).toContainText('금액이 게임 자료에 없음');
    await expect(detail).toContainText('계산식은 게임 자료에 없음');
    await expect(detail).toContainText('화물 주문');
    const resource = data.resources[c.haul.orders[0].rows[0].r];
    await expect(detail).toContainText(resource.ko || resource.en);
    const pool = data.pools[c.bp[0][0]];
    const bpId = Array.isArray(pool[0]) ? pool[0][0] : pool[0];
    await expect(detail.locator(`a[href="#fabricator?bp=${bpId}"]`)).toBeVisible();
    await expect(detail).toContainText('한 번에 몇 개가 나오는지는 게임 자료에 없습니다');

    // 브라우저의 뒤로 가기와 '목록으로' 둘 다 목록으로 돌아온다.
    await page.goBack();
    await expect(page.locator('.missions-count')).toBeVisible();
    await page.goForward();
    await expect(page.locator('.missions-detail')).toBeVisible();
    await page.locator('[data-ms-back]').click();
    await expect(page.locator('.missions-count')).toBeVisible();
    expect(errors).toEqual([]);
});

test('임무 상세: 정해진 금액, 결과별 평판, 교전, 이벤트, 이상한 점', async ({ page }) => {
    const fixed = data.contracts.find((x) => typeof x.pay === 'object' && x.pp !== undefined);
    await open(page, `#missions?m=${fixed.id}`);
    await expect(page.locator('.missions-detail')).toContainText(`${ko(fixed.pay.a)} aUEC`);
    await expect(page.locator('.missions-detail')).toContainText('일부만 끝냈을 때');

    const loss = data.contracts.find((x) => (x.rep || []).some((r) => r.on?.includes(2) && r.n < 0));
    await gotoSection(page, `#missions?m=${loss.id}`);
    await expect(page.locator('.missions-detail')).toContainText('실패했을 때');
    await expect(page.locator('.missions-detail .is-loss').first()).toHaveText(ko(loss.rep.find((r) => r.on?.includes(2)).n));

    const combat = data.contracts.find((x) => data.combats[x.combat]?.ships && x.ev?.length);
    await gotoSection(page, `#missions?m=${combat.id}`);
    await expect(page.locator('.missions-detail')).toContainText('교전');
    await expect(page.locator('.missions-detail')).toContainText('지금 이벤트가 열려 있는지는 게임 자료로 알 수 없습니다.');

    const odd = data.contracts.find((x) => (x.rep || []).some((r) => r.on && !r.on.length));
    await gotoSection(page, `#missions?m=${odd.id}`);
    await expect(page.locator('.missions-block.is-odd')).toContainText('결과 칸이 없는 값');

    // 모르는 id와 모르는 키는 조용히 목록을 보여 준다.
    await gotoSection(page, '#missions?m=no-such-id&zzz=1');
    await expect(page.locator('.missions-count')).toHaveText(countText(total));
});

test('등급 계산기: 지금 평판에서 각 등급까지 필요한 횟수를 계산한다', async ({ page }) => {
    const c = data.contracts.find((x) => x.scope === 'ReputationScope_Hauling' && x.rep?.length === 1 && x.rep[0].on === undefined && x.rep[0].n > 0 && x.rep[0].s === x.scope);
    const gain = c.rep[0].n;
    const ranks = data.scopes[c.scope].ranks;
    const last = ranks[ranks.length - 1];
    await open(page, `#missions?m=${c.id}`);
    await page.locator('[data-ms-calc]').click();
    await expect(page).toHaveURL(/tab=rank/);
    await expect(page.locator('.missions-out .missions-big')).toContainText(`+${ko(gain)}`);
    await expect(page.locator('.missions-ranktable tbody tr').last()).toContainText(`${ko(Math.ceil(last.min / gain))}회`);

    const rep = page.locator('#missions-rep');
    await rep.fill('1234');
    await expect(page.locator('.missions-ranktable tbody tr').last()).toContainText(`${ko(Math.ceil((last.min - 1234) / gain))}회`);
    await expect(rep).toBeFocused();
    await expect(page.locator('.missions-ranktable tbody tr').first()).toContainText('도달함');
    await expect(page.locator('.missions-out')).toContainText('게임 자료에 없어 계산하지 않습니다');
    await expect(page).toHaveURL(/rep=1234/);

    // 계산기 안에서 다른 임무를 찾아 고를 수 있다.
    await page.locator('#missions-pick').fill('covalex');
    await page.locator('.missions-pick').first().click();
    await expect(page.locator('#missions-rep')).toBeFocused();
    await expect(page.locator('.missions-ranktable')).toBeVisible();
});

test('등급 길잡이: 평판 값만으로 등급별 반복 횟수를 보여 준다', async ({ page }) => {
    await open(page, '#missions?tab=path');
    await expect(page.locator('.missions-out')).toContainText('세력과 평판 종류를 고르세요.');
    await page.locator('#missions-pp').selectOption('Lawful_CovalexShipping.ReputationScope_Hauling');
    await expect(page.locator('.missions-step').first()).toBeVisible();
    const ranks = data.scopes.ReputationScope_Hauling.ranks;
    const start = ranks.reduce((at, rank, index) => (rank.min <= 0 ? index : at), 0);
    await expect(page.locator('.missions-step')).toHaveCount(ranks.length - 1 - start);
    await expect(page.locator('[data-ms-total]')).toHaveText(/반복 임무 합계 [\d,]+회/);
    await expect(page.locator('.missions-out')).toContainText('임무 장소, 다시 받기 대기 시간');

    await page.locator('#missions-pto').selectOption(String(start + 1));
    await expect(page.locator('.missions-step')).toHaveCount(1);
    await expect(page).toHaveURL(/pp=Lawful_CovalexShipping\.ReputationScope_Hauling/);
    await page.locator('#missions-prep').fill(String(ranks[ranks.length - 1].min));
    await expect(page.locator('.missions-out')).toContainText('이미 목표 등급입니다.');

    // 길잡이의 임무 이름은 임무 상세로 이어진다.
    await page.locator('#missions-prep').fill('');
    await page.locator('.missions-step > .missions-list a[data-ms-open]').first().click();
    await expect(page.locator('.missions-detail')).toBeVisible();
});

for (const width of [375, 1440]) {
    test(`영어 · ${width}px: 옆으로 넘치지 않고, 엄격한 CSP와 접근성 검사를 통과한다`, async ({ page }) => {
        test.setTimeout(90000);
        const problems = [];
        await page.setViewportSize({ width, height: 900 });
        await page.route('**/*', async (route) => {
            if (route.request().resourceType() !== 'document') return route.fallback();
            const response = await route.fetch();
            return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': STRICT_CSP } });
        });
        await page.addInitScript(() => {
            window.__cspViolations = [];
            document.addEventListener('securitypolicyviolation', (event) => window.__cspViolations.push(`${event.violatedDirective} <- ${event.blockedURI || 'inline'}`));
        });
        page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
        page.on('pageerror', (error) => problems.push(String(error)));
        const c = data.contracts.find((x) => x.combat !== undefined && x.bp?.length && x.haul);
        const views = ['#missions?flag=bp&sys=Pyro', '#missions?view=table&sort=-rep', `#missions?m=${c.id}`, `#missions?tab=rank&m=${c.id}`, '#missions?tab=path&pp=Lawful_CovalexShipping.ReputationScope_Hauling'];
        await open(page, views[0]);
        await page.evaluate(() => window.VOLT_I18N.setLang('en'));
        await expect(page.locator('.missions-count')).toContainText(`of ${total.toLocaleString('en-US')}`);
        await expect(page.locator('[data-ms-chip="flag"][data-id="bp"]')).toHaveAttribute('aria-label', 'Blueprint reward: Include');
        for (const hash of views) {
            await page.evaluate((value) => { window.location.hash = value; }, hash);
            await expect(page.locator('#missions-app .missions-source')).toContainText('A blank means the value is unknown');
            await page.waitForTimeout(500); // 섹션 전환 애니메이션이 끝난 뒤에 잰다
            expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), hash).toBeLessThanOrEqual(0);
            const axe = await new AxeBuilder({ page }).include('#missions-app').analyze();
            expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${hash}: ${v.id} ${v.nodes[0]?.target} ${v.nodes[0]?.failureSummary}`)).toEqual([]);
        }
        // 키보드만으로 임무를 열 수 있다.
        await page.evaluate(() => { window.location.hash = '#missions'; });
        await page.locator('.missions-tile .missions-open').first().focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.missions-detail h3')).toBeFocused();
        expect([...problems, ...(await page.evaluate(() => window.__cspViolations))]).toEqual([]);
    });
}

test('자료를 못 받으면 안내와 다시 시도 단추를 보여 준다', async ({ page }) => {
    await mockApi(page, { fleet: true });
    let fail = true;
    await page.route('**/data/contracts/missions.json*', (route) => (fail ? route.fulfill({ status: 500, body: 'x' }) : route.fallback()));
    await gotoSection(page, '#missions');
    await expect(page.locator('#missions-app [role="alert"]')).toContainText('게임 자료를 불러오지 못했습니다');
    fail = false;
    await page.locator('[data-ms-retry]').click();
    await expect(page.locator('.missions-count')).toBeVisible({ timeout: 20000 });
});

test('한글 패치에 덧붙은 글은 임무 설명과 따로, 표시를 달아 보여 준다', async ({ page }) => {
    const c = data.contracts.find((x) => x.n === 'CleanAir_Bulk_MedicalSupplies') || data.contracts.find((x) => /미션 상세 정보/.test(data.texts[x.d]?.[1] || ''));
    await open(page, `#missions?m=${c.id}`);
    const brief = page.locator('.missions-block.is-wide').first();
    await expect(brief.locator('.missions-brief').first()).not.toContainText('미션 상세 정보');
    await expect(brief.locator('.missions-brief').first()).not.toContainText('난이도 (1-7)');
    const fold = brief.locator('[data-ms-patch]');
    await expect(fold.locator('summary')).toHaveText('한글 패치에 덧붙은 참고 글 보기');
    expect(await fold.evaluate((node) => node.open)).toBe(false);
    await fold.locator('summary').click();
    await expect(fold).toContainText('게임에 나오는 임무 설명이 아니라');
    await expect(fold).toContainText('미션 상세 정보');
    // 덧붙은 글은 찾기에 걸리지 않고, 이름에 붙어 있던 것도 떼어 낸다.
    await gotoSection(page, `#missions?q=${encodeURIComponent('미션 상세 정보')}`);
    await expect(page.locator('.missions-count')).toHaveText(countText(0));
    const titled = data.contracts.find((x) => /\n/.test(data.texts[x.t]?.[1] || ''));
    if (titled) {
        await gotoSection(page, `#missions?m=${titled.id}`);
        await expect(page.locator('.missions-detail h3')).not.toContainText('쿨다운');
    }
    // 영어 화면에는 덧붙은 글이 없다.
    await gotoSection(page, `#missions?m=${c.id}`);
    await page.evaluate(() => window.VOLT_I18N.setLang('en'));
    await expect(page.locator('.missions-detail')).toContainText('Briefing');
    await expect(page.locator('[data-ms-patch]')).toHaveCount(0);
});

test('겉이 같은 임무는 화물 · 장소 · 게임 파일 이름으로 가려낼 수 있다', async ({ page }) => {
    await open(page);
    await page.locator('#missions-q').fill('RedWind_Pyro_SmallGrade_RegionA');
    const twins = data.contracts.filter((c) => (c.n || '').startsWith('RedWind_Pyro_SmallGrade_RegionA')).length;
    await expect(page.locator('.missions-count')).toHaveText(countText(twins));
    const cards = await page.locator('.missions-tile').allInnerTexts();
    expect(new Set(cards).size).toBe(cards.length);
    await expect(page.locator('.missions-tile').first()).toContainText('장소');

    // 등급 계산기의 임무 찾기: 몇 개 중 몇 개인지 알려 주고, 더 볼 수 있고, 이름표가 서로 다르다.
    await page.locator('[data-ms-tab="rank"]').click();
    await page.locator('#missions-pick').fill('covalex');
    await expect(page.locator('.missions-pick')).toHaveCount(12);
    await expect(page.locator('[data-ms-pickout] .missions-count')).toContainText('개 중 12개');
    await page.locator('[data-ms-pickmore]').click();
    await expect(page.locator('.missions-pick')).toHaveCount(24);
    await expect(page.locator('.missions-pick').nth(12)).toBeFocused();
    const labels = await page.locator('.missions-pick').allInnerTexts();
    expect(new Set(labels).size).toBe(labels.length);
});

test('탭: 계산기에서 임무를 골라도 임무 목록 탭은 목록을 열고, 화살표로 옮길 수 있다', async ({ page }) => {
    await open(page, '#missions?tab=rank');
    await expect(page.locator('#missions-panel')).toHaveAttribute('role', 'tabpanel');
    await expect(page.locator('#missions-panel')).toHaveAttribute('aria-labelledby', 'missions-tab-rank');
    await expect(page.locator('.missions-out')).toContainText('위에서 찾아 고르거나');
    await page.locator('#missions-pick').fill('covalex');
    await page.locator('.missions-pick').first().click();
    await expect(page.locator('.missions-ranktable')).toBeVisible();
    await expect(page).toHaveURL(/cm=/);
    await page.locator('[data-ms-tab="list"]').click();
    await expect(page.locator('.missions-count')).toHaveText(countText(total));
    await expect(page.locator('.missions-detail')).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]m=/);
    // 화살표로 계산기 탭에 돌아가면 고른 임무가 그대로 있다.
    await expect(page.locator('[data-ms-tab="list"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-ms-tab="rank"]')).toBeFocused();
    await expect(page.locator('[data-ms-tab="rank"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-ms-tab="rank"]')).toHaveAttribute('aria-controls', 'missions-panel');
    await expect(page.locator('.missions-ranktable')).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.locator('[data-ms-tab="path"]')).toBeFocused();
    await expect(page.locator('[data-ms-tab="list"]')).toHaveAttribute('tabindex', '-1');
    // 상한보다 큰 평판을 적으면 알려 준다.
    await page.keyboard.press('ArrowLeft');
    await page.locator('#missions-rep').fill('999999999');
    await expect(page.locator('[data-ms-over]')).toContainText('상한');
});

test('뒤로 가기: 늘려 둔 줄 수와 보던 자리를 지키고, 더 보기는 새 줄만 붙인다', async ({ page }) => {
    await open(page);
    await page.locator('.missions-tile').first().evaluate((node) => { node.dataset.kept = '1'; });
    await page.locator('[data-ms-more]').click();
    await expect(page.locator('.missions-tile')).toHaveCount(60);
    await expect(page.locator('.missions-tile').first()).toHaveAttribute('data-kept', '1'); // 다시 그리지 않았다
    await expect(page.locator('.missions-tile .missions-open').nth(30)).toBeFocused();
    const row = page.locator('.missions-tile .missions-open').nth(44);
    const id = await row.getAttribute('data-ms-open');
    await row.click();
    await expect(page.locator('.missions-detail')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.missions-tile')).toHaveCount(60);
    await expect(page.locator(`.missions-tile [data-ms-open="${id}"]`)).toBeFocused();
    await expect(page.locator(`.missions-tile [data-ms-open="${id}"]`)).toBeInViewport();
});

test('주소에 지금 자료에 없는 조건이 있으면 빼고 알려 준다', async ({ page }) => {
    await open(page, '#missions?con=99999&type=xx&scope=ReputationScope_Hauling&rank=77');
    const hauling = data.contracts.filter((c) => c.scope === 'ReputationScope_Hauling' || (c.rep || []).some((r) => r.on === undefined && r.s === 'ReputationScope_Hauling'));
    await expect(page.locator('.missions-count')).toHaveText(countText(hauling.length));
    await expect(page.locator('[data-ms-status]')).toHaveText('주소에 있던 조건 3개는 지금 자료에 없어 뺐습니다.');
    await expect(page.locator('.missions-filters > summary')).toHaveText('걸러 보기 (1개 적용)');
    await expect(page).toHaveURL(/#missions\?scope=ReputationScope_Hauling$/);
    await expect(page.locator('[data-ms-chip="scope"][data-id="ReputationScope_Hauling"]')).toHaveAttribute('aria-pressed', 'true');
    // 의뢰처 조건은 이름으로 만든 글자라서 자료를 다시 만들어도 같은 주소가 통한다.
    await gotoSection(page, '#missions?con=covalex');
    await expect(page.locator('[data-ms-chip="con"][data-id="covalex"]')).toHaveAttribute('data-state', 'include');
    await expect(page.locator('.missions-count')).not.toHaveText(countText(total));
    await expect(page.locator('.missions-count')).not.toHaveText(countText(0));
    // 보수 정렬은 화폐가 다른 금액을 섞지 않는다 (aUEC 먼저).
    await gotoSection(page, '#missions?sort=pay');
    await expect(page.locator('.missions-tile').first()).toContainText('aUEC');
});

test('375px: 등급 계산기 표가 옆으로 잘리지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const c = data.contracts.find((x) => x.scope === 'ReputationScope_Hauling' && x.rep?.length === 1 && x.rep[0].on === undefined && x.rep[0].n > 0 && x.rep[0].s === x.scope);
    await open(page, `#missions?tab=rank&m=${c.id}`);
    const wrap = page.locator('.missions-out .missions-tablewrap');
    await expect(wrap).toBeVisible();
    expect(await wrap.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
    // 답(이 임무 횟수)이 등급 이름 바로 옆 칸이다.
    await expect(page.locator('.missions-ranktable thead th').nth(1)).toHaveText('이 임무 횟수');
    const right = await page.locator('.missions-ranktable tbody td:nth-child(2)').evaluateAll((cells) => Math.max(...cells.map((cell) => cell.getBoundingClientRect().right)));
    expect(right).toBeLessThanOrEqual(375);
});
