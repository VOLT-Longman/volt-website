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

    test('카운트업: EST 스탯이 최종값 2953에 도달', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        // 카운트업(0.9s) 완료 후 최종값 — 중간값이 아니라 정확히 2953이어야 함
        await expect(page.locator('.hero-stat-value[data-countup]').first()).toHaveText('2953', { timeout: 5000 });
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
        await expect(page.locator('.hero-stats')).toBeVisible();
        await expect(page.locator('.hero-stat-value[data-countup]').first()).toHaveText('2953');
        await expect(page.locator('.landing-card').first()).toBeVisible();
        expect(errors).toEqual([]);
        await ctx.close();
    });

    test('모바일 390px: 랜딩 가로 overflow 없음', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '');
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        await ctx.close();
    });
});
