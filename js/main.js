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
    const shipState = { filter: 'all', manufacturer: 'all', hideUnreleased: false, query: '', sort: 'name-asc', purpose: '' };
    const SHIP_FILTER_ORDER = ['화물', '전투', '탐사', '인양', '채굴', '정제', '주유', '의료', '연구', '수송', '지원', '방송', '레이싱', '다목적', '입문', '기함', '미구현'];
    const RSI_SHIP_MATRIX_URL = 'https://robertsspaceindustries.com/ship-matrix';
    const UEX_API_BASE_URL = 'https://api.uexcorp.space/2.0';
    const UEX_CACHE_TTL_MS = { commodities: 60 * 60 * 1000, prices: 30 * 60 * 1000 };
    const shipById = new Map((data.ships || []).map((ship) => [ship.id, ship]));
    const shipCompareState = new Set();
    const uexCache = new Map();
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
            const imagePosition = streamer.imagePosition ? ` style="object-position:${escapeHtml(streamer.imagePosition)};"` : '';
            const icon = streamer.image
                ? `<img src="${escapeHtml(streamer.image)}" alt="${escapeHtml(streamer.name)}" loading="lazy" decoding="async"${imagePosition}>`
                : '<div class="streamer-icon-fallback">👤</div>';
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
        if (!container || !Array.isArray(data.gallery)) return;
        if (data.gallery.length === 0) {
            container.innerHTML = `
                <div class="gallery-empty">
                    <span class="gallery-empty-kicker">곧 공개될 활동 기록</span>
                    <p>VOLT의 작전과 항해 장면을 준비 중입니다.</p>
                    <ul>
                        <li>단체 작전 스크린샷</li>
                        <li>함선 편대와 물류 활동</li>
                        <li>행성 풍경과 이벤트 기록</li>
                    </ul>
                    <small>좋은 장면이 있다면 Discord에서 활동 사진 제보를 남겨 주세요.</small>
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
        return right.date.localeCompare(left.date);
    }

    function renderAnnouncements() {
        const container = document.getElementById('notices-list');
        const loadMore = document.getElementById('notice-load-more');
        if (!container || !loadMore) return;
        const colors = { '공지': 'var(--volt-orange)', '정책': '#e53e3e', '작전': '#3182ce', '시스템': '#38a169' };
        const items = getFilteredAnnouncements();
        const visibleItems = items.slice(0, noticeState.visibleCount);
        container.innerHTML = visibleItems.map((announcement) => `
            <button class="notice-card${announcement.pinned ? ' notice-card-pinned' : ''} reveal" type="button" data-notice-id="${escapeHtml(announcement.id)}" aria-label="${escapeHtml(announcement.title)} 상세 보기">
                <div class="notice-meta">
                    ${announcement.pinned ? '<span class="notice-pin">고정</span>' : ''}
                    <span class="notice-tag" style="background:${colors[announcement.tag] || 'var(--volt-orange)'}20;color:${colors[announcement.tag] || 'var(--volt-orange)'};">${escapeHtml(announcement.tag)}</span>
                    <span class="notice-date">${escapeHtml(announcement.date)}</span>
                </div>
                <h3 class="notice-title">${escapeHtml(announcement.title)}</h3>
                <p class="notice-content">${escapeHtml(announcement.content)}</p>
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
            '<option value="all">전체</option>',
            ...getShipManufacturers().map((manufacturer) => `<option value="${escapeHtml(manufacturer)}">${escapeHtml(manufacturer)}</option>`)
        ].join('');
        select.value = shipState.manufacturer;
    }

    function renderShipFilters() {
        const container = document.getElementById('ship-filters');
        if (!container) return;
        const filters = ['all', ...getShipFilterTags()];
        container.innerHTML = filters.map((filter) => {
            const label = filter === 'all' ? '전체' : filter;
            const active = filter === shipState.filter ? ' active' : '';
            return `<button class="ship-filter-btn${active}" type="button" data-filter="${escapeHtml(filter)}">${escapeHtml(label)}</button>`;
        }).join('');
    }

    function getVisibleShips() {
        const query = shipState.query.trim().toLowerCase();
        return getSortedShips().filter((ship) => {
            const tags = getShipTags(ship);
            const matchesFilter = shipState.filter === 'all' || ship.focus === shipState.filter || tags.includes(shipState.filter);
            const matchesManufacturer = shipState.manufacturer === 'all' || ship.manufacturer === shipState.manufacturer;
            const matchesReleaseState = !shipState.hideUnreleased || !tags.includes('미구현');
            const haystack = buildShipSearchText(ship, tags);
            return matchesFilter && matchesManufacturer && matchesReleaseState && (!query || haystack.includes(query));
        });
    }

    function getShipTags(ship) {
        return Array.isArray(ship.tags) ? ship.tags : [];
    }

    function buildShipSearchText(ship, tags = getShipTags(ship)) {
        return [ship.name, ship.manufacturer, ship.role, ship.focus, ship.description, formatShipPrice(ship.priceUsd), ...tags].join(' ').toLowerCase();
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
        renderShipPurposeSummary(ships.length);
        if (ships.length === 0) {
            container.innerHTML = '<div class="ships-empty">검색 결과가 없습니다.</div>';
            return;
        }
        const focusColors = {
            '물류': '#f6ad55',
            '전투': '#fc8181',
            '탐사': '#68d391',
            '채굴': '#76e4f7',
            '연구': '#90cdf4',
            '정제': '#fbd38d',
            '인양': '#d6bcfa',
            '방송': '#f687b3',
            '주유': '#63b3ed',
            '의료': '#68d391',
            '입문': '#a0aec0',
            '화물': '#f6ad55',
            '물류/전투': '#f56565',
            '물류/모듈': '#ed8936',
            'VIP 여행용': '#f6e05e',
            '지상 차량': '#a0aec0',
            '채굴/정제': '#4fd1c5'
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
                    <div class="ship-stat"><span class="ship-stat-label">USD 가격</span><span class="ship-stat-value">${escapeHtml(formatShipPrice(ship.priceUsd))}</span></div>
                </div>
                <div class="ship-tags">${getShipTags(ship).map((tag) => `<span class="ship-tag">${escapeHtml(tag)}</span>`).join('')}</div>
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
                <div class="guide-icon">${escapeHtml(guide.icon)}</div>
                <h3>${escapeHtml(guide.title)}</h3>
                <p>${escapeHtml(guide.content)}</p>
            </div>`).join('');
        renderLogisticsShipOptions();
    }

    function getLogisticsShips() {
        return (data.ships || [])
            .filter((ship) => getCargoValue(ship.cargo) > 0)
            .sort((left, right) => getCargoValue(right.cargo) - getCargoValue(left.cargo) || compareText(left.name, right.name));
    }

    function renderLogisticsShipOptions() {
        const select = document.getElementById('logistics-ship');
        if (!select) return;
        select.innerHTML = `<option value="">보유 함선 선택</option>${getLogisticsShips().map((ship) => (
            `<option value="${escapeHtml(ship.id)}">${escapeHtml(ship.name)} · ${escapeHtml(ship.cargo)}</option>`
        )).join('')}`;
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
        renderJoinChecklist();
        renderFooterStreamers();
        renderNoticeFilters();
        renderAnnouncements();
        renderShipFilters();
        renderShipManufacturers();
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
        if (id === 'notices') openNoticeFromQuery();
    }

    function openNoticeFromQuery() {
        const noticeId = new URLSearchParams(window.location.search).get('notice');
        const notice = noticeId ? findAnnouncement(noticeId) : null;
        if (notice) openNoticeModal(notice);
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
                closeMoreMenu();
            });
        });
        setupMoreMenu();
    }

    function setupMoreMenu() {
        const toggle = document.getElementById('nav-more-toggle');
        const menu = document.getElementById('nav-more-menu');
        if (!toggle || !menu) return;
        toggle.addEventListener('click', () => {
            const expanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!expanded));
            menu.classList.toggle('active', !expanded);
            document.body.classList.toggle('nav-more-open', !expanded);
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.nav-more')) closeMoreMenu();
        });
    }

    function closeMoreMenu() {
        const toggle = document.getElementById('nav-more-toggle');
        const menu = document.getElementById('nav-more-menu');
        if (!toggle || !menu) return;
        toggle.setAttribute('aria-expanded', 'false');
        menu.classList.remove('active');
        document.body.classList.remove('nav-more-open');
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
            if (!menu.classList.contains('active')) return;
            if (event.key === 'Escape') close();
            if (event.key === 'Tab') trapFocus(menu, event);
        });
    }

    function setMobileMenuState(menu, button, isOpen) {
        menu.classList.toggle('active', isOpen);
        button.setAttribute('aria-expanded', String(isOpen));
        document.body.style.overflow = isOpen ? 'hidden' : '';
        if (isOpen) {
            menu.dataset.returnFocusId = document.activeElement?.id || '';
            getFocusableElements(menu)[0]?.focus();
        } else {
            const returnTarget = menu.dataset.returnFocusId ? document.getElementById(menu.dataset.returnFocusId) : button;
            returnTarget?.focus();
        }
    }

    function getFocusableElements(container) {
        return [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
            .filter((element) => !element.hasAttribute('hidden'));
    }

    function trapFocus(container, event) {
        const focusable = getFocusableElements(container);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
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
                    <span class="notice-date">${escapeHtml(announcement.date)}</span>
                </div>
                <p>${escapeHtml(announcement.content)}</p>
                <button class="btn btn-secondary notice-copy-link" type="button" data-copy-notice-id="${escapeHtml(announcement.id)}">공지 링크 복사</button>
            </div>`);
    }

    function setupShipControls() {
        const filters = document.querySelector('.ship-filters');
        const search = document.getElementById('ship-search');
        const manufacturer = document.getElementById('ship-manufacturer');
        const hideUnreleased = document.getElementById('ship-hide-unreleased');
        const sort = document.getElementById('ship-sort');
        const grid = document.getElementById('ships-grid');
        const purpose = document.getElementById('ship-purpose');
        const purposeApply = document.getElementById('ship-purpose-apply');
        const purposeReset = document.getElementById('ship-purpose-reset');
        if (!filters || !search || !manufacturer || !hideUnreleased || !sort || !grid || !purpose || !purposeApply || !purposeReset) return;
        filters.addEventListener('click', handleShipFilterClick);
        search.addEventListener('input', () => { shipState.query = search.value; renderShips(); });
        manufacturer.addEventListener('change', () => { shipState.manufacturer = manufacturer.value; renderShips(); });
        hideUnreleased.addEventListener('change', () => { shipState.hideUnreleased = hideUnreleased.checked; renderShips(); });
        sort.addEventListener('change', () => { shipState.sort = sort.value; renderShips(); });
        grid.addEventListener('click', openShipFromEvent);
        grid.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') openShipFromEvent(event);
        });
        purposeApply.addEventListener('click', () => applyShipPurpose(purpose.value));
        purposeReset.addEventListener('click', () => applyShipPurpose(''));
        setupShipCompareControls();
    }

    function applyShipPurpose(purpose) {
        shipState.purpose = purpose;
        shipState.filter = purpose || 'all';
        renderShipFilters();
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
        const controls = [
            document.getElementById('trade-operation-type'),
            document.getElementById('logistics-cargo'),
            document.getElementById('logistics-ship'),
            document.getElementById('logistics-crew'),
            document.getElementById('trade-risk')
        ].filter(Boolean);
        if (!button || !copyButton) return;
        button.addEventListener('click', renderLogisticsRecommendation);
        copyButton.addEventListener('click', copyTradeBriefing);
        controls.forEach((control) => {
            control.addEventListener('change', renderLogisticsRecommendation);
            if (control.tagName === 'INPUT') control.addEventListener('input', renderLogisticsRecommendation);
        });
        renderLogisticsRecommendation();
    }

    function setupUexLivePanel() {
        const select = document.getElementById('uex-commodity-select');
        const button = document.getElementById('uex-refresh');
        if (!select || !button) return;
        select.addEventListener('change', () => button.disabled = !select.value);
        button.addEventListener('click', () => renderUexCommodityCandidates(select.value));
        loadUexCommodities();
    }

    async function loadUexCommodities() {
        const select = document.getElementById('uex-commodity-select');
        const status = document.getElementById('uex-status');
        if (!select || !status) return;
        try {
            const commodities = await fetchUexData('commodities', UEX_CACHE_TTL_MS.commodities);
            const visible = commodities.filter((item) => item.is_visible && item.is_available_live);
            select.innerHTML = `<option value="">상품 선택</option>${visible.map((item) => (
                `<option value="${escapeHtml(String(item.id))}">${escapeHtml(item.name)}</option>`
            )).join('')}`;
            select.disabled = false;
            status.textContent = `상품 ${visible.length}종을 불러왔습니다.`;
        } catch (error) {
            select.innerHTML = '<option value="">상품 목록을 불러오지 못했습니다</option>';
            status.textContent = 'UEX API 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.';
        }
    }

    async function renderUexCommodityCandidates(commodityId) {
        const status = document.getElementById('uex-status');
        const results = document.getElementById('uex-results');
        if (!commodityId || !status || !results) return;
        status.textContent = '거래 후보를 조회하는 중입니다...';
        results.innerHTML = '';
        try {
            const prices = await fetchUexData(`commodities_prices?id_commodity=${encodeURIComponent(commodityId)}`, UEX_CACHE_TTL_MS.prices);
            const model = buildUexCandidateModel(prices);
            results.innerHTML = renderUexCandidateCards(model);
            status.textContent = model.lastUpdatedLabel;
        } catch (error) {
            status.textContent = 'UEX API 응답을 받지 못했습니다. UEX Corp에서 직접 확인해 주세요.';
        }
    }

    async function fetchUexData(path, ttlMs) {
        const cacheKey = path;
        const cached = uexCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < ttlMs) return cached.data;
        const response = await fetch(`${UEX_API_BASE_URL}/${path}`);
        if (!response.ok) throw new Error(`UEX ${response.status}`);
        const payload = await response.json();
        if (payload.status !== 'ok' || !Array.isArray(payload.data)) throw new Error('Invalid UEX payload');
        uexCache.set(cacheKey, { data: payload.data, timestamp: Date.now() });
        return payload.data;
    }

    function buildUexCandidateModel(prices) {
        const buyRows = prices.filter((row) => row.price_buy > 0);
        const sellRows = prices.filter((row) => row.price_sell > 0);
        const bestBuy = getBestUexRow(buyRows, 'price_buy', 'min');
        const bestSell = getBestUexRow(sellRows, 'price_sell', 'max');
        const selectedShip = shipById.get(document.getElementById('logistics-ship')?.value);
        const cargoCapacity = selectedShip ? getCargoValue(selectedShip.cargo) : 0;
        const cargoTarget = Math.max(0, Number(document.getElementById('logistics-cargo')?.value) || cargoCapacity);
        const usableScu = Math.min(cargoCapacity || cargoTarget, cargoTarget || cargoCapacity);
        const profitPerScu = bestBuy && bestSell ? Math.max(0, bestSell.price_sell - bestBuy.price_buy) : 0;
        const lastUpdated = prices.length ? Math.max(...prices.map((row) => row.date_modified || 0)) : 0;
        return {
            commodityName: prices[0]?.commodity_name || '선택 상품',
            bestBuy,
            bestSell,
            usableScu,
            profitPerScu,
            estimatedProfit: profitPerScu * usableScu,
            lastUpdatedLabel: lastUpdated
                ? `최근 갱신: ${new Date(lastUpdated * 1000).toLocaleString('ko-KR')}`
                : '최근 갱신 시각을 확인할 수 없습니다.'
        };
    }

    function getBestUexRow(rows, field, direction) {
        return [...rows].sort((left, right) => direction === 'min' ? left[field] - right[field] : right[field] - left[field])[0] || null;
    }

    function renderUexCandidateCards(model) {
        if (!model.bestBuy || !model.bestSell) {
            return '<div class="uex-empty">현재 표시할 매수·매도 후보가 없습니다.</div>';
        }
        return `
            <article>
                <span>최저 매수 후보</span>
                <strong>${escapeHtml(formatUexLocation(model.bestBuy))}</strong>
                <b>${escapeHtml(formatCredits(model.bestBuy.price_buy))} / SCU</b>
            </article>
            <article>
                <span>최고 매도 후보</span>
                <strong>${escapeHtml(formatUexLocation(model.bestSell))}</strong>
                <b>${escapeHtml(formatCredits(model.bestSell.price_sell))} / SCU</b>
            </article>
            <article>
                <span>${escapeHtml(model.commodityName)} 예상 수익</span>
                <strong>${escapeHtml(formatCredits(model.profitPerScu))} / SCU</strong>
                <b>${escapeHtml(String(model.usableScu))} SCU 기준 ${escapeHtml(formatCredits(model.estimatedProfit))}</b>
            </article>`;
    }

    function formatUexLocation(row) {
        return [row.terminal_name, row.city_name, row.planet_name].filter(Boolean).join(' · ');
    }

    function formatCredits(value) {
        return `${Math.round(value).toLocaleString('ko-KR')} aUEC`;
    }

    function renderLogisticsRecommendation() {
        const cargoInput = document.getElementById('logistics-cargo');
        const crewInput = document.getElementById('logistics-crew');
        const shipSelect = document.getElementById('logistics-ship');
        const operationSelect = document.getElementById('trade-operation-type');
        const riskSelect = document.getElementById('trade-risk');
        const result = document.getElementById('logistics-result');
        const copyButton = document.getElementById('trade-briefing-copy');
        if (!cargoInput || !crewInput || !shipSelect || !operationSelect || !riskSelect || !result) return;
        const cargoTarget = Math.max(0, Number(cargoInput.value) || 0);
        const crewAvailable = Math.max(1, Number(crewInput.value) || 0);
        const selectedShip = shipById.get(shipSelect.value);
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
            <div class="logistics-result-main">
                <strong>${escapeHtml(recommendation.title)}</strong>
                <p>${escapeHtml(recommendation.summary)}</p>
            </div>
            <div class="logistics-result-grid">
                <div><span>추천 출격</span><strong>${escapeHtml(recommendation.sorties)}</strong></div>
                <div><span>필요 운송 인원</span><strong>${escapeHtml(recommendation.transportCrew)}</strong></div>
                <div><span>남는 인원</span><strong>${escapeHtml(recommendation.supportCrew)}</strong></div>
                <div><span>적재 여유</span><strong>${escapeHtml(recommendation.buffer)}</strong></div>
            </div>
            <div class="trade-result-columns">
                ${renderShipSuitabilityCard(recommendation)}
                ${renderRolePlanCard(recommendation)}
            </div>
            <p class="logistics-result-note">${escapeHtml(recommendation.note)}</p>`;
        renderTradeChecklist(recommendation);
        renderTradeBriefing(recommendation);
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
            sorties: `${sorties}회`,
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
        field.value = [
            `[VOLT 무역 작전 모집] ${getOperationLabel(recommendation.operationType)}`,
            `작전 유형: ${getOperationLabel(recommendation.operationType)}`,
            `작전 적합도: ${recommendation.fit.label} - ${recommendation.fit.summary}`,
            `위험도: ${getRiskLabel(recommendation.risk)}`,
            `운송 목표: ${recommendation.cargoTarget.toLocaleString()} SCU`,
            `주력 함선: ${recommendation.ship.name} (${recommendation.ship.cargo})`,
            `예상 출격 횟수: ${recommendation.sorties}`,
            `모집/참여 인원: ${recommendation.crewAvailable}명`,
            ``,
            `필요 역할`,
            `- 운송 담당 ${recommendation.rolePlan.transport}명`,
            `- 루트 확인 담당 ${recommendation.rolePlan.route}명`,
            `- 호위 담당 ${recommendation.rolePlan.escort}명`,
            `- 정찰/예비 ${recommendation.rolePlan.reserve}명`,
            `- 적재/하역 보조 ${recommendation.rolePlan.cargoAssist}명`,
            ``,
            `사전 확인`,
            ...TRADE_OPERATION_CONFIG[recommendation.operationType].toolSteps.map((item, index) => `${index + 1}. ${item}`),
            `${TRADE_OPERATION_CONFIG[recommendation.operationType].toolSteps.length + 1}. 집결 시각과 역할 배정은 Discord에서 확정`,
            ``,
            `주의사항`,
            ...recommendation.fit.reasons.map((reason) => `- ${reason}`),
            `- ${recommendation.note}`
        ].join('\n');
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

    function parseSmallestNumber(value) {
        const matches = String(value).match(/\d+/g);
        return matches ? Number(matches[0]) : 1;
    }

    function resetShipState() {
        shipState.filter = 'all';
        shipState.manufacturer = 'all';
        shipState.hideUnreleased = false;
        shipState.query = '';
        shipState.sort = 'name-asc';
        shipState.purpose = '';
        syncShipControls();
        renderShipFilters();
        renderShips();
    }

    function syncShipControls() {
        const search = document.getElementById('ship-search');
        const manufacturer = document.getElementById('ship-manufacturer');
        const hideUnreleased = document.getElementById('ship-hide-unreleased');
        const sort = document.getElementById('ship-sort');
        const purpose = document.getElementById('ship-purpose');
        if (search) search.value = shipState.query;
        if (manufacturer) manufacturer.value = shipState.manufacturer;
        if (hideUnreleased) hideUnreleased.checked = shipState.hideUnreleased;
        if (sort) sort.value = shipState.sort;
        if (purpose) purpose.value = shipState.purpose;
    }

    function handleShipFilterClick(event) {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        document.querySelectorAll('.ship-filter-btn').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        shipState.filter = button.getAttribute('data-filter');
        shipState.purpose = '';
        renderShips();
    }

    function openShipFromEvent(event) {
        if (event.target.closest('[data-compare-ship-id]')) return;
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
            ['제조사', 'manufacturer'],
            ['역할', 'role'],
            ['분류', 'focus'],
            ['크기', 'size'],
            ['승무원', 'crew'],
            ['화물', 'cargo'],
            ['USD 가격', 'priceUsd']
        ];
        return `<div class="modal-header">
                <div>
                    <span class="eyebrow">Ship Compare</span>
                    <h2>함선 비교</h2>
                </div>
                <button class="modal-close" type="button" aria-label="모달 닫기">×</button>
            </div>
            <div class="modal-body">
                ${renderShipComparisonSummary(ships)}
                <div class="ship-compare-table-wrap">
                    <table class="ship-compare-table">
                        <thead>
                            <tr>
                                <th scope="col">항목</th>
                                ${ships.map((ship) => `<th scope="col">${escapeHtml(ship.name)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${fields.map(([label, key]) => renderComparisonRow(label, key, ships)).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="ship-compare-tags">
                    ${ships.map((ship) => `<section>
                        <h3>${escapeHtml(ship.name)}</h3>
                        <div class="ship-tags">${getShipTags(ship).map((tag) => `<span class="ship-tag">${escapeHtml(tag)}</span>`).join('')}</div>
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

    function renderComparisonRow(label, key, ships) {
        const values = ships.map((ship) => ship[key]);
        const differs = new Set(values).size > 1;
        return `<tr class="${differs ? 'is-different' : ''}">
            <th scope="row">${escapeHtml(label)}</th>
            ${values.map((value) => `<td>${escapeHtml(key === 'priceUsd' ? formatShipPrice(value) : value)}</td>`).join('')}
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
        const officialUrl = getShipOfficialUrl(ship);
        const officialLabel = ship.rsiUrl ? 'RSI 공식 페이지' : 'RSI 함선 매트릭스';
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
                    <div class="ship-modal-stat"><span>USD 가격</span><strong>${escapeHtml(formatShipPrice(ship.priceUsd))}</strong></div>
                </div>
                <a class="btn btn-primary ship-modal-link" href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(officialLabel)}</a>
            </div>`);
    }

    function getShipOfficialUrl(ship) {
        return ship.rsiUrl || RSI_SHIP_MATRIX_URL;
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
        const original = button.textContent;
        button.textContent = '✓';
        window.setTimeout(() => { button.textContent = original; }, 1200);
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
            ...data.ships.map((item) => makeSearchItem('함선', 'ships', item.name, `${item.manufacturer} ${item.role} ${item.description}`, item.id)),
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
            if (event.key === 'Escape') {
                if (searchOverlay?.classList.contains('active')) closeSearch(searchOverlay, document.getElementById('global-search-input'));
                else if (activeModal) closeModal();
                else closeMoreMenu();
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

    function init() {
        setupSplash();
        setupRevealObserver();
        renderAll();
        setupNavLinks();
        setupMobileMenu();
        setupNoticeControls();
        setupShipControls();
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
    }

    function getInitialRoute() {
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation?.type === 'reload') {
            return { section: 'home', anchorId: null, url: `${window.location.pathname}${window.location.search}` };
        }
        const route = parseRouteFromHash();
        return { ...route, url: window.location.href };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.VOLT_APP = { showSection, renderAll };
})();
