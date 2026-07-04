/**
 * VOLT 함선DB UI 계층 — main.js에서 분리.
 *
 * 함선 카드/필터칩/제조사·정렬·상세필터/상세 모달/비교 모달 렌더 및 컨트롤을 담당한다.
 * 함선 데이터 접근(인덱스·정렬·태그·표시명)과 공용 유틸은 main.js에서 init(deps)로 주입한다.
 * 로드 순서: trade-planner.js 다음, main.js 이전.
 */
(function () {
    'use strict';

    // main.js가 주입하는 의존성(이름 동일 → 이동 코드 무수정). shipById는 재할당되므로 getter.
    let currentLang, escapeHtml, i18nT, tx, formatShipPrice, getCargoValue,
        parseLargestNumber, parseSmallestNumber, getShipDisplayName, getShipSecondaryName,
        getShipTags, getShipFilterTags, getShipManufacturers, getVisibleShips,
        isPlannerEligibleShip, useShipInPlanner, isInHangar, toggleHangar,
        observeNewReveals, openModal, showToast, trackEvent, shipState, getShipById,
        RSI_SHIP_MATRIX_URL;

    function init(deps) {
        ({
            currentLang, escapeHtml, i18nT, tx, formatShipPrice, getCargoValue,
            parseLargestNumber, parseSmallestNumber, getShipDisplayName, getShipSecondaryName,
            getShipTags, getShipFilterTags, getShipManufacturers, getVisibleShips,
            isPlannerEligibleShip, useShipInPlanner, isInHangar, toggleHangar,
            observeNewReveals, openModal, showToast, trackEvent, shipState, getShipById,
            RSI_SHIP_MATRIX_URL,
        } = deps || {});
    }

    function shipCat(catKo) { return i18nT(`ship.cat.${catKo}`, catKo); }
    function shipTagsLocalized(ship) {
        const ko = Array.isArray(ship.tags) ? ship.tags : [];
        if (currentLang() === 'en' && Array.isArray(ship.tags_en) && ship.tags_en.length === ko.length) return ship.tags_en;
        return ko;
    }
    const shipCompareState = new Set();
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
            criterion_en: 'Prioritizes ships that can be operated solo or in small crews and are good for learning the basics.',
            useCase: '첫 구매, 복귀 유저, 1~2인 소규모 활동에 적합합니다.',
            useCase_en: 'Great for a first purchase, returning players, and 1–2 person activities.'
        },
        '화물': {
            criterion: 'SCU 적재량과 물류 운용성을 기준으로 추천합니다.',
            criterion_en: 'Recommended by SCU capacity and logistics usability.',
            useCase: '상업 운송, 반복 루트, 함대 보급 임무에 적합합니다.',
            useCase_en: 'Suited to commercial hauling, repeat routes, and fleet resupply.'
        },
        '탐사': {
            criterion: '탐사 또는 장거리 활동 태그를 가진 함선을 중심으로 묶습니다.',
            criterion_en: 'Groups ships tagged for exploration or long-range activity.',
            useCase: '장거리 항해, 정보 수집, 미지 구역 탐색에 적합합니다.',
            useCase_en: 'Suited to long-range voyages, intel gathering, and scouting unknown space.'
        },
        '인양': {
            criterion: '인양 역할을 가진 함선을 중심으로 추천합니다.',
            criterion_en: 'Recommends ships with a salvage role.',
            useCase: '난파선 회수, 자원 수거, 산업 플레이에 적합합니다.',
            useCase_en: 'Suited to wreck recovery, resource collection, and industrial play.'
        },
        '채굴': {
            criterion: '채굴 또는 정제 관련 함선을 중심으로 추천합니다.',
            criterion_en: 'Recommends ships related to mining or refining.',
            useCase: '광물 채집, 현장 정제, 산업 루프 확장에 적합합니다.',
            useCase_en: 'Suited to ore extraction, on-site refining, and scaling an industrial loop.'
        },
        '의료': {
            criterion: '의료 지원 역할을 가진 함선을 중심으로 추천합니다.',
            criterion_en: 'Recommends ships with a medical support role.',
            useCase: '구조, 전투 지원, 장거리 원정 보조에 적합합니다.',
            useCase_en: 'Suited to rescue, combat support, and long-range expedition backup.'
        }
    };
    function renderShipManufacturers() {
        const select = document.getElementById('ship-manufacturer');
        if (!select) return;
        select.innerHTML = [
            `<option value="all">${escapeHtml(i18nT('ships.mfrAll', '제조사 전체'))}</option>`,
            ...getShipManufacturers().map((manufacturer) => `<option value="${escapeHtml(manufacturer)}">${escapeHtml(manufacturer)}</option>`)
        ].join('');
        select.value = shipState.manufacturer;
    }
    function renderShipTagFilters() {
        const container = document.getElementById('ship-tag-filters');
        if (!container) return;
        const selectedTags = new Set(shipState.selectedTags);
        const allActive = selectedTags.size === 0 ? ' active' : '';
        const buttons = getShipFilterTags().map((tag) => {
            const active = selectedTags.has(tag) ? ' active' : '';
            // 필터 키(data-ship-tag-filter)는 KO를 유지하고 라벨만 번역한다.
            return `<button class="ship-filter-btn${active}" type="button" data-ship-tag-filter="${escapeHtml(tag)}" aria-pressed="${selectedTags.has(tag)}">${escapeHtml(shipCat(tag))}</button>`;
        });
        container.innerHTML = [
            `<button class="ship-filter-btn${allActive}" type="button" data-ship-tag-clear aria-pressed="${selectedTags.size === 0}">${escapeHtml(i18nT('ships.allTags', '전체'))}</button>`,
            ...buttons
        ].join('');
    }
    function renderShips() {
        const container = document.getElementById('ships-grid');
        if (!container) return;
        const ships = getVisibleShips();
        renderShipTagFilters();
        renderShipPurposeSummary(ships.length);
        if (ships.length === 0) {
            container.innerHTML = `<div class="ships-empty">${escapeHtml(i18nT('ships.empty', '검색 결과가 없습니다.'))}</div>`;
            return;
        }
        container.innerHTML = ships.map((ship) => `
            <article class="ship-card reveal" tabindex="0" role="button" data-ship-id="${escapeHtml(ship.id)}" aria-label="${escapeHtml(`${getShipDisplayName(ship)} ${i18nT('ships.viewDetail', '상세 보기')}`)}">
                <div class="ship-card-header">
                    <div>
                        <h3 class="ship-name">${escapeHtml(getShipDisplayName(ship))}</h3>
                        ${getShipSecondaryName(ship) ? `<span class="ship-name-en">${escapeHtml(getShipSecondaryName(ship))}</span>` : ''}
                        <span class="ship-mfr">${escapeHtml(ship.manufacturer)}</span>
                    </div>
                    <div class="ship-card-actions"><span class="ship-focus-badge" data-style-bg="${FOCUS_COLORS[ship.focus] || '#a0aec0'}22" data-style-color="${FOCUS_COLORS[ship.focus] || '#a0aec0'}">${escapeHtml(tx(ship, 'focus'))}</span>${renderHangarToggleButton(ship)}</div>
                </div>
                <p class="ship-desc">${escapeHtml(tx(ship, 'description'))}</p>
                <div class="ship-stats">
                    <div class="ship-stat"><span class="ship-stat-label">${escapeHtml(i18nT('ships.cargo', '\ud654\ubb3c'))}</span><span class="ship-stat-value">${escapeHtml(ship.cargo)}</span></div>
                    <div class="ship-stat"><span class="ship-stat-label">${escapeHtml(i18nT('ships.priceUsd', 'USD 가격'))}</span><span class="ship-stat-value">${escapeHtml(formatShipPrice(ship.priceUsd))}</span></div>
                </div>
                <div class="ship-tags">${shipTagsLocalized(ship).map((tag) => `<span class="ship-tag">${escapeHtml(tag)}</span>`).join('')}</div>
                ${renderShipPlannerButton(ship)}
                <button class="ship-compare-toggle${shipCompareState.has(ship.id) ? ' active' : ''}" type="button" data-compare-ship-id="${escapeHtml(ship.id)}" aria-pressed="${shipCompareState.has(ship.id)}">
                    ${escapeHtml(shipCompareState.has(ship.id) ? i18nT('ships.compareRemove', '비교 제거') : i18nT('ships.compareAdd', '비교 추가'))}
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
        summary.textContent = currentLang() === 'en' ? `${shipCompareState.size} / 3 selected` : `${shipCompareState.size} / 3척 선택`;
        bar.hidden = shipCompareState.size === 0;
        openButton.disabled = shipCompareState.size < 2;
    }
    function renderShipPlannerButton(ship) {
        if (!isPlannerEligibleShip(ship)) return '';
        return `<button class="ship-planner-toggle" type="button" data-use-planner-ship-id="${escapeHtml(ship.id)}">${escapeHtml(i18nT('ships.usePlanner', '\ubb34\uc5ed \ud50c\ub798\ub108\uc5d0\uc11c \uc0ac\uc6a9'))}</button>`;
    }
    function renderHangarToggleButton(ship, label = false) {
        const owned = isInHangar(ship.id);
        const title = owned ? i18nT('ships.hangarRemove', '\uaca9\ub0a9\uace0\uc5d0\uc11c \uc81c\uac70') : i18nT('ships.hangarAdd', '\uaca9\ub0a9\uace0\uc5d0 \ucd94\uac00');
        const text = label ? (owned ? i18nT('ships.hangarOwned', '\uaca9\ub0a9\uace0\uc5d0 \uc788\uc74c') : i18nT('ships.hangarAdd', '\uaca9\ub0a9\uace0\uc5d0 \ucd94\uac00')) : (owned ? '\u2605' : '\u2606');
        return `<button class="hangar-toggle-btn${owned ? ' owned' : ''}${label ? ' modal-hangar-btn' : ''}" type="button" data-hangar-ship-id="${escapeHtml(ship.id)}" aria-label="${title}" title="${title}">${text}</button>`;
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
        const ship = getShipById(openButton.getAttribute('data-open-ship-id'));
        if (ship) openShipModal(ship);
    }
    function handleHangarToggle(button) {
        const shipId = button.getAttribute('data-hangar-ship-id');
        const ship = getShipById(shipId);
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
        const purposeLabel = shipCat(shipState.purpose);
        const heading = currentLang() === 'en' ? `${purposeLabel} picks` : `${purposeLabel} 추천`;
        const countText = currentLang() === 'en' ? `${visibleCount} ships` : `${visibleCount}척`;
        container.innerHTML = `
            <strong>${escapeHtml(heading)}</strong>
            <p>${escapeHtml(tx(copy, 'criterion'))}</p>
            <div>
                <span>${escapeHtml(i18nT('ships.currentPicks', '현재 추천 함선'))}</span>
                <b>${escapeHtml(countText)}</b>
            </div>
            <small>${escapeHtml(tx(copy, 'useCase'))}</small>`;
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
        const ship = getShipById(card.getAttribute('data-ship-id'));
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
            showToast(i18nT('ships.compareMax', '함선 비교는 최대 3척까지 가능합니다.'));
        }
        renderShips();
    }
    function clearShipComparison() {
        shipCompareState.clear();
        renderShips();
    }
    function openShipComparison() {
        const ships = [...shipCompareState].map((id) => getShipById(id)).filter(Boolean);
        if (ships.length < 2) return;
        openModal(renderShipComparison(ships), true);
    }
    function renderShipComparison(ships) {
        const fields = [
            { label: i18nT('ships.mfr', '\uc81c\uc870\uc0ac'), key: 'manufacturer', format: (ship) => ship.manufacturer },
            { label: i18nT('ships.role', '\uc5ed\ud560'), key: 'role', format: (ship) => tx(ship, 'role') },
            { label: i18nT('ships.focus', '\ubd84\ub958'), key: 'focus', format: (ship) => tx(ship, 'focus') },
            { label: i18nT('ships.size', '\ud06c\uae30'), key: 'size', format: (ship) => tx(ship, 'size') },
            { label: i18nT('ships.crew', '\uc2b9\ubb34\uc6d0'), key: 'crew', format: (ship) => tx(ship, 'crew'), rawValue: (ship) => parseLargestNumber(ship.crew), numeric: true, higherIsBetter: true },
            { label: i18nT('ships.cargo', '\ud654\ubb3c'), key: 'cargo', format: (ship) => ship.cargo, rawValue: (ship) => getCargoValue(ship.cargo), numeric: true, higherIsBetter: true },
            { label: i18nT('ships.priceUsd', 'USD \uac00\uaca9'), key: 'priceUsd', format: (ship) => formatShipPrice(ship.priceUsd), rawValue: (ship) => Number(ship.priceUsd), numeric: true, higherIsBetter: false }
        ];
        return `<div class="modal-header">
                <div>
                    <span class="eyebrow">Ship Compare</span>
                    <h2>${escapeHtml(i18nT('ships.compareTitle', '\ud568\uc120 \ube44\uad50'))}</h2>
                </div>
                <button class="modal-close" type="button" aria-label="${escapeHtml(i18nT('ships.modalClose', '\ubaa8\ub2ec \ub2eb\uae30'))}">\u00d7</button>
            </div>
            <div class="modal-body">
                ${renderShipComparisonSummary(ships)}
                <div class="ship-compare-table-wrap">
                    <table class="ship-compare-table">
                        <thead>
                            <tr>
                                <th scope="col">${escapeHtml(i18nT('ships.compareField', '\ud56d\ubaa9'))}</th>
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
                        <div class="ship-tags">${shipTagsLocalized(ship).map((tag) => `<span class="ship-tag">${escapeHtml(tag)}</span>`).join('')}</div>
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
            <h3>${escapeHtml(i18nT('ships.compareSummary', '비교 요약'))}</h3>
            <div>
                ${renderComparisonSummaryItem(i18nT('ships.maxCargo', '최대 화물량'), cargoLeader)}
                ${renderComparisonSummaryItem(i18nT('ships.minCrew', '최소 인원 운용'), crewLeader)}
                ${renderComparisonSummaryItem(i18nT('ships.largeOps', '대형 작전'), largeOpsLeader)}
                ${renderComparisonSummaryItem(i18nT('ships.smallOps', '소규모/입문 운용'), smallOpsLeader)}
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
        if (tags.includes('화물')) notes.push(i18nT('ships.note.cargo', '물류/화물 운송 후보'));
        if (tags.includes('입문')) notes.push(i18nT('ships.note.starter', '입문자 운용 후보'));
        if (tags.includes('미구현')) notes.push(i18nT('ships.note.wip', '현재 실사용 주의'));
        if (notes.length === 0) return `<li><strong>${escapeHtml(ship.name)}</strong> · ${escapeHtml(i18nT('ships.note.specialized', '특화 태그 중심 운용'))}</li>`;
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
    function openShipModal(ship) {
        trackEvent('ship_modal_open', { shipId: ship?.id || '', shipName: ship?.name || '' });
        const officialUrl = getShipOfficialUrl(ship);
        const officialLabel = ship.rsiUrl ? i18nT('ships.officialPage', 'RSI 공식 페이지') : i18nT('ships.shipMatrix', 'RSI 함선 매트릭스');
        openModal(`<div class="modal-header">
                <div>
                    <div class="ship-mfr">${escapeHtml(ship.manufacturer)}</div>
                    <h2 class="modal-title">${escapeHtml(getShipDisplayName(ship))}</h2>
                    ${getShipSecondaryName(ship) ? `<p class="modal-subtitle-en">${escapeHtml(getShipSecondaryName(ship))}</p>` : ''}
                </div>
                <button class="modal-close" type="button" aria-label="${escapeHtml(i18nT('ships.modalClose', '모달 닫기'))}">×</button>
            </div>
            <div class="modal-body">
                <p>${escapeHtml(tx(ship, 'description'))}</p>
                <div class="ship-modal-grid">
                    <div class="ship-modal-stat"><span>${escapeHtml(i18nT('ships.role', '역할'))}</span><strong>${escapeHtml(tx(ship, 'role'))}</strong></div>
                    <div class="ship-modal-stat"><span>${escapeHtml(i18nT('ships.size', '크기'))}</span><strong>${escapeHtml(tx(ship, 'size'))}</strong></div>
                    <div class="ship-modal-stat"><span>${escapeHtml(i18nT('ships.crew', '승무원'))}</span><strong>${escapeHtml(tx(ship, 'crew'))}</strong></div>
                    <div class="ship-modal-stat"><span>${escapeHtml(i18nT('ships.cargo', '화물'))}</span><strong>${escapeHtml(ship.cargo)}</strong></div>
                    <div class="ship-modal-stat"><span>${escapeHtml(i18nT('ships.priceUsd', 'USD \uac00\uaca9'))}</span><strong>${escapeHtml(formatShipPrice(ship.priceUsd))}</strong></div>
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
        return `<button class="${escapeHtml(className)}" type="button" data-use-planner-ship-id="${escapeHtml(ship.id)}">${escapeHtml(i18nT('ships.usePlanner', '무역 플래너에서 사용'))}</button>`;
    }
    function getShipOfficialUrl(ship) {
        return ship.rsiUrl || RSI_SHIP_MATRIX_URL;
    }

    window.VOLT_SHIPS = {
        init,
        renderShips,
        renderShipManufacturers,
        setupShipControls,
        setupShipCompareControls,
        resetShipState,
        syncShipControls,
        openShipModal,
        openShipFromEvent,
        renderShipPurposeSummary,
    };
})();
