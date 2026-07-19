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
        getShipTags, getShipFilterTags, getShipManufacturers, getVisibleShips, shipManufacturerLabel,
        isPlannerEligibleShip, useShipInPlanner, isInHangar, toggleHangar,
        observeNewReveals, openModal, showToast, trackEvent, shipState, getShipById,
        RSI_SHIP_MATRIX_URL, ensureShipLiveData;

    function init(deps) {
        ({
            currentLang, escapeHtml, i18nT, tx, formatShipPrice, getCargoValue,
            parseLargestNumber, parseSmallestNumber, getShipDisplayName, getShipSecondaryName,
            getShipTags, getShipFilterTags, getShipManufacturers, getVisibleShips, shipManufacturerLabel,
            isPlannerEligibleShip, useShipInPlanner, isInHangar, toggleHangar,
            observeNewReveals, openModal, showToast, trackEvent, shipState, getShipById,
            RSI_SHIP_MATRIX_URL, ensureShipLiveData,
        } = deps || {});
    }

    function shipCat(catKo) { return i18nT(`ship.cat.${catKo}`, catKo); }

    // 재작성 2단계 듀얼리드: 플래그 ON이면 canonical 경로(priceUsd는 공개 모델에서 제거, D4).
    // OFF(기본)에서는 레거시 그대로 — 라이브 불변.
    function canonicalOn() {
        return !!(window.VOLT_SHIPDB_CANONICAL && window.VOLT_SHIPDB_CANONICAL.isEnabled());
    }
    function canonicalShip(ship) {
        return (canonicalOn() && window.VOLT_SHIPDB_CANONICAL) ? window.VOLT_SHIPDB_CANONICAL.getShip(ship.id) : null;
    }
    function isRsiOfficialShip(ship) {
        return canonicalShip(ship)?.source === 'rsi-official';
    }
    function officialMissingValue() {
        return i18nT('ships.officialNotProvided', 'RSI 공식 미제공');
    }
    function displayedManufacturer(ship) {
        return shipManufacturerLabel ? shipManufacturerLabel(ship) : ship.manufacturer;
    }
    function rsiStatusLabel(ship) {
        const status = canonicalShip(ship)?.catalogStatus;
        if (status === 'flight-ready') return i18nT('ships.rsiFlightReady', '출시 · RSI 공식 사양');
        return i18nT('ships.rsiConcept', '컨셉 · RSI 공식 사양 · 변경 가능');
    }
    function rsiCardStatusLabel(ship) {
        const status = canonicalShip(ship)?.catalogStatus;
        if (status === 'flight-ready') return i18nT('ships.rsiFlightReadyShort', '출시 · RSI 공식');
        return i18nT('ships.rsiConceptShort', '컨셉 · RSI 공식');
    }
    function rsiSizeDisplay(ship) {
        const size = canonicalShip(ship)?.size;
        const labels = { small: '소형', medium: '중형', large: '대형', capital: '캐피탈', vehicle: '지상' };
        return currentLang() === 'en' ? (size || ship.size) : (labels[size] || ship.size);
    }
    // crew 이관(D3): ON이면 Erkul live.crewSize(단일 숫자)를 공개 기준값으로. OFF는 레거시 수기값.
    function crewDisplay(ship) {
        const c = canonicalShip(ship);
        if (c?.source === 'rsi-official') {
            if (c.crewMin == null && c.crewMax == null) return officialMissingValue();
            if (c.crewMin === c.crewMax) return String(c.crewMin);
            return [c.crewMin, c.crewMax].filter((value) => value != null).join('–');
        }
        return c && c.crewSize != null ? String(c.crewSize) : tx(ship, 'crew');
    }
    function crewMax(ship) {
        const c = canonicalShip(ship);
        if (c?.source === 'rsi-official') return c.crewMax ?? c.crewMin ?? 0;
        return c && c.crewSize != null ? c.crewSize : parseLargestNumber(ship.crew);
    }
    function crewMin(ship) {
        const c = canonicalShip(ship);
        if (c?.source === 'rsi-official') return c.crewMin ?? c.crewMax ?? 0;
        return c && c.crewSize != null ? c.crewSize : parseSmallestNumber(ship.crew);
    }
    // cargo 이관: ON이면 Erkul live.cargoScu를 공개 기준값으로(포맷은 레거시와 동일 "N SCU"·콤마 유지).
    // 값은 219척 전부 레거시와 일치(불일치 0)이므로 표시 불변, 출처만 canonical.
    function cargoDisplay(ship) {
        const c = canonicalShip(ship);
        if (c?.source === 'rsi-official') return Number.isFinite(c.cargoScu) ? `${c.cargoScu.toLocaleString('en-US')} SCU` : officialMissingValue();
        return c && c.cargoScu != null ? `${c.cargoScu.toLocaleString('en-US')} SCU` : ship.cargo;
    }
    function cargoValueNum(ship) {
        const c = canonicalShip(ship);
        if (c?.source === 'rsi-official') return Number.isFinite(c.cargoScu) ? c.cargoScu : 0;
        return c && c.cargoScu != null ? c.cargoScu : getCargoValue(ship.cargo);
    }
    // role 이관(PM): ON이면 canonical role(Erkul EN)만 사용. career 조합·VOLT 수기·추론 금지.
    function canonicalRole(ship) {
        const c = canonicalShip(ship);
        return c && c.role ? c.role : null;
    }
    // 표시용 role. OFF: 레거시 tx(ship,'role'). ON: EN 로케일=canonical EN 그대로, KO=사실 불변 UI 번역(roleKo).
    // canonical role이 없으면 '' → 배지·표시에서 제외(라이브 219/219 보유라 방어적).
    function roleDisplay(ship) {
        if (!canonicalOn()) return tx(ship, 'role');
        const en = canonicalRole(ship);
        if (!en) return '';
        return roleLabel(en);
    }
    // Erkul EN role 문자열의 표시 라벨(필터 칩 등). EN 로케일=원문, 그 외=roleKo(사실 불변 번역).
    function roleLabel(enRole) {
        if (!enRole) return '';
        if (currentLang() === 'en') return enRole;
        const ko = window.VOLT_SHIPDB_CANONICAL && window.VOLT_SHIPDB_CANONICAL.roleKo(enRole);
        return ko || enRole;
    }
    // ON role 필터 값 = canonical role 집합(EN, 정렬)에서만. 미로드/OFF면 빈 배열.
    function canonicalRoleFilterValues() {
        const list = (canonicalOn() && window.VOLT_SHIPDB_CANONICAL) ? window.VOLT_SHIPDB_CANONICAL.roleList() : null;
        return Array.isArray(list) ? list : [];
    }
    // ── 커밋 C: 2축(규모·플랫폼 + 역할) 태그 분류. 사실원 = canonical size·platform·role + taxonomy 매핑. ──
    function taxo() { return (canonicalOn() && window.VOLT_SHIPDB_CANONICAL) ? window.VOLT_SHIPDB_CANONICAL.taxonomy() : null; }
    // 규모·플랫폼 축: 지상 차량은 '지상', 그 외는 size 태그(캐피탈/대형/중형/소형). 카드 태그 1개.
    function shipSizeTag(ship) {
        const t = taxo(); const c = canonicalShip(ship);
        if (!t || !c) return null;
        if (c.platform === 'ground') return 'ground';
        return t.axes.size.map[c.size] || c.size || null;
    }
    // 역할 축: canonical role → 역할 태그[](다중). 매핑 없으면 [].
    function shipRoleTags(ship) {
        const t = taxo(); const c = canonicalShip(ship);
        if (!t || !c || !c.role) return [];
        return t.roleTagMap[c.role] || [];
    }
    // 태그 라벨(로케일). axis: 'size'(+ground) | 'role'.
    function taxoTagLabel(axis, key) {
        const t = taxo(); if (!t) return key;
        const en = currentLang() === 'en';
        if (axis === 'size') {
            if (key === 'ground') return en ? t.axes.size.platform.en : t.axes.size.platform.ko;
            const tag = t.axes.size.tags.find((x) => x.key === key);
            return tag ? (en ? tag.en : tag.ko) : key;
        }
        const tag = t.axes.role.tags.find((x) => x.key === key);
        return tag ? (en ? tag.en : tag.ko) : key;
    }
    // 규모·플랫폼 축 태그 키(표시 순서). 지상은 지상 함선이 있을 때만.
    function sizeAxisTagKeys() {
        const t = taxo(); if (!t) return [];
        const hasGround = (t.summary.platformCount && t.summary.platformCount.ground > 0);
        return t.axes.size.order.filter((k) => (k === 'ground' ? hasGround : true));
    }
    // 역할 축 태그 키(표시 순서). 결과 0인 태그(예: 정제)는 숨긴다.
    function roleAxisTagKeys() {
        const t = taxo(); if (!t) return [];
        const count = t.audit && t.audit.roleTagShipCount ? t.audit.roleTagShipCount : {};
        return t.axes.role.order.filter((k) => (count[k] || 0) > 0);
    }
    // 카드 태그(ON): 규모·플랫폼 1 + 역할군 최대 2. 세부 역할은 별도 메타 행에서 렌더한다.
    function renderCardTags(ship) {
        const parts = [];
        if (isRsiOfficialShip(ship)) {
            const status = canonicalShip(ship).catalogStatus || 'concept';
            const fullLabel = rsiStatusLabel(ship);
            parts.push(`<span class="ship-rsi-status ship-rsi-status-${escapeHtml(status)}" title="${escapeHtml(fullLabel)}" aria-label="${escapeHtml(fullLabel)}">${escapeHtml(rsiCardStatusLabel(ship))}</span>`);
        }
        const sizeTag = shipSizeTag(ship);
        if (sizeTag) parts.push(`<span class="ship-tag-size">${escapeHtml(taxoTagLabel('size', sizeTag))}</span>`);
        for (const k of shipRoleTags(ship).slice(0, 2)) parts.push(`<span class="ship-tag-role">${escapeHtml(taxoTagLabel('role', k))}</span>`);
        return parts.join('');
    }
    function normalizeRoleLabel(value) {
        return String(value || '').trim().toLocaleLowerCase();
    }
    // 역할군 태그와 같은 세부 역할은 중복 표기하지 않는다. 예: Racing 태그 + Racing 원문 역할.
    function renderCardRoleDetail(ship) {
        const detail = roleDisplay(ship);
        if (!detail) return '';
        const tagLabels = shipRoleTags(ship).slice(0, 2).map((key) => taxoTagLabel('role', key));
        if (tagLabels.some((label) => normalizeRoleLabel(label) === normalizeRoleLabel(detail))) return '';
        return `<div class="ship-card-role-detail">${escapeHtml(detail)}</div>`;
    }
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
            ...getShipManufacturers().map((manufacturer) => `<option value="${escapeHtml(manufacturer.key)}">${escapeHtml(manufacturer.label)}</option>`)
        ].join('');
        select.value = shipState.manufacturer;
    }
    function renderShipTagFilters() {
        const container = document.getElementById('ship-tag-filters');
        if (!container) return;
        // ON: 2축 태그(규모·플랫폼 + 역할) + 세부 역할 검색 콤보박스(커밋 C).
        if (canonicalOn()) { renderShipFilters2Axis(container); return; }
        // OFF: 레거시 focus/tags 카테고리 칩 — 완전 불변.
        const values = getShipFilterTags();
        if (values.length === 0) { container.replaceChildren(); container.hidden = true; return; }
        container.hidden = false;
        const selectedTags = new Set(shipState.selectedTags);
        const allActive = selectedTags.size === 0 ? ' active' : '';
        const buttons = values.map((value) => {
            const active = selectedTags.has(value) ? ' active' : '';
            return `<button class="ship-filter-btn${active}" type="button" data-ship-tag-filter="${escapeHtml(value)}" aria-pressed="${selectedTags.has(value)}">${escapeHtml(shipCat(value))}</button>`;
        });
        container.innerHTML = [
            `<button class="ship-filter-btn${allActive}" type="button" data-ship-tag-clear aria-pressed="${selectedTags.size === 0}">${escapeHtml(i18nT('ships.allTags', '전체'))}</button>`,
            ...buttons
        ].join('');
    }

    // ── ON 전용: 2축 태그(규모·플랫폼 + 역할) + 세부 역할 검색 콤보박스 (커밋 C) ──────────
    // 규칙: 같은 축 복수 태그 OR · 축 간 AND · 세부 역할 검색은 canonical 원문 role만, 태그 결과를 추가로 좁힘.
    //   역할 태그 결과 0(정제)은 숨김. 전체=해당 축만 초기화. 데스크톱 줄바꿈·모바일 가로 스크롤. a11y 완비.
    // 포커스 유실 방지: 한 번만 빌드하고 이후엔 활성 상태만 sync(콤보박스 타이핑은 옵션만 필터).
    function roleSelectRoot() { return document.querySelector('.ship-role-select'); }
    function buildAxisRow(axisKey, labelText, clearLabel, tagKeys, tagAttr) {
        const row = document.createElement('div');
        row.className = 'ship-filter-axis';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', labelText);
        const label = document.createElement('span');
        label.className = 'ship-filter-axis-label'; label.textContent = labelText;
        const options = document.createElement('div');
        options.className = 'ship-filter-axis-options';
        const clear = document.createElement('button');
        clear.type = 'button'; clear.className = 'ship-filter-btn'; clear.textContent = clearLabel;
        clear.setAttribute(`data-axis-clear`, axisKey);
        options.appendChild(clear);
        for (const key of tagKeys) {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'ship-filter-btn';
            btn.setAttribute(tagAttr, key);
            btn.textContent = taxoTagLabel(axisKey === 'size' ? 'size' : 'role', key);
            options.appendChild(btn);
        }
        row.append(label, options);
        return row;
    }
    function buildRoleSelectRow(roles) {
        const row = document.createElement('div');
        row.className = 'ship-filter-axis ship-filter-axis--detail';
        const label = document.createElement('label');
        label.className = 'ship-filter-axis-label';
        label.htmlFor = 'ship-role-search';
        label.textContent = i18nT('ships.detailRoleLabel', '세부 역할');
        row.append(label, buildRoleCombobox(roles));
        return row;
    }
    function buildRoleCombobox(roles) {
        const root = document.createElement('div');
        root.className = 'ship-role-select';
        root.dataset.open = 'false';
        const input = document.createElement('input');
        input.type = 'text'; input.id = 'ship-role-search'; input.className = 'ship-role-search';
        input.autocomplete = 'off';
        input.placeholder = i18nT('ships.detailRoleSearchPlaceholder', '세부 역할 검색');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', 'ship-role-listbox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-label', i18nT('ships.detailRoleSearchLabel', '세부 역할 검색 및 선택'));
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button'; clearBtn.className = 'ship-role-clear'; clearBtn.hidden = true;
        clearBtn.textContent = '✕';
        clearBtn.setAttribute('data-role-clear', '');
        clearBtn.setAttribute('aria-label', i18nT('ships.roleClear', '역할 필터 초기화'));
        const listbox = document.createElement('ul');
        listbox.id = 'ship-role-listbox'; listbox.className = 'ship-role-listbox'; listbox.hidden = true;
        listbox.setAttribute('role', 'listbox');
        listbox.setAttribute('aria-label', i18nT('ships.roleListLabel', '역할 목록'));
        ['', ...roles].forEach((en, i) => {
            const li = document.createElement('li');
            li.className = 'ship-role-option'; li.id = `ship-role-opt-${i}`;
            li.setAttribute('role', 'option');
            li.setAttribute('data-role-option', en);
            li.setAttribute('aria-selected', 'false');
            li.textContent = en ? roleLabel(en) : i18nT('ships.allRoles', '전체');
            listbox.appendChild(li);
        });
        root.append(input, clearBtn, listbox);
        return root;
    }
    function renderShipFilters2Axis(container) {
        const roles = canonicalRoleFilterValues();
        const t = taxo();
        // canonical/taxonomy 지연 로드 전에는 숨긴다 — 로드 후 재렌더에서 빌드된다.
        if (roles.length === 0 || !t) { container.replaceChildren(); container.hidden = true; return; }
        container.hidden = false;
        container.classList.add('has-role-select'); // overflow 가시화(드롭다운 잘림 방지)
        if (!container.querySelector('.ship-filter-axes')) {
            const axes = document.createElement('div');
            axes.className = 'ship-filter-axes';
            axes.appendChild(buildAxisRow('size', i18nT('ships.axisSize', '규모·플랫폼'), i18nT('ships.allTags', '전체'), sizeAxisTagKeys(), 'data-size-tag'));
            axes.appendChild(buildAxisRow('role', i18nT('ships.axisRole', '역할'), i18nT('ships.allTags', '전체'), roleAxisTagKeys(), 'data-role-tag'));
            axes.appendChild(buildRoleSelectRow(roles));
            container.replaceChildren(axes);
        }
        syncShipFilters2Axis(container);
    }
    function syncShipFilters2Axis(container) {
        const sizeSel = new Set(shipState.sizeTags);
        const roleSel = new Set(shipState.roleTags);
        container.querySelectorAll('[data-size-tag]').forEach((b) => {
            const on = sizeSel.has(b.getAttribute('data-size-tag'));
            b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
        });
        container.querySelectorAll('[data-role-tag]').forEach((b) => {
            const on = roleSel.has(b.getAttribute('data-role-tag'));
            b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
        });
        const sizeClear = container.querySelector('[data-axis-clear="size"]');
        if (sizeClear) { sizeClear.classList.toggle('active', sizeSel.size === 0); sizeClear.setAttribute('aria-pressed', String(sizeSel.size === 0)); }
        const roleClear = container.querySelector('[data-axis-clear="role"]');
        if (roleClear) { roleClear.classList.toggle('active', roleSel.size === 0); roleClear.setAttribute('aria-pressed', String(roleSel.size === 0)); }
        syncRoleSelect(container.querySelector('.ship-role-select'));
    }
    // 선택 상태만 DOM에 반영(빌드 없음). 열려있을 땐 input을 덮지 않는다(타이핑 보존).
    function syncRoleSelect(root) {
        if (!root) return;
        const input = root.querySelector('.ship-role-search');
        const clearBtn = root.querySelector('[data-role-clear]');
        const selected = shipState.detailRole || '';
        if (root.dataset.open !== 'true' && input) input.value = selected ? roleLabel(selected) : '';
        if (clearBtn) clearBtn.hidden = !selected;
        root.querySelectorAll('.ship-role-option').forEach((opt) => {
            opt.setAttribute('aria-selected', String(opt.getAttribute('data-role-option') === selected));
        });
    }
    function openRoleListbox() {
        const root = roleSelectRoot();
        if (!root || root.dataset.open === 'true') { if (root) filterRoleOptions(root.querySelector('.ship-role-search').value); return; }
        root.dataset.open = 'true';
        const input = root.querySelector('.ship-role-search');
        input.setAttribute('aria-expanded', 'true');
        root.querySelector('.ship-role-listbox').hidden = false;
        filterRoleOptions(input.value);
    }
    function closeRoleListbox() {
        const root = roleSelectRoot();
        if (!root) return;
        root.dataset.open = 'false';
        const input = root.querySelector('.ship-role-search');
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        root.querySelector('.ship-role-listbox').hidden = true;
        syncRoleSelect(root); // input을 선택 라벨로 복원(미선택 검색어 폐기)
    }
    // 옵션 목록만 필터(그리드 필터 아님). '전체'는 항상 표시. KO 라벨·EN 원문 부분일치.
    function filterRoleOptions(query) {
        const root = roleSelectRoot();
        if (!root) return;
        const q = String(query || '').trim().toLowerCase();
        let firstVisible = null;
        root.querySelectorAll('.ship-role-option').forEach((opt) => {
            const en = opt.getAttribute('data-role-option');
            const show = !q || en === '' || `${opt.textContent} ${en}`.toLowerCase().includes(q);
            opt.hidden = !show;
            if (show && !firstVisible) firstVisible = opt;
        });
        setRoleActive(firstVisible);
    }
    function setRoleActive(opt) {
        const root = roleSelectRoot();
        if (!root) return;
        const input = root.querySelector('.ship-role-search');
        root.querySelectorAll('.ship-role-option.active').forEach((o) => { o.classList.remove('active'); });
        if (opt) { opt.classList.add('active'); input.setAttribute('aria-activedescendant', opt.id); opt.scrollIntoView({ block: 'nearest' }); }
        else input.removeAttribute('aria-activedescendant');
    }
    function moveRoleActive(dir) {
        const root = roleSelectRoot();
        if (!root) return;
        const visible = [...root.querySelectorAll('.ship-role-option')].filter((o) => !o.hidden);
        if (!visible.length) return;
        const current = root.querySelector('.ship-role-option.active');
        let idx = visible.indexOf(current);
        idx = idx < 0 ? (dir > 0 ? 0 : visible.length - 1) : (idx + dir + visible.length) % visible.length;
        setRoleActive(visible[idx]);
    }
    // 세부 역할 선택 확정 → 그리드 필터 적용(renderShips). 콤보박스는 rebuild 없이 sync만 되어 포커스 유지.
    function selectRoleValue(en) {
        shipState.detailRole = en || '';
        closeRoleListbox();
        syncShipControls();
        renderShips();
        roleSelectRoot()?.querySelector('.ship-role-search')?.focus();
    }
    // 규모·플랫폼 / 역할 태그 토글(같은 축 OR). 축별 '전체'는 해당 축만 초기화.
    function handleAxisTagClick(event) {
        const sizeBtn = event.target.closest('[data-size-tag]');
        const roleBtn = event.target.closest('[data-role-tag]');
        const clearBtn = event.target.closest('[data-axis-clear]');
        const toggle = (arr, key) => (arr.includes(key) ? arr.filter((v) => v !== key) : [...arr, key]);
        if (sizeBtn) { shipState.sizeTags = toggle(shipState.sizeTags, sizeBtn.getAttribute('data-size-tag')); renderShips(); return true; }
        if (roleBtn) { shipState.roleTags = toggle(shipState.roleTags, roleBtn.getAttribute('data-role-tag')); renderShips(); return true; }
        if (clearBtn) {
            if (clearBtn.getAttribute('data-axis-clear') === 'size') shipState.sizeTags = [];
            else shipState.roleTags = [];
            renderShips(); return true;
        }
        return false;
    }
    function handleRoleSelectClick(event) {
        if (handleAxisTagClick(event)) return;
        const opt = event.target.closest('[data-role-option]');
        if (opt) { selectRoleValue(opt.getAttribute('data-role-option')); return; }
        if (event.target.closest('[data-role-clear]')) { selectRoleValue(''); return; }
        if (event.target.id === 'ship-role-search') openRoleListbox();
    }
    function handleRoleSelectKeydown(event) {
        if (event.target.id !== 'ship-role-search') return;
        const root = roleSelectRoot();
        if (!root) return;
        const open = root.dataset.open === 'true';
        if (event.key === 'ArrowDown') { event.preventDefault(); if (open) moveRoleActive(1); else openRoleListbox(); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); if (open) moveRoleActive(-1); }
        else if (event.key === 'Enter') {
            const active = root.querySelector('.ship-role-option.active:not([hidden])');
            if (open && active) { event.preventDefault(); selectRoleValue(active.getAttribute('data-role-option')); }
        } else if (event.key === 'Escape') { if (open) { event.preventDefault(); closeRoleListbox(); } }
    }
    function canonicalLoadFailed() {
        return canonicalOn() && window.VOLT_SHIPDB_CANONICAL?.state === 'failed';
    }
    function renderCanonicalLoadError(container) {
        const message = i18nT('ships.canonicalLoadError', '함선 데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
        const retry = i18nT('ships.canonicalRetry', '다시 시도');
        const wrapper = document.createElement('div');
        const copy = document.createElement('p');
        const button = document.createElement('button');
        wrapper.className = 'ships-empty';
        wrapper.setAttribute('role', 'alert');
        copy.textContent = message;
        button.className = 'ship-compare-toggle';
        button.type = 'button';
        button.dataset.retryCanonical = '1';
        button.textContent = retry;
        wrapper.append(copy, button);
        container.replaceChildren(wrapper);
        button.addEventListener('click', () => {
            window.VOLT_SHIPDB_CANONICAL.retry().then(renderShips).catch(renderShips);
        });
    }
    function renderShips() {
        const container = document.getElementById('ships-grid');
        if (!container) return;
        if (canonicalLoadFailed()) {
            renderShipTagFilters();
            renderShipResultsSummary(0);
            renderShipPurposeSummary(0);
            renderCanonicalLoadError(container);
            return;
        }
        const ships = getVisibleShips();
        renderShipTagFilters();
        renderShipResultsSummary(ships.length);
        renderShipPurposeSummary(ships.length);
        if (ships.length === 0) {
            container.innerHTML = `<div class="ships-empty">${escapeHtml(i18nT('ships.empty', '검색 결과가 없습니다.'))}</div>`;
            return;
        }
        container.innerHTML = ships.map((ship) => `
            <article class="ship-card reveal${isRsiOfficialShip(ship) ? ' ship-card--rsi-official' : ''}" data-ship-id="${escapeHtml(ship.id)}" data-canonical-role="${escapeHtml(canonicalRole(ship) || '')}"${isRsiOfficialShip(ship) ? ` data-rsi-status="${escapeHtml(canonicalShip(ship).catalogStatus || 'concept')}"` : ''}>
                <div class="ship-card-header">
                    <div class="ship-card-title">
                        <h3 class="ship-name"><button type="button" class="ship-name-btn" data-open-ship-id="${escapeHtml(ship.id)}" aria-label="${escapeHtml(`${getShipDisplayName(ship)} ${i18nT('ships.viewDetail', '상세 보기')}`)}">${escapeHtml(getShipDisplayName(ship))}</button></h3>
                        ${getShipSecondaryName(ship) ? `<span class="ship-name-en">${escapeHtml(getShipSecondaryName(ship))}</span>` : ''}
                        <span class="ship-mfr">${escapeHtml(displayedManufacturer(ship))}</span>
                    </div>
                    <div class="ship-card-badges">${canonicalOn()
                        ? renderCardTags(ship)
                        : `<span class="ship-focus-badge" data-style-bg="${FOCUS_COLORS[ship.focus] || '#a0aec0'}22" data-style-color="${FOCUS_COLORS[ship.focus] || '#a0aec0'}">${escapeHtml(tx(ship, 'focus'))}</span>`}</div>
                    ${renderHangarToggleButton(ship)}
                </div>
                ${canonicalOn() ? renderCardRoleDetail(ship) : ''}
                <p class="ship-desc">${escapeHtml(shipDisplayDescription(ship))}</p>
                <div class="ship-stats${canonicalOn() ? ' ship-stats--canonical' : ''}">
                    <div class="ship-stat"><span class="ship-stat-label">${escapeHtml(i18nT('ships.cargo', '\ud654\ubb3c'))}</span><span class="ship-stat-value">${escapeHtml(cargoDisplay(ship))}</span></div>
                    ${canonicalOn() ? `<div class="ship-stat"><span class="ship-stat-label">${escapeHtml(i18nT('ships.crew', '승무원'))}</span><span class="ship-stat-value">${escapeHtml(crewDisplay(ship))}</span></div>` : ''}
                    ${canonicalOn() ? '' : `<div class="ship-stat"><span class="ship-stat-label">${escapeHtml(i18nT('ships.priceUsd', 'USD 가격'))}</span><span class="ship-stat-value">${escapeHtml(formatShipPrice(ship.priceUsd))}</span></div>`}
                </div>
                ${canonicalOn() ? '' : `<div class="ship-tags">${shipTagsLocalized(ship).map((tag) => `<span class="ship-tag">${escapeHtml(tag)}</span>`).join('')}</div>`}
                <div class="ship-card-actions">
                    ${renderShipPlannerButton(ship)}
                    <button class="ship-compare-toggle${shipCompareState.has(ship.id) ? ' active' : ''}" type="button" data-compare-ship-id="${escapeHtml(ship.id)}" aria-pressed="${shipCompareState.has(ship.id)}">
                        ${escapeHtml(shipCompareState.has(ship.id) ? i18nT('ships.compareRemove', '비교 제거') : i18nT('ships.compareAdd', '비교 추가'))}
                    </button>
                </div>
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
        // priceUsd 제거(D4): ON이면 가격 정렬 옵션을 제거한다. OFF는 그대로.
        if (sort && canonicalOn()) {
            sort.querySelectorAll('option[value^="price"]').forEach((opt) => { opt.remove(); });
            if (String(sort.value).startsWith('price')) sort.value = 'name-asc';
        }
        const grid = document.getElementById('ships-grid');
        const purpose = document.getElementById('ship-purpose');
        const hangarOnly = document.getElementById('ship-hangar-only');
        const tagFilters = document.getElementById('ship-tag-filters');
        const advancedToggle = document.getElementById('ship-advanced-toggle');
        const advancedPanel = document.getElementById('ship-advanced-panel');
        const filterReset = document.getElementById('ship-filter-reset');
        const cargoButtons = [...document.querySelectorAll('.cargo-filter-btn')];
        if (!search || !manufacturer || !hideUnreleased || !sort || !grid || !purpose) return;
        // role 이관(PM): purpose(VOLT 편집 분류 프리셋)는 ON에서 숨긴다 — focus/tags(D7)와 동일 취급.
        //   ON 필터는 canonical role 칩으로 대체된다(재구성은 새 VOLT 편집을 낳아 계약 위반). OFF는 완전 불변.
        if (canonicalOn()) { (purpose.closest('.ship-advanced-row') || purpose).hidden = true; shipState.purpose = ''; }
        tagFilters?.addEventListener('click', handleShipTagFilterClick);
        // ON 전용 역할 콤보박스: 위임 리스너(빌드는 renderRoleSelect가 1회). 타이핑=옵션 필터만(그리드 재렌더 없음).
        if (canonicalOn() && tagFilters) {
            tagFilters.addEventListener('input', (event) => {
                if (event.target.id === 'ship-role-search') { openRoleListbox(); filterRoleOptions(event.target.value); }
            });
            tagFilters.addEventListener('keydown', handleRoleSelectKeydown);
            tagFilters.addEventListener('click', handleRoleSelectClick);
            document.addEventListener('click', (event) => {
                const root = roleSelectRoot();
                if (root && root.dataset.open === 'true' && !event.target.closest('.ship-role-select')) closeRoleListbox();
            });
        }
        search.addEventListener('input', () => { shipState.query = search.value; renderShips(); });
        manufacturer.addEventListener('change', () => { shipState.manufacturer = manufacturer.value; renderShips(); });
        hideUnreleased.addEventListener('change', () => { shipState.hideUnreleased = hideUnreleased.checked; syncShipControls(); renderShips(); });
        sort.addEventListener('change', () => { shipState.sort = sort.value; renderShips(); });
        // 카드 본문 클릭은 그리드 위임으로 처리. 키보드 접근은 카드 내 함선명 버튼(.ship-name-btn,
        // data-open-ship-id → handleShipPlannerActions)이 담당한다 — a11y: 카드 자체는 인터랙티브 role 없음.
        grid.addEventListener('click', openShipFromEvent);
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
        const marketOnly = document.getElementById('ship-market-only');
        marketOnly?.addEventListener('change', () => {
            shipState.marketOnly = marketOnly.checked;
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
            item.textContent = label ? (owned ? i18nT('ships.hangarOwned', '\uaca9\ub0a9\uace0\uc5d0 \uc788\uc74c') : i18nT('ships.hangarAdd', '\uaca9\ub0a9\uace0\uc5d0 \ucd94\uac00')) : (owned ? '\u2605' : '\u2606');
            const title = owned ? i18nT('ships.hangarRemove', '\uaca9\ub0a9\uace0\uc5d0\uc11c \uc81c\uac70') : i18nT('ships.hangarAdd', '\uaca9\ub0a9\uace0\uc5d0 \ucd94\uac00');
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
    function renderShipResultsSummary(visibleCount) {
        const container = document.getElementById('ship-results-summary');
        if (!container) return;
        const label = i18nT('ships.resultsLabel', '검색 결과');
        const count = currentLang() === 'en'
            ? `${visibleCount} ${i18nT('ships.resultsUnit', 'ships')}`
            : `${visibleCount}${i18nT('ships.resultsUnit', '척')}`;
        const labelElement = document.createElement('span');
        const countElement = document.createElement('strong');
        labelElement.textContent = label;
        countElement.textContent = count;
        container.replaceChildren(labelElement, countElement);
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
        shipState.marketOnly = false;
        shipState.selectedTags = [];
        shipState.sizeTags = [];
        shipState.roleTags = [];
        shipState.detailRole = '';
        syncShipControls();
        renderShips();
    }
    function countActiveAdvancedFilters() {
        return (shipState.cargoMin > 0 ? 1 : 0)
            + (shipState.purpose ? 1 : 0)
            + (shipState.hideUnreleased ? 1 : 0)
            + (shipState.hangarOnly ? 1 : 0)
            + (shipState.marketOnly ? 1 : 0);
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
        const marketOnly = document.getElementById('ship-market-only');
        if (marketOnly) marketOnly.checked = shipState.marketOnly;
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
        // 함선명 버튼(data-open-ship-id)은 문서 레벨 핸들러가 처리하므로 이중 오픈 방지를 위해 제외
        if (event.target.closest('[data-compare-ship-id], [data-use-planner-ship-id], [data-hangar-ship-id], [data-open-ship-id]')) return;
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
            { label: i18nT('ships.mfr', '\uc81c\uc870\uc0ac'), key: 'manufacturer', format: (ship) => displayedManufacturer(ship) },
            { label: i18nT('ships.role', '\uc5ed\ud560'), key: 'role', format: (ship) => roleDisplay(ship) },
            // focus \uc81c\uac70(D7): ON\uc740 VOLT \ud3b8\uc9d1 \ubd84\ub958 \ud589\uc744 \ube44\uad50\ud45c\uc5d0\uc11c \ube80\ub2e4.
            ...(canonicalOn() ? [] : [{ label: i18nT('ships.focus', '\ubd84\ub958'), key: 'focus', format: (ship) => tx(ship, 'focus') }]),
            { label: i18nT('ships.size', '\ud06c\uae30'), key: 'size', format: (ship) => isRsiOfficialShip(ship) ? rsiSizeDisplay(ship) : tx(ship, 'size') },
            { label: i18nT('ships.crew', '\uc2b9\ubb34\uc6d0'), key: 'crew', format: (ship) => crewDisplay(ship), rawValue: (ship) => crewMax(ship), numeric: true, higherIsBetter: true },
            { label: i18nT('ships.cargo', '\ud654\ubb3c'), key: 'cargo', format: (ship) => cargoDisplay(ship), rawValue: (ship) => cargoValueNum(ship), numeric: true, higherIsBetter: true },
            // priceUsd: \ud50c\ub798\uadf8 ON\uc774\uba74 \uacf5\uac1c \ubaa8\ub378\uc5d0\uc11c \uc81c\uac70(D4). OFF\ub294 \ub808\uac70\uc2dc \uc720\uc9c0.
            ...(canonicalOn() ? [] : [{ label: i18nT('ships.priceUsd', 'USD \uac00\uaca9'), key: 'priceUsd', format: (ship) => formatShipPrice(ship.priceUsd), rawValue: (ship) => Number(ship.priceUsd), numeric: true, higherIsBetter: false }])
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
                                ${ships.map((ship) => `<th scope="col">${escapeHtml(getShipDisplayName(ship))}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${fields.map((field) => renderComparisonRow(field, ships)).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="ship-compare-tags">
                    ${ships.map((ship) => `<section>
                        <h3>${escapeHtml(getShipDisplayName(ship))}</h3>
                        <div class="ship-tags">${shipTagsLocalized(ship).map((tag) => `<span class="ship-tag">${escapeHtml(tag)}</span>`).join('')}</div>
                        ${renderShipPlannerAction(ship, 'btn btn-secondary ship-compare-use')}
                    </section>`).join('')}
                </div>
            </div>`;
    }
    function renderShipComparisonSummary(ships) {
        const cargoLeader = getShipByMetric(ships, (ship) => cargoValueNum(ship), 'max');
        const crewLeader = getShipByMetric(ships, (ship) => crewMin(ship), 'min');
        const largeOpsLeader = getShipByMetric(ships, (ship) => cargoValueNum(ship) + crewMax(ship) * 10, 'max');
        const smallOpsLeader = getShipByMetric(ships, (ship) => crewMin(ship) * 100 - cargoValueNum(ship), 'min');
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
        // tags 제거(D7): ON은 VOLT 편집 태그 기반 노트를 표시하지 않는다(함선명만).
        if (canonicalOn()) return `<li><strong>${escapeHtml(ship.name)}</strong></li>`;
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
    // ===== ShipDB 2.0 Live 레이어 (A-6) =====
    // data/ship-live-stats.js·ship-market.js는 A-4 matched 210척만 담는 표시 전용 레이어.
    // 레이어에 없는 함선(미출시/변형)은 아래 렌더러들이 빈 문자열을 반환해 기존 모달 그대로 표시된다.
    function getShipLiveStats(ship) { return (window.VOLT_SHIP_LIVE_STATS || {})[ship.id] || null; }
    function getShipLiveMarket(ship) { return (window.VOLT_SHIP_MARKET || {})[ship.id] || null; }
    function fmtInt(value) { return typeof value === 'number' && Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : null; }
    function fmtAuec(value) { const n = fmtInt(value); return n === null ? null : `${n} aUEC`; }
    function fmtSpeed(value) { return typeof value === 'number' ? `${value} m/s` : null; }
    function fmtDegSec(value) { return typeof value === 'number' ? `${value} °/s` : null; }
    function fmtScu(value) { return typeof value === 'number' ? `${value} SCU` : null; }
    // 배율 원본(1=감소 없음) → "n%" 감소 표기. A-2 damageReduction 정책.
    function fmtReduction(value) { return typeof value === 'number' ? `${Math.round((1 - value) * 100)}%` : null; }
    function fmtMinutesHms(minutes) {
        if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null;
        const total = Math.round(minutes * 60);
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
    }
    function liveStatItem(label, value) {
        if (value === null || value === undefined || value === '') return '';
        return `<div class="ship-modal-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
    }
    function shipModalDescription(ship, live) {
        const canonical = canonicalShip(ship);
        if (canonical?.source === 'rsi-official') {
            const description = currentLang() === 'en' ? canonical.descriptions?.en : canonical.descriptions?.ko;
            return description || officialMissingValue();
        }
        // A-9 정책: EN 모드 = Erkul 정제 설명 우선, KO 모드 = Erkul 기반 한국어 번역 우선.
        // 둘 다 없으면 기존 volt-data 설명(legacy)으로 폴백한다.
        if (currentLang() === 'en' && live?.descriptions?.en) return live.descriptions.en;
        if (currentLang() !== 'en' && live?.descriptions?.ko) return live.descriptions.ko;
        return tx(ship, 'description');
    }
    // 카드(외부)·모달(내부) 설명을 하나로 통합. live 레이어가 로드돼 있으면 Erkul 번역 설명,
    // 아직 로드 전이거나 미매칭 함선이면 기존 volt-data 설명으로 폴백한다.
    // (live는 지연 로드되므로 renderShipsSection이 로드 완료 후 한 번 더 렌더해 카드 설명을 갱신한다.)
    function shipDisplayDescription(ship) {
        return shipModalDescription(ship, getShipLiveStats(ship));
    }
    function renderShipLiveSummary(live, market) {
        if (!live) return '';
        const purchase = market ? market.purchase : [];
        const lowest = purchase.length ? Math.min(...purchase.map((row) => row.price).filter((p) => typeof p === 'number')) : null;
        const items = [
            liveStatItem(i18nT('ships.live.size', '크기'), live.size),
            liveStatItem(i18nT('ships.live.crew', '승무원'), live.crewSize),
            liveStatItem(i18nT('ships.live.cargo', '화물'), fmtScu(live.cargoScu)),
            liveStatItem(i18nT('ships.live.hp', 'HP'), fmtInt(live.hp)),
            liveStatItem(i18nT('ships.live.scm', 'SCM 속도'), fmtSpeed(live.speeds?.scm)),
            liveStatItem(i18nT('ships.live.nav', 'NAV 최고 속도'), fmtSpeed(live.speeds?.navMax)),
            liveStatItem(i18nT('ships.live.lowestPrice', '최저 구매가'), Number.isFinite(lowest) ? fmtAuec(lowest) : null),
            liveStatItem(i18nT('ships.live.purchaseCount', '구매처 수'), purchase.length || null)
        ].join('');
        if (!items) return '';
        const synced = String(live.syncedAt || '').slice(0, 10);
        return `<section class="ship-live-summary">
                <div class="ship-live-heading">
                    <h3>${escapeHtml(i18nT('ships.live.title', 'Live 상세 정보'))}</h3>
                    <span class="ship-live-meta">${escapeHtml(i18nT('ships.live.source', 'Erkul live'))}${synced ? ` · ${escapeHtml(synced)}` : ''}</span>
                </div>
                <div class="ship-modal-grid ship-live-grid">${items}</div>
            </section>`;
    }
    function renderMarketRow(row, isRental) {
        const parts = [
            `<strong class="ship-market-shop">${escapeHtml(row.shop || '?')}</strong>`,
            row.location ? `<span>${escapeHtml(row.location)}</span>` : '',
            `<span class="ship-market-price">${escapeHtml(typeof row.price === 'number' ? fmtAuec(row.price) : i18nT('ships.live.priceUnknown', '가격 미표기'))}</span>`,
            typeof row.available === 'number' ? `<span class="ship-market-stock">${escapeHtml(`${i18nT('ships.live.stockAvailable', '재고')} ${row.available}`)}</span>` : '',
            typeof row.unavailable === 'number' ? `<span class="ship-market-stock is-out">${escapeHtml(`${i18nT('ships.live.stockUnavailable', '미가용')} ${row.unavailable}`)}</span>` : ''
        ].filter(Boolean).join('<span class="ship-market-sep" aria-hidden="true">·</span>');
        return `<li class="ship-market-row${isRental ? ' is-rental' : ''}">${parts}</li>`;
    }
    function renderShipMarketPanel(live, market) {
        if (!live && !market) return '';
        const purchase = market ? [...market.purchase].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)) : [];
        const rentals = market ? market.rentals : [];
        let body;
        if (!purchase.length && !rentals.length) {
            body = `<p class="ship-market-empty">${escapeHtml(i18nT('ships.live.noMarket', '확인된 인게임 구매처 없음'))}</p>`;
        } else {
            const purchaseBlock = purchase.length
                ? `<h4>${escapeHtml(i18nT('ships.live.purchase', '구매'))}</h4><ul class="ship-market-list">${purchase.map((row) => renderMarketRow(row, false)).join('')}</ul>`
                : '';
            const rentalBlock = rentals.length
                ? `<h4>${escapeHtml(i18nT('ships.live.rental', '렌탈'))}</h4><ul class="ship-market-list">${rentals.map((row) => renderMarketRow(row, true)).join('')}</ul>`
                : '';
            body = purchaseBlock + rentalBlock;
        }
        return `<section class="ship-market-panel">
                <h3>${escapeHtml(i18nT('ships.live.marketTitle', '인게임 구매처'))}</h3>
                ${body}
            </section>`;
    }
    function liveDetailGroup(title, rows) {
        const items = rows
            .filter(([, value]) => value !== null && value !== undefined && value !== '')
            .map(([label, value]) => `<div class="ship-live-detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`)
            .join('');
        if (!items) return '';
        return `<div class="ship-live-detail-group"><h4>${escapeHtml(title)}</h4>${items}</div>`;
    }
    function renderShipLiveDetails(live) {
        if (!live) return '';
        const dims = live.dimensions || {};
        const dimText = [dims.length, dims.beam, dims.height].every((v) => typeof v === 'number')
            ? `${dims.length} × ${dims.beam} × ${dims.height} m`
            : null;
        const groups = [
            liveDetailGroup(i18nT('ships.live.speeds', '속도'), [
                ['SCM', fmtSpeed(live.speeds?.scm)],
                [i18nT('ships.live.scmBoostFwd', 'SCM 부스트(전진)'), fmtSpeed(live.speeds?.scmBoostForward)],
                [i18nT('ships.live.scmBoostBack', 'SCM 부스트(후진)'), fmtSpeed(live.speeds?.scmBoostBackward)],
                ['NAV', fmtSpeed(live.speeds?.navMax)]
            ]),
            liveDetailGroup(i18nT('ships.live.rotation', '회전'), [
                ['Pitch', fmtDegSec(live.rotation?.pitch)],
                ['Yaw', fmtDegSec(live.rotation?.yaw)],
                ['Roll', fmtDegSec(live.rotation?.roll)]
            ]),
            liveDetailGroup(i18nT('ships.live.fuel', '연료'), [
                [i18nT('ships.live.fuelHydrogen', '수소 연료'), fmtScu(live.fuel?.hydrogenScu)],
                [i18nT('ships.live.fuelQuantum', '퀀텀 연료'), fmtScu(live.fuel?.quantumScu)]
            ]),
            liveDetailGroup(i18nT('ships.live.insurance', '보험'), [
                [i18nT('ships.live.claimTime', '클레임 시간'), fmtMinutesHms(live.insurance?.claimTime)],
                [i18nT('ships.live.expediteTime', '신속 처리 시간'), fmtMinutesHms(live.insurance?.expediteTime)],
                [i18nT('ships.live.expeditionFee', '신속 처리 비용'), fmtAuec(live.insurance?.expeditionFee)]
            ]),
            liveDetailGroup(i18nT('ships.live.dimensions', '크기/질량'), [
                [i18nT('ships.live.dimensionsLbh', '길이 × 폭 × 높이'), dimText],
                [i18nT('ships.live.mass', '질량'), fmtInt(live.massKg) ? `${fmtInt(live.massKg)} kg` : null]
            ]),
            liveDetailGroup(i18nT('ships.live.damageReduction', '피해 감소'), [
                [i18nT('ships.live.drPhysical', '물리'), fmtReduction(live.damageReduction?.physical)],
                [i18nT('ships.live.drEnergy', '에너지'), fmtReduction(live.damageReduction?.energy)],
                [i18nT('ships.live.drDistortion', '왜곡'), fmtReduction(live.damageReduction?.distortion)],
                [i18nT('ships.live.drFuse', '퓨즈 관통'), fmtReduction(live.damageReduction?.fuse)],
                [i18nT('ships.live.drComponent', '부품 관통'), fmtReduction(live.damageReduction?.component)]
            ])
        ].join('');
        if (!groups) return '';
        return `<details class="ship-live-details">
                <summary>${escapeHtml(i18nT('ships.live.details', '상세 스펙'))}</summary>
                <div class="ship-live-detail-groups">${groups}</div>
            </details>`;
    }
    // 모달 상단 기본 스펙 그리드. Erkul live 레이어가 있으면 크기/승무원/화물은
    // renderShipLiveSummary(Erkul 기준)로 단일화하고 여기서는 중복 표기하지 않는다.
    // live가 없는 함선(미출시/변형)만 legacy volt-data 값으로 전부 폴백한다.
    function renderShipBaseGrid(ship, live) {
        const stat = (label, value) => `<div class="ship-modal-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
        const items = [stat(i18nT('ships.role', '역할'), roleDisplay(ship))];
        if (!live) {
            items.push(stat(i18nT('ships.size', '크기'), isRsiOfficialShip(ship) ? rsiSizeDisplay(ship) : tx(ship, 'size')));
            items.push(stat(i18nT('ships.crew', '승무원'), crewDisplay(ship)));
            items.push(stat(i18nT('ships.cargo', '화물'), cargoDisplay(ship)));
        }
        if (!canonicalOn()) items.push(stat(i18nT('ships.priceUsd', 'USD 가격'), formatShipPrice(ship.priceUsd)));
        return `<div class="ship-modal-grid">${items.join('')}</div>`;
    }
    let liveRefreshShipId = null;
    function openShipModal(ship, isLiveRefresh = false) {
        if (!isLiveRefresh) trackEvent('ship_modal_open', { shipId: ship?.id || '', shipName: ship?.name || '' });
        const officialUrl = getShipOfficialUrl(ship);
        const officialLabel = isRsiOfficialShip(ship) || ship.rsiUrl
            ? i18nT('ships.officialPage', 'RSI 공식 페이지')
            : i18nT('ships.shipMatrix', 'RSI 함선 매트릭스');
        const liveStats = getShipLiveStats(ship);
        const liveMarket = getShipLiveMarket(ship);
        // live 레이어 지연 로드 레이스: 아직 로드 전이면 로드 후 같은 함선 모달이 열려 있을 때만 다시 렌더한다.
        if (!isRsiOfficialShip(ship) && !liveStats && !liveMarket && typeof ensureShipLiveData === 'function') {
            liveRefreshShipId = ship.id;
            ensureShipLiveData().then(() => {
                if (liveRefreshShipId !== ship.id) return;
                if (!getShipLiveStats(ship) && !getShipLiveMarket(ship)) return; // 로드 실패 또는 레이어에 없는 함선(미출시)
                const modalRoot = document.getElementById('global-modal');
                if (modalRoot?.classList.contains('active')) openShipModal(ship, true);
            });
        }
        openModal(`<div class="modal-header">
                <div>
                    <div class="ship-mfr">${escapeHtml(displayedManufacturer(ship))}</div>
                    <h2 class="modal-title">${escapeHtml(getShipDisplayName(ship))}</h2>
                    ${getShipSecondaryName(ship) ? `<p class="modal-subtitle-en">${escapeHtml(getShipSecondaryName(ship))}</p>` : ''}
                </div>
                <button class="modal-close" type="button" aria-label="${escapeHtml(i18nT('ships.modalClose', '모달 닫기'))}">×</button>
            </div>
            <div class="modal-body">
                <p>${escapeHtml(shipModalDescription(ship, liveStats))}</p>
                ${renderShipBaseGrid(ship, liveStats)}
                ${renderShipLiveSummary(liveStats, liveMarket)}
                ${renderShipMarketPanel(liveStats, liveMarket)}
                ${renderShipLiveDetails(liveStats)}
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
        return canonicalShip(ship)?.sourceUrl || ship.rsiUrl || RSI_SHIP_MATRIX_URL;
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
