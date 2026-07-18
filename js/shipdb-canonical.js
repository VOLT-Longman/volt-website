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
        rsiLocalization: 'data/canonical/localization-rsi-official.json'
    };

    var state = 'idle';
    var promise = null;
    var store = {};

    // OFF: 즉시 null 반환(fetch 없음). ON: 6개 계층 JSON을 병렬 로드해 store에 채운다.
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
        get data() { return store; },
        get state() { return state; }
    };
})();
