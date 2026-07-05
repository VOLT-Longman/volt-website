const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// P2-4 CSS 정리 회귀 가드: 통합한 .gallery-empty 계산값 유지 + 주요 섹션 모바일 overflow 없음.
test.describe('CSS 회귀 (P2-4)', () => {
    test('.gallery-empty 통합: 최종 계산값 유지', async ({ page }) => {
        await mockApi(page);
        await page.route('**/api/gallery', (route) => route.fulfill({ json: { items: [] } }));
        await gotoSection(page, '#gallery');

        const empty = page.locator('.gallery-empty');
        await expect(empty).toBeVisible();
        const styles = await empty.evaluate((el) => {
            const s = getComputedStyle(el);
            return { display: s.display, padding: s.padding, textAlign: s.textAlign, justifyItems: s.justifyItems };
        });
        // last-wins 통합 결과: display grid / padding 64px 24px / center 정렬.
        expect(styles.display).toBe('grid');
        expect(styles.padding).toBe('64px 24px');
        expect(styles.textAlign).toBe('center');
        expect(styles.justifyItems).toBe('center');
    });

    // P3-2: 여러 모바일/태블릿 폭 + EN 모드(긴 문장)에서 가로 overflow 회귀 가드.
    for (const width of [390, 430, 768]) {
        for (const section of ['trade-planner', 'ships', 'notices', 'leadership', 'gallery', 'mypage']) {
            test(`${width}px EN: #${section} 가로 overflow 없음`, async ({ browser }) => {
                const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US' });
                const page = await ctx.newPage();
                await mockApi(page, { loggedIn: true });
                await gotoSection(page, `#${section}`);
                await page.waitForTimeout(150);
                const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
                expect(noOverflow, `#${section} @${width}px 가로 스크롤 발생`).toBe(true);
                await ctx.close();
            });
        }
    }

    test('터치 타깃: 함선 격납고 토글 버튼 ≥36px', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '#ships');
        const box = await page.locator('#ships-grid .hangar-toggle-btn').first().boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(36);
        expect(box.height).toBeGreaterThanOrEqual(36);
        await ctx.close();
    });

    // dead cascade 블록 제거(중복 selector 155→129) 회귀 가드: 정리한 selector들의
    // 대표 계산값을 고정한다. 제거 전후 computed style 전량 비교(58키 동일)로 검증된 값.
    const CASCADE_GUARDS = [
        { hash: '', selector: '#scroll-to-top', props: { width: '44px', height: '44px', position: 'fixed', zIndex: '900' } },
        { hash: '', selector: '.splash-bar', props: { width: '200px', height: '2px' } },
        { hash: '', selector: '#theme-toggle', props: { width: '42px', height: '42px' } },
        { hash: '', selector: '.hub-description', props: { fontSize: '16px', lineHeight: '28.8px' } },
        { hash: '#ships', selector: '.ship-search', props: { maxWidth: '420px', fontSize: '14px' } },
        { hash: '#ships', selector: '.ships-controls', props: { display: 'flex', flexDirection: 'column', marginBottom: '40px' } },
        { hash: '#ships', selector: '.ship-name', props: { fontSize: '24px', fontWeight: '600' } },
        { hash: '#notices', selector: '.notices-grid', props: { display: 'flex', maxWidth: '920px' } },
        { hash: '#notices', selector: '.notice-card', props: { display: 'block', cursor: 'pointer', textAlign: 'left' } },
        { hash: '#notices', selector: '.notice-meta', props: { display: 'flex', alignItems: 'center' } },
        { hash: '#notices', selector: '.notice-date', props: { fontSize: '12px', color: 'rgb(134, 134, 139)' } },
        { hash: '#schedule', selector: '.schedule-date', props: { fontSize: '13px', fontWeight: '600' } },
        { hash: '#schedule', selector: '.schedule-status', props: { fontSize: '13px', textTransform: 'uppercase' } },
        { hash: '#policy', selector: '.policy-section-title', props: { marginBottom: '20px', fontSize: '20px' } },
        { hash: '#guide', selector: '.guide-tool-icon', props: { fontSize: '20px', marginBottom: '12px' } },
        { hash: '#trade-planner', selector: '.trade-planner-form', props: { display: 'grid' } },
    ];
    test('cascade 정리 회귀 가드: 대표 계산값 유지 (데스크톱)', async ({ page }) => {
        await mockApi(page);
        for (const guard of CASCADE_GUARDS) {
            await gotoSection(page, guard.hash);
            const actual = await page.evaluate(({ selector, propNames }) => {
                const el = document.querySelector(selector);
                if (!el) return null;
                const cs = getComputedStyle(el);
                return Object.fromEntries(propNames.map((p) => [p, cs[p]]));
            }, { selector: guard.selector, propNames: Object.keys(guard.props) });
            expect(actual, `${guard.hash || 'home'} ${guard.selector} 요소 없음`).not.toBeNull();
            expect(actual, `${guard.hash || 'home'} ${guard.selector}`).toEqual(guard.props);
        }
    });

    test('cascade 정리 회귀 가드: 모바일 390px 단일 열 그리드 유지', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await ctx.newPage();
        await mockApi(page);
        for (const { hash, selector } of [
            { hash: '#ships', selector: '.ships-grid' },
            { hash: '#gallery', selector: '.gallery-grid' },
            { hash: '#trade-planner', selector: '.trade-planner-form' },
        ]) {
            await gotoSection(page, hash);
            const columns = await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                return el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : null;
            }, selector);
            expect(columns, `${hash} ${selector} 단일 열이어야 함`).toBe(1);
        }
        await ctx.close();
    });
});
