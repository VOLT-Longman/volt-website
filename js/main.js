/**
 * VOLT Fleet - Main Script (v3)
 * ==============================
 * 1. Renderers  - 데이터 → HTML
 * 2. Navigation - 섹션 전환 / URL / 모바일 / 활성 링크
 * 3. Features   - 스플래시 / 테마 / 검색 / 모달 / reveal
 * 4. Init
 */

(function () {
    'use strict';

    const data = window.VOLT_DATA;
    if (!data) {
        console.error('VOLT_DATA 미로드');
        return;
    }

    const PAGE_SIZE = 4;
    const VALID_SECTIONS = ['about', 'timeline', 'leadership', 'hub', 'streamers', 'gallery', 'join', 'notices', 'ships', 'schedule', 'policy', 'faq', 'guide'];
    const noticeState = { tag: 'all', visibleCount: PAGE_SIZE };
    const shipState = { filter: 'all', query: '', sort: 'name' };
    let currentSection = null;
    let revealObserver;
    let activeModal = null;

    function escapeHtml(value) {
        if (typeof value !== 'string') return '';
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatMultilineText(value) {
        return escapeHtml(value).replace(/\n/g, '<br>');
    }

    function compareText(left, right) {
        return left.localeCompare(right, 'ko', { numeric: true, sensitivity: 'base' });
    }

    function parseLargestNumber(value) {
        const matches = String(value).match(/\d+/g);
        if (!matches) return 0;
        return Math.max(...matches.map(Number));
    }

    function getCargoValue(value) {
        return Number(String(value).replace(/[^\d]/g, '')) || 0;
    }

    function observeNewReveals(container) {
        if (!revealObserver || !container) return;
        container.querySelectorAll('.reveal:not(.revealed)').forEach((element) => revealObserver.observe(element));
    }

    function renderLeaders() {
        const container = document.getElementById('leadership-grid');
        if (!container || !Array.isArray(data.leadership)) return;
        container.innerHTML = data.leadership.map((leader) => {
            const avatarStyle = leader.avatarGradient ? `style="background:${escapeHtml(leader.avatarGradient)};"` : '';
            const details = renderLeaderDetails(leader);
            return `<div class="${leader.avatarStyle === 'ceo' ? 'leader-card ceo-card' : 'leader-card'} reveal">
                <div class="leader-avatar" ${avatarStyle} aria-hidden="true">${escapeHtml(leader.avatar)}</div>
                <div class="leader-info">
                    <h3>${escapeHtml(leader.name)}</h3>
                    <span class="leader-role">${escapeHtml(leader.role)}</span>
                    <p class="leader-contact">Discord: ${escapeHtml(leader.discord)}</p>
                    <p class="leader-description">${escapeHtml(leader.description)}</p>
                    ${details}
                </div>
            </div>`;
        }).join('');
    }

    function renderLeaderDetails(leader) {
        const details = Array.isArray(leader.details) ? `<div class="leader-details">${leader.details.map((item) => `
            <div class="leader-details-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.content)}</p></div>`).join('')}</div>` : '';
        const competencies = Array.isArray(leader.competencies) ? `<div class="leader-competencies"><strong>핵심 역량</strong><ul>${leader.competencies.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
        const duties = leader.duties ? `<div class="leader-duties"><strong>주요 업무</strong> · ${escapeHtml(leader.duties)}</div>` : '';
        return `${details}${competencies}${duties}`;
    }

    function renderStreamers() {
        const container = document.getElementById('streamers-grid');
        if (!container || !Array.isArray(data.streamers)) return;
        container.innerHTML = data.streamers.map((streamer) => {
            const icon = streamer.image
                ? `<img src="${escapeHtml(streamer.image)}" alt="${escapeHtml(streamer.name)}" loading="lazy" decoding="async">`
                : '<div class="streamer-icon-fallback">👤</div>';
            return `<div class="streamer-card reveal">
                <div class="streamer-icon">${icon}</div>
                <h3>${escapeHtml(streamer.name)}</h3>
                <span class="streamer-platform">${escapeHtml(streamer.platform)}</span>
                <p class="streamer-description">${escapeHtml(streamer.description)}</p>
                <div class="streamer-details">${streamer.sections.map((section) => `<div class="streamer-sub-section"><h4>${escapeHtml(section.title)}</h4><p>${formatMultilineText(section.content)}</p></div>`).join('')}</div>
                <a href="${escapeHtml(streamer.channelUrl)}" target="_blank" rel="noopener noreferrer" class="streamer-link">방송 보기</a>
            </div>`;
        }).join('');
    }

    function renderTimeline() {
        const container = document.getElementById('timeline-list');
        if (!container || !Array.isArray(data.timeline)) return;
        container.innerHTML = data.timeline.map((item) => `
            <div class="timeline-item reveal">
                <div class="timeline-date">${escapeHtml(item.date)}</div>
                <div class="timeline-title">${escapeHtml(item.title)}</div>
                <div class="timeline-desc">${escapeHtml(item.description)}</div>
            </div>`).join('');
    }

    function renderDepartments() {
        const container = document.getElementById('about-grid');
        if (!container || !Array.isArray(data.departments)) return;
        container.innerHTML = data.departments.map((department) => `
            <div class="card about-card reveal">
                <h3>${escapeHtml(department.icon)} ${escapeHtml(department.name)}</h3>
                <p>${escapeHtml(department.description)}</p>
            </div>`).join('');
    }

    function renderCoreValues() {
        const container = document.getElementById('culture-grid');
        if (!container || !Array.isArray(data.coreValues)) return;
        container.innerHTML = data.coreValues.map((value) => `
            <div class="culture-item reveal">
                <h4>${escapeHtml(value.title)}</h4>
                <p>${escapeHtml(value.description)}</p>
            </div>`).join('');
    }

    function renderHubFeatures() {
        const container = document.getElementById('hub-features');
        if (!container || !data.hub || !Array.isArray(data.hub.features)) return;
        container.innerHTML = data.hub.features.map((feature) => `
            <div class="hub-feature reveal">
                <h4>${escapeHtml(feature.icon)} ${escapeHtml(feature.title)}</h4>
                <ul>${feature.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </div>`).join('');
    }

    function renderJoinSteps() {
        const container = document.getElementById('join-steps');
        if (!container || !Array.isArray(data.joinSteps)) return;
        container.innerHTML = data.joinSteps.map((step) => `
            <div class="join-step reveal">
                <div class="step-number">${escapeHtml(String(step.number))}</div>
                <h4>${escapeHtml(step.title)}</h4>
                <p>${escapeHtml(step.description)}</p>
            </div>`).join('');
    }

    function renderFooterStreamers() {
        const container = document.getElementById('footer-streamers-list');
        if (!container || !Array.isArray(data.streamers)) return;
        container.innerHTML = data.streamers.map((streamer) => `
            <li><a href="${escapeHtml(streamer.channelUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(streamer.name)}</a></li>`).join('');
    }

    function renderGallery() {
        const container = document.getElementById('gallery-grid');
        if (!container || !Array.isArray(data.gallery)) return;
        if (data.gallery.length === 0) {
            container.innerHTML = '<div class="gallery-empty">assets/images/gallery/에 이미지를 추가하고 volt-data.js의 gallery 배열에 등록하면 자동으로 표시됩니다.</div>';
            return;
        }
        container.innerHTML = data.gallery.map((item) => `
            <button class="gallery-item reveal" type="button" data-gallery-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)} 크게 보기">
                <img src="${escapeHtml(item.thumb || item.src)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">
                <span class="gallery-item-overlay">
                    <span class="gallery-item-title">${escapeHtml(item.title)}</span>
                    <span class="gallery-item-meta">${escapeHtml(item.date)}</span>
                </span>
            </button>`).join('');
        observeNewReveals(container);
    }

    function getNoticeTags() {
        if (!Array.isArray(data.announcements)) return [];
        return [...new Set(data.announcements.map((announcement) => announcement.tag))];
    }

    function renderNoticeFilters() {
        const container = document.getElementById('notice-filters');
        if (!container) return;
        const buttons = ['all', ...getNoticeTags()].map((tag) => {
            const label = tag === 'all' ? '전체' : tag;
            const active = tag === noticeState.tag ? ' active' : '';
            return `<button class="notice-filter-btn${active}" type="button" data-tag="${escapeHtml(tag)}">${escapeHtml(label)}</button>`;
        });
        container.innerHTML = buttons.join('');
    }

    function getFilteredAnnouncements() {
        if (!Array.isArray(data.announcements)) return [];
        return [...data.announcements]
            .filter((announcement) => noticeState.tag === 'all' || announcement.tag === noticeState.tag)
            .sort((left, right) => right.date.localeCompare(left.date));
    }

    function renderAnnouncements() {
        const container = document.getElementById('notices-list');
        const loadMore = document.getElementById('notice-load-more');
        if (!container || !loadMore) return;
        const colors = { '공지': 'var(--volt-orange)', '정책': '#e53e3e', '작전': '#3182ce', '시스템': '#38a169' };
        const items = getFilteredAnnouncements();
        const visibleItems = items.slice(0, noticeState.visibleCount);
        container.innerHTML = visibleItems.map((announcement) => `
            <div class="notice-card reveal">
                <div class="notice-meta">
                    <span class="notice-tag" style="background:${colors[announcement.tag] || 'var(--volt-orange)'}20;color:${colors[announcement.tag] || 'var(--volt-orange)'};">${escapeHtml(announcement.tag)}</span>
                    <span class="notice-date">${escapeHtml(announcement.date)}</span>
                </div>
                <h3 class="notice-title">${escapeHtml(announcement.title)}</h3>
                <p class="notice-content">${escapeHtml(announcement.content)}</p>
            </div>`).join('');
        loadMore.hidden = visibleItems.length >= items.length;
        observeNewReveals(container);
    }

    function getSortedShips() {
        if (!Array.isArray(data.ships)) return [];
        const sizeOrder = { '소형': 1, '중형': 2, '대형': 3 };
        return [...data.ships].sort((left, right) => {
            if (shipState.sort === 'size') return (sizeOrder[left.size] || 99) - (sizeOrder[right.size] || 99) || compareText(left.name, right.name);
            if (shipState.sort === 'crew') return parseLargestNumber(left.crew) - parseLargestNumber(right.crew) || compareText(left.name, right.name);
            if (shipState.sort === 'cargo') return getCargoValue(left.cargo) - getCargoValue(right.cargo) || compareText(left.name, right.name);
            return compareText(left.name, right.name);
        });
    }

    function getVisibleShips() {
        const query = shipState.query.trim().toLowerCase();
        return getSortedShips().filter((ship) => {
            const matchesFilter = shipState.filter === 'all' || ship.tags.includes(shipState.filter);
            const haystack = [ship.name, ship.manufacturer, ship.role, ship.focus, ship.description].join(' ').toLowerCase();
            return matchesFilter && (!query || haystack.includes(query));
        });
    }

    function renderShips() {
        const container = document.getElementById('ships-grid');
        if (!container) return;
        const ships = getVisibleShips();
        if (ships.length === 0) {
            container.innerHTML = '<div class="ships-empty">검색 결과가 없습니다.</div>';
            return;
        }
        const focusColors = {
            '물류': '#f6ad55',
            '전투': '#fc8181',
            '탐사': '#68d391',
            '채굴': '#76e4f7',
            '해체': '#b794f4'
        };
        container.innerHTML = ships.map((ship) => `
            <article class="ship-card reveal" tabindex="0" role="button" data-ship-id="${escapeHtml(ship.id)}" aria-label="${escapeHtml(ship.name)} 상세 보기">
                <div class="ship-card-header">
                    <div>
                        <h3 class="ship-name">${escapeHtml(ship.name)}</h3>
                        <span class="ship-mfr">${escapeHtml(ship.manufacturer)}</span>
                    </div>
                    <span class="ship-focus-badge" style="background:${focusColors[ship.focus] || '#a0aec0'}22;color:${focusColors[ship.focus] || '#a0aec0'};">${escapeHtml(ship.focus)}</span>
                </div>
                <p class="ship-desc">${escapeHtml(ship.description)}</p>
                <div class="ship-stats">
                    <div class="ship-stat"><span class="ship-stat-label">역할</span><span class="ship-stat-value">${escapeHtml(ship.role)}</span></div>
                    <div class="ship-stat"><span class="ship-stat-label">크기</span><span class="ship-stat-value">${escapeHtml(ship.size)}</span></div>
                    <div class="ship-stat"><span class="ship-stat-label">승무원</span><span class="ship-stat-value">${escapeHtml(ship.crew)}</span></div>
                    <div class="ship-stat"><span class="ship-stat-label">화물</span><span class="ship-stat-value">${escapeHtml(ship.cargo)}</span></div>
                </div>
                <div class="ship-tags">${ship.tags.map((tag) => `<span class="ship-tag">${escapeHtml(tag)}</span>`).join('')}</div>
            </article>`).join('');
        observeNewReveals(container);
    }

    function renderSchedule() {
        const container = document.getElementById('schedule-list');
        if (!container || !Array.isArray(data.calendar)) return;
        const colors = { '예정': 'var(--volt-orange)', '대기': '#a0aec0', '계획': '#63b3ed' };
        container.innerHTML = data.calendar.map((event) => `
            <div class="schedule-item reveal">
                <div class="schedule-date-col">
                    <span class="schedule-date">${escapeHtml(event.dateLabel)}</span>
                    <span class="schedule-status" style="color:${colors[event.status] || '#a0aec0'};">${escapeHtml(event.status)}</span>
                </div>
                <div class="schedule-body">
                    <div class="schedule-type-badge">${escapeHtml(event.type)}</div>
                    <h3>${escapeHtml(event.title)}</h3>
                    <p>${escapeHtml(event.description)}</p>
                </div>
            </div>`).join('');
    }

    function renderPolicy() {
        const container = document.getElementById('policy-list');
        if (!container || !data.policy || !Array.isArray(data.policy.sections)) return;
        container.innerHTML = `<div class="policy-updated">최종 업데이트: ${escapeHtml(data.policy.lastUpdated)}</div>
            ${data.policy.sections.map((section, index) => renderPolicySection(section, index)).join('')}`;
    }

    function renderPolicySection(section, index) {
        const sectionId = `policy-section-${index + 1}`;
        const notice = section.notice ? `<div class="policy-notice">${escapeHtml(section.notice)}</div>` : '';
        return `<div class="policy-section reveal" id="${sectionId}">
            <div class="policy-section-heading">
                <h3 class="policy-section-title">${escapeHtml(section.title)}</h3>
                <button class="policy-anchor-copy" type="button" data-policy-index="${index + 1}" aria-label="${escapeHtml(section.title)} 링크 복사">🔗</button>
            </div>
            ${notice}
            <div class="policy-items">${section.items.map((item) => `<div class="policy-item"><span class="policy-num">${escapeHtml(item.num)}</span><span class="policy-text">${escapeHtml(item.text)}</span></div>`).join('')}</div>
        </div>`;
    }

    function renderFaq() {
        const container = document.getElementById('faq-list');
        if (!container || !Array.isArray(data.faq)) return;
        container.innerHTML = `<div class="faq-accordion">${data.faq.map((item, index) => `
            <div class="faq-item reveal" id="faq-item-${index}">
                <button class="faq-question" aria-expanded="false" aria-controls="faq-ans-${index}">
                    <span>${escapeHtml(item.q)}</span>
                    <span class="faq-icon">+</span>
                </button>
                <div class="faq-answer" id="faq-ans-${index}" role="region">
                    <p>${escapeHtml(item.a)}</p>
                </div>
            </div>`).join('')}</div>`;
    }

    function renderTradeGuide() {
        const container = document.getElementById('guide-list');
        if (!container || !Array.isArray(data.tradeGuide)) return;
        container.innerHTML = data.tradeGuide.map((guide) => `
            <div class="guide-card reveal">
                <div class="guide-step-num">${escapeHtml(String(guide.step))}</div>
                <div class="guide-icon">${escapeHtml(guide.icon)}</div>
                <h3>${escapeHtml(guide.title)}</h3>
                <p>${escapeHtml(guide.content)}</p>
            </div>`).join('');
    }

    function renderAll() {
        renderDepartments();
        renderCoreValues();
        renderTimeline();
        renderLeaders();
        renderHubFeatures();
        renderStreamers();
        renderGallery();
        renderJoinSteps();
        renderFooterStreamers();
        renderNoticeFilters();
        renderAnnouncements();
        renderShips();
        renderSchedule();
        renderPolicy();
        renderFaq();
        renderTradeGuide();
    }

    function updateActiveNav(id) {
        document.querySelectorAll('.nav-links [data-section]').forEach((link) => {
            link.classList.toggle('nav-active', link.getAttribute('data-section') === id);
        });
    }

    function showSection(id, push = true, anchorId = null) {
        const home = document.getElementById('home');
        if (!home) return;
        currentSection = id;
        document.querySelectorAll('.section').forEach((section) => section.classList.remove('active'));
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
    }

    function activateSection(id) {
        const target = document.getElementById(id);
        if (!target) return;
        target.classList.add('active');
        observeNewReveals(target);
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

    function setupNavLinks() {
        document.querySelectorAll('[data-section]').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                showSection(link.getAttribute('data-section'));
            });
        });
    }

    function setupMobileMenu() {
        const menu = document.getElementById('mobileMenu');
        const openButton = document.getElementById('hamburger');
        const closeButton = document.getElementById('mobileMenuClose');
        if (!menu || !openButton || !closeButton) return;
        const open = () => setMobileMenuState(menu, openButton, true);
        const close = () => setMobileMenuState(menu, openButton, false);
        openButton.addEventListener('click', open);
        closeButton.addEventListener('click', close);
        menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && menu.classList.contains('active')) close();
        });
    }

    function setMobileMenuState(menu, button, isOpen) {
        menu.classList.toggle('active', isOpen);
        button.setAttribute('aria-expanded', String(isOpen));
        document.body.style.overflow = isOpen ? 'hidden' : '';
    }

    function setupNoticeControls() {
        const filters = document.getElementById('notice-filters');
        const loadMore = document.getElementById('notice-load-more');
        if (!filters || !loadMore) return;
        filters.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tag]');
            if (!button) return;
            noticeState.tag = button.getAttribute('data-tag');
            noticeState.visibleCount = PAGE_SIZE;
            renderNoticeFilters();
            renderAnnouncements();
        });
        loadMore.addEventListener('click', () => {
            noticeState.visibleCount += PAGE_SIZE;
            renderAnnouncements();
        });
    }

    function setupShipControls() {
        const filters = document.querySelector('.ship-filters');
        const search = document.getElementById('ship-search');
        const sort = document.getElementById('ship-sort');
        const grid = document.getElementById('ships-grid');
        if (!filters || !search || !sort || !grid) return;
        filters.addEventListener('click', handleShipFilterClick);
        search.addEventListener('input', () => { shipState.query = search.value; renderShips(); });
        sort.addEventListener('change', () => { shipState.sort = sort.value; renderShips(); });
        grid.addEventListener('click', openShipFromEvent);
        grid.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') openShipFromEvent(event);
        });
    }

    function handleShipFilterClick(event) {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        document.querySelectorAll('.ship-filter-btn').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        shipState.filter = button.getAttribute('data-filter');
        renderShips();
    }

    function openShipFromEvent(event) {
        const card = event.target.closest('[data-ship-id]');
        if (!card) return;
        event.preventDefault();
        const ship = data.ships.find((item) => item.id === card.getAttribute('data-ship-id'));
        if (ship) openShipModal(ship);
    }

    function setupGalleryInteractions() {
        const grid = document.getElementById('gallery-grid');
        if (!grid) return;
        grid.addEventListener('click', (event) => {
            const button = event.target.closest('[data-gallery-id]');
            if (!button) return;
            const item = data.gallery.find((galleryItem) => galleryItem.id === button.getAttribute('data-gallery-id'));
            if (item) openGalleryLightbox(item);
        });
    }

    function ensureModalRoot() {
        let modal = document.getElementById('global-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'global-modal';
        modal.className = 'modal-backdrop';
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal();
        });
        return modal;
    }

    function openModal(content, wide = false) {
        const modal = ensureModalRoot();
        modal.innerHTML = `<div class="modal-card${wide ? ' modal-card-wide' : ''}" role="dialog" aria-modal="true">${content}</div>`;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        activeModal = modal;
        modal.querySelector('.modal-close')?.focus();
    }

    function closeModal() {
        if (!activeModal) return;
        activeModal.classList.remove('active');
        activeModal.setAttribute('aria-hidden', 'true');
        activeModal.innerHTML = '';
        activeModal = null;
        document.body.style.overflow = '';
    }

    function openShipModal(ship) {
        const slug = ship.rsiSlug || ship.id;
        const url = `https://robertsspaceindustries.com/en/pledge/ships/${encodeURIComponent(slug)}`;
        openModal(`<div class="modal-header">
                <div>
                    <div class="ship-mfr">${escapeHtml(ship.manufacturer)}</div>
                    <h2 class="modal-title">${escapeHtml(ship.name)}</h2>
                </div>
                <button class="modal-close" type="button" aria-label="모달 닫기">×</button>
            </div>
            <div class="modal-body">
                <p>${escapeHtml(ship.description)}</p>
                <div class="ship-modal-grid">
                    <div class="ship-modal-stat"><span>역할</span><strong>${escapeHtml(ship.role)}</strong></div>
                    <div class="ship-modal-stat"><span>크기</span><strong>${escapeHtml(ship.size)}</strong></div>
                    <div class="ship-modal-stat"><span>승무원</span><strong>${escapeHtml(ship.crew)}</strong></div>
                    <div class="ship-modal-stat"><span>화물</span><strong>${escapeHtml(ship.cargo)}</strong></div>
                </div>
                <a class="btn btn-primary ship-modal-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">RSI 공식 페이지</a>
            </div>`);
    }

    function openGalleryLightbox(item) {
        openModal(`<div class="modal-header">
                <div>
                    <div class="ship-mfr">${escapeHtml(item.date)}</div>
                    <h2 class="modal-title">${escapeHtml(item.title)}</h2>
                </div>
                <button class="modal-close" type="button" aria-label="모달 닫기">×</button>
            </div>
            <img class="gallery-lightbox-image" src="${escapeHtml(item.src)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">
            <div class="gallery-lightbox-copy"><p>${escapeHtml(item.description)}</p></div>`, true);
    }

    function setupModalControls() {
        document.addEventListener('click', (event) => {
            if (event.target.closest('.modal-close')) closeModal();
        });
    }

    function setupPolicyAnchors() {
        const policy = document.getElementById('policy-list');
        if (!policy) return;
        policy.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-policy-index]');
            if (!button) return;
            const index = button.getAttribute('data-policy-index');
            await copyPolicyUrl(index, button);
        });
    }

    async function copyPolicyUrl(index, button) {
        const suffix = `/#policy-section-${index}`;
        const value = window.location.origin === 'null' ? suffix : `${window.location.origin}${suffix}`;
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
            else copyTextFallback(value);
            showCopyFeedback(button);
        } catch (error) {
            try {
                copyTextFallback(value);
                showCopyFeedback(button);
            } catch (fallbackError) {
                console.error('정책 링크 복사 실패', fallbackError || error);
            }
        }
    }

    function copyTextFallback(value) {
        const input = document.createElement('textarea');
        input.value = value;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(input);
        if (!copied) throw new Error('복사 명령 실패');
    }

    function showCopyFeedback(button) {
        const original = button.textContent;
        button.textContent = '✓';
        window.setTimeout(() => { button.textContent = original; }, 1200);
    }

    function setupFaqAccordion() {
        const container = document.getElementById('faq-list');
        if (!container) return;
        container.addEventListener('click', (event) => {
            const button = event.target.closest('.faq-question');
            if (!button) return;
            const expanded = button.getAttribute('aria-expanded') === 'true';
            container.querySelectorAll('.faq-question').forEach(collapseFaqItem);
            if (!expanded) expandFaqItem(button);
        });
    }

    function collapseFaqItem(button) {
        button.setAttribute('aria-expanded', 'false');
        button.querySelector('.faq-icon').textContent = '+';
        button.nextElementSibling.style.maxHeight = null;
    }

    function expandFaqItem(button) {
        button.setAttribute('aria-expanded', 'true');
        button.querySelector('.faq-icon').textContent = '−';
        const answer = button.nextElementSibling;
        answer.style.maxHeight = `${answer.scrollHeight}px`;
    }

    function setupSearch() {
        const overlay = document.getElementById('search-overlay');
        const desktopButton = document.getElementById('search-toggle');
        const mobileButton = document.getElementById('mobile-search-toggle');
        const closeButton = document.getElementById('search-close');
        const input = document.getElementById('global-search-input');
        if (!overlay || !desktopButton || !mobileButton || !closeButton || !input) return;
        const open = () => openSearch(overlay, input);
        desktopButton.addEventListener('click', open);
        mobileButton.addEventListener('click', open);
        closeButton.addEventListener('click', () => closeSearch(overlay, input));
        overlay.addEventListener('click', (event) => { if (event.target === overlay) closeSearch(overlay, input); });
        input.addEventListener('input', () => renderSearchResults(input.value));
    }

    function openSearch(overlay, input) {
        if (!overlay || !input) return;
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
    }

    function buildSearchIndex() {
        return [
            ...data.announcements.map((item) => makeSearchItem('공지', 'notices', item.title, item.content)),
            ...data.ships.map((item) => makeSearchItem('함선', 'ships', item.name, `${item.manufacturer} ${item.role} ${item.description}`)),
            ...data.faq.map((item) => makeSearchItem('FAQ', 'faq', item.q, item.a)),
            ...data.timeline.map((item) => makeSearchItem('연혁', 'timeline', item.title, item.description)),
            ...data.leadership.map((item) => makeSearchItem('임원진', 'leadership', item.name, `${item.role} ${item.description}`)),
            ...data.departments.map((item) => makeSearchItem('소개', 'about', item.name, item.description)),
            ...data.coreValues.map((item) => makeSearchItem('가치', 'about', item.title, item.description)),
            ...data.calendar.map((item) => makeSearchItem('일정', 'schedule', item.title, item.description)),
            ...data.tradeGuide.map((item) => makeSearchItem('가이드', 'guide', item.title, item.content)),
            ...data.joinSteps.map((item) => makeSearchItem('가입', 'join', item.title, item.description)),
            ...data.gallery.map((item) => makeSearchItem('갤러리', 'gallery', item.title, item.description)),
            ...data.policy.sections.map((item) => makeSearchItem('정책', 'policy', item.title, item.items.map((policyItem) => policyItem.text).join(' ')))
        ];
    }

    function makeSearchItem(type, section, title, body) {
        return { type, section, title, body, haystack: `${title} ${body}`.toLowerCase() };
    }

    function renderSearchResults(query) {
        const container = document.getElementById('search-results');
        if (!container) return;
        const normalized = query.trim().toLowerCase();
        const results = buildSearchIndex().filter((item) => !normalized || item.haystack.includes(normalized)).slice(0, 12);
        if (results.length === 0) {
            container.innerHTML = '<div class="search-empty">검색 결과가 없습니다.</div>';
            return;
        }
        container.innerHTML = results.map((item) => `
            <button class="search-result" type="button" data-search-section="${escapeHtml(item.section)}">
                <span class="search-result-type">${escapeHtml(item.type)}</span>
                <span class="search-result-title">${escapeHtml(item.title)}</span>
                <span class="search-result-summary">${escapeHtml(item.body)}</span>
            </button>`).join('');
        container.querySelectorAll('[data-search-section]').forEach((button) => {
            button.addEventListener('click', () => selectSearchResult(button.getAttribute('data-search-section')));
        });
    }

    function selectSearchResult(section) {
        const overlay = document.getElementById('search-overlay');
        const input = document.getElementById('global-search-input');
        if (overlay && input) closeSearch(overlay, input);
        showSection(section);
    }

    function setupGlobalKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            const searchOverlay = document.getElementById('search-overlay');
            const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
            if (event.key === '/' && !isTyping && searchOverlay && !searchOverlay.classList.contains('active')) {
                event.preventDefault();
                document.getElementById('search-toggle')?.click();
            }
            if (event.key === 'Escape') {
                if (searchOverlay?.classList.contains('active')) closeSearch(searchOverlay, document.getElementById('global-search-input'));
                else if (activeModal) closeModal();
            }
        });
    }

    function setupSplash() {
        const splash = document.getElementById('loading-splash');
        if (!splash) return;
        window.setTimeout(() => {
            splash.classList.add('splash-hide');
            window.setTimeout(() => { splash.style.display = 'none'; }, 600);
        }, 1200);
    }

    function setupTheme() {
        const button = document.getElementById('theme-toggle');
        if (!button) return;
        applyTheme(localStorage.getItem('volt-theme') || 'dark');
        button.addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            applyTheme(next);
            localStorage.setItem('volt-theme', next);
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const button = document.getElementById('theme-toggle');
        if (button) button.textContent = theme === 'light' ? '🌙' : '☀️';
    }

    function setupScrollTop() {
        const button = document.getElementById('scroll-to-top');
        if (!button) return;
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (ticking) return;
            window.requestAnimationFrame(() => {
                button.classList.toggle('visible', window.scrollY > 300);
                ticking = false;
            });
            ticking = true;
        }, { passive: true });
        button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    function setupScrollEffect() {
        const nav = document.getElementById('nav');
        if (!nav) return;
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (ticking) return;
            window.requestAnimationFrame(() => {
                nav.classList.toggle('scrolled', window.scrollY > 50);
                ticking = false;
            });
            ticking = true;
        }, { passive: true });
    }

    function setupRevealObserver() {
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    }

    function init() {
        setupSplash();
        setupRevealObserver();
        renderAll();
        setupNavLinks();
        setupMobileMenu();
        setupNoticeControls();
        setupShipControls();
        setupGalleryInteractions();
        setupModalControls();
        setupPolicyAnchors();
        setupFaqAccordion();
        setupSearch();
        setupGlobalKeyboardShortcuts();
        setupScrollEffect();
        setupScrollTop();
        setupTheme();
        const applyRouteFromLocation = () => {
            const route = parseRouteFromHash();
            showSection(route.section, false, route.anchorId);
        };
        window.addEventListener('popstate', applyRouteFromLocation);
        window.addEventListener('hashchange', applyRouteFromLocation);
        const initial = parseRouteFromHash();
        history.replaceState({ section: initial.section }, '', window.location.href);
        showSection(initial.section, false, initial.anchorId);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.VOLT_APP = { showSection, renderAll };
})();
