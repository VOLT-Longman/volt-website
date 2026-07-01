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
            // 일정 / 연혁
            'schedule.title': '작전 <span class="accent">일정</span>',
            'schedule.subtitle': '함대 주요 일정 및 이벤트',
            'timeline.title': '함대 <span class="accent">연혁</span>',
            'timeline.subtitle': 'VOLT가 걸어온 길',
            // 무역플래너 (부분 i18n)
            'planner.mobileHint': '무역플래너는 데스크톱에서 더 편하게 이용할 수 있습니다. 모바일에서는 핵심 정보 위주로 표시됩니다.',
            'planner.loc.label': '거래 위치',
            'planner.loc.all': '전체',
            'planner.loc.auto': '스테이션/도시',
            'planner.loc.ground': '지상기지',
            'planner.sys.label': '항성계',
            'planner.sys.all': '전체',
            'planner.badge.station': '스테이션',
            'planner.badge.city': '도시',
            'planner.badge.ground': '지상기지',
            'planner.badge.unclassified': '미분류',
            'planner.rec.basisAll': '추천 기준: 전체 거래 후보',
            'planner.rec.basisAuto': '추천 기준: 스테이션/도시 거래 후보',
            'planner.rec.basisGround': '추천 기준: 지상기지 거래 후보',
            'planner.rec.emptyFiltered': '현재 선택한 위치 조건에서 추천 가능한 무역품이 없습니다. 전체 필터로 변경하거나 다른 상품을 선택해 주세요.',
            'planner.rec.emptyAll': '추천 가능한 거래 후보가 없습니다. UEX Corp에서 직접 확인해 주세요.',
            // 함선DB
            'ships.title': '함선 데이터베이스',
            'ships.titleHtml': '함선 <span class="accent">데이터베이스</span>',
            'ships.subtitle': 'Star Citizen 주요 함선 정보',
            'ships.sortAria': '정렬 기준',
            'ships.tagFilterAria': '역할 태그 필터 (복수 선택 가능)',
            'ships.searchPlaceholder': '함선명 또는 제조사 검색...',
            'ships.mfrAll': '제조사 전체',
            'ships.mfr': '제조사',
            'ships.sortNameAsc': '이름 가나다순',
            'ships.sortNameDesc': '이름 역순',
            'ships.sortSizeAsc': '크기 작은순',
            'ships.sortSizeDesc': '크기 큰순',
            'ships.sortCrewAsc': '승무원 적은순',
            'ships.sortCrewDesc': '승무원 많은순',
            'ships.sortCargoAsc': '화물 적은순',
            'ships.sortCargoDesc': '화물 많은순',
            'ships.sortPriceAsc': '가격 낮은순',
            'ships.sortPriceDesc': '가격 높은순',
            'ships.advanced': '상세 필터',
            'ships.cargoMin': '최소 화물량',
            'ships.cargoAll': '전체',
            'ships.purposeLabel': '목적별 추천',
            'ships.purposeNone': '선택 안 함',
            'ships.hideUnreleased': '미구현 제외',
            'ships.hangarOnly': '내 격납고만',
            'ships.filterReset': '필터 초기화',
            'ships.compareBar': '비교함',
            'ships.compareClear': '초기화',
            'ships.compareOpen': '비교 보기',
            'ships.allTags': '전체',
            'ships.empty': '검색 결과가 없습니다.',
            'ships.cargo': '화물',
            'ships.priceUsd': 'USD 가격',
            'ships.priceTbd': '미공개',
            'ships.viewDetail': '상세 보기',
            'ships.compareAdd': '비교 추가',
            'ships.compareRemove': '비교 제거',
            'ships.role': '역할',
            'ships.size': '크기',
            'ships.crew': '승무원',
            'ships.focus': '분류',
            'ships.modalClose': '모달 닫기',
            'ships.officialPage': 'RSI 공식 페이지',
            'ships.shipMatrix': 'RSI 함선 매트릭스',
            'ships.usePlanner': '무역 플래너에서 사용',
            'ships.hangarAdd': '격납고에 추가',
            'ships.hangarRemove': '격납고에서 제거',
            'ships.hangarOwned': '격납고에 있음',
            'ships.compareTitle': '함선 비교',
            'ships.compareField': '항목',
            'ships.compareSummary': '비교 요약',
            'ships.maxCargo': '최대 화물량',
            'ships.minCrew': '최소 인원 운용',
            'ships.largeOps': '대형 작전',
            'ships.smallOps': '소규모/입문 운용',
            'ships.currentPicks': '현재 추천 함선',
            'ships.note.cargo': '물류/화물 운송 후보',
            'ships.note.starter': '입문자 운용 후보',
            'ships.note.wip': '현재 실사용 주의',
            'ships.note.specialized': '특화 태그 중심 운용',
            // 함선 분류(focus/tag) 라벨 — KO는 원문 그대로
            'ship.cat.기함': '기함', 'ship.cat.다목적': '다목적', 'ship.cat.레이싱': '레이싱',
            'ship.cat.방송': '방송', 'ship.cat.수송': '수송', 'ship.cat.연구': '연구',
            'ship.cat.의료': '의료', 'ship.cat.인양': '인양', 'ship.cat.입문': '입문',
            'ship.cat.전투': '전투', 'ship.cat.정제': '정제', 'ship.cat.주유': '주유',
            'ship.cat.지원': '지원', 'ship.cat.채굴': '채굴', 'ship.cat.탐사': '탐사',
            'ship.cat.화물': '화물', 'ship.cat.모듈형': '모듈형', 'ship.cat.미구현': '미구현',
            'ship.cat.지상': '지상',
            // 무역플래너 원장(ledger)
            'ledger.title': '수익 관리 원장',
            'ledger.intro': '여러 무역품의 매수·매도·이윤을 한눈에 관리합니다. UEX에서 후보를 선택해 추가하세요.',
            'ledger.qtyLabel': '수량 (SCU)',
            'ledger.add': '원장에 추가',
            'ledger.addHint': 'UEX에서 매수·매도 후보를 선택한 뒤 수량을 입력하고 추가하세요.',
            'ledger.clear': '전체 비우기',
            'ledger.empty': '아직 추가된 무역품이 없습니다.',
            'ledger.col.commodity': '품목',
            'ledger.col.buy': '구입처',
            'ledger.col.sell': '판매처',
            'ledger.col.qty': '수량',
            'ledger.col.buyTotal': '총매수',
            'ledger.col.sellTotal': '총매도',
            'ledger.col.profit': '이윤',
            'ledger.col.remove': '삭제',
            'ledger.total': '합계',
            'ledger.errNoModel': '먼저 UEX에서 상품과 매수·매도 후보를 선택하세요.',
            'ledger.errQty': '수량(SCU)을 1 이상 입력하세요.',
            'ledger.added': '원장에 추가했습니다.',
            // 임원진·스트리머·협력함대 UI
            'leadership.keyCompetencies': '핵심 역량',
            'leadership.viewDetail': '자세히 보기 →',
            'leadership.detailAria': '상세 보기',
            'leadership.duties': '주요 업무',
            'streamers.watch': '방송 보기',
            'partner.members': '멤버',
            'partner.founded': '창설',
            'partner.website': '웹사이트',
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
            // Schedule / History
            'schedule.title': 'Operations <span class="accent">Schedule</span>',
            'schedule.subtitle': 'Key fleet dates & events',
            'timeline.title': 'Fleet <span class="accent">History</span>',
            'timeline.subtitle': "VOLT's journey so far",
            // Trade Planner (partial i18n)
            'planner.mobileHint': 'The Trade Planner works best on desktop. On mobile, only the key information is shown.',
            'planner.loc.label': 'Trade location',
            'planner.loc.all': 'All',
            'planner.loc.auto': 'Station/City',
            'planner.loc.ground': 'Ground outpost',
            'planner.sys.label': 'Star system',
            'planner.sys.all': 'All',
            'planner.badge.station': 'Station',
            'planner.badge.city': 'City',
            'planner.badge.ground': 'Ground',
            'planner.badge.unclassified': 'Unclassified',
            'planner.rec.basisAll': 'Basis: all trade candidates',
            'planner.rec.basisAuto': 'Basis: Station/City candidates',
            'planner.rec.basisGround': 'Basis: ground-outpost candidates',
            'planner.rec.emptyFiltered': 'No recommended commodities match the selected location filter. Try the All filter or pick a different commodity.',
            'planner.rec.emptyAll': 'No tradable candidates to recommend. Please double-check on UEX Corp.',
            // Ship database
            'ships.title': 'Ship Database',
            'ships.titleHtml': 'Ship <span class="accent">Database</span>',
            'ships.subtitle': 'Key Star Citizen ship data',
            'ships.sortAria': 'Sort by',
            'ships.tagFilterAria': 'Role tag filter (multi-select)',
            'ships.searchPlaceholder': 'Search by ship or manufacturer...',
            'ships.mfrAll': 'All manufacturers',
            'ships.mfr': 'Manufacturer',
            'ships.sortNameAsc': 'Name A–Z',
            'ships.sortNameDesc': 'Name Z–A',
            'ships.sortSizeAsc': 'Size: small first',
            'ships.sortSizeDesc': 'Size: large first',
            'ships.sortCrewAsc': 'Crew: fewest',
            'ships.sortCrewDesc': 'Crew: most',
            'ships.sortCargoAsc': 'Cargo: least',
            'ships.sortCargoDesc': 'Cargo: most',
            'ships.sortPriceAsc': 'Price: low to high',
            'ships.sortPriceDesc': 'Price: high to low',
            'ships.advanced': 'Filters',
            'ships.cargoMin': 'Min cargo',
            'ships.cargoAll': 'All',
            'ships.purposeLabel': 'By purpose',
            'ships.purposeNone': 'None',
            'ships.hideUnreleased': 'Hide unimplemented',
            'ships.hangarOnly': 'My hangar only',
            'ships.filterReset': 'Reset filters',
            'ships.compareBar': 'Compare',
            'ships.compareClear': 'Clear',
            'ships.compareOpen': 'View comparison',
            'ships.allTags': 'All',
            'ships.empty': 'No results found.',
            'ships.cargo': 'Cargo',
            'ships.priceUsd': 'USD price',
            'ships.priceTbd': 'TBD',
            'ships.viewDetail': 'view details',
            'ships.compareAdd': 'Add to compare',
            'ships.compareRemove': 'Remove',
            'ships.role': 'Role',
            'ships.size': 'Size',
            'ships.crew': 'Crew',
            'ships.focus': 'Class',
            'ships.modalClose': 'Close modal',
            'ships.officialPage': 'RSI official page',
            'ships.shipMatrix': 'RSI Ship Matrix',
            'ships.usePlanner': 'Use in Trade Planner',
            'ships.hangarAdd': 'Add to hangar',
            'ships.hangarRemove': 'Remove from hangar',
            'ships.hangarOwned': 'In hangar',
            'ships.compareTitle': 'Ship comparison',
            'ships.compareField': 'Field',
            'ships.compareSummary': 'Comparison summary',
            'ships.maxCargo': 'Most cargo',
            'ships.minCrew': 'Fewest crew',
            'ships.largeOps': 'Large operations',
            'ships.smallOps': 'Small / starter ops',
            'ships.currentPicks': 'Current picks',
            'ships.note.cargo': 'Logistics / cargo hauling candidate',
            'ships.note.starter': 'Good for new players',
            'ships.note.wip': 'Not yet flyable — use with caution',
            'ships.note.specialized': 'Operate around its specialized tags',
            // Ship class/tag labels
            'ship.cat.기함': 'Flagship', 'ship.cat.다목적': 'Multi-role', 'ship.cat.레이싱': 'Racing',
            'ship.cat.방송': 'Broadcast', 'ship.cat.수송': 'Transport', 'ship.cat.연구': 'Research',
            'ship.cat.의료': 'Medical', 'ship.cat.인양': 'Salvage', 'ship.cat.입문': 'Starter',
            'ship.cat.전투': 'Combat', 'ship.cat.정제': 'Refinery', 'ship.cat.주유': 'Refuel',
            'ship.cat.지원': 'Support', 'ship.cat.채굴': 'Mining', 'ship.cat.탐사': 'Exploration',
            'ship.cat.화물': 'Cargo', 'ship.cat.모듈형': 'Modular', 'ship.cat.미구현': 'Unimplemented',
            'ship.cat.지상': 'Ground',
            // Trade ledger
            'ledger.title': 'Profit Ledger',
            'ledger.intro': 'Track buy, sell, and profit across multiple commodities at a glance. Add candidates from UEX.',
            'ledger.qtyLabel': 'Quantity (SCU)',
            'ledger.add': 'Add to ledger',
            'ledger.addHint': 'Select buy/sell candidates in UEX, enter a quantity, then add.',
            'ledger.clear': 'Clear all',
            'ledger.empty': 'No commodities added yet.',
            'ledger.col.commodity': 'Commodity',
            'ledger.col.buy': 'Buy',
            'ledger.col.sell': 'Sell',
            'ledger.col.qty': 'Qty',
            'ledger.col.buyTotal': 'Buy total',
            'ledger.col.sellTotal': 'Sell total',
            'ledger.col.profit': 'Profit',
            'ledger.col.remove': 'Remove',
            'ledger.total': 'Total',
            'ledger.errNoModel': 'Select a commodity and buy/sell candidates in UEX first.',
            'ledger.errQty': 'Enter a quantity (SCU) of 1 or more.',
            'ledger.added': 'Added to the ledger.',
            // Leadership / streamers / partner UI
            'leadership.keyCompetencies': 'Key competencies',
            'leadership.viewDetail': 'View details →',
            'leadership.detailAria': 'View details',
            'leadership.duties': 'Key duties',
            'streamers.watch': 'Watch stream',
            'partner.members': 'members',
            'partner.founded': 'Founded',
            'partner.website': 'Website',
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
