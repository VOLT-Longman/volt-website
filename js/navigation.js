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

    const VALID_SECTIONS = ['about', 'timeline', 'leadership', 'partner-fleets', 'hub', 'streamers', 'gallery', 'join', 'mypage', 'notices', 'ships', 'trade-planner', 'schedule', 'policy', 'faq', 'guide', 'ai', 'comms'];

    function updateActiveNav(id) {
        document.querySelectorAll('.nav-links [data-section]').forEach((link) => {
            link.classList.toggle('nav-active', link.getAttribute('data-section') === id);
        });
        document.getElementById('nav-trade-toggle')?.classList.toggle('nav-active', ['trade-planner', 'hub', 'guide'].includes(id));
        document.getElementById('nav-more-toggle')?.classList.toggle('nav-active', ['timeline', 'leadership', 'streamers', 'gallery', 'policy', 'faq', 'comms'].includes(id));
    }

    function showSection(id, push = true, anchorId = null) {
        deps.trackEvent?.('section_view', { section: id });
        // 지연 렌더 섹션(예: 함선DB·갤러리)은 첫 진입 시 main.js가 콘텐츠를 채운다.
        deps.onSectionShow?.(id);
        const home = document.getElementById('home');
        if (!home) return;
        document.querySelectorAll('.section').forEach((section) => { section.classList.remove('active'); });
        if (id === 'home') {
            home.style.display = 'flex';
        } else {
            home.style.display = 'none';
            activateSection(id);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        updateActiveNav(id);
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
        const policyMatch = hash.match(/^policy-section-(\d+)$/);
        if (policyMatch) return { section: 'policy', anchorId: hash };
        return {
            section: VALID_SECTIONS.includes(hash) ? hash : 'home',
            anchorId: null
        };
    }

    function scrollToAnchor(anchorId) {
        window.requestAnimationFrame(() => {
            document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        document.querySelectorAll('[data-section]').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                showSection(link.getAttribute('data-section'));
                closeMoreMenu();
                closeTradeMenu();
            });
        });
        setupMoreMenu();
        setupTradeMenu();
    }

    function setupMoreMenu() {
        setupDropdownMenu({
            rootSelector: '.nav-more',
            toggleId: 'nav-more-toggle',
            menuId: 'nav-more-menu',
            bodyClass: 'nav-more-open',
            closeOther: closeTradeMenu
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
            closeOther: closeMoreMenu
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.nav-trade')) closeTradeMenu();
        });
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
        menu.querySelectorAll('a').forEach((link) => { link.addEventListener('click', close); });
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
        }
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
