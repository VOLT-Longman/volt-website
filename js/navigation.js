/**
 * VOLT Navigation / Router (main.js에서 분리)
 *
 * 섹션 전환, hash 라우팅, active nav 표시, 데스크톱 드롭다운/모바일 메뉴를 담당한다.
 * main.js와는 전역 `window.VOLT_NAV`로 연결되며, main.js의 기능 함수는
 * `init(deps)`로 주입받는다: trackEvent, observeNewReveals, openNoticeFromQuery,
 * trapFocus, getFocusableElements.
 *
 * 로드 순서: 이 파일은 main.js보다 먼저 로드되어야 한다(main.js가 시작 시
 * window.VOLT_NAV를 구조분해로 참조).
 */
(function () {
    'use strict';

    let deps = {};

    const VALID_SECTIONS = ['about', 'timeline', 'leadership', 'partner-fleets', 'hub', 'streamers', 'gallery', 'join', 'mypage', 'notices', 'ships', 'loadout', 'trade-planner', 'schedule', 'policy', 'faq', 'guide', 'mining', 'hauling', 'gear', 'ai', 'comms', 'routes', 'market', 'tours', 'missions', 'fabricator'];
    // 도우미 도구 섹션은 주소 뒤에 화면 상태를 붙일 수 있다: #routes?from=...  (형식: docs/helper-tools.md)
    const PARAM_SECTIONS = ['routes', 'market', 'tours', 'missions', 'fabricator', 'mining', 'hauling'];

    function updateActiveNav(id) {
        document.querySelectorAll('.nav-links [data-section]').forEach((link) => {
            link.classList.toggle('nav-active', link.getAttribute('data-section') === id);
        });
        document.getElementById('nav-trade-toggle')?.classList.toggle('nav-active', ['trade-planner', 'routes', 'market', 'tours', 'hub', 'guide'].includes(id));
        document.getElementById('nav-work-toggle')?.classList.toggle('nav-active', ['missions', 'hauling', 'mining', 'fabricator'].includes(id));
        document.getElementById('nav-ships-toggle')?.classList.toggle('nav-active', ['ships', 'loadout', 'gear'].includes(id));
        document.getElementById('nav-more-toggle')?.classList.toggle('nav-active', ['timeline', 'leadership', 'streamers', 'gallery', 'policy', 'faq', 'comms'].includes(id));
    }

    // 뒤로·앞으로 가기인지 알아 둔다 (Navigation API 가 있는 브라우저만. 없으면 예전처럼 동작한다).
    let lastNavigationType = null;
    try {
        window.navigation?.addEventListener?.('navigate', (event) => { lastNavigationType = event.navigationType || null; });
    } catch (_error) { /* 지원하지 않는 브라우저 */ }

    function showSection(id, push = true, anchorId = null) {
        deps.trackEvent?.('section_view', { section: id });
        // 지연 렌더 섹션(예: 함선DB·갤러리)은 첫 진입 시 main.js가 콘텐츠를 채운다.
        deps.onSectionShow?.(id);
        // 도우미 도구 화면(js/helper-common.js)은 여기서 처음 그리고, 다시 열릴 때는 주소 값을 넘긴다.
        window.VOLT_HELPER?.onSectionShow?.(id);
        const home = document.getElementById('home');
        if (!home) return;
        // 주소 값만 바뀌고 같은 섹션이 그대로 열려 있는 경우(#missions?m=1 → #missions): 섹션을 숨겼다 다시 켜지 않는다.
        const stays = !push && id !== 'home' && Boolean(document.getElementById(id)?.classList.contains('active'));
        if (!stays) {
            document.querySelectorAll('.section').forEach((section) => { section.classList.remove('active'); });
            if (id === 'home') {
                home.style.display = 'flex';
            } else {
                home.style.display = 'none';
                activateSection(id);
            }
        }
        // 같은 섹션 안에서 뒤로·앞으로 간 것이면 맨 위로 올리지 않는다: 브라우저와 화면이 보던 자리로 돌려놓는다.
        if (!(stays && lastNavigationType === 'traverse')) {
            window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        }
        window.VOLT_CINEMATIC?.onSectionChange?.(id);
        updateActiveNav(id);
        deps.updateDocumentTitle?.(id);
        window.VOLT_HELPER?.updateTitle?.(id);
        if (anchorId) scrollToAnchor(anchorId);
        if (push) updateHistory(id);
        if (id === 'notices') deps.openNoticeFromQuery?.();
    }

    function activateSection(id) {
        const target = document.getElementById(id);
        if (!target) return;
        target.classList.add('active');
        deps.observeNewReveals?.(target);
    }

    function updateHistory(id) {
        const hash = id === 'home' ? '' : `#${id}`;
        history.pushState({ section: id }, '', hash || window.location.pathname);
    }

    function parseRouteFromHash() {
        const hash = window.location.hash.replace('#', '');
        if (hash === 'comms-usage') return { section: 'comms', anchorId: hash };
        const policyMatch = hash.match(/^policy-section-(\d+)$/);
        if (policyMatch) return { section: 'policy', anchorId: hash };
        const paramCut = hash.indexOf('?');
        if (paramCut > 0 && PARAM_SECTIONS.includes(hash.slice(0, paramCut))) return { section: hash.slice(0, paramCut), anchorId: null };
        return {
            section: VALID_SECTIONS.includes(hash) ? hash : 'home',
            anchorId: null
        };
    }

    function scrollToAnchor(anchorId) {
        window.requestAnimationFrame(() => {
            document.getElementById(anchorId)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
        });
    }

    function getInitialRoute() {
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation?.type === 'reload') {
            const route = parseRouteFromHash();
            const homeUrl = window.location.pathname + window.location.search;
            return { ...route, url: route.section === 'home' ? homeUrl : window.location.href };
        }
        const route = parseRouteFromHash();
        return { ...route, url: window.location.href };
    }

    function setupNavLinks() {
        document.querySelector('.skip-nav')?.addEventListener('click', (event) => {
            event.preventDefault();
            const main = document.getElementById('main-content');
            main?.focus({ preventScroll: true });
            main?.scrollIntoView({ block: 'start', behavior: 'instant' });
        });
        document.querySelectorAll('[data-section]').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                showSection(link.getAttribute('data-section'));
                closeMoreMenu();
                closeTradeMenu();
                closeShipsMenu();
                closeWorkMenu();
            });
        });
        setupMoreMenu();
        setupTradeMenu();
        setupShipsMenu();
        setupWorkMenu();
    }

    function setupMoreMenu() {
        setupDropdownMenu({
            rootSelector: '.nav-more',
            toggleId: 'nav-more-toggle',
            menuId: 'nav-more-menu',
            bodyClass: 'nav-more-open',
            closeOther: () => { closeTradeMenu(); closeShipsMenu(); closeWorkMenu(); }
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.nav-more')) closeMoreMenu();
        });
    }

    function setupTradeMenu() {
        setupDropdownMenu({
            rootSelector: '.nav-trade',
            toggleId: 'nav-trade-toggle',
            menuId: 'nav-trade-menu',
            bodyClass: 'nav-trade-open',
            closeOther: () => { closeMoreMenu(); closeShipsMenu(); closeWorkMenu(); }
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.nav-trade:not(.nav-ships):not(.nav-work)')) closeTradeMenu();
        });
    }

    // 「함선」 묶음(함선 DB · 함선 로드아웃). 무역 메뉴와 같은 모양·동작을 쓴다.
    function setupShipsMenu() {
        setupDropdownMenu({
            toggleId: 'nav-ships-toggle',
            menuId: 'nav-ships-menu',
            bodyClass: 'nav-ships-open',
            closeOther: () => { closeMoreMenu(); closeTradeMenu(); closeWorkMenu(); }
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.nav-ships')) closeShipsMenu();
        });
    }

    // 「임무 · 자원」 묶음(임무 찾기 · 운송 계약 · 채광 안내 · 제작 설계도). 무역 메뉴와 같은 모양·동작을 쓴다.
    function setupWorkMenu() {
        setupDropdownMenu({
            toggleId: 'nav-work-toggle',
            menuId: 'nav-work-menu',
            bodyClass: 'nav-work-open',
            closeOther: () => { closeMoreMenu(); closeTradeMenu(); closeShipsMenu(); }
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.nav-work')) closeWorkMenu();
        });
        document.addEventListener('keydown', (event) => {
            const toggle = document.getElementById('nav-work-toggle');
            if (event.key !== 'Escape' || toggle?.getAttribute('aria-expanded') !== 'true') return;
            closeWorkMenu();
            toggle.focus();
        });
    }

    function closeWorkMenu() {
        const toggle = document.getElementById('nav-work-toggle');
        const menu = document.getElementById('nav-work-menu');
        if (!toggle || !menu) return;
        setDropdownState(toggle, menu, 'nav-work-open', false);
    }

    function closeShipsMenu() {
        const toggle = document.getElementById('nav-ships-toggle');
        const menu = document.getElementById('nav-ships-menu');
        if (!toggle || !menu) return;
        setDropdownState(toggle, menu, 'nav-ships-open', false);
    }

    function setupDropdownMenu({ toggleId, menuId, bodyClass, closeOther }) {
        const toggle = document.getElementById(toggleId);
        const menu = document.getElementById(menuId);
        if (!toggle || !menu) return;
        toggle.addEventListener('click', () => {
            const expanded = toggle.getAttribute('aria-expanded') === 'true';
            if (!expanded) closeOther?.();
            setDropdownState(toggle, menu, bodyClass, !expanded);
        });
    }

    function setDropdownState(toggle, menu, bodyClass, isOpen) {
        toggle.setAttribute('aria-expanded', String(isOpen));
        menu.classList.toggle('active', isOpen);
        document.body.classList.toggle(bodyClass, isOpen);
    }

    function closeMoreMenu() {
        const toggle = document.getElementById('nav-more-toggle');
        const menu = document.getElementById('nav-more-menu');
        if (!toggle || !menu) return;
        setDropdownState(toggle, menu, 'nav-more-open', false);
    }

    function closeTradeMenu() {
        const toggle = document.getElementById('nav-trade-toggle');
        const menu = document.getElementById('nav-trade-menu');
        if (!toggle || !menu) return;
        setDropdownState(toggle, menu, 'nav-trade-open', false);
    }

    function setupMobileMenu() {
        const menu = document.getElementById('mobileMenu');
        const openButton = document.getElementById('hamburger');
        const closeButtons = menu ? [...menu.querySelectorAll('#mobileMenuClose, [data-mobile-menu-close]')] : [];
        if (!menu || !openButton || closeButtons.length === 0) return;
        const open = () => setMobileMenuState(menu, openButton, true);
        const close = () => setMobileMenuState(menu, openButton, false);
        openButton.addEventListener('click', open);
        closeButtons.forEach((button) => { button.addEventListener('click', close); });
        menu.addEventListener('click', (event) => {
            if (event.target === menu) close();
        });
        menu.addEventListener('click', (event) => { if (event.target.closest('a')) close(); });
        document.addEventListener('keydown', (event) => {
            if (!menu.classList.contains('active')) return;
            if (event.key === 'Escape') close();
            if (event.key === 'Tab') deps.trapFocus?.(menu, event);
        });
    }

    function setMobileMenuState(menu, button, isOpen) {
        if (isOpen) {
            closeMoreMenu();
            closeTradeMenu();
            closeShipsMenu();
            closeWorkMenu();
        }
        menu.inert = !isOpen;
        if (isOpen) { menu.removeAttribute('aria-hidden'); menu.setAttribute('aria-modal', 'true'); }
        else { menu.setAttribute('aria-hidden', 'true'); menu.removeAttribute('aria-modal'); }
        menu.classList.toggle('active', isOpen);
        button.setAttribute('aria-expanded', String(isOpen));
        document.body.style.overflow = isOpen ? 'hidden' : '';
        if (isOpen) {
            menu.dataset.returnFocusId = document.activeElement?.id || '';
            menu.scrollTop = 0;
            menu.querySelector('.mobile-menu-scroll')?.scrollTo({ top: 0 });
            deps.getFocusableElements?.(menu)[0]?.focus();
        } else {
            const returnTarget = menu.dataset.returnFocusId ? document.getElementById(menu.dataset.returnFocusId) : button;
            returnTarget?.focus();
        }
    }

    function init(injected) {
        deps = injected || {};
    }

    window.VOLT_NAV = {
        init,
        showSection,
        parseRouteFromHash,
        getInitialRoute,
        updateActiveNav,
        setupNavLinks,
        setupMobileMenu,
        setMobileMenuState,
        closeMoreMenu,
        closeTradeMenu
    };
})();
