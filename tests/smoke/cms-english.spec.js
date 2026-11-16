const { test, expect } = require('@playwright/test');

test('English headings and content use real public CMS response mappings, and switch back to Korean', async ({ page }) => {
    const { mapEvent, mapGallery, mapLeader, mapPartnerFleet, mapTimelineEntry, mapNotice } = await import('../../functions/_shared/cms.js');
    const fixtures = {
        events: [mapEvent({ id: 'test-event', title: '작전 원문', description: '일정 원문', published: 1, translations_json: JSON.stringify({ title: 'Translated operation', description: 'Translated event body', type: 'Operation', status: 'Confirmed' }) })],
        gallery: [mapGallery({ id: 'test-photo', title: '사진 원문', description: '사진 설명', image_url: '/assets/volt-logo.png', published: 1, translations_json: JSON.stringify({ title: 'Translated photo', description: 'Translated photo description', category: 'Operation' }) })],
        leadership: [mapLeader({ id: 'ceo', name: '원문 관리자', role: '대표이사', description: '임원 원문', published: 1, extras: JSON.stringify({ details: [{ title: '철학', content: '철학 원문' }], competencies: ['역량 원문'] }), translations_json: JSON.stringify({ name: 'Test Leader', role: 'Chief Executive Officer', description: 'Translated leader description', details: [{ title: 'Philosophy', content: 'Translated philosophy' }], competencies: ['Translated competence'] }) })],
        'partner-fleets': [mapPartnerFleet({ id: 'test-partner', name: '협력함대 원문', region: '한국', established: '2613년', published: 1, translations_json: JSON.stringify({ name: 'Test Partner', region: 'Korea', established: 'Year 2613', description: 'Translated partner description' }) })],
        timeline: [mapTimelineEntry({ id: 'test-timeline', title: '연혁 원문', description: '연혁 설명', published: 1, translations_json: JSON.stringify({ title: 'Translated history', description: 'Translated history body' }) })],
        notices: [mapNotice({ id: 'test-notice', title: '공지 원문', content: '공지 본문', title_en: 'Translated notice', content_en: 'Translated notice body', tag_en: 'System', published: 1, date: '2026-10-05' })]
    };
    for (const [endpoint, items] of Object.entries(fixtures)) await page.route(`**/api/${endpoint}`, (route) => route.fulfill({ json: { items } }));
    await page.goto('/#leadership');
    await page.locator('.nav-lang [data-set-lang="en"]').click();
    await expect(page.locator('#leadership-grid')).toContainText('Test Leader');
    await expect(page.locator('#leadership-grid')).toContainText('Translated competence');
    const headings = await page.locator('main .section-header h2').allTextContents();
    expect(headings.length).toBe(18);
    for (const heading of headings) expect(heading).not.toMatch(/[가-힣]/);
    await page.locator('#leadership-grid [data-leader-id="ceo"]').click();
    await expect(page.locator('.modal-backdrop')).toContainText('Translated philosophy');
    await page.locator('.modal-backdrop .modal-close').click();
    for (const [selector, text] of [['#partner-fleets-grid', 'Year 2613'], ['#timeline-list', 'Translated history'], ['#gallery-grid', 'Translated photo'], ['#schedule-list', 'Translated operation'], ['#notices-list', 'Translated notice']]) { await page.goto('/#' + ({ '#partner-fleets-grid': 'partner-fleets', '#timeline-list': 'timeline', '#gallery-grid': 'gallery', '#schedule-list': 'schedule', '#notices-list': 'notices' }[selector])); await expect(page.locator(selector)).toContainText(text); }
    await page.locator('.nav-lang [data-set-lang="ko"]').click();
    await expect(page.locator('#leadership-grid')).toContainText('원문 관리자');
    await expect(page.locator('#notices-list')).toContainText('공지 원문');
});

test('CMS exposes and submits English fields, and safely displays the history author', async ({ page }) => {
    await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
    await page.route('**/api/admin/notices{,?*}', (route) => route.fulfill({ json: { items: [] } }));
    let payload;
    await page.route('**/api/admin/events{,?*}', (route) => {
        if (route.request().method() === 'POST') { payload = route.request().postDataJSON(); return route.fulfill({ json: { item: { ...payload, id: 'saved' } } }); }
        return route.fulfill({ json: { items: [] } });
    });
    await page.route('**/api/admin/history?*', (route) => route.fulfill({ json: { items: [{ id: 1, itemId: 'saved', action: 'create', createdAt: '2026-10-05T00:00:00Z', actor: JSON.stringify({ name: '<img src=x onerror=alert(1)>', method: 'discord' }), after: { title: '작전' } }] } }));
    await page.goto('/admin/');
    await page.locator('[data-tab="events"]').click();
    await page.locator('[name="title"]').fill('작전');
    await page.getByText('영어 콘텐츠 (EN)', { exact: true }).click();
    await page.locator('[name="titleEn"]').fill('Mission');
    await page.locator('[name="descriptionEn"]').fill('English mission description');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect.poll(() => payload?.titleEn).toBe('Mission');
    await page.locator('#history-panel summary').click();
    await page.locator('#history-load').click();
    await expect(page.locator('#history-result')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('#history-result img')).toHaveCount(0);
});
