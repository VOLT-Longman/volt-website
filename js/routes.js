/**
 * VOLT 무역 경로 (#routes) — 내 함선과 가진 돈으로 "어디서 사서 어디에 팔까"를 찾는 화면.
 *
 * 계산은 전부 js/trade-engine.js (window.VOLT_TRADE_ENGINE)가 한다. 이 파일은 고른 값을 넘기고 결과를 보여 줄 뿐이다.
 * 계약: docs/helper-tools.md, 계산 설명: docs/trade-engine.md
 *
 * 공개 형태: window.VOLT_ROUTES = { init(mount, ctx), onLanguageChange(lang), onRoute(params) }
 *
 * 주소(#routes?...) 값 — 화면을 그대로 공유할 수 있는 것만 넣는다.
 *   c      상품 (UEX 상품 id)            ← 다른 화면이 보내는 값
 *   from   사는 곳 (UEX 터미널 id)        ← 다른 화면이 보내는 값
 *   to     파는 곳 (UEX 터미널 id)        ← 다른 화면이 보내는 값
 *   d      열어 둔 경로 "사는곳.파는곳" (예: d=1.12). d=0 은 "사는 곳·파는 곳을 둘 다 골랐지만 자세히는 닫아 둠".
 *          (다른 화면이 from·to 만 보내면 d 가 없으므로 그 경로를 바로 연다.)
 *   sort   perHour(기본) | profit | margin | roi
 *   st=1   정거장만 · full=1 가득 싣는 경로만 · fresh=1 24시간 안에 보고된 가격만
 *   "이 화면 주소 복사"로 만든 주소에만 붙는 값 — 받은 사람이 같은 숫자를 보도록 보낸 사람의 조건을 싣는다.
 *   받은 사람의 저장된 함선·예산은 바꾸지 않고, 그 주소를 보는 동안만 덮어 보여 준다.
 *     ship 함선 id · b 예산 · sys 항성계 · age 가격 기준일 · bx 상자 크기(점으로 구분) · tm 바꾼 시간 설정 · cap 직접 넣은 화물칸
 *     g 상품 가짓수 · il=1 불법 포함 · rt=0 돌아오는 길 끔 · af=1 가득 찬 판매처 빼기
 *
 * 저장 (이 브라우저 안에만, 밖으로 나가지 않는다)
 *   내 함선 · 예산 · 항성계 · 가격 기준일 · 시간 설정 · 상자 크기 → VOLT_TRADE_ENGINE.state (공용 키)
 *   volt-routes-prefs-v1     이 화면의 옵션(상품 가짓수, 합법만, 돌아오는 길, 가득 찬 판매처 빼기, 숨긴 상품, 직접 넣은 화물칸)
 *   volt-routes-steps-v1     경로별 "했어요" 표시
 *   volt-routes-myprices-v1  "내 터미널에는 다른 값이 보여요"로 적어 둔 가격
 *
 * HTML은 paint() 한 곳에서만 넣고, 바뀌는 값은 모두 esc()를 거친다. 화면은 구역으로 나뉘어 있고, 내용이 바뀐 구역만 다시 그린다.
 */
