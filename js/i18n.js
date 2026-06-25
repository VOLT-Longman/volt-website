/**
 * VOLT 런타임 i18n 레이어 (빌드 없는 정적 SPA용)
 *
 * - KO/EN 문자열 테이블 + t(key)
 * - 최초 언어 감지: localStorage > Accept-Language(navigator) > 비한국어면 en
 * - <html lang> 동적 변경 + 메타 태그 갱신
 * - data-i18n / data-i18n-html / data-i18n-aria-label / data-i18n-placeholder 치환
 * - onChange(cb): 언어 변경 시 main.js 등이 동적 콘텐츠를 다시 렌더하도록 통지
 *
 * 로드 순서: navigation.js/main.js보다 먼저 로드되어야 한다.
 * CSP: 인라인 스크립트 없이 이 외부 파일로만 처리한다.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'volt-lang';
    const SUPPORTED = ['ko', 'en'];
    const listeners = [];
    let current = 'ko';

    const STRINGS = {
        ko: {
            'lang.toggleAria': '언어 변경 (한국어/English)',
            // 메타
            'meta.title': 'VOLT - Voyagers of Logistics and Trade | 한국 스타시티즌 함대',
            'meta.description': 'VOLT는 한국 커뮤니티 Star Citizen 물류·무역 전문 함대입니다. 안전한 운송, 체계적인 무역, 전문적인 정보 전달을 핵심 가치로 운영됩니다.',
            'meta.ogTitle': 'VOLT - Voyagers of Logistics and Trade',
            'meta.ogDescription': '한국 커뮤니티의 Star Citizen 물류·무역 전문 함대',
            // 네비게이션
            'nav.about': '소개',
            'nav.ships': '함선DB',
            'nav.trade': '무역',
            'nav.tradePlanner': '무역플래너',
            'nav.tradeHub': '무역허브',
            'nav.tradeGuide': '무역가이드',
            'nav.notices': '공지',
            'nav.schedule': '일정',
            'nav.more': '더보기',
            'nav.history': '연혁',
            'nav.leadership': '임원진',
            'nav.partners': '협력함대',
            'nav.streamers': '스트리머',
            'nav.gallery': '갤러리',
            'nav.policy': '정책',
            'nav.faq': 'FAQ',
            'nav.comms': 'VOLT Comms',
            'nav.discordLogin': 'Discord 로그인',
            'nav.join': '가입하기',
            'nav.menu': 'VOLT 메뉴',
            'nav.searchAria': '검색 열기',
            'nav.themeAria': '테마 변경',
            'nav.menuOpenAria': '메뉴 열기',
            'nav.menuCloseAria': '메뉴 닫기',
            'nav.close': '닫기',
            'nav.discordJoin': 'Discord 참여',
            'nav.themeMobile': '라이트 모드로 전환',
            'nav.searchMobile': '검색 열기',
            'nav.menuCloseSecondary': '메뉴 닫기',
            // 히어로
            'hero.logoAlt': 'VOLT 함대 로고',
            'hero.subtitle': '물류와 무역을 위해 여행하는 항해자',
            'hero.description': '한국 기반 Star Citizen 물류·무역 전문 함대.<br>안전한 운송, 체계적인 무역, 전문적인 정보 전달을 핵심 가치로 운영됩니다.',
            'hero.btnDiscord': 'Discord 참여',
            'hero.btnAbout': '함대 알아보기',
            'hero.statEst': 'EST.',
            'hero.statMembers': 'MEMBERS',
            'hero.statTimezone': 'TIMEZONE',
            'hero.statRegion': 'REGION',
            // About
            'about.title': 'VOLT <span class="accent">소개</span>',
            'about.subtitle': '전문성과 신뢰를 기반으로 운영되는 함대',
            'about.introHeading': 'VOLT란?',
            'about.introBody': 'VOLT는 전략적 작전과 자율적 참여를 기반으로 한 한국 커뮤니티 Star Citizen 함대입니다. 물류·무역을 중심으로 전투, 정보, 커뮤니티 운영을 아우르는 통합된 체계적 구조를 갖추고 있으며, 대규모 작전에서도 충돌과 혼란을 최소화하도록 설계되었습니다.',
            'about.introSecondary': '"자율적으로 참여하되, 기준은 명확하다" — VOLT는 강압이 아닌 구조적 리더십을 통해, 구성원들이 예측 가능한 규칙 안에서 안정적으로 협업하는 환경을 추구합니다.',
            'about.cultureHeading': 'VOLT의 핵심 가치',
            'about.infoHeading': '함대 정보',
            'about.infoTimezone': '아시아 (KST)',
            'about.infoCoreValues': '효율 · 조직화 · 확장',
            // 정책 / FAQ
            'policy.title': '함대 <span class="accent">운영정책</span>',
            'policy.subtitle': '2026년 5월 15일 정식 시행',
            'policy.lastUpdatedLabel': '최종 업데이트:',
            'faq.title': '자주 묻는 <span class="accent">질문</span>',
            'faq.subtitle': 'VOLT 함대 FAQ',
            // 푸터
            'footer.tagline': 'Voyagers of Logistics &amp; Trade<br>한국 커뮤니티 Star Citizen 함대',
            'footer.about': '소개',
            'footer.aboutFleet': '함대 소개',
            'footer.content': '콘텐츠',
            'footer.community': '커뮤니티',
            'footer.copyright': '© 2953–2956 VOLT FLEET · ALL RIGHTS RESERVED'
        },
        en: {
            'lang.toggleAria': 'Change language (Korean/English)',
            // meta
            'meta.title': 'VOLT — Voyagers of Logistics and Trade | Korean Star Citizen Fleet',
            'meta.description': 'VOLT is a Korea-based Star Citizen fleet specializing in logistics and trade — built on secure transport, systematic trading, and reliable intel sharing.',
            'meta.ogTitle': 'VOLT — Voyagers of Logistics and Trade',
            'meta.ogDescription': 'A Korea-based Star Citizen fleet specializing in logistics and trade.',
            // navigation
            'nav.about': 'About',
            'nav.ships': 'Ship DB',
            'nav.trade': 'Trade',
            'nav.tradePlanner': 'Trade Planner',
            'nav.tradeHub': 'Trade Hub',
            'nav.tradeGuide': 'Trade Guide',
            'nav.notices': 'Notices',
            'nav.schedule': 'Schedule',
            'nav.more': 'More',
            'nav.history': 'History',
            'nav.leadership': 'Leadership',
            'nav.partners': 'Partner Fleets',
            'nav.streamers': 'Streamers',
            'nav.gallery': 'Gallery',
            'nav.policy': 'Policy',
            'nav.faq': 'FAQ',
            'nav.comms': 'VOLT Comms',
            'nav.discordLogin': 'Discord Login',
            'nav.join': 'Join',
            'nav.menu': 'VOLT Menu',
            'nav.searchAria': 'Open search',
            'nav.themeAria': 'Toggle theme',
            'nav.menuOpenAria': 'Open menu',
            'nav.menuCloseAria': 'Close menu',
            'nav.close': 'Close',
            'nav.discordJoin': 'Join Discord',
            'nav.themeMobile': 'Switch to light mode',
            'nav.searchMobile': 'Open search',
            'nav.menuCloseSecondary': 'Close menu',
            // hero
            'hero.logoAlt': 'VOLT fleet logo',
            'hero.subtitle': 'Voyagers charting the routes of logistics and trade',
            'hero.description': 'A Korea-based Star Citizen fleet specializing in logistics and trade.<br>We operate on the core values of secure transport, systematic trading, and reliable intel sharing.',
            'hero.btnDiscord': 'Join our Discord',
            'hero.btnAbout': 'About the fleet',
            'hero.statEst': 'EST.',
            'hero.statMembers': 'MEMBERS',
            'hero.statTimezone': 'TIMEZONE',
            'hero.statRegion': 'REGION',
            // About (수치 비포함 문장만 — 설립일/멤버 규모는 사실값 확정 후 별도 반영)
            'about.title': '<span class="accent">About</span> VOLT',
            'about.subtitle': 'A fleet run on professionalism and trust',
            'about.introHeading': 'What is VOLT?',
            'about.introBody': 'VOLT is a Korean-community Star Citizen fleet built on strategic operations and voluntary participation. Centered on logistics and trade — and extending into combat, intel, and community operations — it runs on a single, well-structured system designed to keep even large-scale operations clear and friction-free.',
            'about.introSecondary': '"Take part on your own terms, but the standards are clear." VOLT leads through structure rather than pressure, giving members a stable environment to collaborate within predictable rules.',
            'about.cultureHeading': 'Our Core Values',
            'about.infoHeading': 'Fleet Info',
            'about.infoTimezone': 'Asia (KST)',
            'about.infoCoreValues': 'Efficiency · Organization · Scale',
            // Policy / FAQ
            'policy.title': 'Fleet <span class="accent">Operating Policy</span>',
            'policy.subtitle': 'In effect since May 15, 2026',
            'policy.lastUpdatedLabel': 'Last updated:',
            'faq.title': 'Frequently Asked <span class="accent">Questions</span>',
            'faq.subtitle': 'VOLT Fleet FAQ',
            // footer
            'footer.tagline': 'Voyagers of Logistics &amp; Trade<br>A Korean-community Star Citizen fleet',
            'footer.about': 'About',
            'footer.aboutFleet': 'About the fleet',
            'footer.content': 'Content',
            'footer.community': 'Community',
            'footer.copyright': '© 2953–2956 VOLT FLEET · ALL RIGHTS RESERVED'
        }
    };

    function detectInitial() {
        try {
            // URL ?lang= 가 최우선(공유 링크/hreflang 진입). 들어오면 저장한다.
            const fromUrl = new URLSearchParams(window.location.search).get('lang');
            if (fromUrl && SUPPORTED.indexOf(fromUrl) !== -1) {
                try { localStorage.setItem(STORAGE_KEY, fromUrl); } catch (_e2) { /* 무시 */ }
                return fromUrl;
            }
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
        } catch (_e) { /* localStorage 비활성 환경 무시 */ }
        const langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
        return langs.some((l) => String(l).toLowerCase().indexOf('ko') === 0) ? 'ko' : 'en';
    }

    function t(key) {
        const table = STRINGS[current] || STRINGS.ko;
        if (key in table) return table[key];
        if (key in STRINGS.ko) return STRINGS.ko[key];
        return key;
    }

    function getLang() { return current; }

    function applyMeta() {
        document.documentElement.lang = current;
        const title = t('meta.title');
        if (title) document.title = title;
        const setMeta = (selector, value) => {
            const el = document.querySelector(selector);
            if (el && value) el.setAttribute('content', value);
        };
        setMeta('meta[name="description"]', t('meta.description'));
        setMeta('meta[property="og:title"]', t('meta.ogTitle'));
        setMeta('meta[property="og:description"]', t('meta.ogDescription'));
        setMeta('meta[name="twitter:title"]', t('meta.ogTitle'));
        setMeta('meta[name="twitter:description"]', t('meta.ogDescription'));
        setMeta('meta[property="og:locale"]', current === 'ko' ? 'ko_KR' : 'en_US');
    }

    function applyStatic(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-i18n]').forEach((el) => {
            const value = t(el.getAttribute('data-i18n'));
            if (value !== undefined) el.textContent = value;
        });
        scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
            const value = t(el.getAttribute('data-i18n-html'));
            if (value !== undefined) el.innerHTML = value;
        });
        [['data-i18n-aria-label', 'aria-label'], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-title', 'title'], ['data-i18n-alt', 'alt']].forEach((pair) => {
            scope.querySelectorAll('[' + pair[0] + ']').forEach((el) => {
                const value = t(el.getAttribute(pair[0]));
                if (value !== undefined) el.setAttribute(pair[1], value);
            });
        });
    }

    function updateToggle() {
        document.querySelectorAll('[data-set-lang]').forEach((btn) => {
            const isActive = btn.getAttribute('data-set-lang') === current;
            btn.classList.toggle('lang-active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
        });
    }

    function setLang(lang) {
        if (SUPPORTED.indexOf(lang) === -1 || lang === current) {
            if (lang === current) updateToggle();
            return;
        }
        current = lang;
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (_e) { /* 무시 */ }
        applyMeta();
        applyStatic(document);
        updateToggle();
        listeners.forEach((cb) => { try { cb(current); } catch (_e) { /* 리스너 오류 격리 */ } });
    }

    function toggle() { setLang(current === 'ko' ? 'en' : 'ko'); }

    function onChange(cb) { if (typeof cb === 'function') listeners.push(cb); }

    function setupControls() {
        document.querySelectorAll('[data-set-lang]').forEach((btn) => {
            btn.addEventListener('click', () => setLang(btn.getAttribute('data-set-lang')));
        });
        document.querySelectorAll('[data-lang-toggle]').forEach((btn) => {
            btn.addEventListener('click', toggle);
        });
    }

    function init() {
        current = detectInitial();
        applyMeta();
        applyStatic(document);
        setupControls();
        updateToggle();
    }

    window.VOLT_I18N = { init, t, getLang, setLang, toggle, onChange, applyStatic };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
