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
        // 콘텐츠 원본이 없으면 렌더할 것이 없어 여기서 중단하지만, 최소한 스플래시가
        // 무한 로딩으로 남지 않게 걷어 "복구 불가 상태"를 화면으로 알 수 있게 한다.
        const splash = document.getElementById('loading-splash');
        if (splash) splash.style.display = 'none';
        return;
    }
    // 랜딩 강화 레이어(js/landing.js)는 선택적이다. 호출부가 window.VOLT_LANDING?.() 옵셔널
    // 체이닝으로 접근하므로 로드 실패(캐시 skew·네트워크·보안 규칙) 시에도 핵심 사이트가 죽지 않는다.
    if (!window.VOLT_LANDING) console.warn('VOLT_LANDING 미로드 — 랜딩 강화 레이어 없이 계속 진행');
    // 함선 영어 데이터(_en)는 EN 모드에서만 필요 → 지연 로드(KO 초기 로드에서 103KB 제외).
    // tx(ship, field)가 EN을 집어들도록 병합. KO 원본 필드는 필터/색상/검색용으로 유지.
    let shipEnState = 'idle';
    let shipEnPromise = null;
    function mergeShipEn() {
        if (!window.VOLT_SHIP_EN || !Array.isArray(data.ships)) return;
        for (const ship of data.ships) {
            const en = window.VOLT_SHIP_EN[ship.id];
            if (!en) continue;
            ship.role_en = en.role;
            ship.focus_en = en.focus;
            ship.size_en = en.size;
            ship.crew_en = en.crew;
            ship.description_en = en.description;
            ship.tags_en = Array.isArray(en.tags) ? en.tags : [];
        }
    }
    // ship-en.js를 필요 시 1회만 동적 로드 후 병합. 로드 실패는 조용히 KO 폴백(경고 로그).
    function ensureShipEn() {
        if (shipEnState === 'loaded') return Promise.resolve();
        if (shipEnState === 'loading') return shipEnPromise;
        shipEnState = 'loading';
        shipEnPromise = new Promise((resolve) => {
            if (window.VOLT_SHIP_EN) { mergeShipEn(); shipEnState = 'loaded'; return resolve(); }
            const script = document.createElement('script');
            const mainSrc = document.querySelector('script[src*="js/main.js"]')?.getAttribute('src') || '';
            const version = (mainSrc.match(/\?v=([\w.-]+)/) || [])[1];
            script.src = `data/ship-en.js${version ? `?v=${version}` : ''}`;
            script.onload = () => { mergeShipEn(); shipEnState = 'loaded'; resolve(); };
            script.onerror = () => { shipEnState = 'idle'; console.warn('ship-en 로드 실패 — 영어 함선 정보 폴백(KO)'); resolve(); };
            document.head.appendChild(script);
        });
        return shipEnPromise;
    }
    // EN일 때만 ship-en 로드 후 함선 UI를 다시 렌더한다.
    function ensureShipEnForEn() {
        if (currentLang() !== 'en') return;
        // EN 함선 데이터는 항상 병합하되, 함선DB가 이미 표시된 경우에만 다시 렌더한다.
        ensureShipEn().then(() => { if (renderedLazySections.has('ships')) renderShipsSection(); });
    }
    // ShipDB 2.0 live 레이어(스펙/구매처, 합계 ~500KB)는 함선DB 첫 진입 전까지 로드하지 않는다.
    // ship-en.js와 같은 지연 로드 패턴. 로드 실패 시 모달은 live 섹션 없이 기존 정보로 폴백한다.
    let shipLiveState = 'idle';
    let shipLivePromise = null;
    function ensureShipLiveData() {
        if (shipLiveState === 'loaded') return Promise.resolve();
        if (shipLiveState === 'loading') return shipLivePromise;
        shipLiveState = 'loading';
        shipLivePromise = new Promise((resolve) => {
            if (window.VOLT_SHIP_LIVE_STATS && window.VOLT_SHIP_MARKET) { shipLiveState = 'loaded'; return resolve(); }
            const mainSrc = document.querySelector('script[src*="js/main.js"]')?.getAttribute('src') || '';
            const version = (mainSrc.match(/\?v=([\w.-]+)/) || [])[1];
            let remaining = 2;
            const done = () => {
                remaining -= 1;
                if (remaining > 0) return;
                shipLiveState = window.VOLT_SHIP_LIVE_STATS && window.VOLT_SHIP_MARKET ? 'loaded' : 'idle';
                // 검색 색인에 Erkul 번역 설명이 포함되도록 전역 검색 캐시를 무효화한다 (C-1).
                if (shipLiveState === 'loaded') invalidateSearchCache();
                resolve();
            };
            for (const file of ['data/ship-live-stats.js', 'data/ship-market.js']) {
                const script = document.createElement('script');
                script.src = `${file}${version ? `?v=${version}` : ''}`;
                script.onload = done;
                script.onerror = () => { console.warn(`${file} 로드 실패 — 함선 모달 live 정보 폴백`); done(); };
                document.head.appendChild(script);
            }
        });
        return shipLivePromise;
    }
    const staticLeadership = Array.isArray(data.leadership) ? data.leadership.slice() : [];

    function renderInlineIcon(name, className = 'inline-svg-icon') {
        const icons = {
            check: '<path d="m5 12 4 4 10-10"></path>'
        };
        return `<svg class="${className}" aria-hidden="true" viewBox="0 0 24 24" fill="none">${icons[name] || ''}</svg>`;
    }


    function trackEvent(name, params = {}) {
        if (!name) return;
        const payload = { event_category: 'VOLT', ...params };
        if (typeof window.gtag === 'function') {
            window.gtag('event', name, payload);
            return;
        }
        if (typeof window.plausible === 'function') {
            window.plausible(name, { props: payload });
        }
    }

    const localization = window.VOLT_LOCALIZATION || {};

    // Router/Navigation은 js/navigation.js로 분리됨(window.VOLT_NAV). main.js는
    // 기존 호출처를 그대로 두기 위해 공개 함수를 별칭으로 바인딩한다.
    // navigation.js가 로드 실패해도(캐시 skew·네트워크·보안 규칙) init() 전체가 죽지 않도록
    // no-op 폴백을 둔다 — 이 구조분해 대입 자체가 이전엔 최우선 단일 실패점이었다(D-1).
    const nav = window.VOLT_NAV || {
        showSection() {}, parseRouteFromHash() { return { section: 'home', anchorId: null }; },
        getInitialRoute() { return { section: 'home', anchorId: null, url: window.location.href }; },
        setupNavLinks() {}, setupMobileMenu() {}, setMobileMenuState() {}, closeMoreMenu() {}, closeTradeMenu() {}, init() {},
    };
    if (!window.VOLT_NAV) console.warn('VOLT_NAV 미로드 — 내비게이션 없이 계속 진행(섹션 전환 불가)');
    const { showSection, parseRouteFromHash, getInitialRoute, setupNavLinks, setupMobileMenu, setMobileMenuState, closeMoreMenu, closeTradeMenu } = nav;
    // UEX 데이터/계산 계층은 js/uex.js로 분리됨(window.VOLT_UEX).
    const uex = window.VOLT_UEX || { init() {} };
    if (!window.VOLT_UEX) console.warn('VOLT_UEX 미로드 — 무역 계산 기능 없이 계속 진행');
    // 런타임 i18n(js/i18n.js, window.VOLT_I18N). 동적 콘텐츠는 언어별 필드(_en)를 선택해 렌더한다.
    const i18n = window.VOLT_I18N;
    function currentLang() { return i18n && i18n.getLang ? i18n.getLang() : 'ko'; }
    function tx(item, field) {
        if (!item) return '';
        const en = item[`${field}_en`];
        return currentLang() === 'en' && en ? en : item[field];
    }
    // 배열 필드용(예: competencies_en). EN이고 배열이 있으면 그걸, 아니면 KO 원본.
    function txArr(item, field) {
        const en = item && item[`${field}_en`];
        return currentLang() === 'en' && Array.isArray(en) ? en : (item && Array.isArray(item[field]) ? item[field] : []);
    }
    function i18nT(key, fallback) { return i18n && i18n.t ? i18n.t(key) : (fallback || key); }
    // 공지 UI는 js/notices.js로 분리(window.VOLT_NOTICES). 호출부 무변경용 위임 shim.
    function renderNoticeFilters() { return window.VOLT_NOTICES?.renderNoticeFilters?.(); }
    // 공지 재렌더 훅(초기/CMS 로드/언어 변경)이 전부 이 shim을 지나므로 랜딩 티저도 함께 갱신한다.
    function renderAnnouncements() { window.VOLT_LANDING?.render?.(); return window.VOLT_NOTICES?.renderAnnouncements?.(); }
    function setupNoticeControls() { return window.VOLT_NOTICES?.setupNoticeControls?.(); }
    function openNoticeFromQuery() { return window.VOLT_NOTICES?.openNoticeFromQuery?.(); }
    function copyNoticeLink(id) { return window.VOLT_NOTICES?.copyNoticeLink?.(id); }
    // 일정/RSVP UI는 js/schedule.js로 분리(window.VOLT_SCHEDULE). 호출부 무변경용 위임 shim.
    function renderSchedule() { return window.VOLT_SCHEDULE?.renderSchedule?.(); }
    function setupScheduleAccordion() { return window.VOLT_SCHEDULE?.setupScheduleAccordion?.(); }
    // 함선DB UI는 js/ships.js로 분리. 기존 호출부 무변경용 위임 shim.
    function renderShips() { return window.VOLT_SHIPS?.renderShips?.(); }
    function renderShipManufacturers() { return window.VOLT_SHIPS?.renderShipManufacturers?.(); }
    function setupShipControls() { return window.VOLT_SHIPS?.setupShipControls?.(); }
    function resetShipState() { return window.VOLT_SHIPS?.resetShipState?.(); }
    function openShipModal(ship) { return window.VOLT_SHIPS?.openShipModal?.(ship); }
    // 전역 검색 모달은 js/search-modal.js로 분리. 호출부 무변경용 위임 shim.
    function setupSearch() { return window.VOLT_SEARCH?.setup?.(); }
    function invalidateSearchCache() { return window.VOLT_SEARCH?.invalidateCache?.(); }
    const PLANNER_STORAGE_KEY = 'volt-planner-state';
    const HANGAR_KEY = 'volt-hangar';
    const shipState = { manufacturer: 'all', hideUnreleased: false, query: '', sort: 'name-asc', purpose: '', cargoMin: 0, hangarOnly: false, marketOnly: false, selectedTags: [] };
    const SHIP_FILTER_ORDER = ['화물', '전투', '탐사', '인양', '채굴', '정제', '주유', '의료', '연구', '수송', '지원', '방송', '레이싱', '다목적', '입문', '기함', '미구현'];
    const RSI_SHIP_MATRIX_URL = 'https://robertsspaceindustries.com/ship-matrix';
    const UEX_CACHE_TTL_MS = { commodities: 60 * 60 * 1000, prices: 30 * 60 * 1000 };
    let shipById = new Map((data.ships || []).map((ship) => [ship.id, ship]));
    let deferredInstallPrompt = null;
    let authState = { loggedIn: false, user: null, roles: [] };
    let userPreferencesLoaded = false;
    let liveMemberCount = null;
    let preferencesSaveTimer = null;

    const RECOMMENDED_TRADE_GROUPS = [
        { titleKey: 'planner.tradeShip.starter', fallback: '입문/소규모 운송 추천', shipIds: ['hull-a', 'cutlass-black', 'zeus-mk2-cl'] },
        { titleKey: 'planner.tradeShip.bulk', fallback: '대량 수송 추천', shipIds: ['caterpillar', 'hull-c'] },
        { titleKey: 'planner.tradeShip.highValue', fallback: '고가 화물/호송 추천', shipIds: ['constellation-taurus', 'zeus-mk2-cl'] },
        { titleKey: 'planner.tradeShip.mining', fallback: '채굴/정제 후 운송 추천', shipIds: ['starlancer-max', 'hull-a'] }
    ];
    const localizationLookupCache = new Map();
    const RECOMMENDED_COMMODITY_CANDIDATES = [
        'Gold',
        'Beryl',
        'Laranite',
        'Agricium',
        'Titanium',
        'Diamond',
        'Quartz',
        'Medical Supplies',
        'Processed Food',
        'Distilled Spirits'
    ];
    let revealObserver;
    let activeModal = null;
    let lastModalTrigger = null;

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

    function formatApproximateMemberCount(memberCount) {
        if (!Number.isInteger(memberCount) || memberCount < 0) return null;
        // 10단위로 내림: 근사 표기를 유지하되 100단위 내림처럼 크게 어긋나지 않게 한다.
        const rounded = Math.floor(memberCount / 10) * 10;
        const displayCount = rounded > 0 ? rounded : memberCount;
        return `${displayCount.toLocaleString('en-US')}+`;
    }

    async function hydrateMemberCount() {
        try {
            const response = await fetch('/api/discord-stats', { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`Discord stats API failed: ${response.status}`);

            const payload = await response.json();
            if (Number.isInteger(payload?.memberCount) && payload.memberCount >= 0) {
                // 라이브값을 저장해 두면 이후 CMS 새로고침으로 renderAll이 다시 돌아도 유지된다.
                liveMemberCount = payload.memberCount;
                renderMemberCount();
            }
        } catch (error) {
            console.warn('Discord member count fallback', error);
        }
    }

    function parseLargestNumber(value) {
        const matches = String(value).match(/\d+/g);
        if (!matches) return 0;
        return Math.max(...matches.map(Number));
    }

    function getCargoValue(value) {
        return Number(String(value).replace(/[^\d]/g, '')) || 0;
    }

    function getHangar() {
        try {
            const parsed = JSON.parse(localStorage.getItem(HANGAR_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Invalid hangar state', error);
            localStorage.removeItem(HANGAR_KEY);
            return [];
        }
    }

    function setHangar(hangar, options = {}) {
        localStorage.setItem(HANGAR_KEY, JSON.stringify([...new Set(hangar)]));
        if (options.sync !== false) schedulePreferenceSave();
        renderMyPage();
    }

    function toggleHangar(shipId) {
        const hangar = getHangar();
        const index = hangar.indexOf(shipId);
        if (index === -1) hangar.push(shipId);
        else hangar.splice(index, 1);
        setHangar(hangar);
        return hangar.includes(shipId);
    }

    function isInHangar(shipId) {
        return getHangar().includes(shipId);
    }

    function savePlannerState() {
        const state = {
            shipId: document.getElementById('logistics-ship')?.value || '',
            shipSearch: document.getElementById('logistics-ship-search')?.value || '',
            cargo: document.getElementById('logistics-cargo')?.value || ''
        };
        localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(state));
        schedulePreferenceSave();
        renderMyPage();
    }

    function restorePlannerState() {
        try {
            const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
            if (!raw) return;
            const state = JSON.parse(raw);
            const set = (id, value) => {
                const element = document.getElementById(id);
                if (element && value !== undefined) element.value = value;
            };
            set('logistics-ship', state.shipId);
            set('logistics-ship-search', state.shipSearch);
            set('logistics-cargo', state.cargo);
            syncPlannerSelectedShip(state.shipId);
        } catch (error) {
            console.warn('Invalid planner state', error);
            localStorage.removeItem(PLANNER_STORAGE_KEY);
        }
    }

    function observeNewReveals(container) {
        if (!revealObserver || !container) return;
        container.querySelectorAll('.reveal:not(.revealed)').forEach((element) => revealObserver.observe(element));
    }

    function renderLeaders() {
        const container = document.getElementById('leadership-grid');
        if (!container) return;
        const leaders = getRenderableLeadership();
        container.innerHTML = leaders.map(renderLeaderCard).join('');
        observeNewReveals(container);
    }

    // CEO(is-primary)는 전체 폭 3열(아바타 | 정보 | 핵심역량·CTA) 그리드,
    // 나머지 임원은 compact 카드. 상세는 모달로 분리.
    function renderLeaderCard(leader) {
        const isPrimary = leader.avatarStyle === 'ceo';
        const id = escapeHtml(String(leader.id || leader.name || ''));
        const info = `
                <div class="leader-info">
                    <h3>${escapeHtml(leader.name)}</h3>
                    <span class="leader-role">${escapeHtml(tx(leader, 'role'))}</span>
                    <p class="leader-contact">Discord: ${escapeHtml(leader.discord)}</p>
                    <p class="leader-description leader-summary">${escapeHtml(tx(leader, 'description'))}</p>
                    ${isPrimary ? '' : `${renderLeaderKeyPoints(leader, 2)}<span class="leader-more" aria-hidden="true">${escapeHtml(i18nT('leadership.viewDetail', '자세히 보기 →'))}</span>`}
                </div>`;
        const aside = isPrimary ? `
                <div class="leader-aside">
                    ${renderLeaderKeyPoints(leader, 3)}
                    <span class="leader-more" aria-hidden="true">${escapeHtml(i18nT('leadership.viewDetail', '자세히 보기 →'))}</span>
                </div>` : '';
        return `
            <button class="leader-card${isPrimary ? ' ceo-card is-primary' : ''} reveal" type="button" data-leader-id="${id}" aria-label="${escapeHtml(`${leader.name} ${i18nT('leadership.detailAria', '상세 보기')}`)}">
                ${renderLeaderAvatar(leader)}${info}${aside}
            </button>`;
    }

    // 카드에는 핵심 역량 상위 3개만 요약. 철학·기여·전체 역량 등 상세는 모달로 분리.
    function renderLeaderKeyPoints(leader, limit = 3) {
        const items = txArr(leader, 'competencies').slice(0, limit);
        if (!items.length) return '';
        return `<div class="leader-keypoints"><strong>${escapeHtml(i18nT('leadership.keyCompetencies', '핵심 역량'))}</strong><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
    }

    function getRenderableLeadership() {
        const leaders = Array.isArray(data.leadership)
            ? data.leadership.filter((leader) => leader && leader.published !== false)
            : [];
        return leaders.length ? leaders : staticLeadership;
    }

    function renderLeaderAvatar(leader) {
        const avatarUrl = getLeaderAvatarUrl(leader);
        if (avatarUrl) {
            return `<img class="leader-avatar leader-avatar-image" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(leader.name || 'Leader')} profile photo" loading="lazy" decoding="async">`;
        }
        // 아바타 배경은 CSS(charcoal + accent)로 통일한다. (브랜드 톤 정리)
        return `<div class="leader-avatar leader-avatar-fallback" aria-hidden="true">${escapeHtml(getLeaderInitial(leader))}</div>`;
    }

    function getLeaderAvatarUrl(leader) {
        return leader.avatarUrl || leader.photoUrl || leader.imageUrl || '';
    }

    function getLeaderInitial(leader) {
        return leader.avatar || (leader.name || '?').charAt(0).toUpperCase();
    }

    function renderLeaderDetails(leader) {
        const details = Array.isArray(leader.details) ? `<div class="leader-details">${leader.details.map((item) => `
            <div class="leader-details-item"><strong>${escapeHtml(tx(item, 'title'))}</strong><p>${escapeHtml(tx(item, 'content'))}</p></div>`).join('')}</div>` : '';
        const compItems = txArr(leader, 'competencies');
        const competencies = compItems.length ? `<div class="leader-competencies"><strong>${escapeHtml(i18nT('leadership.keyCompetencies', '핵심 역량'))}</strong><ul>${compItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
        const duties = leader.duties ? `<div class="leader-duties"><strong>${escapeHtml(i18nT('leadership.duties', '주요 업무'))}</strong> · ${escapeHtml(tx(leader, 'duties'))}</div>` : '';
        return `${details}${competencies}${duties}`;
    }

    function renderStreamers() {
        const container = document.getElementById('streamers-grid');
        if (!container || !Array.isArray(data.streamers)) return;
        container.innerHTML = data.streamers.map((streamer) => {
            const imagePosition = streamer.imagePosition ? ` data-style-object-position="${escapeHtml(streamer.imagePosition)}"` : '';
            const icon = streamer.image
                ? `<img src="${escapeHtml(streamer.image)}" alt="${escapeHtml(streamer.name)}" loading="lazy" decoding="async"${imagePosition}>`
                : `<div class="streamer-icon-fallback" aria-hidden="true">${escapeHtml((streamer.name || '?').charAt(0).toUpperCase())}</div>`;
            return `<div class="streamer-card reveal">
                <div class="streamer-icon">${icon}</div>
                <h3>${escapeHtml(streamer.name)}</h3>
                <span class="streamer-platform">${escapeHtml(tx(streamer, 'platform'))}</span>
                <p class="streamer-description">${escapeHtml(tx(streamer, 'description'))}</p>
                <div class="streamer-details">${streamer.sections.map((section) => `<div class="streamer-sub-section"><h4>${escapeHtml(tx(section, 'title'))}</h4><p>${formatMultilineText(tx(section, 'content'))}</p></div>`).join('')}</div>
                ${renderStreamerLink(streamer)}
            </div>`;
        }).join('');
    }

    function renderStreamerLink(streamer) {
        if (!streamer.channelUrl) return '';
        return `<a href="${escapeHtml(streamer.channelUrl)}" target="_blank" rel="noopener noreferrer" class="streamer-link">${escapeHtml(i18nT('streamers.watch', '방송 보기'))}</a>`;
    }

    function renderTimeline() {
        const container = document.getElementById('timeline-list');
        if (!container || !Array.isArray(data.timeline)) return;
        container.innerHTML = data.timeline.map((item) => `
            <div class="timeline-item reveal">
                <div class="timeline-date">${escapeHtml(item.date)}</div>
                <div class="timeline-title">${escapeHtml(tx(item, 'title'))}</div>
                <div class="timeline-desc">${escapeHtml(tx(item, 'description'))}</div>
            </div>`).join('');
    }

    function renderDepartments() {
        const container = document.getElementById('about-grid');
        if (!container || !Array.isArray(data.departments)) return;
        container.innerHTML = data.departments.map((department) => `
            <div class="card about-card reveal">
                <h3>${escapeHtml(tx(department, 'name'))}</h3>
                <p>${escapeHtml(tx(department, 'description'))}</p>
            </div>`).join('');
    }

    function renderCoreValues() {
        const container = document.getElementById('culture-grid');
        if (!container || !Array.isArray(data.coreValues)) return;
        container.innerHTML = data.coreValues.map((value) => `
            <div class="culture-item reveal">
                <h4>${escapeHtml(tx(value, 'title'))}</h4>
                <p>${escapeHtml(tx(value, 'description'))}</p>
            </div>`).join('');
    }

    function renderHubFeatures() {
        const container = document.getElementById('hub-features');
        if (!container || !data.hub || !Array.isArray(data.hub.features)) return;
        container.innerHTML = data.hub.features.map((feature) => `
            <div class="hub-feature reveal">
                <h4>${escapeHtml(feature.title)}</h4>
                <ul>${feature.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </div>`).join('');
    }

    function renderJoinSteps() {
        const container = document.getElementById('join-steps');
        if (!container || !Array.isArray(data.joinSteps)) return;
        container.innerHTML = data.joinSteps.map((step) => `
            <div class="join-step reveal">
                <div class="step-number">${escapeHtml(String(step.number))}</div>
                <h3>${escapeHtml(tx(step, 'title'))}</h3>
                <p>${escapeHtml(tx(step, 'description'))}</p>
            </div>`).join('');
    }

    function renderJoinChecklist() {
        const container = document.getElementById('join-checklist');
        if (!container || !Array.isArray(data.joinChecklist)) return;
        container.innerHTML = `
            <div class="join-checklist-heading">
                <h3>${escapeHtml(i18nT('faq.preTitle', '가입 전 확인'))}</h3>
                <p>${escapeHtml(i18nT('faq.preBody', '지원 전에 가장 많이 궁금해하는 내용을 먼저 정리했습니다.'))}</p>
            </div>
            <div class="join-checklist-grid">
                ${data.joinChecklist.map((item) => `
                    <article class="join-checklist-card reveal">
                        <h4>${escapeHtml(item.title)}</h4>
                        <p>${escapeHtml(item.description)}</p>
                    </article>`).join('')}
            </div>`;
    }

    function renderFooterStreamers() {
        const container = document.getElementById('footer-streamers-list');
        if (!container || !Array.isArray(data.streamers)) return;
        container.innerHTML = data.streamers.map((streamer) => `
            <li><a href="${escapeHtml(streamer.channelUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(streamer.name)}</a></li>`).join('');
    }

    function renderGallery() {
        const container = document.getElementById('gallery-grid');
        if (!container) return;
        if (!Array.isArray(data.gallery) || data.gallery.length === 0) {
            container.innerHTML = `
                <div class="gallery-empty">
                    <p class="gallery-empty-title">&#xac24;&#xb7ec;&#xb9ac; &#xc900;&#xbe44; &#xc911;</p>
                    <p class="gallery-empty-desc">&#xace7; &#xd65c;&#xb3d9; &#xc0ac;&#xc9c4;&#xc774; &#xc5c5;&#xb85c;&#xb4dc;&#xb420; &#xc608;&#xc815;&#xc785;&#xb2c8;&#xb2e4;.</p>
                </div>`;
            return;
        }
        container.innerHTML = data.gallery.map((item) => `
            <button class="gallery-item reveal" type="button" data-gallery-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)} ${escapeHtml(i18nT('gallery.viewLarger', '크게 보기'))}">
                <img src="${escapeHtml(item.thumb || item.src)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">
                <span class="gallery-item-overlay">
                    <span class="gallery-item-title">${escapeHtml(item.title)}</span>
                    <span class="gallery-item-meta">${escapeHtml(item.date)}</span>
                </span>
            </button>`).join('');
        observeNewReveals(container);
    }

    function getSortedShips() {
        if (!Array.isArray(data.ships)) return [];
        return [...data.ships].sort(compareShips);
    }

    function compareShips(left, right) {
        const [field, direction] = shipState.sort.split('-');
        const multiplier = direction === 'desc' ? -1 : 1;
        const comparison = compareShipField(left, right, field);
        return (comparison || compareText(left.name, right.name)) * multiplier;
    }

    function compareShipField(left, right, field) {
        const sizeOrder = { '초소형': 1, '지상': 2, '소형': 3, '중형': 4, '대형': 5, '캐피탈': 6 };
        if (field === 'size') return (sizeOrder[left.size] || 99) - (sizeOrder[right.size] || 99);
        if (field === 'crew') return parseLargestNumber(left.crew) - parseLargestNumber(right.crew);
        if (field === 'cargo') return getCargoValue(left.cargo) - getCargoValue(right.cargo);
        if (field === 'price') return getPriceValue(left.priceUsd) - getPriceValue(right.priceUsd);
        return compareText(left.name, right.name);
    }

    function getShipFilterTags() {
        if (!Array.isArray(data.ships)) return [];
        const tags = new Set(data.ships.flatMap((ship) => [ship.focus, ...(ship.tags || [])]));
        return SHIP_FILTER_ORDER.filter((tag) => tags.has(tag));
    }

    function getShipManufacturers() {
        if (!Array.isArray(data.ships)) return [];
        return [...new Set(data.ships.map((ship) => ship.manufacturer))].sort(compareText);
    }


    // 통합 태그 칩: '전체' + 역할 태그(복수 선택). 선택한 태그 중 하나라도 포함되면 표시한다.

    function getVisibleShips() {
        const query = shipState.query.trim().toLowerCase();
        let ships = getSortedShips().filter((ship) => {
            const tags = getShipTags(ship);
            const matchesManufacturer = shipState.manufacturer === 'all' || ship.manufacturer === shipState.manufacturer;
            const matchesReleaseState = !shipState.hideUnreleased || !tags.includes('\ubbf8\uad6c\ud604');
            const matchesSelectedTags = shipState.selectedTags.length === 0 || shipState.selectedTags.some((tag) => ship.focus === tag || tags.includes(tag));
            const haystack = buildShipSearchText(ship, tags);
            return matchesManufacturer && matchesReleaseState && matchesSelectedTags && (!query || haystack.includes(query));
        });
        if (shipState.cargoMin > 0) {
            ships = ships.filter((ship) => getCargoValue(ship.cargo) >= shipState.cargoMin);
        }
        if (shipState.hangarOnly) {
            const hangar = getHangar();
            ships = ships.filter((ship) => hangar.includes(ship.id));
        }
        // 인게임 구매/렌탈 가능 함선만. market 레이어(지연 로드)가 아직 없으면 적용을 보류하고
        // 로드 완료 후 재렌더에서 필터링한다(전체 표시 유지 → 빈 화면 깜빡임 방지).
        if (shipState.marketOnly && window.VOLT_SHIP_MARKET) {
            ships = ships.filter((ship) => shipHasInGameMarket(ship));
        }
        // 검색어가 있으면 이름/별칭 일치 함선을 설명(번역 포함)만 일치한 함선보다 앞에 둔다 (C-1).
        // 예: "Carrack" 검색 시 설명에 Carrack이 언급된 C8 Pisces가 Carrack 본체를 밀어내지 않게.
        if (query) {
            const nameHit = (ship) => [ship.name, getShipDisplayName(ship), ...getShipAliases(ship)]
                .filter(Boolean).join(' ').toLowerCase().includes(query);
            ships = [...ships.filter(nameHit), ...ships.filter((ship) => !nameHit(ship))];
        }
        return ships;
    }

    // Erkul market 레이어에 구매처 또는 렌탈 행이 하나라도 있으면 인게임에서 획득 가능.
    function shipHasInGameMarket(ship) {
        const market = (window.VOLT_SHIP_MARKET || {})[ship.id];
        if (!market) return false;
        return (Array.isArray(market.purchase) && market.purchase.length > 0)
            || (Array.isArray(market.rentals) && market.rentals.length > 0);
    }

    function getShipTags(ship) {
        return Array.isArray(ship.tags) ? ship.tags : [];
    }

    function buildShipSearchText(ship, tags = getShipTags(ship)) {
        // KO·EN 양쪽 필드를 모두 색인해 영어로도 검색되게 한다.
        // 화면에 표시되는 Erkul 번역 설명(live 레이어)도 색인한다 — 표시 문구로 검색이 잡히도록.
        // live는 지연 로드이므로 로드 전에는 legacy 설명만 색인된다(로드 완료 시 검색 캐시 무효화).
        return [
            ship.name, ship.manufacturer, ship.role, ship.focus, ship.description, ship.cargo, formatShipPrice(ship.priceUsd),
            ship.role_en, ship.focus_en, ship.size_en, ship.description_en, ...(Array.isArray(ship.tags_en) ? ship.tags_en : []),
            ...getShipLiveDescriptions(ship),
            ...tags, ...getShipAliases(ship)
        ].filter(Boolean).join(' ').toLowerCase();
    }

    // live 레이어의 번역/영문 설명 (없으면 빈 배열 — 미로드/미매칭 함선)
    function getShipLiveDescriptions(ship) {
        const live = (window.VOLT_SHIP_LIVE_STATS || {})[ship.id];
        if (!live || !live.descriptions) return [];
        return [live.descriptions.ko, live.descriptions.en].filter(Boolean);
    }

    function getShipAliases(ship) {
        const aliases = getLocalizationValue(ship.name, 'ships');
        return Array.isArray(aliases) ? aliases : [];
    }

    // Phase 2 표시명 정책: 한글명 우선, 영문명(ship.name) 보조. 한 곳에 모은다.
    // CMS 한글명 오버라이드(ship.nameKo)가 있으면 정적 별칭보다 우선한다.
    function getShipKoreanName(ship) {
        if (ship.nameKo && /[가-힣]/.test(ship.nameKo)) return ship.nameKo;
        return getShipAliases(ship).find((alias) => /[가-힣]/.test(alias)) || '';
    }

    // 표시명: EN이면 영문명(ship.name) 우선·한글 보조, KO면 한글명 우선·영문 보조.
    function getShipDisplayName(ship) {
        if (currentLang() === 'en') return ship.name;
        return getShipKoreanName(ship) || ship.name;
    }

    function getShipSecondaryName(ship) {
        const ko = getShipKoreanName(ship);
        if (currentLang() === 'en') return ko || '';
        return ko ? ship.name : '';
    }

    function formatShipPrice(priceUsd) {
        return Number.isFinite(priceUsd) ? `$${priceUsd.toLocaleString('en-US')}` : i18nT('ships.priceTbd', '미공개');
    }

    function getPriceValue(priceUsd) {
        return Number.isFinite(priceUsd) ? priceUsd : Number.MAX_SAFE_INTEGER;
    }







    function renderPolicy() {
        const container = document.getElementById('policy-list');
        if (!container || !data.policy || !Array.isArray(data.policy.sections)) return;
        container.innerHTML = `<div class="policy-updated">${escapeHtml(i18nT('policy.lastUpdatedLabel', '최종 업데이트:'))} ${escapeHtml(data.policy.lastUpdated)}</div>
            ${data.policy.sections.map((section, index) => renderPolicySection(section, index)).join('')}`;
    }

    function renderPolicySection(section, index) {
        const sectionId = `policy-section-${index + 1}`;
        const notice = section.notice ? `<div class="policy-notice">${escapeHtml(tx(section, 'notice'))}</div>` : '';
        return `<div class="policy-section reveal" id="${sectionId}">
            <div class="policy-section-heading">
                <h3 class="policy-section-title">${escapeHtml(tx(section, 'title'))}</h3>
                <button class="policy-anchor-copy" type="button" data-policy-index="${index + 1}" aria-label="${escapeHtml(tx(section, 'title'))} \ub9c1\ud06c \ubcf5\uc0ac"><span class="icon-link" aria-hidden="true"></span></button>
            </div>
            ${notice}
            <div class="policy-items">${section.items.map((item) => `<div class="policy-item"><span class="policy-num">${escapeHtml(tx(item, 'num'))}</span><span class="policy-text">${escapeHtml(tx(item, 'text'))}</span></div>`).join('')}</div>
        </div>`;
    }

    function renderFaq() {
        const container = document.getElementById('faq-list');
        if (!container || !Array.isArray(data.faq)) return;
        container.innerHTML = `<div class="faq-accordion">${data.faq.map((item, index) => `
            <div class="faq-item reveal" id="faq-item-${index}">
                <button class="faq-question" id="faq-q-${index}" aria-expanded="false" aria-controls="faq-ans-${index}">
                    <span>${escapeHtml(tx(item, 'q'))}</span>
                    <span class="faq-icon">+</span>
                </button>
                <div class="faq-answer" id="faq-ans-${index}" role="region" aria-labelledby="faq-q-${index}" hidden>
                    <p>${escapeHtml(tx(item, 'a'))}</p>
                </div>
            </div>`).join('')}</div>`;
    }

    function renderTradeGuide() {
        const container = document.getElementById('guide-list');
        if (!container || !Array.isArray(data.tradeGuide)) return;
        container.innerHTML = data.tradeGuide.map((guide) => `
            <div class="guide-card reveal">
                <div class="guide-step-num">${escapeHtml(String(guide.step))}</div>
                <h3>${escapeHtml(tx(guide, 'title'))}</h3>
                <p>${escapeHtml(tx(guide, 'content'))}</p>
            </div>`).join('');
        renderLogisticsShipOptions();
        renderRecommendedTradeShips();
        renderTradeGlossary();
    }

    function renderTradeGlossary() {
        const container = document.getElementById('guide-glossary');
        const glossary = localization.glossary || {};
        if (!container) return;
        const entries = Object.entries(glossary).slice(0, 20);
        container.innerHTML = entries.length
            ? entries.map(([term, label]) => `<div class="guide-glossary-item"><strong>${escapeHtml(term)}</strong><span>${escapeHtml(label)}</span></div>`).join('')
            : `<div class="guide-glossary-empty">${escapeHtml(i18nT('guide.glossaryEmpty', '등록된 용어가 없습니다.'))}</div>`;
    }

    function renderRecommendedTradeShips() {
        const container = document.getElementById('recommended-trade-grid');
        if (!container) return;
        container.innerHTML = RECOMMENDED_TRADE_GROUPS.map((group) => {
            const ships = group.shipIds.map((id) => shipById.get(id)).filter((ship) => ship && isPlannerEligibleShip(ship));
            return `<section class="recommended-trade-group">
                <h4>${escapeHtml(i18nT(group.titleKey, group.fallback))}</h4>
                <div>${ships.map(renderRecommendedTradeShipCard).join('')}</div>
            </section>`;
        }).join('');
    }

    function renderRecommendedTradeShipCard(ship) {
        return `<article class="recommended-trade-card">
            <strong>${escapeHtml(ship.name)}</strong>
            <span>${escapeHtml(ship.cargo)} · ${escapeHtml(ship.role)}</span>
            <div>
                <button class="btn btn-secondary" type="button" data-open-ship-id="${escapeHtml(ship.id)}">${escapeHtml(i18nT('tradeHub.shipDetail', '함선 상세'))}</button>
                <button class="btn btn-primary" type="button" data-use-planner-ship-id="${escapeHtml(ship.id)}">${escapeHtml(i18nT('tradeHub.useInPlanner', '무역 플래너에서 사용'))}</button>
            </div>
        </article>`;
    }

    function getLogisticsShips() {
        return (data.ships || [])
            .filter(isPlannerEligibleShip)
            .sort(comparePlannerShips);
    }

    function renderLogisticsShipOptions() {
        const select = document.getElementById('logistics-ship');
        if (!select) return;
        select.innerHTML = `<option value="">${escapeHtml(i18nT('planner.shipSelectDefault', '보유 함선 선택'))}</option>${getLogisticsShips().map((ship) => (
            `<option value="${escapeHtml(ship.id)}">${escapeHtml(ship.name)} · ${escapeHtml(ship.cargo)}</option>`
        )).join('')}`;
    }

    function isPlannerEligibleShip(ship) {
        const tags = getShipTags(ship);
        return ship?.implemented !== false
            && !tags.includes('미구현')
            && getCargoValue(ship?.cargo) > 0;
    }

    function comparePlannerShips(left, right) {
        const eligibilityDelta = Number(right.plannerEligible === true) - Number(left.plannerEligible === true);
        if (eligibilityDelta) return eligibilityDelta;
        const tradeDelta = getPlannerTradeScore(right) - getPlannerTradeScore(left);
        if (tradeDelta) return tradeDelta;
        const cargoDelta = getCargoValue(right.cargo) - getCargoValue(left.cargo);
        return cargoDelta || compareText(left.name, right.name);
    }

    function getPlannerTradeScore(ship) {
        const text = [ship.role, ship.focus, ship.description, ...getShipTags(ship)].join(' ');
        const weights = { 화물: 3, 물류: 3, 무역: 3, 수송: 2, 운송: 2, 보급: 2, 산업: 1, 다목적: 1 };
        const score = Object.entries(weights).reduce((total, [token, weight]) => total + (text.includes(token) ? weight : 0), 0);
        return text.includes('전투') ? score - 0.5 : score;
    }

    function setupPlannerShipPicker() {
        const input = document.getElementById('logistics-ship-search');
        const results = document.getElementById('logistics-ship-results');
        if (!input || !results) return;
        input.addEventListener('focus', () => renderPlannerShipResults(input.value));
        input.addEventListener('input', () => renderPlannerShipResults(input.value));
        input.addEventListener('keydown', (event) => handlePickerKeyboard(event, results, selectPlannerShip));
        results.addEventListener('keydown', (event) => handlePickerKeyboard(event, results, selectPlannerShip));
        results.addEventListener('click', (event) => {
            const option = event.target.closest('[data-planner-ship-id]');
            if (option) selectPlannerShip(option.getAttribute('data-planner-ship-id'), true);
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('#logistics-ship-picker')) closePicker(input, results);
        });
    }

    function renderPlannerShipResults(query = '') {
        const input = document.getElementById('logistics-ship-search');
        const results = document.getElementById('logistics-ship-results');
        if (!input || !results) return;
        const ships = filterPlannerShips(query).slice(0, 12);
        results.innerHTML = ships.length ? ships.map(renderPlannerShipOption).join('') : `<div class="planner-picker-empty">${escapeHtml(i18nT('planner.shipPickerEmpty', '검색 결과가 없습니다. 함선명, 제조사, 역할 또는 화물량으로 다시 검색해 보세요.'))}</div>`;
        results.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    function filterPlannerShips(query) {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return getLogisticsShips();
        return getLogisticsShips().filter((ship) => buildShipSearchText(ship, getShipTags(ship)).includes(normalized));
    }

    function renderPlannerShipOption(ship) {
        const tags = getShipTags(ship).slice(0, 3).join(' · ') || ship.focus;
        const selected = document.getElementById('logistics-ship')?.value === ship.id;
        return `<button class="planner-picker-option" type="button" role="option" aria-selected="${selected}" data-planner-ship-id="${escapeHtml(ship.id)}">
            <strong>${escapeHtml(getShipDisplayName(ship))}</strong>
            ${getShipSecondaryName(ship) ? `<span class="planner-option-en">${escapeHtml(getShipSecondaryName(ship))}</span>` : ''}
            <span>${escapeHtml(ship.manufacturer)} · ${escapeHtml(ship.size)} · ${escapeHtml(ship.cargo)}</span>
            <small>${escapeHtml(tags)}</small>
        </button>`;
    }

    function selectPlannerShip(shipId, setCargo = false) {
        const ship = shipById.get(shipId);
        if (!ship || !isPlannerEligibleShip(ship)) return;
        trackEvent('planner_ship_select', { shipId: ship.id, shipName: ship.name });
        setPlannerControlValue('logistics-ship', ship.id);
        const input = document.getElementById('logistics-ship-search');
        const cargoInput = document.getElementById('logistics-cargo');
        if (input) input.value = getShipDisplayName(ship);
        const shouldUseShipCargo = setCargo || !Number(cargoInput?.value);
        if (shouldUseShipCargo) setPlannerControlValue('logistics-cargo', String(getCargoValue(ship.cargo)));
        renderPlannerShipSummary(ship);
        announcePickerSelection(i18nT('planner.shipSelectedAnnounce', '{name} 함선을 선택했습니다.').replace('{name}', getShipDisplayName(ship)));
        closePicker(input, document.getElementById('logistics-ship-results'));
        savePlannerState();
    }

    function renderPlannerShipSummary(ship) {
        const summary = document.getElementById('logistics-ship-summary');
        if (!summary) return;
        summary.hidden = false;
        const secondary = getShipSecondaryName(ship);
        summary.innerHTML = `<strong>${escapeHtml(getShipDisplayName(ship))}</strong>${secondary ? `<span class="planner-summary-en">${escapeHtml(secondary)}</span>` : ''}<span>${escapeHtml(ship.manufacturer)} · ${escapeHtml(ship.cargo)} · ${escapeHtml(ship.size)}</span><small>${escapeHtml(getPlannerShipRecommendation(ship))}</small>`;
    }

    function getPlannerShipRecommendation(ship) {
        if (getCargoValue(ship.cargo) >= 500) return i18nT('planner.shipRec.bulk', '대량 수송 추천');
        if (parseLargestNumber(ship.crew) <= 1) return i18nT('planner.shipRec.solo', '단독 운송 / 소규모 화물 추천');
        return i18nT('planner.shipRec.escort', '소규모 화물 / 호송 운송 추천');
    }

    function handlePickerKeyboard(event, results, onSelect) {
        const options = [...results.querySelectorAll('[role="option"]')];
        if (event.key === 'Escape') return closePicker(event.target, results);
        if (options.length === 0 || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        const current = options.indexOf(document.activeElement);
        if (event.key === 'Enter') {
            const option = current >= 0 ? options[current] : options[0];
            return onSelect(getPickerOptionValue(option), true);
        }
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        options[(current + direction + options.length) % options.length].focus();
    }

    function getPickerOptionValue(option) {
        return option.getAttribute('data-planner-ship-id') || option.getAttribute('data-commodity-id');
    }

    function closePicker(input, results) {
        if (!input || !results) return;
        results.hidden = true;
        input.setAttribute('aria-expanded', 'false');
    }

    function announcePickerSelection(message) {
        const liveRegion = document.getElementById('planner-picker-live');
        if (liveRegion) liveRegion.textContent = message;
    }



    async function loadCmsContent() {
        const [notices, events, gallery, partnerFleets, shipOverrides, leadership, timeline] = await Promise.all([
            fetchCmsCollection('/api/notices'),
            fetchCmsCollection('/api/events'),
            fetchCmsCollection('/api/gallery'),
            fetchCmsCollection('/api/partner-fleets'),
            fetchCmsCollection('/api/ship-overrides'),
            fetchCmsCollection('/api/leadership'),
            fetchCmsCollection('/api/timeline')
        ]);
        if (Array.isArray(notices)) data.announcements = notices;
        if (Array.isArray(events)) data.calendar = events;
        if (Array.isArray(gallery)) data.gallery = gallery;
        if (Array.isArray(partnerFleets)) data.partnerFleets = partnerFleets;
        if (Array.isArray(shipOverrides)) applyShipOverrides(shipOverrides);
        // 임원진/연혁은 volt-data.js에 정적 폴백이 있으므로 CMS에 데이터가 있을 때만 교체한다.
        if (Array.isArray(leadership) && leadership.length) data.leadership = leadership;
        if (Array.isArray(timeline) && timeline.length) data.timeline = timeline;
    invalidateSearchCache();
    }

    async function fetchCmsCollection(url) {
        try {
            const response = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`CMS API failed: ${response.status}`);
            const payload = await response.json();
            return Array.isArray(payload.items) ? payload.items : null;
        } catch (error) {
            console.warn(`CMS API fallback: ${url}`, error);
            return null;
        }
    }


    function applyShipOverrides(overrides) {
        if (!Array.isArray(overrides) || !Array.isArray(data.ships)) return;
        const overrideById = new Map(overrides.map((item) => [item.shipId || item.id, item]));
        // CMS hidden=true 함선은 공개 목록·검색·플래너에서 완전히 제외(소프트 삭제).
        data.ships = data.ships
            .map((ship) => mergeShipOverride(ship, overrideById.get(ship.id)))
            .filter((ship) => ship.hidden !== true);
        rebuildShipIndex();
    }

    function mergeShipOverride(ship, override) {
        if (!override) return ship;
        const merged = { ...ship };
        Object.entries(override).forEach(([key, value]) => {
            if (['id', 'shipId', 'updatedAt'].includes(key)) return;
            if (value === null || value === undefined || value === '') return;
            merged[key] = key === 'tags' && !Array.isArray(value) ? getShipTags({ tags: value }) : value;
        });
        return merged;
    }

    function rebuildShipIndex() {
        shipById = new Map((data.ships || []).map((ship) => [ship.id, ship]));
    }

    function getMemberCount() {
        if (Number.isFinite(data.memberCount)) return data.memberCount;
        if (Number.isFinite(data.fleet?.memberCount)) return data.fleet.memberCount;
        return null;
    }

    function getMemberLabel() {
        return formatApproximateMemberCount(liveMemberCount) || `${getMemberCount() ?? '?'}+`;
    }

    function renderMemberCount() {
        window.requestAnimationFrame(() => window.VOLT_LANDING?.renderCounts?.());
    }

    function renderPartnerFleets() {
        const container = document.getElementById('partner-fleets-grid');
        if (!container) return;
        const fleets = Array.isArray(data.partnerFleets)
            ? data.partnerFleets.filter((fleet) => fleet.published !== false)
            : [];
        if (!fleets.length) {
            container.innerHTML = `<div class="partner-fleets-empty">${escapeHtml(i18nT('partner.empty', '등록된 협력함대가 없습니다.'))}</div>`;
            return;
        }
        container.innerHTML = fleets
            .slice()
            .sort((left, right) => (Number(left.sortOrder || 0) - Number(right.sortOrder || 0)) || String(left.name || '').localeCompare(String(right.name || ''), 'ko'))
            .map(renderPartnerFleetCard)
            .join('');
        observeNewReveals(container);
    }

    function renderPartnerFleetCard(fleet) {
        const name = fleet.name || i18nT('partner.fallbackName', '협력함대');
        const logo = renderPartnerFleetImage(fleet, name);
        const en = currentLang() === 'en';
        const meta = [tx(fleet, 'region'), fleet.game, tx(fleet, 'focus')].filter(Boolean)
            .map((item) => `<span class="partner-fleet-badge">${escapeHtml(item)}</span>`)
            .join('');
        const memberText = fleet.memberCount
            ? (en ? `${Number(fleet.memberCount).toLocaleString('en-US')} ${i18nT('partner.members', 'members')}` : `멤버 ${Number(fleet.memberCount).toLocaleString('ko-KR')}명`)
            : '';
        const stats = [
            memberText,
            fleet.established ? `${i18nT('partner.founded', '창설')} ${fleet.established}` : ''
        ].filter(Boolean).map((item) => `<span class="partner-fleet-stat">${escapeHtml(item)}</span>`).join('');
        const links = [
            fleet.discordUrl ? `<a class="partner-fleet-link" href="${escapeHtml(fleet.discordUrl)}" target="_blank" rel="noopener noreferrer">Discord</a>` : '',
            fleet.websiteUrl ? `<a class="partner-fleet-link" href="${escapeHtml(fleet.websiteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(i18nT('partner.website', '웹사이트'))}</a>` : ''
        ].filter(Boolean).join('');
        return `
            <article class="partner-fleet-card reveal">
                <div class="partner-fleet-header">
                    ${logo}
                    <div class="partner-fleet-heading">
                        <h3 class="partner-fleet-title">${escapeHtml(name)}</h3>
                        <div class="partner-fleet-meta">${meta}</div>
                    </div>
                </div>
                <p class="partner-fleet-description">${escapeHtml(tx(fleet, 'description') || '협력 관계 정보를 준비 중입니다.')}</p>
                ${stats ? `<div class="partner-fleet-stats">${stats}</div>` : ''}
                ${links ? `<div class="partner-fleet-actions">${links}</div>` : ''}
            </article>
        `;
    }

    function renderPartnerFleetImage(fleet, name) {
        const imageUrl = fleet.photoUrl || fleet.imageUrl || fleet.logoUrl || '';
        if (imageUrl) {
            return `<img class="partner-fleet-logo partner-fleet-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async">`;
        }
        return `<span class="partner-fleet-logo-fallback" aria-hidden="true">${escapeHtml(getPartnerFleetInitials(name))}</span>`;
    }

    function getPartnerFleetInitials(name) {
        return String(name || '?').trim().slice(0, 2).toUpperCase();
    }

    function renderAll() {
        renderMemberCount();
        renderDepartments();
        renderCoreValues();
        renderTimeline();
        renderLeaders();
        renderPartnerFleets();
        renderHubFeatures();
        renderStreamers();
        renderJoinSteps();
        renderJoinChecklist();
        renderFooterStreamers();
        renderNoticeFilters();
        renderAnnouncements();
        renderSchedule();
        renderPolicy();
        renderFaq();
        renderTradeGuide();
        // 함선DB(247척 그리드)·갤러리는 무거워 시작 시 렌더하지 않고, 해당 섹션에
        // 첫 진입할 때 renderSectionOnShow에서 채운다. 이미 표시된 뒤에는 refresh만.
    }

    // 지연 렌더 대상 섹션. 첫 진입 시 렌더하고, 이후 CMS 로드/언어 변경 때만 갱신한다.
    function renderShipsSection() {
        renderShipManufacturers();
        renderShips();
        // live 레이어는 여기서 로드를 시작한다 (모달이 그 전에 열리면 ships.js가 로드 후 재렌더).
        // 로드 완료 후 한 번 더 렌더한다: 카드 설명(Erkul 번역 통합)과 인게임 구매/렌탈 필터가
        // live/market 데이터에 의존하므로 로드 전 렌더된 카드를 최신값으로 갱신한다.
        ensureShipLiveData().then(() => {
            if (renderedLazySections.has('ships')) renderShips();
        });
    }
    const LAZY_SECTIONS = { ships: renderShipsSection, gallery: renderGallery };
    const renderedLazySections = new Set();

    // navigation의 showSection 훅. 처음 보이는 순간에 한 번 렌더한다.
    function renderSectionOnShow(id) {
        const render = LAZY_SECTIONS[id];
        if (!render || renderedLazySections.has(id)) return;
        renderedLazySections.add(id);
        render();
    }

    // 데이터가 바뀐 뒤(CMS 로드·언어 변경) 이미 표시된 지연 섹션만 다시 렌더한다.
    function refreshRenderedLazySections() {
        renderedLazySections.forEach((id) => LAZY_SECTIONS[id]?.());
    }

    function getFocusableElements(container) {
        const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return [...container.querySelectorAll(selector)]
            .filter((element) => !element.hasAttribute('hidden') && element.offsetParent !== null);
    }

    function trapFocus(container, event) {
        const focusable = getFocusableElements(container);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!container.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function getLeaderById(id) {
        return getRenderableLeadership().find((leader) => String(leader.id || leader.name || '') === String(id)) || null;
    }

    function openLeaderModal(leader) {
        if (!leader) return;
        trackEvent('leader_modal_open', { leaderId: leader.id || '' });
        openModal(`<div class="modal-header">
                <div>
                    <h2 class="modal-title">${escapeHtml(leader.name)}</h2>
                    <p class="leader-role">${escapeHtml(tx(leader, 'role'))}</p>
                </div>
                <button class="modal-close" type="button" aria-label="${escapeHtml(i18nT('ships.modalClose', '모달 닫기'))}">×</button>
            </div>
            <div class="modal-body leader-modal-body">
                <div class="leader-modal-top">
                    ${renderLeaderAvatar(leader)}
                    <div>
                        <p class="leader-contact">Discord: ${escapeHtml(leader.discord)}</p>
                        <p class="leader-modal-desc">${escapeHtml(tx(leader, 'description'))}</p>
                    </div>
                </div>
                ${renderLeaderDetails(leader)}
            </div>`, true);
    }

    function setupLeadershipControls() {
        const grid = document.getElementById('leadership-grid');
        if (!grid) return;
        grid.addEventListener('click', (event) => {
            const card = event.target.closest('[data-leader-id]');
            if (card) openLeaderModal(getLeaderById(card.getAttribute('data-leader-id')));
        });
    }




    function useShipInPlanner(shipId) {
        const ship = shipById.get(shipId);
        closeModal();
        showSection('trade-planner');
        window.requestAnimationFrame(() => {
            if (ship && isPlannerEligibleShip(ship)) {
                selectPlannerShip(ship.id, true);
                savePlannerState();
                showToast(i18nT('planner.shipAppliedToast', '{name}\uc744 \ubb34\uc5ed \ud50c\ub798\ub108\uc5d0 \uc801\uc6a9\ud588\uc2b5\ub2c8\ub2e4.').replace('{name}', getShipDisplayName(ship)));
            } else {
                showToast(i18nT('planner.shipNotEligibleToast', '\uc774 \ud568\uc120\uc740 \ubb34\uc5ed \ud50c\ub798\ub108 \uc120\ud0dd \ub300\uc0c1\uc774 \uc544\ub2d9\ub2c8\ub2e4.'));
            }
        });
    }





    function setupLogisticsCalculator() {
        const cargo = document.getElementById('logistics-cargo');
        if (!cargo) return;
        document.getElementById('planner-reset')?.addEventListener('click', resetPlannerInputs);
        cargo.addEventListener('input', () => { savePlannerState(); window.VOLT_TRADE_PLANNER?.onCargoChange?.(); });
        cargo.addEventListener('change', () => { savePlannerState(); window.VOLT_TRADE_PLANNER?.onCargoChange?.(); });
        setupPlannerShipPicker();
        restorePlannerState();
    }

    function setPlannerControlValue(id, value) {
        const control = document.getElementById(id);
        if (control) control.value = value;
    }

    function resetPlannerInputs() {
        setPlannerControlValue('logistics-ship', '');
        setPlannerControlValue('logistics-ship-search', '');
        setPlannerControlValue('logistics-cargo', '0');
        const summary = document.getElementById('logistics-ship-summary');
        if (summary) {
            summary.hidden = true;
            summary.innerHTML = '';
        }
        localStorage.removeItem(PLANNER_STORAGE_KEY);
        showToast(i18nT('planner.resetToast', '무역플래너 입력을 초기화했습니다.'));
    }

    function syncPlannerSelectedShip(shipId) {
        const ship = shipById.get(shipId);
        if (!ship || !isPlannerEligibleShip(ship)) return;
        const input = document.getElementById('logistics-ship-search');
        if (input) input.value = ship.name;
        renderPlannerShipSummary(ship);
    }


    function getCommodityKoreanName(name) {
        if (!name) return '';
        const localized = getLocalizationValue(name, 'commodities');
        if (localized?.ko) return localized.ko;
        if (typeof localized === 'string') return localized;
        return '';
    }

    function getLocalizationValue(rawName, category) {
        if (!rawName || !localization[category]) return '';
        return getLocalizationLookup(category).get(normalizeLocalizationKey(rawName)) || '';
    }

    function getLocalizationLookup(category) {
        if (localizationLookupCache.has(category)) return localizationLookupCache.get(category);
        const lookup = new Map();
        Object.entries(localization[category] || {}).forEach(([key, value]) => {
            lookup.set(normalizeLocalizationKey(key), value);
        });
        localizationLookupCache.set(category, lookup);
        return lookup;
    }

    function normalizeLocalizationKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
    }

    function formatLocalizedName(rawName, category) {
        if (!rawName) return '';
        const localized = getLocalizationValue(rawName, category);
        if (!localized) return rawName;
        const korean = typeof localized === 'string' ? localized : localized.ko;
        return korean ? `${rawName} / ${korean}` : rawName;
    }

    function formatCommodityLabel(name) {
        const korean = getCommodityKoreanName(name);
        return korean ? `${name} / ${korean}` : name;
    }

    function formatCredits(value) {
        return `${Math.round(value).toLocaleString('ko-KR')} aUEC`;
    }

    function formatPercent(value) {
        return Number.isFinite(value) ? `${value.toFixed(1)}%` : '0.0%';
    }


    // 무역플래너 엔진은 js/trade-planner.js로 분리. 기존 호출부 무변경용 위임 shim.
    function parseSmallestNumber(value) {
        const matches = String(value).match(/\d+/g);
        return matches ? Number(matches[0]) : 1;
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
        lastModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        modal.innerHTML = `<div class="modal-card${wide ? ' modal-card-wide' : ''}" role="dialog" aria-modal="true">${content}</div>`;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        activeModal = modal.querySelector('.modal-card') || modal;
        // 접근성: dialog에 접근 가능한 이름 부여. 제목이 있으면 aria-labelledby로 연결,
        // 없으면 일반 aria-label로 폴백(axe aria-dialog-name 위반 제거).
        labelModalDialog(activeModal);
        activeModal.querySelector('.modal-close')?.focus();
    }

    function labelModalDialog(dialog) {
        const title = dialog.querySelector('.modal-title, .modal-header h2, h2, h3');
        if (title && title.textContent.trim()) {
            if (!title.id) title.id = 'global-modal-title';
            dialog.setAttribute('aria-labelledby', title.id);
            dialog.removeAttribute('aria-label');
        } else {
            dialog.setAttribute('aria-label', i18nT('common.dialog', '대화 상자'));
            dialog.removeAttribute('aria-labelledby');
        }
    }

    function closeModal() {
        if (!activeModal) return;
        const modal = document.getElementById('global-modal');
        modal?.classList.remove('active');
        modal?.setAttribute('aria-hidden', 'true');
        if (modal) modal.innerHTML = '';
        activeModal = null;
        document.body.style.overflow = '';
        lastModalTrigger?.focus();
        lastModalTrigger = null;
    }




    function openGalleryLightbox(item) {
        openModal(`<div class="modal-header gallery-modal-header">
                <div class="gallery-modal-heading">
                    <div class="ship-mfr">${escapeHtml(item.date)}</div>
                    <h2 class="modal-title gallery-modal-title">${escapeHtml(item.title)}</h2>
                </div>
                <button class="modal-close" type="button" aria-label="${escapeHtml(i18nT('common.modalClose', '모달 닫기'))}">×</button>
            </div>
            <div class="gallery-modal-image-wrap">
                <img class="gallery-lightbox-image gallery-modal-image" src="${escapeHtml(item.src)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">
            </div>
            <div class="gallery-lightbox-copy gallery-modal-description"><p>${escapeHtml(item.description)}</p></div>`, true);
    }

    function setupModalControls() {
        document.addEventListener('click', (event) => {
            if (event.target.closest('.modal-close')) closeModal();
            const noticeCopyButton = event.target.closest('[data-copy-notice-id]');
            if (noticeCopyButton) copyNoticeLink(noticeCopyButton.getAttribute('data-copy-notice-id'));
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
            showToast(i18nT('policy.copyOk', '정책 링크를 복사했습니다.'));
        } catch (error) {
            try {
                copyTextFallback(value);
                showCopyFeedback(button);
                showToast(i18nT('policy.copyOk', '정책 링크를 복사했습니다.'));
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
        const original = button.innerHTML;
        button.innerHTML = renderInlineIcon('check', 'copy-feedback-icon');
        window.setTimeout(() => { button.innerHTML = original; }, 1200);
    }

    function showToast(message) {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('visible');
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), 2200);
    }

    function setupFaqAccordion() {
        const container = document.getElementById('faq-list');
        if (!container) return;
        container.querySelectorAll('.faq-question').forEach((button) => {
            button.addEventListener('click', () => toggleFaqItem(container, button));
        });
    }

    function toggleFaqItem(container, button) {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        container.querySelectorAll('.faq-question').forEach(collapseFaqItem);
        if (!expanded) expandFaqItem(button);
    }

    function collapseFaqItem(button) {
        button.setAttribute('aria-expanded', 'false');
        button.querySelector('.faq-icon').textContent = '+';
        const answer = button.nextElementSibling;
        answer.hidden = true;
        answer.style.maxHeight = null;
    }

    function expandFaqItem(button) {
        button.setAttribute('aria-expanded', 'true');
        button.querySelector('.faq-icon').textContent = '−';
        const answer = button.nextElementSibling;
        answer.hidden = false;
        answer.style.maxHeight = `${answer.scrollHeight}px`;
    }


    function setupGlobalKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            const searchOverlay = document.getElementById('search-overlay');
            const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
            if (event.key === '/' && !isTyping && searchOverlay && !searchOverlay.classList.contains('active')) {
                event.preventDefault();
                document.getElementById('search-toggle')?.click();
            }
            if (activeModal && event.key === 'Tab') {
                trapFocus(activeModal, event);
                return;
            }
            if (event.key === 'Escape') {
                if (searchOverlay?.classList.contains('active')) closeSearch(searchOverlay, document.getElementById('global-search-input'));
                else if (activeModal) closeModal();
                else {
                    closeMoreMenu();
                    closeTradeMenu();
                }
            }
        });
    }

    function setupSplash() {
        const splash = document.getElementById('loading-splash');
        if (!splash) return;
        window.setTimeout(() => {
            splash.classList.add('splash-hide');
            // 스플래시가 걷히는 순간 히어로 스태거 진입 모션 시작 (D-②)
            window.VOLT_LANDING?.startHeroEntrance?.();
            window.setTimeout(() => { splash.style.display = 'none'; }, 600);
        }, 1200);
    }


    function setupAuthStatus() {
        const desktop = document.getElementById('volt-auth-desktop');
        const mobile = document.getElementById('volt-auth-mobile');
        if (!desktop && !mobile) return;

        notifyAuthErrorFromQuery();
        window.VOLT_AUTH_UI?.render?.({ status: 'loading' });

        fetch('/auth/me', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        })
            .then((response) => {
                if (!response.ok) throw new Error(`AUTH ${response.status}`);
                return response.json();
            })
            .then((payload) => {
                if (payload && payload.logged_in && payload.user) {
                    authState = normalizeAuthState(payload.user);
                    renderAuthUi();
                    applyRoleGates();
                    loadUserPreferences().catch((error) => {
                        console.warn('Preference load failed', error);
                        userPreferencesLoaded = false;
                        renderMyPage();
                    });
                } else {
                    setLoggedOutState();
                }
            })
            .catch(() => {
                authState = { loggedIn: false, user: null, roles: [] };
                userPreferencesLoaded = false;
                window.VOLT_AUTH_UI?.render?.({ status: 'error' });
                applyRoleGates();
                renderMyPage();
            });
    }

    function normalizeAuthState(user) {
        return { loggedIn: true, user, roles: Array.isArray(user.roles) ? user.roles : [] };
    }

    function setLoggedOutState() {
        authState = { loggedIn: false, user: null, roles: [] };
        userPreferencesLoaded = false;
        window.VOLT_AUTH_UI?.render?.({ status: 'loggedOut' });
        applyRoleGates();
        renderMyPage();
    }

    // 현재 authState를 auth-ui 렌더 state로 변환해 헤더/모바일 auth UI를 갱신한다.
    // (문자열 렌더는 js/auth-ui.js 담당, 여기서는 표시값만 계산한다.)
    function renderAuthUi() {
        if (!authState.loggedIn) {
            window.VOLT_AUTH_UI?.render?.({ status: 'loggedOut' });
            return;
        }
        const user = authState.user || {};
        window.VOLT_AUTH_UI?.render?.({
            status: 'loggedIn',
            displayName: getAuthDisplayName(user),
            roleLabel: getAuthRoleLabel(user),
            avatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : ''
        });
    }

    function notifyAuthErrorFromQuery() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') !== 'error') return;
        showToast(i18nT('auth.authError', 'Discord 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
        const url = new URL(window.location.href);
        url.searchParams.delete('auth');
        history.replaceState(history.state, '', url.toString());
    }

    function getAuthDisplayName(user) {
        return user.display_name || user.username || i18nT('auth.defaultName', 'VOLT 사용자');
    }

    function getAuthRoleLabel(user) {
        // VOLT 내부 역할명은 고유명사라 언어와 무관하게 그대로 노출한다.
        const roles = Array.isArray(user.roles) ? user.roles : [];
        if (roles.includes('대표이사')) return '대표이사';
        if (roles.includes('감찰')) return '감찰';
        if (roles.includes('임원진')) return '임원진';
        if (roles.includes('HR전략실')) return 'HR전략실';
        if (roles.includes('홍보부')) return '홍보부';
        if (roles.includes('VOLT 함대원')) return 'VOLT 함대원';
        if (roles.includes('손님')) return '손님';
        // 알 수 없는 역할이 없을 때의 일반 fallback만 언어별로 표시한다.
        return roles[0] || i18nT('auth.member', '인증 사용자');
    }

    function applyRoleGates() {
        document.querySelectorAll('[data-requires-auth]').forEach((element) => {
            const locked = !authState.loggedIn;
            element.classList.toggle('is-auth-locked', locked);
            if ('disabled' in element) element.disabled = locked;
            if (locked && element.tagName === 'A') element.setAttribute('aria-disabled', 'true');
            else element.removeAttribute('aria-disabled');
        });
        document.querySelectorAll('[data-requires-role]').forEach((element) => {
            const roles = String(element.getAttribute('data-requires-role') || '').split(',').map((role) => role.trim()).filter(Boolean);
            element.hidden = roles.length > 0 && !userHasAnyRole(roles);
        });
    }

    function userHasAnyRole(roles) {
        return roles.some((role) => authState.roles.includes(role));
    }

    async function loadUserPreferences() {
        if (!authState.loggedIn) return;
        const response = await fetch('/api/me/preferences', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`PREF ${response.status}`);
        const payload = await response.json();
        mergeUserPreferences(payload.preferences || {});
        userPreferencesLoaded = true;
        await saveUserPreferences();
        renderMyPage();
    }

    function mergeUserPreferences(preferences) {
        const remoteFavorites = Array.isArray(preferences.favorites) ? preferences.favorites.map(String) : [];
        const mergedFavorites = [...new Set([...remoteFavorites, ...getHangar()])];
        setHangar(mergedFavorites, { sync: false });
        const localPlanner = getPlannerStateFromStorage();
        if (!hasPlannerState(localPlanner) && preferences.planner && typeof preferences.planner === 'object') {
            localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(preferences.planner));
            restorePlannerState();
        }
    }

    function getPlannerStateFromStorage() {
        try {
            return JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY) || '{}');
        } catch (error) {
            console.warn('Invalid planner state', error);
            localStorage.removeItem(PLANNER_STORAGE_KEY);
            return {};
        }
    }

    function hasPlannerState(state) {
        return Object.values(state || {}).some((value) => String(value || '').trim());
    }

    function schedulePreferenceSave() {
        if (!authState.loggedIn || !userPreferencesLoaded) return;
        window.clearTimeout(preferencesSaveTimer);
        preferencesSaveTimer = window.setTimeout(() => {
            saveUserPreferences().catch((error) => console.warn('Preference save failed', error));
        }, 800);
    }

    async function saveUserPreferences() {
        if (!authState.loggedIn) return;
        const response = await fetch('/api/me/preferences', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ favorites: getHangar(), planner: getPlannerStateFromStorage() })
        });
        if (!response.ok) throw new Error(`PREF ${response.status}`);
    }

    // 마이페이지 렌더는 js/mypage.js(VOLT_MYPAGE)로 위임한다. main.js는 인증/선호도
    // 상태에서 렌더용 state만 조립해 넘긴다(HTML 문자열 조립은 모듈이 담당).
    function renderMyPage() {
        if (!window.VOLT_MYPAGE) return;
        window.VOLT_MYPAGE?.renderMyPage?.(buildMyPageState());
    }

    function buildMyPageState() {
        if (!authState.loggedIn) return { loggedIn: false };
        const user = authState.user || {};
        const hangarShips = getHangar()
            .map((shipId) => shipById.get(shipId))
            .filter(Boolean)
            .map((ship) => ({ id: ship.id, name: getShipDisplayName(ship), cargo: ship.cargo || '0 SCU' }));
        const planner = getPlannerStateFromStorage();
        const plannerShip = planner.shipId ? shipById.get(planner.shipId) : null;
        return {
            loggedIn: true,
            profile: {
                displayName: getAuthDisplayName(user),
                roleLabel: getAuthRoleLabel(user),
                isMember: isFleetMember(user),
            },
            hangarShips,
            planner: {
                hasValue: hasPlannerState(planner),
                shipName: plannerShip ? getShipDisplayName(plannerShip) : (planner.shipSearch || ''),
                cargo: planner.cargo || '0',
                crew: planner.crew || '1',
            },
        };
    }

    // 손님(guest) 외 역할이 하나라도 있으면 정식 멤버로 본다.
    function isFleetMember(user) {
        const roles = Array.isArray(user.roles) ? user.roles : [];
        return roles.some((role) => role && role !== '손님');
    }
    // 테마 시스템 제거 (F-2): VOLT는 다크 전용 — js/theme-init.js가 data-theme="dark"를 고정한다.

    function injectStructuredData() {
        injectFaqStructuredData();
        injectEventStructuredData();
    }

    function injectFaqStructuredData() {
        if (!Array.isArray(data.faq) || data.faq.length === 0) return;
        appendJsonLd('faq-schema', {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: data.faq.map((item) => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: item.a }
            }))
        });
    }

    function injectEventStructuredData() {
        if (!Array.isArray(data.calendar)) return;
        const events = data.calendar
            .filter((item) => /^\d{4}\.\d{2}\.\d{2}$/.test(item.date))
            .map((item) => ({
                '@type': 'Event',
                name: item.title,
                description: item.description,
                startDate: item.date.replace(/\./g, '-'),
                eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
                eventStatus: 'https://schema.org/EventScheduled',
                organizer: { '@type': 'Organization', name: data.fleet.name, url: 'https://www.volt.ceo/' }
            }));
        if (events.length > 0) appendJsonLd('event-schema', { '@context': 'https://schema.org', '@graph': events });
    }

    function appendJsonLd(id, payload) {
        if (document.getElementById(id)) return;
        const script = document.createElement('script');
        script.id = id;
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(payload);
        document.head.appendChild(script);
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


    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch((error) => {
                console.warn('VOLT service worker registration failed:', error);
            });
        }, { once: true });
    }

    function setupPwaInstallPrompt() {
        if (localStorage.getItem('volt-pwa-install-dismissed') === 'true') return;
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredInstallPrompt = event;
            renderPwaInstallPrompt();
        });
        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            localStorage.setItem('volt-pwa-install-dismissed', 'true');
            document.getElementById('pwa-install-prompt')?.remove();
            showToast(i18nT('pwa.installed', 'VOLT 앱 설치가 완료되었습니다.'));
        });
    }

    function renderPwaInstallPrompt() {
        if (!deferredInstallPrompt || document.getElementById('pwa-install-prompt')) return;
        const prompt = document.createElement('aside');
        prompt.id = 'pwa-install-prompt';
        prompt.className = 'pwa-install-prompt';
        prompt.setAttribute('role', 'status');
        prompt.innerHTML = `
            <div>
                <strong>${escapeHtml(i18nT('pwa.title', 'VOLT 앱 설치'))}</strong>
                <span>${escapeHtml(i18nT('pwa.body', '홈 화면에서 빠르게 함선DB와 무역플래너를 열 수 있습니다.'))}</span>
            </div>
            <button class="btn btn-primary" type="button" data-pwa-install>${escapeHtml(i18nT('pwa.install', '설치'))}</button>
            <button class="btn btn-secondary" type="button" data-pwa-dismiss aria-label="${escapeHtml(i18nT('pwa.dismissAria', '설치 안내 닫기'))}">${escapeHtml(i18nT('pwa.dismiss', '닫기'))}</button>`;
        prompt.addEventListener('click', handlePwaPromptClick);
        document.body.appendChild(prompt);
    }

    async function handlePwaPromptClick(event) {
        if (event.target.closest('[data-pwa-dismiss]')) {
            localStorage.setItem('volt-pwa-install-dismissed', 'true');
            document.getElementById('pwa-install-prompt')?.remove();
            return;
        }
        if (!event.target.closest('[data-pwa-install]') || !deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        document.getElementById('pwa-install-prompt')?.remove();
    }

    function refreshCmsRenderedContent() {
        renderAll();
        // CMS 데이터(함선 오버라이드·갤러리)가 반영되도록 이미 표시된 지연 섹션은 다시 렌더.
        refreshRenderedLazySections();
        setupFaqAccordion();
        applyRoleGates();
        renderMyPage();
    }

    // 동적 색상·그라데이션을 인라인 style 속성 대신 data 속성으로 전달하고,
    // 렌더 후 CSSOM(el.style)으로 적용한다. CSSOM은 CSP style-src 적용 대상이
    // 아니라 style-src 'unsafe-inline' 없이도 동작한다. innerHTML로 삽입되는
    // 모든 재렌더를 MutationObserver로 감지해 적용한다.
    const DYNAMIC_STYLE_SELECTOR = '[data-style-bg],[data-style-color],[data-style-object-position]';

    function applyDynamicStyle(el) {
        if (el.dataset.styleBg) el.style.background = el.dataset.styleBg;
        if (el.dataset.styleColor) el.style.color = el.dataset.styleColor;
        if (el.dataset.styleObjectPosition) el.style.objectPosition = el.dataset.styleObjectPosition;
    }

    function applyDynamicStyles(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.matches?.(DYNAMIC_STYLE_SELECTOR)) applyDynamicStyle(root);
        root.querySelectorAll?.(DYNAMIC_STYLE_SELECTOR).forEach(applyDynamicStyle);
    }

    function setupDynamicStyles() {
        applyDynamicStyles(document.body);
        new MutationObserver((mutations) => {
            for (const mutation of mutations) mutation.addedNodes.forEach(applyDynamicStyles);
        }).observe(document.body, { childList: true, subtree: true });
    }

    function initInner() {
        nav.init({ trackEvent, observeNewReveals, openNoticeFromQuery, trapFocus, getFocusableElements, onSectionShow: renderSectionOnShow });
        uex.init({ getCargoTarget: () => Math.max(0, Number(document.getElementById('logistics-cargo')?.value) || 0), formatCommodityLabel });
        // nav/uex는 위에서 이미 폴백 stub 처리(D-1) — 항상 안전하게 호출 가능.
        // UEX 패널(DOM 렌더) 계층 — 공용 포매터·로컬라이즈·피커·상수 주입.
        window.VOLT_UEX_PANEL?.init?.({
            escapeHtml, i18nT, formatCredits, formatPercent, formatLocalizedName,
            formatCommodityLabel, getCommodityKoreanName,
            handlePickerKeyboard, closePicker, announcePickerSelection, trapFocus,
            UEX_CACHE_TTL_MS, RECOMMENDED_COMMODITY_CANDIDATES,
        });
        // 무역플래너 수익표 — 공용 포매터·토스트·i18n 주입.
        window.VOLT_TRADE_PLANNER?.init?.({ escapeHtml, formatCredits, i18nT, showToast });
        // 공지 UI 계층 — 데이터 접근·공용 유틸 주입(announcements는 CMS 로드로 재할당되므로 getter).
        window.VOLT_NOTICES?.init?.({
            getAnnouncements: () => data.announcements,
            escapeHtml, i18nT, currentLang, formatMultilineText,
            observeNewReveals, openModal, showToast,
        });
        // 일정/RSVP UI 계층 — 데이터·인증 상태·공용 유틸 주입.
        window.VOLT_SCHEDULE?.init?.({
            getCalendar: () => data.calendar,
            escapeHtml, tx, i18nT, formatMultilineText, showToast,
            isLoggedIn: () => authState.loggedIn,
            applyRoleGates, renderMyPage,
        });
        // 랜딩 하이라이트 계층 — 공지 티저·동적 수치·스타필드/리빌 주입.
        // 랜딩(장식 계층)은 로드 실패해도 사이트가 동작해야 한다 — 옵셔널 참조 (라이브 블랭크 사고 예방)
        window.VOLT_LANDING?.init?.({
            getAnnouncements: () => data.announcements,
            getShipsCount: () => (Array.isArray(data.ships) ? data.ships.length : null),
            getMemberLabel,
            currentLang, observeNewReveals,
        });
        // 함선DB UI 계층 — 데이터 접근·공용 유틸 주입(shipById는 재할당되므로 getter).
        window.VOLT_SHIPS?.init?.({
            currentLang, escapeHtml, i18nT, tx, formatShipPrice, getCargoValue,
            parseLargestNumber, parseSmallestNumber, getShipDisplayName, getShipSecondaryName,
            getShipTags, getShipFilterTags, getShipManufacturers, getVisibleShips,
            isPlannerEligibleShip, useShipInPlanner, isInHangar, toggleHangar,
            observeNewReveals, openModal, showToast, trackEvent, shipState,
            getShipById: (id) => shipById.get(id),
            RSI_SHIP_MATRIX_URL,
            ensureShipLiveData,
        });
        // 전역 검색 모달 — 데이터·내비게이션·함선 헬퍼 주입.
        window.VOLT_SEARCH?.init?.({
            data, localization, escapeHtml, i18nT, trackEvent, getShipAliases,
            getShipById: (id) => shipById.get(id),
            resetShipState, openShipModal, showSection, closeMoreMenu, closeTradeMenu, setMobileMenuState,
        });
        // 헤더 인증 UI 렌더 계층 — i18n·escapeHtml 주입(상태 계산은 main.js).
        window.VOLT_AUTH_UI?.init?.({ t: i18nT, escapeHtml });
        // 마이페이지 렌더 계층 — 공용 유틸·격납고 제거/함선 상세 콜백 주입.
        window.VOLT_MYPAGE?.init?.({
            i18nT, escapeHtml, trackEvent,
            openShipById: (id) => { const ship = shipById.get(id); if (ship) openShipModal(ship); },
            removeFromHangar: (id) => { if (isInHangar(id)) toggleHangar(id); },
        });
        // 언어 변경 시 데이터 기반 About 카드(부서·핵심가치)를 다시 렌더한다.
        if (i18n && i18n.onChange) {
            i18n.onChange(() => { renderDepartments(); renderCoreValues(); renderPolicy(); renderFaq(); renderSchedule(); renderTimeline(); renderJoinSteps(); renderTradeGuide(); renderLeaders(); renderStreamers(); renderPartnerFleets(); renderAnnouncements(); refreshRenderedLazySections(); window.VOLT_UEX_PANEL?.onLanguageChange?.(); window.VOLT_TRADE_PLANNER?.onLanguageChange?.(); window.VOLT_MYPAGE?.onLanguageChange?.(); window.VOLT_AUTH_UI?.onLanguageChange?.(); ensureShipEnForEn(); });
        }
        setupDynamicStyles();
        setupSplash();
        setupRevealObserver();
        // 랜딩 리빌은 D-⑧부터 landing.js 전용 관찰자가 담당한다 (뷰포트 하단 20%
        // 진입 시 등장). 전역 revealObserver 의존이 없어져 순서 제약도 사라졌다.
        window.VOLT_LANDING?.setup?.();
        renderAll();
        ensureShipEnForEn();
        setupNavLinks();
        setupMobileMenu();
        setupNoticeControls();
        setupLeadershipControls();
        setupShipControls();
        setupScheduleAccordion();
        setupLogisticsCalculator();
        window.VOLT_TRADE_PLANNER?.setup?.();
        window.VOLT_UEX_PANEL?.setup?.();
        setupGalleryInteractions();
        setupModalControls();
        setupPolicyAnchors();
        setupFaqAccordion();
        setupSearch();
        setupGlobalKeyboardShortcuts();
        setupScrollEffect();
        setupScrollTop();
        setupAuthStatus();
        setupPwaInstallPrompt();
        registerServiceWorker();
        hydrateMemberCount();
        injectStructuredData();
        const applyRouteFromLocation = () => {
            const route = parseRouteFromHash();
            showSection(route.section, false, route.anchorId);
        };
        window.addEventListener('popstate', applyRouteFromLocation);
        window.addEventListener('hashchange', applyRouteFromLocation);
        const initial = getInitialRoute();
        history.replaceState({ section: initial.section }, '', initial.url);
        showSection(initial.section, false, initial.anchorId);
        loadCmsContent()
            .then(refreshCmsRenderedContent)
            .catch((error) => console.warn('CMS content refresh failed', error));
    }

    // D-1 방어 2단계(defense-in-depth): 개별 모듈 호출은 이미 옵셔널 체이닝으로 보호되지만,
    // 예상 밖의 예외(타이핑 실수·데이터 형태 불일치 등)가 나면 initInner()가 중간에 멈출 수 있다.
    // 그 경우에도 로딩 스플래시만은 반드시 걷어 "영구 백지"를 만들지 않는다.
    function forceHideSplash() {
        const splash = document.getElementById('loading-splash');
        if (splash) splash.style.display = 'none';
    }
    function init() {
        try {
            initInner();
        } catch (err) {
            console.error('init() 실패 — 스플래시만 해제하고 계속 진행', err);
            forceHideSplash();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.VOLT_APP = { showSection, renderAll };
})();