(function () {
    'use strict';

    const H = window.VOLT_HELPER;
    const E = window.VOLT_TRADE_ENGINE;
    const SECTION = 'routes';
    const PREF_KEY = 'volt-routes-prefs-v1';
    const STEP_KEY = 'volt-routes-steps-v1';
    const PRICE_KEY = 'volt-routes-myprices-v1';
    const PAGE = window.matchMedia('(max-width: 700px)').matches ? 10 : 20;
    const FRESH_DAYS = 1;
    const MY_PRICE_KEEP_DAYS = 30;
    const AGE_CHOICES = [0.25, 1, 3, 7, 15, 30];
    const SORTS = ['perHour', 'profit', 'margin', 'roi'];
    const TIME_KEYS = ['takeoffSeconds', 'landingSeconds', 'atmosphereSeconds', 'terminalSeconds', 'manualBaseSeconds', 'manualBoxSeconds', 'sameBodySeconds', 'jumpSeconds'];
    const PREF_DEFAULTS = { goods: 1, legalOnly: true, returnTrip: true, avoidFull: false, hidden: [], capacityScu: null };

    const TEXT = {
        ko: {
            loading: '자료를 불러오는 중입니다…',
            pricesLoading: '가격을 불러오는 중입니다…',
            retry: '다시 시도',
            refresh: '가격 새로 받기',
            contextTitle: '내 조건',
            contextNote: '여기서 고른 함선·예산·항성계·가격 기준은 다른 무역 화면에서도 함께 쓰이고, 이 브라우저에만 저장됩니다.',
            ship: '내 함선',
            shipNone: '함선을 고르세요',
            shipGroupCargo: '화물칸이 있는 함선',
            shipGroupUnknown: '화물칸 크기가 게임 자료에 없는 함선',
            shipGroupOther: '지금 고른 함선',
            shipInfo: '함선 DB로 이동',
            holdLine: '쓸 수 있는 화물칸 {use} / 게임 자료 {total} · 가장 큰 상자 {box} SCU',
            holdTyped: '직접 넣은 화물칸 {use} 기준으로 계산합니다 (칸 모양과 상자 크기 제한은 반영하지 않음)',
            holdUnknown: '이 함선의 화물칸 크기는 게임 자료에 없습니다. 아래에 직접 넣으면 계산할 수 있습니다.',
            holdNone: '이 함선은 기본 장착에 화물칸이 없거나, 켜 둔 상자 크기가 하나도 들어가지 않습니다.',
            holdPick: '함선을 고르면 실을 수 있는 양을 보여 줍니다.',
            noDrive: '이 함선은 기본 장착에 퀀텀 드라이브가 없어 비행 시간을 계산할 수 없습니다.',
            capacity: '화물칸 직접 넣기 (SCU, 비워 두면 게임 자료)',
            budget: '쓸 수 있는 돈 (aUEC)',
            budgetHint: '예: 500k, 2m, 200만. 비워 두면 돈으로 수량을 줄이지 않습니다.',
            budgetNone: '정하지 않음 — 돈으로 수량을 줄이지 않습니다',
            budgetBad: '읽을 수 없는 값입니다. 숫자나 500k, 2m처럼 적어 주세요.',
            capacityBad: '읽을 수 없는 값이라 게임 자료의 화물칸으로 계산합니다. 1 이상의 숫자로 적어 주세요.',
            system: '항성계',
            systemAll: '전체',
            options: '옵션',
            goods: '한 곳에서 싣는 상품 가짓수',
            goodsN: '{n}가지',
            legalOnly: '합법 상품만 (합법 여부를 모르는 상품도 뺌)',
            returnTrip: '돌아오는 길도 계산',
            avoidFull: '가득 찼다고 보고된 판매처 빼기',
            age: '가격 보고를 언제 것까지 쓸지',
            ageHours: '{n}시간 이내',
            ageDays: '{n}일 이내',
            ageDefault: '(기본)',
            boxes: '다룰 상자 크기 (SCU)',
            boxesNote: '끈 크기의 상자는 싣지 않습니다.',
            filterTitle: '경로 좁히기',
            good: '상품',
            goodAll: '모든 상품',
            from: '사는 곳',
            to: '파는 곳',
            anywhere: '어디든',
            stationsOnly: '정거장만 (도시·전초기지 제외)',
            fullOnly: '화물칸을 가득 채우는 경로만',
            freshOnly: '최근 보고만 (24시간 이내)',
            sort: '줄 세우기',
            sort_perHour: '시간당 이익',
            sort_profit: '한 번 이익',
            sort_margin: 'SCU당 이익',
            sort_roi: '투자 대비 이익',
            clearFilters: '좁히기 지우기',
            hidden: '숨긴 상품',
            hiddenNote: '숨긴 상품은 모든 계산에서 빠집니다. 누르면 다시 보입니다.',
            unhide: '{name} 다시 보이기',
            hide: '{name} 숨기기',
            hideTitle: '{name}: 모든 경로에서 숨기고 다시 계산',
            count: '경로 {total}개 가운데 {shown}개를 보여 줍니다.',
            countRound: '돌아오는 길을 켜 두어 왕복 기준으로 줄을 세웠습니다.',
            statOld: '기준보다 오래된 가격 보고 {n}건은 쓰지 않았습니다.',
            statAgeUnknown: '보고 시각을 모르는 가격 {n}건은 쓰지 않았습니다.',
            statSoldOut: '품절로 보고된 곳 {n}건은 뺐습니다.',
            statIllegal: '불법이거나 합법 여부를 모르는 조합 {n}개는 뺐습니다.',
            statFull: '가득 찼다고 보고된 판매처 {n}건은 뺐습니다.',
            statNoTime: '시간을 계산할 수 없는 경로 {n}개는 맨 아래에 둡니다.',
            showIllegal: '불법 상품도 보기',
            more: '{n}개 더 보기',
            empty: '조건에 맞는 경로가 없습니다. 좁히기를 지우거나 가격 기준을 늘려 보세요.',
            emptyBudget: '쓸 수 있는 돈이 0이라 아무것도 살 수 없습니다. 예산 칸을 비우면 돈으로 수량을 줄이지 않습니다.',
            legalOff: '상품 이름과 합법 여부를 받아 오지 못해 "합법 상품만"을 적용할 수 없습니다. 지금은 모든 상품을 보여 주고 "합법 여부 모름"으로 표시합니다.',
            namesRetry: '상품 이름 다시 받기',
            refreshFailed: '가격을 새로 받지 못해 앞서 받은 가격을 그대로 보여 줍니다.',
            login: 'Discord 로그인',
            hintWait: '계산 중…',
            mineTitle: '내가 넣은 가격',
            mineNote: '이 가격은 UEX 보고 대신 내가 적은 값으로 계산합니다. 누르면 지워지고 UEX 보고로 돌아갑니다.',
            mineBuy: '{good} · {place} 사는 값 {p}',
            mineSell: '{good} · {place} 파는 값 {p}',
            mineRemove: '내가 넣은 가격 지우기: {label}',
            mineLoss: '내가 넣은 가격으로 계산하면 이 경로에는 남는 이익이 없습니다. 값을 잘못 적었다면 아래에서 지울 수 있습니다.',
            linkBanner: '받은 주소에 들어 있는 조건({what})으로 계산한 화면입니다. 내 함선과 예산은 바뀌지 않았고, 이 조건은 여기서 고칠 수 없습니다.',
            linkDrop: '내 조건으로 보기',
            shareNote: '주소에는 지금 고른 함선·예산·옵션이 함께 들어갑니다.',
            pickOne: '싣는 상품은 이 구간에서 한 가지만 실었을 때 이익이 가장 큰 것으로 골랐습니다. SCU당 이익이 가장 큰 상품과 다를 수 있습니다.',
            pickMany: '여러 가지를 실을 때는 "한 가지씩 실었을 때 이익이 큰 상품들"과 "SCU당 이익이 큰 상품들"을 각각 실어 보고 더 많이 남는 쪽을 보여 줍니다. 가능한 모든 조합을 따져 본 것은 아닙니다.',
            emptyNoPrices: '받아 온 가격 보고가 없습니다.',
            needShip: '먼저 위에서 내 함선을 골라 주세요. 함선의 화물칸 크기에 맞춰 경로를 계산합니다.',
            unknownShip: '고른 함선이 화물 자료에 없습니다. 다른 함선을 골라 주세요.',
            colRank: '순위',
            colRoute: '사는 곳 → 파는 곳',
            colCargo: '싣는 화물',
            colProfit: '이익 (aUEC)',
            colTime: '걸리는 시간',
            colPerHour: '시간당 이익 (aUEC)',
            colReturn: '돌아오는 길',
            colBest: '가장 잘 맞는 함선',
            estimate: '추정',
            fill: '화물칸 {q} / {cap} SCU',
            open: '자세히',
            openLabel: '{from}에서 {to}까지 경로 자세히 보기',
            timeUnknown: '계산할 수 없음',
            backEmpty: '빈 배로 돌아옴',
            backLoad: '{goods} · 이익 +{profit}',
            roundPerHour: '왕복 시간당 {v}',
            bestMine: '내 함선이 잘 맞습니다',
            bestOther: '{ship} · 시간당 {v} (+{p}%)',
            bestNone: '비교할 수 없음',
            detailTitle: '경로 자세히',
            close: '목록으로 돌아가기',
            share: '이 화면 주소 복사',
            illegalTag: '불법',
            legalUnknownTag: '합법 여부 모름',
            illegalNote: '이 경로에는 불법으로 정해진 상품이 있습니다 (게임 자료의 관할 규칙 기준).',
            routeGone: '이 경로의 거래소를 가격 자료에서 찾을 수 없습니다.',
            nothingToCarry: '지금 조건으로는 이 경로에 실을 상품이 없습니다. 가격 기준, 합법 옵션, 예산을 확인해 보세요. 비행 시간은 아래에 그대로 보여 줍니다.',
            cardProfit: '이익',
            cardInvest: '드는 돈',
            cardTime: '걸리는 시간',
            perHour: '시간당 {v}',
            lineGood: '{name} {q} × SCU당 {m}',
            whyShip: '화물칸이 꽉 찰 만큼 실었습니다.',
            whyStock: '보고된 재고가 {n}뿐이라 그만큼만 삽니다.',
            whyBudget: '가진 돈으로 {n}까지 살 수 있습니다.',
            whyBoxes: '상자 크기가 맞지 않아 {n}만 실립니다.',
            whyDestination: '도착지가 {n}까지만 받습니다.',
            whyGoods: '한 곳에서 {n}가지 상품까지 싣도록 되어 있습니다.',
            changeBudget: '예산 바꾸기',
            changeGoods: '상품 가짓수 바꾸기',
            changeBoxes: '상자 크기 바꾸기',
            changeShip: '함선 바꾸기',
            changeTime: '시간 설정 바꾸기',
            investUse: '예산 {b} 가운데 {u} 사용, 남는 돈 {l}.',
            investNoBudget: '예산을 정하지 않아 돈으로 수량을 줄이지 않았습니다.',
            roi: '쓴 돈 대비 이익 {p}',
            partFlight: '비행',
            partHandling: '싣고 내리기',
            partGround: '뜨고 내리기 · 터미널',
            flightQuantum: '퀀텀 비행 약 {d}. 드라이브 수치로 계산하면 {a}~{b} 사이입니다.',
            flightQuantumOne: '퀀텀 비행 약 {d}. 드라이브 수치로 계산한 시간은 약 {a}입니다.',
            flightJump: '다른 항성계: 게이트웨이까지 퀀텀 비행 두 번(약 {d}), 여기에 점프 시간 {j} 추가.',
            flightSameBody: '같은 행성·위성 안의 이동이라 우리가 정한 기본값({v})으로 계산합니다.',
            flightSamePlace: '같은 곳에 있는 터미널이라 비행이 없습니다.',
            flightNoPosition: '이 거래소의 위치가 게임 자료에 없어 비행 시간을 계산할 수 없습니다.',
            flightNoDrive: '함선에 퀀텀 드라이브가 없어 비행 시간을 계산할 수 없습니다.',
            flightNoGateway: '두 항성계를 잇는 게이트웨이를 게임 자료에서 찾지 못했습니다.',
            flightUnknown: '비행 시간을 계산할 수 없습니다.',
            loadAuto: '{where}: 자동 적재가 보고된 곳이라 게임 파일의 자동 적재 시간 {v}.',
            loadManualSetting: '{where}: 항상 손으로 싣도록 설정해서 준비 {b} + 상자 {n}개 × {s} = {v}.',
            loadManual: '{where}: 자동 적재 보고가 없어 손으로 — 준비 {b} + 상자 {n}개 × {s} = {v}.',
            loadManualMissing: '{where}: 자동 적재 시간이 게임 자료에 없어 손으로 — 준비 {b} + 상자 {n}개 × {s} = {v}.',
            whereLoad: '싣기',
            whereUnload: '내리기',
            groundLine: '출발 {d} + 도착 {a} + 사고팔기 {t}. 지표면에 있는 곳은 뜨고 내릴 때마다 {atm}씩 더합니다. 모두 우리가 정한 기본값입니다.',
            planTitle: '사고 · 날고 · 파는 순서',
            planNote: '표시는 이 브라우저에만 저장됩니다.',
            planDone: '{done} / {all} 완료',
            planClear: '표시 지우기',
            stepBuy: '{place}에서 삽니다',
            stepLoad: '화물을 싣습니다 (상자 {n}개)',
            stepFly: '{place}까지 갑니다',
            stepSell: '{place}에서 팝니다',
            stepBackFly: '빈 배로 {place}까지 돌아갑니다',
            stepBackBuy: '돌아오는 길: {place}에서 삽니다',
            stepBackSell: '돌아오는 길: {place}에서 팝니다',
            buyLine: '{name} {q} · SCU당 {p} · 합계 {sum}',
            sellLine: '{name} {q} · SCU당 {p} · 합계 {sum}',
            boxLine: '상자: {list}',
            boxItem: '{scu} SCU × {n}',
            boxesAssumed: '상자 크기 보고가 없어 가정한 값',
            loadAutoShort: '자동 적재 약 {v}',
            loadManualShort: '손으로 약 {v}',
            flyShort: '비행 약 {v}',
            flyUnknown: '비행 시간은 계산할 수 없음',
            destFull: '이 판매처는 가득 찼다고 보고되었습니다. 다 못 팔 수 있습니다.',
            destLevel: '판매처 채워진 정도 {n}/7 (보고)',
            destUnknown: '판매처가 몇 SCU까지 받아 주는지는 자료에 없습니다.',
            stockUnknown: '재고 보고 없음',
            stockLine: '보고된 재고 {n}',
            pricesTitle: '이 계산에 쓴 가격',
            colGood: '상품',
            colBuy: '사는 값 (SCU당)',
            colSell: '파는 값 (SCU당)',
            colQty: '수량',
            colLegal: '합법 여부',
            legalYes: '합법',
            legalNo: '불법',
            legalUnknown: '모름',
            legalUex: 'UEX 표시 기준',
            mine: '내가 본 값',
            diffPrice: '내 터미널에는 다른 값이 보여요',
            diffTitle: '{name} 가격 직접 넣기',
            diffNote: '넣은 값은 이 브라우저에만 저장되고, 지금 본 값으로 계산에 씁니다. UEX에 더 새로운 보고가 올라오면 그 보고를 씁니다.',
            diffBuy: '{place}에서 사는 값 (aUEC/SCU)',
            diffSell: '{place}에서 파는 값 (aUEC/SCU)',
            save: '저장',
            cancel: '취소',
            diffClear: '내 값 지우기',
            diffBad: '숫자로 적어 주세요.',
            fuelTitle: '퀀텀 연료',
            fuelLine: '이 비행에 {need} · 연료통 {tank}',
            fuelRound: '왕복하면 {need}',
            fuelOk: '충분합니다',
            fuelShort: '모자랍니다 — 도중에 급유가 필요합니다',
            fuelTankUnknown: '연료통 크기가 게임 자료에 없어 충분한지 알 수 없습니다',
            fuelUnknown: '이 경로의 연료 사용량은 계산할 수 없습니다.',
            fuelUnit: 'SCU',
            fuelTiny: '0.01 {unit} 미만',
            fuelAbout: '약 {v} {unit}',
            compareTitle: '같은 경로를 다른 함선으로',
            compareNote: '같은 예산과 옵션으로 화물칸이 있는 모든 함선을 계산했습니다. 살 수 있는 함선인지는 따지지 않았습니다.',
            colShip: '함선',
            colHold: '화물칸',
            colInvest: '드는 돈',
            useShip: '내 함선으로',
            myShip: '내 함선',
            compareAll: '함선 {n}개 모두 보기',
            compareLess: '위쪽만 보기',
            compareUnknown: '화물칸 크기가 게임 자료에 없어 뺀 함선: {list}',
            compareEmpty: '이 경로로 화물을 실을 수 있는 함선이 없습니다.',
            nextTitle: '도착한 뒤 이어 갈 경로',
            nextNote: '{place}에서 사서 다른 곳에 파는 경로입니다. 번 돈은 더하지 않고 지금 예산 그대로 계산했습니다.',
            nextEmpty: '도착지에서 사서 이익이 남는 경로를 찾지 못했습니다.',
            nextHome: '출발지로 돌아감',
            nextCloser: '출발지에 가까워짐',
            nextAway: '출발지에서 멀어짐',
            assumeTitle: '이 계산이 가정한 것',
            feeLine: '자동 적재 수수료 {v}(게임 파일 값, 단위 확인 안 됨)는 이익에서 빼지 않았습니다.',
            handoffTitle: '다른 화면에서 이어 보기',
            toMarketGood: '{name} 시세 보기',
            toMarketFrom: '사는 곳 거래소 정보',
            toMarketTo: '파는 곳 거래소 정보',
            toTours: '순회 무역에서 이어 짜기',
            toHauling: '운송 계약 보기',
            timeTitle: '시간 설정',
            timeNote: '아래 값은 게임 파일에 없어서 우리가 정한 기본값입니다. 내 플레이에 맞게 바꾸면 모든 무역 화면의 시간이 함께 바뀝니다. 자동 적재 시간과 퀀텀 비행은 게임 파일 수치로 계산한 추정입니다.',
            timeLoading: '싣고 내리는 방법',
            timeLoadingAuto: '자동 적재가 보고된 곳에서는 자동으로',
            timeLoadingManual: '항상 손으로',
            timeDefault: '기본값 {n}초',
            timeReset: '기본값으로 되돌리기',
            seconds: '초',
            t_takeoffSeconds: '출발: 함선에 타서 퀀텀 준비까지',
            t_landingSeconds: '도착: 퀀텀이 끝난 뒤 착륙·도킹까지',
            t_atmosphereSeconds: '지표면에 있는 곳에서 뜨고 내릴 때 더하는 시간',
            t_terminalSeconds: '터미널에서 한 번 사거나 파는 시간',
            t_manualBaseSeconds: '손으로 싣거나 내릴 때 준비 시간',
            t_manualBoxSeconds: '손으로 옮길 때 상자 하나에 드는 시간',
            t_sameBodySeconds: '같은 행성·위성 안의 두 곳 사이 이동',
            t_jumpSeconds: '점프 포인트를 지나는 시간',
            namesMissing: '상품 이름을 받아 오지 못해 번호로 보여 줍니다. 합법 여부도 알 수 없습니다.',
            goodNumber: '상품 {id}번',
            estimateNote: '이익과 시간은 모두 추정입니다. 가격은 UEX 이용자 보고이고, 보고가 얼마나 오래됐는지는 가격 옆에 적었습니다.',
        },
        en: {
            loading: 'Loading data…',
            pricesLoading: 'Loading prices…',
            retry: 'Try again',
            refresh: 'Fetch prices again',
            contextTitle: 'My settings',
            contextNote: 'The ship, budget, system and price age chosen here are shared with the other trade screens and stored only in this browser.',
            ship: 'My ship',
            shipNone: 'Choose a ship',
            shipGroupCargo: 'Ships with a cargo hold',
            shipGroupUnknown: 'Ships whose hold size is not in the game files',
            shipGroupOther: 'Currently chosen',
            shipInfo: 'Go to the ship database',
            holdLine: 'Usable hold {use} / game data {total} · largest box {box} SCU',
            holdTyped: 'Calculated with the hold size you typed, {use} (grid shape and box limits are not considered)',
            holdUnknown: 'The hold size of this ship is not in the game files. Type it in below to calculate.',
            holdNone: 'This ship has no cargo grid in its default loadout, or none of the enabled box sizes fits.',
            holdPick: 'Choose a ship to see how much it can carry.',
            noDrive: 'This ship has no quantum drive in its default loadout, so flight time cannot be calculated.',
            capacity: 'Type in hold size (SCU, empty = game data)',
            budget: 'Money to spend (aUEC)',
            budgetHint: 'For example 500k, 2m. Leave empty to not limit quantities by money.',
            budgetNone: 'Not set — quantities are not limited by money',
            budgetBad: 'That value could not be read. Use a number, or shorthand like 500k or 2m.',
            capacityBad: 'That value could not be read, so the hold size from the game files is used. Type a number of 1 or more.',
            system: 'Star system',
            systemAll: 'All',
            options: 'Options',
            goods: 'Goods loaded per stop',
            goodsN: '{n}',
            legalOnly: 'Legal goods only (also leaves out goods of unknown legality)',
            returnTrip: 'Also work out the trip back',
            avoidFull: 'Leave out sell places reported full',
            age: 'Use price reports up to',
            ageHours: '{n} hours old',
            ageDays: '{n} days old',
            ageDefault: '(default)',
            boxes: 'Box sizes I handle (SCU)',
            boxesNote: 'Sizes switched off are not loaded.',
            filterTitle: 'Narrow the routes',
            good: 'Good',
            goodAll: 'All goods',
            from: 'Buy at',
            to: 'Sell at',
            anywhere: 'Anywhere',
            stationsOnly: 'Stations only (no cities or outposts)',
            fullOnly: 'Only routes that fill the hold',
            freshOnly: 'Recently reported only (within 24 hours)',
            sort: 'Order by',
            sort_perHour: 'Profit per hour',
            sort_profit: 'Profit per trip',
            sort_margin: 'Profit per SCU',
            sort_roi: 'Return on money spent',
            clearFilters: 'Clear filters',
            hidden: 'Hidden goods',
            hiddenNote: 'Hidden goods are left out of every calculation. Press one to show it again.',
            unhide: 'Show {name} again',
            hide: 'Hide {name}',
            hideTitle: 'Hide {name} on every route and recalculate',
            count: 'Showing {shown} of {total} routes.',
            countRound: 'The trip back is on, so routes are ordered by the round trip.',
            statOld: '{n} price reports older than the cut-off were not used.',
            statAgeUnknown: '{n} prices with no report time were not used.',
            statSoldOut: '{n} places reported sold out were left out.',
            statIllegal: '{n} combinations that are illegal or of unknown legality were left out.',
            statFull: '{n} sell places reported full were left out.',
            statNoTime: '{n} routes whose time cannot be calculated are listed last.',
            showIllegal: 'Show illegal goods too',
            more: 'Show {n} more',
            empty: 'No route matches. Clear the filters or allow older price reports.',
            emptyBudget: 'Your money to spend is 0, so nothing can be bought. Leave the budget empty to not limit quantities by money.',
            legalOff: 'Good names and legality could not be fetched, so "Legal goods only" cannot be applied. All goods are shown for now and marked "Legality unknown".',
            namesRetry: 'Fetch good names again',
            refreshFailed: 'Prices could not be fetched again, so the prices received earlier are still shown.',
            login: 'Log in with Discord',
            hintWait: 'Working it out…',
            mineTitle: 'Prices I typed in',
            mineNote: 'These prices are used instead of the UEX report. Press one to remove it and go back to the UEX report.',
            mineBuy: '{good} · {place} buy price {p}',
            mineSell: '{good} · {place} sell price {p}',
            mineRemove: 'Remove the price I typed in: {label}',
            mineLoss: 'With the prices you typed in, this route leaves no profit. If a value was mistyped, remove it below.',
            linkBanner: 'This view is calculated with the setup in the link you opened ({what}). Your own ship and budget are unchanged, and this setup cannot be edited here.',
            linkDrop: 'Use my own setup',
            shareNote: 'The link includes the ship, budget and options chosen now.',
            pickOne: 'The good loaded is the one that earns most on this leg when carried alone. It can differ from the good with the highest profit per SCU.',
            pickMany: 'With several goods per stop, two loads are tried — the goods that earn most alone, and the goods with the highest profit per SCU — and the better one is shown. Not every possible mix is tried.',
            emptyNoPrices: 'No price reports were received.',
            needShip: 'Choose your ship above first. Routes are calculated for the hold of that ship.',
            unknownShip: 'The chosen ship is not in the cargo data. Please choose another ship.',
            colRank: 'Rank',
            colRoute: 'Buy at → sell at',
            colCargo: 'Cargo',
            colProfit: 'Profit (aUEC)',
            colTime: 'Time',
            colPerHour: 'Profit per hour (aUEC)',
            colReturn: 'Trip back',
            colBest: 'Best-fitting ship',
            estimate: 'estimate',
            fill: 'Hold {q} / {cap} SCU',
            open: 'Details',
            openLabel: 'Open route details from {from} to {to}',
            timeUnknown: 'Cannot be calculated',
            backEmpty: 'Flies back empty',
            backLoad: '{goods} · profit +{profit}',
            roundPerHour: 'Round trip {v} per hour',
            bestMine: 'Your ship fits well',
            bestOther: '{ship} · {v} per hour (+{p}%)',
            bestNone: 'Cannot be compared',
            detailTitle: 'Route details',
            close: 'Back to the list',
            share: 'Copy link to this view',
            illegalTag: 'Illegal',
            legalUnknownTag: 'Legality unknown',
            illegalNote: 'This route carries a good that is illegal (jurisdiction rules in the game files).',
            routeGone: 'The terminals of this route are not in the price data.',
            nothingToCarry: 'With the current setup there is nothing to carry on this route. Check the price age, the legal option and the budget. The flight time is still shown below.',
            cardProfit: 'Profit',
            cardInvest: 'Money needed',
            cardTime: 'Time',
            perHour: '{v} per hour',
            lineGood: '{name} {q} × {m} per SCU',
            whyShip: 'Loaded until the hold is full.',
            whyStock: 'Reported stock is only {n}, so that is all you buy.',
            whyBudget: 'Your money buys up to {n}.',
            whyBoxes: 'Because of the box sizes only {n} fits.',
            whyDestination: 'The destination takes only {n}.',
            whyGoods: 'Set to load up to {n} goods per stop.',
            changeBudget: 'Change budget',
            changeGoods: 'Change goods per stop',
            changeBoxes: 'Change box sizes',
            changeShip: 'Change ship',
            changeTime: 'Change time settings',
            investUse: 'Uses {u} of your {b} budget, {l} left.',
            investNoBudget: 'No budget set, so quantities are not limited by money.',
            roi: 'Profit is {p} of the money spent',
            partFlight: 'Flight',
            partHandling: 'Loading and unloading',
            partGround: 'Take-off, landing, terminal',
            flightQuantum: 'Quantum flight of about {d}. The drive values give between {a} and {b}.',
            flightQuantumOne: 'Quantum flight of about {d}. The drive values give about {a}.',
            flightJump: 'Other system: two quantum flights to and from the gateways (about {d}) plus {j} for the jump.',
            flightSameBody: 'Both places are on the same planet or moon, so our default guess of {v} is used.',
            flightSamePlace: 'Both terminals are at the same place, so there is no flight.',
            flightNoPosition: 'The position of this terminal is not in the game files, so flight time cannot be calculated.',
            flightNoDrive: 'The ship has no quantum drive, so flight time cannot be calculated.',
            flightNoGateway: 'No gateway between the two systems was found in the game files.',
            flightUnknown: 'Flight time cannot be calculated.',
            loadAuto: '{where}: auto-loading is reported here, so the auto-loading time from the game files, {v}.',
            loadManualSetting: '{where}: set to always load by hand — {b} preparation + {n} boxes × {s} = {v}.',
            loadManual: '{where}: no auto-loading reported, so by hand — {b} preparation + {n} boxes × {s} = {v}.',
            loadManualMissing: '{where}: auto-loading time is not in the game files, so by hand — {b} preparation + {n} boxes × {s} = {v}.',
            whereLoad: 'Loading',
            whereUnload: 'Unloading',
            groundLine: 'Departure {d} + arrival {a} + buying and selling {t}. Places on a surface add {atm} per take-off or landing. All of these are our own default guesses.',
            planTitle: 'Buy, fly, sell — step by step',
            planNote: 'Ticks are stored only in this browser.',
            planDone: '{done} of {all} done',
            planClear: 'Clear ticks',
            stepBuy: 'Buy at {place}',
            stepLoad: 'Load the cargo ({n} boxes)',
            stepFly: 'Fly to {place}',
            stepSell: 'Sell at {place}',
            stepBackFly: 'Fly back empty to {place}',
            stepBackBuy: 'Trip back: buy at {place}',
            stepBackSell: 'Trip back: sell at {place}',
            buyLine: '{name} {q} · {p} per SCU · total {sum}',
            sellLine: '{name} {q} · {p} per SCU · total {sum}',
            boxLine: 'Boxes: {list}',
            boxItem: '{scu} SCU × {n}',
            boxesAssumed: 'box sizes not reported, assumed',
            loadAutoShort: 'auto-loading about {v}',
            loadManualShort: 'by hand about {v}',
            flyShort: 'flight about {v}',
            flyUnknown: 'flight time cannot be calculated',
            destFull: 'This sell place is reported full. You may not be able to sell everything.',
            destLevel: 'Sell place fill level {n}/7 (reported)',
            destUnknown: 'How many SCU the sell place will take is not in the data.',
            stockUnknown: 'stock not reported',
            stockLine: 'reported stock {n}',
            pricesTitle: 'Prices used in this calculation',
            colGood: 'Good',
            colBuy: 'Buy price (per SCU)',
            colSell: 'Sell price (per SCU)',
            colQty: 'Quantity',
            colLegal: 'Legality',
            legalYes: 'Legal',
            legalNo: 'Illegal',
            legalUnknown: 'Unknown',
            legalUex: 'by the UEX flag',
            mine: 'my value',
            diffPrice: 'My terminal shows a different price',
            diffTitle: 'Type in the price of {name}',
            diffNote: 'The value is stored only in this browser and used as seen just now. When UEX gets a newer report, that report is used.',
            diffBuy: 'Buy price at {place} (aUEC/SCU)',
            diffSell: 'Sell price at {place} (aUEC/SCU)',
            save: 'Save',
            cancel: 'Cancel',
            diffClear: 'Remove my value',
            diffBad: 'Please type a number.',
            fuelTitle: 'Quantum fuel',
            fuelLine: 'This flight needs {need} · tank {tank}',
            fuelRound: 'Round trip {need}',
            fuelOk: 'enough',
            fuelShort: 'not enough — refuel on the way',
            fuelTankUnknown: 'the tank size is not in the game files, so it is unknown whether it is enough',
            fuelUnknown: 'Fuel use on this route cannot be calculated.',
            fuelUnit: 'SCU',
            fuelTiny: 'less than 0.01 {unit}',
            fuelAbout: 'about {v} {unit}',
            compareTitle: 'The same route with other ships',
            compareNote: 'Every ship with a hold, with the same budget and options. Whether a ship can be bought is not considered.',
            colShip: 'Ship',
            colHold: 'Hold',
            colInvest: 'Money needed',
            useShip: 'Use as my ship',
            myShip: 'my ship',
            compareAll: 'Show all {n} ships',
            compareLess: 'Show top only',
            compareUnknown: 'Left out because the hold size is not in the game files: {list}',
            compareEmpty: 'No ship can carry cargo on this route.',
            nextTitle: 'Where to go after arriving',
            nextNote: 'Routes that buy at {place} and sell elsewhere. Calculated with your current budget, without the profit just made.',
            nextEmpty: 'No profitable route starting at the destination was found.',
            nextHome: 'back to the start',
            nextCloser: 'closer to the start',
            nextAway: 'further from the start',
            assumeTitle: 'What this calculation assumes',
            feeLine: 'The auto-loading fee (game file value, unit not confirmed) of {v} is not subtracted from the profit.',
            handoffTitle: 'Continue on another screen',
            toMarketGood: '{name} prices',
            toMarketFrom: 'Buy place details',
            toMarketTo: 'Sell place details',
            toTours: 'Extend in Multi-stop Tours',
            toHauling: 'Hauling contracts',
            timeTitle: 'Time settings',
            timeNote: 'The values below are not in the game files; they are our own default guesses. Change them to match how you play and the times on every trade screen follow. Auto-loading and quantum flight times are estimates calculated from game file values.',
            timeLoading: 'How cargo is loaded',
            timeLoadingAuto: 'Automatically where auto-loading is reported',
            timeLoadingManual: 'Always by hand',
            timeDefault: 'default {n} s',
            timeReset: 'Back to the defaults',
            seconds: 's',
            t_takeoffSeconds: 'Departure: boarding to quantum-ready',
            t_landingSeconds: 'Arrival: end of quantum to landed or docked',
            t_atmosphereSeconds: 'Extra per take-off or landing at a place on a surface',
            t_terminalSeconds: 'One buy or one sell at the terminal',
            t_manualBaseSeconds: 'Preparation when loading or unloading by hand',
            t_manualBoxSeconds: 'Per box when moving by hand',
            t_sameBodySeconds: 'Between two places on the same planet or moon',
            t_jumpSeconds: 'Passing a jump point',
            namesMissing: 'Good names could not be fetched, so numbers are shown. Legality is unknown too.',
            goodNumber: 'Good no. {id}',
            estimateNote: 'Profit and time are estimates. Prices are UEX player reports; the age of each report is shown next to the price.',
        },
    };
    const t = H.translator(TEXT);
    const esc = H.esc;

    // ── 상태 ────────────────────────────────────────────────────────────────
    let root = null;
    let shell = null;            // 화면 구역들 (buildShell)
    let model = null;
    let modelRev = 0;            // 모델을 새로 만들 때마다 올린다 (계산 캐시 열쇠)
    let appliedMine = new Set();
    let hiddenNames = new Map(); // 숨긴 상품의 이름 (모델에서는 빠져 있으므로 따로 둔다)
    let drawTimer = 0;
    let focusAfterDraw = '';     // id 하나 또는 id 목록 — 앞에서부터 화면에 있는 것에 초점을 둔다
    let scrollAfterDraw = null;  // { detail: true } | { list: 저장해 둔 스크롤 위치 또는 null }
    let listScroll = null;       // 자세히를 열기 전 목록의 스크롤 위치
    let linkSetup = null;        // 받은 주소에 들어 있는 조건 (내 조건을 바꾸지 않고 덮어 보여 준다)
    let rankCache = null;
    let detailCache = null;
    let listKey = '';
    let hintSig = '';
    let hintTimer = 0;
    const hints = new Map();
    const emptyLegs = new Map();
    const painted = new WeakMap();
    const data = {
        game: 'loading', gameError: null, cargo: null, world: null, bodyById: new Map(), bodyByName: new Map(),
        prices: 'loading', priceError: null, market: [], terminals: [], commodities: null, names: 'loading', meta: null,
    };
    const view = { c: null, from: null, to: null, sort: 'perHour', st: false, full: false, fresh: false, d: null, limit: PAGE };
    const ui = { contextOpen: false, filtersOpen: false, optionsOpen: false, timeOpen: false, compareAll: false, edit: null, editError: false, budgetError: false, capacityError: false, notice: '', refreshing: false, refreshError: null };
    let prefs = { ...PREF_DEFAULTS };
    let steps = {};
    let myPrices = {};

    // ── 이 브라우저에만 두는 값 ─────────────────────────────────────────────
    function readStore(key) {
        try {
            const value = JSON.parse(window.localStorage.getItem(key) || 'null');
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch (_error) {
            return {};
        }
    }

    function writeStore(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (_error) { /* 저장을 막아 둔 브라우저: 이번 방문 동안만 기억한다 */ }
    }

    function loadLocal() {
        const raw = readStore(PREF_KEY);
        prefs = {
            goods: Number.isInteger(raw.goods) && raw.goods >= 1 && raw.goods <= 5 ? raw.goods : PREF_DEFAULTS.goods,
            legalOnly: typeof raw.legalOnly === 'boolean' ? raw.legalOnly : PREF_DEFAULTS.legalOnly,
            returnTrip: typeof raw.returnTrip === 'boolean' ? raw.returnTrip : PREF_DEFAULTS.returnTrip,
            avoidFull: raw.avoidFull === true,
            hidden: Array.isArray(raw.hidden) ? raw.hidden.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 200) : [],
            capacityScu: Number.isFinite(raw.capacityScu) && raw.capacityScu > 0 ? Math.floor(raw.capacityScu) : null,
        };
        steps = readStore(STEP_KEY);
        const nowSeconds = Date.now() / 1000;
        myPrices = {};
        Object.entries(readStore(PRICE_KEY)).forEach(([key, entry]) => {
            if (/^\d+:\d+:[bs]$/.test(key) && entry && Number.isFinite(entry.p) && entry.p > 0 && Number.isFinite(entry.at) && nowSeconds - entry.at < MY_PRICE_KEEP_DAYS * 86400) {
                myPrices[key] = { p: entry.p, at: entry.at };
            }
        });
    }

    function savePrefs() {
        writeStore(PREF_KEY, prefs);
    }

    // ── 작은 도구 ───────────────────────────────────────────────────────────
    function toId(value) {
        const id = Number(value);
        return Number.isInteger(id) && id > 0 ? id : null;
    }

    // "500k", "2m", "1.5m", "200만", "1억", "1,200,000" → 숫자. 빈 칸은 null(정하지 않음), 못 읽으면 undefined.
    function parseMoney(input) {
        const textValue = String(input ?? '').trim().toLowerCase().replace(/auec/g, '').replace(/[\s,_']/g, '');
        if (!textValue) return null;
        const match = /^(\d+(?:\.\d+)?)(k|m|b|천|만|억)?$/.exec(textValue);
        if (!match) return undefined;
        const scale = { k: 1e3, m: 1e6, b: 1e9, 천: 1e3, 만: 1e4, 억: 1e8 }[match[2]] || 1;
        const amount = Math.round(Number(match[1]) * scale);
        return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
    }

    function money(value) {
        return H.price(value, { unit: false });
    }

    function distance(meters) {
        if (!H.isKnown(meters)) return H.unknown('game');
        if (meters >= 1e9) return `${H.num(meters / 1e9, { digits: 1 })} Gm`;
        if (meters >= 1e6) return `${H.num(meters / 1e6, { digits: 1 })} Mm`;
        return `${H.num(meters / 1e3)} km`;
    }

    function secondsText(value) {
        return `${H.num(value)}${H.lang() === 'en' ? ' s' : '초'}`;
    }

    function shipName(id) {
        const ship = window.VOLT_SHIPDB_CANONICAL?.getShip?.(id);
        if (!ship) return id;
        return (H.lang() === 'ko' && ship.nameKo) || ship.name || id;
    }

    function systemName(system) {
        const star = (data.world?.bodies || []).find((body) => body.kind === 'star' && body.system === system);
        return star ? H.name(star.name) : system;
    }

    function terminal(id) {
        return model ? model.terminals.get(id) || null : null;
    }

    function placeName(id) {
        const entry = terminal(id);
        return entry ? H.name(entry.name) || entry.uexName || `#${id}` : `#${id}`;
    }

    // 행성·위성 이름은 게임 자료(한글 패치 이름)를 쓴다. UEX 이름은 게임 자료와 잇지 못했을 때만 쓴다.
    function bodyName(entry) {
        const uex = entry.moon || entry.planet || null;
        const system = String(entry.system || '').toLowerCase();
        const byName = uex ? data.bodyByName.get(`${system}|${String(uex).toLowerCase()}`) : null;
        const joined = entry.bodyId ? data.bodyById.get(entry.bodyId) : null;
        const body = byName || (joined && joined.kind !== 'star' ? joined : null);
        return body ? H.name(body.name) : uex;
    }

    // "지도에서 보기": 성계지도에 실제로 보일 수 있는 곳일 때만 링크가 나온다 (js/starmap.js VOLT_STARMAP.links).
    function mapLink(params, options) {
        return window.VOLT_STARMAP?.links?.button?.(params, options) || '';
    }

    function placeWhere(id) {
        const entry = terminal(id);
        if (!entry) return '';
        return [bodyName(entry), entry.system ? systemName(entry.system) : null].filter(Boolean).join(' · ');
    }

    function goodName(id) {
        const entry = model ? model.commodities.get(id) : null;
        return (entry && H.name(entry.name)) || H.name(hiddenNames.get(id)) || t('goodNumber', { id });
    }

    function boxText(boxes) {
        return (boxes || []).map((box) => t('boxItem', { scu: box.scu, n: box.count })).join(', ');
    }

    function boxCount(boxes) {
        return (boxes || []).reduce((sum, box) => sum + box.count, 0);
    }

    function ageTag(at, mine) {
        const level = H.ageLevel(at, settings().maxAgeDays);
        return `<span class="routes-age is-${esc(level)}">${esc(H.age(at))}</span>${mine ? ` <span class="routes-tag is-mine">${esc(t('mine'))}</span>` : ''}`;
    }

    // ── 계산에 넘기는 값 ────────────────────────────────────────────────────
    // 받은 주소의 조건이 있으면 그것을 덮어 쓴다. 저장된 내 조건(E.state, prefs)은 건드리지 않는다.
    function shared() {
        const own = E.state.get();
        return linkSetup ? { ...own, ...linkSetup.state } : own;
    }

    function opt() {
        return linkSetup ? { ...prefs, ...linkSetup.prefs } : prefs;
    }

    function namesKnown() {
        return Array.isArray(data.commodities);
    }

    function settings() {
        const base = shared();
        return {
            ...base,
            maxAgeDays: view.fresh ? Math.min(base.maxAgeDays, FRESH_DAYS) : base.maxAgeDays,
            capacityScu: opt().capacityScu,
            now: Date.now(),
        };
    }

    // 상품 이름을 못 받았으면 합법 여부를 알 수 없다. 그때 "합법만"을 켜 두면 목록이 통째로 비므로, 적용하지 않고 화면에 알린다.
    function baseFilters() {
        const o = opt();
        return { legalOnly: o.legalOnly && namesKnown(), avoidFull: o.avoidFull, maxGoods: o.goods, returnTrip: o.returnTrip };
    }

    function listFilters() {
        return {
            ...baseFilters(),
            commodity: knownGood(view.c), from: knownPlace(view.from), to: knownPlace(view.to),
            system: shared().system, stationsOnly: view.st, fullLoadOnly: view.full,
        };
    }

    // 주소에 모르는 id가 오면 조용히 무시한다 (기본 화면).
    function knownGood(id) {
        return id && model && model.commodities.has(id) ? id : null;
    }

    function knownPlace(id) {
        return id && model && model.terminals.has(id) ? id : null;
    }

    function detailPair() {
        const match = /^(\d+)\.(\d+)$/.exec(view.d || '');
        if (!match) return null;
        const from = Number(match[1]);
        const to = Number(match[2]);
        return from && to && from !== to ? { from, to } : null;
    }

    // ── 가장 많이 버는 짐 고르기 ────────────────────────────────────────────
    // 엔진은 한 구간에서 SCU당 이익이 큰 상품부터 싣는다. 그러면 재고가 조금뿐인 비싼 상품이, 훨씬 많이 버는 상품을 가린다.
    // 그래서 이 화면은 상품을 하나씩 따로 계산해 달라고 엔진에 묻고(수량·상자·시간은 모두 엔진 값), 구간마다 가장 많이 버는 짐을 고른다.
    const NO_GOOD = 2147483000; // 어느 상품도 아닌 번호: "빈 배" 구간을 엔진에 물을 때 쓴다
    const STAT_KEYS = ['tooOld', 'ageUnknown', 'soldOut', 'notLive', 'illegal', 'legalUnknown', 'fullDestination'];
    const pairKey = (from, to) => `${from}.${to}`;
    const round6 = (value) => Math.round(value * 1e6) / 1e6;
    const many = (value) => (value === null || value === undefined ? [] : [].concat(value));

    function legFilters() {
        return { ...baseFilters(), returnTrip: false, fullLoadOnly: false };
    }

    // 구간별로, 상품을 하나씩만 실었을 때의 결과를 모은다. → { ok, problem, pairs: Map("사는곳.파는곳" → 경로[]), stats }
    function collect(s, filters) {
        const out = { ok: true, problem: null, pairs: new Map(), stats: {} };
        STAT_KEYS.forEach((key) => { out.stats[key] = 0; });
        const f = { ...filters, maxGoods: 1, returnTrip: false, fullLoadOnly: false, sort: 'profit', limit: 500 };
        const add = (routes) => routes.forEach((route) => {
            const key = pairKey(route.from, route.to);
            const list = out.pairs.get(key);
            if (list) list.push(route);
            else out.pairs.set(key, [route]);
        });
        const goods = many(f.commodity).length ? many(f.commodity) : [...model.commodities.keys()];
        let buyPlaces = null;
        for (const c of goods) {
            const result = E.rankRoutes(model, s, { ...f, commodity: c });
            if (!result.ok) return { ...out, ok: false, problem: result.problem };
            STAT_KEYS.forEach((key) => { out.stats[key] += result.stats[key] || 0; });
            if (result.total <= result.routes.length) {
                add(result.routes);
                continue;
            }
            // 한 상품의 조합이 엔진이 한 번에 돌려주는 500개를 넘으면 사는 곳별로 나눠 다시 묻는다.
            if (!buyPlaces) buyPlaces = E.listTerminals(model).filter((entry) => entry.buyCount > 0).map((entry) => entry.id);
            const wanted = many(f.from);
            for (const place of buyPlaces) {
                if (wanted.length && !wanted.includes(place)) continue;
                add(E.rankRoutes(model, s, { ...f, commodity: c, from: place }).routes);
            }
        }
        return out;
    }

    function evalLeg(s, from, to, goods) {
        const result = E.evaluateRoute(model, s, { from, to, commodities: goods }, legFilters());
        return result.ok ? result.route : null;
    }

    // 돈이 수량을 막고 있는가 (돈이 늘면 더 실을 수 있는가)
    function budgetBound(good) {
        const caps = good.caps;
        return caps.budget !== null && caps.budget < Math.min(caps.ship, caps.stock ?? Infinity, caps.destination ?? Infinity);
    }

    // 돈이 아무리 많아도 이 상품 하나로 이 이상은 못 번다.
    function upperBound(good) {
        return good.margin * Math.min(good.caps.ship, good.caps.stock ?? Infinity, good.caps.destination ?? Infinity);
    }

    /**
     * 한 구간에서 가장 많이 버는 짐.
     * solos: 상품을 하나씩 실은 결과 (예산 s.budget 기준). budget 이 s.budget 과 다르면(돌아오는 길은 번 돈이 더해진다) 돈에 막혔던 상품만 다시 묻는다.
     * 상품을 여러 가지 싣는 설정이면 "하나씩 실었을 때 이익이 큰 상품들"과 "SCU당 이익이 큰 상품들"도 실어 보고 가장 나은 것을 고른다.
     */
    function bestLoad(s, from, to, solos, budget, mustFill) {
        if (!solos || !solos.length) return null;
        const same = budget === s.budget;
        const sAt = same ? s : { ...s, budget };
        let best = null;
        const take = (route) => {
            if (!route || !(route.quantity > 0) || !(route.profit > 0) || (mustFill && !route.full)) return;
            if (!best || route.profit > best.profit) best = route;
        };
        const ranked = solos.map((route) => ({ route, top: upperBound(route.goods[0]) })).sort((a, b) => b.top - a.top);
        for (const entry of ranked) {
            if (best && entry.top <= best.profit) break;
            take(same || !budgetBound(entry.route.goods[0]) ? entry.route : evalLeg(sAt, from, to, [entry.route.goods[0].c]));
        }
        const count = opt().goods;
        if (count > 1 && solos.length > 1) {
            const ids = (list) => list.slice(0, count).map((route) => route.goods[0].c).sort((a, b) => a - b);
            const byProfit = ids([...solos].sort((a, b) => b.profit - a.profit));
            const byMargin = ids([...solos].sort((a, b) => b.goods[0].margin - a.goods[0].margin));
            take(evalLeg(sAt, from, to, byProfit));
            if (byMargin.join() !== byProfit.join()) take(evalLeg(sAt, from, to, byMargin));
        }
        return best;
    }

    // 빈 배로 가는 구간 (시간만). 함선과 시간 설정이 같으면 다시 묻지 않는다.
    function emptyLeg(s, from, to) {
        const key = `${s.ship}|${s.capacityScu}|${JSON.stringify(s.time)}|${from}.${to}`;
        if (!emptyLegs.has(key)) {
            if (emptyLegs.size > 20000) emptyLegs.clear();
            const route = evalLeg(s, from, to, [NO_GOOD]);
            emptyLegs.set(key, route ? { ...route, empty: true } : null);
        }
        return emptyLegs.get(key);
    }

    // 돌아오는 길: 같은 두 곳을 반대로, 번 돈을 더한 예산으로. 실을 것이 없으면 빈 배로 돌아오는 시간만.
    function addBack(s, route, backSolos) {
        const budget = s.budget === null ? null : round6(s.budget + route.profit);
        const load = bestLoad(s, route.to, route.from, backSolos, budget, false);
        const back = load ? { ...load, ret: null, roundTrip: null } : emptyLeg(s, route.to, route.from);
        route.ret = back;
        const known = Boolean(back) && route.time.known && back.time.known;
        const seconds = known ? route.seconds + back.seconds : null;
        const profit = round6(route.profit + (back ? back.profit : 0));
        route.roundTrip = { profit, seconds, profitPerHour: known && seconds > 0 ? profit / seconds * 3600 : null };
    }

    function settingsKey(s) {
        return [modelRev, s.ship, s.budget, s.maxAgeDays, s.boxes, s.capacityScu, s.time];
    }

    const timeBucket = (s) => Math.floor(s.now / 600000); // 가격 나이 기준이 움직이므로 10분마다 다시 계산한다

    function sortRoutes(cache) {
        const round = opt().returnTrip && (view.sort === 'perHour' || view.sort === 'profit');
        const sortKey = `${view.sort}|${round}`;
        if (!cache.ok || cache.sort === sortKey) return;
        const score = (route) => (round && route.roundTrip ? route.roundTrip : route);
        const low = (value) => value ?? -Infinity;
        const by = {
            perHour: (a, b) => low(score(b).profitPerHour) - low(score(a).profitPerHour) || score(b).profit - score(a).profit,
            profit: (a, b) => score(b).profit - score(a).profit,
            margin: (a, b) => low(b.marginPerScu) - low(a.marginPerScu) || b.profit - a.profit,
            roi: (a, b) => low(b.roi) - low(a.roi) || b.profit - a.profit,
        }[view.sort];
        cache.routes.sort((a, b) => by(a, b) || a.from - b.from || a.to - b.to);
        cache.sort = sortKey;
    }

    // 순위표에 쓸 모든 경로. 조건이 그대로면 다시 계산하지 않는다 (자세히를 열고 닫거나 "더 보기"를 눌러도 그대로 쓴다).
    function rankAll() {
        const s = E.settings(settings());
        const f = listFilters();
        const key = JSON.stringify([settingsKey(s), f]);
        const sig = `${key}|${timeBucket(s)}`;
        if (rankCache && rankCache.sig === sig) {
            sortRoutes(rankCache);
            return rankCache;
        }
        const forward = collect(s, f);
        if (!forward.ok) {
            rankCache = { sig, key, ok: false, problem: forward.problem, routes: [], byKey: new Map(), total: 0, stats: null, settings: s, sort: null };
            return rankCache;
        }
        // 돌아오는 길은 상품·사는 곳·파는 곳 좁히기와 상관없이 찾는다 (엔진과 같은 규칙).
        let back = null;
        if (f.returnTrip) back = f.commodity || f.from || f.to ? collect(s, { ...f, commodity: null, from: f.to, to: f.from }) : forward;
        const routes = [];
        const byKey = new Map();
        let timeUnknown = 0;
        for (const [id, solos] of forward.pairs) {
            const best = bestLoad(s, solos[0].from, solos[0].to, solos, s.budget, f.fullLoadOnly);
            if (!best) continue;
            const route = { ...best, goodIds: solos.map((solo) => solo.goods[0].c) };
            if (!route.time.known) timeUnknown += 1;
            if (back) addBack(s, route, back.pairs.get(pairKey(route.to, route.from)));
            routes.push(route);
            byKey.set(id, route);
        }
        rankCache = { sig, key, ok: true, problem: null, routes, byKey, total: routes.length, stats: { ...forward.stats, timeUnknown }, settings: s, sort: null };
        sortRoutes(rankCache);
        return rankCache;
    }

    // 같은 구간을 화물칸이 있는 모든 함선으로. goodIds: 이 구간에서 사고팔 수 있는 상품들.
    function compareRows(s, pair, goodIds) {
        const rows = [];
        const unknownCargo = [];
        E.listShips(model).forEach((ship) => {
            if (ship.scu === null) {
                unknownCargo.push(ship.id);
                return;
            }
            if (!(ship.scu > 0)) return;
            const sShip = { ...s, ship: ship.id, capacityScu: null };
            const solos = goodIds.map((c) => evalLeg(sShip, pair.from, pair.to, [c])).filter((route) => route && route.quantity > 0 && route.profit > 0);
            const route = bestLoad(sShip, pair.from, pair.to, solos, sShip.budget, false);
            if (route) rows.push({ ship: ship.id, capacity: route.capacity, quantity: route.quantity, investment: route.investment, profit: route.profit, seconds: route.seconds, profitPerHour: route.profitPerHour });
        });
        rows.sort((a, b) => (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity) || b.profit - a.profit || (a.ship < b.ship ? -1 : 1));
        return { rows, unknownCargo };
    }

    // 자세히에 쓸 한 구간의 계산. 순위표와 같은 방법으로 짐을 고르므로 숫자가 서로 같다.
    function detailResult(pair) {
        const s = E.settings(settings());
        const only = knownGood(view.c);
        const base = baseFilters();
        const sig = JSON.stringify([settingsKey(s), base, pair, only, timeBucket(s)]);
        if (detailCache && detailCache.sig === sig) return detailCache;
        const probe = E.evaluateRoute(model, s, { from: pair.from, to: pair.to, commodities: [NO_GOOD] }, legFilters());
        if (!probe.ok) {
            detailCache = { sig, ok: false, problem: probe.problem, settings: probe.settings };
            return detailCache;
        }
        const id = pairKey(pair.from, pair.to);
        const solos = collect(s, { ...base, from: pair.from, to: pair.to, commodity: only }).pairs.get(id) || [];
        const best = bestLoad(s, pair.from, pair.to, solos, s.budget, false);
        const route = best ? { ...best } : { ...probe.route };
        if (base.returnTrip) addBack(s, route, collect(s, { ...base, from: pair.to, to: pair.from }).pairs.get(pairKey(pair.to, pair.from)));
        // 함선 비교용: 함선·돈·상자 크기에 상관없이 이 구간에서 사고팔 수 있는 상품들
        const wide = collect({ ...s, budget: null, boxes: null, capacityScu: 1000000 }, { ...base, from: pair.from, to: pair.to, commodity: only }).pairs.get(id) || [];
        detailCache = { sig, ok: true, problem: null, route, settings: s, goodIds: wide.map((solo) => solo.goods[0].c), compare: null, next: null };
        return detailCache;
    }

    // 도착한 곳에서 이어 갈 구간 (가장 많이 버는 짐으로, 시간당 이익 순 5개)
    function nextRoutes(s, pair) {
        const found = collect(s, { ...baseFilters(), from: pair.to });
        if (!found.ok) return [];
        const routes = [];
        for (const solos of found.pairs.values()) {
            const best = bestLoad(s, solos[0].from, solos[0].to, solos, s.budget, false);
            if (best) routes.push({ ...best });
        }
        routes.sort((a, b) => (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity) || b.profit - a.profit || a.to - b.to);
        const home = E.travelBetween(model, s, pair.to, pair.from);
        return routes.slice(0, 5).map((route) => {
            const after = E.travelBetween(model, s, route.to, pair.from);
            return { ...route, arrivesHome: route.to === pair.from, closer: after.known && home.known ? after.seconds < home.seconds : null };
        });
    }

    // ── 자료 ────────────────────────────────────────────────────────────────
    const rowsOf = (value) => (Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : []);

    // 숨긴 상품을 빼고 "내가 넣은 가격"을 덮어쓴 가격표로 모델을 다시 만든다 (약 5ms).
    function rebuild() {
        modelRev += 1;
        rankCache = null;
        detailCache = null;
        hints.clear();
        emptyLegs.clear();
        appliedMine = new Set();
        hiddenNames = new Map();
        if (data.game !== 'ready') {
            model = null;
            return;
        }
        const hidden = new Set(prefs.hidden);
        const rows = [];
        const hiddenRows = [];
        let dropped = false;
        data.market.forEach((row) => {
            if (hidden.has(row.c)) {
                hiddenRows.push(row);
                return;
            }
            let next = row;
            ['b', 's'].forEach((side) => {
                const field = side === 'b' ? 'buy' : 'sell';
                const key = `${row.t}:${row.c}:${side}`;
                const mine = myPrices[key];
                if (!mine || !H.isKnown(row[field])) return;
                if (!(mine.at > (row.at || 0))) { // UEX에 더 새로운 보고가 올라왔다: 내 값은 버린다.
                    delete myPrices[key];
                    dropped = true;
                    return;
                }
                next = { ...next, [field]: mine.p, at: mine.at };
                appliedMine.add(key);
            });
            rows.push(next);
        });
        if (dropped) writeStore(PRICE_KEY, myPrices);
        const common = { terminals: data.terminals, cargo: data.cargo, world: data.world, commodities: data.commodities || undefined };
        model = E.buildModel({ ...common, market: rows });
        if (hiddenRows.length) {
            const side = E.buildModel({ ...common, market: hiddenRows });
            prefs.hidden.forEach((id) => {
                const entry = side.commodities.get(id);
                if (entry && entry.name) hiddenNames.set(id, entry.name);
            });
        }
    }

    async function loadGame() {
        data.game = 'loading';
        data.gameError = null;
        requestDraw();
        try {
            const [cargo, world] = await Promise.all([H.loadJson('/data/trade/cargo.json'), H.loadJson('/data/trade/world.json')]);
            data.cargo = cargo;
            data.world = world;
            data.bodyById = new Map();
            data.bodyByName = new Map();
            (Array.isArray(world?.bodies) ? world.bodies : []).forEach((body) => {
                if (!body || !body.id || body.kind === 'star') return;
                data.bodyById.set(body.id, body);
                if (body.name?.en) data.bodyByName.set(`${String(body.system || '').toLowerCase()}|${String(body.name.en).toLowerCase()}`, body);
            });
            data.game = 'ready';
        } catch (error) {
            data.game = 'error';
            data.gameError = error;
        }
        rebuild();
        requestDraw();
        // 함선 이름은 함선 DB가 이미 받아 둔 자료를 쓴다. 못 받아도 함선 id로 보여 주면 된다.
        try {
            await window.VOLT_SHIPDB_CANONICAL?.load?.();
            requestDraw();
        } catch (_error) { /* 이름만 없다 */ }
    }

    // 상품 이름과 합법 여부(게임 자료와 잇는 데 필요). 실패해도 경로 계산은 된다.
    async function loadNames(quiet) {
        if (!quiet) {
            data.names = 'loading';
            requestDraw();
        }
        try {
            const names = await H.uex('commodities', { ttlMs: 60 * 60 * 1000 });
            data.commodities = rowsOf(names.data).filter((row) => Number.isFinite(Number(row.id)));
            data.names = 'ready';
        } catch (_error) {
            if (!quiet || !namesKnown()) {
                data.commodities = null;
                data.names = 'error';
            }
        }
        rebuild();
        requestDraw();
    }

    async function loadPrices(refresh) {
        // 이미 받은 가격이 있으면 새로 받는 동안에도, 새로 받기에 실패해도 그 가격을 그대로 보여 준다.
        const keep = refresh === true && data.prices === 'ready';
        if (keep) ui.refreshing = true;
        else data.prices = 'loading';
        data.priceError = null;
        ui.refreshError = null;
        requestDraw();
        try {
            const [market, terminals] = await Promise.all([H.uex('market', { refresh: refresh === true }), H.uex('terminals')]);
            data.market = rowsOf(market.data);
            data.terminals = rowsOf(terminals.data);
            data.meta = market.meta;
            data.prices = 'ready';
        } catch (error) {
            ui.refreshing = false;
            if (keep) {
                ui.refreshError = error;
                requestDraw();
                return;
            }
            data.market = [];
            data.terminals = [];
            data.meta = null;
            data.prices = 'error';
            data.priceError = error;
        }
        ui.refreshing = false;
        rebuild();
        requestDraw();
        if (data.prices === 'ready') await loadNames(keep);
    }

    // ── 주소 ────────────────────────────────────────────────────────────────
    function timeKey(time) {
        const parts = [];
        TIME_KEYS.forEach((key, index) => {
            if (Number.isFinite(time?.[key])) parts.push(`${index}-${Math.round(time[key])}`);
        });
        if (time?.loading === 'manual') parts.push('m');
        return parts.join('.');
    }

    // "이 화면 주소 복사"에 싣는 내 조건
    function linkParams() {
        const s = shared();
        const o = opt();
        return {
            ship: s.ship, b: s.budget, sys: s.system,
            age: s.maxAgeDays === H.DEFAULT_PRICE_AGE_DAYS ? null : s.maxAgeDays,
            bx: s.boxes ? s.boxes.join('.') : null,
            tm: timeKey(s.time) || null,
            cap: o.capacityScu,
            g: o.goods === 1 ? null : o.goods, il: o.legalOnly ? null : 1, rt: o.returnTrip ? null : 0, af: o.avoidFull ? 1 : null,
        };
    }

    // 주소에 다른 사람의 조건이 들어 있으면 읽는다. 내 조건과 같으면 따로 둘 것이 없다(null).
    function readLink(source) {
        if (typeof source.ship !== 'string' || !/^[\w-]{1,80}$/.test(source.ship)) return null;
        const number = (value) => (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : null);
        const time = {};
        String(source.tm || '').split('.').forEach((part) => {
            const match = /^(\d)-(\d{1,6})$/.exec(part);
            if (match && TIME_KEYS[Number(match[1])]) time[TIME_KEYS[Number(match[1])]] = Number(match[2]);
            else if (part === 'm') time.loading = 'manual';
        });
        const boxes = String(source.bx || '').split('.').map(Number).filter((size) => E.STANDARD_BOXES.includes(size));
        const goods = number(source.g);
        const link = {
            state: {
                ship: source.ship, budget: number(source.b),
                system: typeof source.sys === 'string' && /^[\w -]{1,40}$/.test(source.sys) ? source.sys : null,
                maxAgeDays: number(source.age) > 0 ? number(source.age) : H.DEFAULT_PRICE_AGE_DAYS,
                boxes: boxes.length && boxes.length < E.STANDARD_BOXES.length ? boxes : null,
                time,
            },
            prefs: {
                goods: Number.isInteger(goods) && goods >= 1 && goods <= 5 ? goods : 1,
                legalOnly: source.il !== '1', returnTrip: source.rt !== '0', avoidFull: source.af === '1',
                capacityScu: number(source.cap) > 0 ? Math.floor(number(source.cap)) : null,
            },
        };
        const own = E.state.get();
        const shape = (state, options) => JSON.stringify([state.ship, state.budget, state.system, state.maxAgeDays, state.boxes ? [...state.boxes].sort((a, b) => a - b) : null, timeKey(state.time),
            options.goods, options.legalOnly, options.returnTrip, options.avoidFull, options.capacityScu]);
        return shape(link.state, link.prefs) === shape(own, prefs) ? null : link;
    }

    function readParams(params) {
        const source = params || {};
        view.c = toId(source.c);
        view.from = toId(source.from);
        view.to = toId(source.to);
        view.sort = SORTS.includes(source.sort) ? source.sort : 'perHour';
        view.st = source.st === '1';
        view.full = source.full === '1';
        view.fresh = source.fresh === '1';
        view.d = /^\d+\.\d+$/.test(source.d || '') ? source.d : null;
        // 다른 화면이 사는 곳과 파는 곳만 함께 보내면(d 없음) 그 경로를 바로 연다. 이 화면이 적은 주소에는 d 가 있다(닫아 두었으면 d=0).
        if (source.d === undefined && view.from && view.to && view.from !== view.to) view.d = `${view.from}.${view.to}`;
        view.limit = PAGE;
        linkSetup = readLink(source);
        ui.compareAll = false;
        ui.edit = null;
    }

    function hashParams() {
        return {
            ...(linkSetup ? linkParams() : {}),
            c: view.c, from: view.from, to: view.to,
            d: view.d || (view.from && view.to && view.from !== view.to ? '0' : null),
            sort: view.sort === 'perHour' ? null : view.sort,
            st: view.st ? 1 : null, full: view.full ? 1 : null, fresh: view.fresh ? 1 : null,
        };
    }

    function syncHash(push) {
        if (H.parseHash().section === SECTION) H.writeHash(SECTION, hashParams(), { push: push === true });
    }

    // ── 그리기: 내 조건 ─────────────────────────────────────────────────────
    function option(value, label, selected) {
        return `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
    }

    function check(id, act, label, checked, extra) {
        return `<label class="routes-check"><input type="checkbox" id="${esc(id)}" data-act="${esc(act)}"${extra || ''}${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;
    }

    function shipOptions(state) {
        if (!model) return option('', t('shipNone'), true);
        const ships = E.listShips(model).map((ship) => ({ ...ship, label: shipName(ship.id) }));
        ships.sort((a, b) => a.label.localeCompare(b.label, H.lang()));
        const withHold = ships.filter((ship) => ship.scu > 0);
        const unknown = ships.filter((ship) => ship.scu === null);
        const current = state.ship && !withHold.concat(unknown).some((ship) => ship.id === state.ship) ? state.ship : null;
        const group = (label, list) => (list.length ? `<optgroup label="${esc(label)}">${list.join('')}</optgroup>` : '');
        return option('', t('shipNone'), !state.ship)
            + (current ? group(t('shipGroupOther'), [option(current, shipName(current), true)]) : '')
            + group(t('shipGroupCargo'), withHold.map((ship) => option(ship.id, `${ship.label} · ${H.scu(ship.scu)}`, ship.id === state.ship)))
            + group(t('shipGroupUnknown'), unknown.map((ship) => option(ship.id, `${ship.label} · ${H.unknown('game')}`, ship.id === state.ship)));
    }

    function holdLine(state) {
        if (!model || !state.ship) return `<p class="routes-hold">${esc(t('holdPick'))}</p>`;
        const profile = E.shipProfile(model, settings());
        const lines = [];
        if (profile.override) lines.push(t('holdTyped', { use: H.scu(profile.capacity) }));
        else if (!profile.known) lines.push(t('holdUnknown'));
        else if (!(profile.capacity > 0)) lines.push(t('holdNone'));
        else lines.push(t('holdLine', { use: H.scu(profile.capacity), total: H.scu(profile.scu), box: H.num(profile.maxBox) }));
        if (profile.exists && !profile.hasDrive) lines.push(t('noDrive'));
        const info = window.VOLT_SHIPDB_CANONICAL?.getShip?.(state.ship)
            ? ` <button type="button" class="routes-link" id="routes-ship-info" data-volt-open="ship" data-volt-ship-id="${esc(state.ship)}">${esc(t('shipInfo'))}</button>` : '';
        return `<p class="routes-hold">${lines.map(esc).join('<br>')}${info}</p>`;
    }

    function ageLabel(days) {
        const label = days < 1 ? t('ageHours', { n: H.num(days * 24, { digits: 1 }) }) : t('ageDays', { n: H.num(days, { digits: 1 }) });
        return days === H.DEFAULT_PRICE_AGE_DAYS ? `${label} ${t('ageDefault')}` : label;
    }

    function drawContext() {
        const state = shared();
        const o = opt();
        const lock = linkSetup ? ' disabled' : ''; // 받은 주소의 조건을 보는 동안에는 고칠 수 없다 (내 조건을 실수로 바꾸지 않도록)
        const systems = Array.isArray(data.world?.systems) ? data.world.systems : [];
        const ages = AGE_CHOICES.includes(state.maxAgeDays) ? AGE_CHOICES : [...AGE_CHOICES, state.maxAgeDays].sort((a, b) => a - b);
        const enabled = state.boxes || E.STANDARD_BOXES;
        const budgetText = state.budget === null ? t('budgetNone') : H.price(state.budget);
        const what = [state.ship ? shipName(state.ship) : null, budgetText].filter(Boolean).join(' · ');
        const banner = linkSetup ? `<p class="routes-warn" id="routes-link-banner">${esc(t('linkBanner', { what }))} <button type="button" class="routes-link" id="routes-link-drop" data-act="link-drop">${esc(t('linkDrop'))}</button></p>` : '';
        return `<details class="routes-card routes-context" data-fold="contextOpen"${ui.contextOpen || linkSetup ? ' open' : ''}>
            <summary class="helper-condition" id="routes-context-title">${H.conditionRow(state, state.ship && shipName(state.ship), model && E.shipProfile(model, state).scu)}</summary>
            ${banner}
            <div class="routes-fields">
                <div class="routes-field is-wide">
                    <label for="routes-ship">${esc(t('ship'))}</label>
                    <select id="routes-ship" data-act="ship"${lock}>${shipOptions(state)}</select>
                    ${holdLine(state)}
                </div>
                <div class="routes-field">
                    <label for="routes-budget">${esc(t('budget'))}</label>
                    <input type="text" id="routes-budget" data-act="budget" inputmode="decimal" autocomplete="off" value="${esc(state.budget === null ? '' : H.num(state.budget))}" aria-describedby="routes-budget-hint"${ui.budgetError ? ' aria-invalid="true"' : ''}${lock}>
                    <p class="routes-hint${ui.budgetError ? ' is-error' : ''}" id="routes-budget-hint"${ui.budgetError ? ' role="alert"' : ''}>${esc(ui.budgetError ? t('budgetBad') : `${budgetText} · ${t('budgetHint')}`)}</p>
                </div>
                <div class="routes-field">
                    <label for="routes-system">${esc(t('system'))}</label>
                    <select id="routes-system" data-act="system"${lock}>${option('', t('systemAll'), !state.system)}${systems.map((system) => option(system, systemName(system), system === state.system)).join('')}</select>
                </div>
            </div>
            <details class="routes-fold" id="routes-options" data-fold="optionsOpen"${ui.optionsOpen ? ' open' : ''}>
                <summary>${esc(t('options'))}</summary>
                <div class="routes-fields">
                    <div class="routes-field">
                        <label for="routes-goods">${esc(t('goods'))}</label>
                        <select id="routes-goods" data-act="goods"${lock}>${[1, 2, 3, 4, 5].map((n) => option(n, t('goodsN', { n }), n === o.goods)).join('')}</select>
                    </div>
                    <div class="routes-field">
                        <label for="routes-age">${esc(t('age'))}</label>
                        <select id="routes-age" data-act="age"${lock}>${ages.map((days) => option(days, ageLabel(days), days === state.maxAgeDays)).join('')}</select>
                    </div>
                    <div class="routes-field">
                        <label for="routes-capacity">${esc(t('capacity'))}</label>
                        <input type="text" id="routes-capacity" data-act="capacity" inputmode="numeric" autocomplete="off" value="${esc(o.capacityScu === null ? '' : o.capacityScu)}"${ui.capacityError ? ' aria-invalid="true" aria-describedby="routes-capacity-hint"' : ''}${lock}>
                        ${ui.capacityError ? `<p class="routes-hint is-error" id="routes-capacity-hint" role="alert">${esc(t('capacityBad'))}</p>` : ''}
                    </div>
                </div>
                <div class="routes-checks">
                    ${check('routes-legal', 'legal', t('legalOnly'), o.legalOnly, lock)}
                    ${check('routes-return', 'return', t('returnTrip'), o.returnTrip, lock)}
                    ${check('routes-avoid', 'avoid', t('avoidFull'), o.avoidFull, lock)}
                </div>
                <fieldset class="routes-boxes">
                    <legend>${esc(t('boxes'))}</legend>
                    <div class="routes-checks">${E.STANDARD_BOXES.map((size) => check(`routes-box-${size}`, 'box', String(size), enabled.includes(size), ` data-size="${size}"${lock}`)).join('')}</div>
                    <p class="routes-hint">${esc(t('boxesNote'))}</p>
                </fieldset>
            </details>
            <p class="routes-hint">${esc(t('contextNote'))}</p>
        </details>`;
    }

    // ── 그리기: 좁히기 ──────────────────────────────────────────────────────
    function mineList(pair) {
        return [...appliedMine].filter((key) => myPrices[key]).map((key) => {
            const [place, good, side] = key.split(':');
            return { key, t: Number(place), c: Number(good), side, p: myPrices[key].p };
        }).filter((entry) => !pair || entry.t === pair.from || entry.t === pair.to);
    }

    // 내가 넣은 가격을 쓰는 동안에는 어느 화면에서든 보이고, 눌러서 지울 수 있다.
    function drawMine(prefix, pair) {
        const list = mineList(pair);
        if (!list.length) return '';
        return `<div class="routes-hidden routes-mine">
                <span class="routes-hidden-title">${esc(t('mineTitle'))}</span>
                ${list.map((entry, index) => {
                    const label = t(entry.side === 'b' ? 'mineBuy' : 'mineSell', { good: goodName(entry.c), place: placeName(entry.t), p: money(entry.p) });
                    return `<button type="button" class="routes-chip is-mine" id="${esc(prefix)}-${index}" data-act="mine-remove" data-key="${esc(entry.key)}" aria-label="${esc(t('mineRemove', { label }))}">${esc(label)} <span aria-hidden="true">×</span></button>`;
                }).join('')}
                <span class="routes-hint">${esc(t('mineNote'))}</span>
            </div>`;
    }

    function drawFilters() {
        const goods = model ? [...model.commodities.values()].map((entry) => ({ id: entry.id, label: goodName(entry.id) })) : [];
        goods.sort((a, b) => a.label.localeCompare(b.label, H.lang()));
        const places = model ? E.listTerminals(model).map((entry) => ({ id: entry.id, buys: entry.buyCount, sells: entry.sellCount, label: `${placeName(entry.id)}${entry.system ? ` (${systemName(entry.system)})` : ''}` })) : [];
        places.sort((a, b) => a.label.localeCompare(b.label, H.lang()));
        const filtered = view.c || view.from || view.to || view.st || view.full || view.fresh || view.sort !== 'perHour';
        const hidden = prefs.hidden.length ? `<div class="routes-hidden">
                <span class="routes-hidden-title">${esc(t('hidden'))}</span>
                ${prefs.hidden.map((id) => {
                    const name = goodName(id);
                    return `<button type="button" class="routes-chip is-hidden" id="routes-unhide-${id}" data-act="unhide" data-c="${id}" aria-label="${esc(t('unhide', { name }))}">${esc(name)} <span aria-hidden="true">×</span></button>`;
                }).join('')}
                <span class="routes-hint">${esc(t('hiddenNote'))}</span>
            </div>` : '';
        return `<details class="routes-card routes-filters" data-fold="filtersOpen"${ui.filtersOpen ? ' open' : ''}>
            <summary id="routes-filter-title">${esc(t('filterTitle'))}</summary>
            <div class="routes-fields">
                <div class="routes-field">
                    <label for="routes-good">${esc(t('good'))}</label>
                    <select id="routes-good" data-act="good">${option('', t('goodAll'), !knownGood(view.c))}${goods.map((good) => option(good.id, good.label, good.id === view.c)).join('')}</select>
                </div>
                <div class="routes-field">
                    <label for="routes-from">${esc(t('from'))}</label>
                    <select id="routes-from" data-act="from">${option('', t('anywhere'), !knownPlace(view.from))}${places.filter((place) => place.buys > 0 || place.id === view.from).map((place) => option(place.id, place.label, place.id === view.from)).join('')}</select>
                </div>
                <div class="routes-field">
                    <label for="routes-to">${esc(t('to'))}</label>
                    <select id="routes-to" data-act="to">${option('', t('anywhere'), !knownPlace(view.to))}${places.filter((place) => place.sells > 0 || place.id === view.to).map((place) => option(place.id, place.label, place.id === view.to)).join('')}</select>
                </div>
                <div class="routes-field">
                    <label for="routes-sort">${esc(t('sort'))}</label>
                    <select id="routes-sort" data-act="sort">${SORTS.map((sort) => option(sort, t(`sort_${sort}`), sort === view.sort)).join('')}</select>
                </div>
            </div>
            <div class="routes-checks">
                ${check('routes-st', 'st', t('stationsOnly'), view.st)}
                ${check('routes-full', 'full', t('fullOnly'), view.full)}
                ${check('routes-fresh', 'fresh', t('freshOnly'), view.fresh)}
                ${filtered ? `<button type="button" class="routes-btn" id="routes-clear" data-act="clear">${esc(t('clearFilters'))}</button>` : ''}
            </div>
            ${hidden}
            ${drawMine('routes-mine', null)}
        </details>`;
    }

    // ── 그리기: 순위표 ──────────────────────────────────────────────────────
    function cargoChips(route, prefix) {
        return route.goods.map((good) => {
            const name = goodName(good.c);
            const flag = good.legal === false ? ` <span class="routes-tag is-illegal">${esc(t('illegalTag'))}</span>` : (good.legal === null ? ` <span class="routes-tag">${esc(t('legalUnknownTag'))}</span>` : '');
            return `<span class="routes-chip"><span>${esc(name)} <strong>${esc(H.scu(good.quantity))}</strong>${flag}</span><button type="button" class="routes-chip-x" id="${esc(prefix)}-hide-${good.c}" data-act="hide" data-c="${good.c}" title="${esc(t('hideTitle', { name }))}" aria-label="${esc(t('hide', { name }))}">×</button></span>`;
        }).join('');
    }

    function returnCell(route) {
        if (!route.ret) return '';
        const round = route.roundTrip && H.isKnown(route.roundTrip.profitPerHour) ? `<small>${esc(t('roundPerHour', { v: money(route.roundTrip.profitPerHour) }))}</small>` : '';
        if (route.ret.empty || !route.ret.goods.length) return `<span class="routes-muted">${esc(t('backEmpty'))}</span>${round}`;
        const goods = route.ret.goods.map((good) => `${goodName(good.c)} ${H.scu(good.quantity)}`).join(', ');
        return `${esc(t('backLoad', { goods, profit: money(route.ret.profit) }))}${round}`;
    }

    function drawProblem(problem) {
        const message = problem === 'no-ship' ? t('needShip') : problem === 'unknown-ship' ? t('unknownShip') : problem === 'cargo-unknown' ? t('holdUnknown') : t('holdNone');
        return `<p class="routes-empty" data-routes-problem="${esc(problem)}">${esc(message)} <button type="button" class="routes-link" data-act="focus" data-target="routes-ship">${esc(t('changeShip'))}</button></p>`;
    }

    function drawStats(rank, shown) {
        const stats = rank.stats || {};
        const o = opt();
        const lines = [t('count', { total: H.num(rank.total), shown: H.num(shown) })];
        if (o.returnTrip && (view.sort === 'perHour' || view.sort === 'profit')) lines.push(t('countRound'));
        if (stats.tooOld) lines.push(t('statOld', { n: H.num(stats.tooOld) }));
        if (stats.ageUnknown) lines.push(t('statAgeUnknown', { n: H.num(stats.ageUnknown) }));
        if (stats.soldOut) lines.push(t('statSoldOut', { n: H.num(stats.soldOut) }));
        if (stats.fullDestination) lines.push(t('statFull', { n: H.num(stats.fullDestination) }));
        if (stats.timeUnknown) lines.push(t('statNoTime', { n: H.num(stats.timeUnknown) }));
        const illegal = (stats.illegal || 0) + (stats.legalUnknown || 0);
        const legal = illegal ? ` ${esc(t('statIllegal', { n: H.num(illegal) }))}${linkSetup ? '' : ` <button type="button" class="routes-link" id="routes-show-illegal" data-act="show-illegal">${esc(t('showIllegal'))}</button>`}` : '';
        const names = o.legalOnly && !namesKnown() && data.market.length
            ? `<p class="routes-warn" id="routes-legal-off">${esc(t('legalOff'))} <button type="button" class="routes-link" id="routes-names-retry" data-act="retry-names">${esc(t('namesRetry'))}</button></p>` : '';
        return `${names}<div class="routes-count" id="routes-count" tabindex="-1"><span role="status">${esc(lines.shift())}</span>
            ${lines.length || legal ? `<details data-fold="countOpen"${ui.countOpen ? ' open' : ''}><summary>${H.lang() === 'ko' ? '계산에 쓴 조건' : 'How routes were ranked'}</summary>${esc(lines.join(' '))}${legal}</details>` : ''}</div>`;
    }

    function rowHtml(route, index) {
        const key = `${route.from}-${route.to}`;
        const est = ` <span class="routes-est is-cell">${esc(t('estimate'))}</span>`;
        const time = route.time.known ? esc(H.duration(route.seconds)) : `<span class="routes-muted">${esc(t('timeUnknown'))}</span>`;
        const perHour = H.isKnown(route.profitPerHour) ? esc(money(route.profitPerHour)) : `<span class="routes-muted">${esc(t('timeUnknown'))}</span>`;
        return `<tr class="${index < 3 ? 'is-top' : ''}" data-route="${key}">
            <td class="routes-rank" data-label="${esc(t('colRank'))}">${index + 1}</td>
            <th scope="row" data-label="${esc(t('colRoute'))}">
                <button type="button" class="routes-open" id="routes-open-${key}" data-act="open" data-from="${route.from}" data-to="${route.to}" aria-label="${esc(t('openLabel', { from: placeName(route.from), to: placeName(route.to) }))}">
                    <span class="routes-leg"><strong>${esc(placeName(route.from))}</strong><small>${esc(placeWhere(route.from))}</small></span>
                    <span class="routes-arrow" aria-hidden="true">→</span>
                    <span class="routes-leg"><strong>${esc(placeName(route.to))}</strong><small>${esc(placeWhere(route.to))}</small></span>
                </button>
                ${mapLink({ route: [route.from, route.to] }, { name: `${placeName(route.from)} → ${placeName(route.to)}`, cls: 'routes-maplink' })}
            </th>
            <td data-label="${esc(t('colCargo'))}"><div class="routes-chips">${cargoChips(route, `routes-row-${key}`)}</div><small>${esc(t('fill', { q: H.num(route.quantity), cap: H.num(route.capacity) }))} · ${ageTag(route.oldestAt)}</small></td>
            <td class="is-num" data-label="${esc(t('colProfit'))}"><strong>${esc(money(route.profit))}</strong></td>
            <td class="is-num" data-label="${esc(t('colTime'))}">${time}${est}</td>
            <td class="is-num" data-label="${esc(t('colPerHour'))}"><strong>${perHour}</strong>${est}</td>
            ${opt().returnTrip ? `<td class="routes-back" data-label="${esc(t('colReturn'))}">${returnCell(route)}</td>` : ''}
            <td class="routes-best" data-label="${esc(t('colBest'))}"><span class="routes-muted" data-hint="${route.from}.${route.to}">${esc(t('hintWait'))}</span></td>
        </tr>`;
    }

    function priceErrorHtml() {
        const login = H.errorType(data.priceError) === 'login'
            ? `<a class="routes-btn is-primary" id="routes-login" href="/auth/discord/login?returnTo=%2F%23routes">${esc(t('login'))}</a>` : '';
        return `<div class="routes-empty" role="alert" data-routes-price-error="${esc(H.errorType(data.priceError))}"><p>${esc(H.errorText(data.priceError))}</p><div class="routes-actions">${login}<button type="button" class="routes-btn" id="routes-retry" data-act="retry-prices">${esc(t('retry'))}</button></div></div>`;
    }

    // 순위표: 줄은 50개씩 묶어(tbody) 따로 그린다. "더 보기"는 새 묶음만 그리고, 바뀌지 않은 묶음은 건드리지 않는다.
    function drawList() {
        const list = shell.list;
        list.setAttribute('aria-label', t('colRoute'));
        const only = (html) => {
            paint(shell.head, html);
            shell.wrap.remove();
            paint(shell.more, '');
        };
        if (data.prices === 'loading' || (data.prices === 'ready' && data.names === 'loading')) return only(`<p class="routes-empty" role="status">${esc(t('pricesLoading'))}</p>`);
        if (data.prices === 'error') return only(priceErrorHtml());
        const rank = rankAll();
        if (!rank.ok) return only(drawProblem(rank.problem));
        if (rank.key !== listKey) { // 조건이 바뀌어 새 목록이 되었다: 첫 묶음부터 다시 보여 준다.
            if (listKey) view.limit = PAGE;
            listKey = rank.key;
        }
        const shown = rank.routes.slice(0, view.limit);
        if (!shown.length) {
            const message = !data.market.length ? t('emptyNoPrices') : rank.settings.budget === 0 ? t('emptyBudget') : t('empty');
            return only(`${drawStats(rank, 0)}<p class="routes-empty" data-routes-empty>${esc(message)}</p>`);
        }
        paint(shell.head, drawStats(rank, shown.length));
        if (!shell.wrap.isConnected) list.insertBefore(shell.wrap, shell.more);
        const est = ` <span class="routes-est">${esc(t('estimate'))}</span>`;
        paint(shell.thead, `<tr>
            <th scope="col">${esc(t('colRank'))}</th><th scope="col">${esc(t('colRoute'))}</th><th scope="col">${esc(t('colCargo'))}</th>
            <th scope="col" class="is-num">${esc(t('colProfit'))}</th><th scope="col" class="is-num">${esc(t('colTime'))}${est}</th><th scope="col" class="is-num">${esc(t('colPerHour'))}${est}</th>
            ${opt().returnTrip ? `<th scope="col">${esc(t('colReturn'))}</th>` : ''}<th scope="col">${esc(t('colBest'))}</th>
        </tr>`);
        const pages = Math.ceil(shown.length / PAGE);
        while (shell.pages.length < pages) {
            const body = document.createElement('tbody');
            shell.table.appendChild(body);
            shell.pages.push(body);
        }
        while (shell.pages.length > pages) shell.pages.pop().remove();
        shell.pages.forEach((body, page) => {
            paint(body, shown.slice(page * PAGE, (page + 1) * PAGE).map((route, offset) => rowHtml(route, page * PAGE + offset)).join(''));
        });
        const left = rank.total - shown.length;
        paint(shell.more, left > 0 && view.limit < 500 ? `<button type="button" class="routes-btn routes-more" id="routes-more" data-act="more">${esc(t('more', { n: H.num(Math.min(PAGE, left, 500 - view.limit)) }))}</button>` : '');
        fillHints();
    }

    // "가장 잘 맞는 함선"은 줄마다 모든 함선을 계산해야 해서, 표를 먼저 보여 주고 조금씩 나눠 채운다.
    function showHint(cell, key) {
        const route = rankCache.byKey.get(key);
        const best = hints.get(key);
        let label = t('bestNone');
        let tone = 'routes-muted';
        if (route && best && H.isKnown(best.profitPerHour) && H.isKnown(route.profitPerHour) && route.profitPerHour > 0) {
            const gain = Math.round((best.profitPerHour / route.profitPerHour - 1) * 100);
            if (best.ship === rankCache.settings.ship || gain < 5) {
                label = t('bestMine');
                tone = 'routes-good';
            } else {
                label = t('bestOther', { ship: shipName(best.ship), v: money(best.profitPerHour), p: H.num(gain) });
                tone = '';
            }
        }
        cell.textContent = label;
        cell.className = tone;
        cell.dataset.done = hintSig;
    }

    function fillHints() {
        if (!rankCache || !rankCache.ok) return;
        if (hintSig !== rankCache.sig) {
            hints.clear();
            hintSig = rankCache.sig;
        }
        let waiting = false;
        shell.table.querySelectorAll('[data-hint]').forEach((cell) => {
            if (cell.dataset.done === hintSig) return;
            if (hints.has(cell.dataset.hint)) showHint(cell, cell.dataset.hint);
            else waiting = true;
        });
        if (waiting) scheduleHints();
    }

    function scheduleHints() {
        if (hintTimer) return;
        hintTimer = window.setTimeout(() => {
            hintTimer = 0;
            if (!shell || shell.list.hidden || !rankCache || !rankCache.ok || hintSig !== rankCache.sig) return;
            const started = performance.now();
            let left = false;
            for (const cell of shell.table.querySelectorAll('[data-hint]')) {
                if (cell.dataset.done === hintSig) continue;
                if (performance.now() - started > 8) {
                    left = true;
                    break;
                }
                const key = cell.dataset.hint;
                if (!hints.has(key)) {
                    const route = rankCache.byKey.get(key);
                    hints.set(key, route ? compareRows(rankCache.settings, route, route.goodIds).rows[0] || null : null);
                }
                showHint(cell, key);
            }
            if (left) scheduleHints();
        }, 16);
    }

    // ── 그리기: 경로 자세히 ─────────────────────────────────────────────────
    function settingLink(label, target, fold) {
        return `<button type="button" class="routes-link" data-act="focus" data-target="${esc(target)}"${fold ? ` data-open="${esc(fold)}"` : ''}>${esc(label)}</button>`;
    }

    function whyQuantity(good) {
        const amount = H.scu(good.quantity);
        if (good.limitedBy === 'stock') return [t('whyStock', { n: amount }), ''];
        if (good.limitedBy === 'budget') return [t('whyBudget', { n: amount }), settingLink(t('changeBudget'), 'routes-budget')];
        if (good.limitedBy === 'boxes') return [t('whyBoxes', { n: amount }), settingLink(t('changeBoxes'), 'routes-box-1', 'optionsOpen')];
        if (good.limitedBy === 'destination') return [t('whyDestination', { n: amount }), ''];
        return [t('whyShip'), settingLink(t('changeShip'), 'routes-ship')];
    }

    function handlingLine(part, where, time) {
        if (!part || part.mode === 'none') return '';
        const vars = { where, v: H.duration(part.seconds), b: secondsText(time.manualBaseSeconds), s: secondsText(time.manualBoxSeconds), n: H.num(part.boxCount) };
        if (part.mode === 'auto') return t('loadAuto', vars);
        if (part.why === 'setting') return t('loadManualSetting', vars);
        return t(part.why === 'auto-time-missing' ? 'loadManualMissing' : 'loadManual', vars);
    }

    function flightLine(flight, time) {
        if (!flight.known) {
            return t({ 'no-position': 'flightNoPosition', 'no-drive': 'flightNoDrive', 'no-ship': 'flightNoDrive', 'no-gateway': 'flightNoGateway' }[flight.reason] || 'flightUnknown');
        }
        if (flight.mode === 'same-place') return t('flightSamePlace');
        if (flight.mode === 'same-body') return t('flightSameBody', { v: H.duration(time.sameBodySeconds) });
        if (flight.mode === 'jump') return t('flightJump', { d: distance(flight.distanceM), j: H.duration(flight.jumpSeconds) });
        const low = H.duration(flight.minSeconds);
        const high = H.duration(flight.maxSeconds);
        return t(low === high ? 'flightQuantumOne' : 'flightQuantum', { d: distance(flight.distanceM), a: low, b: high });
    }

    // 비행 시간을 바꾸는 설정: 같은 행성 안 이동·점프는 시간 설정, 퀀텀 비행은 함선(드라이브)이 정한다.
    function flightLink(flight) {
        if (flight.known && flight.mode === 'same-body') return settingLink(t('changeTime'), 'routes-time-sameBodySeconds', 'timeOpen');
        if (flight.known && flight.mode === 'jump') return settingLink(t('changeTime'), 'routes-time-jumpSeconds', 'timeOpen');
        if (flight.known && flight.mode === 'same-place') return '';
        return settingLink(t('changeShip'), 'routes-ship');
    }

    function drawSplit(route, state, time) {
        const parts = route.time.parts;
        const known = route.time.known;
        const profitLines = route.goods.map((good) => {
            const [why, link] = whyQuantity(good);
            return `<li><span>${esc(t('lineGood', { name: goodName(good.c), q: H.scu(good.quantity), m: money(good.margin) }))}</span><strong>${esc(money(good.profit))}</strong><p class="routes-why">${esc(why)} ${link}</p></li>`;
        }).join('');
        const goodsWhy = route.goods.length >= opt().goods ? `<p class="routes-why">${esc(t('whyGoods', { n: opt().goods }))} ${settingLink(t('changeGoods'), 'routes-goods', 'optionsOpen')}</p>` : '';
        const investLines = route.goods.map((good) => `<li><span>${esc(`${goodName(good.c)} ${H.scu(good.quantity)} × ${money(good.buyPrice)}`)}</span><strong>${esc(money(good.cost))}</strong></li>`).join('');
        const investWhy = state.budget === null ? t('investNoBudget') : t('investUse', { b: H.price(state.budget), u: H.price(route.investment), l: H.price(Math.max(0, state.budget - route.investment)) });
        const handling = (parts.load || 0) + (parts.unload || 0);
        const ground = (parts.depart || 0) + (parts.arrive || 0) + (parts.buy || 0) + (parts.sell || 0);
        const handlingWhy = [handlingLine(route.time.load, t('whereLoad'), time), handlingLine(route.time.unload, t('whereUnload'), time)].filter(Boolean);
        return `<div class="routes-split">
            <section class="routes-part" aria-labelledby="routes-part-profit">
                <h4 id="routes-part-profit">${esc(t('cardProfit'))}</h4>
                <p class="routes-big">${esc(H.price(route.profit))}</p>
                <p class="routes-sub">${esc(H.isKnown(route.profitPerHour) ? t('perHour', { v: H.price(route.profitPerHour) }) : t('timeUnknown'))} <span class="routes-est">${esc(t('estimate'))}</span></p>
                <ul class="routes-lines">${profitLines}</ul>
                ${goodsWhy}
            </section>
            <section class="routes-part" aria-labelledby="routes-part-invest">
                <h4 id="routes-part-invest">${esc(t('cardInvest'))}</h4>
                <p class="routes-big">${esc(H.price(route.investment))}</p>
                <p class="routes-sub">${esc(H.isKnown(route.roi) ? t('roi', { p: H.percent(route.roi * 100) }) : '')}</p>
                <ul class="routes-lines">${investLines}</ul>
                <p class="routes-why">${esc(investWhy)} ${settingLink(t('changeBudget'), 'routes-budget')}</p>
            </section>
            <section class="routes-part" aria-labelledby="routes-part-time">
                <h4 id="routes-part-time">${esc(t('cardTime'))} <span class="routes-est">${esc(t('estimate'))}</span></h4>
                <p class="routes-big">${esc(known ? H.duration(route.seconds) : t('timeUnknown'))}</p>
                <ul class="routes-lines">
                    <li><span>${esc(t('partFlight'))}</span><strong>${esc(known ? H.duration(parts.flight) : t('timeUnknown'))}</strong><p class="routes-why">${esc(flightLine(route.time.flight, time))} ${flightLink(route.time.flight)}</p></li>
                    <li><span>${esc(t('partHandling'))}</span><strong>${esc(H.duration(handling))}</strong><p class="routes-why">${handlingWhy.map(esc).join('<br>')} ${settingLink(t('changeTime'), 'routes-time-loading', 'timeOpen')}</p></li>
                    <li><span>${esc(t('partGround'))}</span><strong>${esc(H.duration(ground))}</strong><p class="routes-why">${esc(t('groundLine', { d: H.duration(parts.depart), a: H.duration(parts.arrive), t: H.duration((parts.buy || 0) + (parts.sell || 0)), atm: H.duration(time.atmosphereSeconds) }))} ${settingLink(t('changeTime'), 'routes-time-takeoffSeconds', 'timeOpen')}</p></li>
                </ul>
            </section>
        </div>`;
    }

    function planSteps(route) {
        const list = [];
        const legSteps = (leg, back) => {
            const loadShort = leg.time.load.mode === 'auto' ? t('loadAutoShort', { v: H.duration(leg.time.load.seconds) }) : t('loadManualShort', { v: H.duration(leg.time.load.seconds) });
            const unloadShort = leg.time.unload.mode === 'auto' ? t('loadAutoShort', { v: H.duration(leg.time.unload.seconds) }) : t('loadManualShort', { v: H.duration(leg.time.unload.seconds) });
            list.push({
                id: back ? 'back-buy' : 'buy', title: t(back ? 'stepBackBuy' : 'stepBuy', { place: placeName(leg.from) }),
                lines: leg.goods.map((good) => ({
                    text: t('buyLine', { name: goodName(good.c), q: H.scu(good.quantity), p: money(good.buyPrice), sum: H.price(good.cost) }),
                    at: good.buyAt, mine: appliedMine.has(`${leg.from}:${good.c}:b`),
                    notes: [t('boxLine', { list: boxText(good.boxes) }) + (good.boxesAssumed ? ` (${t('boxesAssumed')})` : ''), good.stockKnown ? t('stockLine', { n: H.scu(good.caps.stock) }) : t('stockUnknown')],
                })),
            });
            list.push({ id: back ? 'back-load' : 'load', title: t('stepLoad', { n: H.num(boxCount(leg.boxes)) }), lines: [{ text: `${t('boxLine', { list: boxText(leg.boxes) })} · ${loadShort}` }] });
            list.push({ id: back ? 'back-fly' : 'fly', title: t('stepFly', { place: placeName(leg.to) }), lines: [{ text: leg.time.known ? t('flyShort', { v: H.duration(leg.time.parts.flight) }) : t('flyUnknown') }] });
            list.push({
                id: back ? 'back-sell' : 'sell', title: t(back ? 'stepBackSell' : 'stepSell', { place: placeName(leg.to) }),
                lines: leg.goods.map((good) => ({
                    text: t('sellLine', { name: goodName(good.c), q: H.scu(good.quantity), p: money(good.sellPrice), sum: H.price(good.revenue) }),
                    at: good.sellAt, mine: appliedMine.has(`${leg.to}:${good.c}:s`),
                    notes: [good.destination.full ? t('destFull') : (H.isKnown(good.destination.level) ? t('destLevel', { n: good.destination.level }) : t('destUnknown')), unloadShort],
                    warn: good.destination.full,
                })),
            });
        };
        if (route.goods.length) legSteps(route, false);
        else list.push({ id: 'fly', title: t('stepFly', { place: placeName(route.to) }), lines: [{ text: route.time.known ? t('flyShort', { v: H.duration(route.time.parts.flight) }) : t('flyUnknown') }] });
        if (route.ret) {
            if (route.ret.goods.length) legSteps(route.ret, true);
            else list.push({ id: 'back-fly', title: t('stepBackFly', { place: placeName(route.ret.to) }), lines: [{ text: route.ret.time.known ? t('flyShort', { v: H.duration(route.ret.time.parts.flight) }) : t('flyUnknown') }] });
        }
        return list;
    }

    function drawPlan(route) {
        const list = planSteps(route);
        const done = new Set(Array.isArray(steps[view.d]) ? steps[view.d] : []);
        const count = list.filter((step) => done.has(step.id)).length;
        return `<section class="routes-block" aria-labelledby="routes-plan-title">
            <h4 id="routes-plan-title">${esc(t('planTitle'))}</h4>
            <p class="routes-hint"><span id="routes-plan-count">${esc(t('planDone', { done: count, all: list.length }))}</span> · ${esc(t('planNote'))}
                ${count ? `<button type="button" class="routes-link" id="routes-plan-clear" data-act="steps-clear">${esc(t('planClear'))}</button>` : ''}</p>
            <ol class="routes-plan">${list.map((step) => `<li class="${done.has(step.id) ? 'is-done' : ''}">
                <label class="routes-check routes-step"><input type="checkbox" id="routes-step-${esc(step.id)}" data-act="step" data-step="${esc(step.id)}"${done.has(step.id) ? ' checked' : ''}><span>${esc(step.title)}</span></label>
                <ul>${step.lines.map((line) => `<li${line.warn ? ' class="is-warn"' : ''}>${esc(line.text)}${line.at !== undefined ? ` · ${ageTag(line.at, line.mine)}` : ''}${(line.notes || []).map((note) => `<small>${esc(note)}</small>`).join('')}</li>`).join('')}</ul>
            </li>`).join('')}</ol>
        </section>`;
    }

    function legalText(good) {
        const base = good.legal === true ? t('legalYes') : good.legal === false ? t('legalNo') : t('legalUnknown');
        return good.legalSource === 'uex' ? `${base} (${t('legalUex')})` : base;
    }

    function drawPrices(route) {
        const legs = [route, ...(route.ret && route.ret.goods.length ? [route.ret] : [])];
        const rows = legs.map((leg) => leg.goods.map((good) => {
            const key = `${leg.from}.${leg.to}.${good.c}`;
            const editing = ui.edit === key;
            const name = goodName(good.c);
            const form = editing ? `<tr class="routes-editrow"><td colspan="5">
                <form class="routes-edit" data-form="my-price" data-from="${leg.from}" data-to="${leg.to}" data-c="${good.c}" aria-label="${esc(t('diffTitle', { name }))}">
                    <p class="routes-hint">${esc(t('diffNote'))}</p>
                    <div class="routes-fields">
                        <div class="routes-field"><label for="routes-my-buy">${esc(t('diffBuy', { place: placeName(leg.from) }))}</label><input type="text" id="routes-my-buy" name="buy" inputmode="decimal" autocomplete="off" value="${esc(good.buyPrice)}"></div>
                        <div class="routes-field"><label for="routes-my-sell">${esc(t('diffSell', { place: placeName(leg.to) }))}</label><input type="text" id="routes-my-sell" name="sell" inputmode="decimal" autocomplete="off" value="${esc(good.sellPrice)}"></div>
                    </div>
                    ${ui.editError ? `<p class="routes-hint is-error" role="alert">${esc(t('diffBad'))}</p>` : ''}
                    <div class="routes-actions">
                        <button type="submit" class="routes-btn is-primary" id="routes-my-save">${esc(t('save'))}</button>
                        <button type="button" class="routes-btn" id="routes-my-clear" data-act="my-clear" data-from="${leg.from}" data-to="${leg.to}" data-c="${good.c}">${esc(t('diffClear'))}</button>
                        <button type="button" class="routes-btn" id="routes-my-cancel" data-act="my-cancel">${esc(t('cancel'))}</button>
                    </div>
                </form></td></tr>` : '';
            return `<tr>
                <th scope="row" data-label="${esc(t('colGood'))}">${esc(name)}<small>${esc(`${placeName(leg.from)} → ${placeName(leg.to)}`)}</small></th>
                <td class="is-num" data-label="${esc(t('colQty'))}">${esc(H.scu(good.quantity))}</td>
                <td class="is-num" data-label="${esc(t('colBuy'))}">${esc(H.price(good.buyPrice))}<small>${ageTag(good.buyAt, appliedMine.has(`${leg.from}:${good.c}:b`))}</small></td>
                <td class="is-num" data-label="${esc(t('colSell'))}">${esc(H.price(good.sellPrice))}<small>${ageTag(good.sellAt, appliedMine.has(`${leg.to}:${good.c}:s`))}</small></td>
                <td data-label="${esc(t('colLegal'))}"><span class="routes-tag${good.legal === false ? ' is-illegal' : ''}">${esc(legalText(good))}</span>
                    <button type="button" class="routes-link" id="routes-diff-${leg.from}-${leg.to}-${good.c}" data-act="my-edit" data-key="${esc(key)}" aria-expanded="${editing ? 'true' : 'false'}">${esc(t('diffPrice'))}</button></td>
            </tr>${form}`;
        }).join('')).join('');
        if (!rows) return '';
        return `<section class="routes-block" aria-labelledby="routes-prices-title">
            <h4 id="routes-prices-title">${esc(t('pricesTitle'))}</h4>
            <div class="routes-tablewrap"><table class="routes-table is-small">
                <thead><tr><th scope="col">${esc(t('colGood'))}</th><th scope="col" class="is-num">${esc(t('colQty'))}</th><th scope="col" class="is-num">${esc(t('colBuy'))}</th><th scope="col" class="is-num">${esc(t('colSell'))}</th><th scope="col">${esc(t('colLegal'))}</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>
        </section>`;
    }

    function drawFuel(route) {
        const flight = route.time.flight;
        const unit = t('fuelUnit');
        // 0.005 SCU보다 적은 양을 "0 SCU"로 적으면 연료가 안 드는 것처럼 보인다.
        const amount = (value) => (value > 0 && value < 0.005 ? t('fuelTiny', { unit }) : t('fuelAbout', { v: H.num(value, { digits: 2 }), unit }));
        let body;
        if (!flight.known || !H.isKnown(flight.fuelScu)) {
            body = `<p>${esc(flight.known && (flight.mode === 'same-body' || flight.mode === 'same-place') ? flightLine(flight, E.timeSettings(shared().time)) : t('fuelUnknown'))}</p>`;
        } else {
            const tank = H.isKnown(flight.tankScu) ? `${H.num(flight.tankScu, { digits: 2 })} ${unit}` : H.unknown('game');
            const verdict = (need) => (H.isKnown(flight.tankScu) ? (need <= flight.tankScu ? ['is-ok', t('fuelOk')] : ['is-short', t('fuelShort')]) : ['', t('fuelTankUnknown')]);
            const one = verdict(flight.fuelScu);
            const lines = [`<p>${esc(t('fuelLine', { need: amount(flight.fuelScu), tank }))} — <strong class="routes-fuel ${one[0]}">${esc(one[1])}</strong></p>`];
            const back = route.ret?.time?.flight;
            if (back && back.known && H.isKnown(back.fuelScu)) {
                const total = flight.fuelScu + back.fuelScu;
                const both = verdict(total);
                lines.push(`<p>${esc(t('fuelRound', { need: amount(total) }))} — <strong class="routes-fuel ${both[0]}">${esc(both[1])}</strong></p>`);
            }
            body = `${lines.join('')}<p class="routes-hint"><span class="routes-est">${esc(t('estimate'))}</span> ${esc(E.ASSUMPTIONS['fuel.unit'][H.lang()])}</p>`;
        }
        return `<section class="routes-block" aria-labelledby="routes-fuel-title"><h4 id="routes-fuel-title">${esc(t('fuelTitle'))}</h4>${body}</section>`;
    }

    function drawCompare(result, state) {
        const top = 8;
        let rows = result.rows;
        if (!ui.compareAll && rows.length > top) {
            const mine = rows.findIndex((row) => row.ship === state.ship);
            rows = rows.slice(0, top).concat(mine >= top ? [rows[mine]] : []);
        }
        const canonical = window.VOLT_SHIPDB_CANONICAL;
        const body = rows.map((row) => {
            const mine = row.ship === state.ship;
            return `<tr class="${mine ? 'is-selected' : ''}">
                <th scope="row" data-label="${esc(t('colShip'))}">${esc(shipName(row.ship))}${mine ? ` <span class="routes-tag is-mine">${esc(t('myShip'))}</span>` : ''}</th>
                <td class="is-num" data-label="${esc(t('colHold'))}">${esc(H.scu(row.capacity))}</td>
                <td class="is-num" data-label="${esc(t('colQty'))}">${esc(H.scu(row.quantity))}</td>
                <td class="is-num" data-label="${esc(t('colInvest'))}">${esc(money(row.investment))}</td>
                <td class="is-num" data-label="${esc(t('colProfit'))}">${esc(money(row.profit))}</td>
                <td class="is-num" data-label="${esc(t('colTime'))}">${esc(H.isKnown(row.seconds) ? H.duration(row.seconds) : t('timeUnknown'))}</td>
                <td class="is-num" data-label="${esc(t('colPerHour'))}"><strong>${esc(H.isKnown(row.profitPerHour) ? money(row.profitPerHour) : t('timeUnknown'))}</strong></td>
                <td class="routes-rowacts">${mine || linkSetup ? '' : `<button type="button" class="routes-link" id="routes-use-${esc(row.ship)}" data-act="use-ship" data-ship="${esc(row.ship)}">${esc(t('useShip'))}</button>`}
                    ${canonical?.getShip?.(row.ship) ? `<button type="button" class="routes-link" id="routes-info-${esc(row.ship)}" data-volt-open="ship" data-volt-ship-id="${esc(row.ship)}">${esc(t('shipInfo'))}</button>` : ''}</td>
            </tr>`;
        }).join('');
        const toggle = result.rows.length > top ? `<button type="button" class="routes-btn" id="routes-compare-toggle" data-act="compare-toggle">${esc(ui.compareAll ? t('compareLess') : t('compareAll', { n: result.rows.length }))}</button>` : '';
        const unknown = result.unknownCargo.length ? `<p class="routes-hint">${esc(t('compareUnknown', { list: result.unknownCargo.map(shipName).join(', ') }))}</p>` : '';
        return `<section class="routes-block" aria-labelledby="routes-compare-title">
            <h4 id="routes-compare-title">${esc(t('compareTitle'))}</h4>
            <p class="routes-hint">${esc(t('compareNote'))}</p>
            ${body ? `<div class="routes-tablewrap"><table class="routes-table is-small is-compare" id="routes-compare">
                <thead><tr><th scope="col">${esc(t('colShip'))}</th><th scope="col" class="is-num">${esc(t('colHold'))}</th><th scope="col" class="is-num">${esc(t('colQty'))}</th><th scope="col" class="is-num">${esc(t('colInvest'))}</th><th scope="col" class="is-num">${esc(t('colProfit'))}</th><th scope="col" class="is-num">${esc(t('colTime'))}</th><th scope="col" class="is-num">${esc(t('colPerHour'))}</th><th scope="col"><span class="visually-hidden">${esc(t('useShip'))}</span></th></tr></thead>
                <tbody>${body}</tbody></table></div>${toggle}` : `<p class="routes-empty">${esc(t('compareEmpty'))}</p>`}
            ${unknown}
        </section>`;
    }

    function drawNext(routes, pair) {
        const items = routes.map((route) => {
            const where = route.arrivesHome ? t('nextHome') : route.closer === true ? t('nextCloser') : route.closer === false ? t('nextAway') : '';
            const goods = route.goods.map((good) => `${goodName(good.c)} ${H.scu(good.quantity)}`).join(', ');
            return `<li><button type="button" class="routes-next" id="routes-next-${route.from}-${route.to}" data-act="open" data-from="${route.from}" data-to="${route.to}">
                <strong>→ ${esc(placeName(route.to))}</strong><small>${esc(placeWhere(route.to))}</small>
                <span>${esc(goods)}</span>
                <span>${esc(`${t('cardProfit')} ${H.price(route.profit)} · ${route.time.known ? H.duration(route.seconds) : t('timeUnknown')}${H.isKnown(route.profitPerHour) ? ` · ${t('perHour', { v: money(route.profitPerHour) })}` : ''}`)}</span>
                ${where ? `<span class="routes-tag">${esc(where)}</span>` : ''}
            </button></li>`;
        }).join('');
        return `<section class="routes-block" aria-labelledby="routes-next-title">
            <h4 id="routes-next-title">${esc(t('nextTitle'))}</h4>
            <p class="routes-hint">${esc(t('nextNote', { place: placeName(pair.to) }))}</p>
            ${items ? `<ul class="routes-nextlist">${items}</ul>` : `<p class="routes-empty">${esc(t('nextEmpty'))}</p>`}
        </section>`;
    }

    function drawHandoff(route) {
        const links = route.goods.map((good) => `<a class="routes-btn" href="${esc(H.buildHash('market', { tab: 'prices', c: good.c }))}">${esc(t('toMarketGood', { name: goodName(good.c) }))}</a>`);
        for (const good of route.goods) {
            const label = H.lang() === 'ko' ? '이 경로를 무역플래너로 보내기' : 'Send route to trade planner';
            links.push(`<button type="button" class="routes-btn" data-act="planner" data-quantity="${esc(good.quantity)}" data-c="${esc(good.c)}" data-from="${esc(route.from)}" data-to="${esc(route.to)}">${esc(label)} · ${esc(goodName(good.c))}</button>`);
        }
        links.push(`<a class="routes-btn" href="${esc(H.buildHash('market', { tab: 'stations', t: route.from }))}">${esc(t('toMarketFrom'))}</a>`);
        links.push(`<a class="routes-btn" href="${esc(H.buildHash('market', { tab: 'stations', t: route.to }))}">${esc(t('toMarketTo'))}</a>`);
        links.push(`<a class="routes-btn" href="${esc(H.buildHash('tours', { stops: `${route.from},${route.to}` }))}">${esc(t('toTours'))}</a>`);
        links.push(mapLink({ route: [route.from, route.to] }, { name: `${placeName(route.from)} → ${placeName(route.to)}` }));
        links.push(`<a class="routes-btn" href="#hauling">${esc(t('toHauling'))}</a>`);
        return `<section class="routes-block" aria-labelledby="routes-handoff-title"><h4 id="routes-handoff-title">${esc(t('handoffTitle'))}</h4><div class="routes-actions">${links.join('')}</div></section>`;
    }

    function drawDetail() {
        const pair = detailPair();
        if (!pair || data.prices !== 'ready' || data.names === 'loading' || !model) return '';
        const head = (inner) => `<section class="routes-card routes-detail" id="routes-detail" aria-labelledby="routes-detail-title">${inner}</section>`;
        const closeButton = `<button type="button" class="routes-btn" id="routes-close" data-act="close">${esc(t('close'))}</button>`;
        if (!terminal(pair.from) || !terminal(pair.to)) {
            return head(`<div class="routes-detail-head"><h3 id="routes-detail-title" tabindex="-1">${esc(t('detailTitle'))}</h3><div class="routes-actions">${closeButton}</div></div><p class="routes-empty">${esc(t('routeGone'))}</p>`);
        }
        const state = shared();
        const title = `<h3 id="routes-detail-title" tabindex="-1"><span class="routes-kicker">${esc(t('detailTitle'))}</span>
            <span class="routes-leg"><strong>${esc(placeName(pair.from))}</strong><small>${esc(placeWhere(pair.from))}</small></span>
            <span class="routes-arrow" aria-hidden="true">→</span>
            <span class="routes-leg"><strong>${esc(placeName(pair.to))}</strong><small>${esc(placeWhere(pair.to))}</small></span></h3>`;
        const actions = `<div class="routes-actions">${mapLink({ route: [pair.from, pair.to] }, { name: `${placeName(pair.from)} → ${placeName(pair.to)}`, cls: 'routes-maplink-head' })}<button type="button" class="routes-btn" id="routes-share" data-act="share">${esc(t('share'))}</button>${closeButton}</div>`;
        const notice = `<p class="routes-notice" id="routes-notice" role="status">${esc(ui.notice)}</p>`;
        const result = detailResult(pair);
        if (!result.ok) return head(`<div class="routes-detail-head">${title}${actions}</div>${notice}${drawProblem(result.problem)}`);
        const route = result.route;
        const time = result.settings.time;
        if (!result.compare) result.compare = compareRows(result.settings, pair, result.goodIds);
        if (!result.next) result.next = nextRoutes(result.settings, pair);
        const assumptions = route.assumptions.map((code) => E.ASSUMPTIONS[code]).filter(Boolean).map((entry) => `<li>${esc(entry[H.lang()] || entry.ko)}</li>`).join('');
        const pick = route.goods.length ? `<li>${esc(t(opt().goods > 1 ? 'pickMany' : 'pickOne'))}</li>` : '';
        const fee = H.isKnown(route.autoLoadFee) ? `<li>${esc(t('feeLine', { v: H.price(route.autoLoadFee) }))}</li>` : '';
        const mine = route.goods.length ? '' : drawMine('routes-dmine', pair);
        return head(`<div class="routes-detail-head">${title}${actions}</div>${notice}
            ${route.legal === false ? `<p class="routes-warn">${esc(t('illegalNote'))}</p>` : ''}
            ${route.goods.length ? '' : `<p class="routes-warn" data-routes-nothing>${esc(mine ? t('mineLoss') : t('nothingToCarry'))}</p>${mine}`}
            ${drawSplit(route, state, time)}
            ${drawPlan(route)}
            ${drawPrices(route)}
            ${drawFuel(route)}
            ${drawCompare(result.compare, state)}
            ${drawNext(result.next, pair)}
            <section class="routes-block" aria-labelledby="routes-assume-title"><h4 id="routes-assume-title">${esc(t('assumeTitle'))} <span class="routes-est">${esc(t('estimate'))}</span></h4><ul class="routes-assume">${pick}${assumptions}${fee}</ul></section>
            ${drawHandoff(route)}
            <div class="routes-actions routes-detail-foot"><button type="button" class="routes-btn" id="routes-close-bottom" data-act="close">${esc(t('close'))}</button></div>`);
    }

    // ── 그리기: 시간 설정 · 출처 ────────────────────────────────────────────
    function drawTime() {
        const own = shared().time || {};
        const time = E.timeSettings(own);
        const changed = Object.keys(own).length > 0;
        const lock = linkSetup ? ' disabled' : '';
        return `<details class="routes-card routes-fold routes-time" id="routes-time" data-fold="timeOpen"${ui.timeOpen ? ' open' : ''}>
            <summary>${esc(t('timeTitle'))}</summary>
            <p class="routes-hint">${esc(t('timeNote'))}</p>
            <div class="routes-fields">
                <div class="routes-field is-wide">
                    <label for="routes-time-loading">${esc(t('timeLoading'))}</label>
                    <select id="routes-time-loading" data-act="time-loading"${lock}>${option('auto', t('timeLoadingAuto'), time.loading === 'auto')}${option('manual', t('timeLoadingManual'), time.loading === 'manual')}</select>
                </div>
                ${TIME_KEYS.map((key) => `<div class="routes-field">
                    <label for="routes-time-${key}">${esc(t(`t_${key}`))} (${esc(t('seconds'))})</label>
                    <input type="text" id="routes-time-${key}" data-act="time" data-key="${key}" inputmode="numeric" autocomplete="off" value="${esc(time[key])}" aria-describedby="routes-time-${key}-hint"${lock}>
                    <p class="routes-hint" id="routes-time-${key}-hint">${esc(t('timeDefault', { n: E.TIME_DEFAULTS[key] }))}</p>
                </div>`).join('')}
            </div>
            ${changed && !linkSetup ? `<button type="button" class="routes-btn" id="routes-time-reset" data-act="time-reset">${esc(t('timeReset'))}</button>` : ''}
        </details>`;
    }

    function drawSources() {
        const names = data.prices === 'ready' && data.market.length && data.names === 'error' ? `<br>${esc(t('namesMissing'))}` : '';
        const refresh = data.prices !== 'ready' ? '' : ui.refreshing ? ` <span role="status">${esc(t('pricesLoading'))}</span>`
            : ` <button type="button" class="routes-link" id="routes-refresh" data-act="refresh">${esc(t('refresh'))}</button>`;
        const failed = ui.refreshError ? `<br><span class="routes-hint is-error" id="routes-refresh-error" role="alert">${esc(`${t('refreshFailed')} ${H.errorText(ui.refreshError)}`)}</span>` : '';
        return `<p class="routes-sources">${esc(H.sourceLine(data.prices === 'ready' ? data.meta || {} : null))}${refresh}${failed}<br>${esc(t('estimateNote'))}${names}</p>`;
    }

    // ── 그리기: 구역별로 ────────────────────────────────────────────────────
    // 이 파일에서 HTML 문자열을 넣는 유일한 곳. 내용이 그대로면 건드리지 않는다 (초점·스크롤·입력 중인 값이 남는다).
    function paint(target, html) {
        if (painted.get(target) === html) return false;
        target.innerHTML = html;
        painted.set(target, html);
        return true;
    }

    function buildShell() {
        const make = (tag, name) => {
            const node = document.createElement(tag);
            node.className = name;
            return node;
        };
        shell = {
            context: make('div', 'routes-zone'), filters: make('div', 'routes-zone'), detail: make('div', 'routes-zone routes-detail-zone'),
            list: make('section', 'routes-results'), head: make('div', 'routes-zone'), wrap: make('div', 'routes-tablewrap'),
            table: make('table', 'routes-table'), thead: document.createElement('thead'), more: make('div', 'routes-zone routes-more-zone'),
            time: make('div', 'routes-zone'), sources: make('div', 'routes-zone'), pages: [],
        };
        shell.table.id = 'routes-table';
        shell.table.appendChild(shell.thead);
        shell.wrap.appendChild(shell.table);
        shell.list.append(shell.head, shell.more);
        root.replaceChildren(shell.context, shell.filters, shell.detail, shell.list, shell.time, shell.sources);
    }

    function inView(node) {
        const box = node.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= window.innerHeight;
    }

    function draw() {
        if (!root) return;
        if (!shell) buildShell();
        const active = document.activeElement;
        const wanted = focusAfterDraw ? many(focusAfterDraw) : (active && active.id && root.contains(active) ? [active.id] : []);
        const scroll = scrollAfterDraw;
        focusAfterDraw = '';
        scrollAfterDraw = null;
        if (data.game !== 'ready') {
            paint(shell.context, data.game === 'loading' ? `<p class="routes-empty" role="status">${esc(t('loading'))}</p>`
                : `<div class="routes-empty" role="alert"><p>${esc(H.errorText(data.gameError))}</p><button type="button" class="routes-btn" id="routes-retry-game" data-act="retry-game">${esc(t('retry'))}</button></div>`);
            [shell.filters, shell.detail, shell.time, shell.sources].forEach((zone) => { paint(zone, ''); });
            shell.list.hidden = true;
        } else {
            paint(shell.context, drawContext());
            paint(shell.filters, drawFilters());
            const detail = drawDetail();
            paint(shell.detail, detail);
            // 자세히를 보는 동안 순위표는 그대로 두고 감춘다. 닫으면 보던 자리로 돌아간다.
            shell.list.hidden = Boolean(detail);
            if (!detail) drawList();
            paint(shell.time, drawTime());
            paint(shell.sources, drawSources());
        }
        let focused = null;
        let fallback = false; // 첫 번째로 바라던 곳이 사라져 다른 곳에 초점을 두었다 → 그곳이 화면 밖이면 보이게 옮긴다
        for (const id of wanted) {
            const node = document.getElementById(id);
            if (!node || !root.contains(node) || node.disabled || !node.getClientRects().length) {
                fallback = true;
                continue;
            }
            if (document.activeElement !== node) node.focus({ preventScroll: true });
            focused = node;
            break;
        }
        if (!scroll) {
            if (focused && fallback && !inView(focused)) focused.scrollIntoView({ block: 'center', behavior: 'instant' });
            return;
        }
        // 사이트는 부드러운 스크롤을 쓰지만, 여기서는 화면이 바뀌는 것이므로 바로 옮긴다.
        if (scroll.detail) shell.detail.scrollIntoView({ block: 'start', behavior: 'instant' });
        else {
            if (Number.isFinite(scroll.list)) window.scrollTo({ top: scroll.list, behavior: 'instant' });
            if (focused && !inView(focused)) focused.scrollIntoView({ block: 'center', behavior: 'instant' });
            else if (!focused) shell.list.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
    }

    // 값이 바뀌면 다음 틱에 한 번만 다시 그린다. (Tab으로 옮겨 간 초점과 누르는 중인 버튼을 잃지 않도록 바로 그리지 않는다.)
    function requestDraw() {
        if (drawTimer) return;
        drawTimer = window.setTimeout(() => {
            drawTimer = 0;
            draw();
        }, 0);
    }

    // ── 사용자 조작 ─────────────────────────────────────────────────────────
    function setTime(patch) {
        const current = E.state.get().time;
        const next = { ...current, ...patch };
        Object.keys(next).forEach((key) => {
            if (next[key] === E.TIME_DEFAULTS[key] || next[key] === null) delete next[key];
        });
        E.state.set({ time: next });
    }

    function openDetail(from, to) {
        if (!view.d) listScroll = window.scrollY;
        view.d = `${from}.${to}`;
        ui.compareAll = false;
        ui.edit = null;
        ui.notice = '';
        focusAfterDraw = 'routes-detail-title';
        scrollAfterDraw = { detail: true };
        syncHash(true);
        requestDraw();
    }

    // 자세히를 닫으면 보던 줄로 돌아간다. 그 줄이 목록에 없으면 목록 머리에 초점을 둔다.
    function backToList(pair) {
        focusAfterDraw = [pair ? `routes-open-${pair.from}-${pair.to}` : '', 'routes-count', 'routes-ship'].filter(Boolean);
        scrollAfterDraw = { list: listScroll };
        listScroll = null;
    }

    function closeDetail() {
        const pair = detailPair();
        view.d = null;
        ui.edit = null;
        backToList(pair);
        syncHash(false);
        requestDraw();
    }

    function hideGood(id) {
        if (!id || prefs.hidden.includes(id)) return;
        prefs.hidden = [...prefs.hidden, id];
        if (view.c === id) view.c = null;
        savePrefs();
        rebuild();
        syncHash(false);
        ui.filtersOpen = true;
        focusAfterDraw = `routes-unhide-${id}`;
        requestDraw();
    }

    function saveMyPrice(form) {
        const from = toId(form.dataset.from);
        const to = toId(form.dataset.to);
        const c = toId(form.dataset.c);
        const buy = parseMoney(form.elements.buy.value);
        const sell = parseMoney(form.elements.sell.value);
        if (!from || !to || !c || !(buy > 0) || !(sell > 0)) {
            ui.editError = true;
            requestDraw();
            return;
        }
        const at = Math.floor(Date.now() / 1000);
        const current = E.evaluateRoute(model, settings(), { from, to, commodities: [c] }, { ...legFilters(), legalOnly: false, avoidFull: false }).route?.goods?.[0];
        // 바꾼 칸만 "내가 넣은 가격"으로 적는다.
        if (!current || current.buyPrice !== buy) myPrices[`${from}:${c}:b`] = { p: buy, at };
        if (!current || current.sellPrice !== sell) myPrices[`${to}:${c}:s`] = { p: sell, at };
        writeStore(PRICE_KEY, myPrices);
        ui.edit = null;
        ui.editError = false;
        // 넣은 값 때문에 이 줄이 사라져도(이익이 없어짐) 초점은 내가 넣은 가격 목록이나 제목에 남는다.
        focusAfterDraw = [`routes-diff-${from}-${to}-${c}`, 'routes-dmine-0', 'routes-detail-title'];
        rebuild();
        requestDraw();
    }

    const LOCKED = new Set(['ship', 'budget', 'system', 'age', 'box', 'time-loading', 'time', 'goods', 'legal', 'return', 'avoid', 'capacity']);

    function onClick(event) {
        const target = event.target.closest('[data-act]');
        if (!target || !root.contains(target) || target.matches('input, select')) return;
        const act = target.dataset.act;
        if (act === 'planner') {
            const state = shared();
            window.VOLT_JOURNEY.openRoute({ shipId: state.ship, budget: state.budget, quantity: Number(target.dataset.quantity),
                commodityId: toId(target.dataset.c), buyTerminal: toId(target.dataset.from), sellTerminal: toId(target.dataset.to) });
        } else if (act === 'open') openDetail(toId(target.dataset.from), toId(target.dataset.to));
        else if (act === 'close') closeDetail();
        else if (act === 'hide') hideGood(toId(target.dataset.c));
        else if (act === 'unhide') {
            prefs.hidden = prefs.hidden.filter((id) => id !== toId(target.dataset.c));
            savePrefs();
            rebuild();
            focusAfterDraw = 'routes-good';
            requestDraw();
        } else if (act === 'more') {
            view.limit = Math.min(500, view.limit + PAGE);
            requestDraw();
        } else if (act === 'clear') {
            Object.assign(view, { c: null, from: null, to: null, sort: 'perHour', st: false, full: false, fresh: false, limit: PAGE });
            focusAfterDraw = 'routes-good';
            syncHash(false);
            requestDraw();
        } else if (act === 'show-illegal') {
            if (linkSetup) return;
            prefs.legalOnly = false;
            savePrefs();
            ui.contextOpen = true;
            ui.optionsOpen = true;
            focusAfterDraw = 'routes-legal';
            requestDraw();
        } else if (act === 'retry-prices') loadPrices(false);
        else if (act === 'refresh') {
            focusAfterDraw = ['routes-refresh', 'routes-count', 'routes-detail-title'];
            loadPrices(true);
        } else if (act === 'retry-names') {
            focusAfterDraw = ['routes-count', 'routes-detail-title'];
            loadNames(false);
        } else if (act === 'retry-game') loadGame();
        else if (act === 'link-drop') {
            linkSetup = null;
            focusAfterDraw = 'routes-ship';
            syncHash(false);
            requestDraw();
        } else if (act === 'focus') {
            ui.contextOpen = true;
            if (target.dataset.open) ui[target.dataset.open] = true;
            focusAfterDraw = target.dataset.target || '';
            draw();
            document.getElementById(target.dataset.target || '')?.scrollIntoView({ block: 'center', behavior: 'instant' });
        } else if (act === 'share') {
            H.copyShareUrl(SECTION, { ...hashParams(), ...linkParams() }).then((ok) => {
                ui.notice = ok ? `${H.text('copied')} ${t('shareNote')}` : H.text('copyFailed');
                requestDraw();
            });
        } else if (act === 'compare-toggle') {
            ui.compareAll = !ui.compareAll;
            requestDraw();
        } else if (act === 'use-ship') {
            if (linkSetup) return;
            focusAfterDraw = 'routes-detail-title';
            E.state.set({ ship: target.dataset.ship });
        } else if (act === 'steps-clear') {
            delete steps[view.d];
            writeStore(STEP_KEY, steps);
            focusAfterDraw = 'routes-step-buy';
            requestDraw();
        } else if (act === 'my-edit') {
            ui.edit = ui.edit === target.dataset.key ? null : target.dataset.key;
            ui.editError = false;
            if (ui.edit) focusAfterDraw = 'routes-my-buy';
            requestDraw();
        } else if (act === 'my-cancel') {
            const [from, to, c] = String(ui.edit || '').split('.');
            focusAfterDraw = `routes-diff-${from}-${to}-${c}`;
            ui.edit = null;
            ui.editError = false;
            requestDraw();
        } else if (act === 'my-clear') {
            delete myPrices[`${target.dataset.from}:${target.dataset.c}:b`];
            delete myPrices[`${target.dataset.to}:${target.dataset.c}:s`];
            writeStore(PRICE_KEY, myPrices);
            ui.edit = null;
            focusAfterDraw = `routes-diff-${target.dataset.from}-${target.dataset.to}-${target.dataset.c}`;
            rebuild();
            requestDraw();
        } else if (act === 'mine-remove') {
            delete myPrices[target.dataset.key];
            writeStore(PRICE_KEY, myPrices);
            focusAfterDraw = [target.id, target.id.replace(/\d+$/, '0'), 'routes-detail-title', 'routes-good'];
            rebuild();
            requestDraw();
        } else if (act === 'time-reset') {
            if (linkSetup) return;
            focusAfterDraw = 'routes-time-loading';
            E.state.set({ time: {} });
        }
    }

    function onChange(event) {
        const target = event.target;
        if (!target || !root.contains(target) || !target.dataset.act || !target.matches('input, select')) return;
        const act = target.dataset.act;
        const value = target.value;
        if (linkSetup && LOCKED.has(act)) {
            requestDraw();
            return;
        }
        if (act === 'ship') E.state.set({ ship: value || null });
        else if (act === 'budget') {
            const amount = parseMoney(value);
            ui.budgetError = amount === undefined;
            if (amount === undefined) requestDraw();
            else E.state.set({ budget: amount });
        } else if (act === 'system') E.state.set({ system: value || null });
        else if (act === 'age') E.state.set({ maxAgeDays: Number(value) || H.DEFAULT_PRICE_AGE_DAYS });
        else if (act === 'box') {
            const size = Number(target.dataset.size);
            const current = E.state.get().boxes || E.STANDARD_BOXES;
            const next = target.checked ? [...current, size] : current.filter((entry) => entry !== size);
            if (!next.length) {
                painted.delete(shell.context); // 하나는 켜 두어야 한다: 표시를 되돌린다.
                requestDraw();
                return;
            }
            E.state.set({ boxes: next });
        } else if (act === 'time-loading') setTime({ loading: value === 'manual' ? 'manual' : 'auto' });
        else if (act === 'time') {
            const seconds = Number(String(value).trim());
            if (String(value).trim() !== '' && Number.isFinite(seconds) && seconds >= 0) setTime({ [target.dataset.key]: Math.round(seconds) });
            else setTime({ [target.dataset.key]: null });
            painted.delete(shell.time); // 못 읽은 값은 기본값으로 되돌려 보여 준다.
            requestDraw();
        } else if (act === 'step') {
            const done = new Set(Array.isArray(steps[view.d]) ? steps[view.d] : []);
            if (target.checked) done.add(target.dataset.step);
            else done.delete(target.dataset.step);
            if (done.size) {
                delete steps[view.d];
                steps[view.d] = [...done];
            } else delete steps[view.d];
            Object.keys(steps).slice(0, -30).forEach((key) => { delete steps[key]; }); // 최근 30개 경로만 남긴다.
            writeStore(STEP_KEY, steps);
            requestDraw();
        } else {
            if (act === 'goods') prefs.goods = Math.min(5, Math.max(1, Number(value) || 1));
            else if (act === 'legal') prefs.legalOnly = target.checked;
            else if (act === 'return') prefs.returnTrip = target.checked;
            else if (act === 'avoid') prefs.avoidFull = target.checked;
            else if (act === 'capacity') {
                const raw = String(value).trim();
                const amount = Number(raw);
                const ok = raw === '' || (Number.isFinite(amount) && amount >= 1);
                ui.capacityError = !ok; // 못 읽는 값은 말없이 버리지 않고 알린다.
                prefs.capacityScu = raw !== '' && ok ? Math.floor(amount) : null;
                painted.delete(shell.context);
            } else if (act === 'good') view.c = toId(value);
            else if (act === 'from') view.from = toId(value);
            else if (act === 'to') view.to = toId(value);
            else if (act === 'sort') view.sort = SORTS.includes(value) ? value : 'perHour';
            else if (act === 'st') view.st = target.checked;
            else if (act === 'full') view.full = target.checked;
            else if (act === 'fresh') view.fresh = target.checked;
            else return;
            view.limit = PAGE;
            savePrefs();
            syncHash(false);
            requestDraw();
        }
    }

    function onSubmit(event) {
        const form = event.target.closest('form[data-form="my-price"]');
        if (!form || !root.contains(form)) return;
        event.preventDefault();
        saveMyPrice(form);
    }

    function onToggle(event) {
        const fold = event.target?.dataset?.fold;
        if (fold) ui[fold] = event.target.open;
    }

    window.VOLT_ROUTES = {
        init(mount, ctx) {
            root = mount;
            loadLocal();
            readParams(ctx?.params);
            root.addEventListener('click', onClick);
            root.addEventListener('change', onChange);
            root.addEventListener('submit', onSubmit);
            root.addEventListener('toggle', onToggle, true);
            E.state.subscribe(() => {
                ui.budgetError = false;
                requestDraw();
            });
            draw();
            loadGame();
            loadPrices(false);
            window.VOLT_STARMAP?.links?.load?.().then((ready) => { if (ready) requestDraw(); });
        },
        onLanguageChange() {
            draw();
        },
        onRoute(params) {
            const before = detailPair();
            readParams(params);
            if (view.d) {
                if (!before) listScroll = window.scrollY;
                focusAfterDraw = 'routes-detail-title';
                scrollAfterDraw = { detail: true };
            } else if (before) backToList(before);
            requestDraw();
        },
    };
})();
