const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// D-①~③ 인터랙티브 랜딩: 하이라이트 카드/공지 티저/동적 수치/카운트업/모션 가드.
test.describe('인터랙티브 랜딩 (D)', () => {
    test('하이라이트: 스크롤 진입 시 실제로 보임 (computed opacity 1)', async ({ page }) => {
        // 회귀 가드: reveal 관찰자 등록 타이밍이 어긋나면 랜딩 블록이 opacity 0으로 영구히 숨는다.
        // Playwright toBeVisible()은 opacity를 검사하지 않으므로 computed 값을 직접 단언한다.
        await mockApi(page);
        await gotoSection(page, '');
        await page.locator('#home-highlights').scrollIntoViewIfNeeded();
        await expect.poll(async () => page.evaluate(() => {
            const card = document.querySelector('.landing-card');
            return card ? getComputedStyle(card).opacity : null;
        }), { timeout: 5000 }).toBe('1');
        await expect.poll(async () => page.evaluate(() => {
            const cta = document.querySelector('.landing-cta');
            cta?.scrollIntoView();
            return cta ? getComputedStyle(cta).opacity : null;
        }), { timeout: 5000 }).toBe('1');
    });

    test('하이라이트: 카드 3개 + 동적 수치(함선/멤버) 채움', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        const cards = page.locator('.landing-card');
        await expect(cards).toHaveCount(3);
        // 함선 수는 volt-data 기준 실수치 (하드코딩 폴백 240이 아니어야 함)
        const shipsCount = await page.locator('[data-landing-count="ships"]').textContent();
        expect(Number(shipsCount)).toBeGreaterThan(200);
        await expect(page.locator('[data-landing-count="members"]')).not.toHaveText('');
    });

    test('공지 티저: 최신 3건 렌더 + 전체 보기 링크', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        await expect(page.locator('.landing-notice-row')).toHaveCount(3);
        await expect(page.locator('.landing-notice-row').first().locator('.landing-notice-title')).not.toHaveText('');
        await expect(page.locator('.landing-notices-more')).toHaveAttribute('href', '#notices');
    });

    for (const locale of ['ko-KR', 'en-US']) {
        test(`첫 화면 공지: 최신순·번역·직접 열기·초점 복귀 (${locale})`, async ({ browser }) => {
            const context = await browser.newContext({ locale, viewport: { width: 320, height: 844 } });
            const page = await context.newPage();
            await mockApi(page);
            const title = locale === 'en-US' ? 'Latest fleet update <safe>' : '최신 함대 업데이트 <안전>';
            await page.route('**/api/notices', route => route.fulfill({ json: { items: [
                { id: 'old-pin', title: '지난 고정 공지', date: '2026-01-01', pinned: true, content: '이전 공지' },
                { id: 'earlier', title: '먼저 게시한 공지', date: '2026-10-05', updatedAt: '2026-10-05T01:00:00.100Z' },
                { id: 'latest & safe', title: '최신 함대 업데이트 <안전>', titleEn: 'Latest fleet update <safe>', date: '2026-10-05', updatedAt: '2026-10-05T02:00:00.100Z', tag: '시스템', tagEn: 'System', content: '공지 본문', contentEn: 'Notice body' }
            ] } }));
            await gotoSection(page, '');
            const latest = page.locator('.hero-notice-link');
            await expect(latest).toContainText(title);
            await expect(latest).toHaveAttribute('href', '?notice=latest%20%26%20safe#notices');
            await expect(page.locator('.landing-notice-row').first()).toContainText('지난 고정 공지');
            expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
            await latest.click();
            await expect(page.locator('#global-modal-title')).toHaveText(title);
            await page.keyboard.press('Escape');
            await expect(latest).toBeFocused();
            await page.locator('.landing-notice-row').first().click();
            await expect(page.locator('#global-modal-title')).toHaveText('지난 고정 공지');
            await context.close();
        });
    }

    test('공지 없는 첫 화면: 빈 소식 패널 숨김, 주요 메뉴 유지', async ({ page }) => {
        await mockApi(page);
        await page.route('**/api/notices', route => route.fulfill({ json: { items: [] } }));
        await gotoSection(page, '');
        await expect(page.locator('#hero-news')).toBeHidden();
        await expect(page.locator('.hero-action')).toHaveCount(3);
        await page.locator('.hero-action[href="#trade-planner"]').click();
        await expect(page.locator('#trade-planner')).toHaveClass(/active/);
    });

    test('카운트업: 랜딩 SHIPDB 수치가 최종값에 도달', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        // 카운트업 완료 = 같은 값이 연속 2회(250ms 간격) 관측될 때 — 하드 대기 대신 조건 대기 (M0)
        await page.waitForFunction(() => {
            const element = document.querySelector('[data-landing-count="ships"]');
            if (!element) return false;
            const value = element.textContent;
            if (!/^\d{2,3}$/.test(value)) { window.__countupPrev = null; return false; }
            if (window.__countupPrev === value) return true;
            window.__countupPrev = value;
            return false;
        }, { polling: 250, timeout: 8000 });
        await expect(page.locator('[data-landing-count="ships"]')).toHaveText(/^\d{2,3}$/);
    });

    test('카드 라우팅: 함선DB 카드 클릭 → #ships 섹션 전환', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        await page.locator('.landing-card[href="#ships"]').click();
        await expect(page.locator('#ships')).toHaveClass(/active/);
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
    });

    test('reduced-motion: 히어로/랜딩 요소 즉시 표시 + 콘솔 에러 없음', async ({ browser }) => {
        const ctx = await browser.newContext({ reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await mockApi(page);
        await gotoSection(page, '');
        // 모션 비활성 환경에서도 콘텐츠가 온전히 보인다 (keyframe backwards 패턴 검증)
        await expect(page.locator('.hero-copy')).toBeVisible();
        await expect(page.locator('.landing-card').first()).toBeVisible();
        expect(errors).toEqual([]);
        await ctx.close();
    });

    test('D-⑧: 큰 화면에서도 로드 직후엔 하이라이트가 미리 밝혀지지 않음', async ({ browser }) => {
        // 회귀 가드: 히어로 min-height 미확보 + 전역 관찰자(1픽셀 노출 리빌) 조합에서는
        // 큰 모니터에서 하이라이트가 첫 뷰포트에 걸쳐 로드 즉시 밝혀져 등장 모션이 사라진다.
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 2000 } });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        await page.waitForTimeout(400); // 관찰자 초기 콜백이 돌 시간을 주고도 숨겨져 있어야 함
        const before = await page.evaluate(() => getComputedStyle(document.querySelector('.landing-card')).opacity);
        expect(Number(before)).toBeLessThan(1);
        // 스크롤로 진입하면 등장한다
        await page.locator('#home-highlights').scrollIntoViewIfNeeded();
        await expect.poll(async () => page.evaluate(() => getComputedStyle(document.querySelector('.landing-card')).opacity), { timeout: 5000 }).toBe('1');
        await ctx.close();
    });

    test('패럴랙스(D-⑦): 스크롤 후 최상단 복귀 시 히어로 원상 복구', async ({ page }) => {
        // 히어로 콘텐츠는 스크롤에 따라 옅어지지만, y=0으로 돌아오면 인라인 스타일이
        // 제거되어 완전히 복구되어야 한다 (잔존 opacity로 히어로가 흐려지는 회귀 방지).
        await mockApi(page);
        await gotoSection(page, '');
        // J-2: hero copy remains static while the user scrolls.
        await page.evaluate(() => window.scrollTo(0, 600));
        await expect(page.locator('#home .hero-layout')).toHaveCSS('opacity', '1');
    });

    test('에디토리얼 히어로: 핵심 문구를 왼쪽에 배치', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        await expect(page.locator('.hero-status-panel')).toHaveCount(0);
        await expect(page.getByText('COMMAND DECK')).toHaveCount(0);
        await expect(page.locator('.hero-copy')).toHaveCSS('text-align', 'left');
    });

    test('hero headline: 제품 기본 서체에서 클리핑/overflow 없음', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');

        const heading = page.locator('#home h1');
        await expect(heading).not.toHaveCSS('font-family', /VOLT Orbit Display/);
        await expect(heading).toHaveCSS('overflow', 'visible');
        await expect.poll(() => heading.evaluate((element) => (
            element.scrollWidth - element.clientWidth
        ))).toBeLessThanOrEqual(1);
    });

    test('히어로 CTA가 함선DB·무역플래너·가입으로 라우팅', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        const buttons = page.locator('#home .hero-content .hero-buttons .btn');
        await expect(buttons).toHaveCount(3);
        await expect(page.locator('.hero-proof dd').first()).toHaveText('2953');
        await expect(buttons.nth(0)).toHaveClass(/btn-secondary/);
        await expect(buttons.nth(1)).toHaveClass(/btn-secondary/);
        await expect(buttons.nth(2)).toHaveClass(/btn-primary/);
        await buttons.first().click();
        await expect(page.locator('#ships')).toHaveClass(/active/);
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
    });

    test('모바일 390px: 랜딩 가로 overflow 없음', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        // 레이아웃 안정화를 하드 대기 대신 조건 대기로 (M0)
        await expect.poll(async () => page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        ), { timeout: 3000 }).toBeLessThanOrEqual(1);
        await ctx.close();
    });
});
