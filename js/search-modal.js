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
    let data, localization, escapeHtml, i18nT, trackEvent, getShipAliases, getShipById,
        resetShipState, openShipModal, showSection, closeMoreMenu, closeTradeMenu, setMobileMenuState;

    function init(deps) {
        ({
            data, localization, escapeHtml, i18nT, trackEvent, getShipAliases, getShipById,
            resetShipState, openShipModal, showSection, closeMoreMenu, closeTradeMenu, setMobileMenuState,
        } = deps || {});
    }

    function t(key, fallback) {
        return i18nT ? i18nT(key, fallback) : (fallback || key);
    }

    function invalidateSearchCache() {
        searchIndexCache = null;
    }
    // role 이관(PM): ON이면 canonical role(EN+KO)을 색인, OFF면 legacy item.role. canonical load 후
    // main.js가 invalidateSearchCache()를 호출해 재색인된다. canonical role 없으면 색인 제외('').
    function shipSearchRole(item) {
        const c = window.VOLT_SHIPDB_CANONICAL;
        if (c && c.isEnabled()) {
            const rec = c.getShip(item.id);
            return rec && rec.role ? `${rec.role} ${c.roleKo(rec.role) || ''}` : '';
        }
        return item.role || '';
    }
    // live 레이어(지연 로드)의 번역/영문 설명. 로드 전이면 빈 문자열 — 로드 완료 시
    // main.js가 invalidateSearchCache()를 호출해 색인이 재구성된다.
    function shipLiveDescriptionText(ship) {
        const live = (window.VOLT_SHIP_LIVE_STATS || {})[ship.id];
        if (!live || !live.descriptions) return '';
        return [live.descriptions.ko, live.descriptions.en].filter(Boolean).join(' ');
    }
    function setupSearch() {
        const overlay = document.getElementById('search-overlay');
        const desktopButton = document.getElementById('search-toggle');
        const mobileButton = document.getElementById('mobile-search-toggle');
        const closeButton = document.getElementById('search-close');
        const input = document.getElementById('global-search-input');
        if (!overlay || !desktopButton || !mobileButton || !closeButton || !input) return;
        desktopButton.addEventListener('click', () => openSearch(overlay, input, desktopButton));
        mobileButton.addEventListener('click', () => openSearch(overlay, input, mobileButton));
        closeButton.addEventListener('click', () => closeSearch(overlay, input));
        overlay.addEventListener('click', (event) => { if (event.target === overlay) closeSearch(overlay, input); });
        input.addEventListener('input', () => renderSearchResults(input.value));
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
    }

    function buildSearchIndex() {
        if (searchIndexCache) return searchIndexCache;
        const result = [
            ...data.announcements.map((item) => makeSearchItem('search.type.notices', 'notices', item.title, item.content)),
            // 함선 설명은 legacy(volt-data)와 화면 표시용 Erkul 번역(live 레이어, 로드된 경우) 모두 색인 (C-1).
            ...data.ships.map((item) => makeSearchItem('search.type.ships', 'ships', item.name, `${item.manufacturer} ${shipSearchRole(item)} ${item.description} ${shipLiveDescriptionText(item)} ${getShipAliases(item).join(' ')}`, item.id)),
            ...data.faq.map((item) => makeSearchItem('search.type.faq', 'faq', item.q, item.a)),
            ...data.timeline.map((item) => makeSearchItem('search.type.timeline', 'timeline', item.title, item.description)),
            ...data.leadership.map((item) => makeSearchItem('search.type.leadership', 'leadership', item.name, `${item.role} ${item.description}`)),
            ...(Array.isArray(data.partnerFleets) ? data.partnerFleets.map((item) => makeSearchItem('search.type.partnerFleets', 'partner-fleets', item.name, `${item.region || ''} ${item.game || ''} ${item.focus || ''} ${item.description || ''}`)) : []),
            ...data.departments.map((item) => makeSearchItem('search.type.about', 'about', item.name, item.description)),
            ...data.coreValues.map((item) => makeSearchItem('search.type.values', 'about', item.title, item.description)),
            ...data.calendar.map((item) => makeSearchItem('search.type.schedule', 'schedule', item.title, item.description)),
            ...data.tradeGuide.map((item) => makeSearchItem('search.type.guide', 'guide', item.title, item.content)),
            ...data.joinSteps.map((item) => makeSearchItem('search.type.join', 'join', item.title, item.description)),
            ...data.gallery.map((item) => makeSearchItem('search.type.gallery', 'gallery', item.title, item.description)),
            ...data.policy.sections.map((item) => makeSearchItem('search.type.policy', 'policy', item.title, item.items.map((policyItem) => policyItem.text).join(' '))),
            ...getLocalizationSearchItems()
        ];
        searchIndexCache = result;
        return searchIndexCache;
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

    function renderSearchResults(query) {
        const container = document.getElementById('search-results');
        if (!container) return;
        const normalized = query.trim().toLowerCase();
        const results = buildSearchIndex().filter((item) => !normalized || item.haystack.includes(normalized)).slice(0, 12);
        if (results.length === 0) {
            container.innerHTML = `<div class="search-empty">${escapeHtml(t('search.empty', '검색 결과가 없습니다.'))}</div>`;
            return;
        }
        container.innerHTML = results.map((item) => `
            <button class="search-result" type="button" data-search-section="${escapeHtml(item.section)}" data-search-item-id="${escapeHtml(item.itemId)}">
                <span class="search-result-type">${escapeHtml(t(item.typeKey, item.typeKey))}</span>
                <span class="search-result-title">${escapeHtml(item.title)}</span>
                <span class="search-result-summary">${escapeHtml(item.body)}</span>
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
        if (section === 'ships') resetShipState();
        showSection(section);
        if (section === 'ships' && itemId) focusShipResult(itemId);
    }

    function focusShipResult(shipId) {
        const ship = getShipById(shipId);
        if (!ship) return;
        const card = document.querySelector(`[data-ship-id="${CSS.escape(shipId)}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        openShipModal(ship);
    }

    window.VOLT_SEARCH = { init, setup: setupSearch, invalidateCache: invalidateSearchCache };
})();
