/**
 * VOLT 순회 무역 (#tours) — 여러 곳을 차례로 도는 무역 계획과, 여러 상품을 함께 싣는 계획.
 *
 * 이 파일과 css/tours.css, tests/smoke/tours.spec.js 만 이 화면의 것이다. 계약: docs/helper-tools.md, 계산: docs/trade-engine.md
 * 공개 형태: window.VOLT_TOURS = { init(mount, ctx), onLanguageChange(lang), onRoute(params) }
 *
 * 계산은 전부 js/trade-engine.js 의 공개 함수로 한다 (rankRoutes, evaluateRoute, planMixedLoad, whereToSell,
 * terminalSheet, commodityDetail, splitBoxes). 이 파일이 하는 일은
 *   - 순회 경로 찾기: 먼저 구간 표(출발지 → 도착지마다, 실을 수 있는 상품 하나하나를 엔진 rankRoutes 로 계산한 값)를 만들고,
 *     그 표로 순회를 잇는다. 조합 수가 EXACT_NODES 이하면 전부 견주고(빠지는 순회 없음), 더 많으면 "마지막에 들른 곳"마다
 *     좋은 후보를 PER_STOP 개씩 남기며 찾고 그 사실을 화면에 적는다. 좋은 후보 POOL 개는 엔진 evaluateRoute 로 다시 계산한다.
 *     한 구간에 무엇을 실을지는 여기서 고른다: 엔진은 SCU당 차익이 큰 상품부터 싣기 때문에, 재고가 몇 SCU뿐인 상품이
 *     화물칸을 채울 다른 상품을 가리는 일이 있다. 그래서 상품 조합을 견줘 이익(또는 시간당 이익)이 가장 큰 것을 고른 뒤
 *     그 상품들만 엔진에 넘긴다. 한 번에 SLICE_MS 만큼만 일하고 화면에 차례를 넘긴다.
 *   - 섞어 싣기: 판매처 한 곳은 엔진의 planMixedLoad 그대로. 두 곳·상품마다 다른 곳은 엔진에 없어서
 *     여기서 SCU 합계로 나눠 싣는다 (화면에 그 가정을 적는다).
 *
 * 주소 값 (#tours?...)  — 내 함선·돈·가격 기준일은 주소가 아니라 공용 저장소(VOLT_TRADE_ENGINE.state)에 둔다.
 *   stops  들르는 터미널 id 를 순서대로 (다른 화면이 보내는 값: 그 순회의 계획을 연다)
 *   tab    'mix' 이면 섞어 싣기 탭
 *   start, end  출발 · 도착 터미널 id      n  들르는 곳 수(2~8)       rt  1 = 출발지로 돌아오기
 *   goal   'profit' | 'short' (기본: 시간당 이익)   leg  한 구간 최대 시간(분)
 *   same   1 = 한 항성계 안에서만            diff  1 = 구간마다 다른 상품   g  한 곳에서 싣는 상품 가짓수(1~4)
 *   ill    1 = 불법 화물·합법 여부 모르는 화물도 넣기 (기본: 합법 화물만)
 *   mix    'board' 이면 "이미 실은 화물"      at  지금 있는 터미널 id
 *   fx     꼭 실을 상품 "상품id:SCU,..."       fill  0 = 남는 칸을 채우지 않음
 *   dest   'two' | 'each' (기본: 한 곳)        to  팔 곳 터미널 id         by  'perHour' (기본: 이익)
 *   cg     실려 있는 화물 "상품id:SCU:산값,..."
 */
