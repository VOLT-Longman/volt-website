/**
 * VOLT 시세 · 거래소 (#market)
 *
 * 이 파일과 css/market.css 는 이 화면 전용이다. 공용 파일은 고치지 않는다. 계약: docs/helper-tools.md, docs/trade-engine.md
 * 공개 형태: window.VOLT_MARKET = { init(mount, ctx), onLanguageChange(lang), onRoute(params) }
 *
 * 네 개의 탭:
 *   prices   상품 시세 — 상품별 가장 싼 구매처·가장 비싼 판매처·차익, 상품 하나의 거래소별 표, 내 함선 추천 경로
 *   stations 거래소 — 거래소 목록과 한 곳의 정보(시설, 사고파는 상품, "여기에 있어요")
 *   movers   가격 변동 — 지금 가격과 UEX 15일 평균 비교 (UEX 원본 표에 평균이 있을 때만)
 *   ships    화물선 고르기 — 살 수 있는/빌릴 수 있는 화물선과 화물칸 보기
 *
 * 주소 값 (#market?...):
 *   tab   prices | stations | movers | ships      (link 키. 없으면 t 만 있을 때 stations, 그 밖에는 prices)
 *   c     UEX 상품 id (link 키)                    prices: 상품 하나 보기 · movers: 이 상품의 변동
 *   t     UEX 터미널 id (link 키)                  stations: 거래소 하나 보기 · movers: 이 거래소의 변동
 *   q     검색어            sys  항성계 칩(포함/제외)      sort  상품 목록 정렬 (margin | marginPercent | name)
 *   fac   거래소 시설 조건 (쉼표 목록: refinery,freightElevator,autoLoad,loadingDock)
 *   box   거래소의 가장 큰 상자가 이 크기 이상
 *   ht,hc 가격 기록을 볼 터미널 id · 상품 id      scan  1 = 가격 변동 탭에서 차익 큰 상품 여러 개를 살펴본 결과
 *   ship  화물칸을 볼 함선 id      mode  buy | rent | both
 * 내 함선·가진 돈·가격 기준일은 주소가 아니라 VOLT_TRADE_ENGINE.state 에 둔다.
 *
 * 그리기: draw() 한 곳에서만 HTML 문자열을 넣는다. 모든 값은 H.esc() 를 거친다.
 */
