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
    const staticLeadership = Array.isArray(data.leadership) ? data.leadership.slice() : [];

    function renderInlineIcon(name, className = 'inline-svg-icon') {
        const icons = {
            check: '<path d="m5 12 4 4 10-10"></path>',
            moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 7 7 0 1 0 20 15.5Z"></path>',
            sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>'
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

    const PAGE_SIZE = 4;
    // Router/Navigation은 js/navigation.js로 분리됨(window.VOLT_NAV). main.js는
    // 기존 호출처를 그대로 두기 위해 공개 함수를 별칭으로 바인딩한다.
    const nav = window.VOLT_NAV;
    const { showSection, parseRouteFromHash, getInitialRoute, setupNavLinks, setupMobileMenu, setMobileMenuState, closeMoreMenu, closeTradeMenu } = nav;
    // UEX 데이터/계산 계층은 js/uex.js로 분리됨(window.VOLT_UEX).
    const uex = window.VOLT_UEX;
    const PLANNER_STORAGE_KEY = 'volt-planner-state';
    const HANGAR_KEY = 'volt-hangar';
    const RSVP_STATUSES = ['참가', '대기', '불참'];
    const noticeState = { tag: 'all', visibleCount: PAGE_SIZE };
    const shipState = { manufacturer: 'all', hideUnreleased: false, query: '', sort: 'name-asc', purpose: '', cargoMin: 0, hangarOnly: false, selectedTags: [] };
    const SHIP_FILTER_ORDER = ['화물', '전투', '탐사', '인양', '채굴', '정제', '주유', '의료', '연구', '수송', '지원', '방송', '레이싱', '다목적', '입문', '기함', '미구현'];
    const RSI_SHIP_MATRIX_URL = 'https://robertsspaceindustries.com/ship-matrix';
    const UEX_CACHE_TTL_MS = { commodities: 60 * 60 * 1000, prices: 30 * 60 * 1000 };
    let shipById = new Map((data.ships || []).map((ship) => [ship.id, ship]));
    const shipCompareState = new Set();
    let currentUexModel = null;
    let currentUexSelection = { buyKey: '', sellKey: '' };
    let availableUexCommodities = [];
    let searchIndexCache = null;
    let lastSearchTrigger = null;
    let deferredInstallPrompt = null;
    let authState = { loggedIn: false, user: null, roles: [] };
    let userPreferencesLoaded = false;
    let liveMemberCount = null;
    let preferencesSaveTimer = null;
    const NOTICE_TAG_COLORS = { '\uACF5\uC9C0': 'var(--volt-orange)', '\uC911\uC694': '#e53e3e', '\uC5C5\uB370\uC774\uD2B8': '#3182ce', '\uC774\uBCA4\uD2B8': '#805ad5', '\uC791\uC804': '#38a169', '\uC2DC\uC2A4\uD15C': '#319795', '\uBAA8\uC9D1': '#d69e2e', '\uC815\uCC45': '#e53e3e' };
    const FOCUS_COLORS = {
        '\uBB3C\uB958': '#f6ad55',
        '\uC804\uD22C': '#fc8181',
        '\uD0D0\uC0AC': '#68d391',
        '\uCC44\uAD74': '#76e4f7',
        '\uC5F0\uAD6C': '#90cdf4',
        '\uC815\uC81C': '#fbd38d',
        '\uC778\uC591': '#d6bcfa',
        '\uBC29\uC1A1': '#f687b3',
        '\uC8FC\uC720': '#63b3ed',
        '\uC758\uB8CC': '#68d391',
        '\uC785\uBB38': '#a0aec0',
        '\uD654\uBB3C': '#f6ad55',
        '\uBB3C\uB958/\uC804\uD22C': '#f56565',
        '\uBB3C\uB958/\uBAA8\uB4C8': '#ed8936',
        'VIP \uC5EC\uAC1D\uC120': '#f6e05e',
        '\uC9C0\uC6D0 \uCC28\uB7C9': '#a0aec0',
        '\uCC44\uAD74/\uC815\uC81C': '#4fd1c5'
    };

    const SHIP_PURPOSE_COPY = {
        '입문': {
            criterion: '적은 인원으로 운용 가능하고 기본 활동을 익히기 좋은 함선을 우선합니다.',
            useCase: '첫 구매, 복귀 유저, 1~2인 소규모 활동에 적합합니다.'
        },
        '화물': {
            criterion: 'SCU 적재량과 물류 운용성을 기준으로 추천합니다.',
            useCase: '상업 운송, 반복 루트, 함대 보급 임무에 적합합니다.'
        },
        '탐사': {
            criterion: '탐사 또는 장거리 활동 태그를 가진 함선을 중심으로 묶습니다.',
            useCase: '장거리 항해, 정보 수집, 미지 구역 탐색에 적합합니다.'
        },
        '인양': {
            criterion: '인양 역할을 가진 함선을 중심으로 추천합니다.',
            useCase: '난파선 회수, 자원 수거, 산업 플레이에 적합합니다.'
        },
        '채굴': {
            criterion: '채굴 또는 정제 관련 함선을 중심으로 추천합니다.',
            useCase: '광물 채집, 현장 정제, 산업 루프 확장에 적합합니다.'
        },
        '의료': {
            criterion: '의료 지원 역할을 가진 함선을 중심으로 추천합니다.',
            useCase: '구조, 전투 지원, 장거리 원정 보조에 적합합니다.'
        }
    };
    const TRADE_OPERATION_CONFIG = {
        solo: {
            label: '단독 저위험 운송',
            summary: '짧은 루트와 낮은 노출로 손실 가능성을 줄이는 운용입니다.',
            escortBase: 0,
            toolSteps: [
                'UEX Corp에서 매수·매도 위치와 재고 변동 확인',
                'SC Trade Tools에서 짧은 루트와 시간당 수익 비교',
                'VOLT 플래너에서 단독 운용 가능 여부 최종 확인'
            ],
            checklist: ['출발지와 도착지 혼잡도 확인', '단독 운용 시 우회 루트 확보']
        },
        small: {
            label: '소규모 화물 운송',
            summary: '적은 인원으로 반복 운송 효율을 확보하는 기본 편성입니다.',
            escortBase: 0,
            toolSteps: [
                'UEX Corp에서 소량 거래 가능한 상품과 재고 확인',
                'SC Trade Tools에서 회전율이 좋은 루트 비교',
                'VOLT 플래너에서 적재량 대비 출격 횟수 점검'
            ],
            checklist: ['적재·하역 시간을 고려한 회차 계획', '소규모 편성용 집결 채널 확인']
        },
        convoy: {
            label: '호송 운송',
            summary: '운송과 호위를 분리해 생존성과 안정성을 높이는 편성입니다.',
            escortBase: 1,
            toolSteps: [
                'UEX Corp에서 상품 가격과 판매지 위험도 확인',
                'SC Trade Tools에서 수익 루트와 우회 루트 함께 비교',
                'VOLT 플래너에서 호위·지원 인원 배치 확정'
            ],
            checklist: ['호위 집결 시각과 교전 규칙 공유', '우회 루트와 랠리 포인트 확인']
        },
        bulk: {
            label: '대량 수송',
            summary: '적재량과 회전율을 우선해 편대 효율을 극대화하는 운용입니다.',
            escortBase: 1,
            toolSteps: [
                'UEX Corp에서 대량 거래 가능한 재고와 판매처 확인',
                'SC Trade Tools에서 화물량 기준 총수익과 회전율 비교',
                'VOLT 플래너에서 다중 출격 또는 추가 함선 필요 여부 판단'
            ],
            checklist: ['대량 매입 가능 수량 재확인', '하역 대기와 분산 판매 계획 수립']
        },
        highValue: {
            label: '고가 화물 운송',
            summary: '수익보다 손실 방지와 정보 통제가 우선인 고위험 편성입니다.',
            escortBase: 1,
            toolSteps: [
                'UEX Corp에서 고가 상품 가격과 공급량 확인',
                'SC Trade Tools에서 수익 대비 노출 시간이 짧은 루트 비교',
                'VOLT 플래너에서 호위와 정찰 인원 충족 여부 확인'
            ],
            checklist: ['루트 공유 범위 최소화', '정찰 선행과 긴급 이탈 지점 지정']
        },
        mining: {
            label: '채굴/정제 후 운송',
            summary: '생산 루프와 물류 루프를 이어 손실 없는 반출을 목표로 합니다.',
            escortBase: 0,
            toolSteps: [
                'UEX Corp에서 정제 후 판매처와 상품 수요 확인',
                'SC Trade Tools에서 최종 판매 루트 수익 비교',
                'VOLT 플래너에서 운송 함선 적재량과 회차 계획 점검'
            ],
            checklist: ['정제 완료 시각 확인', '채굴팀과 반출 시점 동기화']
        },
        supply: {
            label: '작전 보급 운송',
            summary: '수익보다 정시 도착과 작전 지속성을 우선하는 지원 편성입니다.',
            escortBase: 1,
            toolSteps: [
                'UEX Corp에서 필요한 보급품의 구매 가능 위치 확인',
                'SC Trade Tools에서 가장 빠른 보급 루트 비교',
                'VOLT 플래너에서 도착 시각과 지원 인력 배치 확인'
            ],
            checklist: ['보급 우선순위와 하역 담당 지정', '작전 지휘부와 도착 시간 공유']
        }
    };
    const TRADE_PRESETS = [
        { id: 'starter', label: '입문자 단독 무역', operationType: 'solo', risk: 'low', crew: 1, cargo: 64, shipIds: ['hull-a', 'cutlass-black'] },
        { id: 'small', label: '소규모 화물 운송', operationType: 'small', risk: 'low', crew: 2, cargo: 128, shipIds: ['zeus-mk2-cl', 'freelancer-max'] },
        { id: 'bulk', label: '대형 수송 작전', operationType: 'bulk', risk: 'medium', crew: 4, cargo: 576, shipIds: ['caterpillar', 'hull-c'] },
        { id: 'high-value', label: '고가 화물 호송', operationType: 'highValue', risk: 'high', crew: 4, cargo: 174, shipIds: ['constellation-taurus', 'zeus-mk2-cl'] },
        { id: 'mining', label: '채굴/정제 후 운송', operationType: 'mining', risk: 'low', crew: 2, cargo: 64, shipIds: ['starlancer-max', 'hull-a'] },
        { id: 'supply', label: '작전 보급 운송', operationType: 'supply', risk: 'medium', crew: 3, cargo: 224, shipIds: ['starlancer-max', 'freelancer-max'] }
    ];
    const RECOMMENDED_TRADE_GROUPS = [
        { title: '입문/소규모 운송 추천', shipIds: ['hull-a', 'cutlass-black', 'zeus-mk2-cl'] },
        { title: '대량 수송 추천', shipIds: ['caterpillar', 'hull-c'] },
        { title: '고가 화물/호송 추천', shipIds: ['constellation-taurus', 'zeus-mk2-cl'] },
        { title: '채굴/정제 후 운송 추천', shipIds: ['starlancer-max', 'hull-a'] }
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
        const target = document.querySelector('[data-stat="members"]');
        if (!target) return;

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
            cargo: document.getElementById('logistics-cargo')?.value || '',
            opType: document.getElementById('trade-operation-type')?.value || '',
            crew: document.getElementById('logistics-crew')?.value || '',
            risk: document.getElementById('trade-risk')?.value || '',
            travelTime: document.getElementById('planner-travel-time')?.value || ''
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
            set('trade-operation-type', state.opType);
            set('logistics-crew', state.crew);
            set('trade-risk', state.risk);
            set('planner-travel-time', state.travelTime);
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
                    <span class="leader-role">${escapeHtml(leader.role)}</span>
                    <p class="leader-contact">Discord: ${escapeHtml(leader.discord)}</p>
                    <p class="leader-description leader-summary">${escapeHtml(leader.description)}</p>
                    ${isPrimary ? '' : `${renderLeaderKeyPoints(leader, 2)}<span class="leader-more" aria-hidden="true">자세히 보기 →</span>`}
                </div>`;
        const aside = isPrimary ? `
                <div class="leader-aside">
                    ${renderLeaderKeyPoints(leader, 3)}
                    <span class="leader-more" aria-hidden="true">자세히 보기 →</span>
                </div>` : '';
        return `
            <button class="leader-card${isPrimary ? ' ceo-card is-primary' : ''} reveal" type="button" data-leader-id="${id}" aria-label="${escapeHtml(leader.name)} 상세 보기">
                ${renderLeaderAvatar(leader)}${info}${aside}
            </button>`;
    }

    // 카드에는 핵심 역량 상위 3개만 요약. 철학·기여·전체 역량 등 상세는 모달로 분리.
    function renderLeaderKeyPoints(leader, limit = 3) {
        const items = Array.isArray(leader.competencies) ? leader.competencies.slice(0, limit) : [];
        if (!items.length) return '';
        return `<div class="leader-keypoints"><strong>핵심 역량</strong><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
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
            <div class="leader-details-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.content)}</p></div>`).join('')}</div>` : '';
        const competencies = Array.isArray(leader.competencies) ? `<div class="leader-competencies"><strong>핵심 역량</strong><ul>${leader.competencies.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
        const duties = leader.duties ? `<div class="leader-duties"><strong>주요 업무</strong> · ${escapeHtml(leader.duties)}</div>` : '';
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
                <span class="streamer-platform">${escapeHtml(streamer.platform)}</span>
                <p class="streamer-description">${escapeHtml(streamer.description)}</p>
                <div class="streamer-details">${streamer.sections.map((section) => `<div class="streamer-sub-section"><h4>${escapeHtml(section.title)}</h4><p>${formatMultilineText(section.content)}</p></div>`).join('')}</div>
                ${renderStreamerLink(streamer)}
            </div>`;
        }).join('');
    }

    function renderStreamerLink(streamer) {
        if (!streamer.channelUrl) return '';
        return `<a href="${escapeHtml(streamer.channelUrl)}" target="_blank" rel="noopener noreferrer" class="streamer-link">방송 보기</a>`;
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
                <h3>${escapeHtml(department.name)}</h3>
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
                <h4>${escapeHtml(step.title)}</h4>
                <p>${escapeHtml(step.description)}</p>
            </div>`).join('');
    }

    function renderJoinChecklist() {
        const container = document.getElementById('join-checklist');
        if (!container || !Array.isArray(data.joinChecklist)) return;
        container.innerHTML = `
            <div class="join-checklist-heading">
                <h3>가입 전 확인</h3>
                <p>지원 전에 가장 많이 궁금해하는 내용을 먼저 정리했습니다.</p>
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
            .sort(compareAnnouncements);
    }

    function compareAnnouncements(left, right) {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
        const leftTime = getDateSortTime(left.date);
        const rightTime = getDateSortTime(right.date);
        if (leftTime !== rightTime) return rightTime - leftTime;
        return String(right.date || '').localeCompare(String(left.date || ''));
    }

    function getDateSortTime(value) {
        const raw = String(value || '').trim().replace(/\./g, '-');
        const time = Date.parse(raw);
        return Number.isNaN(time) ? 0 : time;
    }

    function formatDisplayDate(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, '.');
        const time = Date.parse(raw);
        if (!Number.isNaN(time) && raw.includes('T')) {
            return new Date(time).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).replace(/\.\s/g, '.').replace(/\.$/, '');
        }
        return raw;
    }

    function renderAnnouncements() {
        const container = document.getElementById('notices-list');
        const loadMore = document.getElementById('notice-load-more');
        if (!container || !loadMore) return;
        const colors = { '공지': 'var(--volt-orange)', '중요': '#e53e3e', '업데이트': '#3182ce', '이벤트': '#805ad5', '작전': '#38a169', '시스템': '#319795', '모집': '#d69e2e', '정책': '#e53e3e' };
        const items = getFilteredAnnouncements();
        const visibleItems = items.slice(0, noticeState.visibleCount);
        // 강조(featured)는 최신 고정 공지 1개만. 나머지 고정은 배지만 유지.
        const featuredId = (visibleItems.find((item) => item.pinned) || {}).id || null;
        container.innerHTML = visibleItems.map((announcement) => `
            <button class="notice-card${announcement.id === featuredId ? ' is-featured' : ''} reveal" type="button" data-notice-id="${escapeHtml(announcement.id)}" aria-label="${escapeHtml(announcement.title)} 상세 보기">
                <div class="notice-meta">
                    ${announcement.pinned ? '<span class="notice-pin">고정</span>' : ''}
                    <span class="notice-tag" data-style-bg="${NOTICE_TAG_COLORS[announcement.tag] || 'var(--volt-orange)'}20" data-style-color="${NOTICE_TAG_COLORS[announcement.tag] || 'var(--volt-orange)'}">${escapeHtml(announcement.tag)}</span>
                    <span class="notice-date">${escapeHtml(formatDisplayDate(announcement.date))}</span>
                </div>
                <h3 class="notice-title">${escapeHtml(announcement.title)}</h3>
                <p class="notice-content notice-excerpt">${formatMultilineText(announcement.content)}</p>
                <span class="notice-more" aria-hidden="true">자세히 보기 →</span>
            </button>`).join('');
        loadMore.hidden = visibleItems.length >= items.length;
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

    function renderShipManufacturers() {
        const select = document.getElementById('ship-manufacturer');
        if (!select) return;
        select.innerHTML = [
            '<option value="all">제조사 전체</option>',
            ...getShipManufacturers().map((manufacturer) => `<option value="${escapeHtml(manufacturer)}">${escapeHtml(manufacturer)}</option>`)
        ].join('');
        select.value = shipState.manufacturer;
    }

    // 통합 태그 칩: '전체' + 역할 태그(복수 선택). 선택한 태그 중 하나라도 포함되면 표시한다.
    function renderShipTagFilters() {
        const container = document.getElementById('ship-tag-filters');
        if (!container) return;
        const selectedTags = new Set(shipState.selectedTags);
        const allActive = selectedTags.size === 0 ? ' active' : '';
        const buttons = getShipFilterTags().map((tag) => {
            const active = selectedTags.has(tag) ? ' active' : '';
            return `<button class="ship-filter-btn${active}" type="button" data-ship-tag-filter="${escapeHtml(tag)}" aria-pressed="${selectedTags.has(tag)}">${escapeHtml(tag)}</button>`;
        });
        container.innerHTML = [
            `<button class="ship-filter-btn${allActive}" type="button" data-ship-tag-clear aria-pressed="${selectedTags.size === 0}">전체</button>`,
            ...buttons
        ].join('');
    }

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
        return ships;
    }

    function getShipTags(ship) {
        return Array.isArray(ship.tags) ? ship.tags : [];
    }

    function buildShipSearchText(ship, tags = getShipTags(ship)) {
        return [ship.name, ship.manufacturer, ship.role, ship.focus, ship.description, ship.cargo, formatShipPrice(ship.priceUsd), ...tags, ...getShipAliases(ship)].join(' ').toLowerCase();
    }

    function getShipAliases(ship) {
        const aliases = getLocalizationValue(ship.name, 'ships');
        return Array.isArray(aliases) ? aliases : [];
    }

    // Phase 2 표시명 정책: 한글명 우선, 영문명(ship.name) 보조. 한 곳에 모은다.
    function getShipKoreanName(ship) {
        return getShipAliases(ship).find((alias) => /[가-힣]/.test(alias)) || '';
    }

    function getShipDisplayName(ship) {
        return getShipKoreanName(ship) || ship.name;
    }

    function getShipSecondaryName(ship) {
        return getShipKoreanName(ship) ? ship.name : '';
    }

    function formatShipPrice(priceUsd) {
        return Number.isFinite(priceUsd) ? `$${priceUsd.toLocaleString('en-US')}` : '미공개';
    }

    function getPriceValue(priceUsd) {
        return Number.isFinite(priceUsd) ? priceUsd : Number.MAX_SAFE_INTEGER;
    }


    function renderShips() {
        const container = document.getElementById('ships-grid');
        if (!container) return;
        const ships = getVisibleShips();
        renderShipTagFilters();
        renderShipPurposeSummary(ships.length);
        if (ships.length === 0) {
            container.innerHTML = '<div class="ships-empty">검색 결과가 없습니다.</div>';
            return;
        }
        container.innerHTML = ships.map((ship) => `
            <article class="ship-card reveal" tabindex="0" role="button" data-ship-id="${escapeHtml(ship.id)}" aria-label="${escapeHtml(getShipDisplayName(ship))} 상세 보기">
                <div class="ship-card-header">
                    <div>
                        <h3 class="ship-name">${escapeHtml(getShipDisplayName(ship))}</h3>
                        ${getShipSecondaryName(ship) ? `<span class="ship-name-en">${escapeHtml(getShipSecondaryName(ship))}</span>` : ''}
                        <span class="ship-mfr">${escapeHtml(ship.manufacturer)}</span>
                    </div>
                    <div class="ship-card-actions"><span class="ship-focus-badge" data-style-bg="${FOCUS_COLORS[ship.focus] || '#a0aec0'}22" data-style-color="${FOCUS_COLORS[ship.focus] || '#a0aec0'}">${escapeHtml(ship.focus)}</span>${renderHangarToggleButton(ship)}</div>
                </div>
                <p class="ship-desc">${escapeHtml(ship.description)}</p>
                <div class="ship-stats">
                    <div class="ship-stat"><span class="ship-stat-label">\ud654\ubb3c</span><span class="ship-stat-value">${escapeHtml(ship.cargo)}</span></div>
                    <div class="ship-stat"><span class="ship-stat-label">USD 가격</span><span class="ship-stat-value">${escapeHtml(formatShipPrice(ship.priceUsd))}</span></div>
                </div>
                <div class="ship-tags">${getShipTags(ship).map((tag) => `<span class="ship-tag">${escapeHtml(tag)}</span>`).join('')}</div>
                ${renderShipPlannerButton(ship)}
                <button class="ship-compare-toggle${shipCompareState.has(ship.id) ? ' active' : ''}" type="button" data-compare-ship-id="${escapeHtml(ship.id)}" aria-pressed="${shipCompareState.has(ship.id)}">
                    ${shipCompareState.has(ship.id) ? '비교 제거' : '비교 추가'}
                </button>
            </article>`).join('');
        renderShipCompareBar();
        observeNewReveals(container);
    }

    function renderShipCompareBar() {
        const bar = document.getElementById('ship-compare-bar');
        const summary = document.getElementById('ship-compare-summary');
        const openButton = document.getElementById('ship-compare-open');
        if (!bar || !summary || !openButton) return;
        summary.textContent = `${shipCompareState.size} / 3척 선택`;
        bar.hidden = shipCompareState.size === 0;
        openButton.disabled = shipCompareState.size < 2;
    }

    function renderShipPlannerButton(ship) {
        if (!isPlannerEligibleShip(ship)) return '';
        return `<button class="ship-planner-toggle" type="button" data-use-planner-ship-id="${escapeHtml(ship.id)}">\ubb34\uc5ed \ud50c\ub798\ub108\uc5d0\uc11c \uc0ac\uc6a9</button>`;
    }


    function renderHangarToggleButton(ship, label = false) {
        const owned = isInHangar(ship.id);
        const title = owned ? '\uaca9\ub0a9\uace0\uc5d0\uc11c \uc81c\uac70' : '\uaca9\ub0a9\uace0\uc5d0 \ucd94\uac00';
        const text = label ? (owned ? '\uaca9\ub0a9\uace0\uc5d0 \uc788\uc74c' : '\uaca9\ub0a9\uace0\uc5d0 \ucd94\uac00') : (owned ? '\u2605' : '\u2606');
        return `<button class="hangar-toggle-btn${owned ? ' owned' : ''}${label ? ' modal-hangar-btn' : ''}" type="button" data-hangar-ship-id="${escapeHtml(ship.id)}" aria-label="${title}" title="${title}">${text}</button>`;
    }

    function renderSchedule() {
        const container = document.getElementById('schedule-list');
        if (!container || !Array.isArray(data.calendar)) return;
        const colors = { '\uC608\uC815': 'var(--volt-orange)', '\uC9C4\uD589\uC911': '#38a169', '\uC644\uB8CC': '#718096', '\uCDE8\uC18C': '#e53e3e', '\uC5F0\uAE30': '#d69e2e', '\uB300\uAE30': '#a0aec0', '\uACC4\uD68D': '#63b3ed' };
        container.innerHTML = data.calendar.map((event) => {
            const eventId = getEventId(event);
            const detailId = `schedule-detail-${escapeHtml(eventId)}`;
            return `<div class="schedule-item reveal" data-schedule-event-id="${escapeHtml(eventId)}">
                <div class="schedule-date-col">
                    <span class="schedule-date">${escapeHtml(event.dateLabel)}</span>
                    <span class="schedule-status" data-style-color="${colors[event.status] || '#a0aec0'}">${escapeHtml(event.status)}</span>
                </div>
                <div class="schedule-body">
                    <div class="schedule-type-badge">${escapeHtml(event.type)}</div>
                    <button class="schedule-item-toggle" type="button" aria-expanded="false" aria-controls="${detailId}">
                        ${escapeHtml(event.title)}
                    </button>
                    <div class="schedule-item-detail" id="${detailId}" hidden>
                        <p>${formatMultilineText(event.description)}</p>
                    </div>
                    ${renderRsvpControls(eventId)}
                </div>
            </div>`;
        }).join('');
        window.requestAnimationFrame(loadScheduleRsvps);
    }

    function getEventId(event) {
        return String(event.id || event.title || '').trim().replace(/\s+/g, '-');
    }

    function renderRsvpControls(eventId) {
        return `<div class="schedule-rsvp" data-rsvp-event-id="${escapeHtml(eventId)}">
            <div class="schedule-rsvp-actions" aria-label="일정 참가 상태 선택">
                ${RSVP_STATUSES.map((status) => `<button class="schedule-rsvp-btn" type="button" data-requires-auth data-rsvp-status="${escapeHtml(status)}">${escapeHtml(status)}</button>`).join('')}
            </div>
            <div class="schedule-rsvp-summary" data-rsvp-summary>로그인하면 참가 상태를 남길 수 있습니다.</div>
        </div>`;
    }

    async function loadScheduleRsvps() {
        const controls = Array.from(document.querySelectorAll('[data-rsvp-event-id]'));
        await Promise.all(controls.map(async (control) => {
            const eventId = control.getAttribute('data-rsvp-event-id');
            if (!eventId) return;
            try {
                const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/rsvp`, { headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error(`RSVP ${response.status}`);
                renderRsvpSummary(control, await response.json());
            } catch (error) {
                console.warn('RSVP load failed', error);
            }
        }));
        applyRoleGates();
    }

    function renderRsvpSummary(control, payload) {
        const summary = control.querySelector('[data-rsvp-summary]');
        const counts = payload?.counts || {};
        const parts = RSVP_STATUSES.map((status) => `${status} ${Number(counts[status] || 0)}명`);
        if (summary) summary.textContent = parts.join(' · ');
    }

    async function saveEventRsvp(eventId, status) {
        if (!authState.loggedIn) {
            showToast('Discord 로그인 후 참가 상태를 남길 수 있습니다.');
            return;
        }
        const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/rsvp`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!response.ok) throw new Error(`RSVP ${response.status}`);
        const control = document.querySelector(`[data-rsvp-event-id="${CSS.escape(eventId)}"]`);
        if (control) {
            renderRsvpSummary(control, await response.json());
            control.querySelectorAll('[data-rsvp-status]').forEach((button) => {
                button.classList.toggle('is-selected', button.getAttribute('data-rsvp-status') === status);
            });
        }
        renderMyPage();
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
                <button class="policy-anchor-copy" type="button" data-policy-index="${index + 1}" aria-label="${escapeHtml(section.title)} \ub9c1\ud06c \ubcf5\uc0ac"><span class="icon-link" aria-hidden="true"></span></button>
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
                <button class="faq-question" id="faq-q-${index}" aria-expanded="false" aria-controls="faq-ans-${index}">
                    <span>${escapeHtml(item.q)}</span>
                    <span class="faq-icon">+</span>
                </button>
                <div class="faq-answer" id="faq-ans-${index}" role="region" aria-labelledby="faq-q-${index}" hidden>
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
                <h3>${escapeHtml(guide.title)}</h3>
                <p>${escapeHtml(guide.content)}</p>
            </div>`).join('');
        renderLogisticsShipOptions();
        renderTradePresets();
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
            : '<div class="guide-glossary-empty">등록된 용어가 없습니다.</div>';
    }

    function renderTradePresets() {
        const container = document.getElementById('trade-preset-grid');
        if (!container) return;
        container.innerHTML = TRADE_PRESETS.map((preset) => `
            <button class="trade-preset-card" type="button" data-trade-preset-id="${escapeHtml(preset.id)}">
                <strong>${escapeHtml(preset.label)}</strong>
                <span>${escapeHtml(getOperationSummary(preset.operationType))}</span>
            </button>`).join('');
    }

    function renderRecommendedTradeShips() {
        const container = document.getElementById('recommended-trade-grid');
        if (!container) return;
        container.innerHTML = RECOMMENDED_TRADE_GROUPS.map((group) => {
            const ships = group.shipIds.map((id) => shipById.get(id)).filter((ship) => ship && isPlannerEligibleShip(ship));
            return `<section class="recommended-trade-group">
                <h4>${escapeHtml(group.title)}</h4>
                <div>${ships.map(renderRecommendedTradeShipCard).join('')}</div>
            </section>`;
        }).join('');
    }

    function renderRecommendedTradeShipCard(ship) {
        return `<article class="recommended-trade-card">
            <strong>${escapeHtml(ship.name)}</strong>
            <span>${escapeHtml(ship.cargo)} · ${escapeHtml(ship.role)}</span>
            <div>
                <button class="btn btn-secondary" type="button" data-open-ship-id="${escapeHtml(ship.id)}">함선 상세</button>
                <button class="btn btn-primary" type="button" data-use-planner-ship-id="${escapeHtml(ship.id)}">무역 플래너에서 사용</button>
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
        select.innerHTML = `<option value="">보유 함선 선택</option>${getLogisticsShips().map((ship) => (
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
        results.innerHTML = ships.length ? ships.map(renderPlannerShipOption).join('') : '<div class="planner-picker-empty">검색 결과가 없습니다. 함선명, 제조사, 역할 또는 화물량으로 다시 검색해 보세요.</div>';
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
        announcePickerSelection(`${getShipDisplayName(ship)} 함선을 선택했습니다.`);
        closePicker(input, document.getElementById('logistics-ship-results'));
        savePlannerState();
        renderLogisticsRecommendation();
    }

    function renderPlannerShipSummary(ship) {
        const summary = document.getElementById('logistics-ship-summary');
        if (!summary) return;
        summary.hidden = false;
        const secondary = getShipSecondaryName(ship);
        summary.innerHTML = `<strong>${escapeHtml(getShipDisplayName(ship))}</strong>${secondary ? `<span class="planner-summary-en">${escapeHtml(secondary)}</span>` : ''}<span>${escapeHtml(ship.manufacturer)} · ${escapeHtml(ship.cargo)} · ${escapeHtml(ship.size)}</span><small>${escapeHtml(getPlannerShipRecommendation(ship))}</small>`;
    }

    function getPlannerShipRecommendation(ship) {
        if (getCargoValue(ship.cargo) >= 500) return '대량 수송 / 호송 운송 추천';
        if (parseLargestNumber(ship.crew) <= 1) return '단독 운송 / 소규모 화물 추천';
        return '소규모 화물 / 호송 운송 추천';
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


    function invalidateSearchCache() {
        searchIndexCache = null;
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
        data.ships = data.ships.map((ship) => mergeShipOverride(ship, overrideById.get(ship.id)));
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

    function renderMemberCount() {
        const element = document.querySelector('.hero-stat[data-type="members"] .hero-stat-value');
        if (!element) return;
        // 라이브 디스코드 멤버수가 있으면 항상 우선(정적값으로 덮어쓰지 않는다).
        const liveLabel = formatApproximateMemberCount(liveMemberCount);
        if (liveLabel) {
            element.textContent = liveLabel;
            return;
        }
        const memberCount = getMemberCount();
        element.textContent = `${memberCount ?? '?'}+`;
    }

    function renderPartnerFleets() {
        const container = document.getElementById('partner-fleets-grid');
        if (!container) return;
        const fleets = Array.isArray(data.partnerFleets)
            ? data.partnerFleets.filter((fleet) => fleet.published !== false)
            : [];
        if (!fleets.length) {
            container.innerHTML = '<div class="partner-fleets-empty">등록된 협력함대가 없습니다.</div>';
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
        const name = fleet.name || '협력함대';
        const logo = renderPartnerFleetImage(fleet, name);
        const meta = [fleet.region, fleet.game, fleet.focus].filter(Boolean)
            .map((item) => `<span class="partner-fleet-badge">${escapeHtml(item)}</span>`)
            .join('');
        const stats = [
            fleet.memberCount ? `멤버 ${Number(fleet.memberCount).toLocaleString('ko-KR')}명` : '',
            fleet.established ? `창설 ${fleet.established}` : ''
        ].filter(Boolean).map((item) => `<span class="partner-fleet-stat">${escapeHtml(item)}</span>`).join('');
        const links = [
            fleet.discordUrl ? `<a class="partner-fleet-link" href="${escapeHtml(fleet.discordUrl)}" target="_blank" rel="noopener noreferrer">Discord</a>` : '',
            fleet.websiteUrl ? `<a class="partner-fleet-link" href="${escapeHtml(fleet.websiteUrl)}" target="_blank" rel="noopener noreferrer">웹사이트</a>` : ''
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
                <p class="partner-fleet-description">${escapeHtml(fleet.description || '협력 관계 정보를 준비 중입니다.')}</p>
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
        renderGallery();
        renderJoinSteps();
        renderJoinChecklist();
        renderFooterStreamers();
        renderNoticeFilters();
        renderAnnouncements();
        renderShipManufacturers();
        renderShips();
        renderSchedule();
        renderPolicy();
        renderFaq();
        renderTradeGuide();
    }

    function openNoticeFromQuery() {
        const noticeId = new URLSearchParams(window.location.search).get('notice');
        const notice = noticeId ? findAnnouncement(noticeId) : null;
        if (notice) openNoticeModal(notice);
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

    function setupNoticeControls() {
        const filters = document.getElementById('notice-filters');
        const loadMore = document.getElementById('notice-load-more');
        const list = document.getElementById('notices-list');
        if (!filters || !loadMore || !list) return;
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
        list.addEventListener('click', (event) => {
            const card = event.target.closest('[data-notice-id]');
            if (!card) return;
            const notice = findAnnouncement(card.getAttribute('data-notice-id'));
            if (notice) openNoticeModal(notice);
        });
    }

    function findAnnouncement(id) {
        return (data.announcements || []).find((announcement) => announcement.id === id);
    }

    function openNoticeModal(announcement) {
        openModal(`<div class="modal-header">
                <div>
                    ${announcement.pinned ? '<span class="notice-pin">고정</span>' : ''}
                    <h2 class="modal-title">${escapeHtml(announcement.title)}</h2>
                </div>
                <button class="modal-close" type="button" aria-label="모달 닫기">×</button>
            </div>
            <div class="modal-body notice-modal-body">
                <div class="notice-meta">
                    <span class="notice-tag">${escapeHtml(announcement.tag)}</span>
                    <span class="notice-date">${escapeHtml(formatDisplayDate(announcement.date))}</span>
                </div>
                <p>${formatMultilineText(announcement.content)}</p>
                <button class="btn btn-secondary notice-copy-link" type="button" data-copy-notice-id="${escapeHtml(announcement.id)}">공지 링크 복사</button>
            </div>`);
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
                    <p class="leader-role">${escapeHtml(leader.role)}</p>
                </div>
                <button class="modal-close" type="button" aria-label="모달 닫기">×</button>
            </div>
            <div class="modal-body leader-modal-body">
                <div class="leader-modal-top">
                    ${renderLeaderAvatar(leader)}
                    <div>
                        <p class="leader-contact">Discord: ${escapeHtml(leader.discord)}</p>
                        <p class="leader-modal-desc">${escapeHtml(leader.description)}</p>
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

    function setupShipControls() {
        const search = document.getElementById('ship-search');
        const manufacturer = document.getElementById('ship-manufacturer');
        const hideUnreleased = document.getElementById('ship-hide-unreleased');
        const sort = document.getElementById('ship-sort');
        const grid = document.getElementById('ships-grid');
        const purpose = document.getElementById('ship-purpose');
        const hangarOnly = document.getElementById('ship-hangar-only');
        const tagFilters = document.getElementById('ship-tag-filters');
        const advancedToggle = document.getElementById('ship-advanced-toggle');
        const advancedPanel = document.getElementById('ship-advanced-panel');
        const filterReset = document.getElementById('ship-filter-reset');
        const cargoButtons = [...document.querySelectorAll('.cargo-filter-btn')];
        if (!search || !manufacturer || !hideUnreleased || !sort || !grid || !purpose) return;
        tagFilters?.addEventListener('click', handleShipTagFilterClick);
        search.addEventListener('input', () => { shipState.query = search.value; renderShips(); });
        manufacturer.addEventListener('change', () => { shipState.manufacturer = manufacturer.value; renderShips(); });
        hideUnreleased.addEventListener('change', () => { shipState.hideUnreleased = hideUnreleased.checked; syncShipControls(); renderShips(); });
        sort.addEventListener('change', () => { shipState.sort = sort.value; renderShips(); });
        grid.addEventListener('click', openShipFromEvent);
        grid.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') openShipFromEvent(event);
        });
        purpose.addEventListener('change', () => applyShipPurpose(purpose.value));
        cargoButtons.forEach((button) => {
            button.addEventListener('click', () => {
                shipState.cargoMin = Number(button.dataset.cargoMin) || 0;
                syncShipControls();
                renderShips();
            });
        });
        hangarOnly?.addEventListener('change', () => {
            shipState.hangarOnly = hangarOnly.checked;
            syncShipControls();
            renderShips();
        });
        advancedToggle?.addEventListener('click', () => {
            const expanded = advancedToggle.getAttribute('aria-expanded') === 'true';
            advancedToggle.setAttribute('aria-expanded', String(!expanded));
            if (advancedPanel) advancedPanel.hidden = expanded;
        });
        filterReset?.addEventListener('click', () => resetShipState());
        document.addEventListener('click', handleShipPlannerActions);
        setupShipCompareControls();
    }

    function handleShipTagFilterClick(event) {
        const clearButton = event.target.closest('[data-ship-tag-clear]');
        if (clearButton) {
            shipState.selectedTags = [];
            shipState.purpose = '';
            syncShipControls();
            renderShips();
            return;
        }
        const button = event.target.closest('[data-ship-tag-filter]');
        if (!button) return;
        const tag = button.getAttribute('data-ship-tag-filter');
        shipState.selectedTags = shipState.selectedTags.includes(tag)
            ? shipState.selectedTags.filter((value) => value !== tag)
            : [...shipState.selectedTags, tag];
        // 목적별 추천으로 선택된 태그를 직접 해제하면 추천 모드도 함께 종료한다.
        if (shipState.purpose && !shipState.selectedTags.includes(shipState.purpose)) shipState.purpose = '';
        syncShipControls();
        renderShips();
    }

    function handleShipPlannerActions(event) {
        const hangarButton = event.target.closest('[data-hangar-ship-id]');
        if (hangarButton) {
            event.preventDefault();
            event.stopPropagation();
            handleHangarToggle(hangarButton);
            return;
        }
        const plannerButton = event.target.closest('[data-use-planner-ship-id]');
        if (plannerButton) {
            event.preventDefault();
            useShipInPlanner(plannerButton.getAttribute('data-use-planner-ship-id'));
            return;
        }
        const openButton = event.target.closest('[data-open-ship-id]');
        if (!openButton) return;
        event.preventDefault();
        const ship = shipById.get(openButton.getAttribute('data-open-ship-id'));
        if (ship) openShipModal(ship);
    }

    function useShipInPlanner(shipId) {
        const ship = shipById.get(shipId);
        closeModal();
        showSection('trade-planner');
        window.requestAnimationFrame(() => {
            if (ship && isPlannerEligibleShip(ship)) {
                selectPlannerShip(ship.id, true);
                renderLogisticsRecommendation();
                savePlannerState();
                showToast(`${ship.name}\uc744 \ubb34\uc5ed \ud50c\ub798\ub108\uc5d0 \uc801\uc6a9\ud588\uc2b5\ub2c8\ub2e4.`);
            } else {
                showToast('\uc774 \ud568\uc120\uc740 \ubb34\uc5ed \ud50c\ub798\ub108 \uc120\ud0dd \ub300\uc0c1\uc774 \uc544\ub2d9\ub2c8\ub2e4.');
            }
        });
    }

    function handleHangarToggle(button) {
        const shipId = button.getAttribute('data-hangar-ship-id');
        const ship = shipById.get(shipId);
        if (!ship) return;
        const owned = toggleHangar(shipId);
        document.querySelectorAll(`[data-hangar-ship-id="${CSS.escape(shipId)}"]`).forEach((item) => {
            item.classList.toggle('owned', owned);
            const label = item.classList.contains('modal-hangar-btn');
            item.textContent = label ? (owned ? '\uaca9\ub0a9\uace0\uc5d0 \uc788\uc74c' : '\uaca9\ub0a9\uace0\uc5d0 \ucd94\uac00') : (owned ? '\u2605' : '\u2606');
            const title = owned ? '\uaca9\ub0a9\uace0\uc5d0\uc11c \uc81c\uac70' : '\uaca9\ub0a9\uace0\uc5d0 \ucd94\uac00';
            item.setAttribute('aria-label', title);
            item.setAttribute('title', title);
        });
        if (shipState.hangarOnly) renderShips();
    }

    function applyShipPurpose(purpose) {
        shipState.purpose = purpose;
        shipState.selectedTags = purpose ? [purpose] : [];
        syncShipControls();
        renderShips();
    }

    function renderShipPurposeSummary(visibleCount = getVisibleShips().length) {
        const container = document.getElementById('ship-recommendation-summary');
        if (!container) return;
        const copy = SHIP_PURPOSE_COPY[shipState.purpose];
        if (!copy) {
            container.hidden = true;
            container.innerHTML = '';
            return;
        }
        container.hidden = false;
        container.innerHTML = `
            <strong>${escapeHtml(shipState.purpose)} 추천</strong>
            <p>${escapeHtml(copy.criterion)}</p>
            <div>
                <span>현재 추천 함선</span>
                <b>${escapeHtml(String(visibleCount))}척</b>
            </div>
            <small>${escapeHtml(copy.useCase)}</small>`;
    }

    function setupShipCompareControls() {
        const grid = document.getElementById('ships-grid');
        const clearButton = document.getElementById('ship-compare-clear');
        const openButton = document.getElementById('ship-compare-open');
        if (!grid || !clearButton || !openButton) return;
        grid.addEventListener('click', handleShipCompareToggle);
        clearButton.addEventListener('click', clearShipComparison);
        openButton.addEventListener('click', openShipComparison);
    }

    function setupLogisticsCalculator() {
        const button = document.getElementById('logistics-calculate');
        const copyButton = document.getElementById('trade-briefing-copy');
        const shareButton = document.getElementById('trade-briefing-share');
        const presets = document.getElementById('trade-preset-grid');
        const controls = [
            document.getElementById('trade-operation-type'),
            document.getElementById('logistics-cargo'),
            document.getElementById('logistics-ship'),
            document.getElementById('logistics-crew'),
            document.getElementById('trade-risk'),
            document.getElementById('planner-travel-time')
        ].filter(Boolean);
        if (!copyButton) return;
        button?.addEventListener('click', renderLogisticsRecommendation);
        copyButton.addEventListener('click', copyTradeBriefing);
        shareButton?.addEventListener('click', shareTradeBriefing);
        document.getElementById('planner-reset')?.addEventListener('click', resetPlannerInputs);
        presets?.addEventListener('click', (event) => {
            const presetButton = event.target.closest('[data-trade-preset-id]');
            if (!presetButton) return;
            applyTradePreset(presetButton.getAttribute('data-trade-preset-id'));
        });
        controls.forEach((control) => {
            control.addEventListener('change', () => {
                savePlannerState();
                renderLogisticsRecommendation();
            });
            if (control.tagName === 'INPUT') {
                control.addEventListener('input', () => {
                    savePlannerState();
                    renderLogisticsRecommendation();
                });
            }
        });
        setupPlannerShipPicker();
        restorePlannerState();
        renderLogisticsRecommendation();
    }

    function applyTradePreset(presetId) {
        const preset = TRADE_PRESETS.find((item) => item.id === presetId);
        if (!preset) return;
        setPlannerControlValue('trade-operation-type', preset.operationType);
        setPlannerControlValue('trade-risk', preset.risk);
        setPlannerControlValue('logistics-crew', String(preset.crew));
        setPlannerControlValue('logistics-cargo', String(preset.cargo));
        const ship = preset.shipIds.map((id) => shipById.get(id)).find((item) => item && isPlannerEligibleShip(item));
        if (ship) selectPlannerShip(ship.id);
        savePlannerState();
        renderLogisticsRecommendation();
        showToast(`${preset.label} 프리셋을 적용했습니다.`);
    }

    function setPlannerControlValue(id, value) {
        const control = document.getElementById(id);
        if (control) control.value = value;
    }

    function resetPlannerInputs() {
        setPlannerControlValue('logistics-ship', '');
        setPlannerControlValue('logistics-ship-search', '');
        setPlannerControlValue('logistics-cargo', '0');
        setPlannerControlValue('logistics-crew', '1');
        setPlannerControlValue('trade-operation-type', 'convoy');
        setPlannerControlValue('trade-risk', 'low');
        setPlannerControlValue('planner-travel-time', '');
        const summary = document.getElementById('logistics-ship-summary');
        if (summary) {
            summary.hidden = true;
            summary.innerHTML = '';
        }
        localStorage.removeItem(PLANNER_STORAGE_KEY);
        renderLogisticsRecommendation();
        showToast('무역플래너 입력을 초기화했습니다.');
    }

    function syncPlannerSelectedShip(shipId) {
        const ship = shipById.get(shipId);
        if (!ship || !isPlannerEligibleShip(ship)) return;
        const input = document.getElementById('logistics-ship-search');
        if (input) input.value = ship.name;
        renderPlannerShipSummary(ship);
    }

    function setupUexLivePanel() {
        const select = document.getElementById('uex-commodity-select');
        const search = document.getElementById('uex-commodity-search');
        const results = document.getElementById('uex-commodity-results');
        const uexResults = document.getElementById('uex-results');
        const button = document.getElementById('uex-refresh');
        const recommendButton = document.getElementById('uex-recommend-refresh');
        const recommendResults = document.getElementById('uex-recommend-results');
        if (!select || !search || !results || !button) return;
        search.addEventListener('focus', () => renderCommodityResults(search.value));
        search.addEventListener('input', () => renderCommodityResults(search.value));
        search.addEventListener('keydown', (event) => handlePickerKeyboard(event, results, selectCommodity));
        results.addEventListener('keydown', (event) => handlePickerKeyboard(event, results, selectCommodity));
        results.addEventListener('click', (event) => {
            const option = event.target.closest('[data-commodity-id]');
            if (option) selectCommodity(option.getAttribute('data-commodity-id'));
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.uex-live-controls')) closePicker(search, results);
        });
        button.addEventListener('click', () => renderUexCommodityCandidates(select.value));
        uexResults?.addEventListener('click', handleUexCandidateClick);
        if (recommendButton) recommendButton.addEventListener('click', renderRecommendedCommodities);
        if (recommendResults) {
            recommendResults.addEventListener('click', (event) => {
                const option = event.target.closest('[data-recommended-commodity-id]');
                if (!option) return;
                const commodityId = option.getAttribute('data-recommended-commodity-id');
                selectCommodity(commodityId);
                renderUexCommodityCandidates(commodityId);
            });
        }
        loadUexCommodities();
    }

    async function loadUexCommodities() {
        const select = document.getElementById('uex-commodity-select');
        const status = document.getElementById('uex-status');
        if (!select || !status) return;
        status.textContent = 'UEX 상품 목록을 불러오는 중입니다.';
        try {
            const commodities = await uex.fetchUexData('commodities', UEX_CACHE_TTL_MS.commodities);
            const visible = commodities.filter((item) => item.is_visible && item.is_available_live);
            availableUexCommodities = visible;
            select.innerHTML = `<option value="">상품 선택</option>${visible.map((item) => (
                `<option value="${escapeHtml(String(item.id))}">${escapeHtml(formatCommodityLabel(item.name))}</option>`
            )).join('')}`;
            select.disabled = false;
            const search = document.getElementById('uex-commodity-search');
            if (search) search.disabled = false;
            const recommendButton = document.getElementById('uex-recommend-refresh');
            if (recommendButton) recommendButton.disabled = false;
            status.textContent = `상품 ${visible.length}종을 불러왔습니다.`;
        } catch (error) {
            select.innerHTML = '<option value="">상품 목록을 불러오지 못했습니다</option>';
            const recommendButton = document.getElementById('uex-recommend-refresh');
            if (recommendButton) recommendButton.disabled = true;
            status.textContent = 'UEX API 연결이 불안정합니다. UEX Corp에서 직접 확인해 주세요.';
        }
    }

    function renderCommodityResults(query = '') {
        const input = document.getElementById('uex-commodity-search');
        const results = document.getElementById('uex-commodity-results');
        if (!input || !results) return;
        const normalized = query.trim().toLowerCase();
        const items = availableUexCommodities
            .filter((item) => !normalized || buildCommoditySearchText(item).includes(normalized))
            .slice(0, 12);
        results.innerHTML = items.length ? items.map(renderCommodityOption).join('') : '<div class="planner-picker-empty">검색 결과가 없습니다. 영문 상품명 또는 코드로 다시 검색해 보세요.</div>';
        results.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    function buildCommoditySearchText(item) {
        return [item.name, getCommodityKoreanName(item.name), item.code, item.category_name].filter(Boolean).join(' ').toLowerCase();
    }

    function getCommodityKoreanName(name) {
        if (!name) return '';
        const localized = getLocalizationValue(name, 'commodities');
        if (localized?.ko) return localized.ko;
        if (typeof localized === 'string') return localized;
        return '';
    }

    function getCommodityDescription(name) {
        const localized = getLocalizationValue(name, 'commodities');
        return localized && typeof localized === 'object' ? localized.desc || '' : '';
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

    function renderCommodityOption(item) {
        const selected = document.getElementById('uex-commodity-select')?.value === String(item.id);
        const korean = getCommodityKoreanName(item.name);
        const meta = [korean, item.code, item.category_name].filter(Boolean).join(' · ');
        return `<button class="planner-picker-option" type="button" role="option" aria-selected="${selected}" data-commodity-id="${escapeHtml(String(item.id))}">
            <strong>${escapeHtml(item.name)}</strong>
            ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
        </button>`;
    }

    function selectCommodity(id) {
        const item = availableUexCommodities.find((commodity) => String(commodity.id) === String(id));
        const select = document.getElementById('uex-commodity-select');
        const search = document.getElementById('uex-commodity-search');
        const button = document.getElementById('uex-refresh');
        if (!item || !select || !search || !button) return;
        select.value = String(item.id);
        search.value = formatCommodityLabel(item.name);
        button.disabled = false;
        renderCommoditySummary(item);
        currentUexModel = null;
        currentUexSelection = { buyKey: '', sellKey: '' };
        const uexResults = document.getElementById('uex-results');
        if (uexResults) uexResults.innerHTML = '<div class="uex-empty">상품 선택 후 거래 후보를 조회할 수 있습니다.</div>';
        renderLogisticsRecommendation();
        announcePickerSelection(`${formatCommodityLabel(item.name)} 상품을 선택했습니다.`);
        closePicker(search, document.getElementById('uex-commodity-results'));
    }

    function renderCommoditySummary(item) {
        const summary = document.getElementById('uex-commodity-summary');
        if (!summary) return;
        summary.hidden = false;
        const meta = [getCommodityKoreanName(item.name), item.code, item.category_name].filter(Boolean).join(' · ');
        summary.innerHTML = `<strong>${escapeHtml(item.name)}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ''}<small>후보 조회 준비 완료</small>`;
    }

    async function renderUexCommodityCandidates(commodityId) {
        const status = document.getElementById('uex-status');
        const results = document.getElementById('uex-results');
        if (!commodityId || !status || !results) return;
        status.textContent = '거래 후보를 조회하는 중입니다...';
        results.innerHTML = '';
        currentUexSelection = { buyKey: '', sellKey: '' };
        try {
            const prices = await uex.fetchUexData(`commodities/${encodeURIComponent(commodityId)}/prices`, UEX_CACHE_TTL_MS.prices);
            const selectedCommodity = availableUexCommodities.find((item) => String(item.id) === String(commodityId));
            const model = uex.buildUexCandidateModel(prices, selectedCommodity, currentUexSelection);
            currentUexModel = model;
            results.innerHTML = renderUexCandidateCards(model);
            status.textContent = model.lastUpdatedLabel;
            renderLogisticsRecommendation();
        } catch (error) {
            currentUexModel = null;
            status.textContent = 'UEX API 응답을 받지 못했습니다. UEX Corp에서 직접 확인해 주세요.';
            renderLogisticsRecommendation();
        }
    }

    function handleUexCandidateClick(event) {
        const option = event.target.closest('[data-uex-side][data-uex-key]');
        if (!option || !currentUexModel) return;
        const side = option.getAttribute('data-uex-side');
        const key = option.getAttribute('data-uex-key');
        if (side === 'buy') currentUexSelection.buyKey = key;
        if (side === 'sell') currentUexSelection.sellKey = key;
        currentUexModel = uex.buildUexCandidateModel(currentUexModel.rawPrices, currentUexModel.commodity, currentUexSelection);
        document.getElementById('uex-results').innerHTML = renderUexCandidateCards(currentUexModel);
        renderLogisticsRecommendation();
    }

    function renderUexCandidateCards(model) {
        if (!model.buyOptions.length && !model.sellOptions.length) return '<div class="uex-empty">현재 표시할 매수·매도 후보가 없습니다.</div>';
        const warning = model.bestBuy && model.bestSell && model.profitPerScu <= 0
            ? '<p class="uex-warning">현재 선택 조합은 수익이 없거나 손실이 발생할 수 있습니다.</p>'
            : '';
        return `
            ${renderUexSummaryGrid(model)}
            ${warning}
            <div class="uex-candidate-layout">
                ${renderUexCandidateColumn(model, 'buy')}
                ${renderUexCandidateColumn(model, 'sell')}
            </div>`;
    }

    function renderUexSummaryGrid(model) {
        const buyPrice = model.bestBuy ? `${formatCredits(model.bestBuy.price_buy)} / SCU` : '매수 후보 없음';
        const sellPrice = model.bestSell ? `${formatCredits(model.bestSell.price_sell)} / SCU` : '매도 후보 없음';
        return `<div class="uex-summary-grid">
            ${renderUexSummaryCard('선택 상품', model.commodityLabel, model.lastUpdatedLabel)}
            ${renderUexSummaryCard('선택 매수 후보', formatUexLocation(model.bestBuy), `${buyPrice} · 필요 자금 ${formatCredits(model.purchaseCost)}`)}
            ${renderUexSummaryCard('선택 매도 후보', formatUexLocation(model.bestSell), `${sellPrice} · 예상 매출 ${formatCredits(model.grossRevenue)}`)}
            ${renderUexSummaryCard('예상 수익', formatCredits(model.estimatedProfit), `${formatCredits(model.profitPerScu)} / SCU · 수익률 ${formatPercent(model.profitRate)}`)}
        </div>`;
    }

    function renderUexSummaryCard(label, title, detail) {
        return `<article class="uex-summary-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(title || '미선택')}</strong>
            <b>${escapeHtml(detail || '')}</b>
        </article>`;
    }

    function renderUexCandidateColumn(model, side) {
        const isBuy = side === 'buy';
        const rows = isBuy ? model.buyOptions : model.sellOptions;
        const selectedKey = isBuy ? currentUexSelection.buyKey : currentUexSelection.sellKey;
        const title = isBuy ? '매수 후보' : '매도 후보';
        const empty = isBuy ? '현재 UEX 기준 매수 후보가 없습니다.' : '현재 UEX 기준 매도 후보가 없습니다.';
        const summary = isBuy
            ? `선택 화물량 ${model.usableScu.toLocaleString('ko-KR')} SCU 기준 필요 구매 자금: ${formatCredits(model.purchaseCost)}`
            : `선택 화물량 ${model.usableScu.toLocaleString('ko-KR')} SCU 기준 예상 판매 금액: ${formatCredits(model.grossRevenue)}`;
        const cards = rows.length
            ? rows.slice(0, 8).map((row, index) => renderUexCandidateOption(row, side, selectedKey, index)).join('')
            : `<div class="uex-empty">${escapeHtml(empty)}</div>`;
        return `<section class="uex-candidate-column">
            <div class="uex-candidate-column-header">
                <h4>${escapeHtml(title)}</h4>
                <p>${escapeHtml(summary)}</p>
            </div>
            <div class="uex-candidate-list">${cards}</div>
        </section>`;
    }

    function renderUexCandidateOption(row, side, selectedKey, index) {
        const field = side === 'buy' ? 'price_buy' : 'price_sell';
        const selected = row.uexKey === selectedKey ? ' is-selected' : '';
        const quantity = formatUexQuantity(row, side);
        return `<button class="uex-candidate-card${selected}" type="button" data-uex-side="${escapeHtml(side)}" data-uex-key="${escapeHtml(row.uexKey)}" aria-pressed="${selected ? 'true' : 'false'}">
            <div class="uex-candidate-top">
                <span class="uex-candidate-location">${index + 1}. ${escapeHtml(formatUexLocation(row))}</span>
                ${selected ? '<span class="uex-candidate-selected">선택됨</span>' : ''}
            </div>
            <strong class="uex-candidate-price">${escapeHtml(formatCredits(row[field]))} / SCU</strong>
            <div class="uex-candidate-meta">
                <small class="uex-candidate-updated">${escapeHtml(formatUexUpdated(row) || '갱신 시각 미확인')}</small>
                ${quantity ? `<span class="uex-candidate-quantity">${escapeHtml(quantity)}</span>` : ''}
            </div>
        </button>`;
    }

    async function renderRecommendedCommodities() {
        const status = document.getElementById('uex-recommend-status');
        const results = document.getElementById('uex-recommend-results');
        const button = document.getElementById('uex-recommend-refresh');
        if (!status || !results || !button) return;
        if (!availableUexCommodities.length) {
            status.textContent = 'UEX 상품 목록을 먼저 불러와야 합니다.';
            return;
        }
        button.disabled = true;
        status.textContent = '추천 무역품 후보를 조회하는 중입니다.';
        results.innerHTML = '';
        try {
            const models = await Promise.all(RECOMMENDED_COMMODITY_CANDIDATES.map(fetchRecommendedCommodityModel));
            const recommendationContext = {
                operationType: document.getElementById('trade-operation-type')?.value || 'solo',
                risk: document.getElementById('trade-risk')?.value || 'low'
            };
            const ranked = models.filter(Boolean)
                .map((model) => uex.scoreRecommendedCommodity(model, recommendationContext))
                .sort((left, right) => right.score - left.score)
                .slice(0, 5);
            results.innerHTML = ranked.length ? ranked.map(renderRecommendedCommodityCard).join('') : '<div class="uex-empty">추천 가능한 거래 후보가 없습니다. UEX Corp에서 직접 확인해 주세요.</div>';
            status.textContent = ranked.length ? `추천 후보 ${ranked.length}개를 표시합니다.` : '추천 후보를 찾지 못했습니다.';
        } catch (error) {
            results.innerHTML = '<div class="uex-empty">UEX API 연결이 불안정합니다. UEX Corp에서 직접 확인해 주세요.</div>';
            status.textContent = '추천 무역품 조회에 실패했습니다.';
        } finally {
            button.disabled = false;
        }
    }

    async function fetchRecommendedCommodityModel(name) {
        const commodity = findCommodityByName(name);
        if (!commodity) return null;
        try {
            const prices = await uex.fetchUexData(`commodities/${encodeURIComponent(commodity.id)}/prices`, UEX_CACHE_TTL_MS.prices);
            const model = uex.buildUexCandidateModel(prices, commodity, { buyKey: '', sellKey: '' });
            if (!model.bestBuy || !model.bestSell || model.profitPerScu <= 0) return null;
            return model;
        } catch (error) {
            console.warn('UEX recommendation candidate failed', name, error);
            return null;
        }
    }

    function findCommodityByName(name) {
        const normalized = name.toLowerCase();
        return availableUexCommodities.find((item) => String(item.name).toLowerCase() === normalized);
    }

    function renderRecommendedCommodityCard(model) {
        const projectedScu = model.usableScu;
        return `<article class="uex-recommend-card">
            <div>
                <strong>${escapeHtml(model.commodityLabel)}</strong>
                <span class="uex-recommend-grade">${escapeHtml(model.grade)}</span>
            </div>
            <dl>
                <div><dt>SCU당 예상 수익</dt><dd>${escapeHtml(formatCredits(model.profitPerScu))}</dd></div>
                <div><dt>${escapeHtml(String(projectedScu))} SCU 기준 예상 수익</dt><dd>${escapeHtml(formatCredits(model.estimatedProfit))}</dd></div>
                <div><dt>매수</dt><dd>${escapeHtml(formatUexLocation(model.bestBuy))}</dd></div>
                <div><dt>매도</dt><dd>${escapeHtml(formatUexLocation(model.bestSell))}</dd></div>
                <div><dt>최근 갱신</dt><dd>${escapeHtml(model.lastUpdatedLabel.replace('최근 갱신: ', ''))}</dd></div>
            </dl>
            <button class="btn btn-secondary" type="button" data-recommended-commodity-id="${escapeHtml(String(model.commodityId))}">이 상품 선택</button>
        </article>`;
    }

    function formatUexLocation(row) {
        if (!row) return '미선택';
        return [
            formatLocalizedName(row.terminal_name, 'terminals'),
            formatLocalizedName(row.city_name, 'locations'),
            formatLocalizedName(row.outpost_name, 'locations'),
            formatLocalizedName(row.space_station_name, 'locations'),
            formatLocalizedName(row.moon_name, 'locations'),
            formatLocalizedName(row.planet_name, 'locations')
        ].filter(Boolean).join(' · ');
    }

    function formatCredits(value) {
        return `${Math.round(value).toLocaleString('ko-KR')} aUEC`;
    }

    function formatPercent(value) {
        return Number.isFinite(value) ? `${value.toFixed(1)}%` : '0.0%';
    }

    function formatUexUpdated(row) {
        if (!row?.date_modified) return '';
        return `갱신 ${new Date(row.date_modified * 1000).toLocaleString('ko-KR')}`;
    }

    function formatUexQuantity(row, side) {
        const fields = side === 'buy'
            ? ['inventory', 'stock', 'quantity', 'scu_buy']
            : ['demand', 'max_demand', 'quantity', 'scu_sell'];
        const value = fields.map((field) => row?.[field]).find((item) => Number(item) > 0);
        if (!value) return '';
        return side === 'buy' ? `재고 ${Number(value).toLocaleString('ko-KR')}` : `수요 ${Number(value).toLocaleString('ko-KR')}`;
    }

    function refreshUexModelForPlannerInputs() {
        if (!currentUexModel?.rawPrices) return;
        currentUexModel = uex.buildUexCandidateModel(currentUexModel.rawPrices, currentUexModel.commodity, currentUexSelection);
        const results = document.getElementById('uex-results');
        if (results) results.innerHTML = renderUexCandidateCards(currentUexModel);
    }

    function renderLogisticsRecommendation() {
        const cargoInput = document.getElementById('logistics-cargo');
        const crewInput = document.getElementById('logistics-crew');
        const shipSelect = document.getElementById('logistics-ship');
        const operationSelect = document.getElementById('trade-operation-type');
        const riskSelect = document.getElementById('trade-risk');
        const result = document.getElementById('logistics-result');
        const copyButton = document.getElementById('trade-briefing-copy');
        const shareButton = document.getElementById('trade-briefing-share');
        if (!cargoInput || !crewInput || !shipSelect || !operationSelect || !riskSelect || !result) return;
        const cargoTarget = Math.max(0, Number(cargoInput.value) || 0);
        const crewAvailable = Math.max(1, Number(crewInput.value) || 0);
        const selectedShip = shipById.get(shipSelect.value);
        refreshUexModelForPlannerInputs();
        if (!selectedShip || cargoTarget === 0) {
            renderLogisticsPrompt(result, Boolean(selectedShip), cargoTarget);
            renderTradeToolHint(operationSelect.value);
            renderTradeChecklistPrompt();
            renderTradeBriefingPrompt();
            if (copyButton) copyButton.disabled = true;
            return;
        }
        if (copyButton) copyButton.disabled = false;
        const recommendation = buildLogisticsRecommendation({
            cargoTarget,
            crewAvailable,
            ship: selectedShip,
            operationType: operationSelect.value,
            risk: riskSelect.value
        });
        result.innerHTML = `
            <div class="operation-fit operation-fit-${escapeHtml(recommendation.fit.level)}">
                <span>${escapeHtml(recommendation.fit.label)}</span>
                <strong>${escapeHtml(recommendation.fit.summary)}</strong>
                <ul>${recommendation.fit.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
            </div>
            ${renderUexRecommendationSummary(recommendation)}
            <div class="logistics-result-main">
                <strong>${escapeHtml(recommendation.title)}</strong>
                <p>${escapeHtml(recommendation.summary)}</p>
            </div>
            <div class="logistics-result-grid">
                <div><span>\uc801\uc7ac \uc5ec\uc720</span><strong>${escapeHtml(recommendation.buffer)}</strong></div>
                ${renderHourlyProfitResult(recommendation)}
            </div>
            <div class="trade-result-columns">
                ${renderShipSuitabilityCard(recommendation)}
                ${renderRolePlanCard(recommendation)}
            </div>
            <p class="logistics-result-note">${escapeHtml(recommendation.note)}</p>`;
        renderTradeChecklist(recommendation);
        renderTradeBriefing(recommendation);
    }

    function renderHourlyProfitResult(recommendation) {
        const travelMinutes = Math.max(0, Number(document.getElementById('planner-travel-time')?.value) || 0);
        if (travelMinutes <= 0) return '';
        const sorties = Number(recommendation.sortiesCount) || 0;
        const totalMinutes = sorties * travelMinutes * 2;
        const totalHours = totalMinutes / 60;
        const totalProfit = currentUexModel?.estimatedProfit || 0;
        const hourlyProfit = totalHours > 0 ? Math.round(totalProfit / totalHours) : 0;
        return `<div id="result-hourly"><span>\uc2dc\uac04\ub2f9 \uc218\uc775 (\uc608\uc0c1)</span><strong class="result-value">${hourlyProfit.toLocaleString()} aUEC/h</strong></div>`;
    }

    function renderUexRecommendationSummary(recommendation) {
        if (!currentUexModel?.bestBuy || !currentUexModel?.bestSell) return '';
        return `<section class="trade-detail-card trade-uex-summary">
            <h4>선택 거래 수익 요약</h4>
            <div class="trade-profit-grid">
                <div><span>상품</span><strong>${escapeHtml(currentUexModel.commodityLabel)}</strong></div>
                <div><span>매수 후보</span><strong>${escapeHtml(formatUexLocation(currentUexModel.bestBuy))}</strong><b>${escapeHtml(formatCredits(currentUexModel.bestBuy.price_buy))} / SCU</b></div>
                <div><span>매도 후보</span><strong>${escapeHtml(formatUexLocation(currentUexModel.bestSell))}</strong><b>${escapeHtml(formatCredits(currentUexModel.bestSell.price_sell))} / SCU</b></div>
                <div><span>필요 구매 자금</span><strong>${escapeHtml(formatCredits(currentUexModel.purchaseCost))}</strong></div>
                <div><span>예상 판매 금액</span><strong>${escapeHtml(formatCredits(currentUexModel.grossRevenue))}</strong></div>
                <div><span>예상 순수익</span><strong>${escapeHtml(formatCredits(currentUexModel.estimatedProfit))}</strong><b>${escapeHtml(formatCredits(currentUexModel.profitPerScu))} / SCU · ${escapeHtml(formatPercent(currentUexModel.profitRate))}</b></div>
            </div>
        </section>`;
    }

    function renderLogisticsPrompt(result, hasShip, cargoTarget) {
        const message = !hasShip
            ? '보유 함선을 선택하면 작전 추천을 시작합니다.'
            : cargoTarget === 0
                ? '운송 화물량을 입력하면 출격 횟수와 역할 배분을 계산합니다.'
                : '입력값을 확인해 주세요.';
        result.innerHTML = `<div class="logistics-empty">${escapeHtml(message)}</div>`;
    }

    function renderTradeChecklistPrompt() {
        const list = document.getElementById('trade-checklist');
        if (!list) return;
        list.innerHTML = [
            '운송 목표량 입력',
            '보유 함선 선택',
            '참여 인원과 위험도 설정'
        ].map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    }

    function renderTradeBriefingPrompt() {
        const field = document.getElementById('trade-briefing-text');
        if (!field) return;
        field.value = '작전 정보를 입력하면 Discord 공유용 브리핑이 생성됩니다.';
        const shareButton = document.getElementById('trade-briefing-share');
        if (shareButton) shareButton.disabled = true;
    }

    function buildLogisticsRecommendation({ cargoTarget, crewAvailable, ship, operationType, risk }) {
        const cargoCapacity = getCargoValue(ship.cargo);
        const usableCapacity = Math.max(1, cargoCapacity);
        const sorties = Math.ceil(cargoTarget / usableCapacity);
        const minCrew = Math.max(1, parseSmallestNumber(ship.crew));
        const transportCrewNeeded = Math.min(crewAvailable, minCrew);
        const requiredEscort = getEscortRequirement(operationType, risk);
        const supportCrew = Math.max(0, crewAvailable - transportCrewNeeded);
        const totalCapacity = sorties * usableCapacity;
        const buffer = `${Math.max(0, totalCapacity - cargoTarget).toLocaleString()} SCU`;
        const title = `${getOperationLabel(operationType)} · ${ship.name} 기준 ${sorties}회 운송`;
        const summary = `${cargoTarget.toLocaleString()} SCU를 ${ship.name}(${ship.cargo})로 처리하는 구성입니다. 위험도 ${getRiskLabel(risk)} 기준, ${getOperationSummary(operationType)}.`;
        const note = buildOperationNote({ supportCrew, requiredEscort, risk });
        const rolePlan = buildRolePlan({ crewAvailable, transportCrewNeeded, requiredEscort, operationType });
        const fit = buildOperationFit({ cargoCapacity, sorties, supportCrew, requiredEscort, risk, ship });
        return {
            title,
            summary,
            sorties: `${sorties}\ud68c`,
            sortiesCount: sorties,
            transportCrew: `${transportCrewNeeded}명`,
            supportCrew: `${supportCrew}명`,
            buffer,
            note,
            operationType,
            risk,
            ship,
            cargoTarget,
            crewAvailable,
            requiredEscort,
            cargoCapacity,
            rolePlan,
            fit
        };
    }

    function buildOperationFit({ cargoCapacity, sorties, supportCrew, requiredEscort, risk, ship }) {
        const reasons = [`화물량 대비 예상 출격 ${sorties}회`, `운송 외 지원 가능 인원 ${supportCrew}명`];
        if (cargoCapacity === 0) reasons.push('선택 함선의 화물량이 0 SCU입니다.');
        if (sorties >= 3) reasons.push('출격 횟수가 3회 이상이라 추가 화물선 투입이 유리합니다.');
        if (requiredEscort > 0) reasons.push(`권장 호위 ${requiredEscort}명 중 ${Math.min(supportCrew, requiredEscort)}명 확보`);
        if (risk === 'high') reasons.push('고위험 작전은 호위와 우회 계획이 필수입니다.');
        if (getShipTags(ship).includes('미구현')) reasons.push('미구현 함선이므로 실제 라이브 운용 전 확인이 필요합니다.');
        if (cargoCapacity === 0 || (risk === 'high' && supportCrew < requiredEscort)) {
            return { level: 'poor', label: '비추천', summary: '현재 조건으로는 바로 출발하기 어렵습니다.', reasons };
        }
        if (sorties >= 3 || (requiredEscort > 0 && supportCrew === requiredEscort) || getShipTags(ship).includes('미구현')) {
            return { level: 'caution', label: '주의', summary: '진행은 가능하지만 보완이 필요한 구성입니다.', reasons };
        }
        return { level: 'good', label: '적합', summary: '현재 조건에서 무리 없이 운용 가능한 구성입니다.', reasons };
    }

    function buildRolePlan({ crewAvailable, transportCrewNeeded, requiredEscort, operationType }) {
        const routeRequired = ['convoy', 'highValue', 'bulk', 'supply'].includes(operationType);
        const route = crewAvailable >= 2 && routeRequired ? 1 : 0;
        const escort = Math.min(requiredEscort, Math.max(0, crewAvailable - transportCrewNeeded - route));
        const cargoAssistNeeded = ['bulk', 'mining', 'supply'].includes(operationType);
        const cargoAssist = cargoAssistNeeded && crewAvailable - transportCrewNeeded - route - escort > 0 ? 1 : 0;
        const reserve = Math.max(0, crewAvailable - transportCrewNeeded - route - escort - cargoAssist);
        return {
            transport: transportCrewNeeded,
            route,
            escort,
            reserve,
            cargoAssist
        };
    }

    function renderShipSuitabilityCard(recommendation) {
        const ship = recommendation.ship;
        const tags = getShipTags(ship);
        const advantages = [
            `${ship.cargo} 적재`,
            recommendation.cargoCapacity >= 500 ? '대량 운송에 유리' : '회전율 관리에 적합',
            parseLargestNumber(ship.crew) <= 2 ? '소수 인원 운용 가능' : '다인 운용에 적합'
        ];
        if (tags.includes('화물')) advantages.push('물류 목적에 직접 부합');
        if (tags.includes('입문')) advantages.push('입문 운용 난도가 낮음');
        const cautions = [];
        if (recommendation.cargoCapacity === 0) cautions.push('화물 운송 불가');
        if (parseLargestNumber(recommendation.sorties) >= 3) cautions.push('다회 출격 필요');
        if (tags.includes('미구현')) cautions.push('실제 라이브 운용 전 확인 필요');
        if (cautions.length === 0) cautions.push('특이 주의점 없음');
        const scale = getRecommendedOperationScale(recommendation);
        return `<section class="trade-detail-card">
            <h4>선택 함선 적합도</h4>
            <strong>${escapeHtml(ship.name)} · 추천 운용 규모: ${escapeHtml(scale)}</strong>
            <p>장점: ${escapeHtml(advantages.slice(0, 3).join(' / '))}</p>
            <p>주의: ${escapeHtml(cautions.join(' / '))}</p>
            <button class="btn btn-secondary trade-ship-detail" type="button" data-open-ship-id="${escapeHtml(ship.id)}">함선 상세 보기</button>
        </section>`;
    }

    function getRecommendedOperationScale(recommendation) {
        if (recommendation.cargoCapacity >= 1000) return '대형';
        if (recommendation.cargoCapacity >= 250) return '중형';
        if (parseLargestNumber(recommendation.ship.crew) <= 1) return '단독';
        return '소규모';
    }

    function renderRolePlanCard(recommendation) {
        const role = recommendation.rolePlan;
        return `<section class="trade-detail-card">
            <h4>역할 배분 추천</h4>
            <ul>
                <li>운송 담당 ${escapeHtml(String(role.transport))}명</li>
                <li>루트 확인 담당 ${escapeHtml(String(role.route))}명</li>
                <li>호위 담당 ${escapeHtml(String(role.escort))}명</li>
                <li>정찰/예비 ${escapeHtml(String(role.reserve))}명</li>
                <li>적재/하역 보조 ${escapeHtml(String(role.cargoAssist))}명</li>
            </ul>
        </section>`;
    }

    function getOperationLabel(type) {
        return TRADE_OPERATION_CONFIG[type]?.label || '무역 작전';
    }

    function getRiskLabel(risk) {
        return { low: '낮음', medium: '보통', high: '높음' }[risk] || '보통';
    }

    function getOperationSummary(type) {
        return TRADE_OPERATION_CONFIG[type]?.summary || '운송 효율을 우선합니다';
    }

    function getEscortRequirement(type, risk) {
        const base = TRADE_OPERATION_CONFIG[type]?.escortBase || 0;
        if (risk === 'high') return Math.max(base, type === 'solo' ? 1 : 2);
        if (risk === 'medium') return Math.max(base, ['bulk', 'highValue', 'supply'].includes(type) ? 1 : 0);
        return base;
    }

    function buildOperationNote({ supportCrew, requiredEscort, risk }) {
        if (requiredEscort > 0 && supportCrew < requiredEscort) {
            return `현재 인원으로는 권장 호위 ${requiredEscort}명을 채우기 어렵습니다. 위험도 ${getRiskLabel(risk)} 작전은 추가 모집 후 진행하는 편이 안전합니다.`;
        }
        if (requiredEscort > 0) {
            return `남는 인원 중 ${requiredEscort}명은 호위에 우선 배치하고, 나머지는 적재 보조와 경계에 배치하세요.`;
        }
        return supportCrew > 0
            ? `남는 ${supportCrew}명은 적재 보조, 정찰, 경계 임무에 배치하면 운용이 매끄럽습니다.`
            : '운송 인원이 빠듯합니다. 출발 전 적재와 목적지 절차를 더 단순하게 잡는 편이 좋습니다.';
    }

    function renderTradeChecklist(recommendation) {
        const list = document.getElementById('trade-checklist');
        if (!list) return;
        const items = [
            'UEX Corp에서 최신 매수·매도 위치 확인',
            'SC Trade Tools에서 화물량 기준 루트 수익 비교',
            `${recommendation.ship.name} 적재량과 출격 횟수 재확인`,
            recommendation.requiredEscort > 0 ? `호위 ${recommendation.requiredEscort}명 확보` : '호위 필요 여부 최종 확인',
            ...(TRADE_OPERATION_CONFIG[recommendation.operationType]?.checklist || []),
            'Discord 집결 채널과 출발 시각 공지',
            '착륙지·판매지 혼잡도 확인'
        ];
        list.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
        renderTradeToolHint(recommendation.operationType);
    }

    function renderTradeToolHint(operationType) {
        const hint = document.querySelector('.trade-tool-hint ol');
        if (!hint) return;
        const items = TRADE_OPERATION_CONFIG[operationType]?.toolSteps || [];
        hint.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    }

    function renderTradeBriefing(recommendation) {
        const field = document.getElementById('trade-briefing-text');
        if (!field) return;
        const lines = [
            '[VOLT 무역 브리핑]',
            `작전 유형: ${getOperationLabel(recommendation.operationType)}`,
            `함선: ${recommendation.ship.name} (${recommendation.ship.cargo})`,
            `목표 화물량: ${recommendation.cargoTarget.toLocaleString()} SCU`,
            ``,
            `위험도: ${getRiskLabel(recommendation.risk)}`,
            `참여 인원: ${recommendation.crewAvailable}명`
        ];
        if (currentUexModel?.bestBuy && currentUexModel?.bestSell) {
            lines.splice(4, 0,
                `상품: ${currentUexModel.commodityLabel}`,
                ``,
                `매수 후보: ${formatUexLocation(currentUexModel.bestBuy)}`,
                `매수 가격: ${formatCredits(currentUexModel.bestBuy.price_buy)} / SCU`,
                `필요 구매 자금: ${formatCredits(currentUexModel.purchaseCost)}`,
                ``,
                `매도 후보: ${formatUexLocation(currentUexModel.bestSell)}`,
                `매도 가격: ${formatCredits(currentUexModel.bestSell.price_sell)} / SCU`,
                `예상 판매 금액: ${formatCredits(currentUexModel.grossRevenue)}`,
                ``,
                `예상 계산:`,
                `예상 순수익: ${formatCredits(currentUexModel.estimatedProfit)}`,
                `SCU당 수익: ${formatCredits(currentUexModel.profitPerScu)}`,
                `수익률: ${formatPercent(currentUexModel.profitRate)}`,
                ``
            );
        }
        field.value = lines.join('\n');
        const shareButton = document.getElementById('trade-briefing-share');
        if (shareButton) shareButton.disabled = !authState.loggedIn;
    }

    async function copyTradeBriefing() {
        const field = document.getElementById('trade-briefing-text');
        if (!field) return;
        try {
            await navigator.clipboard.writeText(field.value);
            showToast('브리핑을 복사했습니다.');
        } catch (error) {
            showToast('브리핑 복사에 실패했습니다.');
        }
    }

    async function shareTradeBriefing() {
        const field = document.getElementById('trade-briefing-text');
        if (!field) return;
        if (!authState.loggedIn) {
            showToast('Discord 로그인 후 전송할 수 있습니다.');
            return;
        }
        try {
            const response = await fetch('/api/briefing/share', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ text: field.value })
            });
            if (response.status === 429) {
                showToast('전송 간격 제한입니다. 30초 후 다시 시도해 주세요.');
                return;
            }
            if (response.status === 401 || response.status === 403) {
                showToast('함대 멤버만 Discord로 전송할 수 있습니다.');
                return;
            }
            if (!response.ok) throw new Error(`BRIEFING ${response.status}`);
            showToast('Discord 채널로 브리핑을 전송했습니다.');
        } catch (error) {
            console.warn('Briefing share failed', error);
            showToast('Discord 전송에 실패했습니다.');
        }
    }

    function parseSmallestNumber(value) {
        const matches = String(value).match(/\d+/g);
        return matches ? Number(matches[0]) : 1;
    }

    function resetShipState() {
        shipState.manufacturer = 'all';
        shipState.hideUnreleased = false;
        shipState.query = '';
        shipState.sort = 'name-asc';
        shipState.purpose = '';
        shipState.cargoMin = 0;
        shipState.hangarOnly = false;
        shipState.selectedTags = [];
        syncShipControls();
        renderShips();
    }

    function countActiveAdvancedFilters() {
        return (shipState.cargoMin > 0 ? 1 : 0)
            + (shipState.purpose ? 1 : 0)
            + (shipState.hideUnreleased ? 1 : 0)
            + (shipState.hangarOnly ? 1 : 0);
    }

    function syncShipControls() {
        const search = document.getElementById('ship-search');
        const manufacturer = document.getElementById('ship-manufacturer');
        const hideUnreleased = document.getElementById('ship-hide-unreleased');
        const sort = document.getElementById('ship-sort');
        const purpose = document.getElementById('ship-purpose');
        const hangarOnly = document.getElementById('ship-hangar-only');
        if (search) search.value = shipState.query;
        if (manufacturer) manufacturer.value = shipState.manufacturer;
        if (hideUnreleased) hideUnreleased.checked = shipState.hideUnreleased;
        if (sort) sort.value = shipState.sort;
        if (purpose) purpose.value = shipState.purpose;
        if (hangarOnly) hangarOnly.checked = shipState.hangarOnly;
        document.querySelectorAll('.cargo-filter-btn').forEach((button) => {
            const isActive = Number(button.dataset.cargoMin) === shipState.cargoMin;
            button.classList.toggle('active', isActive);
        });
        const badge = document.getElementById('ship-filter-count');
        const toggle = document.getElementById('ship-advanced-toggle');
        const activeCount = countActiveAdvancedFilters();
        if (badge) {
            badge.hidden = activeCount === 0;
            badge.textContent = String(activeCount);
        }
        toggle?.classList.toggle('has-active', activeCount > 0);
    }

    function openShipFromEvent(event) {
        if (event.target.closest('[data-compare-ship-id], [data-use-planner-ship-id], [data-hangar-ship-id]')) return;
        const card = event.target.closest('[data-ship-id]');
        if (!card) return;
        event.preventDefault();
        const ship = shipById.get(card.getAttribute('data-ship-id'));
        if (ship) openShipModal(ship);
    }

    function handleShipCompareToggle(event) {
        const button = event.target.closest('[data-compare-ship-id]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const shipId = button.getAttribute('data-compare-ship-id');
        if (shipCompareState.has(shipId)) {
            shipCompareState.delete(shipId);
        } else if (shipCompareState.size < 3) {
            shipCompareState.add(shipId);
        } else {
            showToast('함선 비교는 최대 3척까지 가능합니다.');
        }
        renderShips();
    }

    function clearShipComparison() {
        shipCompareState.clear();
        renderShips();
    }

    function openShipComparison() {
        const ships = [...shipCompareState].map((id) => shipById.get(id)).filter(Boolean);
        if (ships.length < 2) return;
        openModal(renderShipComparison(ships), true);
    }

    function renderShipComparison(ships) {
        const fields = [
            { label: '\uc81c\uc870\uc0ac', key: 'manufacturer', format: (ship) => ship.manufacturer },
            { label: '\uc5ed\ud560', key: 'role', format: (ship) => ship.role },
            { label: '\ubd84\ub958', key: 'focus', format: (ship) => ship.focus },
            { label: '\ud06c\uae30', key: 'size', format: (ship) => ship.size },
            { label: '\uc2b9\ubb34\uc6d0', key: 'crew', format: (ship) => ship.crew, rawValue: (ship) => parseLargestNumber(ship.crew), numeric: true, higherIsBetter: true },
            { label: '\ud654\ubb3c', key: 'cargo', format: (ship) => ship.cargo, rawValue: (ship) => getCargoValue(ship.cargo), numeric: true, higherIsBetter: true },
            { label: 'USD \uac00\uaca9', key: 'priceUsd', format: (ship) => formatShipPrice(ship.priceUsd), rawValue: (ship) => Number(ship.priceUsd), numeric: true, higherIsBetter: false }
        ];
        return `<div class="modal-header">
                <div>
                    <span class="eyebrow">Ship Compare</span>
                    <h2>\ud568\uc120 \ube44\uad50</h2>
                </div>
                <button class="modal-close" type="button" aria-label="\ubaa8\ub2ec \ub2eb\uae30">\u00d7</button>
            </div>
            <div class="modal-body">
                ${renderShipComparisonSummary(ships)}
                <div class="ship-compare-table-wrap">
                    <table class="ship-compare-table">
                        <thead>
                            <tr>
                                <th scope="col">\ud56d\ubaa9</th>
                                ${ships.map((ship) => `<th scope="col">${escapeHtml(ship.name)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${fields.map((field) => renderComparisonRow(field, ships)).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="ship-compare-tags">
                    ${ships.map((ship) => `<section>
                        <h3>${escapeHtml(ship.name)}</h3>
                        <div class="ship-tags">${getShipTags(ship).map((tag) => `<span class="ship-tag">${escapeHtml(tag)}</span>`).join('')}</div>
                        ${renderShipPlannerAction(ship, 'btn btn-secondary ship-compare-use')}
                    </section>`).join('')}
                </div>
            </div>`;
    }

    function renderShipComparisonSummary(ships) {
        const cargoLeader = getShipByMetric(ships, (ship) => getCargoValue(ship.cargo), 'max');
        const crewLeader = getShipByMetric(ships, (ship) => parseSmallestNumber(ship.crew), 'min');
        const largeOpsLeader = getShipByMetric(ships, (ship) => getCargoValue(ship.cargo) + parseLargestNumber(ship.crew) * 10, 'max');
        const smallOpsLeader = getShipByMetric(ships, (ship) => parseSmallestNumber(ship.crew) * 100 - getCargoValue(ship.cargo), 'min');
        return `<section class="ship-compare-summary">
            <h3>비교 요약</h3>
            <div>
                ${renderComparisonSummaryItem('최대 화물량', cargoLeader)}
                ${renderComparisonSummaryItem('최소 인원 운용', crewLeader)}
                ${renderComparisonSummaryItem('대형 작전', largeOpsLeader)}
                ${renderComparisonSummaryItem('소규모/입문 운용', smallOpsLeader)}
            </div>
            <ul>${ships.map(renderComparisonTagNote).join('')}</ul>
        </section>`;
    }

    function getShipByMetric(ships, getValue, direction) {
        return [...ships].sort((left, right) => {
            const delta = getValue(left) - getValue(right);
            return direction === 'max' ? -delta : delta;
        })[0];
    }

    function renderComparisonSummaryItem(label, ship) {
        return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(ship.name)}</strong></article>`;
    }

    function renderComparisonTagNote(ship) {
        const tags = getShipTags(ship);
        const notes = [];
        if (tags.includes('화물')) notes.push('물류/화물 운송 후보');
        if (tags.includes('입문')) notes.push('입문자 운용 후보');
        if (tags.includes('미구현')) notes.push('현재 실사용 주의');
        if (notes.length === 0) return `<li><strong>${escapeHtml(ship.name)}</strong> · 특화 태그 중심 운용</li>`;
        return `<li><strong>${escapeHtml(ship.name)}</strong> · ${escapeHtml(notes.join(' / '))}</li>`;
    }

    function renderComparisonRow(field, ships) {
        const values = ships.map((ship) => {
            if (!field.numeric) return null;
            const raw = Number(field.rawValue?.(ship));
            return Number.isFinite(raw) ? raw : null;
        });
        const comparable = values.filter((value) => value !== null);
        const bestIndex = field.numeric && ships.length > 1 && comparable.length
            ? values.reduce((best, value, index) => {
                if (value === null) return best;
                if (best === -1) return index;
                const bestValue = values[best];
                return field.higherIsBetter ? (value > bestValue ? index : best) : (value < bestValue ? index : best);
            }, -1)
            : -1;
        const displays = ships.map((ship, index) => {
            const display = field.format(ship);
            const winner = field.numeric && index === bestIndex && values[index] !== null;
            return `<td class="${winner ? 'compare-winner' : ''}">${escapeHtml(display)}</td>`;
        }).join('');
        return `<tr class="${new Set(ships.map((ship) => field.format(ship))).size > 1 ? 'is-different' : ''}">
            <th scope="row">${escapeHtml(field.label)}</th>
            ${displays}
        </tr>`;
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
        activeModal.querySelector('.modal-close')?.focus();
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

    function openShipModal(ship) {
        trackEvent('ship_modal_open', { shipId: ship?.id || '', shipName: ship?.name || '' });
        const officialUrl = getShipOfficialUrl(ship);
        const officialLabel = ship.rsiUrl ? 'RSI 공식 페이지' : 'RSI 함선 매트릭스';
        openModal(`<div class="modal-header">
                <div>
                    <div class="ship-mfr">${escapeHtml(ship.manufacturer)}</div>
                    <h2 class="modal-title">${escapeHtml(getShipDisplayName(ship))}</h2>
                    ${getShipSecondaryName(ship) ? `<p class="modal-subtitle-en">${escapeHtml(getShipSecondaryName(ship))}</p>` : ''}
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
                    <div class="ship-modal-stat"><span>USD \uac00\uaca9</span><strong>${escapeHtml(formatShipPrice(ship.priceUsd))}</strong></div>
                </div>
                <div class="ship-modal-actions">
                    <a class="btn btn-primary ship-modal-link" href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(officialLabel)}</a>
                    ${renderShipPlannerAction(ship, 'btn btn-secondary ship-modal-link')}
                    ${renderHangarToggleButton(ship, true)}
                </div>
            </div>`);
    }

    function renderShipPlannerAction(ship, className) {
        if (!isPlannerEligibleShip(ship)) return '';
        return `<button class="${escapeHtml(className)}" type="button" data-use-planner-ship-id="${escapeHtml(ship.id)}">무역 플래너에서 사용</button>`;
    }

    function getShipOfficialUrl(ship) {
        return ship.rsiUrl || RSI_SHIP_MATRIX_URL;
    }

    function openGalleryLightbox(item) {
        openModal(`<div class="modal-header gallery-modal-header">
                <div class="gallery-modal-heading">
                    <div class="ship-mfr">${escapeHtml(item.date)}</div>
                    <h2 class="modal-title gallery-modal-title">${escapeHtml(item.title)}</h2>
                </div>
                <button class="modal-close" type="button" aria-label="모달 닫기">×</button>
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

    async function copyNoticeLink(id) {
        const url = new URL(window.location.href);
        url.searchParams.set('notice', id);
        url.hash = 'notices';
        try {
            await navigator.clipboard.writeText(url.toString());
            showToast('공지 링크를 복사했습니다.');
        } catch (error) {
            showToast('공지 링크 복사에 실패했습니다.');
        }
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
            showToast('정책 링크를 복사했습니다.');
        } catch (error) {
            try {
                copyTextFallback(value);
                showCopyFeedback(button);
                showToast('정책 링크를 복사했습니다.');
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

    function setupScheduleAccordion() {
        const container = document.getElementById('schedule-list');
        if (!container) return;
        container.addEventListener('click', (event) => {
            const rsvpButton = event.target.closest('[data-rsvp-status]');
            if (rsvpButton) {
                const control = rsvpButton.closest('[data-rsvp-event-id]');
                const eventId = control?.getAttribute('data-rsvp-event-id');
                const status = rsvpButton.getAttribute('data-rsvp-status');
                if (eventId && status) saveEventRsvp(eventId, status).catch((error) => {
                    console.warn('RSVP save failed', error);
                    showToast('참가 상태 저장에 실패했습니다.');
                });
                return;
            }
            const button = event.target.closest('.schedule-item-toggle');
            if (!button) return;
            const detail = document.getElementById(button.getAttribute('aria-controls'));
            if (!detail) return;
            const isExpanded = button.getAttribute('aria-expanded') === 'true';
            button.setAttribute('aria-expanded', String(!isExpanded));
            detail.hidden = isExpanded;
        });
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
            ...data.announcements.map((item) => makeSearchItem('공지', 'notices', item.title, item.content)),
            ...data.ships.map((item) => makeSearchItem('함선', 'ships', item.name, `${item.manufacturer} ${item.role} ${item.description} ${getShipAliases(item).join(' ')}`, item.id)),
            ...data.faq.map((item) => makeSearchItem('FAQ', 'faq', item.q, item.a)),
            ...data.timeline.map((item) => makeSearchItem('연혁', 'timeline', item.title, item.description)),
            ...data.leadership.map((item) => makeSearchItem('임원진', 'leadership', item.name, `${item.role} ${item.description}`)),
            ...(Array.isArray(data.partnerFleets) ? data.partnerFleets.map((item) => makeSearchItem('협력함대', 'partner-fleets', item.name, `${item.region || ''} ${item.game || ''} ${item.focus || ''} ${item.description || ''}`)) : []),
            ...data.departments.map((item) => makeSearchItem('소개', 'about', item.name, item.description)),
            ...data.coreValues.map((item) => makeSearchItem('가치', 'about', item.title, item.description)),
            ...data.calendar.map((item) => makeSearchItem('일정', 'schedule', item.title, item.description)),
            ...data.tradeGuide.map((item) => makeSearchItem('가이드', 'guide', item.title, item.content)),
            ...data.joinSteps.map((item) => makeSearchItem('가입', 'join', item.title, item.description)),
            ...data.gallery.map((item) => makeSearchItem('갤러리', 'gallery', item.title, item.description)),
            ...data.policy.sections.map((item) => makeSearchItem('정책', 'policy', item.title, item.items.map((policyItem) => policyItem.text).join(' '))),
            ...getLocalizationSearchItems()
        ];
        searchIndexCache = result;
        return searchIndexCache;
    }

    function getLocalizationSearchItems() {
        const commodities = Object.entries(localization.commodities || {}).map(([name, value]) => {
            const label = typeof value === 'string' ? value : [value.ko, value.desc].filter(Boolean).join(' ');
            return makeSearchItem('무역품', 'trade-planner', name, label);
        });
        const locations = Object.entries(localization.locations || {}).map(([name, value]) => makeSearchItem('위치', 'trade-planner', name, String(value)));
        const terminals = Object.entries(localization.terminals || {}).map(([name, value]) => makeSearchItem('터미널', 'trade-planner', name, String(value)));
        const glossary = Object.entries(localization.glossary || {}).map(([term, label]) => makeSearchItem('용어', 'guide', term, String(label)));
        return [...commodities, ...locations, ...terminals, ...glossary];
    }

    function makeSearchItem(type, section, title, body, itemId = '') {
        return { type, section, title, body, itemId, haystack: `${title} ${body}`.toLowerCase() };
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
            <button class="search-result" type="button" data-search-section="${escapeHtml(item.section)}" data-search-item-id="${escapeHtml(item.itemId)}">
                <span class="search-result-type">${escapeHtml(item.type)}</span>
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
        const ship = shipById.get(shipId);
        if (!ship) return;
        const card = document.querySelector(`[data-ship-id="${CSS.escape(shipId)}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        openShipModal(ship);
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
            window.setTimeout(() => { splash.style.display = 'none'; }, 600);
        }, 1200);
    }


    function setupAuthStatus() {
        const desktop = document.getElementById('volt-auth-desktop');
        const mobile = document.getElementById('volt-auth-mobile');
        if (!desktop && !mobile) return;

        notifyAuthErrorFromQuery();
        renderAuthLoading(desktop, mobile);

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
                    renderAuthLoggedIn(payload.user, desktop, mobile);
                    applyRoleGates();
                    loadUserPreferences().catch((error) => {
                        console.warn('Preference load failed', error);
                        userPreferencesLoaded = false;
                        renderMyPage();
                    });
                } else {
                    setLoggedOutState(desktop, mobile);
                }
            })
            .catch(() => {
                authState = { loggedIn: false, user: null, roles: [] };
                userPreferencesLoaded = false;
                renderAuthError(desktop, mobile);
                applyRoleGates();
                renderMyPage();
            });
    }

    function normalizeAuthState(user) {
        return { loggedIn: true, user, roles: Array.isArray(user.roles) ? user.roles : [] };
    }

    function setLoggedOutState(desktop, mobile) {
        authState = { loggedIn: false, user: null, roles: [] };
        userPreferencesLoaded = false;
        renderAuthLoggedOut(desktop, mobile);
        applyRoleGates();
        renderMyPage();
    }

    function notifyAuthErrorFromQuery() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') !== 'error') return;
        showToast('Discord 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        const url = new URL(window.location.href);
        url.searchParams.delete('auth');
        history.replaceState(history.state, '', url.toString());
    }

    function renderAuthLoading(desktop, mobile) {
        const html = '<span class="volt-auth-loading">인증 확인 중</span>';
        if (desktop) desktop.innerHTML = html;
        if (mobile) mobile.innerHTML = html;
    }

    function renderAuthLoggedOut(desktop, mobile) {
        const html = '<a class="volt-auth-login" href="/auth/discord/login">Discord 로그인</a>';
        if (desktop) desktop.innerHTML = html;
        if (mobile) mobile.innerHTML = html;
    }

    function renderAuthError(desktop, mobile) {
        const html = '<a class="volt-auth-login volt-auth-warning" href="/auth/discord/login">인증 재시도</a>';
        if (desktop) desktop.innerHTML = html;
        if (mobile) mobile.innerHTML = html;
    }

    function renderAuthLoggedIn(user, desktop, mobile) {
        const displayName = getAuthDisplayName(user);
        const roleLabel = getAuthRoleLabel(user);
        const avatarUrl = typeof user.avatar_url === 'string' ? user.avatar_url : '';
        const desktopHtml = buildAuthDesktopHtml({ displayName, roleLabel, avatarUrl });
        const mobileHtml = buildAuthMobileHtml({ displayName, roleLabel, avatarUrl });

        if (desktop) desktop.innerHTML = desktopHtml;
        if (mobile) mobile.innerHTML = mobileHtml;
    }

    function getAuthDisplayName(user) {
        return user.display_name || user.username || 'VOLT 사용자';
    }

    function getAuthRoleLabel(user) {
        const roles = Array.isArray(user.roles) ? user.roles : [];
        if (roles.includes('대표이사')) return '대표이사';
        if (roles.includes('감찰')) return '감찰';
        if (roles.includes('임원진')) return '임원진';
        if (roles.includes('HR전략실')) return 'HR전략실';
        if (roles.includes('홍보부')) return '홍보부';
        if (roles.includes('VOLT 함대원')) return 'VOLT 함대원';
        if (roles.includes('손님')) return '손님';
        return roles[0] || '인증 사용자';
    }

    function buildAuthDesktopHtml({ displayName, roleLabel, avatarUrl }) {
        const avatar = avatarUrl
            ? `<img class="volt-auth-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" decoding="async">`
            : `<span class="volt-auth-avatar volt-auth-avatar-fallback">${escapeHtml(getAuthInitial(displayName))}</span>`;

        return `<div class="volt-auth-user">
            ${avatar}
            <span class="volt-auth-user-text">
                <strong>${escapeHtml(displayName)}</strong>
                <small>${escapeHtml(roleLabel)}</small>
            </span>
            <a class="volt-auth-logout" href="/auth/logout">로그아웃</a>
        </div>`;
    }

    function buildAuthMobileHtml({ displayName, roleLabel, avatarUrl }) {
        const avatar = avatarUrl
            ? `<img class="volt-auth-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" decoding="async">`
            : `<span class="volt-auth-avatar volt-auth-avatar-fallback">${escapeHtml(getAuthInitial(displayName))}</span>`;

        return `<div class="volt-auth-mobile-card">
            <div class="volt-auth-mobile-user">
                ${avatar}
                <span>
                    <strong>${escapeHtml(displayName)}</strong>
                    <small>${escapeHtml(roleLabel)}</small>
                </span>
            </div>
            <a class="volt-auth-logout" href="/auth/logout">로그아웃</a>
        </div>`;
    }

    function getAuthInitial(value) {
        const text = String(value || '').trim();
        return text ? text.charAt(0).toUpperCase() : 'V';
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
        const shareButton = document.getElementById('trade-briefing-share');
        if (shareButton) shareButton.disabled = !authState.loggedIn || !document.getElementById('trade-briefing-text')?.value;
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
            renderLogisticsRecommendation();
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

    async function loadMyRsvps() {
        const list = document.getElementById('mypage-rsvp-list');
        if (!list || !authState.loggedIn) return;
        try {
            const response = await fetch('/api/me/rsvps', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`MYRSVP ${response.status}`);
            const payload = await response.json();
            const items = payload.items || [];
            list.innerHTML = items.length ? items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.status)} · ${escapeHtml(item.dateLabel || '일정 미정')}</span></li>`).join('') : '<li>참가 상태를 남긴 일정이 없습니다.</li>';
        } catch (error) {
            console.warn('My RSVP load failed', error);
            list.innerHTML = '<li>참가 일정 정보를 불러오지 못했습니다.</li>';
        }
    }

    function renderMyPage() {
        const container = document.getElementById('mypage-content');
        if (!container) return;
        if (!authState.loggedIn) {
            container.innerHTML = '<div class="mypage-card"><h3>로그인이 필요합니다</h3><p>Discord 로그인 후 참가 일정, 격납고, 무역플래너 설정을 확인할 수 있습니다.</p><a class="btn btn-primary" href="/auth/discord/login">Discord 로그인</a></div>';
            return;
        }
        const user = authState.user || {};
        const favoriteShips = getHangar().map((shipId) => shipById.get(shipId)).filter(Boolean);
        const planner = getPlannerStateFromStorage();
        container.innerHTML = `<div class="mypage-grid">
            <article class="mypage-card"><h3>프로필</h3><p>${escapeHtml(getAuthDisplayName(user))}</p><small>${escapeHtml(getAuthRoleLabel(user))}</small></article>
            <article class="mypage-card"><h3>격납고</h3>${renderMyPageShips(favoriteShips)}</article>
            <article class="mypage-card"><h3>무역플래너 저장값</h3>${renderMyPagePlanner(planner)}</article>
            <article class="mypage-card"><h3>참가 일정</h3><ul class="mypage-list" id="mypage-rsvp-list"><li>불러오는 중입니다.</li></ul></article>
        </div>`;
        loadMyRsvps();
    }

    function renderMyPageShips(ships) {
        if (!ships.length) return '<p>격납고에 추가한 함선이 없습니다.</p>';
        return `<ul class="mypage-list">${ships.slice(0, 12).map((ship) => `<li><button type="button" data-ship-id="${escapeHtml(ship.id)}">${escapeHtml(ship.name)}</button><span>${escapeHtml(ship.cargo || '0 SCU')}</span></li>`).join('')}</ul>`;
    }

    function renderMyPagePlanner(planner) {
        if (!hasPlannerState(planner)) return '<p>저장된 무역플래너 설정이 없습니다.</p>';
        const ship = planner.shipId ? shipById.get(planner.shipId) : null;
        return `<dl class="mypage-planner">
            <dt>함선</dt><dd>${escapeHtml(ship?.name || planner.shipSearch || '미선택')}</dd>
            <dt>화물량</dt><dd>${escapeHtml(planner.cargo || '0')} SCU</dd>
            <dt>인원</dt><dd>${escapeHtml(planner.crew || '1')}명</dd>
        </dl>`;
    }
    function setupTheme() {
        const buttons = ['theme-toggle', 'mobile-theme-toggle']
            .map((id) => document.getElementById(id))
            .filter(Boolean);
        if (!buttons.length) return;
        applyTheme(getPreferredTheme());
        buttons.forEach((button) => button.addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            applyTheme(next);
            localStorage.setItem('volt-theme', next);
        }));
    }

    function getPreferredTheme() {
        const storedTheme = localStorage.getItem('volt-theme');
        if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
        // 저장된 선택이 없으면 시스템 설정과 무관하게 다크 모드가 기본.
        return 'dark';
    }

    function applyTheme(theme) {
        const normalizedTheme = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', normalizedTheme);

        const nextThemeLabel = normalizedTheme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환';
        const icon = renderInlineIcon(normalizedTheme === 'light' ? 'moon' : 'sun', 'theme-icon');

        const button = document.getElementById('theme-toggle');
        if (button) {
            button.setAttribute('data-current-theme', normalizedTheme);
            button.setAttribute('aria-label', nextThemeLabel);
            button.setAttribute('title', nextThemeLabel);
            button.innerHTML = icon;
        }

        const mobileButton = document.getElementById('mobile-theme-toggle');
        if (mobileButton) {
            mobileButton.setAttribute('data-current-theme', normalizedTheme);
            mobileButton.setAttribute('aria-label', nextThemeLabel);
            mobileButton.innerHTML = `${icon}<span>${nextThemeLabel}</span>`;
        }
    }

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
            showToast('VOLT 앱 설치가 완료되었습니다.');
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
                <strong>VOLT 앱 설치</strong>
                <span>홈 화면에서 빠르게 함선DB와 무역플래너를 열 수 있습니다.</span>
            </div>
            <button class="btn btn-primary" type="button" data-pwa-install>설치</button>
            <button class="btn btn-secondary" type="button" data-pwa-dismiss aria-label="설치 안내 닫기">닫기</button>`;
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

    function init() {
        nav.init({ trackEvent, observeNewReveals, openNoticeFromQuery, trapFocus, getFocusableElements });
        uex.init({ getCargoTarget: () => Math.max(0, Number(document.getElementById('logistics-cargo')?.value) || 0), formatCommodityLabel });
        setupDynamicStyles();
        setupSplash();
        setupRevealObserver();
        renderAll();
        setupNavLinks();
        setupMobileMenu();
        setupNoticeControls();
        setupLeadershipControls();
        setupShipControls();
        setupScheduleAccordion();
        setupLogisticsCalculator();
        setupUexLivePanel();
        setupGalleryInteractions();
        setupModalControls();
        setupPolicyAnchors();
        setupFaqAccordion();
        setupSearch();
        setupGlobalKeyboardShortcuts();
        setupScrollEffect();
        setupScrollTop();
        setupTheme();
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

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.VOLT_APP = { showSection, renderAll };
})();