(function () {
    'use strict';

    const H = window.VOLT_HELPER;
    const E = window.VOLT_TRADE_ENGINE;
    const SECTION = 'tours';
    const esc = H.esc;

    const SLICE_MS = 10;      // 한 번에 이만큼만 계산하고 화면에 차례를 넘긴다
    const EXACT_NODES = 12000000; // 조합이 이보다 적으면 전부 견준다
    const EXACT_MS = 8000;    // 전부 견주다가 이 시간을 넘기면 추려서 찾는 방식으로 바꾼다
    const PER_STOP = 24;      // 전부 견주지 못할 때 "마지막에 들른 곳"마다 남기는 후보 수 (기준 둘에 각각)
    const POOL = 48;          // 엔진으로 다시 계산해 보는 후보 수
    const KEEP = 12;          // 목록에 보여 주는 순회 수
    const FILL_KINDS = 8;     // 남는 칸을 채울 때 쓰는 상품 가짓수 (엔진 상한과 같다)
    const PLAN_KEEP = 8;      // 섞어 싣기 결과 수
    const TOUR_KEYS = ['start', 'end', 'n', 'rt', 'goal', 'leg', 'same', 'diff', 'g', 'ill'];

    const TEXT = {
        ko: {
            loading: '자료를 불러오는 중입니다…',
            retry: '다시 시도',
            tabTour: '순회 경로 찾기',
            tabMix: '섞어 싣기',
            tabsLabel: '도구 고르기',
            mine: '내 조건',
            mineHint: '다른 무역 화면과 함께 쓰는 값입니다. 이 브라우저에만 저장됩니다.',
            ship: '내 함선',
            shipNone: '함선을 고르세요',
            shipCargo: '{name} ({scu} SCU)',
            shipCargoUnknown: '{name} (화물칸: 게임 자료에 없음)',
            shipHold: '화물칸 {scu} · 가장 큰 상자 {box} SCU',
            budget: '쓸 수 있는 돈 (aUEC)',
            budgetHint: '비워 두면 돈으로 수량을 줄이지 않습니다.',
            age: '가격 보고를 며칠 전 것까지 쓸까요',
            ageHint: '기본은 3일입니다. 더 오래된 보고는 계산에 넣지 않습니다.',
            timeTitle: '시간 가정 고치기',
            timeHint: '아래 값은 게임 파일에 없어서 우리가 정한 기본값입니다. 직접 재 본 값으로 바꾸면 추정이 그만큼 맞아집니다. 단위는 초입니다.',
            timeReset: '기본값으로 되돌리기',
            'time.loading': '싣고 내리는 방법',
            loadingAuto: '자동 적재가 되는 곳에서는 자동으로',
            loadingManual: '항상 손으로',
            'time.takeoffSeconds': '출발 준비 (탑승부터 퀀텀 준비까지)',
            'time.landingSeconds': '도착 (퀀텀이 끝난 뒤 착륙까지)',
            'time.atmosphereSeconds': '지표면에서 뜨고 내릴 때 더하는 시간',
            'time.terminalSeconds': '터미널에서 한 번 사거나 파는 시간',
            'time.manualBaseSeconds': '손으로 실을 때 준비 시간',
            'time.manualBoxSeconds': '손으로 옮길 때 상자 하나당',
            'time.sameBodySeconds': '같은 행성·위성 안의 이동',
            'time.jumpSeconds': '점프 포인트 통과',
            start: '출발지',
            startAny: '어디서든 (가장 좋은 곳을 찾기)',
            end: '도착지',
            endAny: '정하지 않음',
            endOff: '출발지로 돌아올 때는 도착지를 정하지 않습니다.',
            count: '들르는 곳 수',
            countN: '{n}곳',
            mode: '끝나는 곳',
            modeFly: '계속 나아가기',
            modeRound: '출발지로 돌아오기',
            goal: '무엇이 좋은 순서로 볼까요',
            goalHour: '시간당 이익이 큰 순',
            goalProfit: '한 바퀴 이익이 큰 순',
            goalShort: '빨리 끝나는 순',
            leg: '한 구간 최대 시간 (분)',
            legHint: '비워 두면 제한하지 않습니다.',
            same: '한 항성계 안에서만',
            diff: '구간마다 다른 상품 싣기',
            goods: '한 곳에서 싣는 상품 가짓수',
            goodsN: '{n}가지',
            runTour: '순회 경로 찾기',
            legalOnly: '불법 화물은 빼기',
            legalOnlyHint: '합법인지 알 수 없는 상품도 함께 뺍니다.',
            legalOff: '상품 자료를 받지 못해 합법 여부를 가릴 수 없습니다. 모든 상품을 넣어 계산합니다.',
            searchLegs: '구간마다 실을 것을 계산하는 중입니다…',
            searchAll: '모든 조합을 견주는 중입니다… {done} / {total}',
            searching: '찾는 중입니다… {done} / {total} 단계',
            finishing: '찾은 순회를 정리하는 중입니다…',
            cancel: '그만 찾기',
            cancelled: '찾기를 멈췄습니다.',
            tourIdle: '조건을 정하고 "순회 경로 찾기"를 누르세요. 가격 보고와 내 함선 화물칸으로 이익이 나는 구간을 이어 붙입니다.',
            needShip: '먼저 "내 조건"에서 함선을 고르세요.',
            'problem.no-ship': '먼저 "내 조건"에서 함선을 고르세요.',
            'problem.unknown-ship': '이 함선은 화물 자료에 없습니다. 다른 함선을 고르세요.',
            'problem.cargo-unknown': '이 함선의 화물칸 크기는 게임 자료에 없어서 계산할 수 없습니다.',
            'problem.no-cargo': '이 함선은 기본 장착에 화물칸이 없습니다.',
            'problem.unknown-terminal': '고른 터미널을 가격 자료에서 찾을 수 없습니다.',
            noPrices: '쓸 수 있는 가격 보고가 없습니다. 가격 기준일을 늘리거나 잠시 뒤 다시 시도해 주세요.',
            noTours: '이 조건으로 이익이 나는 순회를 찾지 못했습니다. 들르는 곳 수를 줄이거나 조건을 풀어 보세요.',
            results: '찾은 순회 {n}개',
            shortened: '{want}곳을 도는 순회는 없어서 {got}곳짜리를 보여 줍니다.',
            partial: '조합이 너무 많아 전부 견주지는 못했습니다. 마지막에 들른 곳마다 좋은 후보를 남기며 찾았으므로 더 좋은 순회가 빠졌을 수 있습니다. 출발지를 정하거나 들르는 곳 수를 줄이면 전부 견줍니다.',
            searchFailed: '계산하다가 문제가 생겼습니다. 조건을 바꾸거나 잠시 뒤 다시 해 주세요.',
            noMoney: '쓸 수 있는 돈이 0이라 아무것도 살 수 없습니다. "내 조건"에서 돈을 늘리거나 칸을 비워 두세요.',
            hasIllegal: '불법 화물 포함',
            hasUnknownLegal: '합법 여부 모르는 화물 포함',
            namesMissing: '상품 이름 자료를 받지 못했습니다. 상품이 번호로 보이고 합법 여부를 알 수 없습니다.',
            goalShortNote: '이익이 나는 구간만 잇되, 전체 시간이 짧은 순서입니다.',
            profit: '이익',
            time: '걸리는 시간',
            perHour: '시간당 이익',
            perHourIncome: '시간당 수입',
            invest: '한 번에 가장 많이 드는 돈',
            investAll: '드는 돈',
            revenue: '받는 돈',
            oldest: '가장 오래된 가격 보고',
            est: '추정',
            unknownTime: '시간을 추정할 수 없음',
            openPlan: '계획 보기',
            back: '목록으로',
            planTitle: '순회 계획',
            planLead: '들르는 순서대로 무엇을 사고 어디서 파는지입니다.',
            copy: '이 화면 주소 복사',
            legNo: '{n}구간',
            legReturn: '돌아오는 길',
            buyAt: '{place}에서 살 것',
            sellAt: '{place}에서 팔 것',
            emptyLeg: '이익이 나는 화물이 없어 빈 배로 갑니다.',
            emptyLegMoney: '가진 돈으로는 이익이 나는 화물을 살 수 없어 빈 배로 갑니다.',
            boxes: '상자 {list}',
            each: 'SCU당 {price}',
            total: '합계 {price}',
            priceAge: '가격 보고 {age}',
            stockUnknown: '재고 보고 없음',
            shopFull: '상점이 가득 찼다고 보고됨',
            takesUnknown: '받아 주는 양: 자료에 없음',
            illegal: '불법 화물',
            legalUnknown: '합법 여부 모름',
            'cap.ship': '화물칸을 채운 양',
            'cap.stock': '보고된 재고만큼',
            'cap.budget': '가진 돈으로 살 수 있는 만큼',
            'cap.boxes': '상자 크기에 맞춘 양',
            'cap.requested': '정해 둔 양',
            'cap.destination': '도착지가 받아 주는 만큼',
            legProfit: '이 구간 이익 {profit}',
            legTime: '약 {time} ({est})',
            partFlight: '비행 {v}',
            partPads: '뜨고 내리기 {v}',
            partTerminal: '터미널 {v}',
            partHandling: '싣고 내리기 {v}',
            flightJump: '다른 항성계로 점프',
            flightSameBody: '같은 행성·위성 안',
            flightSameBodyOrbit: '같은 행성·위성의 지표면과 궤도 사이 — 거리로 계산한 값이 아니라 우리가 정한 기본값',
            flightSamePlace: '같은 곳',
            toRoutes: '무역 경로에서 이 구간 보기',
            toStation: '거래소 정보',
            assume: '이 계산이 가정한 것',
            assumeTimes: '시간 값 가운데 우리가 정한 기본값은 "내 조건 → 시간 가정 고치기"에서 바꿀 수 있습니다.',
            mixMode: '화물칸 상태',
            mixEmpty: '빈 화물칸에 싣기',
            mixBoard: '이미 실은 화물 팔기',
            at: '지금 있는 곳',
            atPick: '터미널을 고르세요',
            atOptional: '정하지 않음 (시간을 계산하지 않음)',
            fixed: '꼭 실을 상품',
            fixedHint: '이 상품들은 정한 양만큼 먼저 싣습니다. 손해가 나도 싣습니다.',
            fixedNeedsAt: '지금 있는 곳을 고르면 그곳에서 파는 상품이 나옵니다.',
            fixedNoGoods: '이곳에서 파는 상품 가운데 쓸 수 있는 가격 보고가 없습니다. 가격 기준일을 늘리면 나올 수 있습니다.',
            good: '상품',
            goodPick: '상품 고르기',
            amount: '양 (SCU)',
            paid: '산 값 (SCU당, 선택)',
            add: '상품 추가',
            remove: '빼기',
            removeN: '{n}번째 상품 빼기',
            fill: '남는 칸은 이익이 좋은 상품으로 채우기 (최대 {n}가지)',
            dest: '몇 곳에 나눠 팔까요',
            destOne: '한 곳에서 다 팔기',
            destTwo: '두 곳에 나눠 팔기',
            destEach: '상품마다 가장 비싼 곳에서 팔기',
            to: '팔 곳',
            toAny: '가장 좋은 곳을 찾기',
            toEachOff: '상품마다 가장 비싼 곳을 고르므로 팔 곳을 정하지 않습니다.',
            by: '무엇이 좋은 순서로 볼까요',
            byProfit: '이익이 큰 순',
            byRevenue: '받는 돈이 큰 순',
            byHour: '시간당 이익이 큰 순',
            byHourIncome: '시간당 수입이 큰 순',
            runMix: '계산하기',
            cargo: '실려 있는 화물',
            cargoHint: '산 값을 적으면 이익도 계산합니다. 적지 않으면 받는 돈만 보여 줍니다.',
            mixIdle: '지금 있는 곳과 실을 상품을 정하고 "계산하기"를 누르세요.',
            boardIdle: '실려 있는 화물을 적고 "계산하기"를 누르세요.',
            needAt: '지금 있는 곳을 고르세요.',
            needCargo: '실려 있는 화물을 한 가지 이상 적어 주세요.',
            needLoad: '꼭 실을 상품을 정하거나 "남는 칸 채우기"를 켜 주세요.',
            noPlans: '이 조건으로는 팔 곳을 찾지 못했습니다.',
            comparing: '판매처 조합을 견주는 중입니다… {done} / {total}',
            plans: '싣는 계획 {n}개',
            planNo: '{n}번',
            loadHere: '{place}에서 실을 것',
            mustTag: '꼭 실을 상품',
            fillTag: '남는 칸 채우기',
            wanted: '정한 양 {scu} 가운데',
            unsold: '이 판매처에서는 처리하지 못하는 상품',
            'why.not-sold-here': '지금 있는 곳에서 팔지 않거나 쓸 수 있는 가격 보고가 없음',
            'why.not-bought-there': '이 판매처가 사 주지 않음',
            noteScuOnly: '판매처가 둘 이상인 계획은 화물칸 모양을 따지지 않고 남은 SCU만으로 나눠 실었습니다. 상자 크기는 상품마다 따로 맞췄으므로 실제로는 조금 덜 실릴 수 있습니다.',
            noteNoHandling: '판매처가 둘 이상인 계획의 시간은 비행, 뜨고 내리기, 터미널 이용만 넣은 추정입니다. 싣고 내리는 시간은 넣지 않았습니다.',
            noteTopByProfit: '시간당 순서는 이익이 큰 조합 {n}개 가운데서 매겼습니다.',
            noteBoardTime: '가는 시간은 출발, 비행, 착륙, 터미널 한 번만 넣은 추정입니다. 내리는 시간은 넣지 않았습니다.',
            noteAlong: '"가는 김에 실을 것"은 화물칸 크기에서 실려 있는 양을 뺀 SCU만으로 계산했습니다. 칸 모양은 따지지 않았습니다.',
            sellOne: '한 곳에서 다 팔 때',
            sellEach: '상품마다 가장 비싼 곳',
            sellEachSum: '상품마다 가장 비싼 곳에 팔면 받는 돈 합계 {price}',
            placeNo: '{n}위',
            cantSell: '여기서는 못 파는 상품: {list}',
            along: '가는 김에 {place}에서 더 실을 것',
            alongNone: '이 판매처로 가져가서 이익이 나는 상품이 지금 있는 곳에 없습니다.',
            alongFree: '빈 칸 {scu}',
            alongNoRoom: '화물칸에 남는 자리가 없어 더 실을 수 없습니다.',
            alongNeedShip: '"내 조건"에서 함선을 고르면, 가는 김에 더 실을 상품도 알려 드립니다.',
            alongNeedAt: '지금 있는 곳을 고르면, 가는 김에 더 실을 상품도 알려 드립니다.',
            alongHoldUnknown: '이 함선의 화물칸 크기는 게임 자료에 없어서, 가는 김에 더 실을 양을 계산할 수 없습니다.',
            alongNoHold: '이 함선은 기본 장착에 화물칸이 없어, 가는 김에 더 실을 것을 계산하지 않습니다.',
            profitNeedsPaid: '산 값을 적으면 계산',
            noSellPlace: '쓸 수 있는 가격 보고 가운데 이 상품을 사 주는 곳이 없습니다.',
            system: '항성계 {name}',
        },
        en: {
            loading: 'Loading data…',
            retry: 'Try again',
            tabTour: 'Find a tour',
            tabMix: 'Load several goods',
            tabsLabel: 'Choose a tool',
            mine: 'My settings',
            mineHint: 'Shared with the other trade screens. Stored in this browser only.',
            ship: 'My ship',
            shipNone: 'Choose a ship',
            shipCargo: '{name} ({scu} SCU)',
            shipCargoUnknown: '{name} (hold: not in the game files)',
            shipHold: 'Hold {scu} · largest box {box} SCU',
            budget: 'Money I can spend (aUEC)',
            budgetHint: 'Leave empty to not limit quantities by money.',
            age: 'Use price reports up to how many days old',
            ageHint: 'The default is 3 days. Older reports are left out of the calculation.',
            timeTitle: 'Change the time assumptions',
            timeHint: 'These values are not in the game files; they are our own default guesses. Replace them with times you measured and the estimates get that much closer. All in seconds.',
            timeReset: 'Back to defaults',
            'time.loading': 'How cargo is loaded',
            loadingAuto: 'Automatic where the terminal offers it',
            loadingManual: 'Always by hand',
            'time.takeoffSeconds': 'Departure (boarding to quantum-ready)',
            'time.landingSeconds': 'Arrival (end of quantum to landed)',
            'time.atmosphereSeconds': 'Extra for taking off or landing on a surface',
            'time.terminalSeconds': 'One buy or one sell at a terminal',
            'time.manualBaseSeconds': 'Hand loading: fixed part',
            'time.manualBoxSeconds': 'Hand loading: per box',
            'time.sameBodySeconds': 'Hop on the same planet or moon',
            'time.jumpSeconds': 'Passing a jump point',
            start: 'Start',
            startAny: 'Anywhere (find the best start)',
            end: 'End',
            endAny: 'Not set',
            endOff: 'A round trip ends where it starts, so no end is set.',
            count: 'Places to visit',
            countN: '{n} places',
            mode: 'Where it ends',
            modeFly: 'End somewhere else',
            modeRound: 'Come back to the start',
            goal: 'Put first',
            goalHour: 'What earns most per hour',
            goalProfit: 'What earns most in total',
            goalShort: 'What finishes soonest',
            leg: 'Longest single leg (minutes)',
            legHint: 'Leave empty for no limit.',
            same: 'No jumps to another star system',
            diff: 'Never carry the same good twice',
            goods: 'Goods loaded at each stop',
            goodsN: '{n}',
            runTour: 'Find tours',
            legalOnly: 'Leave out illegal cargo',
            legalOnlyHint: 'Goods whose legality is unknown are left out too.',
            legalOff: 'The goods list could not be loaded, so legality cannot be checked. All goods are used.',
            searchLegs: 'Working out what to carry on each leg…',
            searchAll: 'Comparing every combination… {done} / {total}',
            searching: 'Searching… step {done} of {total}',
            finishing: 'Putting the tours together…',
            cancel: 'Stop searching',
            cancelled: 'Search stopped.',
            tourIdle: 'Set your conditions and press "Find tours". Profitable legs are chained using the price reports and your ship\'s hold.',
            needShip: 'Choose a ship under "My settings" first.',
            'problem.no-ship': 'Choose a ship under "My settings" first.',
            'problem.unknown-ship': 'This ship is not in the cargo data. Choose another ship.',
            'problem.cargo-unknown': 'The hold size of this ship is not in the game files, so nothing can be calculated.',
            'problem.no-cargo': 'This ship has no cargo hold in its default loadout.',
            'problem.unknown-terminal': 'The chosen terminal is not in the price data.',
            noPrices: 'There are no usable price reports. Allow older reports or try again shortly.',
            noTours: 'No profitable tour was found for these conditions. Try fewer places or looser conditions.',
            results: '{n} tours found',
            shortened: 'No tour visits {want} places, so tours with {got} places are shown.',
            partial: 'There were too many combinations to compare them all. Good candidates were kept for every last stop, so a better tour may be missing. Set a start or visit fewer places to compare everything.',
            searchFailed: 'Something went wrong during the calculation. Change the conditions or try again shortly.',
            noMoney: 'Your money is set to 0, so nothing can be bought. Raise it under "My settings" or leave the field empty.',
            hasIllegal: 'Includes illegal cargo',
            hasUnknownLegal: 'Includes cargo of unknown legality',
            namesMissing: 'The goods list could not be loaded. Goods show as numbers and their legality is unknown.',
            goalShortNote: 'Only profitable legs are chained; the shortest total time comes first.',
            profit: 'Profit',
            time: 'Time',
            perHour: 'Hourly profit',
            perHourIncome: 'Hourly income',
            invest: 'Most money tied up at once',
            investAll: 'Money needed',
            revenue: 'Money received',
            oldest: 'Oldest price report',
            est: 'estimate',
            unknownTime: 'time cannot be estimated',
            openPlan: 'Show plan',
            back: 'Back to the list',
            planTitle: 'Tour plan',
            planLead: 'What to buy and where to sell it, in the order you visit.',
            copy: 'Copy link to this view',
            legNo: 'Leg {n}',
            legReturn: 'Way back',
            buyAt: '{place}: what to buy',
            sellAt: '{place}: what to sell',
            emptyLeg: 'No cargo pays here, so this leg is flown empty.',
            emptyLegMoney: 'Your money does not buy any cargo that pays here, so this leg is flown empty.',
            boxes: 'Boxes {list}',
            each: '{price} per SCU',
            total: '{price} in total',
            priceAge: 'price reported {age}',
            stockUnknown: 'stock not reported',
            shopFull: 'shop reported full',
            takesUnknown: 'amount accepted: not in the data',
            illegal: 'Illegal cargo',
            legalUnknown: 'Legality unknown',
            'cap.ship': 'fills the hold',
            'cap.stock': 'all reported stock',
            'cap.budget': 'what your money buys',
            'cap.boxes': 'rounded to box sizes',
            'cap.requested': 'the amount you set',
            'cap.destination': 'what the destination takes',
            legProfit: 'Leg profit {profit}',
            legTime: 'about {time} ({est})',
            partFlight: 'flight {v}',
            partPads: 'take-off and landing {v}',
            partTerminal: 'terminals {v}',
            partHandling: 'cargo handling {v}',
            flightJump: 'jump to another system',
            flightSameBody: 'same planet or moon',
            flightSameBodyOrbit: 'between the surface and orbit of the same planet or moon — our default guess, not worked out from distance',
            flightSamePlace: 'same place',
            toRoutes: 'Open this leg in Trade Routes',
            toStation: 'Trading post info',
            assume: 'What this calculation assumes',
            assumeTimes: 'Time values that are our own default guesses can be changed under "My settings → Change the time assumptions".',
            mixMode: 'Hold',
            mixEmpty: 'Nothing loaded yet',
            mixBoard: 'Sell what I am carrying',
            at: 'Where I am',
            atPick: 'Choose a terminal',
            atOptional: 'Not set (no time is calculated)',
            fixed: 'Goods I take for sure',
            fixedHint: 'These are loaded first, in the amount you set, even at a loss.',
            fixedNeedsAt: 'Choose where you are to see the goods sold there.',
            fixedNoGoods: 'No usable price report for anything sold here. Allowing older reports may help.',
            good: 'Good',
            goodPick: 'Choose a good',
            amount: 'How much (SCU)',
            paid: 'Price paid (per SCU, optional)',
            add: 'Add a good',
            remove: 'Remove',
            removeN: 'Remove good {n}',
            fill: 'Fill the rest with the goods that pay best (up to {n})',
            dest: 'How many places to sell at',
            destOne: 'Sell everything at one place',
            destTwo: 'Split between two places',
            destEach: 'Each good where it pays most',
            to: 'Where to sell',
            toAny: 'Find the best place',
            toEachOff: 'Each good goes where it pays most, so no place is set.',
            by: 'Best by',
            byProfit: 'Profit',
            byRevenue: 'Money received',
            byHour: 'Hourly profit',
            byHourIncome: 'Hourly income',
            runMix: 'Calculate',
            cargo: 'What I am carrying',
            cargoHint: 'Enter the price you paid to see profit too. Without it only the money received is shown.',
            mixIdle: 'Choose where you are and what to load, then press "Calculate".',
            boardIdle: 'Enter what you are carrying, then press "Calculate".',
            needAt: 'Choose where you are.',
            needCargo: 'Enter at least one good you are carrying.',
            needLoad: 'Set a good to take or switch on "Fill the rest".',
            noPlans: 'No place to sell was found for these conditions.',
            comparing: 'Comparing pairs of places… {done} / {total}',
            plans: '{n} loading plans',
            planNo: 'No. {n}',
            loadHere: 'Load at {place}',
            mustTag: 'Taken for sure',
            fillTag: 'Fills the rest',
            wanted: 'of the {scu} you set',
            unsold: 'Goods these places cannot handle',
            'why.not-sold-here': 'not sold where you are, or no usable price report',
            'why.not-bought-there': 'not bought at these places',
            noteScuOnly: 'Plans with two or more places split the hold by SCU only, without the shape of the hold. Box sizes are fitted per good, so slightly less may fit in game.',
            noteNoHandling: 'Time for plans with two or more places is an estimate of flight, take-off and landing, and terminal visits only. Loading and unloading are not included.',
            noteTopByProfit: 'The hourly order is taken among the {n} most profitable pairs.',
            noteBoardTime: 'Travel time is an estimate of departure, flight, landing and one terminal visit. Unloading is not included.',
            noteAlong: '"Also load" uses the hold size minus what you are carrying, in SCU only, without the shape of the hold.',
            sellOne: 'Selling everything at one place',
            sellEach: 'Best place for each good',
            sellEachSum: 'Selling each good where it pays most brings {price} in total',
            placeNo: 'No. {n}',
            cantSell: 'Cannot be sold here: {list}',
            along: 'Also load at {place} on the way',
            alongNone: 'Nothing sold where you are pays at this place.',
            alongFree: '{scu} free',
            alongNoRoom: 'The hold has no room left for more.',
            alongNeedShip: 'Choose a ship under "My settings" to also see what to load on the way.',
            alongNeedAt: 'Choose where you are to also see what to load on the way.',
            alongHoldUnknown: 'The hold size of this ship is not in the game files, so what else fits cannot be calculated.',
            alongNoHold: 'This ship has no cargo hold in its default loadout, so nothing more is suggested.',
            profitNeedsPaid: 'enter the price paid',
            noSellPlace: 'No usable price report shows a place that buys this good.',
            system: '{name} system',
        },
    };
    const t = H.translator(TEXT);

    // ── 상태 ────────────────────────────────────────────────────────────────
    const view = { tab: 'tour', tour: null, stops: null, mix: null };
    const data = { status: 'loading', error: null, priceError: null, namesError: null, model: null, uexMeta: null, shipNames: new Map(), terminals: [], twins: new Set() };
    const tour = { job: null, result: null, ran: false, cancelled: false };
    const mixed = { job: null, result: null, ran: false };
    let root = null;
    let timeOpen = false;
    let notice = '';
    let focusNext = null;
    let autoRun = { tour: false, mix: false };
    let muted = false;       // 이 화면이 공용 값을 적는 동안에는 구독 알림을 건너뛴다
    let refreshTimer = 0;

    const tourDefaults = () => ({ start: null, end: null, n: 3, rt: false, goal: 'perHour', leg: null, same: false, diff: false, goods: 1, legal: true });
    const mixDefaults = () => ({ mode: 'empty', at: null, fixed: [], fill: true, dest: 'one', to: null, by: 'profit', cargo: [] });

    const toId = (value) => {
        const id = Number(value);
        return value !== null && value !== undefined && value !== '' && Number.isInteger(id) && id > 0 ? id : null;
    };
    const clamp = (value, low, high, fallback) => {
        const number = Number(value);
        return value !== null && value !== '' && Number.isFinite(number) ? Math.min(high, Math.max(low, Math.round(number))) : fallback;
    };
    const posNum = (value) => {
        const number = Number(value);
        return value !== null && value !== undefined && value !== '' && Number.isFinite(number) && number > 0 ? number : null;
    };

    // "12:100,34:20:8.5" → [{ c, scu, paid }]
    function parseItems(value) {
        return String(value || '').split(',').map((part) => {
            const [c, scu, paid] = part.split(':');
            return { c: toId(c), scu: posNum(scu) ? Math.floor(posNum(scu)) : null, paid: posNum(paid) };
        }).filter((item) => item.c || item.scu).slice(0, 8);
    }
    const encodeItems = (items, withPaid) => items.filter((item) => item.c && item.scu)
        .map((item) => [item.c, item.scu, ...(withPaid && item.paid ? [item.paid] : [])].join(':')).join(',');

    function applyParams(params) {
        const p = params || {};
        const o = tourDefaults();
        o.start = toId(p.start);
        o.end = toId(p.end);
        o.n = clamp(p.n, 2, 8, 3);
        o.rt = p.rt === '1';
        o.goal = ['profit', 'short'].includes(p.goal) ? p.goal : 'perHour';
        o.leg = posNum(p.leg) ? Math.round(posNum(p.leg)) : null;
        o.same = p.same === '1';
        o.diff = p.diff === '1';
        o.goods = clamp(p.g, 1, 4, 1);
        o.legal = p.ill !== '1';
        view.tour = o;
        const stops = String(p.stops || '').split(',').map(toId).filter(Boolean).slice(0, 8);
        view.stops = stops.length >= 2 && new Set(stops).size === stops.length ? stops : null;
        const m = mixDefaults();
        m.mode = p.mix === 'board' ? 'board' : 'empty';
        m.at = toId(p.at);
        m.fixed = parseItems(p.fx).map(({ c, scu }) => ({ c, scu }));
        m.fill = p.fill !== '0';
        m.dest = ['two', 'each'].includes(p.dest) ? p.dest : 'one';
        m.to = toId(p.to);
        m.by = p.by === 'perHour' ? 'perHour' : 'profit';
        m.cargo = parseItems(p.cg);
        view.mix = m;
        view.tab = p.tab === 'mix' && !view.stops ? 'mix' : 'tour';
        autoRun = {
            tour: view.tab === 'tour' && !view.stops && TOUR_KEYS.some((key) => p[key] !== undefined),
            mix: view.tab === 'mix' && (m.mode === 'board' ? m.cargo.some((item) => item.c && item.scu) : Boolean(m.at)),
        };
    }

    function toParams() {
        if (view.tab === 'mix') {
            const m = view.mix;
            const board = m.mode === 'board';
            return {
                tab: 'mix', mix: board ? 'board' : '', at: m.at, by: m.by !== 'profit' ? m.by : '',
                fx: board ? '' : encodeItems(m.fixed, false), fill: board || m.fill ? '' : 0,
                dest: !board && m.dest !== 'one' ? m.dest : '', to: board || m.dest === 'each' ? '' : m.to,
                cg: board ? encodeItems(m.cargo, true) : '',
            };
        }
        const o = view.tour;
        return {
            // 찾기를 한 번 돌렸으면 기본값이어도 n 을 적는다: 새로 고치거나 주소를 받은 사람도 같은 목록을 보게.
            stops: view.stops ? view.stops.join(',') : '', start: o.start, end: o.rt ? '' : o.end, n: o.n !== 3 || (tour.ran && !view.stops) ? o.n : '', rt: o.rt ? 1 : '',
            goal: o.goal !== 'perHour' ? o.goal : '', leg: o.leg, same: o.same ? 1 : '', diff: o.diff ? 1 : '', g: o.goods !== 1 ? o.goods : '', ill: o.legal ? '' : 1,
        };
    }

    const syncHash = () => H.writeHash(SECTION, toParams());
    const settingsNow = () => E.settings({ ...E.state.get(), now: Date.now() });

    // ── 이름 ────────────────────────────────────────────────────────────────
    const terminalOf = (id) => (data.model ? data.model.terminals.get(Number(id)) || null : null);
    // 같은 곳에 터미널이 둘 있으면(예: 에어리어 18 의 TDD 와 IO 타워) 이름이 같아지므로, 그때는 터미널 이름을 덧붙인다.
    const placeName = (id) => {
        const terminal = terminalOf(id);
        if (!terminal) return `#${id}`;
        const base = H.name(terminal.name) || terminal.uexName || `#${id}`;
        return data.twins.has(terminal.id) && terminal.uexName && terminal.uexName !== base ? `${base} (${terminal.uexName})` : base;
    };
    const goodName = (id) => {
        const commodity = data.model ? data.model.commodities.get(Number(id)) : null;
        return (commodity && H.name(commodity.name)) || `#${id}`;
    };
    const shipName = (id) => data.shipNames.get(id) || String(id || '').split('-').map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part)).join(' ');
    const money = (value, options) => H.price(value, options);
    const unitPrice = (value) => H.price(value, { digits: 2 });
    const signed = (value) => (H.isKnown(value) && Number(value) > 0 ? `+${money(value)}` : money(value));
    const boxText = (boxes) => (boxes || []).map((box) => `${H.num(box.scu, { digits: 3 })} SCU × ${H.num(box.count)}`).join(', ');

    // ── 자료 불러오기 ───────────────────────────────────────────────────────
    async function load(refresh, refocus) {
        data.status = 'loading';
        data.error = null;
        data.priceError = null;
        data.namesError = null;
        draw();
        // 다시 시도 단추를 눌렀으면 단추가 사라진 뒤에도 초점이 화면 안에 남게 한다.
        const done = () => {
            if (refocus) focusNext = data.status === 'error' || data.priceError || data.namesError ? '[data-k="retry"]' : '[data-k="tab-tour"]';
            draw();
        };
        let cargo;
        let world;
        try {
            [cargo, world] = await Promise.all([H.loadJson('/data/trade/cargo.json'), H.loadJson('/data/trade/world.json')]);
        } catch (error) {
            data.status = 'error';
            data.error = error;
            done();
            return;
        }
        let market = [];
        let terminals = [];
        let commodities = [];
        try {
            // 상품 목록(이름·합법 여부)은 없어도 계산은 된다: 이것만 실패하면 알리고 계속한다.
            const names = H.uex('commodities').catch((error) => { data.namesError = error; return { data: [] }; });
            const [marketRes, terminalRes, commodityRes] = await Promise.all([H.uex('market', { refresh: refresh === true }), H.uex('terminals'), names]);
            market = marketRes.data;
            terminals = terminalRes.data;
            commodities = commodityRes.data;
            data.uexMeta = { fetchedAt: marketRes.meta.fetchedAt, stale: marketRes.stale };
        } catch (error) {
            data.priceError = error; // 가격만 실패: 게임 자료(함선 화물칸)와 내 조건은 그대로 보여 준다.
            data.namesError = null;
            data.uexMeta = null;
        }
        data.model = E.buildModel({ market, terminals, commodities, cargo, world });
        data.terminals = E.listTerminals(data.model).sort((a, b) => String(a.system).localeCompare(String(b.system)) || H.name(a.name).localeCompare(H.name(b.name)));
        const seen = new Map();
        data.terminals.forEach((terminal) => {
            const key = `${terminal.system}|${(terminal.name && terminal.name.en) || terminal.uexName}`;
            seen.set(key, [...(seen.get(key) || []), terminal.id]);
        });
        data.twins = new Set([...seen.values()].filter((ids) => ids.length > 1).flat());
        data.status = 'ready';
        done();
        loadShipNames();
        if (!data.priceError) startAuto();
    }

    // 함선 표시 이름(영문). 함선 DB 가 이미 받았거나 받는 중이면 그 자료를 쓴다 (같은 파일을 두 번 받지 않게). 못 받으면 함선 id 로 보여 준다.
    function loadShipNames() {
        if (data.shipNames.size) return;
        const take = (file) => {
            const records = Array.isArray(file?.records) ? file.records : [];
            records.forEach((record) => { if (record && record.id && record.name) data.shipNames.set(record.id, String(record.name)); });
            if (data.shipNames.size && !tour.job && !mixed.job) draw();
        };
        const db = window.VOLT_SHIPDB_CANONICAL;
        const viaDb = db && (db.state === 'loaded' || db.state === 'loading') ? db.load().then((store) => store && store.presentation) : Promise.reject(new Error('no ship db'));
        viaDb.then((file) => file || H.loadJson('/data/canonical/presentation-ships.json'), () => H.loadJson('/data/canonical/presentation-ships.json'))
            .then(take).catch(() => { /* 이름 없이도 화면은 쓸 수 있다 */ });
    }

    function startAuto() {
        const run = autoRun;
        autoRun = { tour: false, mix: false };
        if (run.tour) runTour();
        else if (run.mix) runMix();
    }

    // ── 순회 찾기 ───────────────────────────────────────────────────────────
    const STOPPED = { stopped: true };

    function pacer(job) {
        let sliceStart = performance.now();
        return async () => {
            if (performance.now() - sliceStart < SLICE_MS) return;
            await new Promise((resolve) => { window.setTimeout(resolve, 0); });
            sliceStart = performance.now();
            if (job.cancelled) throw STOPPED;
        };
    }

    function shipProblem(s) {
        // 터미널 id -1 은 없으므로, 함선에 문제가 없으면 'unknown-terminal' 이 돌아온다.
        const probe = E.evaluateRoute(data.model, s, { from: -1, to: -1 });
        return probe.problem === 'unknown-terminal' ? null : probe.problem;
    }

    // 합법 화물만: 상품 자료를 못 받았으면 합법 여부를 알 수 없으므로 거르지 않는다 (화면에 알린다).
    const legalOn = (options) => options.legal !== false && !data.namesError;

    // ── 구간 표 ─────────────────────────────────────────────────────────────
    // 출발지마다: 갈 수 있는 곳(pair)과, 그 구간에 실을 수 있는 상품 하나하나(entry)를 엔진으로 계산한 값.
    // 돈 제한 없이 계산해 두고, 돈이 모자랄 때는 그 값에서 어림한다. 조건이 바뀌면 새로 만든다.
    let legStore = { key: '', model: null, s: null, options: null, free: null, origins: new Map(), exact: new Map(), empty: new Map() };

    function legsFor(s, options) {
        if (legStore.s === s && legStore.options === options && legStore.model === data.model) return legStore; // 같은 계산 안에서는 바로
        const key = JSON.stringify([s.ship, s.maxAgeDays, s.boxes, s.capacityScu, s.time, Math.floor(s.now / 600000), legalOn(options), options.goods, options.goal]);
        if (legStore.key !== key || legStore.model !== data.model) {
            legStore = { key, model: data.model, free: E.settings({ ...s, budget: null }), origins: new Map(), exact: new Map(), empty: new Map() };
        }
        legStore.s = s;
        legStore.options = options;
        return legStore;
    }

    function originLegs(from, s, options) {
        const store = legsFor(s, options);
        let pairs = store.origins.get(from);
        if (pairs) return pairs;
        pairs = new Map();
        store.origins.set(from, pairs);
        const sheet = E.terminalSheet(data.model, store.free, from);
        if (!sheet.ok) return pairs;
        for (const row of sheet.buys) {
            if (row.ageLevel !== 'ok' || row.soldOut) continue;
            // 상품 하나만 실었을 때의 값을 도착지마다 받는다 (한 출발지·한 상품이라 500개를 넘지 않는다).
            const ranked = E.rankRoutes(data.model, store.free, { from: [from], commodity: [row.c], maxGoods: 1, limit: 500, sort: 'profit', legalOnly: legalOn(options) });
            if (!ranked.ok) continue;
            for (const route of ranked.routes) {
                const good = route.goods[0];
                let pair = pairs.get(route.to);
                if (!pair) {
                    pair = { from, to: route.to, entries: [], plain: null, need: 0 };
                    pairs.set(route.to, pair);
                }
                const handle = route.time.parts.load + route.time.parts.unload;
                pair.entries.push({
                    c: good.c, margin: good.margin, price: good.buyPrice, q: good.quantity, room: good.caps.ship,
                    handle, fixed: route.time.known ? route.seconds - handle : null, // fixed: 싣고 내리는 시간을 뺀 나머지
                });
            }
        }
        for (const pair of pairs.values()) {
            pair.entries.sort((a, b) => b.margin - a.margin || a.c - b.c); // 엔진이 싣는 순서와 같게
            // 이 돈보다 많으면 돈 때문에 줄어드는 일이 없다.
            pair.need = pair.entries.map((entry) => entry.q * entry.price).sort((a, b) => b - a).slice(0, options.goods).reduce((sum, value) => sum + value, 0);
        }
        return pairs;
    }

    // 차익 큰 순으로 적힌 상품들을 그 순서대로 실었을 때의 어림값 (엔진이 싣는 방식과 같다).
    function estimateLoad(list, cash) {
        let loaded = 0;
        let money = cash;
        let profit = 0;
        let handle = 0;
        const goods = [];
        for (const entry of list) {
            let quantity = Math.min(entry.q, entry.room - loaded);
            if (money !== null) quantity = Math.min(quantity, Math.floor(money / entry.price));
            if (!(quantity > 0)) continue;
            loaded += quantity;
            profit += quantity * entry.margin;
            handle += entry.handle * quantity / entry.q;
            if (money !== null) money -= quantity * entry.price;
            goods.push(entry.c);
        }
        if (!goods.length || !(profit > 0)) return null;
        const fixed = list[0].fixed;
        return { goods, profit, seconds: fixed === null ? null : fixed + handle };
    }

    const rateOf = (load) => (load.seconds > 0 ? load.profit / load.seconds : -Infinity);
    const BETTER = {
        profit: (a, b) => a.profit > b.profit || (a.profit === b.profit && (a.seconds ?? Infinity) < (b.seconds ?? Infinity)),
        rate: (a, b) => rateOf(a) > rateOf(b) || (rateOf(a) === rateOf(b) && a.profit > b.profit),
    };

    // 한 구간에 실을 만한 짐들을 고른다.
    //   후보: 상품 하나씩, 그리고 (여러 가지를 실을 때) 가장 좋은 하나에서 시작해 더 좋아지는 동안 한 가지씩 보탠 것.
    //   목표가 이익이면 이익이 가장 큰 짐 하나, 빨리 끝내기면 시간당 이익이 가장 큰 짐 하나.
    //   시간당 이익이면 여러 개를 돌려준다: 이 구간만 보면 덜 벌어도 빨리 끝나는 짐이 순회 전체로는 더 나을 수 있어서,
    //   (시간, 이익) 그림에서 위쪽 테두리에 놓이는 짐을 모두 남긴다 (그 밖의 짐은 어떤 순회에서도 가장 좋은 선택이 되지 못한다).
    function pickLoads(list, cash, kinds, goal) {
        const loads = [];
        for (const entry of list) {
            const load = estimateLoad([entry], cash);
            if (load) loads.push(load);
        }
        if (!loads.length) return [];
        if (kinds > 1) {
            for (const better of [BETTER.profit, BETTER.rate]) {
                const chosen = new Set();
                let best = null;
                for (let round = 0; round < kinds; round += 1) {
                    let found = null;
                    let foundEntry = null;
                    for (const entry of list) {
                        if (chosen.has(entry)) continue;
                        const trial = estimateLoad(chosen.size ? list.filter((other) => other === entry || chosen.has(other)) : [entry], cash);
                        if (trial && (!found || better(trial, found))) {
                            found = trial;
                            foundEntry = entry;
                        }
                    }
                    if (!found || (best && !better(found, best))) break;
                    best = found;
                    chosen.add(foundEntry);
                    if (round > 0) loads.push(found);
                }
            }
        }
        const top = (better) => loads.reduce((best, load) => (better(load, best) ? load : best), loads[0]);
        const byProfit = top(BETTER.profit);
        if (goal === 'profit' || byProfit.seconds === null) return [byProfit];
        if (goal === 'short') return [top(BETTER.rate)];
        loads.sort((a, b) => a.seconds - b.seconds || b.profit - a.profit);
        const hull = [];
        for (const load of loads) {
            if (hull.length && load.profit <= hull[hull.length - 1].profit) continue; // 더 오래 걸리는데 더 벌지 못한다
            while (hull.length >= 2) {
                const a = hull[hull.length - 2];
                const b = hull[hull.length - 1];
                if ((b.seconds - a.seconds) * (load.profit - a.profit) - (b.profit - a.profit) * (load.seconds - a.seconds) < 0) break;
                hull.pop();
            }
            hull.push(load);
        }
        return hull;
    }

    // 이 구간에서 고를 수 있는 짐 (0~2가지). cash: 지금 가진 돈(null = 제한 없음), used: 이미 실었던 상품(구간마다 다른 상품일 때).
    function legChoices(pair, cash, used, options) {
        const blocked = Boolean(used && used.size) && pair.entries.some((entry) => used.has(entry.c));
        if (!blocked && (cash === null || cash >= pair.need)) {
            if (!pair.plain) pair.plain = pickLoads(pair.entries, null, options.goods, options.goal);
            return pair.plain;
        }
        return pickLoads(blocked ? pair.entries.filter((entry) => !used.has(entry.c)) : pair.entries, cash, options.goods, options.goal);
    }

    // 빈 배로 가는 구간 (엔진 값). 터미널을 모르면 null.
    function emptyLeg(from, to, s, options) {
        const store = legsFor(s, options);
        const key = `${from}>${to}`;
        if (!store.empty.has(key)) {
            const result = E.evaluateRoute(data.model, store.free, { from, to, commodities: [-1] }); // 없는 상품 id: 시간만 받는다
            store.empty.set(key, result.ok ? result.route : null);
        }
        return store.empty.get(key);
    }

    // 고른 짐을 엔진으로 정확히 계산한다. 실을 수 없게 되면(돈·상자) null.
    function exactLeg(pair, load, cash, s, options) {
        const store = legsFor(s, options);
        const tight = cash !== null && cash < pair.need;
        const key = `${pair.from}>${pair.to}|${load.goods.join('.')}|${tight ? cash : ''}`;
        if (!store.exact.has(key)) {
            const result = E.evaluateRoute(data.model, tight ? { ...s, budget: cash } : store.free, { from: pair.from, to: pair.to, commodities: load.goods },
                { maxGoods: load.goods.length, legalOnly: legalOn(options) });
            store.exact.set(key, result.ok && result.route.quantity > 0 && result.route.profit > 0 ? result.route : null);
        }
        return store.exact.get(key);
    }

    const scoreOf = (goal) => (chain) => {
        if (goal === 'profit') return chain.profit;
        if (goal === 'short') return -chain.seconds;
        return chain.seconds > 0 ? chain.profit / chain.seconds : -Infinity;
    };

    // 정해진 순서(stops)대로 도는 순회 하나를 계산한다. 목록과 계획 화면이 같은 값을 쓰도록 여기 한 곳에서만 만든다.
    function evalChain(stops, options, s) {
        const problem = shipProblem(s);
        if (problem) return { problem };
        const sequence = options.rt ? [...stops, stops[0]] : stops;
        const count = sequence.length - 1;
        const pairs = [];
        for (let index = 0; index < count; index += 1) pairs.push(originLegs(sequence[index], s, options).get(sequence[index + 1]) || null);
        // 1) 구간마다 무엇을 실을지 (어림값으로). 시간당 이익이 목표면 고를 짐이 여럿인 구간이 있다. 그때는
        //    "이익 − 비율 × 시간"이 가장 큰 짐을 구간마다 고르고, 그렇게 나온 순회의 시간당 이익을 새 비율로 삼아 되풀이한다.
        //    비율이 더 오르지 않으면 그것이 이 순서에서 시간당 이익이 가장 큰 조합이다.
        let best = null;
        let ratio = 0;
        for (let round = 0; round < 12; round += 1) {
            const loads = [];
            let cash = s.budget;
            let used = null;
            let profit = 0;
            let seconds = 0;
            for (let index = 0; index < count; index += 1) {
                const pair = pairs[index];
                let pick = null;
                for (const load of pair ? legChoices(pair, cash, used, options) : []) {
                    if (!pick || load.profit - ratio * (load.seconds || 0) > pick.profit - ratio * (pick.seconds || 0)) pick = load;
                }
                loads.push(pick);
                if (pick) {
                    profit += pick.profit;
                    seconds += pick.seconds || 0;
                    if (cash !== null) cash += pick.profit;
                    if (options.diff) used = new Set([...(used || []), ...pick.goods]);
                } else {
                    const empty = emptyLeg(sequence[index], sequence[index + 1], s, options);
                    seconds += (empty && empty.seconds) || 0;
                }
            }
            const value = seconds > 0 ? profit / seconds : 0;
            if (!best || value > best.value) best = { value, loads };
            if (options.goal !== 'perHour' || !(value > ratio * (1 + 1e-9))) break;
            ratio = value;
        }
        // 2) 고른 짐을 엔진으로 정확히 계산한다. 돈은 구간마다 번 만큼 늘어난다.
        const legs = [];
        let cash = s.budget;
        for (let index = 0; index < count; index += 1) {
            const pair = pairs[index];
            const load = best.loads[index];
            let route = pair && load ? exactLeg(pair, load, cash, s, options) : null;
            if (route) route = { ...route };
            else {
                const empty = emptyLeg(sequence[index], sequence[index + 1], s, options);
                if (!empty) return { problem: 'unknown-terminal' };
                // 돈이 없어서 못 싣는 것인지: 돈 제한이 없으면 실을 것이 있는지로 가린다.
                const byMoney = cash !== null && Boolean(pair) && pickLoads(pair.entries, null, 1, 'profit').length > 0;
                route = { ...empty, empty: true, emptyWhy: byMoney ? 'money' : 'none' };
            }
            route.closing = options.rt && index === count - 1;
            if (cash !== null) cash += route.profit;
            legs.push(route);
        }
        const timed = legs.every((leg) => leg.time && leg.time.known);
        const seconds = timed ? legs.reduce((sum, leg) => sum + leg.seconds, 0) : null;
        const profit = legs.reduce((sum, leg) => sum + leg.profit, 0);
        const ages = legs.map((leg) => leg.oldestAt).filter((at) => H.isKnown(at));
        const loaded = legs.filter((leg) => leg.goods.length);
        let legal = 'ok';
        if (loaded.some((leg) => leg.legal === false)) legal = 'illegal';
        else if (loaded.some((leg) => leg.legal !== true)) legal = 'unknown';
        return {
            stops, legs, profit, seconds, legal,
            perHour: seconds && seconds > 0 ? profit / seconds * 3600 : null,
            investment: legs.reduce((peak, leg) => Math.max(peak, leg.investment || 0), 0),
            oldestAt: ages.length ? Math.min(...ages) : null,
            assumptions: [...new Set(legs.flatMap((leg) => leg.assumptions || (leg.time && leg.time.assumptions) || []))],
        };
    }

    async function searchTours(options, s, job) {
        const breathe = pacer(job);
        const maxLeg = options.leg ? options.leg * 60 : null;
        const score = scoreOf(options.goal);
        const end = options.rt ? null : options.end;
        // 1) 구간 표: 살 것이 있는 터미널마다.
        const origins = data.terminals.filter((terminal) => terminal.buyCount > 0).map((terminal) => terminal.id);
        const edges = new Map();
        for (let index = 0; index < origins.length; index += 1) {
            job.report(t('searchLegs'), 0.3 * index / origins.length);
            await breathe();
            const from = origins[index];
            const system = terminalOf(from).system;
            const list = [];
            for (const pair of originLegs(from, s, options).values()) {
                if (pair.entries[0].fixed === null) continue; // 시간을 모르는 구간은 잇지 않는다
                if (options.same && terminalOf(pair.to).system !== system) continue;
                list.push(pair);
            }
            edges.set(from, list);
        }
        const starts = (options.start ? [options.start] : origins).filter((id) => id !== end);

        // 좋은 후보 모음 (들르는 순서마다 하나).
        const found = new Map();
        let floor = -Infinity;
        const rank = (a, b) => b.value - a.value || b.profit - a.profit || a.key.localeCompare(b.key);
        // 출발지를 정하지 않은 돌아오기에서는 같은 고리를 어디서 시작하느냐만 다른 것들이 생긴다: 그 가운데 가장 좋은 것 하나만 남긴다.
        const loops = options.rt && !options.start;
        const keyOf = (stops) => {
            if (!loops) return stops.join(',');
            const at = stops.indexOf(Math.min(...stops));
            return [...stops.slice(at), ...stops.slice(0, at)].join(',');
        };
        const offer = (stops, profit, seconds) => {
            const value = score({ profit, seconds });
            if (!(value > floor)) return;
            const key = keyOf(stops);
            const old = found.get(key);
            if (old && old.value >= value) return;
            found.set(key, { key, stops, value, profit });
            if (found.size <= POOL * 4) return;
            const kept = [...found.values()].sort(rank).slice(0, POOL);
            found.clear();
            kept.forEach((item) => { found.set(item.key, item); });
            floor = kept[kept.length - 1].value;
        };
        // 다 돈 순회: 돌아오기면 돌아오는 길을 붙인다 (실을 것이 있으면 싣고, 없으면 빈 배로).
        const finish = (state) => {
            if (!options.rt) {
                offer(state.stops, state.profit, state.seconds);
                return;
            }
            const last = state.stops[state.stops.length - 1];
            const home = state.stops[0];
            const pair = (edges.get(last) || NONE).find((edge) => edge.to === home);
            const loads = pair ? legChoices(pair, state.cash, state.used, options) : NONE;
            if (loads.length) {
                for (const load of loads) if (maxLeg === null || load.seconds <= maxLeg) offer(state.stops, state.profit + load.profit, state.seconds + load.seconds);
                return;
            }
            const key = last * 1e7 + home;
            let seconds = backSeconds.get(key);
            if (seconds === undefined) {
                const empty = emptyLeg(last, home, s, options);
                seconds = empty && empty.time.known ? empty.seconds : null;
                backSeconds.set(key, seconds);
            }
            if (seconds !== null && (maxLeg === null || seconds <= maxLeg)) offer(state.stops, state.profit, state.seconds + seconds);
        };
        const NONE = [];
        const backSeconds = new Map(); // 빈 배로 돌아오는 시간 (엔진 값)
        // 이 순회에 한 곳을 더 붙인 것들을 visit 에 넘긴다. 같은 곳은 두 번 들르지 않는다.
        const extend = (state, size, visit) => {
            const stops = state.stops;
            const closing = stops.length + 1 === size;
            for (const pair of edges.get(stops[stops.length - 1]) || []) {
                const to = pair.to;
                if (stops.includes(to) || (end && (closing ? to !== end : to === end))) continue;
                for (const load of legChoices(pair, state.cash, state.used, options)) {
                    if (load.seconds === null || (maxLeg !== null && load.seconds > maxLeg)) continue;
                    visit({
                        stops: [...stops, to], profit: state.profit + load.profit, seconds: state.seconds + load.seconds,
                        cash: state.cash === null ? null : state.cash + load.profit,
                        used: options.diff ? new Set([...(state.used || []), ...load.goods]) : null,
                    });
                }
            }
        };
        const rootOf = (id) => ({ stops: [id], profit: 0, seconds: 0, cash: s.budget, used: null });
        // 조합이 몇 개쯤인지 (같은 곳을 다시 들르는 것까지 세므로 실제보다 많다).
        const countNodes = (size) => {
            let layer = new Map(starts.map((id) => [id, 1]));
            let total = 0;
            for (let depth = 2; depth <= size && total <= EXACT_NODES; depth += 1) {
                const next = new Map();
                for (const [id, ways] of layer) {
                    for (const pair of edges.get(id) || []) {
                        const add = ways * Math.max(1, legChoices(pair, null, null, options).length);
                        next.set(pair.to, (next.get(pair.to) || 0) + add);
                        total += add;
                    }
                }
                layer = next;
            }
            return total;
        };
        const walkAll = (state, size) => extend(state, size, (next) => {
            if (next.stops.length === size) finish(next);
            else walkAll(next, size);
        });

        let partial = false;
        let got = 0;
        for (let size = options.n; size >= 2 && !found.size; size -= 1) {
            got = size;
            let exact = countNodes(size) <= EXACT_NODES;
            if (exact) {
                // 2-가) 전부 견준다. 출발지와 첫 구간마다 화면에 차례를 넘긴다. 너무 오래 걸리면 아래 방식으로 바꾼다.
                const began = performance.now();
                for (let index = 0; index < starts.length && exact; index += 1) {
                    job.report(t('searchAll', { done: H.num(index + 1), total: H.num(starts.length) }), 0.3 + 0.5 * index / starts.length);
                    const firsts = [];
                    extend(rootOf(starts[index]), size, (next) => firsts.push(next));
                    for (const first of firsts) {
                        await breathe();
                        if (performance.now() - began > EXACT_MS) {
                            exact = false;
                            break;
                        }
                        if (first.stops.length === size) finish(first);
                        else walkAll(first, size);
                    }
                }
            }
            partial = !exact;
            if (!exact) {
                // 2-나) 너무 많다: 단계마다, 마지막에 들른 곳별로 좋은 후보만 남긴다 (목표 기준과 이익 기준 각각).
                let layer = starts.map(rootOf);
                for (let depth = 2; depth <= size && layer.length; depth += 1) {
                    const next = [];
                    for (let index = 0; index < layer.length; index += 1) {
                        if (index % 32 === 0) {
                            job.report(t('searching', { done: depth - 1, total: size - 1 }), 0.3 + 0.5 * (depth - 2 + index / layer.length) / (size - 1));
                            await breathe();
                        }
                        extend(layer[index], size, (state) => {
                            if (depth === size) finish(state);
                            else next.push(state);
                        });
                    }
                    const groups = new Map();
                    for (const state of next) {
                        const last = state.stops[state.stops.length - 1];
                        if (!groups.has(last)) groups.set(last, []);
                        groups.get(last).push(state);
                    }
                    layer = [];
                    for (const group of groups.values()) {
                        await breathe();
                        const keep = new Set(group.slice().sort((a, b) => score(b) - score(a) || b.profit - a.profit).slice(0, PER_STOP));
                        group.sort((a, b) => b.profit - a.profit || a.seconds - b.seconds).slice(0, PER_STOP).forEach((state) => { keep.add(state); });
                        layer.push(...keep);
                    }
                }
            }
        }
        // 3) 좋은 후보를 엔진으로 다시 계산해 순서를 매긴다.
        job.report(t('finishing'), 0.85);
        const order = (a, b) => score(b) - score(a) || b.profit - a.profit || a.stops.join(',').localeCompare(b.stops.join(','));
        const chains = [];
        for (const candidate of [...found.values()].sort(rank).slice(0, POOL)) {
            await breathe();
            const chain = evalChain(candidate.stops, options, s);
            if (chain.problem) return { problem: chain.problem, chains: [] };
            if (chain.seconds === null || !(chain.profit > 0)) continue;
            if (chain.legs.some((leg) => leg.empty && !leg.closing)) continue;
            if (maxLeg !== null && chain.legs.some((leg) => leg.seconds > maxLeg)) continue;
            chains.push(chain);
        }
        chains.sort(order);
        return { problem: null, chains: chains.slice(0, KEEP), partial, want: options.n, got: chains.length ? got : 0, shortened: chains.length > 0 && got < options.n };
    }

    function cleanTourOptions() {
        const o = { ...view.tour };
        if (!terminalOf(o.start)) o.start = null;
        if (!terminalOf(o.end) || o.end === o.start) o.end = null;
        return o;
    }

    function runTour(moveFocus) {
        if (data.status !== 'ready' || data.priceError) return;
        stopJobs();
        view.stops = null;
        tour.ran = true;
        tour.cancelled = false;
        syncHash(); // 찾기를 돌린 사실이 주소에 남는다 (n 을 적는다): 새로 고쳐도 같은 목록이 나온다.
        const s = settingsNow();
        const problem = shipProblem(s);
        if (problem) {
            tour.result = { problem, chains: [] };
            draw();
            return;
        }
        const job = newJob(t('searchLegs'));
        tour.job = job;
        tour.result = null;
        draw();
        searchTours(cleanTourOptions(), s, job).then((result) => {
            if (tour.job !== job) return;
            tour.job = null;
            tour.result = result;
            if (moveFocus) focusNext = '[data-results]';
            draw();
        }).catch((error) => {
            if (tour.job !== job) return;
            tour.job = null;
            // 멈춤 신호가 아닌 오류여도 진행 막대를 남겨 두지 않는다: 알리고 다시 그린다.
            if (error === STOPPED) tour.cancelled = true;
            else {
                tour.result = { failed: true, chains: [] };
                console.error(error);
            }
            draw();
        });
    }

    // 진행 막대에 보이는 일 하나. report(문구, 0~1) 는 화면을 다시 그리지 않고 막대만 고친다.
    function newJob(message) {
        const job = { cancelled: false, message, value: 0, report: null };
        job.report = (text, value) => {
            job.message = text;
            job.value = value;
            const box = root.querySelector('[data-progress]');
            if (!box) return;
            box.querySelector('progress').value = Math.round(value * 100);
            box.querySelector('[data-progress-text]').textContent = text;
        };
        return job;
    }

    function stopJobs() {
        if (tour.job) { tour.job.cancelled = true; tour.job = null; }
        if (mixed.job) { mixed.job.cancelled = true; mixed.job = null; }
    }

    // ── 섞어 싣기: 빈 화물칸 ────────────────────────────────────────────────
    const usableGoods = (items) => items.filter((item) => item.c && item.scu > 0);

    // 엔진의 한 곳 판매 계획(route)을 화면이 쓰는 모양으로.
    function planFromRoute(route) {
        return {
            exact: true, from: route.from, load: route.goods, stops: [{ t: route.to, goods: route.goods }], unsold: route.unsold || [],
            profit: route.profit, investment: route.investment, revenue: route.revenue, seconds: route.seconds, perHour: route.profitPerHour,
            oldestAt: route.oldestAt, assumptions: route.assumptions || [], time: route.time,
        };
    }

    // 두 곳·상품마다 다른 곳: 지금 있는 곳에서 살 수 있는 상품과, 상품마다 사 주는 곳(비싼 순).
    function splitContext(s, fromId) {
        const model = data.model;
        const sheet = E.terminalSheet(model, s, fromId);
        const buys = new Map();
        const sells = new Map();
        if (!sheet.ok) return { buys, sells, capacity: 0 };
        for (const row of sheet.buys) {
            if (row.ageLevel !== 'ok' || row.soldOut) continue;
            buys.set(row.c, row);
            const detail = E.commodityDetail(model, s, row.c);
            sells.set(row.c, detail.ok ? detail.sells.filter((sell) => sell.ageLevel === 'ok' && sell.live && sell.t !== fromId) : []);
        }
        return { buys, sells, capacity: E.shipProfile(model, s).capacity || 0 };
    }

    // SCU 합계로 나눠 싣기. priceOf(c) → 그 상품을 팔 곳의 판매 줄(없으면 null).
    function splitLoad(context, s, fixed, fill, priceOf) {
        let room = context.capacity;
        let cash = s.budget;
        const goods = [];
        const unsold = [];
        const add = (row, sell, want, isFixed) => {
            let quantity = Math.min(want, room);
            let limitedBy = isFixed && want <= room ? 'requested' : 'ship';
            if (H.isKnown(row.stock) && row.stock < quantity) { quantity = row.stock; limitedBy = 'stock'; }
            if (cash !== null && Math.floor(cash / row.price) < quantity) { quantity = Math.floor(cash / row.price); limitedBy = 'budget'; }
            quantity = Math.floor(quantity);
            if (!(quantity > 0)) return;
            room -= quantity;
            if (cash !== null) cash -= quantity * row.price;
            goods.push({
                c: row.c, to: sell.t, quantity, boxes: null, sizes: row.box || null, buyPrice: row.price, sellPrice: sell.price, buyAt: row.at, sellAt: sell.at,
                fixed: isFixed, requested: isFixed ? want : null, stockKnown: H.isKnown(row.stock), limitedBy,
                destination: { takes: null, full: sell.full === true }, legal: null,
            });
        };
        const fixedIds = new Set();
        for (const item of fixed) {
            fixedIds.add(item.c);
            const row = context.buys.get(item.c);
            if (!row) { unsold.push({ c: item.c, why: 'not-sold-here' }); continue; }
            const sell = priceOf(item.c);
            if (!sell) { unsold.push({ c: item.c, why: 'not-bought-there' }); continue; }
            add(row, sell, item.scu, true);
        }
        if (fill) {
            const picks = [];
            for (const row of context.buys.values()) {
                if (fixedIds.has(row.c)) continue;
                const sell = priceOf(row.c);
                if (sell && sell.price > row.price) picks.push({ row, sell, margin: sell.price - row.price });
            }
            // 화물칸만 차면 되므로 SCU당 차익이 큰 것부터 싣는다. 실제로 실린 가짓수가 FILL_KINDS 에 닿거나 자리가 없으면 멈춘다.
            picks.sort((a, b) => b.margin - a.margin || a.row.c - b.row.c);
            let kinds = 0;
            for (const pick of picks) {
                if (kinds >= FILL_KINDS || !(room > 0)) break;
                const before = goods.length;
                add(pick.row, pick.sell, Infinity, false);
                if (goods.length > before) kinds += 1;
            }
        }
        const profit = goods.reduce((sum, good) => sum + good.quantity * (good.sellPrice - good.buyPrice), 0);
        return { goods, unsold, profit };
    }

    // 빈 배로 가는 시간(출발 + 비행 + 도착). 모르면 null.
    function hopSeconds(s, cache, from, to) {
        const key = `${from}>${to}`;
        if (!cache.has(key)) {
            const result = E.evaluateRoute(data.model, s, { from, to, commodities: [-1] });
            cache.set(key, result.ok && result.route.time.known ? result.route.seconds : null);
        }
        return cache.get(key);
    }

    // 들르는 순서: 5곳까지는 모든 순서를 견줘 가장 짧은 것, 그보다 많으면 가까운 곳부터.
    function bestOrder(s, cache, from, places) {
        const length = (list) => {
            let total = 0;
            let here = from;
            for (const place of list) {
                const hop = hopSeconds(s, cache, here, place);
                if (hop === null) return null;
                total += hop;
                here = place;
            }
            return total;
        };
        if (places.length > 5) {
            const left = places.slice();
            const list = [];
            let here = from;
            while (left.length) {
                left.sort((a, b) => (hopSeconds(s, cache, here, a) ?? Infinity) - (hopSeconds(s, cache, here, b) ?? Infinity) || a - b);
                here = left.shift();
                list.push(here);
            }
            return { list, seconds: length(list) };
        }
        let best = null;
        const walk = (done, rest) => {
            if (!rest.length) {
                const seconds = length(done);
                if (!best || (seconds !== null && (best.seconds === null || seconds < best.seconds))) best = { list: done, seconds };
                return;
            }
            rest.forEach((place, index) => { walk([...done, place], [...rest.slice(0, index), ...rest.slice(index + 1)]); });
        };
        walk([], places.slice().sort((a, b) => a - b));
        return best;
    }

    // 나눠 싣기 결과를 마무리: 상자로 맞추고, 들르는 순서와 시간을 붙인다.
    function finishSplit(s, cache, fromId, draft) {
        const model = data.model;
        const goods = [];
        for (const good of draft.goods) {
            const split = E.splitBoxes(model, s, good.quantity, good.sizes || undefined);
            if (!(split.scu > 0)) continue;
            const quantity = split.scu;
            goods.push({
                ...good, quantity, boxes: split.boxes, limitedBy: quantity < good.quantity ? 'boxes' : good.limitedBy,
                cost: quantity * good.buyPrice, revenue: quantity * good.sellPrice, profit: quantity * (good.sellPrice - good.buyPrice),
                legal: E.legality(model, good.c, fromId, good.to).legal,
            });
        }
        if (!goods.length) return null;
        const order = bestOrder(s, cache, fromId, [...new Set(goods.map((good) => good.to))]);
        const seconds = order.seconds === null ? null : order.seconds + s.time.terminalSeconds * (1 + order.list.length);
        const profit = goods.reduce((sum, good) => sum + good.profit, 0);
        const assumptions = ['price.static', 'demand.unknown', 'time.quantum', 'time.manual'];
        if (goods.some((good) => !good.stockKnown)) assumptions.push('stock.unknown');
        return {
            exact: false, from: fromId, load: goods, stops: order.list.map((id) => ({ t: id, goods: goods.filter((good) => good.to === id) })), unsold: draft.unsold,
            profit, investment: goods.reduce((sum, good) => sum + good.cost, 0), revenue: goods.reduce((sum, good) => sum + good.revenue, 0),
            seconds, perHour: seconds && seconds > 0 ? profit / seconds * 3600 : null,
            oldestAt: Math.min(...goods.flatMap((good) => [good.buyAt, good.sellAt]).filter((at) => H.isKnown(at))), assumptions, time: null,
        };
    }

    const planOrder = (by) => (a, b) => a.unsold.length - b.unsold.length
        || (by === 'perHour' ? (b.perHour ?? -Infinity) - (a.perHour ?? -Infinity) : 0) || b.profit - a.profit;

    async function planEmpty(options, s, job) {
        const model = data.model;
        const fixed = usableGoods(options.fixed).map((item) => ({ c: item.c, scu: Math.floor(item.scu) }));
        const to = options.dest !== 'each' && terminalOf(options.to) && options.to !== options.at ? options.to : null;
        if (options.dest === 'one') {
            const result = E.planMixedLoad(model, s, { from: options.at, fixed, fill: options.fill, to, limit: 50 }, { maxGoods: FILL_KINDS });
            if (!result.ok) return { problem: result.problem, plans: [] };
            return { problem: null, plans: result.options.map(planFromRoute).sort(planOrder(options.by)).slice(0, PLAN_KEEP), notes: [] };
        }
        const context = splitContext(s, options.at);
        const cache = new Map();
        const notes = ['noteScuOnly', 'noteNoHandling'];
        if (options.dest === 'each') {
            const draft = splitLoad(context, s, fixed, options.fill, (c) => (context.sells.get(c) || [])[0] || null);
            const plan = finishSplit(s, cache, options.at, draft);
            return { problem: null, plans: plan ? [plan] : [], notes, lone: draft.unsold };
        }
        // 두 곳: 사 주는 곳 둘씩 짝지어 견준다. 한 번에 조금씩 계산한다.
        const byPlace = new Map();
        for (const [c, rows] of context.sells) {
            for (const row of rows) {
                if (!byPlace.has(row.t)) byPlace.set(row.t, new Map());
                byPlace.get(row.t).set(c, row);
            }
        }
        const places = [...byPlace.keys()].sort((a, b) => a - b);
        const firsts = to ? (byPlace.has(to) ? [to] : []) : places;
        const total = firsts.length * places.length;
        const breathe = pacer(job);
        const drafts = [];
        let done = 0;
        for (const first of firsts) {
            for (const second of places) {
                done += 1;
                if (second === first || (!to && second < first)) continue;
                if (done % 16 === 0) {
                    job.report(t('comparing', { done: H.num(done), total: H.num(total) }), done / total);
                    await breathe();
                }
                const rowsA = byPlace.get(first);
                const rowsB = byPlace.get(second);
                const draft = splitLoad(context, s, fixed, options.fill, (c) => {
                    const a = rowsA.get(c);
                    const b = rowsB.get(c);
                    if (a && b) return b.price > a.price ? b : a;
                    return a || b || null;
                });
                if (new Set(draft.goods.map((good) => good.to)).size < 2) continue; // 한 곳으로 끝나는 짝은 "한 곳" 계획과 같다
                drafts.push(draft);
            }
        }
        drafts.sort((a, b) => a.unsold.length - b.unsold.length || b.profit - a.profit);
        const pool = options.by === 'perHour' ? 40 : PLAN_KEEP;
        if (options.by === 'perHour' && drafts.length > pool) notes.push('noteTopByProfit');
        const plans = [];
        for (const draft of drafts.slice(0, pool)) {
            await breathe();
            const plan = finishSplit(s, cache, options.at, draft);
            if (plan && plan.stops.length === 2) plans.push(plan);
        }
        return { problem: null, plans: plans.sort(planOrder(options.by)).slice(0, PLAN_KEEP), notes, pool };
    }

    // ── 섞어 싣기: 이미 실은 화물 ───────────────────────────────────────────
    function planBoard(options, s) {
        const model = data.model;
        const cargo = usableGoods(options.cargo).map((item) => ({ c: item.c, scu: item.scu, ...(item.paid ? { paid: item.paid } : {}) }));
        const at = terminalOf(options.at) ? options.at : null;
        const result = E.whereToSell(model, s, { cargo, at, limit: 25 });
        const places = result.single.slice();
        if (options.by === 'perHour') places.sort((a, b) => a.unsold.length - b.unsold.length || (b.revenuePerHour ?? -Infinity) - (a.revenuePerHour ?? -Infinity) || b.revenue - a.revenue);
        const shown = places.slice(0, PLAN_KEEP);
        // 가는 김에 실을 것: 화물칸에서 실려 있는 양을 뺀 만큼만.
        const profile = E.shipProfile(model, s);
        const carried = cargo.reduce((sum, item) => sum + item.scu, 0);
        const free = profile.known && profile.capacity > 0 ? Math.floor(profile.capacity - carried) : null;
        let alongWhy = null;
        if (!s.ship || !profile.exists) alongWhy = 'alongNeedShip';
        else if (!profile.known) alongWhy = 'alongHoldUnknown';
        else if (!(profile.capacity > 0)) alongWhy = 'alongNoHold';
        else if (!at) alongWhy = 'alongNeedAt';
        const along = new Map();
        if (at && free !== null && free > 0) {
            for (const place of shown.slice(0, 5)) {
                const extra = E.planMixedLoad(model, { ...s, capacityScu: free }, { from: at, to: place.t, fixed: [], fill: true, limit: 1 }, { maxGoods: FILL_KINDS });
                along.set(place.t, extra.ok && extra.options[0] ? extra.options[0] : null);
            }
        }
        const eachSum = result.perGood.reduce((sum, good) => sum + (good.places[0] ? good.places[0].revenue : 0), 0);
        return {
            board: true, at, places: shown, perGood: result.perGood, eachSum, along, free, alongWhy,
            assumptions: result.assumptions, timed: Boolean(at) && shown.some((place) => place.seconds !== null),
        };
    }

    function runMix(moveFocus) {
        if (data.status !== 'ready' || data.priceError) return;
        stopJobs();
        mixed.ran = true;
        const options = JSON.parse(JSON.stringify(view.mix));
        const s = settingsNow();
        if (options.mode === 'board') {
            mixed.result = usableGoods(options.cargo).length ? planBoard(options, s) : { hint: 'needCargo' };
            if (moveFocus) focusNext = '[data-results]';
            draw();
            return;
        }
        const problem = shipProblem(s);
        let early = null;
        if (problem) early = { problem, plans: [] };
        else if (!terminalOf(options.at)) early = { hint: 'needAt' };
        else if (!usableGoods(options.fixed).length && !options.fill) early = { hint: 'needLoad' };
        if (early) {
            mixed.result = early;
            draw();
            return;
        }
        const job = newJob(t('comparing', { done: 0, total: '…' }));
        mixed.job = job;
        mixed.result = null;
        if (options.dest === 'two') draw();
        planEmpty(options, s, job).then((result) => {
            if (mixed.job !== job) return;
            mixed.job = null;
            mixed.result = result;
            if (moveFocus) focusNext = '[data-results]';
            draw();
        }).catch((error) => {
            if (mixed.job !== job) return;
            mixed.job = null;
            if (error !== STOPPED) {
                mixed.result = { failed: true };
                console.error(error);
            }
            draw();
        });
    }

    // 조건이 바뀌었을 때: 이미 계산해 본 탭이면 다시 계산하고, 아니면 다시 그리기만.
    function refresh() {
        if (data.status === 'ready' && !data.priceError) {
            if (view.tab === 'tour' && tour.ran && !view.stops) { runTour(); return; }
            if (view.tab === 'mix' && mixed.ran) { runMix(); return; }
        }
        draw();
    }

    // ── 그리기: 작은 조각 ───────────────────────────────────────────────────
    function field(label, control, hint) {
        return `<label class="tours-field"><span class="tours-label">${esc(label)}</span>${control}${hint ? `<span class="tours-hint">${esc(hint)}</span>` : ''}</label>`;
    }

    function select(key, value, options, attrs) {
        const body = options.map((option) => {
            if (option.group) return `<optgroup label="${esc(option.group)}">${option.items.map((item) => `<option value="${esc(item.value)}"${String(item.value) === String(value ?? '') ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}</optgroup>`;
            return `<option value="${esc(option.value)}"${String(option.value) === String(value ?? '') ? ' selected' : ''}>${esc(option.label)}</option>`;
        }).join('');
        return `<select class="tours-input" data-k="${esc(key)}"${attrs || ''}>${body}</select>`;
    }

    function numberInput(key, value, attrs) {
        return `<input class="tours-input" type="number" inputmode="decimal" data-k="${esc(key)}" value="${esc(value ?? '')}"${attrs || ''}>`;
    }

    function check(key, checked, label) {
        return `<label class="tours-check"><input type="checkbox" data-k="${esc(key)}"${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;
    }

    // 터미널 고르기: 항성계별로 묶는다. keep(terminal) 로 거른다.
    function terminalOptions(first, keep) {
        const groups = new Map();
        data.terminals.filter(keep).forEach((terminal) => {
            const system = terminal.system || '—';
            if (!groups.has(system)) groups.set(system, []);
            groups.get(system).push({ value: terminal.id, label: placeName(terminal.id) });
        });
        return [{ value: '', label: first }, ...[...groups].map(([system, items]) => ({ group: system, items }))];
    }

    function ageTag(at) {
        return `<span class="tours-age">${esc(t('priceAge', { age: H.age(at) }))}</span>`;
    }

    function stat(label, value, extra) {
        return `<div class="tours-stat"><dt>${esc(label)}</dt><dd>${value}${extra ? ` <small>${extra}</small>` : ''}</dd></div>`;
    }

    const estMark = () => `<span class="tours-est">${esc(t('est'))}</span>`;
    const timeValue = (seconds) => (seconds === null || seconds === undefined ? esc(t('unknownTime')) : `${esc(H.duration(seconds))} ${estMark()}`);
    const hourValue = (value) => (H.isKnown(value) ? `${esc(money(Math.round(value)))} ${estMark()}` : esc(t('unknownTime')));

    function assumptionList(codes, notes) {
        const lang = H.lang();
        const lines = [...new Set(codes || [])].map((code) => E.ASSUMPTIONS[code] && E.ASSUMPTIONS[code][lang]).filter(Boolean);
        const own = (notes || []).map((note) => (typeof note === 'string' ? t(note) : t(note.key, note.vars)));
        if (!lines.length && !own.length) return '';
        return `<details class="tours-assume" open><summary>${esc(t('assume'))}</summary><ul>${[...own, ...lines].map((line) => `<li>${esc(line)}</li>`).join('')}<li>${esc(t('assumeTimes'))}</li></ul></details>`;
    }

    function progressBox(job) {
        return `<div class="tours-progress" data-progress role="status" aria-live="polite">
            <p data-progress-text>${esc(job.message)}</p>
            <progress max="100" value="${Math.round(job.value * 100)}"></progress>
            <button type="button" class="tours-btn" data-act="cancel">${esc(t('cancel'))}</button>
        </div>`;
    }

    // ── 그리기: 내 조건 ─────────────────────────────────────────────────────
    function minePanel() {
        const state = E.state.get();
        const model = data.model;
        const ships = E.listShips(model).filter((ship) => ship.scu !== 0)
            .map((ship) => ({ value: ship.id, label: ship.scu === null ? t('shipCargoUnknown', { name: shipName(ship.id) }) : t('shipCargo', { name: shipName(ship.id), scu: H.num(ship.scu) }) }))
            .sort((a, b) => a.label.localeCompare(b.label));
        const profile = state.ship ? E.shipProfile(model, E.settings(state)) : null;
        let hold = '';
        if (profile && profile.exists) {
            hold = profile.known && profile.capacity > 0
                ? t('shipHold', { scu: H.scu(profile.capacity), box: H.num(profile.maxBox) })
                : t(profile.known ? 'problem.no-cargo' : 'problem.cargo-unknown');
        }
        const times = E.timeSettings(state.time);
        const timeFields = Object.keys(E.TIME_DEFAULTS).map((key) => {
            if (key === 'loading') {
                return field(t('time.loading'), select('time.loading', times.loading, [{ value: 'auto', label: t('loadingAuto') }, { value: 'manual', label: t('loadingManual') }]));
            }
            return field(t(`time.${key}`), numberInput(`time.${key}`, times[key], ' min="0" max="14400" step="10"'));
        }).join('');
        return `<section class="tours-panel tours-mine" aria-labelledby="tours-mine-title">
            <h3 id="tours-mine-title">${esc(t('mine'))}</h3>
            <p class="tours-hint">${esc(t('mineHint'))}</p>
            <div class="tours-grid">
                ${field(t('ship'), select('ship', state.ship, [{ value: '', label: t('shipNone') }, ...ships]), hold)}
                ${field(t('budget'), numberInput('budget', state.budget, ' min="0" step="1000"'), t('budgetHint'))}
                ${field(t('age'), numberInput('age', state.maxAgeDays, ' min="0.5" max="365" step="0.5"'), t('ageHint'))}
            </div>
            <details class="tours-times" data-times${timeOpen ? ' open' : ''}>
                <summary>${esc(t('timeTitle'))}</summary>
                <p class="tours-hint">${esc(t('timeHint'))}</p>
                <div class="tours-grid">${timeFields}</div>
                <button type="button" class="tours-btn" data-act="time-reset" data-k="time-reset">${esc(t('timeReset'))}</button>
            </details>
        </section>`;
    }

    // ── 그리기: 순회 ────────────────────────────────────────────────────────
    function tourForm() {
        const o = view.tour;
        const counts = [2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: t('countN', { n }) }));
        const kinds = [1, 2, 3, 4].map((n) => ({ value: n, label: t('goodsN', { n }) }));
        return `<section class="tours-panel" aria-labelledby="tours-form-title">
            <h3 id="tours-form-title">${esc(t('tabTour'))}</h3>
            <div class="tours-grid">
                ${field(t('start'), select('tour.start', o.start, terminalOptions(t('startAny'), (terminal) => terminal.buyCount > 0)))}
                ${field(t('mode'), select('tour.rt', o.rt ? '1' : '', [{ value: '', label: t('modeFly') }, { value: '1', label: t('modeRound') }]))}
                ${field(t('end'), select('tour.end', o.rt ? '' : o.end, terminalOptions(t('endAny'), (terminal) => terminal.sellCount > 0), o.rt ? ' disabled' : ''), o.rt ? t('endOff') : '')}
                ${field(t('count'), select('tour.n', o.n, counts))}
                ${field(t('goal'), select('tour.goal', o.goal, [{ value: 'perHour', label: t('goalHour') }, { value: 'profit', label: t('goalProfit') }, { value: 'short', label: t('goalShort') }]))}
                ${field(t('leg'), numberInput('tour.leg', o.leg, ' min="1" max="240" step="1"'), t('legHint'))}
                ${field(t('goods'), select('tour.goods', o.goods, kinds))}
            </div>
            <div class="tours-checks">
                ${check('tour.same', o.same, t('same'))}
                ${check('tour.diff', o.diff, t('diff'))}
                ${data.namesError ? '' : check('tour.legal', o.legal, t('legalOnly'))}
            </div>
            <p class="tours-hint">${esc(data.namesError ? t('legalOff') : t('legalOnlyHint'))}</p>
            <button type="button" class="tours-btn is-primary" data-act="run-tour" data-k="run-tour">${esc(t('runTour'))}</button>
        </section>`;
    }

    const pathHtml = (stops, round) => [...stops, ...(round ? [stops[0]] : [])].map((id) => `<span class="tours-stop">${esc(placeName(id))}</span>`).join('<span class="tours-arrow" aria-hidden="true">→</span>');

    // 불법 화물(또는 합법 여부를 모르는 화물)이 든 순회라는 표시. 목록에서도 보이게 한다.
    function legalFlag(chain) {
        if (chain.legal === 'ok') return '';
        return `<p class="tours-flags"><span class="tours-flag is-warn">${esc(t(chain.legal === 'illegal' ? 'hasIllegal' : 'hasUnknownLegal'))}</span></p>`;
    }

    function tourResults() {
        if (tour.job) return progressBox(tour.job);
        const result = tour.result;
        if (!result) return `<p class="tours-empty">${esc(tour.cancelled ? t('cancelled') : (E.state.get().ship ? t('tourIdle') : `${t('tourIdle')} ${t('needShip')}`))}</p>`;
        if (result.failed) return `<p class="tours-empty" role="alert">${esc(t('searchFailed'))}</p>`;
        if (result.problem) return `<p class="tours-empty" role="alert">${esc(t(`problem.${result.problem}`))}</p>`;
        if (!result.chains.length) {
            if (!data.model.counts.rows) return `<p class="tours-empty">${esc(t('noPrices'))}</p>`;
            return `<p class="tours-empty">${esc(E.state.get().budget === 0 ? t('noMoney') : t('noTours'))}</p>`;
        }
        const notes = [];
        if (result.shortened) notes.push(t('shortened', { want: result.want, got: result.got }));
        if (result.partial) notes.push(t('partial'));
        if (view.tour.goal === 'short') notes.push(t('goalShortNote'));
        const cards = result.chains.map((chain, index) => `<li class="tours-card">
            <div class="tours-card-head"><span class="tours-rank">${index + 1}</span><p class="tours-path">${pathHtml(chain.stops, view.tour.rt)}</p></div>
            ${legalFlag(chain)}
            <dl class="tours-stats">
                ${stat(t('profit'), esc(signed(chain.profit)))}
                ${stat(t('time'), timeValue(chain.seconds))}
                ${stat(t('perHour'), hourValue(chain.perHour))}
                ${stat(t('invest'), esc(money(chain.investment)))}
                ${stat(t('oldest'), esc(H.age(chain.oldestAt)))}
            </dl>
            <button type="button" class="tours-btn" data-act="open" data-stops="${esc(chain.stops.join(','))}">${esc(t('openPlan'))}<span class="visually-hidden"> ${esc(chain.stops.map(placeName).join(' → '))}</span></button>
        </li>`).join('');
        return `<h3 class="tours-results-title" data-results tabindex="-1">${esc(t('results', { n: result.chains.length }))}</h3>
            ${notes.map((note) => `<p class="tours-note">${esc(note)}</p>`).join('')}
            <ol class="tours-cards">${cards}</ol>
            ${assumptionList(result.chains.flatMap((chain) => chain.assumptions))}`;
    }

    function limitedText(good) {
        const parts = [];
        if (good.limitedBy && TEXT.ko[`cap.${good.limitedBy}`]) parts.push(t(`cap.${good.limitedBy}`));
        if (good.fixed && H.isKnown(good.requested) && good.quantity < good.requested) parts.unshift(t('wanted', { scu: H.scu(good.requested) }));
        return parts.join(' · ');
    }

    function buyItem(good, tags) {
        const flags = [];
        if (!good.stockKnown) flags.push(`<span class="tours-flag">${esc(t('stockUnknown'))}</span>`);
        if (good.legal === false) flags.push(`<span class="tours-flag is-warn">${esc(t('illegal'))}</span>`);
        else if (good.legal !== true) flags.push(`<span class="tours-flag">${esc(t('legalUnknown'))}</span>`);
        if (tags) flags.unshift(`<span class="tours-flag ${good.fixed ? 'is-must' : ''}">${esc(t(good.fixed ? 'mustTag' : 'fillTag'))}</span>`);
        return `<li class="tours-good">
            <p class="tours-good-head"><strong>${esc(goodName(good.c))}</strong><span class="tours-qty">${esc(H.scu(good.quantity))}</span></p>
            <p class="tours-sub">${esc(limitedText(good))}${good.boxes && good.boxes.length ? `${limitedText(good) ? ' · ' : ''}${esc(t('boxes', { list: boxText(good.boxes) }))}` : ''}</p>
            <p class="tours-sub">${esc(t('each', { price: unitPrice(good.buyPrice) }))} · ${esc(t('total', { price: money(good.cost) }))} · ${ageTag(good.buyAt)}</p>
            ${flags.length ? `<p class="tours-flags">${flags.join('')}</p>` : ''}
        </li>`;
    }

    function sellItem(good) {
        const flags = [`<span class="tours-flag${good.destination && good.destination.full ? ' is-warn' : ''}">${esc(good.destination && good.destination.full ? t('shopFull') : t('takesUnknown'))}</span>`];
        return `<li class="tours-good">
            <p class="tours-good-head"><strong>${esc(goodName(good.c))}</strong><span class="tours-qty">${esc(H.scu(good.quantity))}</span></p>
            <p class="tours-sub">${esc(t('each', { price: unitPrice(good.sellPrice) }))} · ${esc(t('total', { price: money(good.revenue) }))} · ${ageTag(good.sellAt)}</p>
            <p class="tours-sub">${esc(t('profit'))} ${esc(signed(good.profit))}</p>
            <p class="tours-flags">${flags.join('')}</p>
        </li>`;
    }

    // from, to: 그 구간의 터미널 id (같은 행성의 지표면과 궤도 사이인지 가리는 데만 쓴다).
    function timeParts(time, from, to) {
        if (!time || !time.known) return '';
        const parts = time.parts;
        const flight = time.flight || {};
        const a = terminalOf(from);
        const b = terminalOf(to);
        // 엔진은 같은 행성·위성에 딸린 두 곳을 모두 "같은 행성 안"으로 보고 정해 둔 값을 쓴다. 한쪽이 궤도 정거장이면 그렇게 적는다.
        const orbit = Boolean(a && b) && typeof a.surface === 'boolean' && typeof b.surface === 'boolean' && a.surface !== b.surface;
        const mode = { jump: t('flightJump'), 'same-body': t(orbit ? 'flightSameBodyOrbit' : 'flightSameBody'), 'same-place': t('flightSamePlace') }[flight.mode];
        const list = [
            t('partFlight', { v: H.duration(parts.flight) }) + (mode ? ` (${mode})` : ''),
            t('partPads', { v: H.duration(parts.depart + parts.arrive) }),
        ];
        if (parts.buy + parts.sell > 0) list.push(t('partTerminal', { v: H.duration(parts.buy + parts.sell) }));
        if (parts.load + parts.unload > 0) list.push(t('partHandling', { v: H.duration(parts.load + parts.unload) }));
        return list.join(' · ');
    }

    function tourDetail() {
        const s = settingsNow();
        const options = cleanTourOptions();
        const stops = view.stops.filter((id) => terminalOf(id));
        const back = `<button type="button" class="tours-btn" data-act="back" data-k="back">${esc(t('back'))}</button>`;
        const copy = `<button type="button" class="tours-btn" data-act="copy" data-k="copy">${esc(t('copy'))}</button>`;
        const head = `<div class="tours-detail-head"><h3 data-results tabindex="-1">${esc(t('planTitle'))}</h3><div class="tours-actions">${back}${copy}</div></div>`;
        if (stops.length !== view.stops.length || stops.length < 2) return `${head}<p class="tours-empty" role="alert">${esc(t('problem.unknown-terminal'))}</p>`;
        const chain = evalChain(stops, options, s);
        if (chain.problem) return `${head}<p class="tours-empty" role="alert">${esc(t(`problem.${chain.problem}`))}</p>`;
        const legs = chain.legs.map((leg, index) => {
            const from = placeName(leg.from);
            const to = placeName(leg.to);
            const title = leg.closing ? t('legReturn') : t('legNo', { n: index + 1 });
            const body = leg.goods.length
                ? `<div class="tours-leg-cols">
                    <div class="tours-box"><h5>${esc(t('buyAt', { place: from }))}</h5><ul class="tours-goods">${leg.goods.map((good) => buyItem(good, false)).join('')}</ul></div>
                    <div class="tours-box"><h5>${esc(t('sellAt', { place: to }))}</h5><ul class="tours-goods">${leg.goods.map(sellItem).join('')}</ul></div>
                </div>`
                : `<p class="tours-note">${esc(t(s.budget === 0 ? 'noMoney' : (leg.emptyWhy === 'money' ? 'emptyLegMoney' : 'emptyLeg')))}</p>`;
            const link = leg.goods.length ? `<a class="tours-link" href="${esc(H.buildHash('routes', { from: leg.from, to: leg.to, c: leg.goods[0].c }))}">${esc(t('toRoutes'))}</a>` : '';
            return `<li class="tours-leg">
                <div class="tours-leg-head"><span class="tours-leg-no">${esc(title)}</span><p class="tours-path"><span class="tours-stop">${esc(from)}</span><span class="tours-arrow" aria-hidden="true">→</span><span class="tours-stop">${esc(to)}</span></p></div>
                ${body}
                <p class="tours-leg-sum"><strong>${esc(t('legProfit', { profit: signed(leg.profit) }))}</strong> · ${leg.time && leg.time.known ? esc(t('legTime', { time: H.duration(leg.seconds), est: t('est') })) : esc(t('unknownTime'))}</p>
                <p class="tours-sub">${esc(timeParts(leg.time, leg.from, leg.to))}</p>
                <p class="tours-links">${link}<a class="tours-link" href="${esc(H.buildHash('market', { tab: 'stations', t: leg.to }))}">${esc(t('toStation'))}: ${esc(to)}</a></p>
            </li>`;
        }).join('');
        return `${head}
            <p class="tours-lead">${esc(t('planLead'))}</p>
            <p class="tours-path is-big">${pathHtml(stops, options.rt)}</p>
            ${legalFlag(chain)}
            <dl class="tours-stats">
                ${stat(t('profit'), esc(signed(chain.profit)))}
                ${stat(t('time'), timeValue(chain.seconds))}
                ${stat(t('perHour'), hourValue(chain.perHour))}
                ${stat(t('invest'), esc(money(chain.investment)))}
                ${stat(t('oldest'), esc(H.age(chain.oldestAt)))}
            </dl>
            <ol class="tours-legs">${legs}</ol>
            ${assumptionList(chain.assumptions)}`;
    }

    // ── 그리기: 섞어 싣기 ───────────────────────────────────────────────────
    function itemRows(items, kind, goodOptions, withPaid) {
        return items.map((item, index) => `<li class="tours-item">
            ${field(t('good'), select(`${kind}.${index}.c`, item.c, goodOptions))}
            ${field(t('amount'), numberInput(`${kind}.${index}.scu`, item.scu, ' min="1" step="1"'))}
            ${withPaid ? field(t('paid'), numberInput(`${kind}.${index}.paid`, item.paid, ' min="0" step="0.01"')) : ''}
            <button type="button" class="tours-btn is-small" data-act="${kind}-del" data-index="${index}" data-k="${kind}-del-${index}" aria-label="${esc(t('removeN', { n: index + 1 }))}">${esc(t('remove'))}</button>
        </li>`).join('');
    }

    function mixForm() {
        const m = view.mix;
        const board = m.mode === 'board';
        const s = settingsNow();
        const modeTabs = `<div class="tours-switch" role="group" aria-label="${esc(t('mixMode'))}">
            <button type="button" class="tours-switch-btn${board ? '' : ' is-active'}" aria-pressed="${board ? 'false' : 'true'}" data-act="mix-mode" data-mode="empty" data-k="mode-empty">${esc(t('mixEmpty'))}</button>
            <button type="button" class="tours-switch-btn${board ? ' is-active' : ''}" aria-pressed="${board ? 'true' : 'false'}" data-act="mix-mode" data-mode="board" data-k="mode-board">${esc(t('mixBoard'))}</button>
        </div>`;
        let body;
        if (board) {
            const goods = [...data.model.commodities.values()].filter((commodity) => commodity.sells.length)
                .map((commodity) => ({ value: commodity.id, label: goodName(commodity.id) })).sort((a, b) => a.label.localeCompare(b.label));
            body = `<div class="tours-grid">
                    ${field(t('at'), select('mix.at', m.at, terminalOptions(t('atOptional'), () => true)))}
                    ${field(t('by'), select('mix.by', m.by, [{ value: 'profit', label: t('byRevenue') }, { value: 'perHour', label: t('byHourIncome') }]))}
                </div>
                <fieldset class="tours-set"><legend>${esc(t('cargo'))}</legend>
                    <p class="tours-hint">${esc(t('cargoHint'))}</p>
                    <ul class="tours-items">${itemRows(m.cargo, 'cg', [{ value: '', label: t('goodPick') }, ...goods], true)}</ul>
                    ${m.cargo.length < 8 ? `<button type="button" class="tours-btn" data-act="cg-add" data-k="cg-add">${esc(t('add'))}</button>` : ''}
                </fieldset>`;
        } else {
            const sheet = terminalOf(m.at) ? E.terminalSheet(data.model, s, m.at) : null;
            const goods = sheet && sheet.ok ? sheet.buys.filter((row) => row.ageLevel === 'ok' && !row.soldOut)
                .map((row) => ({ value: row.c, label: goodName(row.c) })).sort((a, b) => a.label.localeCompare(b.label)) : [];
            // 주소로 들어온 상품이 지금 목록에 없어도 고른 값은 보이게 한다.
            m.fixed.forEach((item) => { if (item.c && !goods.some((good) => good.value === item.c)) goods.push({ value: item.c, label: goodName(item.c) }); });
            const noGoods = Boolean(sheet && sheet.ok && !goods.length);
            const each = m.dest === 'each';
            body = `<div class="tours-grid">
                    ${field(t('at'), select('mix.at', m.at, terminalOptions(t('atPick'), (terminal) => terminal.buyCount > 0)))}
                    ${field(t('dest'), select('mix.dest', m.dest, [{ value: 'one', label: t('destOne') }, { value: 'two', label: t('destTwo') }, { value: 'each', label: t('destEach') }]))}
                    ${field(t('to'), select('mix.to', each ? '' : m.to, terminalOptions(t('toAny'), (terminal) => terminal.sellCount > 0 && terminal.id !== m.at), each ? ' disabled' : ''), each ? t('toEachOff') : '')}
                    ${field(t('by'), select('mix.by', m.by, [{ value: 'profit', label: t('byProfit') }, { value: 'perHour', label: t('byHour') }]))}
                </div>
                <fieldset class="tours-set"><legend>${esc(t('fixed'))}</legend>
                    <p class="tours-hint">${esc(terminalOf(m.at) ? t(noGoods ? 'fixedNoGoods' : 'fixedHint') : t('fixedNeedsAt'))}</p>
                    <ul class="tours-items">${itemRows(m.fixed, 'fx', [{ value: '', label: t('goodPick') }, ...goods], false)}</ul>
                    ${m.fixed.length < 8 ? `<button type="button" class="tours-btn" data-act="fx-add" data-k="fx-add">${esc(t('add'))}</button>` : ''}
                </fieldset>
                <div class="tours-checks">${check('mix.fill', m.fill, t('fill', { n: FILL_KINDS }))}</div>`;
        }
        return `<section class="tours-panel" aria-labelledby="tours-mix-title">
            <h3 id="tours-mix-title">${esc(t('tabMix'))}</h3>
            ${modeTabs}
            ${body}
            <button type="button" class="tours-btn is-primary" data-act="run-mix" data-k="run-mix">${esc(t('runMix'))}</button>
        </section>`;
    }

    function planCard(plan, index, many) {
        const from = placeName(plan.from);
        const path = [plan.from, ...plan.stops.map((stop) => stop.t)].map((id) => `<span class="tours-stop">${esc(placeName(id))}</span>`).join('<span class="tours-arrow" aria-hidden="true">→</span>');
        const unsold = plan.unsold.length ? `<div class="tours-box is-warn"><h5>${esc(t('unsold'))}</h5><ul class="tours-plain">${plan.unsold.map((item) => `<li><strong>${esc(goodName(item.c))}</strong> — ${esc(t(`why.${item.why}`))}</li>`).join('')}</ul></div>` : '';
        return `<li class="tours-card">
            <div class="tours-card-head">${many ? `<span class="tours-rank">${index + 1}</span>` : ''}<p class="tours-path">${path}</p></div>
            <dl class="tours-stats">
                ${stat(t('profit'), esc(signed(plan.profit)))}
                ${stat(t('investAll'), esc(money(plan.investment)))}
                ${stat(t('time'), timeValue(plan.seconds))}
                ${stat(t('perHour'), hourValue(plan.perHour))}
                ${stat(t('oldest'), esc(H.age(plan.oldestAt)))}
            </dl>
            <div class="tours-leg-cols">
                <div class="tours-box"><h5>${esc(t('loadHere', { place: from }))}</h5><ul class="tours-goods">${plan.load.map((good) => buyItem(good, true)).join('')}</ul></div>
                <div class="tours-stack">${plan.stops.map((stop) => `<div class="tours-box"><h5>${esc(t('sellAt', { place: placeName(stop.t) }))}</h5><ul class="tours-goods">${stop.goods.map(sellItem).join('')}</ul></div>`).join('')}</div>
            </div>
            ${unsold}
            ${plan.time ? `<p class="tours-sub">${esc(timeParts(plan.time, plan.from, plan.stops[0].t))}</p>` : ''}
        </li>`;
    }

    function boardResults(result) {
        const places = result.places.map((place, index) => {
            const goods = place.goods.map((good) => `<li class="tours-good">
                <p class="tours-good-head"><strong>${esc(goodName(good.c))}</strong><span class="tours-qty">${esc(H.scu(good.quantity))}</span></p>
                <p class="tours-sub">${esc(t('each', { price: unitPrice(good.sellPrice) }))} · ${esc(t('total', { price: money(good.revenue) }))} · ${ageTag(good.sellAt)}</p>
                <p class="tours-flags"><span class="tours-flag${good.destination.full ? ' is-warn' : ''}">${esc(good.destination.full ? t('shopFull') : t('takesUnknown'))}</span>${good.legal === false ? `<span class="tours-flag is-warn">${esc(t('illegal'))}</span>` : ''}</p>
            </li>`).join('');
            let along = '';
            if (result.along.has(place.t)) {
                const extra = result.along.get(place.t);
                along = `<div class="tours-box"><h5>${esc(t('along', { place: placeName(result.at) }))} <small>${esc(t('alongFree', { scu: H.scu(result.free) }))}</small></h5>${extra
                    ? `<ul class="tours-goods">${extra.goods.map((good) => buyItem(good, false)).join('')}</ul><p class="tours-sub">${esc(t('profit'))} ${esc(signed(extra.profit))} · ${esc(t('investAll'))} ${esc(money(extra.investment))}</p>`
                    : `<p class="tours-sub">${esc(t('alongNone'))}</p>`}</div>`;
            }
            return `<li class="tours-card">
                <div class="tours-card-head"><span class="tours-rank">${index + 1}</span><p class="tours-path"><span class="tours-stop">${esc(placeName(place.t))}</span></p></div>
                <dl class="tours-stats">
                    ${stat(t('revenue'), esc(money(place.revenue)))}
                    ${stat(t('profit'), place.profit === null ? esc(t('profitNeedsPaid')) : esc(signed(place.profit)))}
                    ${result.at ? stat(t('time'), timeValue(place.seconds)) : ''}
                    ${result.at ? stat(t('perHourIncome'), hourValue(place.revenuePerHour)) : ''}
                    ${stat(t('oldest'), esc(H.age(place.oldestAt)))}
                </dl>
                <div class="tours-leg-cols"><div class="tours-box"><h5>${esc(t('sellAt', { place: placeName(place.t) }))}</h5><ul class="tours-goods">${goods}</ul></div>${along ? `<div class="tours-stack">${along}</div>` : ''}</div>
                ${place.unsold.length ? `<p class="tours-note is-warn">${esc(t('cantSell', { list: place.unsold.map(goodName).join(', ') }))}</p>` : ''}
                <p class="tours-links"><a class="tours-link" href="${esc(H.buildHash('market', { tab: 'stations', t: place.t }))}">${esc(t('toStation'))}: ${esc(placeName(place.t))}</a></p>
            </li>`;
        }).join('');
        const perGood = result.perGood.map((good) => `<div class="tours-box"><h5>${esc(goodName(good.c))} <small>${esc(H.scu(good.scu))}</small></h5>${good.places.length
            ? `<ol class="tours-plain">${good.places.slice(0, 3).map((place) => `<li><strong>${esc(placeName(place.t))}</strong> — ${esc(t('each', { price: unitPrice(place.sellPrice) }))} · ${esc(t('total', { price: money(place.revenue) }))} · ${ageTag(place.sellAt)}${place.destination.full ? ` <span class="tours-flag is-warn">${esc(t('shopFull'))}</span>` : ''}</li>`).join('')}</ol>`
            : `<p class="tours-sub">${esc(t('noSellPlace'))}</p>`}</div>`).join('');
        let alongNote = '';
        if (result.alongWhy) alongNote = t(result.alongWhy);
        else if (result.free <= 0) alongNote = t('alongNoRoom');
        const notes = [...(result.at ? ['noteBoardTime'] : []), ...(result.along.size ? ['noteAlong'] : [])];
        return `<h3 class="tours-results-title" data-results tabindex="-1">${esc(t('sellOne'))}</h3>
            ${result.places.length ? `<ol class="tours-cards">${places}</ol>` : `<p class="tours-empty">${esc(t('noPlans'))}</p>`}
            ${alongNote ? `<p class="tours-note">${esc(alongNote)}</p>` : ''}
            <h3 class="tours-results-title">${esc(t('sellEach'))}</h3>
            <p class="tours-note">${esc(t('sellEachSum', { price: money(result.eachSum) }))}</p>
            <div class="tours-pergood">${perGood}</div>
            ${assumptionList(result.assumptions, notes)}`;
    }

    function mixResults() {
        if (mixed.job && view.mix.dest === 'two' && view.mix.mode === 'empty') return progressBox(mixed.job);
        const result = mixed.result;
        if (!result) return `<p class="tours-empty">${esc(t(view.mix.mode === 'board' ? 'boardIdle' : 'mixIdle'))}${view.mix.mode === 'empty' && !E.state.get().ship ? ` ${esc(t('needShip'))}` : ''}</p>`;
        if (result.failed) return `<p class="tours-empty" role="alert">${esc(t('searchFailed'))}</p>`;
        if (result.hint) return `<p class="tours-empty" role="alert">${esc(t(result.hint))}</p>`;
        if (result.board) return boardResults(result);
        if (result.problem) return `<p class="tours-empty" role="alert">${esc(t(`problem.${result.problem}`))}</p>`;
        if (!result.plans.length) {
            const lone = (result.lone || []).map((item) => `<li><strong>${esc(goodName(item.c))}</strong> — ${esc(t(`why.${item.why}`))}</li>`).join('');
            const why = E.state.get().budget === 0 ? 'noMoney' : 'noPlans';
            return `<p class="tours-empty">${esc(data.model.counts.rows ? t(why) : t('noPrices'))}</p>${lone ? `<ul class="tours-plain">${lone}</ul>` : ''}`;
        }
        const notes = (result.notes || []).map((key) => (key === 'noteTopByProfit' ? { key, vars: { n: result.pool } } : key));
        return `<h3 class="tours-results-title" data-results tabindex="-1">${esc(t('plans', { n: result.plans.length }))}</h3>
            <ol class="tours-cards">${result.plans.map((plan, index) => planCard(plan, index, result.plans.length > 1)).join('')}</ol>
            ${assumptionList(result.plans.flatMap((plan) => plan.assumptions), notes)}`;
    }

    // ── 그리기: 전체 ────────────────────────────────────────────────────────
    function html() {
        if (data.status === 'loading') return `<p class="tours-empty" role="status">${esc(t('loading'))}</p>`;
        if (data.status === 'error') {
            return `<div class="tours-empty" role="alert"><p>${esc(H.errorText(data.error))}</p><button type="button" class="tours-btn" data-act="retry" data-k="retry">${esc(t('retry'))}</button></div>`;
        }
        const tabs = `<div class="tours-tabs" role="group" aria-label="${esc(t('tabsLabel'))}">
            <button type="button" class="tours-tab${view.tab === 'tour' ? ' is-active' : ''}" aria-pressed="${view.tab === 'tour'}" data-act="tab" data-tab="tour" data-k="tab-tour">${esc(t('tabTour'))}</button>
            <button type="button" class="tours-tab${view.tab === 'mix' ? ' is-active' : ''}" aria-pressed="${view.tab === 'mix'}" data-act="tab" data-tab="mix" data-k="tab-mix">${esc(t('tabMix'))}</button>
        </div>`;
        let form;
        let results;
        if (data.priceError) {
            form = '';
            results = `<div class="tours-empty" role="alert"><p>${esc(H.errorText(data.priceError))}</p><button type="button" class="tours-btn" data-act="retry" data-k="retry">${esc(t('retry'))}</button></div>`;
        } else if (view.tab === 'mix') {
            form = mixForm();
            results = mixResults();
        } else {
            form = tourForm();
            results = view.stops ? tourDetail() : tourResults();
        }
        const warn = data.namesError && !data.priceError
            ? `<div class="tours-warn" role="alert"><p>${esc(t('namesMissing'))}</p><button type="button" class="tours-btn" data-act="retry" data-k="retry">${esc(t('retry'))}</button></div>` : '';
        return `${tabs}
            ${warn}
            <div class="tours-layout">
                <div class="tours-side">${minePanel()}${form}</div>
                <div class="tours-main">${results}</div>
            </div>
            <p class="tours-notice" role="status" data-notice>${esc(notice)}</p>
            <p class="tours-source">${esc(H.sourceLine(data.model.header, data.uexMeta))}</p>`;
    }

    function draw() {
        if (!root) return;
        const active = document.activeElement;
        const key = active && root.contains(active) && active.dataset ? active.dataset.k : null;
        root.innerHTML = html();
        const target = focusNext ? root.querySelector(focusNext) : (key ? root.querySelector(`[data-k="${CSS.escape(key)}"]`) : null);
        focusNext = null;
        if (target && typeof target.focus === 'function') target.focus({ preventScroll: !target.hasAttribute('data-results') });
    }

    // ── 입력 ────────────────────────────────────────────────────────────────
    // 입력 하나의 값을 상태에 적는다 (다시 그리지는 않는다). 공용 값은 저장소에, 이 화면 값은 view 에.
    function applyValue(key, raw) {
        const shared = (patch) => {
            muted = true;
            try { E.state.set(patch); } finally { muted = false; }
        };
        if (key === 'ship') { shared({ ship: raw || null }); return; }
        if (key === 'budget') { shared({ budget: raw === '' || !(Number(raw) >= 0) ? null : Number(raw) }); return; }
        if (key === 'age') { shared({ maxAgeDays: posNum(raw) ? Math.min(365, posNum(raw)) : E.state.defaults.maxAgeDays }); return; }
        if (key.startsWith('time.')) {
            const name = key.slice(5);
            const time = { ...E.state.get().time };
            if (name === 'loading') time.loading = raw;
            else if (raw === '' || !(Number(raw) >= 0)) delete time[name];
            else time[name] = Number(raw);
            shared({ time });
            return;
        }
        const [group, name, part] = key.split('.');
        if (group === 'tour') {
            const o = view.tour;
            if (name === 'start' || name === 'end') o[name] = toId(raw);
            else if (name === 'n') o.n = clamp(raw, 2, 8, 3);
            else if (name === 'goods') o.goods = clamp(raw, 1, 4, 1);
            else if (name === 'rt') o.rt = raw === '1';
            else if (name === 'goal') o.goal = ['profit', 'short'].includes(raw) ? raw : 'perHour';
            else if (name === 'leg') o.leg = posNum(raw) ? Math.round(posNum(raw)) : null;
            else if (name === 'same' || name === 'diff' || name === 'legal') o[name] = raw === true;
            if (o.end && o.end === o.start) o.end = null;
        } else if (group === 'mix') {
            const m = view.mix;
            if (name === 'at') {
                m.at = toId(raw);
                if (m.to === m.at) m.to = null;
            } else if (name === 'to') m.to = toId(raw);
            else if (name === 'dest') m.dest = ['two', 'each'].includes(raw) ? raw : 'one';
            else if (name === 'by') m.by = raw === 'perHour' ? 'perHour' : 'profit';
            else if (name === 'fill') m.fill = raw === true;
        } else if (group === 'fx' || group === 'cg') {
            const list = group === 'fx' ? view.mix.fixed : view.mix.cargo;
            const item = list[Number(name)];
            if (!item) return;
            if (part === 'c') item.c = toId(raw);
            else if (part === 'scu') item.scu = posNum(raw) ? Math.floor(posNum(raw)) || null : null;
            else if (part === 'paid') item.paid = posNum(raw);
        }
    }

    // 숫자 칸에 치던 값이 다시 그릴 때 사라지지 않도록, 그리기 전에 그 값을 먼저 적어 둔다.
    function commitActive() {
        const active = document.activeElement;
        if (root && active && root.contains(active) && active.tagName === 'INPUT' && active.type === 'number' && active.dataset.k) applyValue(active.dataset.k, active.value);
    }

    // 값이 바뀌면 한 박자 뒤에 다시 계산한다: 그때는 초점이 다음 칸으로 옮겨 가 있어서, 다시 그려도 초점이 제자리에 남는다.
    function scheduleRefresh() {
        if (refreshTimer) return;
        refreshTimer = window.setTimeout(() => {
            refreshTimer = 0;
            commitActive();
            syncHash();
            refresh();
        }, 0);
    }

    function onChange(event) {
        const target = event.target;
        const key = target && target.dataset ? target.dataset.k : null;
        if (!key || target.tagName === 'BUTTON') return;
        notice = '';
        applyValue(key, target.type === 'checkbox' ? target.checked : target.value);
        scheduleRefresh();
    }

    function onClick(event) {
        const button = event.target.closest ? event.target.closest('[data-act]') : null;
        if (!button || !root.contains(button)) return;
        const act = button.dataset.act;
        notice = '';
        commitActive();
        if (act === 'retry') { load(true, true); return; }
        if (act === 'tab') {
            if (view.tab === button.dataset.tab && !view.stops) return;
            if (view.tab === 'tour' && button.dataset.tab === 'tour') { leavePlan('[data-k="tab-tour"]'); return; } // 계획을 보다가 같은 탭을 누르면 목록으로
            stopJobs();
            view.tab = button.dataset.tab === 'mix' ? 'mix' : 'tour';
            view.stops = null;
            syncHash();
            draw();
        } else if (act === 'run-tour') {
            runTour(true);
        } else if (act === 'cancel') {
            const wasTour = Boolean(tour.job);
            stopJobs();
            if (wasTour) tour.cancelled = true;
            focusNext = wasTour ? '[data-k="run-tour"]' : '[data-k="run-mix"]';
            draw();
        } else if (act === 'open') {
            view.stops = String(button.dataset.stops || '').split(',').map(toId).filter(Boolean);
            H.writeHash(SECTION, toParams(), { push: true });
            focusNext = '[data-results]';
            draw();
        } else if (act === 'back') {
            leavePlan('[data-results]');
        } else if (act === 'copy') {
            H.copyShareUrl(SECTION, toParams()).then((ok) => {
                notice = H.text(ok ? 'copied' : 'copyFailed');
                const line = root.querySelector('[data-notice]');
                if (line) line.textContent = notice;
            });
        } else if (act === 'time-reset') {
            E.state.set({ time: {} });
            focusNext = '[data-k="time-reset"]';
        } else if (act === 'mix-mode') {
            view.mix.mode = button.dataset.mode === 'board' ? 'board' : 'empty';
            mixed.result = null;
            mixed.ran = false;
            stopJobs();
            syncHash();
            draw();
        } else if (act === 'fx-add' || act === 'cg-add') {
            const list = act === 'fx-add' ? view.mix.fixed : view.mix.cargo;
            if (list.length < 8) list.push({ c: null, scu: null, paid: null });
            focusNext = `[data-k="${act.slice(0, 2)}.${list.length - 1}.c"]`;
            draw();
        } else if (act === 'fx-del' || act === 'cg-del') {
            const list = act === 'fx-del' ? view.mix.fixed : view.mix.cargo;
            list.splice(Number(button.dataset.index), 1);
            focusNext = `[data-k="${act.slice(0, 2)}-add"]`;
            syncHash();
            refresh();
        } else if (act === 'run-mix') {
            syncHash();
            runMix(true);
        }
    }

    // 계획 화면에서 목록으로. 받은 주소로 바로 계획을 연 사람은 목록이 없으므로, 주소에 적힌 조건으로 찾기를 돌린다.
    function leavePlan(focus) {
        view.stops = null;
        if (tour.result && tour.result.chains.length) {
            syncHash();
            focusNext = focus;
            draw();
            return;
        }
        runTour(true);
    }

    function onToggle(event) {
        if (event.target && event.target.matches && event.target.matches('[data-times]')) timeOpen = event.target.open;
    }

    function route(params) {
        stopJobs();
        const before = JSON.stringify([view.tab, view.tour, view.mix]);
        applyParams(params);
        notice = '';
        // 뒤로 가기로 계획 화면에서 목록으로 돌아올 때처럼 조건이 그대로면, 찾아 둔 결과를 그대로 둔다.
        const same = before === JSON.stringify([view.tab, view.tour, view.mix]);
        if (!same) {
            tour.result = null;
            tour.ran = false;
            mixed.result = null;
            mixed.ran = false;
        }
        tour.cancelled = false;
        if (data.status !== 'ready') return;
        const kept = same && (view.tab === 'tour' ? Boolean(tour.result) || Boolean(view.stops) : Boolean(mixed.result));
        if (kept) autoRun = { tour: false, mix: false };
        draw();
        if (!data.priceError) startAuto();
    }

    window.VOLT_TOURS = {
        // 섹션이 처음 열릴 때 한 번. mount = #tours-app, ctx = { section, lang, params }
        init(mount, ctx) {
            root = mount;
            applyParams(ctx && ctx.params);
            root.addEventListener('change', onChange);
            root.addEventListener('click', onClick);
            root.addEventListener('toggle', onToggle, true);
            E.state.subscribe(() => { if (!muted && data.status === 'ready') scheduleRefresh(); });
            load(false);
        },
        // 언어가 바뀔 때마다 (init 뒤에만). 결과는 언어와 무관한 값이라 다시 그리기만 한다.
        onLanguageChange() {
            if (tour.job) tour.job.message = t('searchLegs');
            draw();
        },
        // 섹션이 다시 열리거나 주소(#tours?...)가 바뀔 때.
        onRoute(params) {
            route(params);
        },
    };
})();
