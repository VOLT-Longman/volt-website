/**
 * ShipDB Erkul 재작성 v2 — canonical 데이터 내부 로더 + 비공개 플래그 (2단계 듀얼리드)
 *
 * 원칙(PM):
 *  - 기본 OFF. URL·localStorage 등 이용자 경로로 켤 수 없는 내부 전환값이다.
 *  - OFF에서는 아무 것도 로드/렌더하지 않는다 — 라이브 출력은 기준선과 완전히 동일.
 *  - ON 전환(실사용)과 기존 데이터 삭제는 3.5 PM 승인 시점에만. 여기서는 데이터 로드 배관만 둔다.
 *  - 테스트는 addInitScript로 __VOLT_SHIPDB_CANONICAL_TEST__=true를 주입해 ON 경로만 검증한다.
 *
 * 이 커밋 범위: 플래그 + 로더 API 정의뿐. 어떤 소비처도 아직 이 데이터를 읽지 않는다(UI 무변경).
 */
(function () {
    'use strict';

    // 내부 전환값 — 3.5 승인 시 코드로만 true. 이용자/URL/스토리지로 못 켠다.
    var CANONICAL_ENABLED = false;

    // 테스트 전용 훅. 프로덕션 사용자 경로가 아니며 지속되지 않는다(페이지 로드 시 주입만).
    function isEnabled() {
        return CANONICAL_ENABLED === true || (typeof window !== 'undefined' && window.__VOLT_SHIPDB_CANONICAL_TEST__ === true);
    }

    var DATA_FILES = {
        canonical: 'data/canonical/ships-canonical.json',
        localization: 'data/canonical/localization-ships.json',
        operational: 'data/canonical/operational-ships.json',
        editionAliases: 'data/canonical/edition-aliases.json',
        rsiOfficial: 'data/canonical/ships-rsi-official.json',
        rsiLocalization: 'data/canonical/localization-rsi-official.json',
        roleLocalization: 'data/canonical/localization-roles.json'
    };

    var state = 'idle';
    var promise = null;
    var store = {};
    var idCache = null;
    var shipCache = null;
    var roleListCache = null;

    // 공개 canonical 함선 id 집합(219). 메인 ShipDB 리스트를 canonical로 좁힐 때 사용(ON).
    function publicShipIds() {
        if (!store.canonical || !Array.isArray(store.canonical.ships)) return null;
        if (!idCache) idCache = new Set(store.canonical.ships.map(function (s) { return s.id; }));
        return idCache;
    }

    // id로 canonical 레코드 조회(crewSize·cargoScu 등 Erkul 사실값). 필드별 이관 소비처가 사용.
    function getShip(id) {
        if (!store.canonical || !Array.isArray(store.canonical.ships)) return null;
        if (!shipCache) {
            shipCache = {};
            store.canonical.ships.forEach(function (s) { shipCache[s.id] = s; });
        }
        return shipCache[id] || null;
    }

    // Erkul EN role 문자열 → KO UI 번역(없으면 null). 역할 사실을 바꾸지 않는 표기 계층.
    function roleKo(enRole) {
        if (!enRole || !store.roleLocalization || !store.roleLocalization.roles) return null;
        var ko = store.roleLocalization.roles[enRole];
        return typeof ko === 'string' ? ko : null;
    }

    // canonical에 존재하는 distinct role 집합(EN, 정렬). role 필터 칩 생성에 사용(canonical 집합에서만).
    function roleList() {
        if (!store.canonical || !Array.isArray(store.canonical.ships)) return null;
        var seen;
        if (!roleListCache) {
            roleListCache = [];
            seen = {};
            store.canonical.ships.forEach(function (s) {
                if (s.role && !seen[s.role]) { seen[s.role] = true; roleListCache.push(s.role); }
            });
            roleListCache.sort();
        }
        return roleListCache;
    }

    // OFF: 즉시 null 반환(fetch 없음). ON: 7개 계층 JSON을 병렬 로드해 store에 채운다.
    function load() {
        if (!isEnabled()) return Promise.resolve(null);
        if (state === 'loaded') return Promise.resolve(store);
        if (state === 'loading') return promise;
        state = 'loading';
        var keys = Object.keys(DATA_FILES);
        promise = Promise.all(keys.map(function (key) {
            return fetch(DATA_FILES[key], { headers: { Accept: 'application/json' } })
                .then(function (r) { return r && r.ok ? r.json() : null; })
                .then(function (json) { store[key] = json; })
                .catch(function () { store[key] = null; });
        })).then(function () { state = 'loaded'; return store; });
        return promise;
    }

    window.VOLT_SHIPDB_CANONICAL = {
        isEnabled: isEnabled,
        load: load,
        publicShipIds: publicShipIds,
        getShip: getShip,
        roleKo: roleKo,
        roleList: roleList,
        get data() { return store; },
        get state() { return state; }
    };
})();
