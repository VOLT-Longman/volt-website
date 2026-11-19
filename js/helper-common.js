/**
 * VOLT helper tools — shared helpers (window.VOLT_HELPER)
 *
 * 무역 경로 · 시세 · 순회 무역 · 임무 · 제작 설계도 · 채광 화면이 함께 쓰는 작은 도구 모음이다.
 * 화면별 파일(js/routes.js 등)은 이 파일을 고치지 않고 window.VOLT_HELPER만 쓴다.
 * 계약(마운트 요소, init 서명, 해시 형식, 파일 소유)은 docs/helper-tools.md 에 있다.
 *
 * 이 파일은 DOM을 createElement/textContent로만 만든다 (innerHTML 싱크 0).
 * 로드 순서: js/i18n.js 뒤, 화면별 파일 앞. navigation.js가 섹션 전환 때 onSectionShow를 부른다.
 */
(function () {
    'use strict';

    // 섹션 id → 마운트 요소 id, 화면 모듈 전역 이름, 탭 제목용 i18n 키.
    const SECTIONS = Object.freeze({
        routes: { mount: 'routes-app', global: 'VOLT_ROUTES', titleKey: 'nav.routes' },
        market: { mount: 'market-app', global: 'VOLT_MARKET', titleKey: 'nav.market' },
        tours: { mount: 'tours-app', global: 'VOLT_TOURS', titleKey: 'nav.tours' },
        missions: { mount: 'missions-app', global: 'VOLT_MISSIONS', titleKey: 'nav.missions' },
        fabricator: { mount: 'fabricator-app', global: 'VOLT_FABRICATOR', titleKey: 'nav.fabricator' },
    });
    // 해시 뒤에 ?key=value 를 붙일 수 있는 섹션 (기존 채광·운송 계약 포함).
    const HASH_SECTIONS = Object.freeze([...Object.keys(SECTIONS), 'mining', 'hauling']);

    // 소유자 결정(2026-11-19): 기본으로 3일 이내 가격 보고만 쓴다. 이용자가 바꿀 수 있고 나이는 항상 보여 준다.
    const DEFAULT_PRICE_AGE_DAYS = 3;
    const DAY_SECONDS = 86400;
    const UEX_BASE = '/api/uex';
    const UEX_TIMEOUT_MS = 10000;

    const TEXT = {
        ko: {
            unknownGame: '게임 자료에 없음',
            unknownUex: '보고 없음',
            soonTitle: '준비 중입니다',
            soonBody: '이 화면은 곧 열립니다.',
            moduleMissing: '화면을 불러오지 못했습니다. 페이지를 새로 고쳐 주세요.',
            ageNow: '방금',
            ageMin: '{n}분 전',
            ageHour: '{n}시간 전',
            ageDay: '{n}일 전',
            ageUnknown: '보고 시각 모름',
            durSec: '{n}초',
            durMin: '{n}분',
            durHour: '{n}시간',
            sourceGame: '자료: 게임 파일',
            sourceVersion: '게임 버전 {v}',
            sourceBuilt: '정리한 날 {d}',
            sourceUex: '가격·재고: UEX 이용자 보고',
            sourceUexAt: '{age} 받아 옴',
            sourceStale: 'UEX 연결이 안 되어 이전에 받아 둔 자료를 보여 줍니다',
            errLogin: '가격을 보려면 로그인이 필요합니다.',
            errMember: '가격은 커뮤니티 멤버만 볼 수 있습니다.',
            errTimeout: '가격 서버의 응답이 늦습니다. 잠시 뒤 다시 시도해 주세요.',
            errUnavailable: '지금 UEX 가격을 받아 올 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
            errInvalid: '받아 온 가격 자료를 읽을 수 없습니다.',
            errNetwork: '가격을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.',
            errData: '게임 자료를 불러오지 못했습니다. 다시 시도해 주세요.',
            copied: '주소를 복사했습니다.',
            copyFailed: '주소를 복사하지 못했습니다. 주소창에서 직접 복사해 주세요.',
            chipAny: '상관없음',
            chipInclude: '포함',
            chipExclude: '제외',
        },
        en: {
            unknownGame: 'Not in the game files',
            unknownUex: 'Not reported',
            soonTitle: 'Coming soon',
            soonBody: 'This screen will open shortly.',
            moduleMissing: 'This screen could not be loaded. Please reload the page.',
            ageNow: 'just now',
            ageMin: '{n} min ago',
            ageHour: '{n} h ago',
            ageDay: '{n} d ago',
            ageUnknown: 'report time unknown',
            durSec: '{n} s',
            durMin: '{n} min',
            durHour: '{n} h',
            sourceGame: 'Data: game files',
            sourceVersion: 'game version {v}',
            sourceBuilt: 'built {d}',
            sourceUex: 'Prices and stock: UEX player reports',
            sourceUexAt: 'fetched {age}',
            sourceStale: 'UEX could not be reached, showing the copy fetched earlier',
            errLogin: 'Log in to see prices.',
            errMember: 'Prices are available to community members only.',
            errTimeout: 'The price server is slow to answer. Please try again shortly.',
            errUnavailable: 'UEX prices cannot be fetched right now. Please try again shortly.',
            errInvalid: 'The price data received could not be read.',
            errNetwork: 'Prices could not be loaded. Check your connection and try again.',
            errData: 'Game data could not be loaded. Please try again.',
            copied: 'Link copied.',
            copyFailed: 'The link could not be copied. Please copy it from the address bar.',
            chipAny: 'Any',
            chipInclude: 'Include',
            chipExclude: 'Exclude',
        },
    };

    // ── 언어 · 문구 ─────────────────────────────────────────────────────────
    function lang() {
        return window.VOLT_I18N?.getLang?.() === 'en' ? 'en' : 'ko';
    }

    function fill(template, vars) {
        return String(template).replace(/\{(\w+)\}/g, (_, key) => (vars && vars[key] !== undefined ? String(vars[key]) : ''));
    }

    // text('ageMin', { n: 3 }) — 이 파일의 공용 문구.
    function text(key, vars) {
        const table = TEXT[lang()];
        return fill(table[key] ?? TEXT.ko[key] ?? key, vars);
    }

    // 화면별 TEXT{ko,en} 표에서 문구를 꺼내는 함수를 만든다: const t = H.translator(TEXT); t('title', {n: 1})
    function translator(table) {
        return (key, vars) => fill(table?.[lang()]?.[key] ?? table?.ko?.[key] ?? key, vars);
    }

    // 자료의 이름 {en, ko?}: 한국어 화면에서 ko가 있으면 ko, 없으면 en (한글 패치 이름을 그대로 쓴다).
    function name(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        return (lang() === 'ko' && value.ko) || value.en || value.ko || '';
    }

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    }

    // ── 숫자 · 가격 · 시간 ─────────────────────────────────────────────────
    function isKnown(value) {
        return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
    }

    // 모르는 값은 0이 아니라 "게임 자료에 없음"(game) 또는 "보고 없음"(uex)으로 보여 준다.
    function unknown(kind) {
        return text(kind === 'uex' ? 'unknownUex' : 'unknownGame');
    }

    function locale() {
        return lang() === 'en' ? 'en-US' : 'ko-KR';
    }

    // num(1234.5, { digits: 1 }) → "1,234.5". 모르는 값이면 unknown(options.unknown).
    function num(value, options = {}) {
        if (!isKnown(value)) return unknown(options.unknown);
        const digits = Number.isInteger(options.digits) ? options.digits : 0;
        return Number(value).toLocaleString(locale(), { minimumFractionDigits: options.fixed ? digits : 0, maximumFractionDigits: digits });
    }

    // price(12500) → "12,500 aUEC". { compact: true } → "1.3만 aUEC" / "12.5K aUEC". { unit: false } → 숫자만.
    function price(value, options = {}) {
        if (!isKnown(value)) return unknown(options.unknown || 'uex');
        const amount = Number(value);
        const body = options.compact
            ? amount.toLocaleString(locale(), { notation: 'compact', maximumFractionDigits: 1 })
            : amount.toLocaleString(locale(), { maximumFractionDigits: Number.isInteger(options.digits) ? options.digits : 0 });
        return options.unit === false ? body : `${body} aUEC`;
    }

    function scu(value, options = {}) {
        if (!isKnown(value)) return unknown(options.unknown);
        return `${num(value, { digits: Number.isInteger(options.digits) ? options.digits : 0 })} SCU`;
    }

    function percent(value, options = {}) {
        if (!isKnown(value)) return unknown(options.unknown);
        return `${num(value, { digits: Number.isInteger(options.digits) ? options.digits : 0 })}%`;
    }

    // 보고 시각(유닉스 초) → 지금부터 몇 초 전인지. 모르거나 미래면 null.
    function ageSeconds(atSeconds, nowMs) {
        if (!isKnown(atSeconds) || Number(atSeconds) <= 0) return null;
        const seconds = Math.floor((Number.isFinite(nowMs) ? nowMs : Date.now()) / 1000 - Number(atSeconds));
        return seconds >= 0 ? seconds : null;
    }

    // age(at) → "3시간 전" / "3 h ago". 모르면 "보고 시각 모름".
    function age(atSeconds, nowMs) {
        const seconds = ageSeconds(atSeconds, nowMs);
        if (seconds === null) return text('ageUnknown');
        if (seconds < 60) return text('ageNow');
        if (seconds < 3600) return text('ageMin', { n: Math.floor(seconds / 60) });
        if (seconds < DAY_SECONDS) return text('ageHour', { n: Math.floor(seconds / 3600) });
        return text('ageDay', { n: Math.floor(seconds / DAY_SECONDS) });
    }

    // 가격 보고가 기준(일) 안인지: 'ok' | 'old' | 'unknown'. 기준을 안 주면 3일.
    function ageLevel(atSeconds, maxAgeDays, nowMs) {
        const seconds = ageSeconds(atSeconds, nowMs);
        if (seconds === null) return 'unknown';
        const limit = isKnown(maxAgeDays) && Number(maxAgeDays) > 0 ? Number(maxAgeDays) : DEFAULT_PRICE_AGE_DAYS;
        return seconds <= limit * DAY_SECONDS ? 'ok' : 'old';
    }

    // duration(4830) → "1시간 20분" / "1 h 20 min". 1분 미만은 초로.
    function duration(seconds, options = {}) {
        if (!isKnown(seconds) || Number(seconds) < 0) return unknown(options.unknown);
        const total = Math.round(Number(seconds));
        if (total < 60) return text('durSec', { n: total });
        const hours = Math.floor(total / 3600);
        const minutes = Math.round((total - hours * 3600) / 60);
        if (!hours) return text('durMin', { n: minutes });
        return minutes ? `${text('durHour', { n: hours })} ${text('durMin', { n: minutes })}` : text('durHour', { n: hours });
    }

    // 화면마다 보여 줘야 하는 "자료 출처 · 게임 버전" 한 줄.
    //   sourceLine({ gameVersion, builtAt })                       → 게임 파일 자료
    //   sourceLine({ gameVersion }, { fetchedAt, stale })          → + UEX 가격 안내
    function sourceLine(dataHeader, uexMeta) {
        const parts = [];
        if (dataHeader) {
            parts.push(text('sourceGame'));
            if (dataHeader.gameVersion) parts.push(text('sourceVersion', { v: dataHeader.gameVersion }));
            if (dataHeader.builtAt) parts.push(text('sourceBuilt', { d: String(dataHeader.builtAt).slice(0, 10) }));
        }
        if (uexMeta) {
            parts.push(text('sourceUex'));
            const fetched = Date.parse(uexMeta.fetchedAt || '');
            if (Number.isFinite(fetched)) parts.push(text('sourceUexAt', { age: age(fetched / 1000) }));
            if (uexMeta.stale) parts.push(text('sourceStale'));
        }
        return parts.join(' · ');
    }

    // ── 포함/제외 칩 상태 ───────────────────────────────────────────────────
    // 칩 하나는 세 상태를 돈다: 상관없음 → 포함 → 제외 → 상관없음.
    //   const chips = H.chips('sys=stanton,-pyro'.split('=')[1]);
    //   chips.cycle('nyx'); chips.get('pyro') === 'exclude'; chips.test(['stanton']) === true; chips.encode()
    function chips(initial) {
        const include = new Set();
        const exclude = new Set();

        function set(id, state) {
            const key = String(id);
            include.delete(key);
            exclude.delete(key);
            if (state === 'include') include.add(key);
            if (state === 'exclude') exclude.add(key);
        }
        function get(id) {
            const key = String(id);
            if (include.has(key)) return 'include';
            return exclude.has(key) ? 'exclude' : 'any';
        }
        function cycle(id) {
            const next = { any: 'include', include: 'exclude', exclude: 'any' }[get(id)];
            set(id, next);
            return next;
        }
        function clear() {
            include.clear();
            exclude.clear();
        }
        // 항목이 가진 값 목록으로 판정: 제외 값이 하나라도 있으면 탈락, 포함 값이 정해져 있으면 그중 하나는 있어야 통과.
        function test(values) {
            const list = (Array.isArray(values) ? values : [values]).filter((value) => value !== null && value !== undefined).map(String);
            if (list.some((value) => exclude.has(value))) return false;
            return include.size === 0 || list.some((value) => include.has(value));
        }
        // 해시 값: 포함은 그대로, 제외는 앞에 '-'. 예: "stanton,-pyro". 값에는 쉼표를 쓸 수 없다.
        function encode() {
            return [...[...include].sort(), ...[...exclude].sort().map((id) => `-${id}`)].join(',');
        }
        function decode(value) {
            clear();
            String(value || '').split(',').map((part) => part.trim()).filter(Boolean).forEach((part) => {
                if (part.startsWith('-')) set(part.slice(1), 'exclude');
                else set(part, 'include');
            });
        }
        function label(state) {
            return text({ include: 'chipInclude', exclude: 'chipExclude' }[state] || 'chipAny');
        }

        if (typeof initial === 'string') decode(initial);
        return {
            get, set, cycle, clear, test, encode, decode, label,
            isEmpty: () => include.size === 0 && exclude.size === 0,
            included: () => [...include].sort(),
            excluded: () => [...exclude].sort(),
        };
    }

    // ── 공유 주소(해시) ─────────────────────────────────────────────────────
    // 형식: #<section>?<key>=<value>&...  (URLSearchParams 인코딩). 섹션별 키는 docs/helper-tools.md.
    function parseHash(hash) {
        const raw = String(hash ?? window.location.hash).replace(/^#/, '');
        const cut = raw.indexOf('?');
        const section = cut < 0 ? raw : raw.slice(0, cut);
        const params = {};
        if (cut >= 0) new URLSearchParams(raw.slice(cut + 1)).forEach((value, key) => { params[key] = value; });
        if (section === 'routes' && ['tour', 'mix'].includes(params.tab)) return { section: 'tours', params };
        if (section === 'missions' && params.tab === 'hauling') return { section: 'hauling', params };
        return { section, params };
    }

    function buildHash(section, params) {
        if (section === 'tours') { section = 'routes'; params = { ...params, tab: params?.tab === 'mix' ? 'mix' : 'tour' }; }
        if (section === 'hauling') { section = 'missions'; params = { ...params, tab: 'hauling' }; }
        const query = new URLSearchParams();
        Object.keys(params || {}).sort().forEach((key) => {
            const value = params[key];
            if (value === null || value === undefined || value === '' || value === false) return;
            query.set(key, String(value));
        });
        const tail = query.toString();
        return `#${section}${tail ? `?${tail}` : ''}`;
    }

    // 지금 주소가 이 섹션일 때만 값을 돌려준다. 다른 섹션이면 빈 객체.
    function readHash(section) {
        const parsed = parseHash();
        return parsed.section === section ? parsed.params : {};
    }

    // 화면 상태를 주소에 적는다. 기본은 뒤로 가기 기록을 늘리지 않는다(replace).
    // 섹션 전환은 하지 않는다 — 다른 섹션으로 보낼 때는 H.go(section, params)를 쓴다.
    function writeHash(section, params, options = {}) {
        const hash = buildHash(section, params);
        delivered.set(section, JSON.stringify(Object.entries(parseHash(hash).params).sort()));
        if (window.location.hash === hash) return hash;
        const state = { section };
        if (options.push) history.pushState(state, '', hash);
        else history.replaceState(state, '', hash);
        return hash;
    }

    function shareUrl(section, params) {
        return `${window.location.origin}${window.location.pathname}${buildHash(section, params)}`;
    }

    // 주소를 클립보드에 복사한다. 성공 여부(boolean)를 돌려주고, 안내 문구는 H.text('copied'|'copyFailed').
    async function copyShareUrl(section, params) {
        try {
            await navigator.clipboard.writeText(shareUrl(section, params));
            return true;
        } catch (_error) {
            return false;
        }
    }

    // 다른 도구 화면으로 이동(값 전달 포함). 예: H.go('market', { c: '12' })
    function go(section, params) {
        const hash = buildHash(section, params);
        if (window.location.hash === hash) {
            onSectionShow(section, params || {});
            return;
        }
        window.location.hash = hash; // hashchange → main.js 라우터 → navigation.showSection → onSectionShow
    }

    // ── 자료 불러오기 ───────────────────────────────────────────────────────
    function makeError(type, message, status) {
        const error = new Error(message);
        error.helperType = type; // login | member | timeout | unavailable | invalid | network | data
        if (status) error.status = status;
        return error;
    }

    function errorType(error) {
        return error?.helperType || 'network';
    }

    // 이용자에게 보여 줄 실패 문구 (화면 언어).
    function errorText(error) {
        const key = { login: 'errLogin', member: 'errMember', timeout: 'errTimeout', unavailable: 'errUnavailable', invalid: 'errInvalid', data: 'errData' }[errorType(error)];
        return text(key || 'errNetwork');
    }

    // index.html이 붙인 캐시 버전(?v=YYYYMMDD-NN). /data 는 immutable로 캐시되므로 주소에 이 값을 붙여야 새 자료를 받는다.
    const CACHE_VERSION = (() => {
        try {
            return new URL(document.currentScript.src).searchParams.get('v') || '';
        } catch (_error) {
            return '';
        }
    })();

    const jsonCache = new Map();

    // loadJson('/data/trade/cargo.json') → Promise<object>. 같은 파일은 한 번만 받는다. 실패하면 다음 호출에서 다시 시도한다.
    function loadJson(path) {
        if (typeof path !== 'string' || !/^\/data\/[\w./-]+\.json$/.test(path) || path.includes('..')) {
            return Promise.reject(makeError('data', `Not a data file: ${path}`));
        }
        if (jsonCache.has(path)) return jsonCache.get(path);
        const url = CACHE_VERSION ? `${path}?v=${encodeURIComponent(CACHE_VERSION)}` : path;
        const pending = (async () => {
            let response;
            try {
                response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            } catch (_error) {
                throw makeError('data', `Data network error: ${path}`);
            }
            if (response.status === 401) throw makeError('login', `Data 401: ${path}`, 401);
            if (response.status === 403) throw makeError('member', `Data 403: ${path}`, 403);
            if (!response.ok) throw makeError('data', `Data ${response.status}: ${path}`, response.status);
            try {
                return await response.json();
            } catch (_error) {
                throw makeError('data', `Data JSON parse failed: ${path}`);
            }
        })();
        jsonCache.set(path, pending);
        pending.catch(() => { jsonCache.delete(path); });
        return pending;
    }

    const uexCache = new Map();
    const uexPending = new Map();

    // uex('market') → Promise<{ data, meta, stale, receivedAt }>
    //   path: '/api/uex/' 뒤 부분. 예: 'market', 'terminals', 'refineries', 'vehicle-prices',
    //         'price-history?terminal=12&commodity=34', 'commodities'
    //   options.ttlMs(기본 10분) 동안 같은 응답을 다시 쓴다. options.refresh: 캐시를 건너뛰고 ?refresh=1 을 붙인다.
    //   실패하면 helperType이 붙은 Error로 거절된다: login(401) · member(403) · timeout · unavailable(503) · invalid(502/형식) · network
    //   게임 자료 화면은 가격이 실패해도 계속 보여야 한다 — 이 실패는 가격 자리만 비우는 데 쓴다.
    async function uex(path, options = {}) {
        const key = String(path || '').replace(/^\/+/, '');
        if (!/^[a-z][a-z0-9/-]*(\?[\w=&.-]*)?$/i.test(key) || key.includes('..')) throw makeError('invalid', `Bad UEX path: ${path}`);
        const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 10 * 60 * 1000;
        const cached = uexCache.get(key);
        if (!options.refresh && cached && Date.now() - cached.receivedAt < ttlMs) return cached;
        if (!options.refresh && uexPending.has(key)) return uexPending.get(key);

        const pending = (async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), Number.isFinite(options.timeoutMs) ? options.timeoutMs : UEX_TIMEOUT_MS);
            let response;
            try {
                const url = `${UEX_BASE}/${key}${options.refresh ? `${key.includes('?') ? '&' : '?'}refresh=1` : ''}`;
                response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
            } catch (error) {
                throw makeError(error?.name === 'AbortError' ? 'timeout' : 'network', `UEX ${error?.name === 'AbortError' ? 'timeout' : 'network error'}: ${key}`);
            } finally {
                clearTimeout(timer);
            }
            if (response.status === 401) throw makeError('login', 'UEX 401', 401);
            if (response.status === 403) throw makeError('member', 'UEX 403', 403);
            if (response.status === 502) throw makeError('invalid', 'UEX 502', 502);
            if (response.status === 503) throw makeError('unavailable', 'UEX 503', 503);
            if (!response.ok) throw makeError('network', `UEX ${response.status}`, response.status);
            let payload;
            try {
                payload = await response.json();
            } catch (_error) {
                throw makeError('invalid', `UEX JSON parse failed: ${key}`);
            }
            if (!payload || payload.status !== 'ok' || payload.data === null || typeof payload.data !== 'object') {
                throw makeError('invalid', `Invalid UEX payload: ${key}`);
            }
            const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
            const result = { data: payload.data, meta, stale: meta.stale === true, receivedAt: Date.now() };
            uexCache.set(key, result);
            return result;
        })();
        uexPending.set(key, pending);
        try {
            return await pending;
        } finally {
            if (uexPending.get(key) === pending) uexPending.delete(key);
        }
    }

    // ── DOM 도우미 (innerHTML 없이) ────────────────────────────────────────
    // el('p', { class: 'x', 'data-id': 3 }, '글자', childNode)
    function el(tag, attrs, ...children) {
        const node = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) return;
            if (key === 'class') node.className = String(value);
            else if (key === 'text') node.textContent = String(value);
            else node.setAttribute(key, value === true ? '' : String(value));
        });
        children.flat().forEach((child) => {
            if (child === null || child === undefined || child === false) return;
            node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        });
        return node;
    }

    // 자리 표시 화면. 화면 파일이 완성되면 더는 부르지 않는다.
    function comingSoon(mount, section) {
        if (!mount) return;
        const title = SECTIONS[section] ? window.VOLT_I18N?.t?.(SECTIONS[section].titleKey) : '';
        mount.replaceChildren(el('div', { class: 'helper-soon', 'data-helper-soon': section || '' },
            el('strong', { class: 'helper-soon-title' }, title ? `${title} — ${text('soonTitle')}` : text('soonTitle')),
            el('p', { class: 'helper-soon-body' }, text('soonBody'))));
    }

    // ── 섹션 연결 (navigation.js가 부른다) ─────────────────────────────────
    const started = new Set();
    const delivered = new Map(); // 섹션 → 마지막으로 화면 모듈에 넘긴 주소 값
    let languageHooked = false;

    function moduleOf(section) {
        const entry = SECTIONS[section];
        return entry ? window[entry.global] : null;
    }

    function updateTitle(section) {
        const entry = SECTIONS[section];
        const i18n = window.VOLT_I18N;
        if (!entry || !i18n?.t) return;
        document.title = `${i18n.t(entry.titleKey)} | ${i18n.t('meta.title')}`;
    }

    function hookLanguage() {
        if (languageHooked || !window.VOLT_I18N?.onChange) return;
        languageHooked = true;
        window.VOLT_I18N.onChange((nextLang) => {
            const code = nextLang === 'en' ? 'en' : 'ko';
            started.forEach((section) => {
                try {
                    moduleOf(section)?.onLanguageChange?.(code);
                } catch (error) {
                    console.error(`[helper] ${section}.onLanguageChange failed`, error);
                }
            });
            // main.js가 탭 제목을 기본값으로 되돌린 뒤에 다시 맞춘다.
            const active = parseHash().section;
            if (SECTIONS[active]) window.setTimeout(() => updateTitle(active), 0);
        });
    }

    // 섹션이 화면에 나올 때마다 불린다. 처음이면 init, 그다음부터는 onRoute.
    function onSectionShow(section, params) {
        const entry = SECTIONS[section];
        if (!entry || !document.getElementById(section)?.hasAttribute('data-helper-allowed')) return;
        hookLanguage();
        updateTitle(section);
        const mount = document.getElementById(entry.mount);
        if (!mount) return;
        const module = moduleOf(section);
        const routeParams = params || readHash(section);
        // 주소가 한 번 바뀌어도 라우터는 popstate와 hashchange로 두 번 부른다. 이미 열려 있고 값이 같으면 다시 넘기지 않는다.
        const key = JSON.stringify(Object.entries(routeParams).sort());
        const alreadyOpen = document.getElementById(section)?.classList.contains('active');
        if (started.has(section) && alreadyOpen && delivered.get(section) === key) return;
        delivered.set(section, key);
        if (!module || typeof module.init !== 'function') {
            mount.replaceChildren(el('p', { class: 'helper-soon helper-soon-error', role: 'alert' }, text('moduleMissing')));
            return;
        }
        try {
            if (!started.has(section)) {
                started.add(section);
                module.init(mount, { section, lang: lang(), params: routeParams });
            } else {
                module.onRoute?.(routeParams);
            }
        } catch (error) {
            console.error(`[helper] ${section} failed to start`, error);
            mount.replaceChildren(el('p', { class: 'helper-soon helper-soon-error', role: 'alert' }, text('moduleMissing')));
        }
    }

    function systemLabel(system) {
        if (!system) return lang() === 'ko' ? '전체 항성계' : 'All systems';
        const labels = { Stanton: '스탠턴', Pyro: '파이로', Nyx: '닉스' };
        return lang() === 'ko' ? labels[system] || system : system;
    }

    function conditionSummary(state, ship, capacity) {
        const ko = lang() === 'ko';
        const budget = state.budget == null ? (ko ? '예산 제한 없음' : 'Unlimited budget') : price(state.budget);
        const vessel = ship && Number.isFinite(capacity) ? `${ship} · ${scu(capacity)}` : ship;
        return [vessel || (ko ? '함선 미선택' : 'No ship selected'), budget, systemLabel(state.system),
            ko ? `${num(state.maxAgeDays, { digits: 1 })}일 이내 가격` : `Prices within ${num(state.maxAgeDays, { digits: 1 })} days`].join(' · ');
    }

    function conditionRow(state, ship, capacity) {
        const ko = lang() === 'ko';
        return `<strong>${ko ? '내 조건' : 'My settings'}</strong><span class="helper-condition-values">${esc(conditionSummary(state, ship, capacity))}</span><span class="helper-condition-edit">${ko ? '바꾸기' : 'Edit'}</span>`;
    }

    window.VOLT_HELPER = {
        conditionRow,
        conditionSummary, systemLabel,
        SECTIONS, HASH_SECTIONS, DEFAULT_PRICE_AGE_DAYS, CACHE_VERSION,
        lang, text, translator, name, esc,
        isKnown, unknown, num, price, scu, percent, age, ageSeconds, ageLevel, duration, sourceLine,
        chips,
        parseHash, buildHash, readHash, writeHash, shareUrl, copyShareUrl, go,
        loadJson, uex, errorType, errorText,
        el, comingSoon,
        onSectionShow, updateTitle,
    };
})();
