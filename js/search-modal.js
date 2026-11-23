/**
 * VOLT 전역 검색 모달 — main.js에서 분리.
 *
 * 전 섹션 콘텐츠/로컬라이즈를 색인해 오버레이에서 검색하고 결과로 이동한다.
 * 데이터·내비게이션·함선 헬퍼는 main.js에서 init(deps)로 주입한다.
 * 로드 순서: ships.js 다음, main.js 이전.
 */
(function () {
    'use strict';

    let searchIndexCache = null;
    let lastSearchTrigger = null;

    // main.js 주입 의존성(이름 동일 → 이동 코드 무수정).
    let data, localization, escapeHtml, i18nT, trackEvent, getShipById, getShipSearchEntries,
        resetShipState, openShipModal, showSection, closeMoreMenu, closeTradeMenu, setMobileMenuState;

    function init(deps) {
        ({
            data, localization, escapeHtml, i18nT, trackEvent, getShipById, getShipSearchEntries,
            resetShipState, openShipModal, showSection, closeMoreMenu, closeTradeMenu, setMobileMenuState,
        } = deps || {});
    }

    function t(key, fallback) {
        return i18nT ? i18nT(key, fallback) : (fallback || key);
    }

    function invalidateSearchCache() {
        searchIndexCache = null;
        const input = document.querySelector('#search-overlay.active #global-search-input');
        if (input) renderSearchResults(input.value);
    }
    function setupSearch() {
        const overlay = document.getElementById('search-overlay');
        const desktopButton = document.getElementById('search-toggle');
        const mobileButton = document.getElementById('mobile-search-toggle');
        const closeButton = document.getElementById('search-close');
        const input = document.getElementById('global-search-input');
        if (!overlay || !desktopButton || !mobileButton || !closeButton || !input) return;
        desktopButton.addEventListener('click', () => openSearch(overlay, input, desktopButton));
        const headerButton = document.getElementById('header-search-toggle');
        headerButton?.addEventListener('click', () => openSearch(overlay, input, headerButton));
        mobileButton.addEventListener('click', () => openSearch(overlay, input, mobileButton));
        closeButton.addEventListener('click', () => closeSearch(overlay, input));
        overlay.addEventListener('click', (event) => { if (event.target === overlay) closeSearch(overlay, input); });
        input.addEventListener('input', () => renderSearchResults(input.value));
        input.addEventListener('keydown', event => {
            if (event.isComposing || event.keyCode === 229) return;
            const first = overlay.querySelector('.search-result');
            if (!first) return;
            if (event.key === 'Enter') {
                event.preventDefault();
                first.click();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                first.focus();
            }
        });
        document.getElementById('search-more')?.addEventListener('click', () => {
            const shown = overlay.querySelectorAll('.search-result').length;
            renderSearchResults(input.value, shown + 12);
            overlay.querySelectorAll('.search-result')[shown]?.focus();
        });
        openSearchFromQuery(overlay, input);
    }

    function openSearchFromQuery(overlay, input) {
        const query = new URLSearchParams(window.location.search).get('search')?.trim();
        if (!query) return;
        openSearch(overlay, input);
        input.value = query;
        renderSearchResults(query);
    }

    function openSearch(overlay, input, trigger = document.activeElement) {
        if (!overlay || !input) return;
        lastSearchTrigger = trigger instanceof HTMLElement ? trigger : null;
        closeMoreMenu();
        closeTradeMenu();
        const mobileMenu = document.getElementById('mobileMenu');
        const hamburger = document.getElementById('hamburger');
        if (mobileMenu && hamburger && mobileMenu.classList.contains('active')) {
            // 검색을 열면 모바일 메뉴는 숨겨진다. 닫을 때는 화면에 남는 버튼으로 돌아간다.
            lastSearchTrigger = hamburger;
            setMobileMenuState(mobileMenu, hamburger, false);
        }
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        input.value = '';
        renderSearchResults('');
        input.focus();
    }

    function closeSearch(overlay, input) {
        if (!overlay || !input) return;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        input.value = '';
        if (lastSearchTrigger?.isConnected) lastSearchTrigger.focus({ preventScroll: true });
        lastSearchTrigger = null;
        const url = new URL(window.location.href);
        if (url.searchParams.has('search')) {
            url.searchParams.delete('search');
            history.replaceState(history.state, '', url);
        }
    }

    function localized(item, field) {
        const en = window.VOLT_I18N?.getLang?.() === 'en';
        return en ? (item[field + 'En'] || item[field + '_en'] || item[field] || '') : (item[field] || '');
    }

    function menuShortcuts() {
        const featured = ['routes', 'market', 'missions', 'mining', 'fabricator', 'starmap'];
        const links = document.querySelectorAll('#nav .nav-links a[data-section][href^="#"]');
        const shortcuts = Array.from(links, link => {
            const section = link.dataset.section;
            const title = link.textContent.trim();
            const heading = document.getElementById(section)?.querySelector('.section-header h2')?.textContent.trim() || '';
            const featuredIndex = featured.indexOf(section);
            const body = featuredIndex >= 0 ? t(section + '.subtitle') : '';
            const item = makeSearchItem('search.shortcut', section, title, body);
            return { ...item, menuName: (title + '|' + heading).toLowerCase().replace(/\s+/g, ''), featuredIndex };
        });
        return shortcuts;
    }

    function buildSearchIndex() {
        if (searchIndexCache) return searchIndexCache;
        const result = [
            ...menuShortcuts(),
            ...data.announcements.map((item) => makeSearchItem('search.type.notices', 'notices', localized(item, 'title'), localized(item, 'content'), item.id)),
            // ON에서는 메인 함선DB와 같은 공개 집합(Erkul 219 + RSI 공식 30)만 색인한다.
            ...shipSearchEntries().map(({ ship, title, body }) => makeSearchItem('search.type.ships', 'ships', title, body, ship.id)),
            ...data.faq.map((item, index) => makeSearchItem('search.type.faq', 'faq', localized(item, 'q'), localized(item, 'a'), String(index))),
            ...data.timeline.map((item) => makeSearchItem('search.type.timeline', 'timeline', localized(item, 'title'), localized(item, 'description'))),
            ...data.leadership.map((item) => makeSearchItem('search.type.leadership', 'leadership', localized(item, 'name'), `${localized(item, 'role')} ${localized(item, 'description')}`)),
            ...(Array.isArray(data.partnerFleets) ? data.partnerFleets.map((item) => makeSearchItem('search.type.partnerFleets', 'partner-fleets', localized(item, 'name'), `${localized(item, 'region') || ''} ${localized(item, 'game') || ''} ${localized(item, 'focus') || ''} ${localized(item, 'description') || ''}`)) : []),
            ...data.departments.map((item) => makeSearchItem('search.type.about', 'about', localized(item, 'name'), localized(item, 'description'))),
            ...data.coreValues.map((item) => makeSearchItem('search.type.values', 'about', localized(item, 'title'), localized(item, 'description'))),
            ...data.calendar.map((item) => makeSearchItem('search.type.schedule', 'schedule', localized(item, 'title'), localized(item, 'description'), String(item.id || item.title || '').trim().replace(/\s+/g, '-'))),
            ...data.tradeGuide.map((item) => makeSearchItem('search.type.guide', 'guide', localized(item, 'title'), [localized(item, 'content'), ...localized(item, 'steps')].join(' '))),
            ...data.joinSteps.map((item) => makeSearchItem('search.type.join', 'join', localized(item, 'title'), localized(item, 'description'))),
            ...data.gallery.map((item) => makeSearchItem('search.type.gallery', 'gallery', localized(item, 'title'), localized(item, 'description'))),
            ...data.policy.sections.map((item, index) => makeSearchItem('search.type.policy', 'policy', localized(item, 'title'), item.items.map((policyItem) => localized(policyItem, 'text')).join(' '), String(index + 1))),
            ...getLocalizationSearchItems()
        ];
        searchIndexCache = result;
        return searchIndexCache;
    }
    // 함선 검색 대상은 공개 ShipDB(canonical 219 + RSI 공식 30)뿐이다. main.js가 목록을 소유한다.
    function shipSearchEntries() {
        return typeof getShipSearchEntries === 'function' ? getShipSearchEntries() : [];
    }

    function getLocalizationSearchItems() {
        const commodities = Object.entries(localization.commodities || {}).map(([name, value]) => {
            const label = typeof value === 'string' ? value : [value.ko, value.desc].filter(Boolean).join(' ');
            return makeSearchItem('search.type.commodity', 'trade-planner', name, label);
        });
        const locations = Object.entries(localization.locations || {}).map(([name, value]) => makeSearchItem('search.type.location', 'trade-planner', name, String(value)));
        const terminals = Object.entries(localization.terminals || {}).map(([name, value]) => makeSearchItem('search.type.terminal', 'trade-planner', name, String(value)));
        const glossary = Object.entries(localization.glossary || {}).map(([term, label]) => makeSearchItem('search.type.glossary', 'guide', term, String(label)));
        return [...commodities, ...locations, ...terminals, ...glossary];
    }

    function makeSearchItem(typeKey, section, title, body, itemId = '') {
        return { typeKey, section, title, body, itemId, haystack: `${title} ${body}`.toLowerCase() };
    }

    // 본문 전체는 색인에 남기고, 결과에는 검색어 주변의 짧은 문맥만 보여 준다.
    function searchExcerpt(body, query) {
        const text = String(body || '').replace(/\s+/g, ' ').trim();
        const limit = 160;
        if (text.length <= limit) return text;
        const match = query ? text.toLowerCase().indexOf(query.replace(/\s+/g, ' ')) : -1;
        const start = Math.min(Math.max(0, match - 32), text.length - limit);
        const end = start + limit;
        return `${start ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
    }

    function renderSearchResults(query, limit = 12) {
        const container = document.getElementById('search-results');
        if (!container) return;
        const normalized = query.trim().toLowerCase();
        const index = buildSearchIndex();
        const compact = normalized.replace(/\s+/g, '');
        const shortcuts = index.filter(item => item.menuName && (normalized
            ? item.menuName.includes(compact) || item.haystack.includes(normalized)
            : item.featuredIndex >= 0));
        if (!normalized) shortcuts.sort((a, b) => a.featuredIndex - b.featuredIndex);
        const matches = index.filter(item => !item.menuName && (!normalized || item.haystack.includes(normalized)));
        const all = [...shortcuts, ...matches];
        const results = all.slice(0, limit);
        document.getElementById('search-count').textContent = !normalized ? '' : t('audit.count').replace('{total}', all.length).replace('{shown}', results.length);
        document.getElementById('search-more').hidden = !normalized || results.length === all.length;
        if (results.length === 0) {
            container.innerHTML = `<div class="search-empty">${escapeHtml(t('search.empty', '검색 결과가 없습니다.'))}</div>`;
            return;
        }
        container.innerHTML = results.map((item) => `
            <button class="search-result" type="button" data-search-section="${escapeHtml(item.section)}" data-search-item-id="${escapeHtml(item.itemId)}">
                <span class="search-result-type">${escapeHtml(t(item.typeKey, item.typeKey))}</span>
                <span class="search-result-title">${escapeHtml(item.title)}</span>
                <span class="search-result-summary">${escapeHtml(searchExcerpt(item.body, normalized))}</span>
            </button>`).join('');
        container.querySelectorAll('[data-search-section]').forEach((button) => {
            button.addEventListener('click', () => selectSearchResult(button.getAttribute('data-search-section'), button.getAttribute('data-search-item-id')));
        });
    }

    function selectSearchResult(section, itemId = '') {
        const overlay = document.getElementById('search-overlay');
        const input = document.getElementById('global-search-input');
        if (overlay && input) closeSearch(overlay, input);
        trackEvent('search_result_select', { section, itemId });
        if (section === 'ships' && itemId) resetShipState();
        showSection(section);
        if (section === 'ships' && itemId) focusShipResult(itemId);
        if (itemId && ['faq', 'policy', 'schedule'].includes(section)) {
            let target;
            if (section === 'faq') target = document.getElementById('faq-q-' + itemId);
            if (section === 'policy') target = document.querySelector('#policy-section-' + CSS.escape(itemId) + ' .policy-anchor-copy');
            if (section === 'schedule') target = document.querySelector('[data-schedule-event-id="' + CSS.escape(itemId) + '"] .schedule-item-toggle');
            if (target?.getAttribute('aria-expanded') === 'false') target.click();
            target?.focus({ preventScroll: true });
            target?.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
        if (section === 'notices' && itemId) {
            const notice = window.VOLT_NOTICES?.findAnnouncement(itemId);
            if (notice) window.VOLT_NOTICES.openNoticeModal(notice);
        }
    }

    function focusShipResult(shipId) {
        const ship = getShipById(shipId);
        if (!ship) return;
        const card = document.querySelector(`[data-ship-id="${CSS.escape(shipId)}"]`);
        card?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
        openShipModal(ship);
    }

    window.VOLT_SEARCH = { init, setup: setupSearch, invalidateCache: invalidateSearchCache };
})();
