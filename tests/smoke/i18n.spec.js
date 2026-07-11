const { test, expect } = require('@playwright/test');

// 런타임 i18n(KO/EN) 회귀 가드.
async function load(ctx, url = '/') {
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForSelector('#loading-splash', { state: 'hidden' });
    return page;
}

test.describe('i18n (KO/EN)', () => {
    test('한국어 브라우저: 기본 한국어 유지(회귀 없음)', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await load(ctx);
        await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
        await expect(page.locator('.nav-links a[href="#about"]')).toHaveText('소개');
        await expect(page.locator('.hero .subtitle')).toHaveText('물류와 무역을 위해 여행하는 항해자');
        await ctx.close();
    });

    test('비한국어 브라우저: 기본 영어 노출', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await load(ctx);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('.nav-links a[href="#about"]')).toHaveText('About');
        // 미션 컨트롤(F)부터 히어로 1순위 CTA는 함선DB — Discord 버튼은 랜딩 CTA에서 확인
        await expect(page.locator('.hero .btn-primary').first()).toHaveText('Browse Ship DB');
        await expect(page.locator('.landing-cta .btn-primary')).toHaveText('Join our Discord');
        await ctx.close();
    });

    test('EN 토글 동작 + 새로고침 후 언어 유지', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await load(ctx);
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('.nav-links a[href="#about"]')).toHaveText('About');

        await page.reload();
        await page.waitForSelector('#loading-splash', { state: 'hidden' });
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('.nav-links a[href="#about"]')).toHaveText('About');
        await ctx.close();
    });

    test('정책 영어화: 비한국어 기본 영어(조항/라벨)', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await load(ctx, '/#policy');
        await expect(page.locator('#policy-list')).toContainText('Role of the Staff');
        await expect(page.locator('#policy-list')).toContainText('Last updated:');
        await expect(page.locator('#policy-list')).not.toContainText('운영진의 역할');
        await ctx.close();
    });

    test('FAQ 영어화: 비한국어 기본 영어', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await load(ctx, '/#faq');
        await expect(page.locator('#faq-list')).toContainText('How do I join the VOLT fleet?');
        await ctx.close();
    });

    test('정책/FAQ KO 회귀: 한국어 유지', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await load(ctx, '/#policy');
        await expect(page.locator('#policy-list')).toContainText('운영진의 역할');
        await ctx.close();
    });

    test('일정 영어화: 비한국어 기본 영어', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await load(ctx, '/#schedule');
        await expect(page.locator('#schedule-list')).toContainText('Quarterly Fleet Event');
        await ctx.close();
    });

    test('연혁 영어화: 비한국어 기본 영어', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await load(ctx, '/#timeline');
        await expect(page.locator('#timeline-list')).toContainText('VOLT Fleet Founded');
        await ctx.close();
    });

    test('가입 단계/무역가이드 영어화: 비한국어 기본 영어', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const joinPage = await load(ctx, '/#join');
        await expect(joinPage.locator('#join-steps')).toContainText('Submit Application');
        await expect(joinPage.locator('#join-steps')).not.toContainText('지원서 제출');
        // G4: 가입 체크리스트도 데이터 _en으로 영어 렌더
        await expect(joinPage.locator('#join-checklist')).toContainText('Newcomers Welcome');
        const guidePage = await load(ctx, '/#guide');
        await expect(guidePage.locator('#guide-list')).toContainText('Basic Trade Flow');
        await ctx.close();
    });

    test('임원진/스트리머/협력함대 영어화: 비한국어 기본 영어(정적 폴백)', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const leadPage = await load(ctx, '/#leadership');
        await expect(leadPage.locator('#leadership-grid')).toContainText('Fleet Commander');
        await expect(leadPage.locator('#leadership-grid')).toContainText('Key competencies');
        const streamPage = await load(ctx, '/#streamers');
        await expect(streamPage.locator('#streamers-grid')).toContainText('Watch stream');
        await expect(streamPage.locator('#streamers-grid')).not.toContainText('방송 보기');
        const partnerPage = await load(ctx, '/#partner-fleets');
        await expect(partnerPage.locator('#partner-fleets-grid')).toContainText('Joint Operations');
        await ctx.close();
    });

    test('일정/연혁 KO 회귀 + 토글 재렌더', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await load(ctx, '/#timeline');
        await expect(page.locator('#timeline-list')).toContainText('VOLT 함대 창설');
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(page.locator('#timeline-list')).toContainText('VOLT Fleet Founded');
        await ctx.close();
    });

    test('무역플래너 위치 필터/추천 기준 EN 표기', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await page.route(/\/api\/uex\/commodities$/, (r) => r.fulfill({ json: { status: 'ok', data: [{ id: 1, name: 'Gold', code: 'G', category_name: 'Metal', is_visible: 1, is_available_live: 1 }] } }));
        await page.route(/\/api\/uex\/commodities\/1\/prices$/, (r) => r.fulfill({ json: { status: 'ok', data: [
            { terminal_name: 'CRU-L1', space_station_name: 'CRU-L1', star_system_name: 'Stanton', price_buy: 100, price_sell: 0, date_modified: 1700000000, scu_buy: 5000 },
            { terminal_name: 'ARC-L1', space_station_name: 'ARC-L1', star_system_name: 'Pyro', price_buy: 0, price_sell: 150, date_modified: 1700000000, scu_sell: 8000 },
        ] } }));
        await page.goto('/#trade-planner');
        await page.waitForSelector('#loading-splash', { state: 'hidden' });
        await expect(page.locator('#trade-planner')).toContainText('Profit Table');
        await expect(page.locator('[data-uex-loc="auto"]')).toHaveText('Station/City');
        // 항성계 필터 라벨 EN
        await expect(page.locator('#uex-system-filter .uex-loc-filter-label')).toHaveText('Star system');

        // 상품 선택 후 항성계 칩이 EN('전체' → All)으로 노출
        const search = page.locator('#uex-commodity-search');
        await search.click();
        await search.fill('Gold');
        await page.locator('#uex-commodity-results [data-commodity-id="1"]').click();
        await page.locator('#uex-refresh').click();
        await expect(page.locator('#uex-system-chips [data-uex-system=""]')).toHaveText('All');

        await page.locator('.uex-recommend-panel').evaluate((d) => { d.open = true; });
        await page.locator('#uex-recommend-refresh').click();
        await expect(page.locator('#uex-recommend-status')).toHaveText(/Basis: all trade candidates/);
        await ctx.close();
    });

    test('해시 라우팅 + 언어 토글 충돌 없음 + 동적 About 카드 번역', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'ko-KR' });
        const page = await load(ctx, '/#about');
        await expect(page.locator('#about')).toHaveClass(/active/);
        await expect(page.locator('#about-grid')).toContainText('물류 & 무역');

        await page.locator('.nav-lang [data-set-lang="en"]').click();
        // 섹션 유지 + 동적 부서 카드가 영어로 재렌더
        await expect(page.locator('#about')).toHaveClass(/active/);
        await expect(page.locator('#about-grid')).toContainText('Logistics & Trade');
        await ctx.close();
    });
});
