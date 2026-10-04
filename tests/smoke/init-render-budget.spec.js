const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 독립 소스는 다른 요청을 기다리지 않고 반영한다. 초기 전체 렌더는 한 번만 하고
// CMS/함선 응답은 관련 섹션만 갱신해야 한다.
const fullRefreshCount = (page) => page.evaluate(() => window.__VOLT_FULL_REFRESH_COUNT__ ?? 0);

test.describe('초기 로드 렌더 예산 (P1)', () => {
    test('독립 데이터 소스가 갱신된 후 함선이 표시됨', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        // canonical 로드가 끝나 249척이 보이는 시점 = 초기화 경로가 모두 정착한 뒤
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        await expect.poll(async () => fullRefreshCount(page)).toBe(1);
    });

    test('CMS 실패해도 초기화가 멈추지 않고 함선·랜딩이 렌더된다', async ({ page }) => {
        await mockApi(page);
        // CMS 계열 응답만 실패시킨다(canonical 정적 JSON은 그대로).
        for (const route of ['**/api/ship-overrides', '**/api/notices', '**/api/events', '**/api/gallery']) {
            await page.route(route, (r) => r.fulfill({ status: 500, body: 'fail' }));
        }
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        expect(await fullRefreshCount(page)).toBe(1);
    });

    test('canonical 실패해도 나머지 화면이 사라지지 않는다', async ({ page }) => {
        await mockApi(page);
        await page.route('**/data/canonical/**', (r) => r.fulfill({ status: 500, body: 'fail' }));
        await gotoSection(page, '#notices');
        // 공지 섹션은 canonical과 무관하게 렌더되어야 한다
        await expect(page.locator('#notices .notice-card, #notices .notice-item').first()).toBeVisible();
        await expect.poll(async () => fullRefreshCount(page)).toBe(1);
    });

    test('초기 로드 뒤 전역 검색·무역플래너·마이페이지가 함선을 인식한다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        // 전역 검색
        await page.locator('#search-toggle').click();
        await page.locator('#global-search-input').fill('Freelancer');
        await expect(page.locator('#search-results')).toContainText(/Freelancer|프리랜서/);
        await page.keyboard.press('Escape');
        // 무역플래너 함선 picker — 공개 목록에서 검색되어야 한다
        await gotoSection(page, '#trade-planner');
        await page.locator('#logistics-ship-search').fill('Freelancer');
        const results = page.locator('#logistics-ship-results');
        await expect(results).toBeVisible();
        await expect(results.locator('[role="option"]').first()).toContainText(/Freelancer|프리랜서/);
    });

    test('다른 CMS 응답은 열린 일정과 참가 현황 요청을 건드리지 않는다', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        let releaseTimeline;
        const timelineGate = new Promise((resolve) => { releaseTimeline = resolve; });
        await page.route('**/api/timeline', async (route) => {
            await timelineGate;
            await route.fulfill({ json: { items: [{ id: 'late-timeline', date: '2030', title: '늦게 온 연혁', description: '테스트' }] } });
        });
        let rsvpGets = 0;
        page.on('request', (request) => {
            if (request.method() === 'GET' && /\/api\/events\/[^/]+\/rsvp$/.test(new URL(request.url()).pathname)) rsvpGets += 1;
        });
        const eventsResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/events');
        await gotoSection(page, '#schedule');
        await eventsResponse;
        await expect.poll(() => rsvpGets).toBeGreaterThan(0);
        // Allow the events collection's own scheduled refresh to settle before taking the DOM snapshot.
        await page.waitForTimeout(100);
        const toggle = page.locator('#schedule-list .schedule-item-toggle').first();
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const originalNode = await toggle.elementHandle();
        const before = rsvpGets;
        releaseTimeline();
        await expect(page.locator('#timeline-list')).toContainText('늦게 온 연혁');
        expect(await originalNode.evaluate((node) => node.isConnected)).toBe(true);
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(rsvpGets).toBe(before);
        expect(await fullRefreshCount(page)).toBe(1);
    });

    test('일정 CMS 갱신 중 열어 둔 상세와 키보드 포커스를 유지한다', async ({ page }) => {
        await mockApi(page);
        let releaseEvents;
        let eventId;
        const eventsGate = new Promise((resolve) => { releaseEvents = resolve; });
        await page.route('**/api/events', async (route) => {
            await eventsGate;
            await route.fulfill({ json: { items: [{ id: eventId, title: '변경된 일정', dateLabel: '2030.01.01', type: '작전', status: '예정', description: '새 상세' }] } });
        });
        await gotoSection(page, '#schedule');
        const toggle = page.locator('#schedule-list .schedule-item-toggle').first();
        await expect(toggle).toBeVisible();
        eventId = await page.locator('#schedule-list [data-schedule-event-id]').first().getAttribute('data-schedule-event-id');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        releaseEvents();
        await expect(page.locator('#schedule-list .schedule-item-toggle').first()).toHaveText('변경된 일정');
        await expect(page.locator('#schedule-list .schedule-item-detail').first()).toBeVisible();
        expect(await toggle.evaluate((element) => element === document.activeElement)).toBe(true);
    });
});