(function () {
    'use strict';

    const H = window.VOLT_HELPER;
    const E = window.VOLT_TRADE_ENGINE;
    const SECTION = 'market';
    const TABS = ['prices', 'stations', 'movers', 'ships'];
    const PRICE_SORT = ['name', 'buy', 'sell', 'margin', 'marginPercent', 'places'];
    const PRICE_LABEL = ['commodity', 'cheapestBuy', 'bestSell', 'margin', 'marginPercent', 'places'];
    const SORTS = PRICE_SORT.flatMap(key => [key, key + '-rev']);
    const priceDown = key => key !== 'name' && key !== 'buy';
    const MODES = ['both', 'buy', 'rent'];
    const FACILITY_FILTERS = ['refinery', 'freightElevator', 'autoLoad', 'loadingDock'];
    const FLAG_ORDER = ['refinery', 'freightElevator', 'autoLoad', 'loadingDock', 'cargoCenter', 'dockingPort', 'refuel', 'repair', 'nqa', 'playerOwned'];
    const AMENITY_FOR_FLAG = { refinery: 'ref', freightElevator: 'fe', loadingDock: 'ld' };
    const AGE_CHOICES = [1, 3, 7, 15];
    const UEX_AVERAGE_DAYS = 15;   // UEX 평균의 기간 (docs/uex-endpoints.md 6번)
    const SCAN_COUNT = 12;         // "여러 상품 살펴보기"가 한 번에 받아 오는 상품 수
    const LIST_LIMIT = 20;
    const BUDGET_CHUNK = 10;
    const HISTORY_ROWS = 12;       // 가격 기록 표에 처음 보여 주는 보고 수
    const esc = H.esc;

    const TEXT = {
        ko: {
            loading: '자료를 불러오는 중입니다…',
            loadingPrices: '가격을 불러오는 중입니다…',
            retry: '다시 시도',
            tabsLabel: '시세 화면 탭',
            tabPrices: '상품 시세',
            tabStations: '거래 장소',
            tabMovers: '가격 변동',
            tabShips: '화물선 고르기',
            mine: '내 조건',
            mineNote: '이 값은 무역 경로·순회 무역 화면과 함께 씁니다. 이 기기에만 저장됩니다.',
            myShip: '내 함선',
            noShip: '고르지 않음',
            myMoney: '쓸 수 있는 돈 (aUEC)',
            moneyHint: '비워 두면 돈 제한 없이 계산합니다',
            maxAge: '가격 보고 기준',
            maxAgeDays: '{n}일 이내 보고만',
            systems: '항성계',
            systemsHint: '누를 때마다 상관없음 → 포함 → 제외로 바뀝니다',
            refresh: '가격 새로 받기',
            copy: '이 화면 주소 복사',
            search: '검색',
            searchCommodity: '상품 이름으로 찾기',
            searchStation: '거래소 이름으로 찾기',
            sort: '정렬',
            sortMargin: '차익 큰 순',
            sortMarginPercent: '차익률 높은 순',
            sortName: '이름 순',
            commodity: '상품',
            cheapestBuy: '가장 싼 구매처',
            bestSell: '가장 비싼 판매처',
            margin: '1 SCU 차익',
            marginPercent: '차익률',
            places: '거래소 수',
            placesValue: '구매 {b}곳 · 판매 {s}곳',
            noBuy: '기준 안에 살 수 있는 곳 없음',
            noSell: '기준 안에 팔 수 있는 곳 없음',
            oldLeftOut: '기준보다 오래된 보고 {n}건은 계산에서 뺐습니다. 기준일을 늘리면 포함됩니다.',
            showing: '{total}개 중 {n}개를 보여 줍니다.',
            showMore: '더 보기',
            noMatch: '조건에 맞는 것이 없습니다.',
            noPriceRows: '받아 온 가격 보고가 없습니다.',
            illegalSome: '일부 지역 불법',
            legalAll: '게임 자료상 모든 지역 합법',
            legalUnknown: '합법 여부: 게임 자료에 없음',
            prohibitedIn: '금지 지역',
            controlledIn: '통제 지역',
            uexIllegal: 'UEX 표시: 불법 상품',
            back: '목록으로',
            unknownCommodity: '이 상품은 받아 온 가격 자료에 없습니다.',
            unknownStation: '이 거래소는 받아 온 자료에 없습니다.',
            unnamedCommodity: '상품 #{id}',
            buyPlaces: '살 수 있는 곳 (싼 순)',
            sellPlaces: '팔 수 있는 곳 (비싼 순)',
            station: '거래소',
            system: '항성계',
            price: '가격 (1 SCU)',
            stock: '재고',
            soldOut: '품절로 보고됨',
            shopLevel: '상점 재고 수준',
            shopLevelValue: '{n}/7 단계',
            shopFull: '가득 참 (더 안 받을 수 있음)',
            shopInv: '상점 보유 {v}',
            takesUnknown: '얼마나 받아 줄지 모름',
            boxes: '상자 크기 (SCU)',
            reported: '보고 시각',
            old: '기준보다 오래됨',
            ageUnknownTag: '시각 모름',
            history: '가격 기록',
            historyOpen: '기록 보기',
            historyTitle: '가격 기록: {c} — {t}',
            historyNote: 'UEX 이용자 보고입니다. 지금 게임 버전의 보고만 있습니다.',
            historyEmpty: '이번 게임 버전에서 보고된 기록이 없습니다.',
            historyLoading: '가격 기록을 불러오는 중입니다…',
            historySummary: '보고 {n}건 · 최저 {min} · 최고 {max}',
            historyClose: '기록 닫기',
            historyTable: '보고 목록 (최근 것부터)',
            when: '보고한 때',
            gameVersion: '게임 버전',
            buyPrice: '구매가',
            sellPrice: '판매가',
            topRoutes: '내 함선으로 이 상품을 나를 때 좋은 경로',
            routesFromHere: '여기서 출발하는 좋은 경로',
            chooseShip: '위의 "내 함선"을 고르면 경로를 계산해 보여 줍니다.',
            shipCargoUnknown: '이 함선의 화물칸 크기는 게임 자료에 없어서 경로를 계산할 수 없습니다.',
            shipNoCargo: '이 함선은 기본 장착에 화물칸이 없습니다.',
            shipUnknown: '고른 함선을 자료에서 찾을 수 없습니다.',
            noRoutes: '지금 기준에서 이익이 나는 경로가 없습니다.',
            route: '경로',
            quantity: '싣는 양',
            profit: '이익 (추정)',
            perHour: '시간당 이익 (추정)',
            time: '걸리는 시간 (추정)',
            timeUnknown: '시간 계산 못 함',
            investment: '드는 돈',
            openRoutes: '무역 경로 화면에서 열기',
            moreRoutes: '무역 경로 화면에서 더 보기',
            assumptions: '이 계산이 가정한 것',
            compareAverage: '15일 평균과 비교하기',
            stationsCount: '거래소 {n}곳',
            facilities: '시설',
            facilityFilter: '시설 조건',
            minBox: '가장 큰 상자',
            minBoxAny: '상관없음',
            minBoxValue: '{n} SCU 이상',
            maxBox: '가장 큰 상자',
            buyCount: '파는 상품',
            sellCount: '사 주는 상품',
            countValue: '{n}종',
            notLive: '지금 게임 서버에 없는 거래소로 보고됨',
            here: '여기에 있어요 → 여기서 출발하는 경로 보기',
            hereNote: '누르면 "내 위치"를 이 항성계로 저장하고 무역 경로 화면을 엽니다.',
            kind: '종류',
            kindStation: '우주 정거장',
            kindSurface: '지표면',
            pad: '착륙장 크기',
            hangar: '격납고 크기',
            law: '관할',
            faction: '세력 (UEX)',
            uexFlags: 'UEX 이용자 보고 시설',
            uexFlagsNote: '"보고 없음"은 없다는 뜻이 아니라 보고가 없다는 뜻입니다.',
            gameAmenities: '게임 자료의 시설',
            yes: '있음',
            notReported: '보고 없음',
            alsoInGame: '있음 · 게임 자료에도 있음',
            onlyInGame: '보고 없음 · 게임 자료에는 있음',
            sellsToYou: '여기서 살 수 있는 상품 (싼 순)',
            buysFromYou: '여기서 팔 수 있는 상품 (비싼 순)',
            nothingSold: '보고된 상품이 없습니다.',
            illegalHere: '이 지역 불법',
            flag_refinery: '정제소',
            flag_freightElevator: '화물 엘리베이터',
            flag_autoLoad: '자동 적재',
            flag_loadingDock: '선적 도크',
            flag_cargoCenter: '화물 센터',
            flag_dockingPort: '도킹 포트',
            flag_refuel: '연료 보급',
            flag_repair: '수리',
            flag_nqa: '출처를 묻지 않는 거래',
            flag_playerOwned: '플레이어 소유',
            moversIntro: '지금 가격은 가장 최근 보고이고, 평균은 UEX가 최근 {d}일 동안의 보고로 계산한 값입니다. 평균은 상품이나 거래소를 하나 고르면 그때 받아 옵니다.',
            moversPickCommodity: '상품 고르기',
            moversPickStation: '거래소 고르기',
            moversPick: '고르세요',
            moversScan: '차익 큰 상품 {n}개 한꺼번에 살펴보기',
            moversScanNote: '차익이 큰 상품 {n}개를 살펴본 결과입니다 (전체 시장이 아닙니다).',
            moversLoading: '평균 가격을 불러오는 중입니다…',
            moversEmpty: '비교할 가격 보고가 없습니다.',
            moversChoose: '상품이나 거래소를 고르거나, 여러 상품을 한꺼번에 살펴보세요.',
            side: '구분',
            nowPrice: '지금 가격',
            avgPrice: '{d}일 평균 (UEX)',
            noAverage: '평균 없음 ({d}일 안 보고 없음)',
            change: '평균과 차이',
            up: '평균보다 높음',
            down: '평균보다 낮음',
            same: '평균과 같음',
            budgetTitle: '가진 돈으로 살 수 있는 화물선',
            budgetMoney: '가진 돈 (aUEC)',
            budgetMode: '구매 / 대여',
            modeBoth: '구매와 대여 모두',
            modeBuy: '구매만',
            modeRent: '대여만',
            budgetEnter: '가진 돈을 적으면 살 수 있거나 빌릴 수 있는 화물선을 찾아 줍니다.',
            budgetRunning: '화물선을 계산하는 중입니다… ({done}/{total})',
            budgetNone: '이 돈으로 살 수 있거나 빌릴 수 있는 화물선이 없습니다.',
            ship: '함선',
            buyOrRent: '구분',
            kindBuy: '구매',
            kindRent: '대여',
            shipPrice: '가격',
            soldAt: '파는 곳',
            hold: '화물칸',
            moneyLeft: '남는 돈',
            loadOnRoute: '이 경로에 싣는 양',
            loadOf: '{q} / 화물칸 {cap}',
            loadCost: '드는 돈 {v}',
            limitShip: '화물칸을 가득 채움',
            limitStock: '상점 재고가 여기까지',
            limitBudget: '남는 돈으로 살 수 있는 만큼',
            limitBoxes: '상자 크기 때문에 여기까지',
            limitDestination: '도착지가 받는 양이 여기까지',
            profitRun: '한 번 이익 (추정)',
            payback: '함선 값을 버는 데 (추정)',
            paybackValue: '같은 경로 {runs}번 · 가는 시간만 더해 약 {time} (돌아오는 시간 제외)',
            paybackRuns: '같은 경로 {runs}번',
            noRouteForShip: '이익 나는 경로 없음',
            matchedByName: 'UEX 이름 "{name}"으로 맞춤',
            rentPeriodUnknown: '대여 기간: 자료에 없음',
            budgetLegal: '경로는 두 곳 모두에서 합법인 상품만으로 계산했습니다 (합법 여부를 모르는 상품도 뺐습니다). 시간당 이익이 큰 순서입니다.',
            budgetStats: '가격 보고가 없는 화물선 {noPrice}종, 돈이 모자란 구매·대여 {tooExpensive}건은 표에 없습니다.',
            unknownCargoShips: '화물칸 크기가 게임 자료에 없는 함선: {list}',
            viewHold: '화물칸 보기',
            holdTitle: '함선 화물칸 보기',
            holdPick: '함선 고르기',
            holdTotal: '화물칸 크기',
            holdBiggest: '들어가는 가장 큰 상자',
            holdNoGrid: '기본 장착에 화물칸이 없습니다 (0 SCU). 선택 모듈·광석 통·인양 화물칸은 자료에 없습니다.',
            holdUnknown: '이 함선의 화물칸은 게임 자료에 없습니다.',
            holdGrids: '화물칸 구역',
            gridSize: '크기 (칸, 1칸 = 1 SCU)',
            gridCount: '개수',
            gridMaxBox: '가장 큰 상자',
            gridMinBox: '가장 작은 상자',
            holdPerBox: '상자 크기별로 몇 개 들어가는지',
            boxSize: '상자 크기',
            onlyThis: '이 크기만 실을 때',
            mixed: '큰 상자부터 채울 때',
            boxCount: '{n}개',
            boxCountScu: '{n}개 ({scu})',
            doesNotFit: '안 들어감',
            optionUnknownCargo: '화물칸 모름',
            pricesUnavailable: '가격 자료가 필요한 부분입니다.',
            scuUnit: '{n} SCU',
            lawProhibitedFrom: '불법: 출발지에서 금지 품목',
            lawProhibitedTo: '불법: 도착지에서 금지 품목',
            lawControlledFrom: '불법: 출발지에서 통제 품목',
            lawControlledTo: '불법: 도착지에서 통제 품목',
            lawIllegalUex: '불법 상품 (UEX 표시)',
            lawUnknown: '합법 여부 모름',
            routesIllegalNote: '"불법" 표시가 있는 경로는 그 지역에서 금지되거나 통제되는 상품을 싣습니다. 이익에는 벌금·압수 위험을 넣지 않았습니다. "화물선 고르기" 탭은 합법 상품만으로 계산합니다.',
            destFull: '도착지 상점이 가득 찬 것으로 보고됨 — 안 받아 줄 수 있음',
            historyCut: '표에는 최근 {n}건만 보여 줍니다. 그래프와 요약은 {total}건 모두를 씁니다.',
            historyShowAll: '{total}건 모두 보기',
            shareNote: '복사한 주소에는 내 함선·쓸 수 있는 돈·가격 보고 기준이 들어가지 않습니다. 받는 사람은 자기 설정으로 보게 됩니다.',
            moneyInvalid: '0 이상의 숫자만 적을 수 있습니다. 값을 바꾸지 않았습니다.',
            namesMissing: '상품 이름을 받아 오지 못해 번호로 보여 줍니다. 합법 여부도 알 수 없습니다.',
            noMoneyLimit: '돈 제한 없음',
            moneyValue: '{v}까지',
        },
        en: {
            loading: 'Loading data…',
            loadingPrices: 'Loading prices…',
            retry: 'Try again',
            tabsLabel: 'Market tabs',
            tabPrices: 'Commodity prices',
            tabStations: 'Trading locations',
            tabMovers: 'Price changes',
            tabShips: 'Choose a cargo ship',
            mine: 'My conditions',
            mineNote: 'Shared with the Trade Routes and Multi-stop Tours screens. Saved on this device only.',
            myShip: 'My ship',
            noShip: 'Not chosen',
            myMoney: 'Money I can spend (aUEC)',
            moneyHint: 'Leave empty to calculate without a money limit',
            maxAge: 'Price report cut-off',
            maxAgeDays: 'Reports up to {n} d old',
            systems: 'Star systems',
            systemsHint: 'Each press cycles any → include → exclude',
            refresh: 'Fetch prices again',
            copy: 'Copy link to this view',
            search: 'Search',
            searchCommodity: 'Find a commodity by name',
            searchStation: 'Find a station by name',
            sort: 'Sort',
            sortMargin: 'Largest margin',
            sortMarginPercent: 'Highest margin %',
            sortName: 'Name',
            commodity: 'Commodity',
            cheapestBuy: 'Cheapest place to buy',
            bestSell: 'Best place to sell',
            margin: 'Margin per SCU',
            marginPercent: 'Margin %',
            places: 'Stations',
            placesValue: 'buy {b} · sell {s}',
            noBuy: 'No place to buy within the cut-off',
            noSell: 'No place to sell within the cut-off',
            oldLeftOut: '{n} reports older than the cut-off were left out. Raise the cut-off to include them.',
            showing: 'Showing {n} of {total}.',
            showMore: 'Show more',
            noMatch: 'Nothing matches.',
            noPriceRows: 'No price reports were received.',
            illegalSome: 'Illegal in some areas',
            legalAll: 'Legal everywhere according to the game files',
            legalUnknown: 'Legality: not in the game files',
            prohibitedIn: 'Prohibited in',
            controlledIn: 'Controlled in',
            uexIllegal: 'UEX flag: illegal commodity',
            back: 'Back to the list',
            unknownCommodity: 'This commodity is not in the price data we received.',
            unknownStation: 'This station is not in the data we received.',
            unnamedCommodity: 'Commodity #{id}',
            buyPlaces: 'Where to buy (cheapest first)',
            sellPlaces: 'Where to sell (best price first)',
            station: 'Station',
            system: 'System',
            price: 'Price (per SCU)',
            stock: 'Stock',
            soldOut: 'Reported sold out',
            shopLevel: 'Shop stock level',
            shopLevelValue: 'level {n}/7',
            shopFull: 'Full (may not take more)',
            shopInv: 'shop holds {v}',
            takesUnknown: 'Unknown how much it will take',
            boxes: 'Box sizes (SCU)',
            reported: 'Reported',
            old: 'Older than the cut-off',
            ageUnknownTag: 'time unknown',
            history: 'Price history',
            historyOpen: 'Show history',
            historyTitle: 'Price history: {c} — {t}',
            historyNote: 'Reports by UEX users. Only reports from the current game version.',
            historyEmpty: 'No reports recorded in this game version.',
            historyLoading: 'Loading price history…',
            historySummary: '{n} reports · lowest {min} · highest {max}',
            historyClose: 'Close history',
            historyTable: 'Reports (newest first)',
            when: 'Reported at',
            gameVersion: 'Game version',
            buyPrice: 'Buy price',
            sellPrice: 'Sell price',
            topRoutes: 'Good routes for this commodity with my ship',
            routesFromHere: 'Good routes starting here',
            chooseShip: 'Choose "My ship" above to see calculated routes.',
            shipCargoUnknown: 'The hold size of this ship is not in the game files, so routes cannot be calculated.',
            shipNoCargo: 'This ship has no cargo hold in its default loadout.',
            shipUnknown: 'The chosen ship is not in the data.',
            noRoutes: 'No profitable route within the current cut-off.',
            route: 'Route',
            quantity: 'Load',
            profit: 'Profit (estimate)',
            perHour: 'Profit per hour (estimate)',
            time: 'Time (estimate)',
            timeUnknown: 'time not calculable',
            investment: 'Cost',
            openRoutes: 'Open in Trade Routes',
            moreRoutes: 'See more in Trade Routes',
            assumptions: 'What this calculation assumes',
            compareAverage: 'Compare with the 15-day average',
            stationsCount: '{n} stations',
            facilities: 'Facilities',
            facilityFilter: 'Facilities required',
            minBox: 'Largest box',
            minBoxAny: 'Any',
            minBoxValue: '{n} SCU or more',
            maxBox: 'Largest box',
            buyCount: 'Sells',
            sellCount: 'Buys',
            countValue: '{n} goods',
            notLive: 'Reported as not on the live servers now',
            here: 'I am here → routes from here',
            hereNote: 'Saves this system as "where I am" and opens the Trade Routes screen.',
            kind: 'Type',
            kindStation: 'Space station',
            kindSurface: 'On a surface',
            pad: 'Landing pad size',
            hangar: 'Hangar size',
            law: 'Jurisdiction',
            faction: 'Faction (UEX)',
            uexFlags: 'Facilities reported by UEX users',
            uexFlagsNote: '"Not reported" does not mean absent; it means nobody reported it.',
            gameAmenities: 'Facilities in the game files',
            yes: 'Yes',
            notReported: 'Not reported',
            alsoInGame: 'Yes · also in the game files',
            onlyInGame: 'Not reported · in the game files',
            sellsToYou: 'What you can buy here (cheapest first)',
            buysFromYou: 'What you can sell here (best price first)',
            nothingSold: 'No goods reported.',
            illegalHere: 'Illegal here',
            flag_refinery: 'Refinery',
            flag_freightElevator: 'Freight elevator',
            flag_autoLoad: 'Auto-loading',
            flag_loadingDock: 'Loading dock',
            flag_cargoCenter: 'Cargo center',
            flag_dockingPort: 'Docking port',
            flag_refuel: 'Refuel',
            flag_repair: 'Repair',
            flag_nqa: 'No questions asked',
            flag_playerOwned: 'Player owned',
            moversIntro: 'The current price is the newest report; the average is what UEX calculated from the reports of the last {d} days. Averages are fetched when you pick a commodity or a station.',
            moversPickCommodity: 'Pick a commodity',
            moversPickStation: 'Pick a station',
            moversPick: 'Choose',
            moversScan: 'Check the {n} largest-margin commodities at once',
            moversScanNote: 'Result for the {n} commodities with the largest margins (not the whole market).',
            moversLoading: 'Loading average prices…',
            moversEmpty: 'No price reports to compare.',
            moversChoose: 'Pick a commodity or a station, or check several commodities at once.',
            side: 'Side',
            nowPrice: 'Current price',
            avgPrice: '{d}-day average (UEX)',
            noAverage: 'No average (no report in {d} days)',
            change: 'Difference from average',
            up: 'above average',
            down: 'below average',
            same: 'same as average',
            budgetTitle: 'Cargo ships my money can get',
            budgetMoney: 'My money (aUEC)',
            budgetMode: 'Buy / rent',
            modeBoth: 'Buy and rent',
            modeBuy: 'Buy only',
            modeRent: 'Rent only',
            budgetEnter: 'Enter your money to find the cargo ships you can buy or rent.',
            budgetRunning: 'Calculating cargo ships… ({done}/{total})',
            budgetNone: 'No cargo ship can be bought or rented with this money.',
            ship: 'Ship',
            buyOrRent: 'Buy / rent',
            kindBuy: 'Buy',
            kindRent: 'Rent',
            shipPrice: 'Price',
            soldAt: 'Sold at',
            hold: 'Hold',
            moneyLeft: 'Money left',
            loadOnRoute: 'Load on this route',
            loadOf: '{q} of {cap} hold',
            loadCost: 'costs {v}',
            limitShip: 'fills the hold',
            limitStock: 'limited by shop stock',
            limitBudget: 'as much as the money left buys',
            limitBoxes: 'limited by box sizes',
            limitDestination: 'limited by what the destination takes',
            profitRun: 'Profit per run (estimate)',
            payback: 'To earn back the price (estimate)',
            paybackValue: 'the same route {runs}× · about {time} of outbound trips (flying back not counted)',
            paybackRuns: 'the same route {runs}×',
            noRouteForShip: 'no profitable route',
            matchedByName: 'matched by UEX name "{name}"',
            rentPeriodUnknown: 'Rental period: not in the data',
            budgetLegal: 'Routes use only goods that are legal at both ends (goods of unknown legality are left out). Sorted by profit per hour.',
            budgetStats: '{noPrice} cargo ships have no price report and {tooExpensive} buy / rent offers cost more than your money; they are not in the table.',
            unknownCargoShips: 'Ships whose hold size is not in the game files: {list}',
            viewHold: 'Show hold',
            holdTitle: 'Ship hold',
            holdPick: 'Pick a ship',
            holdTotal: 'Hold size',
            holdBiggest: 'Largest box that fits',
            holdNoGrid: 'No cargo hold in the default loadout (0 SCU). Optional modules, ore pods and salvage holds are not in the data.',
            holdUnknown: 'The hold of this ship is not in the game files.',
            holdGrids: 'Hold areas',
            gridSize: 'Size (cells, 1 cell = 1 SCU)',
            gridCount: 'Count',
            gridMaxBox: 'Largest box',
            gridMinBox: 'Smallest box',
            holdPerBox: 'How many boxes of each size fit',
            boxSize: 'Box size',
            onlyThis: 'Only this size',
            mixed: 'Largest boxes first',
            boxCount: '{n}',
            boxCountScu: '{n} ({scu})',
            doesNotFit: 'does not fit',
            optionUnknownCargo: 'hold unknown',
            pricesUnavailable: 'This part needs price data.',
            scuUnit: '{n} SCU',
            lawProhibitedFrom: 'Illegal: prohibited at the origin',
            lawProhibitedTo: 'Illegal: prohibited at the destination',
            lawControlledFrom: 'Illegal: controlled at the origin',
            lawControlledTo: 'Illegal: controlled at the destination',
            lawIllegalUex: 'Illegal commodity (UEX flag)',
            lawUnknown: 'Legality unknown',
            routesIllegalNote: 'Routes marked "Illegal" carry goods that are prohibited or controlled there. The profit does not include the risk of fines or seizure. The "Choose a cargo ship" tab uses legal goods only.',
            destFull: 'Destination shop reported full — it may not take the load',
            historyCut: 'The table shows the {n} newest reports. The chart and the summary use all {total}.',
            historyShowAll: 'Show all {total}',
            shareNote: 'The copied link does not carry your ship, money or price cut-off. Whoever opens it sees it with their own settings.',
            moneyInvalid: 'Only a number of 0 or more can be entered. The value was not changed.',
            namesMissing: 'Commodity names could not be loaded, so numbers are shown. Legality is unknown too.',
            noMoneyLimit: 'no money limit',
            moneyValue: 'up to {v}',
        },
    };
    const t = H.translator(TEXT);

    // ── 상태 ────────────────────────────────────────────────────────────────
    let root = null;
    let view = { tab: 'prices' };
    let game = null;             // { cargo, world, canonical, presentation }
    let gameError = null;
    let prices = null;           // { market, terminals, commodities, meta, stale }
    let pricesError = null;
    let pricesLoading = false;
    let vehicles = null;         // /api/uex/vehicle-prices data
    let vehiclesError = null;
    let vehiclesLoading = false;
    let model = null;
    let terminalIndex = new Map();
    let shipNames = new Map();
    let history = null;          // { key, loading, rows, error }
    let movers = null;           // { key, loading, rows, error, scanned }
    let budget = null;           // { key, running, done, total, rows, noPrice, unknownCargo, tooExpensive }
    let listLimit = LIST_LIMIT;
    let notice = '';
    let runToken = 0;
    let moneyNote = '';          // 돈 입력 칸 아래 안내 (잘못된 값)
    let historyAll = false;      // 가격 기록 표를 모두 보여 줄지
    let historyPlaced = false;   // 가격 기록을 표의 그 줄 아래에 넣었는지 (한 번 그리는 동안)
    let sameNames = null;        // { lang, names } 이름이 같은 거래소
    let pending = null;          // { selector, scroll, until } 다음에 그릴 때 초점(과 화면 위치)을 옮길 곳
    let lastViewKey = '';
    const openDetails = new Map(); // 접는 상자(data-d)를 이용자가 열었는지 닫았는지

    const compactList = window.matchMedia('(max-width: 720px)');
    const narrow = () => compactList.matches;
    const pageSize = () => (narrow() ? 10 : LIST_LIMIT);
    compactList.addEventListener('change', ({ matches }) => {
        if (listLimit !== (matches ? LIST_LIMIT : 10)) return;
        listLimit = pageSize();
        if (root?.closest('section.active')) draw();
    });
    const isShown = () => { const section = document.getElementById(SECTION); return !section || section.classList.contains('active'); };
    // once: 바로 다음에 그릴 때만 찾는다. 아니면 주소가 바뀌고 자료가 올 때까지(최대 10초) 기다린다.
    const later = (selector, scroll, focus = true, once = false) => { pending = { selector, scroll, focus, once, until: Date.now() + 10000 }; };
    const detailsAttr = (key, fallback) => ` data-d="${key}"${(openDetails.has(key) ? openDetails.get(key) : fallback) ? ' open' : ''}`;

    const toId = (value) => (/^\d{1,7}$/.test(String(value ?? '')) ? Number(value) : null);
    const shared = () => E.state.get();
    const settings = () => ({ ...shared(), now: Date.now() });

    function readParams(params) {
        const p = params || {};
        const c = toId(p.c);
        const tid = toId(p.t);
        const tab = TABS.includes(p.tab) ? p.tab : (tid !== null && c === null ? 'stations' : 'prices');
        view = {
            tab, c, t: tid, capacity: toId(p.capacity),
            q: typeof p.q === 'string' ? p.q.slice(0, 60) : '',
            sys: typeof p.sys === 'string' ? p.sys : '',
            sort: SORTS.includes(p.sort) ? p.sort : 'margin',
            fac: String(p.fac || '').split(',').filter((flag) => FACILITY_FILTERS.includes(flag)),
            box: E.STANDARD_BOXES.includes(Number(p.box)) ? Number(p.box) : null,
            ht: toId(p.ht), hc: toId(p.hc),
            ship: typeof p.ship === 'string' && /^[\w-]{1,60}$/.test(p.ship) ? p.ship : null,
            mode: MODES.includes(p.mode) ? p.mode : 'both',
            scan: p.scan === '1',
        };
        listLimit = pageSize();
    }

    function hashParams(next) {
        const v = { ...view, ...(next || {}) };
        const out = { tab: v.tab === 'prices' ? null : v.tab, sys: v.sys };
        if (v.tab === 'prices') Object.assign(out, { c: v.c, q: v.c === null ? v.q : '', sort: v.sort === 'margin' ? null : v.sort });
        if (v.tab === 'stations') Object.assign(out, { t: v.t, q: v.t === null ? v.q : '', fac: v.fac.join(','), box: v.box });
        if (v.tab === 'movers') Object.assign(out, { c: v.c, t: v.c === null ? v.t : null, scan: v.c === null && v.t === null && v.scan ? 1 : null });
        if (v.tab === 'ships') Object.assign(out, { ship: v.ship, box: v.box, capacity: v.capacity, mode: v.mode === 'both' ? null : v.mode });
        if ((v.tab === 'prices' && v.c !== null) || (v.tab === 'stations' && v.t !== null)) Object.assign(out, { ht: v.ht, hc: v.hc });
        return out;
    }
    const link = (next) => esc(H.buildHash(SECTION, hashParams({ c: null, t: null, q: '', ht: null, hc: null, scan: false, ...next })));
    const saveHash = () => H.writeHash(SECTION, hashParams());

    // ── 자료 ────────────────────────────────────────────────────────────────
    function buildModel() {
        if (!game) { model = null; return; }
        const vehicleData = vehicles && Array.isArray(vehicles.vehicles) ? vehicles : null;
        model = E.buildModel({
            market: prices ? prices.market : [], terminals: prices ? prices.terminals : [],
            commodities: prices && prices.commodities ? prices.commodities : undefined,
            cargo: game.cargo, world: game.world,
            vehiclePrices: vehicleData || undefined, ships: game.canonical || undefined,
        });
        terminalIndex = new Map(E.listTerminals(model, { includeNotLive: true }).map((terminal) => [terminal.id, terminal]));
        shipNames = new Map();
        const english = new Map(((game.presentation && game.presentation.records) || []).map((record) => [record.id, record.name]));
        const korean = new Map(((game.canonical && game.canonical.ships) || []).map((ship) => [ship.id, ship.nameKo]));
        for (const ship of E.listShips(model)) shipNames.set(ship.id, { en: english.get(ship.id) || ship.id, ko: korean.get(ship.id) || undefined });
        budget = null;
        sameNames = null;
    }

    async function loadGame() {
        gameError = null;
        try {
            // 함선 DB 가 이미 받았거나 받는 중이면 같은 파일을 다시 받지 않는다.
            const shipDb = window.VOLT_SHIPDB_CANONICAL;
            const fromShipDb = shipDb && (shipDb.state === 'loaded' || shipDb.state === 'loading') ? shipDb.load().catch(() => null) : Promise.resolve(null);
            const optional = (path, key) => fromShipDb.then((store) => (store && store[key] ? store[key] : H.loadJson(path))).catch(() => null);
            const [cargo, world, canonical, presentation] = await Promise.all([
                H.loadJson('/data/trade/cargo.json'), H.loadJson('/data/trade/world.json'),
                optional('/data/canonical/ships-canonical.json', 'canonical'), optional('/data/canonical/presentation-ships.json', 'presentation'),
            ]);
            game = { cargo, world, canonical, presentation };
        } catch (error) {
            gameError = error;
        }
        buildModel();
        update();
    }

    async function loadPrices(refresh) {
        pricesLoading = true;
        pricesError = null;
        if (refresh) draw();
        try {
            const [market, terminals, commodities] = await Promise.all([
                H.uex('market', { refresh: refresh === true }), H.uex('terminals'), H.uex('commodities').catch(() => null),
            ]);
            prices = {
                market: Array.isArray(market.data) ? market.data : [], terminals: Array.isArray(terminals.data) ? terminals.data : [],
                commodities: commodities && Array.isArray(commodities.data) ? commodities.data : null, meta: market.meta, stale: market.stale,
            };
        } catch (error) {
            pricesError = error;
        }
        pricesLoading = false;
        buildModel();
        update();
    }

    async function loadVehicles() {
        if (vehiclesLoading || vehicles) return;
        vehiclesLoading = true;
        vehiclesError = null;
        try {
            vehicles = (await H.uex('vehicle-prices')).data || {};
        } catch (error) {
            vehiclesError = error;
        }
        vehiclesLoading = false;
        buildModel();
        update();
    }

    async function loadHistory(key, terminal, commodity) {
        history = { key, loading: true, rows: null, error: null };
        historyAll = false;
        try {
            const result = await H.uex(`price-history?terminal=${terminal}&commodity=${commodity}`);
            if (history.key !== key) return;
            history = { key, loading: false, error: null, rows: (Array.isArray(result.data) ? result.data : []).filter((row) => row && H.isKnown(row.at) && (H.isKnown(row.buy) || H.isKnown(row.sell))) };
        } catch (error) {
            if (history.key !== key) return;
            history = { key, loading: false, rows: null, error };
        }
        draw();
    }

    // UEX 원본 가격 표(상품별·거래소별)의 한 줄 → 구매가/판매가 각각 "지금 가격과 15일 평균" 한 줄.
    function moverRows(list) {
        const out = [];
        for (const raw of Array.isArray(list) ? list : []) {
            if (!raw) continue;
            const terminal = toId(raw.id_terminal);
            const commodity = toId(raw.id_commodity);
            if (terminal === null || commodity === null) continue;
            const known = terminalIndex.get(terminal);
            if (known && !known.live) continue;
            for (const side of ['buy', 'sell']) {
                const now = Number(raw[`price_${side}`]);
                const average = Number(raw[`price_${side}_avg`]);
                if (!(now > 0)) continue;
                const hasAverage = average > 0;
                out.push({
                    t: terminal, c: commodity, side, price: now, average: hasAverage ? average : null,
                    diff: hasAverage ? (now - average) / average * 100 : null,
                    at: Number(raw.date_modified) > 0 ? Number(raw.date_modified) : null,
                    terminalName: raw.terminal_name || null, commodityName: raw.commodity_name || null,
                });
            }
        }
        return out.sort((a, b) => (b.diff === null ? -1 : Math.abs(b.diff)) - (a.diff === null ? -1 : Math.abs(a.diff)) || a.t - b.t || a.c - b.c);
    }

    async function loadMovers(key, paths, scanned) {
        movers = { key, loading: true, rows: null, error: null, scanned };
        try {
            const rows = [];
            for (let index = 0; index < paths.length; index += 3) {
                const batch = await Promise.all(paths.slice(index, index + 3).map((path) => H.uex(path, { ttlMs: 30 * 60 * 1000 })));
                if (movers.key !== key) return;
                for (const result of batch) rows.push(...moverRows(result.data));
            }
            movers = { key, loading: false, error: null, scanned, rows: rows.sort((a, b) => (b.diff === null ? -1 : Math.abs(b.diff)) - (a.diff === null ? -1 : Math.abs(a.diff))) };
        } catch (error) {
            if (movers.key !== key) return;
            movers = { key, loading: false, rows: null, error, scanned };
        }
        draw();
    }

    function systemFilter() {
        const systems = (game && game.world.systems) || [];
        const chips = H.chips(view.sys);
        if (chips.isEmpty()) return shared().system ? [shared().system] : null;
        const list = systems.filter((system) => chips.test([system.toLowerCase()]));
        return list.length ? list : ['-'];
    }

    function startBudget() {
        const state = shared();
        const key = JSON.stringify([state.budget, view.mode, state.maxAgeDays, state.system, view.sys]);
        if (budget && budget.key === key) return;
        const token = ++runToken;
        const ids = E.listShips(model).filter((ship) => ship.scu === null || ship.scu > 0).sort((a, b) => (b.scu || 0) - (a.scu || 0)).map((ship) => ship.id);
        const run = { key, running: true, done: 0, total: ids.length, rows: [], noPrice: 0, unknownCargo: [], tooExpensive: 0, assumptions: [] };
        budget = run;
        const base = settings();
        const step = () => {
            if (token !== runToken || budget !== run || !model) return;
            const chunk = ids.slice(run.done, run.done + BUDGET_CHUNK);
            if (!chunk.length) {
                run.running = false;
                run.rows.sort((a, b) => (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity) || (b.profitPerRun ?? -Infinity) - (a.profitPerRun ?? -Infinity) || b.capacity - a.capacity);
                draw();
                return;
            }
            const result = E.shipsForBudget(model, base, { money: state.budget, mode: view.mode, ships: chunk, limit: 300, maxShips: 400, legalOnly: true, system: systemFilter() || undefined });
            run.rows.push(...result.rows);
            run.noPrice += result.noPrice.length;
            run.unknownCargo.push(...result.unknownCargo);
            run.tooExpensive += result.tooExpensive;
            run.assumptions = result.assumptions;
            run.done += chunk.length;
            window.setTimeout(step, 0);
        };
        window.setTimeout(step, 0);
    }

    // 지금 화면에 필요한 자료를 (아직 없으면) 받기 시작한다.
    function sync() {
        if (!game) return;
        if (view.tab === 'ships') {
            if (prices && !vehicles && !vehiclesLoading && !vehiclesError) loadVehicles();
            if (prices && vehicles && model && shared().budget !== null) startBudget();
        }
        if (!prices) return;
        const detail = (view.tab === 'prices' && view.c !== null) || (view.tab === 'stations' && view.t !== null);
        if (detail && view.ht !== null && view.hc !== null) {
            const key = `${view.ht}:${view.hc}`;
            if (!history || history.key !== key) loadHistory(key, view.ht, view.hc);
        } else {
            history = null;
        }
        if (view.tab === 'movers') {
            const key = view.c !== null ? `c:${view.c}` : (view.t !== null ? `t:${view.t}` : (view.scan ? 'scan' : null));
            if (key === 'scan') {
                if (!movers || movers.key !== 'scan') {
                    const top = E.commoditySummary(model, settings(), { system: systemFilter() || undefined, sort: 'margin' }).rows.filter((row) => row.margin !== null).slice(0, SCAN_COUNT);
                    loadMovers('scan', top.map((row) => `commodities/${row.c}/prices`), top.length);
                }
            } else if (key && (!movers || movers.key !== key)) {
                loadMovers(key, [view.c !== null ? `commodities/${view.c}/prices` : `location-prices?field=id_terminal&id=${view.t}`], 0);
            } else if (!key) {
                movers = null;
            }
        }
    }

    // 화면이 가려져 있을 때(다른 섹션을 보는 중)는 계산도 그리기도 하지 않는다. 다시 열리면 onRoute 가 부른다.
    function update(force) {
        if (!force && !isShown()) return;
        sync();
        draw();
    }

    // ── 이름 · 작은 조각 ─────────────────────────────────────────────────────
    const shipName = (id) => H.name(shipNames.get(id)) || id;
    const terminalName = (id, fallback) => { const terminal = terminalIndex.get(id); return terminal ? H.name(terminal.name) || terminal.uexName : (fallback || `#${id}`); };
    const commodityName = (id, fallback) => { const commodity = model && model.commodities.get(id); return (commodity && H.name(commodity.name)) || fallback || t('unnamedCommodity', { id }); };

    function placeLine(id) {
        const terminal = terminalIndex.get(id);
        if (!terminal) return '';
        // 이름이 같은 거래소가 둘 이상이면 UEX 터미널 이름으로 구별한다.
        if (!sameNames || sameNames.lang !== H.lang()) {
            const seen = new Map();
            for (const item of terminalIndex.values()) { const label = H.name(item.name) || item.uexName; seen.set(label, (seen.get(label) || 0) + 1); }
            sameNames = { lang: H.lang(), names: new Set([...seen].filter(([, count]) => count > 1).map(([label]) => label)) };
        }
        const label = H.name(terminal.name) || terminal.uexName;
        const twin = sameNames.names.has(label) && terminal.uexName && terminal.uexName !== label;
        const name = terminalName(id);
        const aliases = [name, name.match(/\[([^\]]+)\]$/)?.[1], terminal.name?.en].filter(Boolean);
        const place = aliases.includes(terminal.place) ? '' : terminal.place;
        return [...new Set([terminal.system && H.systemLabel(terminal.system), place, twin ? terminal.uexName : null].filter(Boolean))].join(' · ');
    }

    // "지도에서 보기": 성계지도에 실제로 보일 수 있는 곳일 때만 링크가 나온다 (js/starmap.js VOLT_STARMAP.links).
    function mapLink(params, options) {
        return window.VOLT_STARMAP?.links?.button?.(params, options) || '';
    }

    function terminalCell(id, fallback) {
        const place = placeLine(id);
        const name = terminalName(id, fallback);
        const display = H.lang() === 'ko' ? name.replace(/\s+\[[^\]]+\]$/, '') : name;
        return `<a class="market-link market-place-link" href="${link({ tab: 'stations', t: id })}">${esc(display)}${place ? `<small>${esc(place)}</small>` : ''}</a>`;
    }

    function ageTag(at, level) {
        const state = level || H.ageLevel(at, shared().maxAgeDays);
        const extra = state === 'old' ? ` <span class="market-tag is-warn">${esc(t('old'))}</span>` : '';
        return `<span data-sort-value="${esc(at ?? '')}" class="market-age${state === 'ok' ? '' : ' is-old'}">${esc(H.age(at))}</span>${extra}`;
    }

    const priceWithAge = (price, at, level) => `<strong class="market-price">${esc(H.price(price, { digits: 2 }))}</strong><small>${ageTag(at, level)}</small>`;
    const boxesText = (box) => (Array.isArray(box) && box.length ? box.join(', ') : H.unknown('uex'));

    function stockCell(row) {
        if (row.soldOut) return `<span data-sort-value="0" class="market-tag is-warn">${esc(t('soldOut'))}</span>`;
        return esc(H.scu(row.stock, { unknown: 'uex' }));
    }

    function levelCell(row) {
        if (!H.isKnown(row.level)) return `<span class="market-muted">${esc(t('takesUnknown'))}</span>`;
        const parts = [t('shopLevelValue', { n: row.level })];
        if (H.isKnown(row.inv)) parts.push(t('shopInv', { v: H.scu(row.inv) }));
        return `${esc(parts.join(' · '))}${row.full ? ` <span class="market-tag is-warn">${esc(t('shopFull'))}</span>` : ''}`;
    }

    // heads: [{ label, num }] · rows: [[html, …]] (첫 칸은 행 제목). 좁은 화면에서는 칸마다 data-label 로 제목을 붙인다.
    // after(index, columns): 그 줄 바로 아래에 넣을 줄의 HTML (가격 기록). 없으면 ''.
    function table(caption, heads, rows, rowClass, after, source) {
        const head = heads.map((item) => `<th scope="col"${item.action ? ' data-no-sort' : ''}${item.asc ? ' data-asc-first' : ''}${item.num ? ' class="is-num"' : ''}>${esc(item.label)}</th>`).join('');
        const body = rows.map((cells, index) => `<tr${rowClass && rowClass(index) ? ` class="${rowClass(index)}"` : ''}>${cells.map((cell, column) => {
            const tag = column === 0 ? 'th scope="row"' : 'td';
            return `<${tag} data-label="${esc(heads[column].label)}"${heads[column].num ? ' class="is-num"' : ''}><div class="market-cell">${cell}</div></${column === 0 ? 'th' : 'td'}>`;
        }).join('')}</tr>${after ? after(index, heads.length) : ''}`).join('');
        return `<div class="market-tablewrap"><table class="market-table"${source ? ` data-sort-source="${esc(source)}"` : ''}><caption class="visually-hidden">${esc(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    const emptyBox = (message) => `<p class="market-empty">${esc(message)}</p>`;
    const errorBox = (error, action) => `<div class="market-error" role="alert"><p>${esc(H.errorText(error))}</p><button type="button" class="market-btn" data-act="${action}" data-k="${action}">${esc(t('retry'))}</button></div>`;

    function assumptionList(codes, key) {
        const lang = H.lang();
        const lines = [...new Set(codes)].map((code) => E.ASSUMPTIONS[code] && (E.ASSUMPTIONS[code][lang] || E.ASSUMPTIONS[code].ko)).filter(Boolean);
        if (!lines.length) return '';
        return `<details class="market-assume"${detailsAttr(key, false)}><summary data-k="sum-${key}">${esc(t('assumptions'))}</summary><ul>${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></details>`;
    }

    // ── 위쪽: 내 조건 · 탭 ───────────────────────────────────────────────────
    function shipOptions(selected, withEmpty) {
        const ships = E.listShips(model).filter((ship) => ship.scu === null || ship.scu > 0 || ship.id === selected)
            .map((ship) => ({ ...ship, label: shipName(ship.id) })).sort((a, b) => a.label.localeCompare(b.label, H.lang()));
        const options = ships.map((ship) => `<option value="${esc(ship.id)}"${ship.id === selected ? ' selected' : ''}>${esc(ship.label)} — ${esc(ship.scu === null ? t('optionUnknownCargo') : H.scu(ship.scu))}</option>`);
        return (withEmpty ? `<option value="">${esc(t('noShip'))}</option>` : '') + options.join('');
    }

    function drawSettings() {
        const state = shared();
        const ages = AGE_CHOICES.includes(state.maxAgeDays) ? AGE_CHOICES : [...AGE_CHOICES, state.maxAgeDays].sort((a, b) => a - b);
        const systems = ['', ...((game && game.world.systems) || [])].map((system) =>
            `<option value="${esc(system)}"${system === (state.system || '') ? ' selected' : ''}>${esc(H.systemLabel(system))}</option>`).join('');
        const now = H.conditionRow(state, state.ship && shipName(state.ship), model && E.shipProfile(model, state).scu);
        return `<details class="market-panel market-settings"${detailsAttr('settings', false)}>
            <summary class="helper-condition" data-k="sum-settings">${now}</summary>
            <div class="market-settings-body">
            <div class="market-fields">
                <label class="market-field"><span>${esc(t('myShip'))}</span><select data-change="ship" data-k="my-ship">${shipOptions(state.ship, true)}</select></label>
                ${moneyField('myMoney', 'my-money', t('moneyHint'))}
                <label class="market-field"><span>${esc(t('maxAge'))}</span><select data-change="age" data-k="max-age">${ages.map((days) => `<option value="${days}"${days === state.maxAgeDays ? ' selected' : ''}>${esc(t('maxAgeDays', { n: H.num(days, { digits: 1 }) }))}</option>`).join('')}</select></label>
            </div>
            <label class="market-field"><span>${esc(t('systems'))}</span><select data-change="system" data-k="my-system">${systems}</select></label>
            <p class="market-note">${esc(t('mineNote'))}</p>
            </div>
        </details>`;
    }

    // 돈 입력 칸. 저장된 값은 천 단위 쉼표를 넣어 보여 주고, 잘못 적으면 칸 아래에 알린다.
    function moneyField(labelKey, key, placeholder, grow) {
        const budget = shared().budget;
        return `<div class="market-field${grow ? ' is-grow' : ''}"><label for="market-${key}">${esc(t(labelKey))}</label><input id="market-${key}" type="text" inputmode="numeric" autocomplete="off" data-change="budget" data-k="${key}" value="${esc(budget === null ? '' : H.num(budget))}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}${moneyNote ? ' aria-invalid="true"' : ''}>${moneyNote ? `<small class="market-fieldnote" role="alert">${esc(moneyNote)}</small>` : ''}${H.budgetButtons('market-' + key)}</div>`;
    }

    function drawTabs() {
        const labels = { prices: 'tabPrices', stations: 'tabStations', movers: 'tabMovers', ships: 'tabShips' };
        const keepScan = (tab) => tab === 'movers' && Boolean(movers && movers.key === 'scan');
        return `<nav class="market-tabs" aria-label="${esc(t('tabsLabel'))}">${TABS.map((tab) => `<a class="market-tab${view.tab === tab ? ' is-active' : ''}" href="${link({ tab, scan: keepScan(tab) })}" data-k="tab-${tab}"${view.tab === tab ? ' aria-current="page"' : ''}>${esc(t(labels[tab]))}</a>`).join('')}</nav>`;
    }

    function drawFooter() {
        return `<div class="market-foot">
            <p class="market-sources" data-market-source>${esc(H.sourceLine(prices ? { fetchedAt: prices.meta && prices.meta.fetchedAt, stale: prices.stale } : null))}</p>
            <div class="market-actions">
                <button type="button" class="market-btn" data-act="refresh" data-k="refresh"${pricesLoading ? ' disabled' : ''}>${esc(t('refresh'))}</button>
                <button type="button" class="market-btn" data-act="copy" data-k="copy">${esc(t('copy'))}</button>
            </div>
            <p class="market-note">${esc(t('shareNote'))}</p>
            <p class="market-status" role="status" aria-live="polite">${esc(notice)}</p>
        </div>`;
    }

    // ── 경로 표 (엔진 결과) ──────────────────────────────────────────────────
    // 경로에 싣는 상품 하나: 이름 + 불법·합법 여부 모름 표시 + 도착지 상점이 가득 찼다는 보고.
    function routeGood(good) {
        const law = good.illegal || {};
        const marks = [];
        for (const [side, code] of [['From', law.from], ['To', law.to]]) {
            if (code) marks.push({ warn: true, text: t(`law${code === 'p' ? 'Prohibited' : 'Controlled'}${side}`) });
        }
        if (!marks.length && good.legal === false) marks.push({ warn: true, text: t('lawIllegalUex') });
        if (!marks.length && good.legal !== true) marks.push({ warn: false, text: t('lawUnknown') });
        if (good.destination && good.destination.full) marks.push({ warn: true, text: t('destFull') });
        return `<span class="market-good">${esc(commodityName(good.c))}${marks.map((mark) => ` <span class="market-tag${mark.warn ? ' is-warn' : ''}">${esc(mark.text)}</span>`).join('')}</span>`;
    }

    function routesBlock(title, result, moreParams, key) {
        let body;
        if (!result.ok) {
            const key = { 'no-ship': 'chooseShip', 'unknown-ship': 'shipUnknown', 'cargo-unknown': 'shipCargoUnknown', 'no-cargo': 'shipNoCargo' }[result.problem] || 'chooseShip';
            body = emptyBox(t(key));
        } else if (!result.routes.length) {
            body = emptyBox(t('noRoutes'));
        } else {
            const heads = [{ label: t('route') }, { label: t('commodity') }, { label: t('quantity'), num: true }, { label: t('investment'), num: true }, { label: t('profit'), num: true }, { label: t('time'), num: true }, { label: t('perHour'), num: true }];
            const rows = result.routes.map((route) => {
                const goods = route.goods.map(routeGood).join('');
                const open = esc(H.buildHash('routes', { c: route.goods[0] ? route.goods[0].c : null, from: route.from, to: route.to }));
                return [
                    `<span class="market-routeline">${esc(terminalName(route.from))} → ${esc(terminalName(route.to))}</span><small>${ageTag(route.oldestAt)} · <a class="market-link" href="${open}">${esc(t('openRoutes'))}</a></small>`,
                    goods, esc(H.scu(route.quantity)), esc(H.price(route.investment)), esc(H.price(route.profit)),
                    route.seconds === null ? `<span class="market-muted">${esc(t('timeUnknown'))}</span>` : esc(H.duration(route.seconds)),
                    route.profitPerHour === null ? `<span class="market-muted">${esc(t('timeUnknown'))}</span>` : esc(H.price(route.profitPerHour)),
                ];
            });
            const illegal = result.routes.some((route) => route.goods.some((good) => good.legal === false));
            body = table(title, heads, rows) + (illegal ? `<p class="market-note" data-market-illegal>${esc(t('routesIllegalNote'))}</p>` : '') + assumptionList(result.routes.flatMap((route) => route.assumptions), key);
        }
        const ship = shared().ship;
        return `<section class="market-block" data-market-routes><h4>${esc(title)}${ship ? ` <small>${esc(shipName(ship))}</small>` : ''}</h4>${body}
            <p class="market-note"><a class="market-link" href="${esc(H.buildHash('routes', moreParams))}">${esc(t('moreRoutes'))}</a></p></section>`;
    }

    // ── 가격 기록 그래프 (라이브러리 없이 SVG) ───────────────────────────────
    function drawHistory() {
        if (!history || view.ht === null || view.hc === null) return '';
        const title = t('historyTitle', { c: commodityName(view.hc), t: terminalName(view.ht) });
        const close = `<button type="button" class="market-btn" data-act="history-close" data-k="history-close">${esc(t('historyClose'))}</button>`;
        let body;
        if (history.loading) body = `<p class="market-empty" role="status">${esc(t('historyLoading'))}</p>`;
        else if (history.error) body = errorBox(history.error, 'retry-history');
        else if (!history.rows.length) body = emptyBox(t('historyEmpty'));
        else body = chart(history.rows, title);
        return `<section class="market-block market-history" data-market-history aria-label="${esc(title)}"><div class="market-blockhead"><h4>${esc(title)}</h4>${close}</div>
            <p class="market-note">${esc(t('historyNote'))}</p>${body}</section>`;
    }

    function chart(rows, title) {
        const points = rows.map((row) => ({ at: Number(row.at), price: Number(H.isKnown(row.buy) ? row.buy : row.sell), side: H.isKnown(row.buy) ? 'buy' : 'sell', row }));
        const width = 640; const height = 220; const left = 12; const right = 12; const top = 14; const bottom = 26;
        const minAt = Math.min(...points.map((point) => point.at)); const maxAt = Math.max(...points.map((point) => point.at));
        const low = Math.min(...points.map((point) => point.price)); const high = Math.max(...points.map((point) => point.price));
        const span = high - low || Math.max(1, high * 0.05);
        const x = (at) => (maxAt === minAt ? width / 2 : left + (at - minAt) / (maxAt - minAt) * (width - left - right));
        const y = (price) => (high === low ? height / 2 : top + (high - price) / span * (height - top - bottom));
        const date = (at) => new Date(at * 1000).toLocaleDateString(H.lang() === 'en' ? 'en-US' : 'ko-KR', { month: 'short', day: 'numeric' });
        const line = points.map((point) => `${x(point.at).toFixed(1)},${y(point.price).toFixed(1)}`).join(' ');
        // 점: 그래프가 가로로 늘어나도 둥글게 보이도록, 길이가 없는 선에 둥근 끝(늘어나지 않는 굵기)을 쓴다.
        const dots = points.map((point) => `<path class="market-chart-dot" d="M${x(point.at).toFixed(1)} ${y(point.price).toFixed(1)}h0.01"><title>${esc(`${date(point.at)} · ${H.price(point.price, { digits: 2 })}`)}</title></path>`).join('');
        const summary = t('historySummary', { n: points.length, min: H.price(low, { digits: 2 }), max: H.price(high, { digits: 2 }) });
        const svg = `<svg class="market-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${title}. ${summary}`)}" preserveAspectRatio="none">
            <line class="market-chart-grid" x1="${left}" y1="${top}" x2="${width - right}" y2="${top}"></line>
            <line class="market-chart-grid" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"></line>
            ${points.length > 1 ? `<polyline class="market-chart-line" points="${line}"></polyline>` : ''}${dots}</svg>`;
        const heads = [{ label: t('when') }, { label: t('price'), num: true }, { label: t('stock'), num: true }, { label: t('gameVersion') }];
        const cut = !historyAll && points.length > HISTORY_ROWS;
        const historyRows = window.VOLT_TABLE_SORT.rows('market-history', points.slice().reverse(), [
            point => point.at, point => point.price, point => point.side === 'buy' ? point.row.stock : point.row.inv, point => point.row.v,
        ], draw);
        const listRows = historyRows.slice(0, cut ? HISTORY_ROWS : points.length).map((point) => [
            `${esc(new Date(point.at * 1000).toLocaleString(H.lang() === 'en' ? 'en-US' : 'ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}<small>${esc(H.age(point.at))}</small>`,
            `${esc(H.price(point.price, { digits: 2 }))}<small>${esc(t(point.side === 'buy' ? 'buyPrice' : 'sellPrice'))}</small>`,
            point.side === 'buy' ? esc(H.scu(point.row.stock, { unknown: 'uex' })) : (H.isKnown(point.row.inv) ? esc(t('shopInv', { v: H.scu(point.row.inv) })) : `<span class="market-muted">${esc(t('takesUnknown'))}</span>`),
            esc(point.row.v || H.unknown('uex')),
        ]);
        return `<figure class="market-figure"><div class="market-chartbox">${svg}
            <span class="market-chart-high">${esc(H.price(high, { digits: 2 }))}</span><span class="market-chart-low">${esc(H.price(low, { digits: 2 }))}</span></div>
            <figcaption><span>${esc(date(minAt))}</span><span>${esc(summary)}</span><span>${esc(date(maxAt))}</span></figcaption></figure>
            ${table(t('historyTable'), heads, listRows, null, null, 'market-history')}
            ${cut ? `<p class="market-note">${esc(t('historyCut', { n: HISTORY_ROWS, total: points.length }))} <button type="button" class="market-btn is-small" data-act="history-all" data-k="history-all">${esc(t('historyShowAll', { total: points.length }))}</button></p>` : ''}`;
    }

    // 표에서 "기록 보기"를 누른 그 줄 바로 아래에 가격 기록을 넣는다 (화면이 다른 곳으로 튀지 않도록).
    const historyAfter = (list, terminalOf, commodityOf) => (index, columns) => {
        if (historyPlaced || !history || view.ht !== terminalOf(list[index]) || view.hc !== commodityOf(list[index])) return '';
        historyPlaced = true;
        return `<tr class="market-historyrow"><td colspan="${columns}">${drawHistory()}</td></tr>`;
    };

    const historyButton = (terminal, commodity) => `<button type="button" class="market-btn is-small" data-act="history" data-t="${terminal}" data-c="${commodity}" data-k="h-${terminal}-${commodity}">${esc(t('historyOpen'))}</button>`;

    // ── 탭: 상품 시세 ────────────────────────────────────────────────────────
    function drawPrices() {
        if (view.c !== null) return drawCommodity();
        const result = E.commoditySummary(model, settings(), { system: systemFilter() || undefined, sort: view.sort.split('-')[0] });
        const query = view.q.trim().toLowerCase();
        const rows = result.rows.filter((row) => !query || [row.name && row.name.en, row.name && row.name.ko, row.code].some((value) => value && String(value).toLowerCase().includes(query)));
        const old = rows.reduce((sum, row) => sum + row.oldBuy + row.oldSell, 0);
        const toolbar = `<div class="market-toolbar">
            <label class="market-field is-grow"><span>${esc(t('search'))}</span><input type="search" id="market-commodity-search" maxlength="60" data-input="q" data-k="q" value="${esc(view.q)}" placeholder="${esc(t('searchCommodity'))}"></label>
            <label class="market-field"><span>${esc(t('sort'))}</span><select aria-label="${esc(t('sort'))}" data-change="sort" data-k="sort">${SORTS.map(sort => {
                const [key, reverse] = sort.split('-');
                return `<option value="${sort}"${view.sort === sort ? ' selected' : ''}>${esc(t(PRICE_LABEL[PRICE_SORT.indexOf(key)]))} ${priceDown(key) !== Boolean(reverse) ? '↓' : '↑'}</option>`;
            }).join('')}</select></label>
        </div>`;
        if (!result.rows.length) return toolbar + emptyBox(t('noPriceRows'));
        if (!rows.length) return toolbar + emptyBox(t('noMatch'));
        const heads = PRICE_LABEL.map((key, i) => ({ label: t(key), num: i > 0, asc: i === 1 }));
        const [key, reverse] = view.sort.split('-');
        window.VOLT_TABLE_SORT.select('market-prices', PRICE_SORT.indexOf(key), priceDown(key) !== Boolean(reverse));
        const shown = window.VOLT_TABLE_SORT.rows('market-prices', rows, [
            row => commodityName(row.c), row => row.cheapestBuy?.price, row => row.bestSell?.price,
            row => row.margin, row => row.marginPercent, row => row.buyPlaces + row.sellPlaces,
        ], (column, desc) => {
            const field = PRICE_SORT[column];
            view.sort = field + (desc === priceDown(field) ? '' : '-rev');
            saveHash();
            draw();
        }).slice(0, listLimit);
        const body = shown.map((row) => [
            `<a class="market-link is-strong" href="${link({ tab: 'prices', c: row.c })}" data-k="c-${row.c}">${esc(commodityName(row.c))}</a>${row.legalEverywhere === false ? ` <span class="market-tag is-warn">${esc(t('illegalSome'))}</span>` : ''}`,
            row.cheapestBuy ? `${priceWithAge(row.cheapestBuy.price, row.cheapestBuy.at, row.cheapestBuy.ageLevel)}<span class="market-where">${terminalCell(row.cheapestBuy.t)}</span>` : `<span class="market-muted">${esc(t('noBuy'))}</span>`,
            row.bestSell ? `${priceWithAge(row.bestSell.price, row.bestSell.at, row.bestSell.ageLevel)}<span class="market-where">${terminalCell(row.bestSell.t)}</span>` : `<span class="market-muted">${esc(t('noSell'))}</span>`,
            row.margin === null ? '<span class="market-muted">—</span>' : esc(H.price(row.margin, { digits: 2 })),
            row.marginPercent === null ? '<span class="market-muted">—</span>' : esc(H.percent(row.marginPercent, { digits: 1 })),
            esc(t('placesValue', { b: row.buyPlaces, s: row.sellPlaces })),
        ]);
        return `${toolbar}<div data-market-paged>${table(t('tabPrices'), heads, body, null, null, 'market-prices')}</div>
            ${rows.length > shown.length ? `<p class="market-note">${esc(t('showing', { n: shown.length, total: rows.length }))} <button type="button" class="market-btn is-small" data-act="more" data-k="more">${esc(t('showMore'))}</button></p>` : ''}
            ${old ? `<p class="market-note">${esc(t('oldLeftOut', { n: old }))}</p>` : ''}`;
    }

    function legalityLine(detail) {
        if (!detail.illegal) {
            return `<p class="market-note">${esc(t('legalUnknown'))}${detail.uexIllegal ? ` · <span class="market-tag is-warn">${esc(t('uexIllegal'))}</span>` : ''}</p>`;
        }
        const entries = Object.entries(detail.illegal);
        if (!entries.length) return `<p class="market-note">${esc(t('legalAll'))}</p>`;
        const lawName = (id) => H.name((game.world.jurisdictions[id] || {}).name) || id;
        const prohibited = entries.filter(([, code]) => code === 'p').map(([id]) => lawName(id));
        const controlled = entries.filter(([, code]) => code !== 'p').map(([id]) => lawName(id));
        return `<p class="market-note"><span class="market-tag is-warn">${esc(t('illegalSome'))}</span> ${prohibited.length ? `${esc(t('prohibitedIn'))}: ${esc(prohibited.join(', '))}` : ''}${prohibited.length && controlled.length ? ' · ' : ''}${controlled.length ? `${esc(t('controlledIn'))}: ${esc(controlled.join(', '))}` : ''}</p>`;
    }

    function drawCommodity() {
        const system = systemFilter() || undefined;
        const detail = E.commodityDetail(model, settings(), view.c, { system });
        const back = `<a class="market-btn" href="${link({ tab: 'prices' })}" data-k="back">← ${esc(t('back'))}</a>`;
        if (!detail.ok) return `<div class="market-detail">${back}${emptyBox(t('unknownCommodity'))}</div>`;
        const rowClass = (list) => (index) => (list[index].ageLevel === 'ok' ? '' : 'is-old');
        const buyHeads = [{ label: t('station') }, { label: t('price'), num: true }, { label: t('stock'), num: true }, { label: t('boxes') }, { label: t('reported') }, { label: t('history'), action: true }];
        const sellHeads = [{ label: t('station') }, { label: t('price'), num: true }, { label: t('shopLevel') }, { label: t('boxes') }, { label: t('reported') }, { label: t('history'), action: true }];
        const buys = detail.buys.map((row) => [terminalCell(row.t), `<strong class="market-price">${esc(H.price(row.price, { digits: 2 }))}</strong>`, stockCell(row), esc(boxesText(row.box)), ageTag(row.at, row.ageLevel), historyButton(row.t, detail.c)]);
        const sells = detail.sells.map((row) => [terminalCell(row.t), `<strong class="market-price">${esc(H.price(row.price, { digits: 2 }))}</strong>`, levelCell(row), esc(boxesText(row.box)), ageTag(row.at, row.ageLevel), historyButton(row.t, detail.c)]);
        const bestBuy = detail.buys.find((row) => row.ageLevel === 'ok' && !row.soldOut);
        const bestSell = detail.sells.find((row) => row.ageLevel === 'ok');
        const margin = bestBuy && bestSell ? bestSell.price - bestBuy.price : null;
        const traits = `<dl class="market-traits">
            <div><dt>${esc(t('cheapestBuy'))}</dt><dd>${bestBuy ? `${esc(H.price(bestBuy.price, { digits: 2 }))}<small>${esc(terminalName(bestBuy.t))} · ${ageTag(bestBuy.at, bestBuy.ageLevel)}</small>` : `<span class="market-muted">${esc(t('noBuy'))}</span>`}</dd></div>
            <div><dt>${esc(t('bestSell'))}</dt><dd>${bestSell ? `${esc(H.price(bestSell.price, { digits: 2 }))}<small>${esc(terminalName(bestSell.t))} · ${ageTag(bestSell.at, bestSell.ageLevel)}</small>` : `<span class="market-muted">${esc(t('noSell'))}</span>`}</dd></div>
            <div><dt>${esc(t('margin'))}</dt><dd>${margin === null ? '<span class="market-muted">—</span>' : esc(H.price(margin, { digits: 2 }))}</dd></div>
            <div><dt>${esc(t('boxes'))}</dt><dd>${esc(Array.isArray(detail.boxes) && detail.boxes.length ? detail.boxes.join(', ') : H.unknown('game'))}</dd></div>
        </dl>`;
        const routes = routesBlock(t('topRoutes'), E.rankRoutes(model, settings(), { commodity: detail.c, system, limit: 5 }), { c: detail.c }, 'routes-c');
        historyPlaced = false;
        const after = (list) => historyAfter(list, (row) => row.t, () => detail.c);
        const buyTable = buys.length ? table(t('buyPlaces'), buyHeads, buys, rowClass(detail.buys), after(detail.buys)) : emptyBox(t('noMatch'));
        const sellTable = sells.length ? table(t('sellPlaces'), sellHeads, sells, rowClass(detail.sells), after(detail.sells)) : emptyBox(t('noMatch'));
        return `<div class="market-detail" data-market-commodity="${detail.c}">
            <div class="market-detailhead"><div><h3>${esc(commodityName(detail.c))}</h3><p class="market-muted">${esc([detail.code, detail.group].filter(Boolean).join(' · '))}</p></div>
                <div class="market-actions">${back}<a class="market-btn" href="${link({ tab: 'movers', c: detail.c })}" data-k="to-movers">${esc(t('compareAverage'))}</a>${mapLink({ mark: [...detail.buys, ...detail.sells].map((row) => row.t) }, { name: commodityName(detail.c), count: true, cls: 'market-maplink-all' })}</div></div>
            ${legalityLine(detail)}${traits}${historyPlaced ? '' : drawHistory()}
            <section class="market-block"><h4>${esc(t('buyPlaces'))}</h4>${mapLink({ mark: detail.buys.map((row) => row.t) }, { name: t('buyPlaces'), count: true, cls: 'market-maplink-buy' })}${buyTable}</section>
            <section class="market-block"><h4>${esc(t('sellPlaces'))}</h4>${mapLink({ mark: detail.sells.map((row) => row.t) }, { name: t('sellPlaces'), count: true, cls: 'market-maplink-sell' })}${sellTable}</section>
            ${routes}</div>`;
    }

    // ── 탭: 거래소 ──────────────────────────────────────────────────────────
    const hasFacility = (terminal, flag) => terminal.flags[flag] === true || Boolean(AMENITY_FOR_FLAG[flag] && terminal.amenities && terminal.amenities.includes(AMENITY_FOR_FLAG[flag]));

    function facilityTags(terminal) {
        const tags = FLAG_ORDER.filter((flag) => hasFacility(terminal, flag)).map((flag) => `<span class="market-tag${FACILITY_FILTERS.includes(flag) ? ' is-key' : ''}">${esc(t(`flag_${flag}`))}</span>`);
        return tags.length ? tags.join(' ') : `<span class="market-muted">${esc(t('notReported'))}</span>`;
    }

    function drawStations() {
        if (view.t !== null) return drawStation();
        const query = view.q.trim().toLowerCase();
        const systems = systemFilter();
        const list = E.listTerminals(model, { system: systems || undefined })
            .filter((terminal) => terminal.buyCount + terminal.sellCount > 0)
            .filter((terminal) => !query || [terminal.name.en, terminal.name.ko, terminal.uexName, terminal.code, terminal.place].some((value) => value && String(value).toLowerCase().includes(query)))
            .filter((terminal) => view.fac.every((flag) => hasFacility(terminal, flag)))
            .filter((terminal) => view.box === null || (terminal.maxBox !== null && terminal.maxBox >= view.box))
            .sort((a, b) => String(a.system).localeCompare(String(b.system)) || H.name(a.name).localeCompare(H.name(b.name), H.lang()));
        const toolbar = `<div class="market-toolbar">
            <label class="market-field is-grow"><span>${esc(t('search'))}</span><input type="search" id="market-station-search" maxlength="60" data-input="q" data-k="q" value="${esc(view.q)}" placeholder="${esc(t('searchStation'))}"></label>
            <label class="market-field"><span>${esc(t('minBox'))}</span><select data-change="box" data-k="box"><option value="">${esc(t('minBoxAny'))}</option>${E.STANDARD_BOXES.map((size) => `<option value="${size}"${view.box === size ? ' selected' : ''}>${esc(t('minBoxValue', { n: size }))}</option>`).join('')}</select></label>
        </div>
        <div class="market-chiprow" role="group" aria-label="${esc(t('facilityFilter'))}"><span class="market-chiprow-label">${esc(t('facilityFilter'))}</span>${FACILITY_FILTERS.map((flag) => `<button type="button" class="market-chip${view.fac.includes(flag) ? ' is-include' : ''}" data-act="fac" data-id="${flag}" data-k="fac-${flag}" aria-pressed="${view.fac.includes(flag)}">${esc(t(`flag_${flag}`))}</button>`).join('')}</div>`;
        if (!list.length) return toolbar + emptyBox(t(terminalIndex.size ? 'noMatch' : 'noPriceRows'));
        const heads = [{ label: t('station') }, { label: t('facilities') }, { label: t('maxBox'), num: true }, { label: t('buyCount'), num: true }, { label: t('sellCount'), num: true }];
        const shown = window.VOLT_TABLE_SORT.rows('market-stations', list, [
            row => H.name(row.name) || row.uexName, row => FLAG_ORDER.filter(flag => hasFacility(row, flag)).map(flag => t('flag_' + flag)).join(' ') || null,
            row => row.maxBox, row => row.buyCount, row => row.sellCount,
        ], draw).slice(0, listLimit);
        const rows = shown.map((terminal) => [
            `<a class="market-link is-strong" href="${link({ tab: 'stations', t: terminal.id })}" data-k="t-${terminal.id}">${esc(H.name(terminal.name) || terminal.uexName)}</a><small>${esc(placeLine(terminal.id))}</small>${mapLink({ focus: terminal.id }, { name: H.name(terminal.name) || terminal.uexName, cls: 'market-maplink-row' })}`,
            facilityTags(terminal),
            esc(terminal.maxBox === null ? H.unknown('uex') : H.scu(terminal.maxBox)),
            esc(t('countValue', { n: terminal.buyCount })), esc(t('countValue', { n: terminal.sellCount })),
        ]);
        return `${toolbar}<p class="market-note">${esc(t('stationsCount', { n: list.length }))}</p><div data-market-paged>${table(t('tabStations'), heads, rows, null, null, 'market-stations')}</div>
            ${list.length > shown.length ? `<p class="market-note">${esc(t('showing', { n: shown.length, total: list.length }))} <button type="button" class="market-btn is-small" data-act="more" data-k="more">${esc(t('showMore'))}</button></p>` : ''}`;
    }

    function drawStation() {
        const sheet = E.terminalSheet(model, settings(), view.t);
        const back = `<a class="market-btn" href="${link({ tab: 'stations' })}" data-k="back">← ${esc(t('back'))}</a>`;
        if (!sheet.ok) return `<div class="market-detail">${back}${emptyBox(t('unknownStation'))}</div>`;
        const terminal = sheet.terminal;
        const world = game.world;
        const known = (value) => (value === null || value === undefined || value === '' ? H.unknown('game') : String(value));
        const kind = terminal.surface === null ? H.unknown('game') : t(terminal.surface ? 'kindSurface' : 'kindStation');
        const law = terminal.law ? H.name((world.jurisdictions[terminal.law] || {}).name) || terminal.law : H.unknown('game');
        const traits = `<dl class="market-traits">
            <div><dt>${esc(t('maxBox'))}</dt><dd>${esc(terminal.maxBox === null ? H.unknown('uex') : H.scu(terminal.maxBox))}</dd></div>
            <div><dt>${esc(t('kind'))}</dt><dd>${esc(kind)}</dd></div>
            <div><dt>${esc(t('pad'))}</dt><dd>${esc(known(terminal.pad))}</dd></div>
            <div><dt>${esc(t('hangar'))}</dt><dd>${esc(known(terminal.hangar))}</dd></div>
            <div><dt>${esc(t('law'))}</dt><dd>${esc(law)}</dd></div>
            <div><dt>${esc(t('faction'))}</dt><dd>${esc(terminal.faction || H.unknown('uex'))}</dd></div>
        </dl>`;
        const flags = FLAG_ORDER.slice(0, 8).map((flag) => {
            const reported = terminal.flags[flag] === true;
            const inGame = Boolean(AMENITY_FOR_FLAG[flag] && terminal.amenities && terminal.amenities.includes(AMENITY_FOR_FLAG[flag]));
            // UEX 보고와 게임 자료를 따로 말한다: 보고는 없고 게임 자료에만 있는 시설은 "있음(보고됨)"으로 보이지 않게 한다.
            const state = reported ? (inGame ? t('alsoInGame') : t('yes')) : (inGame ? t('onlyInGame') : t('notReported'));
            return `<li class="${reported ? 'is-yes' : (inGame ? 'is-game' : 'is-unknown')}"><span>${esc(t(`flag_${flag}`))}</span><strong>${esc(state)}</strong></li>`;
        }).join('');
        const amenities = terminal.amenities === null ? `<p class="market-muted">${esc(H.unknown('game'))}</p>`
            : `<p class="market-taglist">${terminal.amenities.map((code) => `<span class="market-tag">${esc(H.name((world.amenities[code] || {}).name) || code)}</span>`).join(' ') || esc(H.unknown('game'))}</p>`;
        const illegal = (row) => (row.illegal ? ` <span class="market-tag is-warn">${esc(t('illegalHere'))}</span>` : '');
        const commodityCell = (row) => `<a class="market-link" href="${link({ tab: 'prices', c: row.c })}">${esc(commodityName(row.c))}</a>${illegal(row)}`;
        const rowClass = (list) => (index) => (list[index].ageLevel === 'ok' ? '' : 'is-old');
        const buyHeads = [{ label: t('commodity') }, { label: t('price'), num: true }, { label: t('stock'), num: true }, { label: t('boxes') }, { label: t('reported') }, { label: t('history'), action: true }];
        const sellHeads = [{ label: t('commodity') }, { label: t('price'), num: true }, { label: t('shopLevel') }, { label: t('boxes') }, { label: t('reported') }, { label: t('history'), action: true }];
        const buys = sheet.buys.map((row) => [commodityCell(row), `<strong class="market-price">${esc(H.price(row.price, { digits: 2 }))}</strong>`, stockCell(row), esc(boxesText(row.box)), ageTag(row.at, row.ageLevel), historyButton(terminal.id, row.c)]);
        const sells = sheet.sells.map((row) => [commodityCell(row), `<strong class="market-price">${esc(H.price(row.price, { digits: 2 }))}</strong>`, levelCell(row), esc(boxesText(row.box)), ageTag(row.at, row.ageLevel), historyButton(terminal.id, row.c)]);
        const routes = routesBlock(t('routesFromHere'), E.nextLegs(model, settings(), { from: terminal.id }, { limit: 5 }), { from: terminal.id }, 'routes-t');
        historyPlaced = false;
        const after = (list) => historyAfter(list, () => terminal.id, (row) => row.c);
        const buyTable = buys.length ? table(t('sellsToYou'), buyHeads, buys, rowClass(sheet.buys), after(sheet.buys)) : emptyBox(t('nothingSold'));
        const sellTable = sells.length ? table(t('buysFromYou'), sellHeads, sells, rowClass(sheet.sells), after(sheet.sells)) : emptyBox(t('nothingSold'));
        return `<div class="market-detail" data-market-station="${terminal.id}">
            <div class="market-detailhead"><div><h3>${esc(H.name(terminal.name) || terminal.uexName)}</h3>
                <p class="market-muted">${esc([...new Set([terminal.system, terminal.place, terminal.uexName, terminal.code].filter(Boolean))].join(' · '))}</p>
                ${terminal.live ? '' : `<p><span class="market-tag is-warn">${esc(t('notLive'))}</span></p>`}</div>
                <div class="market-actions">${back}${mapLink({ focus: terminal.id }, { name: H.name(terminal.name) || terminal.uexName, cls: 'market-maplink-station' })}<a class="market-btn" href="${esc(H.buildHash('tours', { tab: 'tour', start: terminal.id }))}">${esc(H.lang() === 'ko' ? '여기서 여러 곳 돌기' : 'Visit multiple stops from here')}</a><a class="market-btn" href="${link({ tab: 'movers', t: terminal.id })}" data-k="to-movers">${esc(t('compareAverage'))}</a></div></div>
            <div class="market-here"><button type="button" class="market-btn is-primary" data-act="here" data-k="here">${esc(t('here'))}</button><small class="market-muted">${esc(t('hereNote'))}</small></div>
            ${traits}
            <div class="market-columns">
                <section class="market-block"><h4>${esc(t('uexFlags'))}</h4><ul class="market-flags">${flags}</ul><p class="market-note">${esc(t('uexFlagsNote'))}</p></section>
                <section class="market-block"><h4>${esc(t('gameAmenities'))}</h4>${amenities}</section>
            </div>
            ${historyPlaced ? '' : drawHistory()}
            <section class="market-block"><h4>${esc(t('sellsToYou'))}</h4>${buyTable}</section>
            <section class="market-block"><h4>${esc(t('buysFromYou'))}</h4>${sellTable}</section>
            ${routes}</div>`;
    }

    // ── 탭: 가격 변동 ────────────────────────────────────────────────────────
    function drawMovers() {
        const commodities = [...model.commodities.values()].map((commodity) => ({ id: commodity.id, label: commodityName(commodity.id) })).sort((a, b) => a.label.localeCompare(b.label, H.lang()));
        const stations = [...terminalIndex.values()].filter((terminal) => terminal.live && terminal.buyCount + terminal.sellCount > 0)
            .map((terminal) => ({ id: terminal.id, label: `${H.name(terminal.name) || terminal.uexName}${terminal.system ? ` (${terminal.system})` : ''}` })).sort((a, b) => a.label.localeCompare(b.label, H.lang()));
        const options = (list, selected) => `<option value="">${esc(t('moversPick'))}</option>${list.map((item) => `<option value="${item.id}"${item.id === selected ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}`;
        const controls = `<p class="market-note">${esc(t('moversIntro', { d: UEX_AVERAGE_DAYS }))}</p>
            <div class="market-toolbar">
                <label class="market-field is-grow"><span>${esc(t('moversPickCommodity'))}</span><select data-change="movers-c" data-k="movers-c">${options(commodities, view.c)}</select></label>
                <label class="market-field is-grow"><span>${esc(t('moversPickStation'))}</span><select data-change="movers-t" data-k="movers-t">${options(stations, view.c === null ? view.t : null)}</select></label>
                <button type="button" class="market-btn" data-act="scan" data-k="scan"${commodities.length ? '' : ' disabled'}>${esc(t('moversScan', { n: SCAN_COUNT }))}</button>
            </div>`;
        if (!movers) return controls + emptyBox(t('moversChoose'));
        if (movers.loading) return `${controls}<p class="market-empty" role="status">${esc(t('moversLoading'))}</p>`;
        if (movers.error) return controls + errorBox(movers.error, 'retry-movers');
        const all = movers.key === 'scan' ? movers.rows.filter((row) => row.diff !== null) : movers.rows;
        if (!all.length) return controls + emptyBox(t('moversEmpty'));
        const first = view.c !== null ? t('station') : (view.t !== null ? t('commodity') : `${t('commodity')} · ${t('station')}`);
        const heads = [{ label: first }, { label: t('side') }, { label: t('nowPrice'), num: true }, { label: t('avgPrice', { d: UEX_AVERAGE_DAYS }), num: true }, { label: t('change'), num: true }, { label: t('reported') }];
        const shown = window.VOLT_TABLE_SORT.rows('market-movers', all, [
            row => view.c !== null ? terminalName(row.t, row.terminalName) : commodityName(row.c, row.commodityName),
            row => t(row.side === 'buy' ? 'buyPrice' : 'sellPrice'), row => row.price, row => row.average, row => row.diff, row => row.at,
        ], draw).slice(0, listLimit);
        const rows = shown.map((row) => {
            const commodity = `<a class="market-link" href="${link({ tab: 'prices', c: row.c })}">${esc(commodityName(row.c, row.commodityName))}</a>`;
            const name = view.c !== null ? terminalCell(row.t, row.terminalName) : (view.t !== null ? commodity : `${commodity}<span class="market-where">${terminalCell(row.t, row.terminalName)}</span>`);
            const direction = row.diff === null ? '' : (Math.abs(row.diff) < 0.05 ? 'same' : (row.diff > 0 ? 'up' : 'down'));
            const change = row.diff === null ? `<span class="market-muted">—</span>`
                : `<span class="market-change is-${direction}">${direction === 'up' ? '▲ +' : (direction === 'down' ? '▼ ' : '')}${esc(H.percent(row.diff, { digits: 1 }))}</span><small>${esc(t(direction))}</small>`;
            return [name, esc(t(row.side === 'buy' ? 'buyPrice' : 'sellPrice')), `<strong class="market-price">${esc(H.price(row.price, { digits: 2 }))}</strong>`,
                row.average === null ? `<span class="market-muted">${esc(t('noAverage', { d: UEX_AVERAGE_DAYS }))}</span>` : esc(H.price(row.average, { digits: 2 })), change, ageTag(row.at)];
        });
        return `${controls}${movers.key === 'scan' ? `<p class="market-note">${esc(t('moversScanNote', { n: movers.scanned }))}</p>` : ''}
            <div data-market-movers data-market-paged>${table(t('tabMovers'), heads, rows, (index) => (H.ageLevel(shown[index].at, shared().maxAgeDays) === 'ok' ? '' : 'is-old'), null, 'market-movers')}</div>
            ${all.length > shown.length ? `<p class="market-note">${esc(t('showing', { n: shown.length, total: all.length }))} <button type="button" class="market-btn is-small" data-act="more" data-k="more">${esc(t('showMore'))}</button></p>` : ''}`;
    }

    // ── 탭: 화물선 고르기 ──────────────────────────────────────────────
    function drawBudget() {
        const state = shared();
        const form = `<div class="market-toolbar">
            ${view.box ? `<p class="market-note">${esc(t('maxBox'))} · ${esc(H.scu(view.box))}</p>` : ''}
            ${moneyField('budgetMoney', 'budget-money', '', true)}
            <label class="market-field"><span>${esc(t('budgetMode'))}</span><select data-change="mode" data-k="mode">${MODES.map((mode) => `<option value="${mode}"${view.mode === mode ? ' selected' : ''}>${esc(t(`mode${mode[0].toUpperCase()}${mode.slice(1)}`))}</option>`).join('')}</select></label>
        </div>`;
        const fits = view.box ? E.listShips(model).filter((ship) => {
            const hold = E.shipProfile(model, { ship: ship.id });
            return hold.known && hold.slots.some((slot) => slot.minBox <= view.box && view.box <= slot.size) && (!view.capacity || hold.capacity >= view.capacity);
        }) : [];
        const compatible = view.box ? `<div class="market-toolbar"><label class="market-field"><span>${esc(H.lang() === 'ko' ? '상자 크기와 적재량이 맞는 함선' : 'Ships matching crate size and capacity')}${view.capacity ? ` · ${esc(H.scu(view.capacity))}` : ''}</span><select data-change="hold" data-k="contract-ship"><option value="">${esc(t('ship'))} (${fits.length})</option>${fits.map((ship) => `<option value="${esc(ship.id)}"${ship.id === view.ship ? ' selected' : ''}>${esc(shipName(ship.id))} · ${esc(H.scu(ship.scu))}</option>`).join('')}</select></label></div>` : '';
        let body;
        if (pricesError) body = errorBox(pricesError, 'retry-prices');
        else if (!prices) body = `<p class="market-empty" role="status">${esc(t('loadingPrices'))}</p>`;
        else if (vehiclesError) body = errorBox(vehiclesError, 'retry-vehicles');
        else if (!vehicles) body = `<p class="market-empty" role="status">${esc(t('loadingPrices'))}</p>`;
        else if (state.budget === null) body = emptyBox(t('budgetEnter'));
        else if (!budget || budget.running) body = `<p class="market-empty" role="status">${esc(t('budgetRunning', { done: budget ? budget.done : 0, total: budget ? budget.total : 0 }))}</p>`;
        else body = budgetTable();
        return `<section class="market-block" data-market-budget><h3>${esc(t('budgetTitle'))}</h3>${compatible}${form}${body}</section>`;
    }

    function budgetTable() {
        const stats = `<p class="market-note">${esc(t('budgetLegal'))}</p><p class="market-note">${esc(t('budgetStats', { noPrice: budget.noPrice, tooExpensive: budget.tooExpensive }))}</p>
            ${budget.unknownCargo.length ? `<p class="market-note">${esc(t('unknownCargoShips', { list: budget.unknownCargo.map(shipName).join(', ') }))}</p>` : ''}`;
        const matching = view.box ? budget.rows.filter((row) => {
            const profile = E.shipProfile(model, { ...settings(), ship: row.ship });
            return profile.known && profile.maxBox >= view.box && (!view.capacity || profile.capacity >= view.capacity);
        }) : budget.rows;
        if (!matching.length) return emptyBox(t('budgetNone')) + stats;
        const heads = [{ label: t('ship') }, { label: `${t('buyOrRent')} · ${t('shipPrice')}`, num: true }, { label: t('soldAt') }, { label: t('hold'), num: true }, { label: t('moneyLeft'), num: true },
            { label: t('loadOnRoute'), num: true }, { label: t('profitRun'), num: true }, { label: t('payback') }];
        const shown = window.VOLT_TABLE_SORT.rows('market-ships', matching, [
            row => shipName(row.ship), row => row.price, row => row.shop.name || row.shop.place || null,
            row => row.capacity, row => row.moneyLeft, row => row.bestRoute?.quantity, row => row.profitPerRun, row => row.runsToPayBack,
        ], draw).slice(0, listLimit);
        const none = `<span class="market-muted">${esc(t('noRouteForShip'))}</span>`;
        const limits = { ship: 'limitShip', stock: 'limitStock', budget: 'limitBudget', boxes: 'limitBoxes', destination: 'limitDestination' };
        const rows = shown.map((row) => {
            const shop = [row.shop.name, row.shop.place, row.shop.system].filter(Boolean).join(' · ') || H.unknown('uex');
            const best = row.bestRoute;
            // 걸리는 시간은 "한 번"을 끝까지 다녀와야 하므로 올림한 횟수 × 한 번에 걸리는 시간으로 센다 (한 번보다 짧게 나오지 않는다).
            const seconds = best && row.runsToPayBack !== null && H.isKnown(best.seconds) ? row.runsToPayBack * best.seconds : null;
            const payback = row.runsToPayBack === null ? none
                : esc(seconds === null ? t('paybackRuns', { runs: H.num(row.runsToPayBack) }) : t('paybackValue', { runs: H.num(row.runsToPayBack), time: H.duration(seconds) }));
            // 실제로 싣는 양과 그 값. 화물칸을 다 못 채우면 무엇 때문인지 적는다 (상점 재고·남는 돈·상자 크기).
            let load = none;
            if (best) {
                const why = best.full ? ['ship'] : [...new Set(best.goods.map((good) => good.limitedBy))].filter((name) => limits[name]);
                load = `${esc(t('loadOf', { q: H.scu(best.quantity), cap: H.scu(row.capacity) }))}<small>${esc([t('loadCost', { v: H.price(best.investment) }), ...why.map((name) => t(limits[name]))].join(' · '))}</small>`;
            }
            return [
                `<a class="market-link is-strong" href="${link({ tab: 'ships', ship: row.ship })}" data-hold="${esc(row.ship)}" data-k="hold-${esc(row.ship)}-${row.kind}">${esc(shipName(row.ship))}</a>${row.matchedBy === 'name' ? `<small>${esc(t('matchedByName', { name: row.uexName || '' }))}</small>` : ''}`,
                `<span class="market-kind">${esc(t(row.kind === 'buy' ? 'kindBuy' : 'kindRent'))}</span> <strong class="market-price">${esc(H.price(row.price))}</strong><small>${esc(H.age(row.priceAt))}${row.kind === 'rent' ? ` · ${esc(t('rentPeriodUnknown'))}` : ''}</small>`,
                esc(shop), esc(H.scu(row.capacity)), esc(H.price(row.moneyLeft)),
                load,
                best ? `${esc(H.price(row.profitPerRun))}<small>${esc(terminalName(best.from))} → ${esc(terminalName(best.to))} · ${ageTag(best.oldestAt)}</small>` : none,
                payback,
            ];
        });
        const codes = [...budget.assumptions, ...budget.rows.flatMap((row) => (row.bestRoute ? row.bestRoute.assumptions : []))];
        const more = matching.length > shown.length ? `<p class="market-note">${esc(t('showing', { n: shown.length, total: matching.length }))} <button type="button" class="market-btn is-small" data-act="more" data-k="more">${esc(t('showMore'))}</button></p>` : '';
        return `<div class="market-budget" data-market-paged>${table(t('budgetTitle'), heads, rows, null, null, 'market-ships')}</div>` + more + stats + assumptionList(codes, 'budget');
    }

    function drawHold() {
        const selected = view.ship || shared().ship;
        const picker = `<div class="market-toolbar"><label class="market-field is-grow"><span>${esc(t('holdPick'))}</span><select data-change="hold" data-k="hold-ship"><option value="">${esc(t('moversPick'))}</option>${shipOptions(selected, false)}</select></label></div>`;
        const ship = selected ? model.ships.get(selected) : null;
        if (!ship) return `<section class="market-block" data-market-hold data-market-reveal><h3 tabindex="-1" data-k="hold-title">${esc(t('holdTitle'))}</h3>${picker}</section>`;
        const profile = E.shipProfile(model, { ship: selected });
        let body;
        if (!profile.known) {
            body = emptyBox(t('holdUnknown'));
        } else if (!(profile.capacity > 0)) {
            body = emptyBox(t('holdNoGrid'));
        } else {
            const grids = (ship.g || []).map((grid) => [esc(grid.c.join(' × ')), esc(H.num(grid.n || 1)), esc(H.scu(grid.box)), esc(H.scu(grid.minBox || 1))]);
            const mixed = new Map();
            for (const slot of profile.slots) mixed.set(slot.size, (mixed.get(slot.size) || 0) + slot.count);
            const boxes = E.STANDARD_BOXES.map((size) => {
                const only = E.shipProfile(model, { ship: selected, boxes: [size] });
                const count = only.known && only.capacity > 0 ? Math.round(only.capacity / size) : 0;
                return [esc(t('scuUnit', { n: size })),
                    count ? esc(t('boxCountScu', { n: H.num(count), scu: H.scu(only.capacity) })) : `<span class="market-muted">${esc(t('doesNotFit'))}</span>`,
                    mixed.get(size) ? esc(t('boxCount', { n: H.num(mixed.get(size)) })) : '<span class="market-muted">—</span>'];
            });
            body = `<dl class="market-traits"><div><dt>${esc(t('holdTotal'))}</dt><dd>${esc(H.scu(profile.scu))}</dd></div><div><dt>${esc(t('holdBiggest'))}</dt><dd>${esc(H.scu(profile.maxBox))}</dd></div></dl>
                <div class="market-columns">
                    <section class="market-block"><h4>${esc(t('holdGrids'))}</h4>${table(t('holdGrids'), [{ label: t('gridSize') }, { label: t('gridCount'), num: true }, { label: t('gridMaxBox'), num: true }, { label: t('gridMinBox'), num: true }], grids)}</section>
                    <section class="market-block"><h4>${esc(t('holdPerBox'))}</h4>${table(t('holdPerBox'), [{ label: t('boxSize') }, { label: t('onlyThis'), num: true }, { label: t('mixed'), num: true }], boxes)}</section>
                </div>${assumptionList(['cargo.packing'], 'hold')}`;
        }
        return `<section class="market-block" data-market-hold="${esc(selected)}" data-market-reveal><h3 tabindex="-1" data-k="hold-title">${esc(t('holdTitle'))}: ${esc(shipName(selected))}</h3>${picker}${body}</section>`;
    }

    // ── 그리기 (HTML 을 넣는 유일한 곳) ──────────────────────────────────────
    function content() {
        if (view.tab === 'ships') return drawBudget() + drawHold();
        if (pricesError) return errorBox(pricesError, 'retry-prices');
        if (!prices) return `<p class="market-empty" role="status">${esc(t('loadingPrices'))}</p>`;
        // 가격은 받았지만 상품 이름표를 못 받았을 때: 번호로 보인다는 것을 알리고 다시 받을 수 있게 한다.
        const names = prices.commodities ? '' : `<div class="market-error" role="status" data-market-names><p>${esc(t('namesMissing'))}</p><button type="button" class="market-btn" data-act="retry-prices" data-k="retry-prices">${esc(t('retry'))}</button></div>`;
        if (view.tab === 'stations') return names + drawStations();
        if (view.tab === 'movers') return names + drawMovers();
        return names + drawPrices();
    }

    // 초점을 옮긴다. scroll 이면 그 상자의 위쪽이 고정 머리글 아래에 오도록 화면도 옮긴다.
    function moveFocus(selector, scroll, focus) {
        const node = root.querySelector(selector);
        if (!node) return;
        if (focus) node.focus({ preventScroll: true });
        if (!scroll) return;
        // 주소가 바뀌면 사이트 라우터가 이 다음에 화면을 맨 위로 올린다. 그 뒤에 옮겨야 하므로 한 박자 늦춘다.
        window.setTimeout(() => {
            const now = root && root.querySelector(selector); // 그 사이에 다시 그렸을 수 있다
            if (now) (now.closest('[data-market-reveal]') || now).scrollIntoView({ block: 'start', behavior: 'instant' });
        }, 0);
    }

    function draw() {
        if (!root) return;
        const active = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
        const focus = active ? { key: active.getAttribute('data-k'), start: active.selectionStart, end: active.selectionEnd } : null;
        for (const box of root.querySelectorAll('details[data-d]')) openDetails.set(box.dataset.d, box.open);
        let html;
        if (gameError) html = errorBox(gameError, 'retry-game');
        else if (!game || !model) html = `<p class="market-empty" role="status">${esc(t('loading'))}</p>`;
        else html = `${drawSettings()}${drawTabs()}<div class="market-body" data-market-tab="${view.tab}" tabindex="-1">${content()}</div>${drawFooter()}`;
        window.VOLT_SEARCH_RENDER(root, html);
        window.VOLT_TABLE_SORT.enhance(root);
        const viewKey = view.tab === 'ships' ? 'ships' : `${view.tab}:${view.c}:${view.t}`;
        const changed = viewKey !== lastViewKey;
        lastViewKey = viewKey;
        // 1) 누른 것이 정해 둔 곳 (화물칸 보기, 더 보기로 새로 나온 줄, 주소로 연 가격 기록)
        if (pending && Date.now() > pending.until) pending = null;
        const wanted = pending ? root.querySelector(pending.selector) : null;
        if (wanted) {
            const { selector, scroll, focus: wantFocus } = pending;
            pending = null;
            moveFocus(selector, scroll, wantFocus);
            if (wantFocus) return;
        } else if (pending && pending.once) {
            pending = null;
        }
        // 2) 다시 그리기 전에 초점이 있던 것과 같은 것
        const next = focus && focus.key ? root.querySelector(`[data-k="${CSS.escape(focus.key)}"]`) : null;
        if (next === active && next?.matches('input[type="search"]')) return;
        if (next) {
            next.focus({ preventScroll: true });
            if (typeof focus.start === 'number' && typeof next.setSelectionRange === 'function') {
                try { next.setSelectionRange(focus.start, focus.end); } catch (_error) { /* 숫자 입력 등 선택을 못 하는 칸 */ }
            }
            return;
        }
        // 3) 초점이 있던 것이 사라졌으면(목록 → 한 곳 보기, 다시 시도 성공 등) 본문으로 옮긴다. 문서 맨 위로 떨어지지 않게.
        //    다른 화면으로 바뀐 것이면 본문 위쪽이 보이도록 화면도 옮긴다.
        const body = active ? root.querySelector('.market-body') : null;
        if (body) {
            const top = body.getBoundingClientRect().top;
            moveFocus('.market-body', changed && (top < 60 || top > window.innerHeight * 0.5), true);
        }
    }

    // ── 입력 ────────────────────────────────────────────────────────────────
    function say(message) {
        notice = message;
        draw();
    }

    function onClick(event) {
        // 표의 함선 이름: 주소가 바뀐 뒤 화물칸 보기(한참 아래)로 화면과 초점을 옮긴다.
        const holdLink = event.target.closest('a[data-hold]');
        if (holdLink && root.contains(holdLink)) {
            later(`[data-market-hold="${CSS.escape(holdLink.getAttribute('data-hold'))}"] [data-k="hold-title"]`, true);
            if (window.location.hash === holdLink.getAttribute('href')) draw();
            return;
        }
        const target = event.target.closest('[data-act]');
        if (!target || !root.contains(target)) return;
        const act = target.getAttribute('data-act');
        if (act === 'retry-game') { loadGame(); loadPrices(); }
        else if (act === 'retry-prices') loadPrices();
        else if (act === 'retry-vehicles') { vehiclesError = null; update(); }
        else if (act === 'retry-history') { history = null; update(); }
        else if (act === 'retry-movers') {
            movers = null;
            update();
        } else if (act === 'refresh') loadPrices(true);
        else if (act === 'copy') H.copyShareUrl(SECTION, hashParams()).then((ok) => say(H.text(ok ? 'copied' : 'copyFailed')));
        else if (act === 'more') {
            // 새로 나온 첫 줄로 초점을 옮긴다 ("더 보기" 단추는 사라질 수 있다).
            const paged = root.querySelector('[data-market-paged]');
            const count = paged ? paged.querySelectorAll('tbody > tr').length : 0;
            listLimit += pageSize();
            later(`[data-market-paged] tbody > tr:nth-child(${count + 1}) a`, false, true, true);
            draw();
        } else if (act === 'history-all') {
            historyAll = true;
            later('[data-k="history-close"]', false, true, true);
            draw();
        }
        else if (act === 'fac') {
            const flag = target.getAttribute('data-id');
            view.fac = view.fac.includes(flag) ? view.fac.filter((item) => item !== flag) : [...view.fac, flag];
            saveHash();
            draw();
        } else if (act === 'history') {
            view.ht = toId(target.getAttribute('data-t'));
            view.hc = toId(target.getAttribute('data-c'));
            saveHash();
            update();
            // 기록은 누른 줄 바로 아래에 열린다. 화면은 닫기 단추가 안 보일 때만, 필요한 만큼만 움직인다.
            const close = root.querySelector('[data-k="history-close"]');
            if (close) close.focus();
        } else if (act === 'history-close') {
            const key = `h-${view.ht}-${view.hc}`;
            view.ht = null; view.hc = null;
            saveHash();
            update();
            const opener = root.querySelector(`[data-k="${key}"]`);
            if (opener) opener.focus({ preventScroll: true });
        } else if (act === 'here') {
            const terminal = terminalIndex.get(view.t);
            if (!terminal) return;
            if (terminal.system) E.state.set({ system: terminal.system });
            H.go('routes', { from: terminal.id });
        } else if (act === 'scan') startScan();
    }

    function startScan() {
        view.c = null; view.t = null; view.scan = true;
        movers = null;
        saveHash();
        update();
    }

    function onChange(event) {
        const target = event.target.closest('[data-change]');
        if (!target || !root.contains(target)) return;
        const kind = target.getAttribute('data-change');
        const value = target.value;
        if (kind === 'ship') E.state.set({ ship: value || null });
        else if (kind === 'system') {
            view.sys = '';
            saveHash();
            E.state.set({ system: value || null });
            update();
        } else if (kind === 'budget') {
            const amount = H.parseMoney(value, Math.floor);
            if (amount === undefined) {
                moneyNote = t('moneyInvalid');
                draw();
                return;
            }
            moneyNote = '';
            E.state.set({ budget: amount === null ? null : Math.min(amount, 1e12) });
            draw();
        } else if (kind === 'age') E.state.set({ maxAgeDays: Number(value) || H.DEFAULT_PRICE_AGE_DAYS });
        else {
            if (kind === 'sort') view.sort = SORTS.includes(value) ? value : 'margin';
            if (kind === 'box') view.box = E.STANDARD_BOXES.includes(Number(value)) ? Number(value) : null;
            if (kind === 'mode') view.mode = MODES.includes(value) ? value : 'both';
            if (kind === 'hold') view.ship = value || null;
            if (kind === 'movers-c') { view.c = toId(value); view.t = null; view.scan = false; }
            if (kind === 'movers-t') { view.t = toId(value); view.c = null; view.scan = false; }
            saveHash();
            update();
        }
    }

    function onInput(event) {
        const target = event.target.closest('[data-input="q"]');
        if (!target || !root.contains(target)) return;
        view.q = target.value.slice(0, 60);
        listLimit = pageSize();
        saveHash();
        draw();
    }

    // 접는 상자를 열고 닫은 것을 기억한다 (다시 그려도 그대로 있도록). toggle 은 위로 전달되지 않아 capture 로 듣는다.
    function onToggle(event) {
        const box = event.target;
        if (box && box.matches && box.matches('details[data-d]')) openDetails.set(box.getAttribute('data-d'), box.open);
    }

    window.VOLT_MARKET = {
        // 섹션이 처음 열릴 때 한 번. mount = #market-app, ctx = { section, lang, params }
        init(mount, ctx) {
            root = mount;
            readParams(ctx && ctx.params);
            H.bindBudgetButtons(root);
            root.addEventListener('click', onClick);
            root.addEventListener('change', onChange);
            root.addEventListener('input', onInput);
            root.addEventListener('toggle', onToggle, true);
            // 다른 화면에서 공용 값을 바꿀 때는 아무것도 하지 않는다 (update 가 가려진 화면을 건너뛴다).
            E.state.subscribe(() => { if (root) update(); });
            if (view.ht !== null && view.hc !== null) later('[data-market-history]', true, false);
            draw();
            loadGame();
            loadPrices();
            window.VOLT_STARMAP?.links?.load?.().then((ready) => { if (ready && root) update(); });
        },
        // 언어가 바뀔 때마다 (init 뒤에만).
        onLanguageChange() {
            notice = '';
            draw();
        },
        // 섹션이 다시 열리거나 주소(#market?...)가 바뀔 때.
        onRoute(params) {
            const before = `${view.ht}:${view.hc}`;
            readParams(params);
            notice = '';
            moneyNote = '';
            // 주소로 가격 기록을 열었으면 그 기록이 보이는 곳으로 화면을 옮긴다 (화물칸 보기처럼 이미 정해 둔 곳이 있으면 그대로).
            if (!pending && view.ht !== null && view.hc !== null && before !== `${view.ht}:${view.hc}`) later('[data-market-history]', true, false);
            update(true);
        },
    };
})();
