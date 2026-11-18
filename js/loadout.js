/**
 * VOLT 로드아웃 편집기 화면 계층.
 *
 * 함선을 고르고, 장착 자리마다 크기·종류가 맞는 부품으로 바꿔 끼우며
 * 화력·방어·동력·양자 항행과 구매 비용을 확인한다.
 * - 수치 자료: data/loadout/*.json (출처: 설치된 게임 파일. scripts/loadout/build-loadout-data.mjs로 생성)
 * - 구매처·가격: /api/uex/loadout-prices (출처 UEX)
 * - 계산: js/loadout-calc.js (window.VOLT_LOADOUT_CALC)
 * 공용 유틸은 main.js가 init(deps)로 주입한다. 로드 순서: loadout-calc.js → loadout.js → main.js.
 */
(function () {
    'use strict';

    const calc = window.VOLT_LOADOUT_CALC;
    const planner = window.VOLT_LOADOUT_PLANNER;
    const PLAN_KEY = 'volt-loadout-plan-v1';
    const STORAGE_KEY = 'volt-loadout-v1';
    const CART_KEY = 'volt-loadout-cart-v1';
    const DATA_BASE = 'data/loadout';
    let deps = {};
    const state = {
        meta: null, index: null, items: null, ko: null, ship: null, shipCls: '', overrides: {},
        operation: { power: {}, activeModules: {} }, systems: {}, assemblies: new Set(), mining: [],
        equipmentGroup: '', query: '', openPath: '', pickerOrigin: '', pickerQuery: '', pickerSort: 'best', pickerGrade: '', pickerClass: '', pickerDamage: '', pickerKind: '', pickerBuyable: false, pickerBulk: false, error: '', loading: false,
        prices: new Map(), priceState: new Map(), priceNames: new Map(), priceIds: new Map(), plan: { mode: 'cheapest', shops: {}, order: [] }, familyOpen: new Set(), keepPicker: false,
        shipMarket: { status: 'idle', data: [], fetchedAt: '' },
        cartOpen: false, detailShop: '', detailId: '', detailSlot: '', detailReturn: '', detailTab: 'stats', collapsed: new Set(), compact: false, changedOnly: false, redo: [], pickerLimit: 80, pickerReverse: false,
        tab: '', cart: {}, buildName: '', finderType: '', finderQuery: '', finderSize: '', finderSort: 'best', finderBuyable: false, finderLimit: 40, qtDistance: 30, compare: null, off: {}, shipMfr: '', shipKind: '', history: [], split: {}, buildsOpen: false, slot: 'A', alt: null,
    };

    // 화면 문구(이 구역 전용). 정적 제목·설명은 js/i18n.js의 loadout.* 키를 쓴다.
    const TEXT = {
        ko: {
            shipMarketTitle: '함선 판매처', shipMarketLoading: '함선 판매처 확인 중…', shipMarketEmpty: 'UEX에서 확인된 인게임 판매처가 없습니다.', shipMarketUnmatched: 'UEX에서 같은 함선을 확인하지 못했습니다.', shipMarketError: '함선 판매처를 불러오지 못했습니다.', shipMarketMore: '다른 판매처 {count}곳', shipMarketSource: 'UEX 커뮤니티 제보 · 실시간 재고가 아닙니다.', shipMarketNameMatch: '영문 이름 일치 기준 · UEX 고유번호 없음', shipMarketDate: '가격 제보', shipMarketFetched: '자료 조회', signatures: '시그니처', powerSummary: '정격 출력·냉각',
            powerPlanTitle: '전력·캐패시터 분배', allocation: '배정 전력', minimumPower: '최소 전력', detectionYes: '가능', detectionNo: '불가', radarPing: '핑 재사용 대기', radarPassive: '수동 탐지', radarActive: '능동 탐지', powerBudget: '{used} / {total}칸 배정', powerBudgetHelp: '장착한 파워플랜트 출력 안에서 배정합니다. 다른 계통을 늘리려면 먼저 칸을 비워 주세요. 부분 전력의 탄창·충전 속도·실드 재생 환산식은 미검증이므로 성능은 정격 기준입니다.', powerAuto: '자동 배분', powerRated: '배정 초기화', powerClear: '모두 비우기', powerSupply: '파워플랜트 공급 {total}칸', powerLess: '{name} 배정 줄이기', powerMore: '{name} 배정 늘리기', powerAvailable: '지금 배정 가능 {max}칸', powerReserve: '남은 전력', powerOver: '초과 배정', powerMinimum: '작동 최소 {min} · 최대 {max}칸',
            power_weapons: '무기', power_engines: '엔진', power_shields: '실드', power_radar: '레이더', power_lifeSupport: '생명 유지', power_coolers: '쿨러', power_quantum: '퀀텀', power_mining: '채광', power_utility: '작업 장비', power_other: '기타',
            jumpEquipment: '장비 편집', jumpPower: '전력 분배', powerBase: '최소 {min}칸', powerPip: '{name} {value}칸 배정', powerGuide: '큰 칸은 작동 최소 전력, 작은 칸은 추가 전력입니다. 성능 수치는 정격 기준입니다.', powerHelp: '전력 분배·계산 기준', powerEmpty: '미배정', powerLimitShort: '최대 {max}칸',
            miningResults: '헤드별 채광 성능', extractionPower: '추출 출력', miningBase: '헤드 기본', miningApplied: '적용 출력', unverifiedStack: '출력 계산 미확인', miningOverlap: '겹치는 보정은 합치지 않고 개별 효과로 표시합니다.', engageModule: '효과 활성화', disengageModule: '효과 비활성화', moduleDuration: '지속 시간', moduleCharges: '사용 횟수', activeNow: '활성 상태', inactiveNow: '대기 상태', miningEffects: '보정 출처', aimBuffer: '조준 보조 유지 여유', passiveDetection: '수동 탐지 허용', activeDetection: '능동 탐지 허용', assemblyExpand: '하위 장비 펼치기', assemblyCollapse: '하위 장비 접기', assemblyWeapons: '무기 {count}정', shatterMod: '파편 피해',
            actions: '구성 작업', shipProfile: '함선 정보', pickShop: '이 상점 선택', planHelpTitle: '구매 방식 안내', addAndViewCart: '담고 장바구니 보기', swapPart: '부품 교체',
            superUtility: '채광·작업', visibleSlots: '{shown}곳 표시 / 전체 {count}곳',
            radarSensitivity: '민감도', radarPiercing: '투과 계수', aimMin: '조준 보조 최소 거리', aimMax: '조준 보조 최대 거리',
            radarNote: '게임 자료의 기본 계수입니다. 실제 탐지 거리나 전력 배분에 따른 변화는 계산하지 않습니다.',
            modulePower: '레이저 출력 배수', moduleExtraction: '추출 출력 배수', moduleCharge: '최적 구간 충전 속도 보정',
            passiveModule: '상시 적용 모듈', activeModule: '활성형 모듈', moduleNote: '헤드별 출력에 확인된 단일 배수를 적용합니다. 활성형은 효과를 켜야 반영됩니다. 겹치는 보정의 중첩 결과는 계산하지 않습니다.',
            shipImpact: '현재 함선 성능', stockComparison: '기본 구성 대비 변화', meteorRack: 'RSI 미티어 기본 랙', cycloneRack: '사이클론 MT 전용 랙',
            equipmentHint: '부품 이름을 눌러 교체 후보를 비교하세요.',
            capacitorSize: '축전 탄창', capacitorDelay: '축전 재충전 지연', partDetails: '부품 상세', statsTab: '성능', shopsTab: '판매처', craftTab: '제작', craftTime: '제작 시간', craftMaterials: '재료', craftPieces: '낱개 재료', craftAmount: '필요량', craftCount: '{count}개', craftWhere: '캐는 곳 보기', craftNote: '게임 파일 설계도의 첫 단계 재료입니다. 상위 단계·품질 보정은 포함하지 않으며 게임 안에서 확인한 값이 아닙니다.', craftUnmapped: '채광 위치 미확인', craftMinutes: '{m}분 {s}초', craftHours: '{h}시간 {m}분', backToList: '목록으로', previewCompare: '현재 장착 부품과 비교', collapseAll: '장비 모두 접기', expandAll: '장비 모두 펼치기', compactView: '간결하게 보기', changedOnly: '변경한 장비만', noChanges: '변경한 장비가 없습니다.', redo: '다시 실행', equippedNotice: '{name} 장착 완료', detailMissing: '현재 자료에 없는 수치는 표시하지 않습니다.', detailBasis: '기본 부품 수치입니다. 함선 전력 배분과 운용 조건은 반영하지 않습니다.', hpLabel: '부품 내구도', heatShot: '발당 발열', coolingRate: '초당 냉각', coolingDelay: '냉각 시작 지연', heatCapacity: '과열 온도', regenRate: '초당 축전 충전', magSize: '탄창', perProjectile: '발당 피해', fullCharge: '완전 충전 시간', detailCompare: '비교 부품', noComparable: '같은 종류의 비교 부품이 없습니다.',
            refreshFailed: '판매처를 새로 확인하지 못했습니다. 이전에 받은 정보가 표시될 수 있습니다.', planMode: '구매 방식', planCheapest: '최저가 우선', planGrouped: '같은 상점에 모으기', planHelp: '직접 지정한 상점은 유지합니다. 자동 배정은 가장 많은 종류를 파는 상점부터 묶고, 종류 수가 같으면 합계가 싼 곳을 고릅니다. 최단 이동 경로를 계산하는 기능은 아닙니다.', planAuto: '자동 배정', planShop: '구매 상점', planReset: '상점 지정 해제', planMissing: '지정한 상점의 판매 정보를 확인할 수 없습니다. 다른 상점을 선택해 주세요.', planRoute: '방문 순서', planStops: '방문 상점 {count}곳', planUp: '앞으로 이동', planDown: '뒤로 이동', planCopy: '구매 계획 복사', planCopied: '구매 계획을 복사했습니다.', planExtra: '최저가 합계보다 {price} 높음', planUnknown: '판매처 미확인 {count}종은 합계에서 제외됩니다.', refreshPrices: '판매처 새로고침', refreshingPrices: '판매처 확인 중', keepPicker: '교체 후 목록 유지', variants: '도색·변종 {count}종', variantBase: '원형', pickerCart: '현재 부품 장바구니에 담기', liveShipsOnly: '출시가 확인된 함선만 표시합니다.',
            equipmentNav: '장비 종류', allEquipment: '전체 장비', clearFilters: '검색·필터 초기화', filteredEmpty: '조건에 맞는 부품이 없습니다. 검색어나 필터를 바꿔 보세요.', firepower: '화력', defense: '방어', systems: '파워·쿨러·시그니쳐', weaponCount: '무기', regenLabel: '실드 재생률', perSecond: '/초', seconds: '초',
            shieldCount: '실드 제너레이터', unitCount: '{count}기', signatureEm: 'EM 시그니쳐', signatureIr: 'IR 시그니쳐', qdSpeedLabel: '퀀텀 속도', spoolLabel: '스풀링', cooldownLabel: '쿨다운',
            equipped: '장착', costAll: '바꾼 부품 전부 상점 최저가 기준', crew: '승무원 {count}명', stockState: '기본 장착 상태', offState: '전원 꺼짐 {count}곳', rangeWarning: '항속 {range} Gm 초과 · 중간 급유가 필요합니다.', distanceInvalid: '1~999 Gm 사이 거리를 입력해 주세요.', changedCount: '{count}곳 변경됨',
            burstDps: '순간 DPS', laserPower: '레이저 출력', instab: '불안정성', resistMod: '저항성', windowMod: '최적 충전 구간', blastRadius: '폭발 반경', empDmg: '디스토션 피해', radiusShort: '반경', chargeShort: '충전', jamRange: '차단 거리', rackCount: '탑재 수', rackSize: '탄 크기', regenDelay: '피격 뒤 재생 지연', fuelUse: '연료 소모', rackFact: 'S{size} {count}발 탑재', abLabel: '구성 전환', abGo: '구성 {slot}로 전환', abSlot: '구성 {slot}', abStarted: '구성 {slot}를 지금 구성과 같게 만들어 열었습니다. 여기서 바꿔 보고 「구성 비교」에서 견줘 보세요.', abSwitched: '구성 {slot}로 바꿨습니다.', abCompare: '구성 A · B 비교', abHint: '「B」를 누르면 지금 구성을 복제해 바로 다른 부품을 실험할 수 있습니다. 저장은 마음에 드는 구성을 찾은 뒤에 해도 됩니다.', abOpen: '구성 {slot}에서 실험 시작', abCopy: '지금 구성을 {slot}에 덮어쓰기', abCopied: '지금 구성을 구성 {slot}에 복사했습니다.', savedCompare: '저장한 구성과 비교', perShot2: '발당 {value}', totalDmg: '합계 피해', rackOn: 'S{size} {type}', dpsHelp: 'DPS 계산 기준', regenDelayShort: '재생 지연', counterLabel: '디코이 · 노이즈', counterValue: '{decoy}발 · {noise}발', empRow: 'EMP', empValue: '디스토션 {dmg} · 반경 {radius}m · 충전 {charge}초', dampRow: '퀀텀 차단기', dampValue: '차단 거리 {range}m', sustainDps: '지속 DPS', sustainShort: '지속', burstHint: '순간 DPS는 쉬지 않고 쏘는 동안의 값이고, 지속 DPS는 과열되거나 축전 탄창이 비어 쉬는 시간까지 넣어 오래 쏠 때의 평균입니다. 실탄 무기는 과열, 에너지 무기는 축전 탄창이 기준입니다.', limitCol: '오래 쏠 때', limitHeat: '{fire}초 쏘면 과열 · {down}초 뒤 재사격', limitCap: '{fire}초 쏘면 축전 소진 · 재충전 {down}초', limitNone: '제한 없음', ammoTime: '{value}초분', colPart: '부품', colPrice: '최저가', dmg_energy: '에너지', dmg_ballistic: '실탄', dmg_distortion: '디스토션', kind_repeater: '리피터', kind_cannon: '캐논', kind_gatling: '개틀링', kind_scattergun: '스캐터건', kind_beam: '빔', sortHint: '{label} 기준으로 줄 세우기',
            sortLabel: '정렬', sort_best: '성능순', sort_name: '이름순', sort_price: '가격 낮은순', filterLabel: '부품 걸러 보기', buyableOnly: '상점 판매만',
            bulkApply: '같은 부품이 달린 {count}곳을 한 번에 교체', powerShort: '출력', coolingShort: '냉각',
            flight: '비행 성능', scmSpeed: 'SCM 속도', boostSpeed: '부스트 속도', boostBack: '부스트 후진', navSpeed: '최고 속도 (NAV)', pitch: '피치', yaw: '요', roll: '롤', degPerSec: '°/초',
            hullArmor: '선체·장갑', hullHp: '선체 내구도', hullNote: '선체 내구도는 부위별 내구도를 모두 더한 값입니다. 장갑 수치는 받는 피해의 비율이라 낮을수록 단단합니다.', armorHp: '장갑 내구도', mass: '질량', armorTaken: '{type} 피해 받는 비율', armorSignal: '장갑 시그니쳐 배율',
            rangeLabel: '항속 거리', qtFuel: '퀀텀 연료', h2Fuel: '수소 연료', travelFor: '이동 거리 (Gm)', travelTime: '예상 이동 시간', travelNote: '항속 거리와 이동 시간은 게임 파일 수치로 계산한 어림값입니다.', minSec: '{min}분 {sec}초',
            tab_compare: '구성 비교', compareWith: '비교', compareEmpty: '「저장한 로드아웃」에서 「비교」를 누르면 지금 구성과 나란히 견줘 볼 수 있습니다. 먼저 구성을 하나 저장해 보세요.', compareNow: '지금 구성', compareItem: '항목', compareDiff: '차이 (지금 − 비교 대상)', compareClear: '비교 끝내기',
            missileTable: '미사일·폭탄', lockShort: '락온', trackShort: '추적 방식', dmgShort: '피해',
            powerOff: '전원 끄기', powerOn: '전원 켜기', poweredOff: '전원 꺼짐', powerSpare: '남는 출력', powerShort2: '출력 부족', offCount: '부품 {count}개의 전원을 꺼 둔 상태입니다. 꺼진 부품은 화력·실드·소비 전력·시그니쳐 계산에서 빠집니다.', capacitor: '축전 {load}발 · 초당 {rate}발 재생',
            allMakers: '제조사 전체', makerFilter: '제조사', kindAll: '전체', kindShip: '우주선', kindGround: '지상 차량', kindFilter: '종류',
            kpiLabel: '핵심 수치', kpiShield: '실드', kpiHull: '선체', kpiRange: '항속', kpiAlpha: '알파', superArms: '무장', superDefense: '방어·동력', superTravel: '이동·기타', slotCount: '{count}곳',
            buildSaveFail: '저장하지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.', priceRetry: '다시 시도',
            tableRegion: '표 (좌우로 넘겨 볼 수 있음)',
            mountChange: '마운트 변경', rackChange: '랙 교체', fixedRack: '고정 랙 · 교체 불가', mountedOn: '장착 방식', equip: '장착', regenShort: '재생률', sortBy: '{label}순', buildsToggle: '저장·불러오기', comparePick: '비교할 구성', compareChoose: '비교할 저장 구성을 고르세요.', compareNone: '저장한 구성이 없습니다. 위의 「저장·불러오기」에서 지금 구성을 먼저 저장해 보세요.', fullLoad: '최대 가동 기준', detail: '지금 장착',
            splitRun: '하나씩 보기', mergeRun: '묶어 보기', runNote: '같은 부품이 달린 이 줄의 {count}곳을 함께 바꿉니다.', powerUseLabel: '소비 전력', better: '유리', worse: '불리',
            sourceBrief: '자료 출처 · 게임 파일 {version} · 가격 UEX · 한국어 패치 표기', role: '역할',
            variantNote: '함선 전용 변형', undo: '직전 변경 취소', undone: '직전 변경을 취소했습니다.', pickSlotHint: '왼쪽 목록에서 바꿀 자리의 「변경」을 누르면 여기에 맞는 부품이 나옵니다.',
            tabsLabel: '로드아웃 화면', tab_slots: '장착', tab_weapons: '무기 상세', tab_finder: '부품 찾기', tab_cart: '장바구니',
            cartEmpty: '장바구니가 비어 있습니다. 부품 찾기나 부품 선택 창에서 「담기」를 눌러 보세요.', cartSummary: '부품 {kinds}종 · {count}개', cartClear: '장바구니 비우기', cartRemove: '빼기',
            cartAdd: '담기', cartAdded: '장바구니에 담았습니다.', inCart: '담음 {count}', cartAddChanged: '바꾼 부품 장바구니에 담기', cartByShop: '상점별로 살 것', qtyLess: '수량 줄이기', qtyMore: '수량 늘리기',
            finderType: '부품 종류', finderCount: '{count}종', finderMore: '더 보기 ({count}종 남음)',
            weaponsNone: '장착된 무기가 없습니다.', whoFires: '사수', dpsSum: 'DPS 합', alphaShort: '알파', rpmShort: '분당 발사', speedShort: '탄속', rangeShort: '사거리', dmgKind: '피해 종류', ammoShort: '탄약', ammoRegen: '재생식',
            resist: '{type} 저항', builds: '저장한 로드아웃', buildName: '이름 (비우면 함선명+날짜)', buildSave: '현재 구성 저장', buildSaved: '로드아웃을 저장했습니다.', buildDelete: '삭제', buildsEmpty: '저장한 로드아웃이 없습니다. 이 브라우저에만 저장됩니다.',
            pickShip: '함선 선택', searchShip: '함선명 또는 제조사 검색', noShip: '검색 결과가 없습니다.', shipCount: '전체 {count}척', shipFound: '검색 결과 {count}척', browseShips: '함선 바꾸기', hideShips: '목록 접기',
            loading: '자료를 불러오는 중입니다.', loadFail: '로드아웃 자료를 불러오지 못했습니다.', retry: '다시 시도',
            summary: '요약', dps: 'DPS (초당 피해)', pilot: '파일럿', turret: '터렛', alpha: '알파 (1회 피해)', weapons: '무기 {count}정',
            missiles: '미사일·폭탄 피해', missileCount: '{count}발 탑재', shield: '실드', shieldRegen: '재생률 {value}/초', power: '파워 플랜트 출력', powerUse: '모든 장비 최대 가동 시 {use} 필요',
            cooling: '쿨러 냉각량', coolingUse: '쿨러 합계', quantum: '퀀텀 드라이브', quantumNone: '퀀텀 드라이브 없음', spool: '스풀링 {value}초', range: '항속 {value} Gm',
            cost: '바꾼 부품 구매 비용', costUnknown: '{count}종은 판매처 정보 없음', costNone: '바꾼 부품이 없습니다', same: '동일', dmgWord: '피해', lootNote: '판매처를 확인하지 못한 부품은 합계에서 제외합니다. UEX 자료 누락·매칭 실패 또는 파밍(전리품) 전용 부품일 수 있으므로 실제 판매하지 않는다고 단정할 수 없습니다.',
            part: '부품', slots: '장착 자리', change: '변경', close: '닫기', reset: '기본값', empty: '비어 있음', removeItem: '비우기', fixed: '전용 · 교체 불가',
            changed: '변경됨', defaultMark: '기본', pickerSearch: '부품 이름 검색', pickerEmpty: '이 자리에 맞는 부품이 없습니다.', pickerCount: '맞는 부품 {count}종',
            select: '장착', selected: '장착 중', priceFrom: '최저 {price}', priceShops: '판매처 {count}곳', priceNone: '판매처 정보 없음', priceLoading: '가격 확인 중',
            priceFail: '가격을 불러오지 못했습니다', shopping: '구매 목록', shoppingEmpty: '부품을 바꾸면 여기에 살 곳과 가격이 정리됩니다.', qty: '수량', cheapest: '가장 싼 곳', subtotal: '소계', total: '합계',
            share: '공유 링크 복사', shareOk: '공유 링크를 복사했습니다.', shareFail: '링크를 복사하지 못했습니다.', resetAll: '전체 기본값으로', resetOk: '기본 장착으로 되돌렸습니다.',
            sourceStats: '함선·부품 수치', sourcePrices: '구매처·가격', sourceTerms: '한국어 표기', sourceGame: 'Star Citizen 게임 파일에서 직접 추출', sourceVersion: '게임 자료 버전 {version}', sourceNote: '비공식 팬 사이트입니다. 수치는 게임 패치에 따라 달라지며, 화력 등은 자체 계산이라 실제 게임과 차이가 있을 수 있습니다.',
            size: '크기', grade: '등급', rpm: '분당 {value}발', perShot: '1발 {value}', speed: '탄속 {value}m/s', reach: '사거리 {value}m', hp: '내구 {value}',
            gen: '출력 {value}', coolGen: '냉각 {value}', qdSpeed: '{value} km/s', dmg: '피해 {value}', lock: '락온 {value}초', signal: '{value} 추적',
            groups: { weapon: '무기·터렛', missile: '미사일·폭탄', shield: '실드 제너레이터', power: '파워 플랜트', cooler: '쿨러', quantum: '퀀텀 드라이브', radar: '레이더', mining: '채광 장비', utility: '작업 장비', other: '기타 장비' },
            types: {
                WeaponGun: '기총', Turret: '터렛', TurretBase: '유인 터렛', UtilityTurret: '유틸리티 터렛', MissileLauncher: '미사일 랙', BombLauncher: '폭탄 랙',
                GroundVehicleMissileLauncher: '차량 미사일 랙', Missile: '미사일', Bomb: '폭탄', Shield: '실드 제너레이터', PowerPlant: '파워 플랜트', Cooler: '쿨러',
                QuantumDrive: '퀀텀 드라이브', JumpDrive: '점프 모듈', Radar: '레이더', WeaponMining: '채광 레이저 헤드', WeaponDefensive: '디펜시브', EMP: 'EMP',
                QuantumInterdictionGenerator: '퀀텀 차단기', SalvageHead: '샐비징 빔', SalvageModifier: '샐비징 모듈', MiningModifier: '채광 모듈', TractorBeam: '트랙터 빔',
                TowingBeam: '견인 빔', ToolArm: '채광 암', WeaponMount: '무기 마운트', Module: '모듈', Container: '컨테이너', Misc: '기타',
            },
            classes: { Military: '군용', Civilian: '시민', Industrial: '산업', Stealth: '스텔스', Competition: '경쟁' },
            damage: { physical: '물리', energy: '에너지', distortion: '디스토션', thermal: '열', biochemical: '생화학', stun: '스턴' },
            signals: { CrossSection: 'CS', Infrared: 'IR', Electromagnetic: 'EM' },
            tokens: { left: '왼쪽', right: '오른쪽', top: '위', bottom: '아래', front: '앞', rear: '뒤', back: '뒤', nose: '기수', wing: '날개', wingtip: '날개 끝', pilot: '파일럿', tail: '꼬리', center: '중앙', upper: '상부', lower: '하부', side: '측면', chin: '턱', remote: '원격', copilot: '부조종사', door: '문' },
        },
        en: {
            shipMarketTitle: 'Ship purchase locations', shipMarketLoading: 'Checking ship sellers…', shipMarketEmpty: 'No in-game sellers reported by UEX.', shipMarketUnmatched: 'No matching ship could be verified in UEX.', shipMarketError: 'Could not load ship sellers.', shipMarketMore: '{count} more sellers', shipMarketSource: 'UEX community reports · not live stock.', shipMarketNameMatch: 'Exact English name match · UEX UUID missing', shipMarketDate: 'Price reported', shipMarketFetched: 'Data fetched', signatures: 'Signatures', powerSummary: 'Rated power & cooling',
            powerPlanTitle: 'Power & capacitor allocation', allocation: 'Allocated power', minimumPower: 'Minimum power', detectionYes: 'Supported', detectionNo: 'Unsupported', radarPing: 'Ping cooldown', radarPassive: 'Passive detection', radarActive: 'Active detection', powerBudget: '{used} / {total} pips allocated', powerBudgetHelp: 'Allocation is limited to the installed power plants. Free pips in another system before adding more. Partial-power ammo, recharge and shield-regeneration rules are unverified; performance remains rated.', powerAuto: 'Auto allocate', powerRated: 'Reset allocation', powerClear: 'Clear allocation', powerSupply: 'Power plants supply {total} pips', powerLess: 'Reduce {name} allocation', powerMore: 'Increase {name} allocation', powerAvailable: 'Available now: {max} pips', powerReserve: 'Unallocated power', powerOver: 'Over budget', powerMinimum: 'Minimum {min} · maximum {max} pips',
            power_weapons: 'Weapons', power_engines: 'Engines', power_shields: 'Shields', power_radar: 'Radar', power_lifeSupport: 'Life support', power_coolers: 'Coolers', power_quantum: 'Quantum', power_mining: 'Mining', power_utility: 'Utility', power_other: 'Other',
            jumpEquipment: 'Edit equipment', jumpPower: 'Power allocation', powerBase: 'Minimum {min}', powerPip: 'Allocate {value} pips to {name}', powerGuide: 'Large blocks are minimum operating power; small blocks add power. Performance values remain rated.', powerHelp: 'Allocation & calculation notes', powerEmpty: 'Unallocated', powerLimitShort: 'Max {max}',
            miningResults: 'Mining performance by head', extractionPower: 'Extraction power', miningBase: 'Base head', miningApplied: 'Applied output', unverifiedStack: 'Output unverified', miningOverlap: 'Overlapping modifiers remain separate; no unverified combined value is applied.', engageModule: 'Activate effect', disengageModule: 'Deactivate effect', moduleDuration: 'Duration', moduleCharges: 'Charges', activeNow: 'Active', inactiveNow: 'Standby', miningEffects: 'Modifier sources', aimBuffer: 'Aim-assist retention buffer', passiveDetection: 'Passive detection allowed', activeDetection: 'Active detection allowed', assemblyExpand: 'Expand child equipment', assemblyCollapse: 'Collapse child equipment', assemblyWeapons: '{count} weapons', shatterMod: 'Shatter damage',
            actions: 'Actions', shipProfile: 'Ship information', pickShop: 'Pick this shop', planHelpTitle: 'Purchase planning help', addAndViewCart: 'Add and view cart', swapPart: 'Swap component',
            superUtility: 'Mining & utility', visibleSlots: '{shown} shown / {count} total slots',
            radarSensitivity: 'Sensitivity', radarPiercing: 'Piercing factor', aimMin: 'Minimum aim-assist distance', aimMax: 'Maximum aim-assist distance',
            radarNote: 'Base game-file coefficients. Detection distance and changes from power allocation are not calculated.',
            modulePower: 'Laser power multiplier', moduleExtraction: 'Extraction power multiplier', moduleCharge: 'Optimal charge rate modifier',
            passiveModule: 'Passive module', activeModule: 'Active module', moduleNote: 'Verified single multipliers update the parent head. Active modules require activation. Overlapping modifier composition is not calculated.',
            shipImpact: 'Current ship performance', stockComparison: 'Change from stock setup', meteorRack: 'RSI Meteor stock rack', cycloneRack: 'Cyclone MT bespoke rack',
            equipmentHint: 'Select a component name to compare replacements.',
            capacitorSize: 'Capacitor capacity', capacitorDelay: 'Capacitor recharge delay', partDetails: 'Component details', statsTab: 'Stats', shopsTab: 'Shops', craftTab: 'Crafting', craftTime: 'Craft time', craftMaterials: 'Materials', craftPieces: 'Loose materials', craftAmount: 'Needed', craftCount: '{count} pcs', craftWhere: 'Where to mine', craftNote: 'First-tier recipe from the game files. Higher tiers and quality modifiers are not included; not confirmed in game.', craftUnmapped: 'Mining location unverified', craftMinutes: '{m} min {s} s', craftHours: '{h} h {m} min', backToList: 'Back to list', previewCompare: 'Compare with equipped part', collapseAll: 'Collapse equipment', expandAll: 'Expand equipment', compactView: 'Compact view', changedOnly: 'Changed equipment only', noChanges: 'No equipment has changed.', redo: 'Redo', equippedNotice: '{name} equipped', detailMissing: 'Values missing from the current data are not shown.', detailBasis: 'Base component values; ship power allocation and operating conditions are not applied.', hpLabel: 'Component health', heatShot: 'Heat per shot', coolingRate: 'Cooling per second', coolingDelay: 'Cooling delay', heatCapacity: 'Overheat temperature', regenRate: 'Capacitor regen per second', magSize: 'Magazine', perProjectile: 'Damage per shot', fullCharge: 'Full charge time', detailCompare: 'Comparison part', noComparable: 'No component of the same type to compare.',
            refreshFailed: 'Could not refresh shops. Previously fetched offers may still be shown.', planMode: 'Purchase strategy', planCheapest: 'Lowest price', planGrouped: 'Group at shared shops', planHelp: 'Manual shop choices stay fixed. Automatic assignment picks the shop selling the most remaining product types, then the lowest combined cost. This does not calculate the shortest travel route.', planAuto: 'Automatic', planShop: 'Purchase shop', planReset: 'Clear shop choices', planMissing: 'The chosen shop offer is unavailable. Select another shop.', planRoute: 'Visit order', planStops: '{count} shops to visit', planUp: 'Move earlier', planDown: 'Move later', planCopy: 'Copy purchase plan', planCopied: 'Purchase plan copied.', planExtra: '{price} above the lowest-price total', planUnknown: '{count} products without a confirmed shop are excluded from the total.', refreshPrices: 'Refresh shops', refreshingPrices: 'Checking shops', keepPicker: 'Keep list open after equipping', variants: '{count} paints / variants', variantBase: 'Base model', pickerCart: 'Add current part to cart', liveShipsOnly: 'Only ships confirmed as released are listed.',
            equipmentNav: 'Equipment categories', allEquipment: 'All equipment', clearFilters: 'Clear search & filters', filteredEmpty: 'No parts match. Try another search or clear the filters.', firepower: 'Firepower', defense: 'Defense', systems: 'Power, cooling & signature', weaponCount: 'Weapons', regenLabel: 'Shield regen', perSecond: '/s', seconds: 's',
            shieldCount: 'Shield generators', unitCount: '{count}', signatureEm: 'EM signature', signatureIr: 'IR signature', qdSpeedLabel: 'Quantum speed', spoolLabel: 'Spool', cooldownLabel: 'Cooldown',
            equipped: 'Equipped', costAll: 'Cheapest shop price for every changed part', crew: 'Crew {count}', stockState: 'Stock loadout', offState: '{count} powered off', rangeWarning: 'Exceeds {range} Gm range · refuelling required.', distanceInvalid: 'Enter a distance between 1 and 999 Gm.', changedCount: '{count} slots changed',
            burstDps: 'Burst DPS', laserPower: 'Laser power', instab: 'Instability', resistMod: 'Resistance', windowMod: 'Optimal window', blastRadius: 'Blast radius', empDmg: 'Distortion damage', radiusShort: 'Radius', chargeShort: 'Charge', jamRange: 'Jammer range', rackCount: 'Capacity', rackSize: 'Ordnance size', regenDelay: 'Regen delay after hit', fuelUse: 'Fuel use', rackFact: 'Holds {count} × S{size}', abLabel: 'Switch setup', abGo: 'Switch to setup {slot}', abSlot: 'Setup {slot}', abStarted: 'Opened setup {slot} as a copy of the current setup. Change parts here and use Compare to see the difference.', abSwitched: 'Switched to setup {slot}.', abCompare: 'Setup A vs B', abHint: 'Press B to clone the current setup and try other parts right away. You can save once you find a setup you like.', abOpen: 'Start experimenting in setup {slot}', abCopy: 'Overwrite setup {slot} with the current one', abCopied: 'Copied the current setup to setup {slot}.', savedCompare: 'Compare with a saved setup', perShot2: '{value} each', totalDmg: 'Total damage', rackOn: 'S{size} {type}', dpsHelp: 'How DPS is calculated', regenDelayShort: 'Regen delay', counterLabel: 'Decoys · noise', counterValue: '{decoy} · {noise}', empRow: 'EMP', empValue: '{dmg} distortion · {radius} m radius · {charge}s charge', dampRow: 'Quantum dampener', dampValue: '{range} m jammer range', sustainDps: 'Sustained DPS', sustainShort: 'sustained', burstHint: 'Burst DPS is the value while firing without a break. Sustained DPS is the long-run average including the pauses for overheating (ballistic) or an empty capacitor (energy).', limitCol: 'Sustained fire', limitHeat: 'Overheats after {fire}s · fires again after {down}s', limitCap: 'Capacitor empty after {fire}s · recharge {down}s', limitNone: 'No limit', ammoTime: '{value}s of fire', colPart: 'Part', colPrice: 'Lowest price', dmg_energy: 'Energy', dmg_ballistic: 'Ballistic', dmg_distortion: 'Distortion', kind_repeater: 'Repeater', kind_cannon: 'Cannon', kind_gatling: 'Gatling', kind_scattergun: 'Scattergun', kind_beam: 'Beam', sortHint: 'Sort by {label}',
            sortLabel: 'Sort', sort_best: 'Best first', sort_name: 'Name', sort_price: 'Lowest price', filterLabel: 'Filter parts', buyableOnly: 'Sold in shops',
            bulkApply: 'Replace all {count} slots with this part', powerShort: 'Output', coolingShort: 'Cooling',
            flight: 'Flight performance', scmSpeed: 'SCM speed', boostSpeed: 'Boost speed', boostBack: 'Boost reverse', navSpeed: 'Top speed (NAV)', pitch: 'Pitch', yaw: 'Yaw', roll: 'Roll', degPerSec: '°/s',
            hullArmor: 'Hull & armor', hullHp: 'Hull HP', hullNote: 'Hull HP is the sum of every hull part. Armor values are the share of damage taken, so lower is tougher.', armorHp: 'Armor HP', mass: 'Mass', armorTaken: '{type} damage taken', armorSignal: 'Armor signature multiplier',
            rangeLabel: 'Range', qtFuel: 'Quantum fuel', h2Fuel: 'Hydrogen fuel', travelFor: 'Distance (Gm)', travelTime: 'Estimated travel time', travelNote: 'Range and travel time are estimates calculated from game file values.', minSec: '{min}m {sec}s',
            tab_compare: 'Compare', compareWith: 'Compare', compareEmpty: 'Press Compare on a saved loadout to see it next to your current setup. Save a setup first.', compareNow: 'Current setup', compareItem: 'Stat', compareDiff: 'Difference (current − other)', compareClear: 'Stop comparing',
            missileTable: 'Missiles & bombs', lockShort: 'Lock', trackShort: 'Tracking', dmgShort: 'Damage',
            powerOff: 'Power off', powerOn: 'Power on', poweredOff: 'Powered off', powerSpare: 'Spare output', powerShort2: 'Output shortfall', offCount: '{count} parts are powered off. They are left out of firepower, shields, power draw and signatures.', capacitor: 'Capacitor {load} · {rate}/s regen',
            allMakers: 'All manufacturers', makerFilter: 'Manufacturer', kindAll: 'All', kindShip: 'Ships', kindGround: 'Ground vehicles', kindFilter: 'Type',
            kpiLabel: 'Key figures', kpiShield: 'Shields', kpiHull: 'Hull', kpiRange: 'Range', kpiAlpha: 'Alpha', superArms: 'Weapons', superDefense: 'Defense & power', superTravel: 'Travel & other', slotCount: '{count} slots',
            buildSaveFail: 'Couldn\'t save. Check your browser storage and try again.', priceRetry: 'Retry',
            tableRegion: 'Table (scrolls sideways)',
            mountChange: 'Change mount', rackChange: 'Change rack', fixedRack: 'Fixed rack · cannot replace', mountedOn: 'Mounted on', equip: 'Equip', regenShort: 'Regen', sortBy: 'By {label}', buildsToggle: 'Save / load', comparePick: 'Compare with', compareChoose: 'Pick a saved setup to compare.', compareNone: 'No saved setups yet. Save the current setup with Save / load above.', fullLoad: 'at full load', detail: 'Equipped',
            splitRun: 'Show each', mergeRun: 'Group', runNote: 'Changes all {count} slots in this row together.', powerUseLabel: 'Power draw', better: 'better', worse: 'worse',
            sourceBrief: 'Sources · game files {version} · prices from UEX', role: 'Role',
            variantNote: 'Ship-specific variant', undo: 'Undo last change', undone: 'Last change undone.', pickSlotHint: 'Press Change on a slot in the list to see compatible parts here.',
            tabsLabel: 'Loadout views', tab_slots: 'Hardpoints', tab_weapons: 'Weapons', tab_finder: 'Part finder', tab_cart: 'Cart',
            cartEmpty: 'Your cart is empty. Use Add in the part finder or the part picker.', cartSummary: '{kinds} parts · {count} items', cartClear: 'Empty cart', cartRemove: 'Remove',
            cartAdd: 'Add', cartAdded: 'Added to cart.', inCart: 'In cart {count}', cartAddChanged: 'Add changed parts to cart', cartByShop: 'What to buy at each shop', qtyLess: 'Decrease quantity', qtyMore: 'Increase quantity',
            finderType: 'Part type', finderCount: '{count} parts', finderMore: 'Show more ({count} left)',
            weaponsNone: 'No weapons equipped.', whoFires: 'Fired by', dpsSum: 'Total DPS', alphaShort: 'Alpha', rpmShort: 'RPM', speedShort: 'Velocity', rangeShort: 'Range', dmgKind: 'Damage', ammoShort: 'Ammo', ammoRegen: 'Regen',
            resist: '{type} resistance', builds: 'Saved loadouts', buildName: 'Name (blank = ship + date)', buildSave: 'Save current setup', buildSaved: 'Loadout saved.', buildDelete: 'Delete', buildsEmpty: 'No saved loadouts. They are stored in this browser only.',
            pickShip: 'Choose a ship', searchShip: 'Search ship or manufacturer', noShip: 'No ships found.', shipCount: 'All {count} ships', shipFound: '{count} ships found', browseShips: 'Change ship', hideShips: 'Hide list',
            loading: 'Loading data.', loadFail: 'Couldn\'t load loadout data.', retry: 'Retry',
            summary: 'Summary', dps: 'Damage per second', pilot: 'Pilot', turret: 'Turrets', alpha: 'Alpha strike', weapons: '{count} weapons',
            missiles: 'Missiles & bombs', missileCount: '{count} loaded', shield: 'Shields', shieldRegen: 'Regen {value}/s', power: 'Power output', powerUse: '{use} needed with everything at full power',
            cooling: 'Cooling capacity', coolingUse: 'All coolers combined', quantum: 'Quantum travel', quantumNone: 'No quantum drive', spool: 'Spool {value}s', range: 'Range {value} Gm',
            cost: 'Cost of changed parts', costUnknown: '{count} with no known shop', costNone: 'No parts changed', same: 'Same', dmgWord: 'Damage', lootNote: 'Unconfirmed shop offers are excluded from the total. Missing UEX data, unmatched records or loot-only availability may be the cause; this does not prove a part is unavailable in stores.',
            part: 'Part', slots: 'Hardpoints', change: 'Change', close: 'Close', reset: 'Default', empty: 'Empty', removeItem: 'Leave empty', fixed: 'Bespoke · not swappable',
            changed: 'Changed', defaultMark: 'Stock', pickerSearch: 'Search parts', pickerEmpty: 'No compatible parts for this slot.', pickerCount: '{count} compatible parts',
            select: 'Equip', selected: 'Equipped', priceFrom: 'From {price}', priceShops: '{count} shops', priceNone: 'No known shop', priceLoading: 'Checking prices',
            priceFail: 'Couldn\'t load prices', shopping: 'Shopping list', shoppingEmpty: 'Change a part to see where to buy it and what it costs.', qty: 'Qty', cheapest: 'Cheapest shop', subtotal: 'Subtotal', total: 'Total',
            share: 'Copy share link', shareOk: 'Share link copied.', shareFail: 'Couldn\'t copy the link.', resetAll: 'Reset to stock', resetOk: 'Restored the stock loadout.',
            sourceStats: 'Ship & component stats', sourcePrices: 'Shops & prices', sourceTerms: 'Korean terms', sourceGame: 'extracted directly from the Star Citizen game files', sourceVersion: 'Game data version {version}', sourceNote: 'Unofficial fan site. Values change with game patches; firepower figures are our own calculation and may differ from the live game.',
            size: 'Size', grade: 'Grade', rpm: '{value} rpm', perShot: '{value} per shot', speed: '{value} m/s', reach: '{value} m range', hp: '{value} HP',
            gen: 'Output {value}', coolGen: 'Cooling {value}', qdSpeed: '{value} km/s', dmg: '{value} damage', lock: 'Lock {value}s', signal: '{value} tracking',
            groups: { weapon: 'Weapons & turrets', missile: 'Missiles & bombs', shield: 'Shields', power: 'Power plants', cooler: 'Coolers', quantum: 'Quantum drive', radar: 'Radar', mining: 'Mining equipment', utility: 'Utility equipment', other: 'Other equipment' },
            types: {
                WeaponGun: 'Weapon', Turret: 'Turret / mount', TurretBase: 'Manned turret', UtilityTurret: 'Utility turret', MissileLauncher: 'Missile rack', BombLauncher: 'Bomb rack',
                GroundVehicleMissileLauncher: 'Vehicle missile rack', Missile: 'Missile', Bomb: 'Bomb', Shield: 'Shield generator', PowerPlant: 'Power plant', Cooler: 'Cooler',
                QuantumDrive: 'Quantum drive', JumpDrive: 'Jump module', Radar: 'Radar', WeaponMining: 'Mining laser', WeaponDefensive: 'Countermeasure', EMP: 'EMP generator',
                QuantumInterdictionGenerator: 'Quantum dampener', SalvageHead: 'Salvage head', SalvageModifier: 'Salvage module', MiningModifier: 'Mining module', TractorBeam: 'Tractor beam',
                TowingBeam: 'Towing beam', ToolArm: 'Tool arm', WeaponMount: 'Weapon mount', Module: 'Module', Container: 'Cargo module', Misc: 'Other',
            },
            classes: { Military: 'Military', Civilian: 'Civilian', Industrial: 'Industrial', Stealth: 'Stealth', Competition: 'Competition' },
            damage: { physical: 'Physical', energy: 'Energy', distortion: 'Distortion', thermal: 'Thermal', biochemical: 'Biochemical', stun: 'Stun' },
            signals: { CrossSection: 'Cross-section', Infrared: 'Infrared', Electromagnetic: 'EM' },
            tokens: { left: 'left', right: 'right', top: 'top', bottom: 'bottom', front: 'front', rear: 'rear', back: 'rear', nose: 'nose', wing: 'wing', wingtip: 'wingtip', pilot: 'pilot', tail: 'tail', center: 'center', upper: 'upper', lower: 'lower', side: 'side', chin: 'chin', remote: 'remote', copilot: 'copilot', door: 'door' },
        },
    };
    const GROUP_ORDER = ['weapon', 'missile', 'shield', 'power', 'cooler', 'quantum', 'radar', 'mining', 'utility', 'other'];
    const GROUP_BY_TYPE = {
        WeaponGun: 'weapon', Turret: 'weapon', TurretBase: 'weapon', WeaponMining: 'mining', MiningModifier: 'mining', ToolArm: 'utility', UtilityTurret: 'utility', SalvageHead: 'utility', SalvageModifier: 'utility', TractorBeam: 'utility', TowingBeam: 'utility',
        MissileLauncher: 'missile', BombLauncher: 'missile', GroundVehicleMissileLauncher: 'missile', Missile: 'missile', Bomb: 'missile',
        Shield: 'shield', PowerPlant: 'power', Cooler: 'cooler', QuantumDrive: 'quantum', JumpDrive: 'quantum', Radar: 'radar',
    };
    // 우리 부품 종류 → UEX 분류 번호 (구매처·가격 조회용)
    const UEX_CATEGORY = { WeaponGun: 32, Missile: 34, MissileLauncher: 33, Turret: 35, Shield: 23, PowerPlant: 21, Cooler: 19, QuantumDrive: 22, Radar: 83, WeaponMining: 29, Bomb: 70, JumpDrive: 86, MiningModifier: 30, TractorBeam: 67, SalvageHead: 110 };

    function init(injected) { deps = injected || {}; }
    const lang = () => (typeof deps.currentLang === 'function' && deps.currentLang() === 'en' ? 'en' : 'ko');
    const text = (key, vars) => {
        const template = TEXT[lang()][key] ?? TEXT.ko[key] ?? key;
        return String(template).replace(/\{(\w+)\}/g, (_, name) => (vars && Object.hasOwn(vars, name) ? String(vars[name]) : ''));
    };
    const table = (name) => TEXT[lang()][name] || {};
    const esc = (value) => (deps.escapeHtml ? deps.escapeHtml(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
    const num = (value, digits = 0) => (Number(value) || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: digits });
    const credits = (value) => `${num(value)} aUEC`;
    const root = () => document.getElementById('loadout-app');
    // 한국어 화면은 게임 한국어 패치의 표기를 먼저 쓴다(퀀텀 드라이브, 파워 플랜트, 쿨러 …).
    const patch = (group) => (lang() === 'ko' && state.ko?.[group]) || {};
    const typeLabel = (type) => patch('types')[type] || table('types')[type] || type || '';
    const internalName = (item) => item?.name === item?.cls && /_/.test(item?.name || '');
    const itemName = (id, item) => patch('names')[id] || (item?.alias && patch('names')[item.alias]) || (internalName(item) ? [typeLabel(item.type), item.size !== undefined ? 'S' + item.size : '', portHints(item.cls)].filter(Boolean).join(' · ') : item?.name || '');
    const mfrName = (item) => patch('manufacturers')[item?.mfrCode] || item?.mfr || '';
    const makerName = (ship) => patch('manufacturers')[ship?.mfrCode] || ship?.mfr || '';
    const roleName = (ship) => patch('roles')[ship?.role] || ship?.role || '';
    const className = (item) => patch('classes')[item?.klass] || table('classes')[item?.klass] || item?.klass || '';
    const GROUP_TYPE = { shield: 'Shield', power: 'PowerPlant', cooler: 'Cooler', quantum: 'QuantumDrive', radar: 'Radar' };
    const groupLabel = (key) => patch('types')[GROUP_TYPE[key]] || table('groups')[key];
    // 함선 이름: 한국어는 게임 한국어 패치 표기, 없으면 게임 원문. (함선DB 자료 로드 시점에 따라 이름이 바뀌지 않게 한다.)
    const shipName = (ship) => patch('ships')[ship.cls] || ship.name;
    const originalName = (name, display, internal = false) => !internal && name && name !== display ? `<span class="loadout-origin" lang="en">${esc(name)}</span>` : '';
    const itemOriginal = (id, item) => originalName(item?.name, itemName(id, item), internalName(item));
    const shoppingName = (id, item) => {
        const name = itemName(id, item);
        return !internalName(item) && item?.name && item.name !== name ? `${name} (${item.name})` : name;
    };
    // Explicit design attribution, not an extra compatibility rule. Sources: docs/loadout-feedback.md.
    const BESPOKE_WEAPONS = {
        BEHR_LaserCannon_SF7E_S7: 'crus_starfighter_ion',
        BEHR_BallisticGatling_S7: 'crus_starfighter_inferno',
        RSI_Perseus_BallisticCannon_B_S8: 'rsi_perseus',
    };
    function weaponAttribution(item) {
        const cls = BESPOKE_WEAPONS[item?.cls?.replace(/_Collector$/, '')];
        const ship = cls && state.index.find((entry) => entry.cls === cls);
        return ship ? `<span class="loadout-bespoke">${esc(shipName(ship))} ${lang() === 'ko' ? '전용 무장' : 'bespoke weapon'}</span>` : '';
    }
    function powerButton(path, item, off) {
        const label = text(off ? 'powerOn' : 'powerOff');
        return `<button type="button" class="loadout-powerbtn${off ? ' is-off' : ''}" data-loadout-power="${esc(path)}" aria-pressed="${!off}" aria-label="${esc(itemName('', item))} · ${esc(label)}" title="${esc(label)}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10M6.3 5.3a9 9 0 1 0 11.4 0"/></svg><span>${esc(lang() === 'ko' ? (off ? '꺼짐' : '켜짐') : (off ? 'Off' : 'On'))}</span></button>`;
    }

    async function fetchJson(path, options) {
        const response = await fetch(path, { ...options, cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`LOADOUT ${response.status} ${path}`);
        return response.json();
    }

    function readStored() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_error) { return {}; }
    }
    function writeStored() {
        try {
            const stored = readStored();
            stored.ship = state.shipCls;
            stored.sets = { ...(stored.sets || {}) };
            if (Object.keys(state.overrides).length) stored.sets[state.shipCls] = state.overrides; else delete stored.sets[state.shipCls];
            stored.off = { ...(stored.off || {}) };
            if (Object.keys(state.off).length) stored.off[state.shipCls] = state.off; else delete stored.off[state.shipCls];
            // 저장 없이 오가는 두 번째 구성(A/B). 지금 보고 있지 않은 쪽을 따로 둔다.
            stored.operation = { ...(stored.operation || {}), [state.shipCls]: state.operation };
            stored.alt = { ...(stored.alt || {}) };
            if (state.alt) stored.alt[state.shipCls] = { slot: state.slot, overrides: state.alt.overrides, off: state.alt.off, operation: state.alt.operation }; else delete stored.alt[state.shipCls];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        } catch (_error) { /* 저장 공간을 쓸 수 없어도 편집은 계속된다 */ }
    }

    async function ensureBase() {
        if (state.items && state.index) return;
        try { const ui = JSON.parse(localStorage.getItem('volt-loadout-ui-v1') || '{}'); state.compact = Boolean(ui.compact); state.keepPicker = Boolean(ui.keepPicker); } catch (_error) { /* optional preference */ }
        state.cart = readCart();
        state.plan = readPlan();
        // meta는 항상 새로 확인하고, 나머지는 자료 버전을 주소에 붙여 패치 후 옛 캐시가 섞이지 않게 한다.
        const meta = await fetchJson(`${DATA_BASE}/meta.json`, { cache: 'no-cache' });
        // 같은 게임 버전에서 자료만 다시 뽑아도 새로 받도록 만든 시각까지 붙인다.
        const stamp = encodeURIComponent(`${meta.version || ''}-${meta.builtAt || ''}`);
        meta.stamp = stamp;
        const [index, items, ko, availability, comparison] = await Promise.all([
            fetchJson(`${DATA_BASE}/index.json?v=${stamp}`), fetchJson(`${DATA_BASE}/items.json?v=${stamp}`),
            // 한국어 표기(게임 한국어 패치 기준)는 없어도 화면이 동작한다 — 원문으로 표시.
            fetchJson(`${DATA_BASE}/ko.json?v=${stamp}`).catch(() => null),
            fetchJson(`${DATA_BASE}/availability.json`, { cache: 'no-cache' }),
            fetchJson(`${DATA_BASE}/comparison.json?v=${stamp}`).catch(() => null),
        ]);
        state.systems = comparison?.gameVersion === meta.gameVersion ? comparison.ships || {} : {};
        state.meta = meta; state.index = index.ships.filter((ship) => availability.released.includes(ship.cls)); state.shipAliases = index.aliases || {}; state.items = items.items; state.ko = ko;
        // Never apply research from another game build to this catalog.
        if (comparison?.gameVersion === meta.gameVersion) for (const [id, values] of Object.entries(comparison.items)) {
            if (state.items[id]) Object.assign(state.items[id], values);
        }
        fetchJson(`${DATA_BASE}/crafting.json?v=${stamp}`).then((crafting) => { if (crafting.gameVersion !== meta.gameVersion) return; state.crafting = crafting; if (state.detailId) draw(); }).catch(() => {});
        state.families = planner.families(state.items);
        // 장바구니에 담아 둔 내부 변형도 대표 제품으로 합친다.
        const cart = {};
        for (const [id, quantity] of Object.entries(state.cart)) { const key = canonicalItem(id); cart[key] = (cart[key] || 0) + (Number(quantity) || 0); }
        if (JSON.stringify(cart) !== JSON.stringify(state.cart)) writeCart(cart);
    }

    // 전원을 꺼 둔 자리 가운데 지금 구성에 실제로 있는 자리만 남긴다.
    function cleanOff(off) {
        const paths = new Set(); calc.walkLoadout(state.ship, state.items, state.overrides, (node) => { if (node.item) paths.add(node.path); });
        return Object.fromEntries(Object.keys(off || {}).filter((key) => off[key] && paths.has(key)).map((key) => [key, true]));
    }

    // 대표 제품 정리 이전에 저장된 id(내부 변형)를 대표 제품 id로 바꿔 읽는다.
    const canonicalItem = (id) => { const item = state.items?.[id]; return item?.hidden && item.alias && state.items[item.alias] ? item.alias : id; };
    const canonicalShip = (cls) => state.shipAliases?.[cls] || cls;

    let shipRequest = 0;

    async function selectShip(requested, overrides, off, operation) {
        if (!/^[a-z0-9_]+$/i.test(requested || '')) return;
        const request = ++shipRequest;
        let cls = requested;
        state.loading = true; state.error = ''; state.openPath = ''; draw();
        try {
            await ensureBase();
            if (request !== shipRequest) return;
            cls = canonicalShip(cls);
            if (!state.index.some((entry) => entry.cls === cls)) throw new Error('Ship is not released');
            const ship = await fetchJson(`${DATA_BASE}/ships/${cls}.json?v=${state.meta?.stamp || ''}`);
            if (request !== shipRequest) return;
            const sameShip = cls === state.shipCls;
            ship.systems = state.systems[cls];
            state.ship = ship; state.shipCls = cls; state.history = []; state.redo = []; state.detailId = ''; state.changedOnly = false; state.equipmentGroup = '';
            const stored = overrides ?? readStored().sets?.[cls] ?? readStored().sets?.[requested] ?? {};
            state.overrides = calc.sanitizeOverrides(ship, state.items, Object.fromEntries(Object.entries(stored).map(([path, id]) => [path, canonicalItem(id)])));
            state.off = cleanOff(off ?? (overrides === undefined ? readStored().off?.[cls] : {}) ?? {});
            state.operation = calc.sanitizeOperation(ship, state.items, state.overrides, operation ?? (overrides === undefined ? readStored().operation?.[cls] : {}), { off: state.off });
            // A/B: 저장해 둔 것을 되살리고, 같은 함선에 구성을 불러올 때는 다른 쪽을 그대로 둔다.
            if (overrides === undefined) {
                const alt = readStored().alt?.[cls];
                state.slot = alt?.slot === 'B' ? 'B' : 'A';
                state.alt = alt ? { overrides: calc.sanitizeOverrides(ship, state.items, Object.fromEntries(Object.entries(alt.overrides || {}).map(([path, id]) => [path, canonicalItem(id)]))), off: alt.off || {}, operation: calc.sanitizeOperation(ship, state.items, alt.overrides || {}, alt.operation, { off: alt.off }) } : null;
            } else if (!sameShip) { state.slot = 'A'; state.alt = null; }
            writeStored();
        } catch (error) {
            if (request !== shipRequest) return;
            console.warn('Loadout load failed', error);
            state.error = text('loadFail');
        }
        state.loading = false; draw();
        loadPricesForChanged();
        loadShipMarket();
    }

    async function loadShipMarket(retry = false) {
        if (state.shipMarket.status === 'loading' || (!retry && state.shipMarket.status !== 'idle')) return;
        state.shipMarket.status = 'loading';
        if (retry) draw();
        try {
            const result = await fetchJson('/api/uex/ship-prices');
            if (result.status !== 'ok' || !Array.isArray(result.data)) throw new Error('Invalid ship sellers');
            state.shipMarket = { status: 'ready', data: result.data, fetchedAt: result.meta?.fetchedAt || '' };
        } catch (_error) { state.shipMarket.status = 'error'; }
        // A shared catalog is matched to the current ship at render time. A slow
        // request cannot replace the next ship's sellers with the previous one's.
        if (state.ship && !state.loading && !state.openPath && !state.detailId && !state.cartOpen && !state.browsing) draw();
    }

    function drawShipMarket() {
        const market = state.shipMarket;
        let body;
        if (market.status === 'error') body = `<p class="loadout-note">${esc(text('shipMarketError'))}</p><button type="button" class="loadout-link" data-loadout-ship-market-retry>${esc(text('priceRetry'))}</button>`;
        else if (market.status !== 'ready') body = `<p class="loadout-note" role="status">${esc(text('shipMarketLoading'))}</p>`;
        else {
            const exact = market.data.filter((entry) => entry.uuid && entry.uuid.toLowerCase() === state.ship.ref?.toLowerCase());
            // Never match a variant by substring or override a conflicting UUID.
            const named = exact.length ? [] : market.data.filter((entry) => !entry.uuid && entry.name === state.ship.name);
            const matches = exact.length ? exact : named;
            const match = matches.length === 1 ? matches[0] : null;
            const offers = (match?.shops || []).filter((offer) => Number.isFinite(offer.price) && offer.price > 0);
            const date = (value) => { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : ''; };
            const seller = (offer) => `<li><div><strong>${esc(offer.shop)}</strong><span>${esc([offer.system, offer.place].filter(Boolean).join(' / '))}</span>${offer.updatedAt > 0 && offer.updatedAt * 1000 <= Date.now() ? `<small>${esc(text('shipMarketDate'))} · ${esc(date(offer.updatedAt * 1000))}</small>` : ''}</div><b>${esc(credits(offer.price))}</b></li>`;
            body = !match ? `<p class="loadout-note">${esc(text('shipMarketUnmatched'))}</p>` : !offers.length ? `<p class="loadout-note">${esc(text('shipMarketEmpty'))}</p>` : `<ul class="loadout-ship-sellers">${seller(offers[0])}</ul>${offers.length > 1 ? `<details class="loadout-help" data-loadout-fold="ship-sellers" ${folds.has('ship-sellers') ? 'open' : ''}><summary>${esc(text('shipMarketMore', { count: offers.length - 1 }))}</summary><ul class="loadout-ship-sellers">${offers.slice(1).map(seller).join('')}</ul></details>` : ''}`;
            if (match && named.length) body += `<p class="loadout-note">${esc(text('shipMarketNameMatch'))}</p>`;
            if (date(market.fetchedAt)) body += `<p class="loadout-note">${esc(text('shipMarketFetched'))} · ${esc(date(market.fetchedAt))}</p>`;
        }
        return `<section class="loadout-panel-section loadout-ship-market"><h4>${esc(text('shipMarketTitle'))}</h4>${body}<p class="loadout-note">${esc(text('shipMarketSource'))}</p></section>`;
    }

    function readOperation(value) { try { return JSON.parse(value || '{}'); } catch (_error) { return {}; } }
    const copyOperation = () => ({ power: Object.fromEntries(calc.powerPlan(state.ship, state.items, state.overrides, { off: state.off, operation: state.operation }).groups.map((group) => [group.key, group.allocated])), activeModules: { ...state.operation.activeModules } });
    const cleanOperation = (value) => calc.sanitizeOperation(state.ship, state.items, state.overrides, value, { off: state.off });

    async function render() {
        if (!root() || !calc || !deps.canUse?.()) return;
        state.loading = true; draw();
        try {
            await ensureBase();
            const params = new URLSearchParams(window.location.search);
            const shared = params.get('loadout');
            const stored = readStored();
            const known = (cls) => state.index.some((ship) => ship.cls === canonicalShip(cls));
            // 공유 링크는 처음 한 번만 적용한다(언어 전환 등으로 다시 그릴 때 편집 내용을 덮어쓰지 않게).
            if (shared && known(shared) && !state.sharedApplied) { state.sharedApplied = true; return selectShip(shared, calc.decodeOverrides(params.get('set') || ''), Object.fromEntries((params.get('off') || '').split(',').filter(Boolean).map((key) => [key, true])), readOperation(params.get('op'))); }
            if (state.shipCls && known(state.shipCls)) { state.loading = false; draw(); return undefined; }
            if (stored.ship && known(stored.ship)) return selectShip(stored.ship);
        } catch (error) {
            console.warn('Loadout base load failed', error);
            state.error = text('loadFail');
        }
        state.loading = false; draw();
        return undefined;
    }

    // ---- 가격 (UEX) -------------------------------------------------------
    function loadCategoryPrices(type, refresh = false) {
        const category = UEX_CATEGORY[type];
        // 불러오는 중이거나 이미 받은 분류만 건너뛴다. 실패한 분류는 다시 요청한다.
        const known = state.priceState.get(category);
        if (!category || known === 'loading' || (known === 'ready' && !refresh)) return;
        state.priceState.set(category, 'loading');
        fetchJson(`/api/uex/loadout-prices?category=${category}${refresh ? '&refresh=1' : ''}`, refresh ? { cache: 'no-store' } : {}).then((payload) => {
            for (const id of state.priceIds.get(category) || []) state.prices.delete(id);
            state.priceIds.set(category, Object.keys(payload?.data || {}));
            state.priceNames.set(category, payload?.byName || []);
            for (const [uuid, shops] of Object.entries(payload?.data || {})) state.prices.set(uuid.toLowerCase(), shops);
            state.priceState.set(category, 'ready');
        }).catch((error) => {
            console.warn('Loadout prices failed', error);
            state.priceState.set(category, 'error');
        }).finally(draw);
    }
    function priceInfo(id, item) {
        const category = UEX_CATEGORY[item?.type];
        const status = category ? state.priceState.get(category) : 'none';
        const shops = planner.resolveOffers(id, state.items, state.prices, state.priceNames.get(category) || []);
        return { status: shops.length ? 'ready' : status || 'idle', shops, min: shops[0]?.price || 0 };
    }
    function loadPricesForChanged() {
        if (!state.ship) return;
        calc.walkLoadout(state.ship, state.items, state.overrides, ({ item, changed }) => { if (changed && item) loadCategoryPrices(item.type); });
    }

    // ---- 표시 도우미 ------------------------------------------------------
    function slotGroup(slot, item) {
        const type = item?.type || slot.acc?.[0]?.type;
        return GROUP_BY_TYPE[type] || 'other';
    }
    // 자리 이름에 쓰는 위치 낱말(왼쪽 날개, 기수 …)과 번호. "class_2" 같은 규격 번호는 자리 번호가 아니다.
    function portHints(port) {
        const tokens = table('tokens');
        return [...new Set(String(port || '').toLowerCase().split(/[_\s]+/).map((token) => tokens[token]).filter(Boolean))].join(' ');
    }
    function portIndex(port) {
        const match = String(port || '').match(/(\d+)(?!.*\d)/);
        if (!match || /class_?$/i.test(String(port).slice(0, match.index))) return '';
        return `#${Number(match[1])}`;
    }
    // 위치만: "왼쪽 날개", "기수", "위 왼쪽 #1"
    const position = (slot) => [portHints(slot.port), portIndex(slot.port)].filter(Boolean).join(' ');
    function slotLabel(slot, item) {
        const type = item?.type || slot.acc?.[0]?.type;
        const size = slot.min !== undefined ? (slot.min === slot.max ? `S${slot.max}` : `S${slot.min}–${slot.max}`) : (item?.size !== undefined ? `S${item.size}` : '');
        return [typeLabel(type), position(slot), size].filter(Boolean).join(' ');
    }
    // 종류 + 위치: "터렛 파일럿", "미사일 랙 왼쪽 #2" (상위 부품을 가리킬 때 쓴다)
    function slotPlace(slot, item) {
        const type = item?.type || slot.acc?.[0]?.type;
        return [typeLabel(type), position(slot)].filter(Boolean).join(' ');
    }
    function itemFacts(item) {
        if (!item) return [];
        const facts = [];
        if (item.radar || item.miningModule) facts.push(...metricsOf(item).slice(0, 3).map((metric) => `${metric.label} ${num(metric.value, metric.digits)}`));
        if (item.type === 'WeaponMining' && item.w) {
            facts.push(`${text('laserPower')} ${num(calc.sumDamage(item.w.beamDps))}`);
            if (calc.weaponRange(item)) facts.push(text('reach', { value: num(calc.weaponRange(item)) }));
            if (item.mine?.instab) facts.push(`${text('instab')} ${num(item.mine.instab)}%`);
            if (item.mine?.resist) facts.push(`${text('resistMod')} ${num(item.mine.resist)}%`);
        } else if (item.w) {
            const stats = calc.weaponStats(item);
            if (stats.dps) facts.push(`DPS ${num(stats.dps)}`);
            const sustained = calc.weaponSustain(item);
            if (sustained.limit) facts.push(`${text('sustainShort')} ${num(sustained.dps)}`);
            if (stats.alpha) facts.push(text('perShot', { value: num(stats.alpha, 1) }));
            if (item.w.rpm) facts.push(text('rpm', { value: num(item.w.rpm) }));
            const reach = calc.weaponRange(item);
            if (reach) facts.push(text('reach', { value: num(reach) }));
        }
        if (item.sh) { facts.push(text('hp', { value: num(item.sh.hp) })); facts.push(text('shieldRegen', { value: num(item.sh.regen) })); }
        if (item.power?.gen) facts.push(text('gen', { value: num(item.power.gen) }));
        if (item.cool?.gen) facts.push(text('coolGen', { value: num(item.cool.gen) }));
        if (item.qd) { facts.push(text('qdSpeed', { value: num(item.qd.speed / 1000) })); facts.push(text('spool', { value: num(item.qd.spool, 1) })); }
        if (item.emp) { facts.push(`${text('empDmg')} ${num(item.emp.dmg)}`); if (item.emp.radius) facts.push(`${text('radiusShort')} ${num(item.emp.radius)}m`); if (item.emp.charge) facts.push(`${text('chargeShort')} ${num(item.emp.charge, 1)}${text('seconds')}`); }
        if (item.qig) { if (item.qig.range) facts.push(`${text('jamRange')} ${num(item.qig.range)}m`); if (item.qig.charge) facts.push(`${text('chargeShort')} ${num(item.qig.charge, 1)}${text('seconds')}`); }
        if (!item.w && !item.ms) { const rack = calc.rackLoad(item); if (rack.count) facts.push(text('rackFact', { count: rack.count, size: rack.size })); }
        if (item.ms) {
            facts.push(text('dmg', { value: num(calc.sumDamage(item.ms.dmg)) }));
            if (item.ms.radius) facts.push(`${text('blastRadius')} ${num(item.ms.radius)}m`);
            if (item.ms.signal) facts.push(text('signal', { value: table('signals')[item.ms.signal] || item.ms.signal }));
            if (item.ms.lock) facts.push(text('lock', { value: num(item.ms.lock, 1) }));
        }
        return facts;
    }
    function itemMeta(item) {
        const parts = [`S${item.size ?? '?'}`];
        if (item.grade) parts.push(`${text('grade')} ${item.grade}`);
        if (item.klass) parts.push(className(item));
        if (mfrName(item)) parts.push(mfrName(item));
        if (/RSI_Meteor$/.test(item.cls || '') && item.type === 'MissileLauncher') parts.push(text('meteorRack'));
        else if (/Cyclone_MT/.test(item.cls || '') && /Launcher$/.test(item.type)) parts.push(text('cycloneRack'));
        else if (item.variant) parts.push(text('variantNote'));
        if (item.miningModule) parts.push(text(item.miningModule.activation === 'ActivateOnAttach' ? 'passiveModule' : 'activeModule'));
        return parts.join(' · ');
    }

    // ---- 그리기 -----------------------------------------------------------
    // 화면 구성: [함선 머리 영역] → [장착 자리 보드 | 통계 패널] → [구매 목록] → [출처]
    // 부품 선택은 옆에서 열리는 창(휴대폰은 아래에서 올라오는 창)에서 한다.

    function drawShipPicker() {
        const query = state.query.trim().toLowerCase();
        const all = state.index || [];
        const matches = all.filter((ship) => {
            if (state.shipMfr && ship.mfr !== state.shipMfr) return false;
            if (state.shipKind === 'ship' && ship.ground) return false;
            if (state.shipKind === 'ground' && !ship.ground) return false;
            if (!query) return true;
            return [ship.name, ship.mfr, shipName(ship), makerName(ship), roleName(ship), ship.role].some((value) => String(value || '').toLowerCase().includes(query));
        });
        // 함선을 고른 뒤에는 목록을 접어 두고, 상단의 "함선 바꾸기"를 누르면 다시 펼친다.
        const expanded = !state.ship || state.browsing;
        if (!expanded) return '';
        const filtered = Boolean(query || state.shipMfr || state.shipKind);
        const makers = [...new Map(all.filter((ship) => ship.mfr).map((ship) => [ship.mfr, makerName(ship)])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
        const card = (ship) => {
            const image = ship.volt ? window.VOLT_SHIP_IMAGERY?.get?.(ship.volt) : null;
            const facts = [makerName(ship), ship.size ? `S${ship.size}` : '', roleName(ship)].filter(Boolean).join(' · ');
            return `<button type="button" class="loadout-shipcard" role="option" aria-selected="${ship.cls === state.shipCls}" data-loadout-ship="${esc(ship.cls)}">
                ${image ? `<img src="${esc(image.thumbnail.path)}" width="${image.thumbnail.width}" height="${image.thumbnail.height}" alt="" loading="lazy" decoding="async">` : '<span class="loadout-shipcard-blank" aria-hidden="true"></span>'}
                <span class="loadout-shipcard-text"><strong>${esc(shipName(ship))}</strong>${originalName(ship.name, shipName(ship))}<span>${esc(facts)}</span></span>
            </button>`;
        };
        const kind = (value, label) => `<button type="button" class="loadout-chip${state.shipKind === value ? ' is-active' : ''}" data-loadout-ship-kind="${value}" aria-pressed="${state.shipKind === value}">${esc(text(label))}</button>`;
        return `<div class="loadout-shippicker${state.ship ? ' is-overlay' : ''}">
            <p class="loadout-note">${esc(text('liveShipsOnly'))}</p>
            <div class="loadout-shipsearch">
                <label class="visually-hidden" for="loadout-ship-search">${esc(text('pickShip'))}</label>
                <input id="loadout-ship-search" type="search" autocomplete="off" placeholder="${esc(text('searchShip'))}" value="${esc(state.query)}" aria-controls="loadout-ship-results">
                <select id="loadout-ship-mfr" aria-label="${esc(text('makerFilter'))}"><option value="">${esc(text('allMakers'))}</option>${makers.map(([name, label]) => `<option value="${esc(name)}" ${state.shipMfr === name ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
                <div class="loadout-filters" role="group" aria-label="${esc(text('kindFilter'))}">${kind('', 'kindAll')}${kind('ship', 'kindShip')}${kind('ground', 'kindGround')}</div>
            </div>
            <p class="loadout-note" id="loadout-ship-count">${esc(text(filtered ? 'shipFound' : 'shipCount', { count: matches.length }))}</p>
            <div class="loadout-ship-results" id="loadout-ship-results" role="listbox" aria-label="${esc(text('pickShip'))}">${matches.map(card).join('') || `<p class="loadout-note">${esc(text('noShip'))}</p>`}</div>
        </div>`;
    }

    function costSummary() {
        let total = 0; let unknown = 0; let changed = 0;
        const rows = new Map();
        calc.walkLoadout(state.ship, state.items, state.overrides, ({ item, itemId, changed: isChanged }) => {
            if (!isChanged || !item) return;
            changed += 1;
            const info = priceInfo(itemId, item);
            const row = rows.get(itemId) || { item, id: itemId, qty: 0, info };
            row.qty += 1; rows.set(itemId, row);
            if (info.min) total += info.min; else unknown += 1;
        });
        return { total, unknown, changed, rows: [...rows.values()] };
    }

    function drawShipHead(totals, stock) {
        const ship = state.ship;
        const spare = totals.power.gen - totals.power.use;
        const kpi = (label, value, change = '', tone = '', hint = '') => `<div class="loadout-kpi${tone ? ` is-${tone}` : ''}"><span>${esc(label)}${hint ? ` <small>${esc(hint)}</small>` : ''}</span><strong>${esc(value)}</strong>${change}</div>`;
        return `<header class="loadout-topbar">
            <div class="loadout-selector-row"><button type="button" class="loadout-ship-select" data-loadout-browse aria-expanded="${Boolean(state.browsing)}" aria-label="${esc(state.browsing ? text('hideShips') : text('browseShips'))}"><span class="loadout-selector-mark" aria-hidden="true">⌕</span><span>${esc(shipName(ship))}${originalName(ship.name, shipName(ship))}<small>${esc(makerName(ship))}</small></span><span aria-hidden="true">⌄</span></button><button type="button" class="loadout-jump is-primary" data-loadout-jump="equipment">${esc(text('jumpEquipment'))}</button>${ship.systems ? `<button type="button" class="loadout-jump" data-loadout-jump="power">${esc(text('jumpPower'))}</button>` : ''}<button type="button" class="loadout-cart-shortcut" data-loadout-cart-open>${esc(text('tab_cart'))} <b>${cartCount()}</b></button></div>
            <div class="loadout-kpis" role="group" aria-label="${esc(text('kpiLabel'))}">
                ${kpi(text('burstDps'), num(totals.dps.total), drawChange(totals.dps.total, stock.dps.total))}
                ${kpi(text('sustainDps'), num(totals.sustain.total), drawChange(totals.sustain.total, stock.sustain.total))}
                ${kpi(text('kpiAlpha'), num(totals.alpha.total), drawChange(totals.alpha.total, stock.alpha.total))}
                ${kpi(text('kpiShield'), num(totals.shield.hp), drawChange(totals.shield.hp, stock.shield.hp))}
                ${ship.base?.hull ? kpi(text('kpiHull'), num(ship.base.hull)) : ''}
                ${kpi(text(spare >= 0 ? 'powerSpare' : 'powerShort2'), num(Math.abs(spare), 1), '', spare >= 0 ? '' : 'warn', text('fullLoad'))}
                ${totals.quantum?.range ? kpi(text('kpiRange'), `${num(totals.quantum.range)} Gm`, stock.quantum?.range ? drawChange(totals.quantum.range, stock.quantum.range) : '') : ''}
                ${ship.base?.flight?.scm ? kpi('SCM', `${num(ship.base.flight.scm)} m/s`) : ''}
            </div>
            ${drawShipPicker()}
        </header>`;
    }

    function drawShipIdentity(totals) {
        const ship = state.ship;
        const image = ship.volt ? window.VOLT_SHIP_IMAGERY?.get?.(ship.volt) : null;
        const facts = [roleName(ship), ship.size ? `${text('size')} ${ship.size}` : '', ship.base?.crew ? text('crew', { count: ship.base.crew }) : ''].filter(Boolean);
        return `<div class="loadout-identity">
                    <div class="loadout-ab" role="group" aria-label="${esc(text('abLabel'))}">${['A', 'B'].map((slot) => `<button type="button" class="loadout-abbtn${state.slot === slot ? ' is-active' : ''}" data-loadout-ab="${slot}" aria-pressed="${state.slot === slot}" title="${esc(text('abSlot', { slot }))}"><span class="visually-hidden">${esc(text('abSlot', { slot: '' }))}</span>${slot}</button>`).join('')}</div>
            <div class="loadout-shiphead">
                ${image ? `<img class="loadout-shipphoto" src="${esc(image.thumbnail.path)}" width="${image.thumbnail.width}" height="${image.thumbnail.height}" alt="" decoding="async">` : '<div class="loadout-shipphoto is-empty" aria-hidden="true"></div>'}
                <div class="loadout-shipinfo"><span class="loadout-maker">${esc(makerName(ship))}</span><h3 id="loadout-ship-title">${esc(shipName(ship))}</h3>${originalName(ship.name, shipName(ship))}<p class="loadout-shipfacts"><span class="loadout-abstate">${esc(text('abSlot', { slot: state.slot }))}</span>${facts.map((fact) => `<span>${esc(fact)}</span>`).join('')}</p><p class="loadout-shipstate">${esc(totals.changed ? text('changedCount', { count: totals.changed }) : text('stockState'))}${totals.off ? ` · ${esc(text('offState', { count: totals.off }))}` : ''}</p></div>
            </div>
        </div>`;
    }

    function drawActions(cost) {
        return `<section class="loadout-panel-section loadout-work-actions"><h4>${esc(text('actions'))}</h4><div class="loadout-actions">
                    <button type="button" class="btn btn-secondary" data-loadout-builds-toggle aria-expanded="${Boolean(state.buildsOpen)}">${esc(text('buildsToggle'))}${readBuilds().length ? ` <span class="loadout-badge">${readBuilds().length}</span>` : ''}</button>
                    <button type="button" class="btn btn-secondary" data-loadout-undo ${state.history.length ? '' : 'disabled'}>${esc(text('undo'))}</button>
                    <button type="button" class="btn btn-secondary" data-loadout-redo ${state.redo.length ? '' : 'disabled'}>${esc(text('redo'))}</button>
                    <button type="button" class="btn btn-secondary" data-loadout-share>${esc(text('share'))}</button>
                    <button type="button" class="btn btn-secondary" data-loadout-reset-all ${Object.keys(state.overrides).length || Object.keys(state.off).length || Object.keys(state.operation.power).length || Object.keys(state.operation.activeModules).length ? '' : 'disabled'}>${esc(text('resetAll'))}</button>
            <button type="button" class="btn btn-secondary" data-loadout-quick-cart-changed ${cost.rows.length ? '' : 'disabled'}>${esc(text('cartAddChanged'))}</button>
        </div>${state.buildsOpen ? drawBuilds() : ''}</section>`;
    }

    // 기본 장착과 견준 변화량. 바꾼 결과가 이득인지 한눈에 보이게 한다.
    // better: 'high'(늘면 유리 — 화력·실드), 'low'(줄면 유리 — 소비 전력·시그니쳐·스풀링). 색은 늘고 줄고가 아니라 유리·불리를 따른다.
    const toneOf = (diff, better) => ((diff > 0) === (better !== 'low') ? 'good' : 'bad');
    const toneWord = (tone) => `<span class="visually-hidden"> (${esc(text(tone === 'good' ? 'better' : 'worse'))})</span>`;
    function drawChange(now, stock, digits = 0, better = 'high') {
        const diff = now - stock;
        if (Math.abs(diff) < (digits ? 0.05 : 0.5)) return '';
        const tone = toneOf(diff, better);
        return `<span class="loadout-change is-${tone}">${diff > 0 ? '+' : '−'}${esc(num(Math.abs(diff), digits))}${toneWord(tone)}</span>`;
    }

    // 실드 저항: 장착된 첫 실드 제너레이터의 피해 종류별 저항 범위(최소~최대).
    function shieldResistRows(row) {
        const shield = allNodes().find((node) => node.item?.sh)?.item?.sh;
        if (!shield?.res) return '';
        const percent = (value) => `${Math.round(value * 100)}%`;
        return ['physical', 'energy', 'distortion'].filter((type) => shield.res[type])
            .map((type) => row(text('resist', { type: table('damage')[type] || type }), `${percent(shield.res[type][0])} – ${percent(shield.res[type][1])}`)).join('');
    }

    function travelText(quantum) {
        if (!(state.qtDistance >= 1 && state.qtDistance <= 999)) return '—';
        const seconds = Math.round(calc.quantumTravelTime(quantum, state.qtDistance));
        if (!seconds) return '—';
        return text('minSec', { min: Math.floor(seconds / 60), sec: seconds % 60 });
    }

    function travelWarning(quantum) {
        if (!(state.qtDistance >= 1 && state.qtDistance <= 999)) return text('distanceInvalid');
        return quantum?.range > 0 && state.qtDistance > quantum.range ? text('rangeWarning', { range: num(quantum.range) }) : '';
    }

    // 비행 성능: 비행 제어기에 적힌 속도와 선회 속도(부품을 바꿔도 변하지 않는 함선 고유 수치).
    // 자주 보지 않는 구역은 접어 둔다. 펼친 상태는 화면을 다시 그려도 유지한다.
    const folds = new Set(['flight', 'hull']);
    const fold = (key, klass, title, brief, body) => `<details class="loadout-panel-section loadout-fold ${klass}" data-loadout-fold="${key}" ${folds.has(key) ? 'open' : ''}>
            <summary><h4>${esc(title)}</h4><span class="loadout-fold-brief">${esc(brief)}</span></summary><div class="loadout-fold-body">${body}</div></details>`;

    function drawFlight() {
        const flight = state.ship.base?.flight;
        if (!flight) return '';
        const cell = (title, value, unit) => `<div class="loadout-stat"><span class="loadout-stat-label">${esc(title)}</span><strong>${esc(value ? num(value, Number.isInteger(value) ? 0 : 1) : '—')}${value ? `<small> ${esc(unit)}</small>` : ''}</strong></div>`;
        return fold('flight', 'loadout-flight', text('flight'), [flight.scm ? `SCM ${num(flight.scm)}` : '', flight.max ? `NAV ${num(flight.max)} m/s` : ''].filter(Boolean).join(' · '), `
            <div class="loadout-statpair">${cell(text('scmSpeed'), flight.scm, 'm/s')}${cell(text('navSpeed'), flight.max, 'm/s')}</div>
            <div class="loadout-statpair">${cell(text('boostSpeed'), flight.boost, 'm/s')}${cell(text('boostBack'), flight.boostBack, 'm/s')}</div>
            <div class="loadout-stattrio">${cell(text('pitch'), flight.pitch, text('degPerSec'))}${cell(text('yaw'), flight.yaw, text('degPerSec'))}${cell(text('roll'), flight.roll, text('degPerSec'))}</div>`);
    }

    function drawHull(row, totals, stock) {
        const base = state.ship.base || {}; const armor = base.armor || {};
        const percent = (value) => `${Math.round(value * 100)}%`;
        const stat = (title, value) => `<div class="loadout-stat"><span class="loadout-stat-label">${esc(title)}</span><strong>${esc(value)}</strong></div>`;
        return fold('hull', 'loadout-hull', text('hullArmor'), base.hull ? `${text('kpiHull')} ${num(base.hull)}` : '', `
            <div class="loadout-statpair">${stat(text('hullHp'), base.hull ? num(base.hull) : '—')}${stat(text('armorHp'), armor.hp ? num(armor.hp) : '—')}</div>
            <dl class="loadout-rows">
                ${['physical', 'energy', 'distortion'].filter((type) => armor[type] !== undefined).map((type) => row(text('armorTaken', { type: table('damage')[type] || type }), percent(armor[type]))).join('')}
                ${armor.em !== undefined ? row(text('armorSignal'), `EM ×${num(armor.em, 2)} · IR ×${num(armor.ir ?? 1, 2)} · CS ×${num(armor.cs ?? 1, 2)}`) : ''}
                ${base.mass ? row(text('mass'), `${num(base.mass)} kg`) : ''}
            </dl>
            <p class="loadout-note">${esc(text('hullNote'))}</p><div class="loadout-signatures"><h5>${esc(text('signatures'))}</h5><dl class="loadout-rows">${row(text('signatureEm'), num(totals.signature.em), drawChange(totals.signature.em, stock.signature.em, 0, 'low'))}${row(text('signatureIr'), num(totals.signature.ir), drawChange(totals.signature.ir, stock.signature.ir, 0, 'low'))}</dl></div>`);
    }

    function drawSummary(totals, cost, stock) {
        const damage = Object.entries(totals.dps.byType).sort((a, b) => b[1] - a[1]);
        const bar = totals.dps.total ? `<span class="loadout-dmgbar" aria-hidden="true">${damage.map(([type, value]) => `<i class="is-${esc(type)}" data-loadout-width="${(value / totals.dps.total * 100).toFixed(1)}"></i>`).join('')}</span>` : '';
        const legend = damage.map(([type, value]) => `<span class="loadout-legend is-${esc(type)}">${esc(table('damage')[type] || type)} ${esc(num(value))}</span>`).join('');
        const stat = (title, value, change = '', tone = '') => `<div class="loadout-stat${tone ? ` is-${tone}` : ''}"><span class="loadout-stat-label">${esc(title)}</span><strong>${esc(value)}</strong>${change}</div>`;
        const row = (label, value, change = '') => `<div class="loadout-row"><dt>${esc(label)}</dt><dd>${esc(value)}${change}</dd></div>`;
        const section = (title, body, wide) => `<section class="loadout-panel-section${wide ? ' is-wide' : ''}"><h4>${esc(title)}</h4>${body}</section>`;
        const quantum = totals.quantum; const stockQuantum = stock.quantum; const fuel = state.ship.base?.fuel || {};
        return `<aside class="loadout-panel loadout-overview" aria-label="${esc(text('summary'))}">
            ${drawShipIdentity(totals)}
            <div class="loadout-overview-column is-damage">${section(text('firepower'), `
                <div class="loadout-summary-numbers">${stat(text('burstDps'), num(totals.dps.total), drawChange(totals.dps.total, stock.dps.total))}${stat(text('sustainDps'), num(totals.sustain.total), drawChange(totals.sustain.total, stock.sustain.total))}${stat(text('kpiAlpha'), num(totals.alpha.total), drawChange(totals.alpha.total, stock.alpha.total))}</div>${bar}<p class="loadout-legends">${legend}</p>
                <table class="loadout-firepower-table"><thead><tr><th scope="col">${esc(text('firepower'))}</th><th scope="col">${esc(text('burstDps'))}</th><th scope="col">${esc(text('sustainDps'))}</th></tr></thead><tbody>
                    ${['pilot', 'turret'].map((role) => `<tr><th scope="row">${esc(text(role))}</th><td>${esc(num(totals.dps[role]))}${drawChange(totals.dps[role], stock.dps[role])}</td><td>${esc(num(totals.sustain[role]))}${drawChange(totals.sustain[role], stock.sustain[role])}</td></tr>`).join('')}
                </tbody></table><dl class="loadout-rows">
                    ${row(text('weaponCount'), text('weapons', { count: totals.weapons }))}
                    ${row(text('missiles'), `${num(totals.missiles.damage)} (${text('missileCount', { count: totals.missiles.count })})`, drawChange(totals.missiles.damage, stock.missiles.damage))}
                    ${totals.emp ? row(text('empRow'), text('empValue', { dmg: num(totals.emp.dmg), radius: num(totals.emp.radius), charge: num(totals.emp.charge, 1) })) : ''}
                    ${totals.dampener ? row(text('dampRow'), text('dampValue', { range: num(totals.dampener.range) })) : ''}
                </dl><details class="loadout-help"><summary>${esc(text('dpsHelp'))}</summary><p class="loadout-note loadout-dpsnote">${esc(text('burstHint'))}</p></details>`, true)}
${drawHull(row, totals, stock)}</div>
            <div class="loadout-overview-column is-defense">${section(text('defense'), `
                <div class="loadout-summary-numbers">${stat(text('kpiShield'), num(totals.shield.hp), drawChange(totals.shield.hp, stock.shield.hp))}</div><dl class="loadout-rows">${row(text('regenLabel'), `${num(totals.shield.regen)}${text('perSecond')}`, drawChange(totals.shield.regen, stock.shield.regen))}${row(text('shieldCount'), text('unitCount', { count: totals.shield.count }))}${shieldResistRows(row)}${totals.counter.decoy || totals.counter.noise ? row(text('counterLabel'), text('counterValue', { decoy: num(totals.counter.decoy), noise: num(totals.counter.noise) })) : ''}</dl>`)}
${drawFlight()}${fold('quantum', 'loadout-quantum', text('quantum'), quantum?.range ? `${num(quantum.range)} Gm` : text('quantumNone'), quantum ? `
                <div class="loadout-statpair">
                    ${stat(text('qdSpeedLabel'), text('qdSpeed', { value: num(quantum.speed / 1000) }), stockQuantum ? drawChange(quantum.speed / 1000, stockQuantum.speed / 1000) : '')}
                    ${stat(text('spoolLabel'), `${num(quantum.spool, 1)}${text('seconds')}`, stockQuantum ? drawChange(quantum.spool, stockQuantum.spool, 1, 'low') : '')}
                </div>
                <dl class="loadout-rows">${row(text('equipped'), itemName(quantum.id, quantum))}${row(text('cooldownLabel'), `${num(quantum.cooldown, 1)}${text('seconds')}`)}${quantum.range ? row(text('rangeLabel'), `${num(quantum.range)} Gm`, stockQuantum?.range ? drawChange(quantum.range, stockQuantum.range) : '') : ''}${fuel.qt ? row(text('qtFuel'), `${num(fuel.qt, 1)} SCU`) : ''}${fuel.h2 ? row(text('h2Fuel'), `${num(fuel.h2, 1)} SCU`) : ''}</dl>
                <div class="loadout-travel"><label for="loadout-qt-distance">${esc(text('travelFor'))}</label><input type="number" id="loadout-qt-distance" inputmode="decimal" min="1" max="999" step="1" value="${esc(state.qtDistance)}"><span class="loadout-travel-result"><span class="loadout-stat-label">${esc(text('travelTime'))}</span><strong id="loadout-qt-time">${esc(travelText(quantum))}</strong></span></div><p id="loadout-qt-warning" class="loadout-travel-warning" role="status" ${travelWarning(quantum) ? '' : 'hidden'}>${esc(travelWarning(quantum))}</p>
                <p class="loadout-note">${esc(text('travelNote'))}</p>` : `<p class="loadout-note">${esc(text('quantumNone'))}</p>`, true)}
${drawShipMarket()}
</div>
            <div class="loadout-overview-column is-operations">${drawPowerPlan(totals, stock)}${drawActions(cost)}${fold('profile', 'loadout-ship-profile', text('shipProfile'), roleName(state.ship), `<dl class="loadout-rows">${row(text('makerFilter'), makerName(state.ship))}${row(text('size'), `S${state.ship.size || '—'}`)}${state.ship.base?.mass ? row(text('mass'), `${num(state.ship.base.mass)} kg`) : ''}</dl>`)}
${section(text('cost'), `
                <div class="loadout-statpair">${stat(text('cost'), cost.changed ? credits(cost.total) : '—')}</div>
                <p class="loadout-note">${esc(cost.changed ? (cost.unknown ? text('costUnknown', { count: cost.unknown }) : text('costAll')) : text('costNone'))}</p>`, true)}
</div>
        </aside>`;
    }

    // 상점에서 팔지 않는 부품(군용 등 전리품 전용)도 장착 후보에서 빼지 않는다 — 살 수 없다는 사실만 알린다.
    function drawPrice(id, item) {
        const info = priceInfo(id, item);
        if (info.min) return `<span class="loadout-price">${esc(text('priceFrom', { price: credits(info.min) }))} · ${esc(text('priceShops', { count: info.shops.length }))}</span>`;
        if (info.status === 'loading') return `<span class="loadout-price is-muted">${esc(text('priceLoading'))}</span>`;
        if (info.status === 'error') return `<span class="loadout-price is-muted">${esc(text('priceFail'))} <button type="button" class="loadout-link" data-loadout-price-retry="${esc(item.type)}">${esc(text('priceRetry'))}</button></span>`;
        return `<span class="loadout-price is-loot">${esc(text('priceNone'))}</span>`;
    }

    function drawFacts(item, limit) {
        const facts = itemFacts(item).slice(0, limit || 9);
        return facts.length ? `<span class="loadout-facts">${facts.map((fact) => `<span>${esc(fact)}</span>`).join('')}</span>` : '';
    }

    // 부품 종류별로 견줄 수치(최대 4칸). 첫 칸이 대표 수치다. better: 'low'는 낮을수록 유리.
    function metricsOf(item) {
        if (!item) return [];
        const m = (label, value, digits = 0, better = 'high') => ({ label, value: Number(value) || 0, digits, better });
        const list = [];
        const rack = calc.rackLoad(item);
        const beam = (w) => calc.sumDamage(w?.beamDps);
        if (item.type === 'WeaponMining' && item.w) list.push(m(text('laserPower'), beam(item.w)), m(`${text('rangeShort')} (m)`, calc.weaponRange(item)), m(`${text('instab')} (%)`, item.mine?.instab, 0, 'low'), m(`${text('resistMod')} (%)`, item.mine?.resist, 0, 'low'), m(`${text('windowMod')} (%)`, item.mine?.window));
        else if (item.radar) {
            for (const [key, label] of [['Infrared', 'IR'], ['Electromagnetic', 'EM'], ['CrossSection', 'CS'], ['Resource', 'RS']]) {
                const signature = item.radar.signatures?.[key];
                if (signature) list.push(m(label + ' ' + text('radarSensitivity'), signature.sensitivity, 2));
            }
            if (item.radar.aim?.distanceMaxAssignment !== undefined) list.push(m(text('aimMax') + ' (m)', item.radar.aim.distanceMaxAssignment));
            if (item.radar.aim?.distanceMinAssignment !== undefined) list.push(m(text('aimMin') + ' (m)', item.radar.aim.distanceMinAssignment, 0, 'low'));
            if (item.radar.aim?.outsideRangeBufferDistance !== undefined) list.push(m(text('aimBuffer') + ' (m)', item.radar.aim.outsideRangeBufferDistance));
            if (item.powerLimits) list.push(m(text('minimumPower'), item.powerLimits.min, 1, 'low'));
        }
        else if (item.miningModule) {
            const mod = item.miningModule;
            list.push(m(text('modulePower') + ' ×', mod.power, 2), m(text('moduleExtraction') + ' ×', mod.extraction, 2), m(text('resistMod') + ' (%)', mod.resistance, 1, 'low'), m(text('instab') + ' (%)', mod.instability, 1, 'low'), m(text('windowMod') + ' (%)', mod.window, 1));
            list.push(m(text('moduleCharge') + ' (%)', mod.chargeRate, 1));
            list.push({ label: text('moduleDuration') + ' (s)', value: mod.activation === 'ActivateOnDemand' ? mod.duration ?? null : null, digits: 0 });
            list.push({ label: text('moduleCharges'), value: mod.activation === 'ActivateOnDemand' ? mod.charges ?? null : null, digits: 0 });
        }
        else if (item.emp) list.push(m(text('empDmg'), item.emp.dmg), m(`${text('radiusShort')} (m)`, item.emp.radius), m(`${text('chargeShort')} (s)`, item.emp.charge, 1, 'low'), m(`${text('cooldownLabel')} (s)`, item.emp.cool, 1, 'low'));
        else if (item.qig) list.push(m(`${text('jamRange')} (m)`, item.qig.range), m(`${text('chargeShort')} (s)`, item.qig.charge, 1, 'low'));
        else if (rack.count && !item.w && !item.ms) list.push(m(text('rackCount'), rack.count), m(text('rackSize'), rack.size));
        else if (item.w) { const stats = calc.weaponStats(item); list.push(m(text('burstDps'), stats.dps), m(text('sustainDps'), calc.weaponSustain(item).dps), m(text('alphaShort'), stats.alpha, 1), m(`${text('rangeShort')} (m)`, calc.weaponRange(item))); }
        else if (item.sh) list.push(m(text('shield'), item.sh.hp), m(text('regenShort'), item.sh.regen), m(`${text('regenDelay')} (s)`, item.sh.dmgDelay, 1, 'low'));
        else if (item.power?.gen) list.push(m(text('powerShort'), item.power.gen, 1));
        else if (item.cool?.gen) list.push(m(text('coolingShort'), item.cool.gen, 1));
        else if (item.qd) list.push(m('km/s', (Number(item.qd.speed) || 0) / 1000), m(`${text('spoolLabel')} (s)`, item.qd.spool, 1, 'low'), m(`${text('cooldownLabel')} (s)`, item.qd.cool, 1, 'low'), m(`${text('fuelUse')} (SCU/Gm)`, item.qd.fuel, 3, 'low'));
        else if (item.ms && item.type === 'Bomb') list.push(m(text('dmgWord'), calc.sumDamage(item.ms.dmg)), m(`${text('blastRadius')} (m)`, item.ms.radius));
        else if (item.ms) list.push(m(text('dmgWord'), calc.sumDamage(item.ms.dmg)), m(`${text('lockShort')} (s)`, item.ms.lock, 1, 'low'), m(`${text('speedShort')} (m/s)`, item.ms.speed), m(`${text('rangeShort')} (m)`, item.ms.rangeMax));
        if (list.length && !item.power?.gen && Number(item.power?.use) > 0) list.push(m(text('powerUseLabel'), item.power.use, 1, 'low'));
        return list;
    }
    const compareMetric = (item) => metricsOf(item)[0] || null;
    // 대표 수치 한 칸(무기는 DPS, 실드는 내구 …). 목록에서 같은 열에 놓여 위아래로 견주기 쉽다.
    function drawMetric(item) {
        const metric = compareMetric(item);
        return `<span class="loadout-metric">${metric ? `<b>${esc(num(metric.value, metric.digits))}</b><small>${esc(metric.label)}</small>` : ''}</span>`;
    }

    function allNodes() {
        const nodes = [];
        calc.walkLoadout(state.ship, state.items, state.overrides, (node) => nodes.push(node));
        return nodes;
    }
    // 같은 부품이 같은 조건(크기·종류)의 자리에 여러 개 달려 있으면 한 번에 바꿀 수 있게 한다.
    function siblingSlots(node, nodes) {
        const signature = (entry) => `${entry.slot.min}|${entry.slot.max}|${(entry.slot.acc || []).map((rule) => rule.type).join(',')}|${entry.itemId}`;
        const key = signature(node);
        return nodes.filter((entry) => entry.slot.kind === 's' && entry.path !== node.path && signature(entry) === key);
    }

    const SORTS = {
        best: (a, b) => (b.size || 0) - (a.size || 0) || (compareMetric(b)?.value || 0) - (compareMetric(a)?.value || 0),
        name: () => 0,
        price: (a, b, ida, idb) => (priceInfo(ida, a).min || Infinity) - (priceInfo(idb, b).min || Infinity),
    };
    // 둘째·셋째 수치(알파·사거리 …)로도 줄 세울 수 있다: 'm1', 'm2', …
    function pickerMetrics(item) {
        const metrics = metricsOf(item);
        if (item?.w) metrics.push(
            { label: text('rpmShort'), value: item.w.rpm || 0, digits: 0 },
            { label: text('speedShort'), value: item.w.speed || 0, digits: 0 },
            { label: text('magSize'), value: item.w.ammo || item.w.regen?.load || 0, digits: 0 },
            { label: text('hpLabel'), value: item.hp || 0, digits: 0 }
        );
        return metrics;
    }
    const sortFn = (key) => {
        const index = /^m(\d)$/.exec(key)?.[1];
        if (!index) return SORTS[key] || SORTS.best;
        return (a, b) => { const x = pickerMetrics(a)[index]; const y = pickerMetrics(b)[index]; if (!x || !y || x.value === null || y.value === null) return (y?.value != null ? 1 : 0) - (x?.value != null ? 1 : 0); return x.better === 'low' ? x.value - y.value : y.value - x.value; };
    };

    // 부품 교체창은 어느 화면에서나 화면을 덮는 넓은 창으로 뜬다(후보를 표로 나란히 견주기 위해).
    const isOverlayPicker = () => true;
    // 무기 후보를 거르는 갈래: 피해 종류(에너지·실탄·디스토션)와 무기 형태(캐논·개틀링·리피터 …).
    // 피해 종류는 실제 피해 수치에서, 형태는 종류 표기(없으면 내부 이름)에서 읽는다.
    const damageOf = (item) => { if (!item?.w) return ''; const dmg = item.w.dmg || item.w.beamDps || {}; const top = Object.keys(dmg).sort((a, b) => dmg[b] - dmg[a])[0]; return top === 'distortion' ? 'distortion' : top === 'physical' ? 'ballistic' : top ? 'energy' : ''; };
    const kindOf = (item) => { const type = `${item?.dtype || ''} ${item?.cls || ''}`; return !item?.w ? '' : /Repeater/i.test(type) ? 'repeater' : /Gatling/i.test(type) ? 'gatling' : /Scatter/i.test(type) ? 'scattergun' : /Beam/i.test(type) ? 'beam' : /Cann?on|MassDriver|Mass Driver/i.test(type) ? 'cannon' : ''; };

    function familyRows(entries, query, currentId = '') {
        if (query) return entries;
        const ids = new Set(entries.map(([id]) => id));
        const rows = [];
        for (const entry of entries) {
            const [id] = entry;
            const parent = state.families.get(id);
            if (parent && ids.has(parent)) continue;
            rows.push(entry);
            rows.push(...entries.filter(([child]) => state.families.get(child) === id && (state.familyOpen.has(id) || child === currentId)));
        }
        return rows;
    }
    function familyButton(id) {
        const count = [...state.families.values()].filter((parent) => parent === id).length;
        return count ? `<button type="button" class="loadout-link loadout-family" data-loadout-family="${esc(id)}" aria-expanded="${state.familyOpen.has(id)}">${esc(text('variants', { count }))}</button>` : '';
    }

    function detailMetrics(item) {
        if (!item) return [];
        const rows = metricsOf(item).filter((m) => m.value !== null).map((m) => ({ ...m, unit: m.label === text('rangeShort') || m.label === text('radiusShort') ? 'm' : m.label === text('spoolLabel') || m.label === text('cooldownLabel') || m.label === text('regenDelay') ? 's' : '' }));
        const add = (key, value, unit = '', better = 'high') => {
            if (value === undefined || value === null || !Number.isFinite(Number(value))) return;
            const label = text(key);
            if (!rows.some((r) => r.label === label)) rows.push({ label, value: Number(value), digits: 2, unit, better });
        };
        add('hpLabel', item.hp, 'HP'); add('mass', item.mass, 'kg', 'low');
        add('powerUseLabel', item.power?.use, '', 'low');
        add('signatureEm', item.em, '', 'low'); add('signatureIr', item.ir, '', 'low');
        if (item.w) {
            add('rpmShort', item.w.rpm, 'rpm'); add('speedShort', item.w.speed, 'm/s');
            add('magSize', item.w.ammo); add('heatShot', item.w.heat, '', 'low');
            add('heatCapacity', item.w.oh?.max); add('coolingRate', item.w.oh?.cool);
            add('coolingDelay', item.w.oh?.start, 's', 'low');
            add('cooldownLabel', item.w.oh?.fix, 's', 'low');
            add('capacitorSize', item.w.regen?.load); add('regenRate', item.w.regen?.perSec);
            add('capacitorDelay', item.w.regen?.cd, 's', 'low');
        }
        if (item.radar) {
            for (const [key, label] of [['Infrared', 'IR'], ['Electromagnetic', 'EM'], ['CrossSection', 'CS'], ['Resource', 'RS']]) {
                const signature = item.radar.signatures?.[key];
                if (signature) {
                    rows.push({ label: label + ' ' + text('radarPiercing'), value: signature.piercing, digits: 2, unit: '×', better: 'high' });
                    for (const [key, title] of [['permitPassiveDetection', 'radarPassive'], ['permitActiveDetection', 'radarActive']]) rows.push({ label: label + ' ' + text(title), value: Number(signature[key]), binary: true, digits: 0 });
                }
            }
            add('radarPing', item.radar.ping, 's', 'low');
        }
        if (item.miningModule) add('moduleCharge', item.miningModule.chargeRate, '%');
        if (item.sh?.regen > 0) add('fullCharge', item.sh.hp / item.sh.regen, 's', 'low');
        return rows;
    }

    function drawComponentDetail() {
        const id = state.detailId; const item = state.items[id];
        if (!item) return '';
        const detailPath = state.openPath || state.detailSlot;
        const node = detailPath && state.ship ? allNodes().find((entry) => entry.path === detailPath) : null;
        const current = node?.item?.type === item.type && canonicalItem(node.itemId) !== id ? node.item : null;
        const baseline = new Map(detailMetrics(current).map((m) => [m.label, m]));
        const info = priceInfo(id, item);
        const rows = detailMetrics(item);
        // 제작 재료: 게임 파일의 설계도. 광물 이름을 누르면 채광 안내의 그 광물로 간다.
        const recipe = state.crafting?.recipes?.[item.cls] || null;
        const resourceName = (key) => { const entry = state.crafting?.resources?.[key]; return (lang() === 'ko' && entry?.ko) || entry?.en || key; };
        const craftDuration = (seconds) => (seconds >= 3600 ? text('craftHours', { h: Math.floor(seconds / 3600), m: Math.round((seconds % 3600) / 60) }) : text('craftMinutes', { m: Math.floor(seconds / 60), s: seconds % 60 }));
        const craftRows = (list, amount) => `<ul class="loadout-craft-list">${list.map(([key, value]) => `<li><span>${esc(resourceName(key))}</span><strong>${esc(amount(value))}</strong>${state.crafting.miningResources?.includes(key) ? `<button type="button" class="loadout-link" data-loadout-mining="${esc(key)}">${esc(text('craftWhere'))}</button>` : `<small class="loadout-meta">${esc(text('craftUnmapped'))}</small>`}</li>`).join('')}</ul>`;
        const craft = recipe ? `<p class="loadout-note">${esc(text('craftNote'))}</p>
            ${recipe.s ? `<dl class="loadout-detail-stats"><div><dt>${esc(text('craftTime'))}</dt><dd>${esc(craftDuration(recipe.s))}</dd></div></dl>` : ''}
            ${recipe.m ? `<section><h4>${esc(text('craftMaterials'))}</h4>${craftRows(recipe.m, (value) => `${num(value, 3)} SCU`)}</section>` : ''}
            ${recipe.p ? `<section><h4>${esc(text('craftPieces'))}</h4>${craftRows(recipe.p, (value) => text('craftCount', { count: num(value) }))}</section>` : ''}` : '';
        const stats = `${item.miningModule || item.radar ? `<p class="loadout-note">${esc(text(item.miningModule ? 'moduleNote' : 'radarNote'))}</p>` : ''}<p class="loadout-note">${esc(text('detailBasis'))}</p>${current ? `<p class="loadout-detail-baseline">${esc(text('previewCompare'))}: <strong>${esc(itemName(node.itemId, current))}</strong></p>` : ''}
            <dl class="loadout-detail-stats">${rows.map((m) => `<div><dt>${esc(m.label)}</dt><dd>${esc(m.binary ? text(m.value ? 'detectionYes' : 'detectionNo') : num(m.value, m.digits))}${m.unit ? ` <small>${esc(m.unit)}</small>` : ''}${!m.binary && baseline.has(m.label) ? drawChange(m.value, baseline.get(m.label).value, m.digits, m.better) : ''}</dd></div>`).join('')}</dl>
            ${item.w ? `<section><h4>${esc(text('dmgKind'))}</h4><dl class="loadout-detail-stats">${Object.entries(item.w.dmg || item.w.beamDps || {}).map(([key, value]) => `<div><dt>${esc(table('damage')[key] || key)}</dt><dd>${esc(num(value, 2))}</dd></div>`).join('')}</dl></section>` : ''}
            <p class="loadout-note">${esc(text('detailMissing'))}</p>`;
        const shops = info.shops.length ? `<div class="loadout-shop-summary"><strong>${esc(credits(info.min))}</strong><span>${esc(text('cheapest'))} · ${esc(text('priceShops', { count: info.shops.length }))}</span></div><ul class="loadout-detail-shops">${info.shops.map((shop) => `<li class="${state.detailShop === planner.shopKey(shop) ? 'is-selected' : ''}"><div><strong>${esc(shop.shop)}</strong><span class="loadout-meta">${esc([shop.system, shop.place].filter(Boolean).join(' / '))}</span><b>${esc(credits(shop.price))}</b></div><button type="button" class="loadout-shop-pick" data-loadout-shop-pick="${esc(planner.shopKey(shop))}" aria-pressed="${state.detailShop === planner.shopKey(shop)}" aria-label="${esc(text('pickShop'))}: ${esc(shop.shop)}">${state.detailShop === planner.shopKey(shop) ? '✓' : '+'}</button></li>`).join('')}</ul>` : `${drawPrice(id, item)}<p class="loadout-note">${esc(text('lootNote'))}</p>`;
        return `<div class="loadout-drawer-backdrop" data-loadout-close></div><section class="loadout-picker loadout-detail" role="dialog" aria-modal="true" aria-labelledby="loadout-detail-title">
            <div class="loadout-picker-title"><div><span class="loadout-slot-label">${esc(typeLabel(item.type))} · S${esc(item.size)}</span><h3 id="loadout-detail-title">${esc(itemName(id, item))}</h3><span class="loadout-meta">${esc(itemMeta(item))}</span>${itemOriginal(id, item)}${weaponAttribution(item)}</div><button type="button" id="loadout-detail-close" class="loadout-close" data-loadout-close aria-label="${esc(text('close'))}">×</button></div>
            <div class="loadout-tabs" role="tablist" aria-label="${esc(text('partDetails'))}">${['stats', 'shops', ...(recipe ? ['craft'] : [])].map((tab) => `<button type="button" id="loadout-detail-tab-${tab}" class="loadout-tab${state.detailTab === tab ? ' is-active' : ''}" data-loadout-detail-tab="${tab}" role="tab" aria-selected="${state.detailTab === tab}" aria-controls="loadout-detail-content">${esc(text(`${tab}Tab`))}${tab === 'shops' && info.shops.length ? ` (${info.shops.length})` : ''}</button>`).join('')}</div>
            <div id="loadout-detail-content" class="loadout-detail-content" role="tabpanel" aria-labelledby="loadout-detail-tab-${state.detailTab}" tabindex="0">${state.detailTab === 'shops' ? shops : state.detailTab === 'craft' && recipe ? craft : stats}</div>
            <footer class="loadout-detail-actions">${state.detailTab === 'shops' && info.shops.length ? `<button type="button" class="btn btn-primary loadout-detail-buy" data-loadout-detail-buy ${info.shops.some((shop) => planner.shopKey(shop) === state.detailShop) ? '' : 'disabled'}>${esc(text('addAndViewCart'))}</button>` : ''}<button type="button" class="btn btn-secondary" data-loadout-close>${esc(text('backToList'))}</button><button type="button" class="btn btn-secondary" data-loadout-cart-add="${esc(id)}">${esc(text('cartAdd'))}</button>${node?.slot.kind === 's' && !state.openPath ? `<button type="button" class="btn btn-primary" data-loadout-detail-swap>${esc(text('change'))}</button>` : ''}${node && id !== canonicalItem(node.itemId) && calc.fitsSlot(item, node.slot, { tags: node.tags }) ? `<button type="button" class="btn btn-primary" data-loadout-detail-equip="${esc(id)}" data-loadout-path="${esc(node.path)}">${esc(text('equip'))}</button>` : ''}</footer>
        </section>`;
    }

    function drawShipImpact() {
        const totals = calc.summarize(state.ship, state.items, state.overrides, { off: state.off });
        const stock = calc.summarize(state.ship, state.items, {});
        const values = [[text('burstDps'), totals.dps.total, stock.dps.total], [text('sustainDps'), totals.sustain.total, stock.sustain.total], [text('kpiShield'), totals.shield.hp, stock.shield.hp], [text('powerUseLabel'), totals.power.use, stock.power.use, 'low']];
        return `<div class="loadout-ship-impact" aria-label="${esc(text('shipImpact'))}"><strong>${esc(text('shipImpact'))}<small>${esc(text('stockComparison'))}</small></strong>${values.map(([label, value, baseline, better]) => `<span><small>${esc(label)}</small><b>${esc(num(value, 1))}</b>${drawChange(value, baseline, 1, better)}</span>`).join('')}</div>`;
    }

    function drawPicker(node, nodes) {
        const query = state.pickerQuery.trim().toLowerCase();
        // 기본 장착이 내부 변형(숨긴 항목)이면 대표 제품을 "장착 중"으로 보여 준다 — 같은 부품이 두 줄로 나오지 않게.
        const currentId = canonicalItem(node.itemId);
        const fitting = Object.entries(state.items).filter(([id, item]) => (!item.hidden || (id === node.itemId && currentId === node.itemId)) && calc.fitsSlot(item, node.slot, { tags: node.tags }));
        const grades = [...new Set(fitting.map(([, item]) => item.grade).filter(Boolean))].sort();
        const classes = [...new Set(fitting.map(([, item]) => item.klass).filter(Boolean))].sort();
        const candidates = fitting
            .filter(([id, item]) => !query || [item.name, itemName(id, item), item.mfr, mfrName(item)].some((value) => String(value || '').toLowerCase().includes(query)))
            .filter(([, item]) => !state.pickerGrade || item.grade === state.pickerGrade)
            .filter(([, item]) => !state.pickerClass || item.klass === state.pickerClass)
            .filter(([, item]) => !state.pickerDamage || damageOf(item) === state.pickerDamage)
            .filter(([, item]) => !state.pickerKind || kindOf(item) === state.pickerKind)
            .filter(([id, item]) => !state.pickerBuyable || priceInfo(id, item).min > 0)
            .sort(([ida, a], [idb, b]) => (state.pickerReverse ? -1 : 1) * (sortFn(state.pickerSort)(a, b, ida, idb) || String(itemName(ida, a)).localeCompare(String(itemName(idb, b)))));
        const grouped = familyRows(candidates, query, currentId);
        const shown = grouped.slice(0, state.pickerLimit);
        const run = runOf(node.path);
        const siblings = siblingSlots(node, nodes);
        const mount = mountOf.get(node.path);
        // 표의 열: 지금 달린 부품(없으면 첫 후보)의 수치 종류를 기준으로 삼아, 같은 수치가 같은 열에 놓이게 한다.
        const columns = pickerMetrics(pickerMetrics(node.item).length ? node.item : fitting.find(([, item]) => pickerMetrics(item).length)?.[1]);
        const sorts = [['best', text('sort_best')], ...columns.map((metric, index) => [`m${index}`, text('sortBy', { label: metric.label })]), ['name', text('sort_name')], ['price', text('sort_price')]];
        const where = placeOf.get(node.path) || slotLabel(node.slot, node.item);
        const chip = (attr, value, label, active) => `<button type="button" class="loadout-chip${active ? ' is-active' : ''}" ${attr}="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
        const damages = ['energy', 'ballistic', 'distortion'].filter((key) => fitting.some(([, item]) => damageOf(item) === key));
        const kinds = ['cannon', 'repeater', 'gatling', 'scattergun', 'beam'].filter((key) => fitting.some(([, item]) => kindOf(item) === key));
        const ascending = (key) => Boolean(key === 'name' || key === 'price' || (/^m\d+$/.test(key) && columns[Number(key.slice(1))]?.better === 'low')) !== state.pickerReverse;
        const head = (key, label, first) => `<th scope="col" class="${first ? 'is-name' : ''}" ${state.pickerSort === key ? `aria-sort="${ascending(key) ? 'ascending' : 'descending'}"` : ''}><button type="button" class="loadout-sortbtn${state.pickerSort === key ? ' is-active' : ''}" data-direction="${ascending(key) ? 'asc' : 'desc'}" data-loadout-sort="${key}" title="${esc(text('sortHint', { label }))}">${esc(label)}</button></th>`;
        const filtered = Boolean(query || state.pickerGrade || state.pickerClass || state.pickerDamage || state.pickerKind || state.pickerBuyable);
        const now = new Map(pickerMetrics(node.item).map((metric) => [metric.label, metric]));
        // 수치 한 칸. 지금 달린 부품과 견준 차이를 유리·불리 색으로 붙인다("동일"은 그 칸의 수치가 같다는 뜻).
        const cell = (item, column, isCurrent) => {
            const metric = pickerMetrics(item).find((entry) => entry.label === column.label);
            if (!metric || metric.value === null) return `<td class="loadout-cmp-cell is-blank">—</td>`;
            const base = isCurrent || now.get(metric.label)?.value == null ? null : now.get(metric.label);
            const diff = base ? metric.value - base.value : 0;
            const delta = !base ? '' : Math.abs(diff) < (metric.digits ? 0.05 : 0.5) ? `<span class="loadout-delta">${esc(text('same'))}</span>`
                : `<span class="loadout-delta is-${toneOf(diff, metric.better)}">${diff > 0 ? '+' : '−'}${esc(num(Math.abs(diff), metric.digits))}${toneWord(toneOf(diff, metric.better))}</span>`;
            return `<td class="loadout-cmp-cell"><small>${esc(metric.label)}</small> <b>${esc(num(metric.value, metric.digits))}</b> ${delta}</td>`;
        };
        return `<div class="loadout-drawer-backdrop" data-loadout-close></div>
        <div class="loadout-picker loadout-swap" role="dialog" aria-modal="true" aria-label="${esc(where)}">
            <div class="loadout-picker-title">
                <div><span class="loadout-slot-label">${esc(text('swapPart'))} · ${esc(where)}${run.length > 1 ? ` ×${run.length}` : ''}</span><strong title="${esc(itemName(node.itemId, node.item))}">${esc(node.item ? itemName(node.itemId, node.item) : text('empty'))}</strong>
                    ${node.item ? `<span class="loadout-picker-detail"><span class="loadout-meta">${esc(itemMeta(node.item))}</span></span>` : ''}</div>
            ${metricsOf(node.item).length ? `<div class="loadout-current-metrics" aria-label="${esc(text('previewCompare'))}">${metricsOf(node.item).map((metric) => `<span><small>${esc(metric.label)}</small><b>${esc(num(metric.value, metric.digits))}</b></span>`).join('')}</div>` : ''}
                <button type="button" class="loadout-close" data-loadout-close aria-label="${esc(text('close'))}">×</button>
            </div>
            ${mount && mount.slot.kind === 's' ? `<p class="loadout-note loadout-mountnote">${esc(text('mountedOn'))}: ${esc(itemName(mount.itemId, mount.item))} <button type="button" class="loadout-link" data-loadout-open="${esc(mount.path)}">${esc(text(/Launcher$/.test(mount.item?.type || '') ? 'rackChange' : 'mountChange'))}</button></p>` : ''}
            ${node.slot.acc?.some((rule) => rule.type === 'MiningModifier') ? `<p class="loadout-note">${esc(text('moduleNote'))}</p>` : ''}${node.item?.type === 'Radar' ? `<p class="loadout-note">${esc(text('radarNote'))}</p>` : ''}
            <details class="loadout-picker-baseline"><summary>${esc(text('shipImpact'))} · ${esc(text('stockComparison'))}</summary>${drawShipImpact()}</details>
            <div class="loadout-picker-tools"><label><input type="checkbox" id="loadout-keep-picker" ${state.keepPicker ? 'checked' : ''}> ${esc(text('keepPicker'))}</label>${node.itemId ? `<button type="button" class="loadout-link" data-loadout-cart-add="${esc(node.itemId)}">${esc(text('pickerCart'))}</button>` : ''}</div>
            <div class="loadout-picker-head">
                <input type="search" id="loadout-picker-search" autocomplete="off" placeholder="${esc(text('pickerSearch'))}" value="${esc(state.pickerQuery)}" aria-label="${esc(text('pickerSearch'))}">
                <label class="loadout-sort"><span>${esc(text('sortLabel'))}</span>
                    <select id="loadout-picker-sort" aria-label="${esc(text('sortLabel'))}">
                        ${sorts.map(([key, label]) => `<option value="${key}" ${state.pickerSort === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}
                    </select>
                </label>
            </div>
            <div class="loadout-filters" role="group" aria-label="${esc(text('filterLabel'))}">
                ${damages.length > 1 ? `<span class="loadout-filtergroup" role="group" aria-label="${esc(text('dmgKind'))}"><small>${esc(text('dmgKind'))}</small>${damages.map((key) => chip('data-loadout-dmg', key, text(`dmg_${key}`), state.pickerDamage === key)).join('')}</span>` : ''}
                ${kinds.length > 1 ? `<span class="loadout-filtergroup" role="group" aria-label="${esc(text('kindFilter'))}"><small>${esc(text('kindFilter'))}</small>${kinds.map((key) => chip('data-loadout-kind', key, text(`kind_${key}`), state.pickerKind === key)).join('')}</span>` : ''}
                <span class="loadout-filtergroup">
                ${grades.map((grade) => chip('data-loadout-grade', grade, `${text('grade')} ${grade}`, state.pickerGrade === grade)).join('')}
                ${classes.map((klass) => chip('data-loadout-class', klass, className({ klass }), state.pickerClass === klass)).join('')}
                ${chip('data-loadout-buyable', '1', text('buyableOnly'), Boolean(state.pickerBuyable))}
                </span>
            </div>
            <p class="loadout-note loadout-picker-count">${esc(text('pickerCount', { count: candidates.length }))}${filtered ? ` <button type="button" class="loadout-link" data-loadout-clear-filters>${esc(text('clearFilters'))}</button>` : ''}${node.itemId ? ` <button type="button" class="loadout-link" data-loadout-pick="" data-loadout-path="${esc(node.path)}">${esc(text('removeItem'))}</button>` : ''}${Number(node.item?.power?.use) > 0 || state.off[node.path] ? powerButton(node.path, node.item, Boolean(state.off[node.path])) : ''}</p>
            ${run.length > 1 ? `<p class="loadout-note loadout-runnote">${esc(text('runNote', { count: run.length }))}</p>` : ''}
            ${siblings.length + 1 > run.length ? `<label class="loadout-bulk"><input type="checkbox" id="loadout-bulk" ${state.pickerBulk ? 'checked' : ''}> ${esc(text('bulkApply', { count: siblings.length + 1 }))}</label>` : ''}
            <div class="loadout-optwrap" tabindex="0" role="region" aria-label="${esc(text('tableRegion'))}"><table class="loadout-opttable">
                <thead><tr>${head('name', text('colPart'), true)}${columns.map((metric, index) => head(`m${index}`, metric.label)).join('')}${head('price', text('colPrice'))}<th scope="col"></th></tr></thead>
                <tbody class="loadout-optrows">${shown.map(([id, item]) => `<tr data-loadout-candidate="${esc(id)}" data-loadout-path="${esc(node.path)}" class="${id === currentId ? 'is-current' : ''}${state.families.has(id) ? ' is-variant' : ''}">
                    <th scope="row" class="loadout-option-main"><div class="loadout-product-title"><button type="button" class="loadout-part-link" data-loadout-detail="${esc(id)}" aria-label="${esc(text('partDetails'))}: ${esc(itemName(id, item))}" title="${esc(text('partDetails'))}"><strong title="${esc(internalName(item) ? itemName(id, item) : item.name)}">${esc(itemName(id, item))}</strong></button>${familyButton(id)}</div>${itemOriginal(id, item)}${weaponAttribution(item)}<span class="loadout-meta">${esc(itemMeta(item))}</span></th>
                    ${columns.map((column) => cell(item, column, id === currentId)).join('')}
                    <td class="loadout-optprice">${drawPrice(id, item)}</td>
                    <td class="loadout-optact"><button type="button" class="btn btn-secondary loadout-equip" data-loadout-pick="${esc(id)}" data-loadout-path="${esc(node.path)}" ${id === currentId ? 'disabled' : ''}>${esc(id === currentId ? text('selected') : text('select'))}</button></td>
                </tr>`).join('') || `<tr><td class="loadout-note" colspan="${columns.length + 3}">${esc(text(filtered ? 'filteredEmpty' : 'pickerEmpty'))}</td></tr>`}</tbody>
            </table></div>
            ${grouped.length > shown.length ? `<button type="button" class="btn btn-secondary" data-loadout-picker-more>${esc(text('finderMore', { count: grouped.length - shown.length }))}</button>` : ''}
        </div>`;
    }

    // 한 줄로 묶인 자리들: 줄의 첫 자리 경로 → 묶인 모든 자리 경로. 교체·기본값은 묶음 전체에 적용한다.
    let slotRuns = new Map();
    const runOf = (path) => slotRuns.get(path) || [path];
    const splitKey = (parent) => `${state.shipCls}|${parent}`;
    // 같은 랙에 같은 미사일·폭탄이 나란히 달려 있으면 한 줄(×16)로 묶는다. 「하나씩 보기」로 풀 수 있다.
    function mergeRuns(list) {
        const runs = [];
        for (const node of list) {
            const parent = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
            const ordnance = node.item ? Boolean(node.item.ms) : (node.slot.acc || []).some((rule) => rule.type === 'Missile' || rule.type === 'Bomb');
            const key = node.hasChildren || node.slot.kind !== 's' || !ordnance ? '' : [parent, node.itemId || '', node.slot.min, node.slot.max, node.changed ? 1 : 0, state.off[node.path] ? 1 : 0].join('|');
            const last = runs[runs.length - 1];
            if (key && last?.key === key) last.members.push(node); else runs.push({ key, parent, members: [node] });
        }
        return runs.flatMap((run) => {
            if (run.members.length < 2) return run.members;
            if (state.split[splitKey(run.parent)]) return run.members.map((node, index) => (index ? node : { ...node, regroup: run.parent }));
            const paths = run.members.map((node) => node.path);
            slotRuns.set(paths[0], paths);
            return [{ ...run.members[0], run: paths, runParent: run.parent }];
        });
    }

    // 마운트·랙 아래에 줄이 하나뿐이면(무기 한 정, 같은 미사일 묶음) 둘을 한 줄로 합친다.
    // 사용자는 "왼쪽 날개의 무기"를 바꾸려는 것이므로 위치와 무기만 보이고, 마운트는 선택 창 안에서 바꾼다.
    const MOUNT_TYPES = ['Turret', 'TurretBase', 'UtilityTurret', 'WeaponMount', 'MissileLauncher', 'BombLauncher', 'GroundVehicleMissileLauncher'];
    let mountOf = new Map(); // 합쳐진 줄의 자리 경로 → 그 위의 마운트·랙
    let placeOf = new Map(); // 자리 경로 → 화면에 보이는 위치 이름
    function foldMounts(rows) {
        const out = [];
        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            let end = index + 1;
            while (row.hasChildren && end < rows.length && rows[end].path.startsWith(`${row.path}/`)) end += 1;
            const kid = end - index === 2 && MOUNT_TYPES.includes(row.item?.type) ? rows[index + 1] : null;
            if (kid && !kid.hasChildren && kid.regroup === undefined) {
                mountOf.set(kid.path, row);
                out.push({ ...kid, mount: row, level: row.level, crumb: row.crumb, place: position(row.slot) || slotPlace(row.slot, row.item) });
                index = end - 1;
            } else out.push(row);
        }
        return out;
    }

    // 장착 줄 아래에 보이는 핵심 수치(대표 수치 한 칸은 오른쪽에 따로 나온다).
    function slotFacts(node) {
        const item = node.item;
        // 아래에 자리를 거느린 부품은 수치를 비워 두되, 퀀텀 드라이브(아래에 점프 모듈)는 예외로 보여 준다.
        if (!item || (node.hasChildren && !item.qd && item.type !== 'WeaponMining')) return [];
        if (calc.isGun(item)) {
            const sustained = calc.weaponSustain(item); const reach = calc.weaponRange(item);
            return [`${text('sustainShort')} ${num(sustained.dps)}`, item.w.speed ? text('speed', { value: num(item.w.speed) }) : '', reach ? text('reach', { value: num(reach) }) : ''].filter(Boolean);
        }
        if (item.sh) return [text('shieldRegen', { value: num(item.sh.regen) }), item.sh.dmgDelay ? `${text('regenDelayShort')} ${num(item.sh.dmgDelay, 1)}${text('seconds')}` : ''].filter(Boolean);
        if (item.qd) {
            const reach = state.ship.base?.fuel?.qt && Number(item.qd.fuel) ? state.ship.base.fuel.qt / Number(item.qd.fuel) : 0;
            return [text('spool', { value: num(item.qd.spool, 1) }), reach ? text('range', { value: num(reach) }) : ''].filter(Boolean);
        }
        if (item.ms) {
            const each = calc.sumDamage(item.ms.dmg);
            return [`S${item.size ?? '?'} ${typeLabel(item.type)}`, node.run ? text('perShot2', { value: num(each) }) : '', item.ms.signal ? text('signal', { value: table('signals')[item.ms.signal] || item.ms.signal }) : '', item.ms.lock ? text('lock', { value: num(item.ms.lock, 1) }) : '', item.ms.radius ? `${text('blastRadius')} ${num(item.ms.radius)}m` : ''].filter(Boolean);
        }
        return itemFacts(item).slice(compareMetric(item) ? 1 : 0, compareMetric(item) ? 4 : 3);
    }
    // 오른쪽 대표 수치. 묶인 미사일·폭탄은 묶음 전체의 피해 합계를 보여 준다.
    function slotMetric(node) {
        if (node.item?.miningHead) {
            const result = state.mining.find((head) => head.path === node.path);
            if (result) return `<span class="loadout-metric" data-loadout-mining-power="${esc(node.path)}"><b>${result.power.value === null ? '—' : esc(num(result.power.value))}</b><small>${esc(result.power.verified ? text('laserPower') : text('unverifiedStack'))}</small></span>`;
        }
        if (node.hasChildren && !node.item?.qd && node.item?.type !== 'WeaponMining') return '<span class="loadout-metric"></span>';
        if (node.item?.ms && node.run) return `<span class="loadout-metric"><b>${esc(num(calc.sumDamage(node.item.ms.dmg) * node.run.length))}</b><small>${esc(text('totalDmg'))}</small></span>`;
        return drawMetric(node.item);
    }

    function drawSlot(node) {
        const { slot, item, itemId, path } = node;
        const changed = node.changed || Boolean(node.mount?.changed);
        const editable = slot.kind === 's';
        const open = state.openPath === path || (node.mount && state.openPath === node.mount.path);
        const off = Boolean(state.off[path]);
        const canPower = item && (Number(item.power?.use) > 0 || node.hasChildren);
        // 랙에 실린 미사일·폭탄은 탄 자체의 크기를 앞에 보이고, 랙 크기는 위치 설명에 적는다.
        const ordnanceOnRack = Boolean(node.mount && item?.ms);
        const sized = ordnanceOnRack ? slot : (node.mount?.slot || slot);
        const facts = slotFacts(node);
        const size = sized.max !== undefined ? (sized.min === sized.max || !sized.min ? `S${sized.max}` : `S${sized.min}-${sized.max}`) : (item?.size !== undefined ? `S${item.size}` : '');
        const modulePlace = (item?.type === 'MiningModifier' || slot.acc?.some((rule) => rule.type === 'MiningModifier')) ? slotPlace(slot, item) : '';
        const own = modulePlace || node.place || (node.run ? position(slot).replace(/ ?#\d+$/, '') : position(slot)) || slotPlace(slot, item).replace(node.run ? / #\d+$/ : /$^/, '');
        const place = `${[node.crumb, own].filter(Boolean).join(' › ')}${ordnanceOnRack ? ` · ${text('rackOn', { size: node.mount.slot.max ?? node.mount.item?.size ?? '?', type: typeLabel(node.mount.item?.type) })}` : ''}`;
        placeOf.set(path, place);
        return `<li class="loadout-slot${node.mount ? ' has-mount' : ''}${changed ? ' is-changed' : ''}${open ? ' is-open' : ''}${editable ? '' : ' is-fixed'}${item ? '' : ' is-empty'}${off ? ' is-off' : ''}${node.hasChildren ? ' is-mount' : ''}${node.level ? ' is-child' : ''}" data-loadout-slot="${esc(path)}" data-loadout-level="${node.level || 0}">
            ${node.mount ? `<div class="loadout-mount-card" data-loadout-mount="${esc(node.mount.path)}"><span class="loadout-mount-size">S${esc(node.mount.item?.size ?? node.mount.slot.max ?? '?')}</span><span class="loadout-mount-label">${esc(typeLabel(node.mount.item?.type))}</span>${node.mount.slot.kind === 's' ? `<button type="button" class="loadout-component-open" data-loadout-component-open="${esc(node.mount.path)}">${esc(itemName(node.mount.itemId, node.mount.item))}</button>` : `<strong>${esc(itemName(node.mount.itemId, node.mount.item))}</strong>`}${itemOriginal(node.mount.itemId, node.mount.item)}${drawFacts(node.mount.item, 2)}<button type="button" class="loadout-link" data-loadout-mount-detail="${esc(node.mount.itemId)}" data-loadout-detail-slot="${esc(node.mount.path)}">${esc(text('partDetails'))}</button>${node.mount.slot.kind === 's' && /Launcher$/.test(node.mount.item?.type || '') ? `<button type="button" class="btn btn-secondary loadout-swapbtn${/Launcher$/.test(node.mount.item?.type || '') ? ' is-rack' : ''}" data-loadout-rack-open="${esc(node.mount.path)}" aria-expanded="${state.openPath === node.mount.path}"><span aria-hidden="true">⇄</span> ${esc(text(/Launcher$/.test(node.mount.item?.type || '') ? 'rackChange' : 'mountChange'))}</button>` : node.mount.slot.kind !== 's' && /Launcher$/.test(node.mount.item?.type || '') ? `<span class="loadout-fixed">${esc(text('fixedRack'))}</span>` : ''}</div>` : ''}
            <div class="loadout-slot-row">
                <span class="loadout-size" aria-hidden="true">${esc(size)}</span>
                <div class="loadout-slot-main">
                    <span class="loadout-slot-label">${esc(place)}${changed ? ` <em>${esc(text('changed'))}</em>` : ''}${off ? ` <em class="loadout-offmark">${esc(text('poweredOff'))}</em>` : ''}</span>
                    <strong class="loadout-item-name">${editable ? `<button type="button" class="loadout-component-open" data-loadout-component-open="${esc(path)}" aria-label="${esc(text('change'))}: ${esc(item ? itemName(itemId, item) : slotPlace(slot, item))}">${item ? esc(itemName(itemId, item)) : esc(text('empty'))}</button>` : item ? esc(itemName(itemId, item)) : esc(text('empty'))}</strong>${node.run ? ` <b class="loadout-count">×${node.run.length}</b>` : ''}${itemOriginal(itemId, item)}${weaponAttribution(item)}
                    ${facts.length ? `<span class="loadout-slot-facts">${facts.map((fact) => `<span>${esc(fact)}</span>`).join('')}</span>` : ''}
                </div>
                ${slotMetric(node)}
                ${calc.isGun(item) ? `<div class="loadout-component-stats"><span>${esc(text('alphaShort'))}<b>${num(calc.weaponStats(item).alpha, 1)}</b></span><span>${esc(text('rpmShort'))}<b>${num(item.w.rpm)}</b></span><span>${esc(text('magSize'))}<b>${num(item.w.ammo || item.w.regen?.load)}</b></span><span>${esc(text('powerUseLabel'))}<b>${num(item.power?.use, 1)}</b></span></div>` : ''}
                <div class="loadout-slot-actions">
                    ${item?.miningModule?.activation === 'ActivateOnDemand' ? `<button type="button" class="loadout-link" data-loadout-module-active="${esc(path)}" aria-pressed="${Boolean(state.operation.activeModules[path])}">${esc(text(state.operation.activeModules[path] ? 'disengageModule' : 'engageModule'))}</button>` : ''}
                    ${item ? `<button type="button" class="loadout-link" data-loadout-detail="${esc(itemId)}" data-loadout-detail-slot="${esc(path)}">${esc(text('partDetails'))}</button>` : ''}
                    ${item ? `<button type="button" class="loadout-link" data-loadout-shop-detail="${esc(itemId)}" data-loadout-detail-slot="${esc(path)}" data-loadout-shops>${esc(text('shopsTab'))}</button>` : ''}
                    ${changed ? `<button type="button" class="loadout-link" data-loadout-reset="${esc(node.mount?.changed ? node.mount.path : path)}">${esc(text('reset'))}</button>` : ''}
                    ${node.run ? `<button type="button" class="loadout-link" data-loadout-split="${esc(node.runParent)}">${esc(text('splitRun'))}</button>` : ''}${node.regroup !== undefined ? `<button type="button" class="loadout-link" data-loadout-split="${esc(node.regroup)}">${esc(text('mergeRun'))}</button>` : ''}
                    ${off || canPower ? powerButton(path, item, off) : ''}
                    ${editable ? `<button type="button" class="btn btn-secondary loadout-swapbtn${/Launcher$/.test(item?.type || '') ? ' is-rack' : ''}" data-loadout-open="${esc(path)}" aria-expanded="${open}"><span aria-hidden="true">⇄</span> ${esc(text(/Launcher$/.test(item?.type || '') ? 'rackChange' : 'change'))}</button>` : `<span class="loadout-fixed">${esc(text(/Launcher$/.test(item?.type || '') ? 'fixedRack' : 'fixed'))}</span>`}
                </div>
            </div>
        </li>`;
    }

    // 큰 묶음(무장 / 방어·동력 / 이동·기타) 안에 종류별 목록을 둔다.
    const SUPER_GROUPS = [['superArms', ['weapon', 'missile']], ['superDefense', ['shield', 'power', 'cooler']], ['superTravel', ['quantum', 'radar', 'other']], ['superUtility', ['mining', 'utility']]];

    function drawPowerSummary(totals, stock) {
        const stat = (key, value, change = '') => `<div class="loadout-stat"><span class="loadout-stat-label">${esc(text(key))}</span><strong>${esc(num(value, 1))}</strong>${change}</div>`;
        const row = (key, value, change = '') => `<div class="loadout-row"><dt>${esc(text(key))}</dt><dd>${esc(num(value, 1))}${change}</dd></div>`;
        return `<div class="loadout-system-facts" role="group" aria-label="${esc(text('powerSummary'))}">${stat('power', totals.power.gen, drawChange(totals.power.gen, stock.power.gen, 1))}${stat('cooling', totals.cooling.gen, drawChange(totals.cooling.gen, stock.cooling.gen, 1))}<dl class="loadout-rows">${row('powerUseLabel', totals.power.use, drawChange(totals.power.use, stock.power.use, 1, 'low'))}${row(totals.power.gen >= totals.power.use ? 'powerSpare' : 'powerShort2', Math.abs(totals.power.gen - totals.power.use))}</dl></div><p class="loadout-note">${esc(text('powerUse', { use: num(totals.power.use, 1) }))}</p>${totals.off ? `<p class="loadout-note loadout-offnote">${esc(text('offCount', { count: totals.off }))}</p>` : ''}`;
    }

    function drawPowerPlan(totals, stock) {
        if (!state.ship.systems) return `<section class="loadout-panel-section"><h4>${esc(text('powerSummary'))}</h4>${drawPowerSummary(totals, stock)}</section>`;
        const plan = calc.powerPlan(state.ship, state.items, state.overrides, { off: state.off, operation: state.operation });
        const control = (group) => {
            const available = powerAllocationLimit(group, plan.remaining);
            const name = text(`power_${group.key}`);
            const increase = Math.max(group.min, group.allocated + 1);
            const decrease = group.allocated <= Math.max(1, group.min) ? 0 : group.allocated - 1;
            // Minimum operating power is one indivisible block. Keep its exact
            // boundary even when large capital-ship ranges need fewer visual steps.
            const base = Math.max(1, group.min);
            const count = Math.min(Math.max(0, group.max - base), 19);
            const steps = [base, ...Array.from({ length: count }, (_, i) => base + Math.ceil((i + 1) * (group.max - base) / count))];
            const blocks = steps.map((value, index) => {
                const minimum = index === 0 && group.min > 1;
                const selected = value === group.allocated;
                return `<button type="button" class="${value <= group.allocated ? 'is-filled ' : ''}${minimum ? 'is-minimum' : ''}" data-loadout-pip="${group.key}" data-loadout-value="${value}" data-loadout-power-span="${value - (steps[index - 1] || 0)}" aria-label="${esc(text('powerPip', { name, value }))}${minimum ? ` · ${esc(text('powerBase', { min: group.min }))}` : ''}" aria-pressed="${selected}" ${value > available ? 'disabled' : ''} title="${esc(text('powerPip', { name, value }))} · ${esc(text('powerAvailable', { max: available }))}">${minimum ? `<b>${group.min}</b><span>${esc(text('minimumPower'))}</span>` : `<span class="visually-hidden">${value}</span>`}</button>`;
            });
            return `<div class="loadout-power-channel${group.allocated === 0 ? ' is-empty' : ''}"><label for="loadout-power-${group.key}">${esc(name)}</label><div class="loadout-power-pips" role="group" aria-label="${esc(name)}">${blocks.reverse().join('')}</div><div class="loadout-power-adjust"><button type="button" data-loadout-pip="${group.key}" data-loadout-value="${decrease}" aria-label="${esc(text('powerLess', { name }))}" ${group.allocated === 0 ? 'disabled' : ''}>−</button><input id="loadout-power-${group.key}" type="number" inputmode="numeric" min="0" max="${available}" step="1" value="${group.allocated}" data-loadout-power-value="${group.key}" aria-describedby="loadout-power-hint-${group.key}"><button type="button" data-loadout-pip="${group.key}" data-loadout-value="${increase}" aria-label="${esc(text('powerMore', { name }))}" ${increase > available ? 'disabled' : ''}>+</button></div><small id="loadout-power-hint-${group.key}" title="${esc(text('powerMinimum', group))} · ${esc(text('powerAvailable', { max: available }))}">${esc(group.allocated === 0 ? text('powerEmpty') : text('powerLimitShort', group))}</small></div>`;
        };
        return `<section class="loadout-panel-section loadout-power-plan"><h4 id="loadout-power-title" tabindex="-1">${esc(text('powerPlanTitle'))}</h4><div class="loadout-power-budget" role="status"><span>${esc(text('powerBudget', { used: num(plan.allocated), total: num(plan.capacity) }))}</span><strong>${esc(text('powerReserve'))} <b>${num(plan.remaining)}</b></strong></div><meter class="loadout-power-meter" min="0" max="${plan.capacity || 1}" value="${plan.allocated}" aria-label="${esc(text('powerBudget', { used: plan.allocated, total: plan.capacity }))}"></meter><div class="loadout-power-channels">${plan.groups.map(control).join('')}</div><p class="loadout-note loadout-power-guide">${esc(text('powerGuide'))}</p><div class="loadout-power-actions"><button type="button" class="btn btn-secondary" data-loadout-power-auto>${esc(text('powerAuto'))}</button><button type="button" class="loadout-link" data-loadout-power-clear>${esc(text('powerClear'))}</button><button type="button" class="loadout-link" data-loadout-power-rated>${esc(text('powerRated'))}</button></div>${drawPowerSummary(totals, stock)}<div class="loadout-power-supply"><strong>${esc(text('powerSupply', { total: num(plan.capacity) }))}</strong><span>${plan.plants.map((plant) => `${esc(shoppingName(plant.itemId, plant.item))} · ${num(plant.generation)}`).join(' / ')}</span></div><details class="loadout-help"><summary>${esc(text('powerHelp'))}</summary><p class="loadout-note">${esc(text('powerBudgetHelp'))}</p></details></section>`;
    }

    const miningLabels = { laserInstability: 'instab', resistanceModifier: 'resistMod', optimalChargeWindowSizeModifier: 'windowMod', optimalChargeWindowRateModifier: 'moduleCharge', shatterdamageModifier: 'shatterMod' };
    function drawMiningEffects(head) {
        if (!head) return '';
        const effects = (values) => Object.entries(values || {}).filter(([key]) => miningLabels[key]).map(([key, effect]) => `${text(miningLabels[key])} ${effect.value > 0 ? '+' : ''}${num(effect.value, 1)}%`).join(' · ');
        const output = (result) => result.value === null ? text('unverifiedStack') : num(result.value);
        return `<section class="loadout-mining-result" aria-label="${esc(text('miningResults'))}"><div class="loadout-mining-output"><span>${esc(text('laserPower'))}<strong>${esc(output(head.power))}</strong><small>${esc(text('miningBase'))} ${head.power.base === null ? '—' : num(head.power.base)}</small></span><span>${esc(text('extractionPower'))}<strong>${esc(output(head.extraction))}</strong><small>${esc(text('miningBase'))} ${head.extraction.base === null ? '—' : num(head.extraction.base)}</small></span></div><details><summary>${esc(text('miningEffects'))}</summary><p>${esc(text('miningOverlap'))}</p><dl><dt>${esc(itemName(head.itemId, head.item))}</dt><dd>${esc(effects(head.item.miningHead.effects)) || '—'}</dd>${head.modules.map((node) => `<dt>${esc(itemName(node.itemId, node.item))} · ${esc(text(node.active ? 'activeNow' : 'inactiveNow'))}</dt><dd>${esc(effects(node.item.miningModule.effects)) || '—'}</dd>`).join('')}</dl></details></section>`;
    }

    function drawAssemblyRows(rows) {
        let html = '';
        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            let end = i + 1;
            while (row.hasChildren && end < rows.length && rows[end].path.startsWith(`${row.path}/`)) end += 1;
            const children = rows.slice(i + 1, end);
            const changed = row.changed || row.mount?.changed || state.off[row.path] || state.operation.activeModules[row.path] || children.some((node) => node.changed || node.mount?.changed || state.off[node.path] || state.operation.activeModules[node.path]);
            const hidden = state.changedOnly && !changed;
            if (children.length) {
                const closed = state.assemblies.has(row.path);
                const guns = allNodes().filter((node) => node.path.startsWith(`${row.path}/`) && calc.isGun(node.item));
                const dps = guns.reduce((sum, node) => sum + (Object.keys(state.off).some((path) => state.off[path] && (node.path === path || node.path.startsWith(`${path}/`))) ? 0 : calc.weaponStats(node.item).dps), 0);
                html += `<li class="loadout-assembly" data-loadout-assembly="${esc(row.path)}" ${hidden ? 'hidden' : ''}><div class="loadout-assembly-heading"><strong>${esc(slotPlace(row.slot, row.item))}</strong>${guns.length ? `<span>${esc(text('assemblyWeapons', { count: guns.length }))} · ${esc(text('burstDps'))} ${num(dps)}</span>` : ''}<button type="button" class="loadout-link" data-loadout-assembly-toggle="${esc(row.path)}" aria-expanded="${!closed}">${esc(text(closed ? 'assemblyExpand' : 'assemblyCollapse'))}</button></div><div class="loadout-assembly-tree"><ul class="loadout-assembly-parent">${drawSlot(row)}</ul><div class="loadout-assembly-descendants" ${closed ? 'hidden' : ''}>${drawMiningEffects(state.mining.find((head) => head.path === row.path))}<ul class="loadout-assembly-children">${drawAssemblyRows(children)}</ul></div></div></li>`;
                i = end - 1;
            } else {
                const rendered = drawSlot(row);
                html += hidden ? rendered.replace('<li ', '<li hidden ') : rendered;
            }
        }
        return html;
    }

    function drawSlots(nodes) {
        const groups = new Map(GROUP_ORDER.map((key) => [key, []]));
        let current = 'other';
        const trail = [];
        const shown = []; // 화면에 행으로 나온 상위 부품의 경로(들여쓰기 깊이 계산용)
        nodes.forEach((node, index) => {
            if (node.depth === 0) {
                current = slotGroup(node.slot, node.item);
                const descendants = nodes.slice(index + 1).filter((entry) => entry.path.startsWith(node.path + '/'));
                if (descendants.some((entry) => ['WeaponMining', 'MiningModifier'].includes(entry.item?.type || entry.slot.acc?.[0]?.type))) current = 'mining';
                else if (descendants.some((entry) => ['SalvageHead', 'TractorBeam', 'TowingBeam'].includes(entry.item?.type))) current = 'utility';
                else if (descendants.some((entry) => calc.isGun(entry.item))) current = 'weapon';
            }
            trail.length = node.depth;
            const hasChildren = nodes[index + 1]?.path.startsWith(`${node.path}/`) || false;
            trail[node.depth] = slotPlace(node.slot, node.item);
            // 대응 수단(플레어 등)과 아무것도 달 수 없는 고정 빈자리는 편집 화면에서 숨긴다.
            if (node.item?.type === 'WeaponDefensive' || (!node.item && node.slot.kind !== 's')) return;
            // 터렛·랙·채광 헤드는 상위 카드로 남겨 각 하위 장비의 소속을 보여 준다.
            if (node.slot.kind !== 's' && hasChildren && !MOUNT_TYPES.includes(node.item?.type) && node.item?.type !== 'WeaponMining') return;
            while (shown.length && !node.path.startsWith(`${shown[shown.length - 1].path}/`)) shown.pop();
            const parent = shown[shown.length - 1];
            // 화면에 나온 상위 부품 아래에서는 그 부품까지의 위치 설명을 되풀이하지 않는다.
            const crumb = trail.slice(parent ? parent.depth + 1 : 0, node.depth).filter(Boolean).join(' › ');
            groups.get(current).push({ ...node, hasChildren, crumb, level: shown.length });
            if (hasChildren) shown.push({ path: node.path, depth: node.depth });
        });
        slotRuns = new Map(); mountOf = new Map(); placeOf = new Map();
        const group = (key) => {
            const rows = foldMounts(mergeRuns(groups.get(key)));
            // 화면 묶음과 무관하게 각 실제 경로를 한 번씩 센다(상위 장착 자리 포함).
            const count = groups.get(key).length;
            const shownCount = groups.get(key).filter((row) => !state.changedOnly || row.changed || state.off[row.path] || state.operation.activeModules[row.path]).length;
            const hidden = state.changedOnly && !rows.some((row) => row.changed || row.mount?.changed || state.off[row.path] || state.operation.activeModules[row.path]);
            return `<section class="loadout-group is-${key}" ${hidden ? 'hidden' : ''}>
            <h4><button type="button" class="loadout-group-toggle" data-loadout-collapse="${key}" aria-expanded="${!state.collapsed.has(key)}" aria-controls="loadout-rows-${key}"><span>${esc(groupLabel(key))}</span><span>${esc(state.changedOnly ? text('visibleSlots', { shown: shownCount, count }) : text('slotCount', { count }))} <span aria-hidden="true">${state.collapsed.has(key) ? '+' : '−'}</span></span></button></h4>
            <ul id="loadout-rows-${key}" class="loadout-slotlist" ${state.collapsed.has(key) ? 'hidden' : ''}>${drawAssemblyRows(rows)}</ul>
        </section>`;
        };
        const available = SUPER_GROUPS.filter(([, keys]) => keys.some((key) => groups.get(key).length));
        if (!available.some(([label]) => label === state.equipmentGroup)) state.equipmentGroup = '';
        const navigation = `<div class="loadout-equipment-nav" role="group" aria-label="${esc(text('equipmentNav'))}">${[['', []], ...available].map(([label]) => `<button type="button" id="loadout-category-${label || 'all'}" class="loadout-category${state.equipmentGroup === label ? ' is-active' : ''}" data-loadout-category="${label}" aria-pressed="${state.equipmentGroup === label}">${esc(text(label || 'allEquipment'))}</button>`).join('')}</div>`;
        // Render every group so slot/mount mappings stay complete while filtering the view.
        const controls = `<div class="loadout-view-tools"><button type="button" class="loadout-link" data-loadout-collapse-all>${esc(text(state.collapsed.size ? 'expandAll' : 'collapseAll'))}</button><label><input type="checkbox" id="loadout-compact" ${state.compact ? 'checked' : ''}> ${esc(text('compactView'))}</label><label><input type="checkbox" id="loadout-changed-only" ${state.changedOnly ? 'checked' : ''}> ${esc(text('changedOnly'))}</label></div>${state.changedOnly && !nodes.some((node) => node.changed || state.off[node.path] || state.operation.activeModules[node.path]) ? `<p class="loadout-note">${esc(text('noChanges'))}</p>` : ''}`;
        const primary = new Set(['weapon', 'missile', 'quantum', 'mining', 'utility']);
        const columns = [[], []];
        for (const [label, keys] of available) {
            for (const key of keys.filter((key) => groups.get(key).length)) {
                const html = group(key);
                columns[primary.has(key) ? 0 : 1].push(state.equipmentGroup && state.equipmentGroup !== label ? html.replace('<section ', '<section hidden ') : html);
            }
        }
        return `<p class="loadout-note loadout-equipment-hint">${esc(text('equipmentHint'))}</p>` + navigation + controls + `<div class="loadout-equipment-board"><div class="loadout-equipment-column is-primary">${columns[0].join('')}</div><div class="loadout-equipment-column is-systems">${columns[1].join('')}</div></div>`;
    }

    function drawShopping(cost) {
        if (!cost.rows.length) return `<p class="loadout-note">${esc(text('shoppingEmpty'))}</p>`;
        return `<div class="loadout-table-wrap" tabindex="0" role="region" aria-label="${esc(text('tableRegion'))}"><table class="loadout-table">
            <thead><tr><th>${esc(text('part'))}</th><th>${esc(text('qty'))}</th><th>${esc(text('cheapest'))}</th><th>${esc(text('subtotal'))}</th></tr></thead>
            <tbody>${cost.rows.map((row) => {
        const shop = row.info.shops[0];
        return `<tr><td><strong>${esc(itemName(row.id, row.item))}</strong>${itemOriginal(row.id, row.item)}<span class="loadout-meta">${esc(itemMeta(row.item))}</span></td><td>${row.qty}</td>
                    <td>${shop ? `${esc(shop.shop)}<span class="loadout-meta">${esc([shop.place, shop.system].filter(Boolean).join(', '))}</span>` : drawPrice(row.id, row.item)}</td>
                    <td>${shop ? esc(credits(shop.price * row.qty)) : '—'}</td></tr>`;
    }).join('')}</tbody>
            <tfoot><tr><th colspan="3">${esc(text('total'))}</th><th>${esc(credits(cost.rows.reduce((sum, row) => sum + (row.info.min || 0) * row.qty, 0)))}</th></tr></tfoot>
        </table></div>${cost.unknown ? `<p class="loadout-note">${esc(text('lootNote'))}</p>` : ''}`;
    }

    // ---- 장바구니 · 부품 찾기 · 무기 상세 · 저장한 로드아웃 ----------------------
    // 장바구니: 편집과 따로, 사고 싶은 부품을 수량과 함께 담아 두고 어디서 얼마에 사는지 모아 본다.
    function readPlan() {
        try {
            const saved = JSON.parse(localStorage.getItem(PLAN_KEY) || '{}');
            return { mode: saved?.mode === 'grouped' ? 'grouped' : 'cheapest', shops: Object.fromEntries(Object.entries(saved?.shops || {}).filter(([, v]) => typeof v === 'string')), order: Array.isArray(saved?.order) ? saved.order.filter((v) => typeof v === 'string') : [] };
        } catch (_error) { return { mode: 'cheapest', shops: {}, order: [] }; }
    }
    function savePlan() {
        try { localStorage.setItem(PLAN_KEY, JSON.stringify(state.plan)); } catch (_error) { /* Keep the current plan in memory. */ }
    }

    function readCart() {
        try { const cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}'); return cart && typeof cart === 'object' && !Array.isArray(cart) ? cart : {}; } catch (_error) { return {}; }
    }
    function writeCart(cart) {
        try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_error) { /* 저장 공간을 쓸 수 없으면 이번 화면에서만 유지 */ }
        state.cart = cart;
    }
    function addToCart(id, quantity = 1) {
        if (!state.items?.[id]) return;
        const cart = { ...state.cart };
        cart[id] = Math.min(99, (Number(cart[id]) || 0) + quantity);
        writeCart(cart);
        loadCategoryPrices(state.items[id].type);
    }
    function setCartQuantity(id, quantity) {
        const cart = { ...state.cart };
        if (quantity <= 0) { delete state.plan.shops[id]; savePlan(); }
        if (quantity > 0) cart[id] = Math.min(99, quantity); else delete cart[id];
        writeCart(cart);
    }
    const cartCount = () => Object.values(state.cart).reduce((total, quantity) => total + (Number(quantity) || 0), 0);
    function cartRows() {
        return Object.entries(state.cart).map(([id, quantity]) => ({ id, item: state.items?.[id], qty: Number(quantity) || 0 }))
            .filter((row) => row.item && row.qty > 0).map((row) => ({ ...row, info: priceInfo(row.id, row.item) }));
    }
    function loadPricesForCart() {
        for (const id of Object.keys(state.cart)) if (state.items?.[id]) loadCategoryPrices(state.items[id].type);
    }

    function drawCartDrawer() {
        return `<div class="loadout-drawer-backdrop" data-loadout-close></div><section class="loadout-picker loadout-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="loadout-cart-title"><header class="loadout-picker-title"><h3 id="loadout-cart-title">${esc(text('tab_cart'))} · ${cartCount()}</h3><button type="button" id="loadout-cart-close" class="loadout-close" data-loadout-close aria-label="${esc(text('close'))}">×</button></header><div class="loadout-detail-content">${drawCart()}</div></section>`;
    }

    function drawCart() {
        const rows = cartRows();
        if (!rows.length) return `<div class="loadout-view"><p class="loadout-note">${esc(text('cartEmpty'))}</p></div>`;
        const plan = planner.plan(rows, state.plan);
        const loading = rows.some((row) => state.priceState.get(UEX_CATEGORY[row.item.type]) === 'loading');
        const failed = rows.some((row) => state.priceState.get(UEX_CATEGORY[row.item.type]) === 'error');
        return `<div class="loadout-view">
            <div class="loadout-viewhead"><p class="loadout-note">${esc(text('cartSummary', { kinds: rows.length, count: cartCount() }))}</p>
                <button type="button" class="loadout-link" data-loadout-cart-clear>${esc(text('cartClear'))}</button></div>
            <div class="loadout-plan-controls" role="group" aria-label="${esc(text('planMode'))}">
                ${['cheapest', 'grouped'].map((mode) => `<button type="button" class="loadout-chip${state.plan.mode === mode ? ' is-active' : ''}" data-loadout-plan-mode="${mode}" aria-pressed="${state.plan.mode === mode}">${esc(text(mode === 'cheapest' ? 'planCheapest' : 'planGrouped'))}</button>`).join('')}
                <button type="button" class="loadout-link" data-loadout-plan-reset>${esc(text('planReset'))}</button>
                <button type="button" class="loadout-link" data-loadout-refresh-prices ${loading ? 'disabled' : ''}>${esc(text(loading ? 'refreshingPrices' : 'refreshPrices'))}</button>
            </div>
            <details class="loadout-plan-help"><summary>${esc(text('planHelpTitle'))}</summary><p class="loadout-note">${esc(text('planHelp'))}</p></details>
            ${failed ? `<p class="loadout-note" role="status">${esc(text('refreshFailed'))}</p>` : ''}
            <div class="loadout-table-wrap" tabindex="0" role="region" aria-label="${esc(text('tableRegion'))}"><table class="loadout-table loadout-carttable">
                <thead><tr><th>${esc(text('part'))}</th><th>${esc(text('qty'))}</th><th>${esc(text('planShop'))}</th><th>${esc(text('subtotal'))}</th><th><span class="visually-hidden">${esc(text('cartRemove'))}</span></th></tr></thead>
                <tbody>${rows.map((row) => {
                    const shop = plan.assigned.get(row.id);
                    const manual = state.plan.shops[row.id];
                    return `<tr data-loadout-cart-row="${esc(row.id)}">
                        <td><strong>${esc(itemName(row.id, row.item))}</strong>${itemOriginal(row.id, row.item)}<span class="loadout-meta">${esc(`${typeLabel(row.item.type)} · ${itemMeta(row.item)}`)}</span></td>
                        <td><span class="loadout-qty"><button type="button" data-loadout-cart-dec="${esc(row.id)}" aria-label="${esc(text('qtyLess'))}">−</button><b>${row.qty}</b><button type="button" data-loadout-cart-inc="${esc(row.id)}" aria-label="${esc(text('qtyMore'))}">+</button></span></td>
                        <td><label class="visually-hidden" for="shop-${esc(row.id)}">${esc(text('planShop'))} · ${esc(itemName(row.id, row.item))}</label>
                            <select id="shop-${esc(row.id)}" class="loadout-shop-select" data-loadout-cart-shop="${esc(row.id)}">
                                <option value="" ${!manual ? 'selected' : ''}>${esc(text('planAuto'))}</option>
                                ${plan.missing.has(row.id) ? `<option value="${esc(manual)}" selected>${esc(text('planMissing'))}</option>` : ''}
                                ${row.info.shops.map((offer) => `<option value="${esc(planner.shopKey(offer))}" ${manual === planner.shopKey(offer) ? 'selected' : ''}>${esc([offer.system, offer.place, offer.shop].filter(Boolean).join(' / '))} · ${esc(credits(offer.price))}</option>`).join('')}
                            </select>
                            ${shop ? `<span class="loadout-meta">${esc([shop.shop, shop.place, shop.system].filter(Boolean).join(' · '))} · ${esc(credits(shop.price))}</span>` : plan.missing.has(row.id) ? `<span class="loadout-note">${esc(text('planMissing'))}</span>` : drawPrice(row.id, row.item)}
                        </td>
                        <td>${shop ? esc(credits(shop.price * row.qty)) : '—'}</td>
                        <td><button type="button" class="loadout-link" data-loadout-cart-remove="${esc(row.id)}">${esc(text('cartRemove'))}</button></td>
                    </tr>`;
                }).join('')}</tbody>
                <tfoot><tr><th colspan="3">${esc(text('total'))}</th><th colspan="2">${esc(credits(plan.total))}</th></tr></tfoot>
            </table></div>
            ${plan.unknown.length ? `<p class="loadout-note">${esc(text('planUnknown', { count: plan.unknown.length }))}</p>` : ''}
            ${plan.total > plan.cheapest ? `<p class="loadout-note">${esc(text('planExtra', { price: credits(plan.total - plan.cheapest) }))}</p>` : ''}
            <div class="loadout-viewhead"><h4 class="loadout-subhead">${esc(text('planRoute'))} · ${esc(text('planStops', { count: plan.groups.length }))}</h4><button type="button" class="loadout-link" data-loadout-plan-copy>${esc(text('planCopy'))}</button></div>
            <ol class="loadout-shoplist">${plan.groups.map((group, index) => `<li>
                <div><strong>${index + 1}. ${esc(group.shop.shop)}</strong><span class="loadout-meta">${esc([group.shop.place, group.shop.system].filter(Boolean).join(', '))}</span></div>
                <span class="loadout-shopitems">${group.rows.map((row) => `${esc(shoppingName(row.id, row.item))} ×${row.qty}`).join(', ')}</span>
                <b>${esc(credits(group.total))}</b>
                <div class="loadout-route-actions"><button type="button" class="loadout-link" data-loadout-route-key="${esc(group.key)}" data-loadout-route-move="-1" ${index === 0 ? 'disabled' : ''}>${esc(text('planUp'))}</button><button type="button" class="loadout-link" data-loadout-route-key="${esc(group.key)}" data-loadout-route-move="1" ${index === plan.groups.length - 1 ? 'disabled' : ''}>${esc(text('planDown'))}</button></div>
            </li>`).join('')}</ol>
        </div>`;
    }

    // 부품 찾기: 함선과 상관없이 전체 부품을 종류·크기로 훑어보고 장바구니에 담는다.
    const FINDER_TYPES = ['WeaponGun', 'Missile', 'MissileLauncher', 'Turret', 'Shield', 'PowerPlant', 'Cooler', 'QuantumDrive', 'Radar', 'WeaponMining', 'MiningModifier', 'TractorBeam', 'SalvageHead', 'Bomb', 'JumpDrive', 'EMP', 'QuantumInterdictionGenerator'];
    function drawFinder() {
        const type = state.finderType || FINDER_TYPES[0];
        const query = state.finderQuery.trim().toLowerCase();
        // 게임 안 이름이 없는 부품(함선 전용 내장 부품 등)은 찾기 목록에서 뺀다. 장착 화면에서는 그대로 보인다.
        const ofType = Object.entries(state.items).filter(([, item]) => item.type === type && item.name !== item.cls && !item.hidden);
        const sizes = [...new Set(ofType.map(([, item]) => item.size).filter((size) => size !== undefined))].sort((a, b) => a - b);
        const list = ofType
            .filter(([, item]) => !state.finderSize || String(item.size) === String(state.finderSize))
            .filter(([id, item]) => !query || [item.name, itemName(id, item), item.mfr, mfrName(item)].some((value) => String(value || '').toLowerCase().includes(query)))
            .filter(([id, item]) => !state.finderBuyable || priceInfo(id, item).min > 0)
            .sort(([ida, a], [idb, b]) => (SORTS[state.finderSort] || SORTS.best)(a, b, ida, idb) || String(itemName(ida, a)).localeCompare(String(itemName(idb, b))));
        const grouped = familyRows(list, query);
        const shown = grouped.slice(0, state.finderLimit);
        const chip = (attr, value, label, active) => `<button type="button" class="loadout-chip${active ? ' is-active' : ''}" ${attr}="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
        return `<div class="loadout-view">
            <div class="loadout-filters" role="group" aria-label="${esc(text('finderType'))}">${FINDER_TYPES.map((key) => chip('data-loadout-finder-type', key, typeLabel(key), key === type)).join('')}</div>
            <div class="loadout-picker-head">
                <input type="search" id="loadout-finder-search" autocomplete="off" placeholder="${esc(text('pickerSearch'))}" value="${esc(state.finderQuery)}" aria-label="${esc(text('pickerSearch'))}">
                <label class="loadout-sort"><span>${esc(text('sortLabel'))}</span>
                    <select id="loadout-finder-sort" aria-label="${esc(text('sortLabel'))}">${['best', 'name', 'price'].map((key) => `<option value="${key}" ${state.finderSort === key ? 'selected' : ''}>${esc(text(`sort_${key}`))}</option>`).join('')}</select>
                </label>
            </div>
            <div class="loadout-filters" role="group" aria-label="${esc(text('filterLabel'))}">
                ${sizes.map((size) => chip('data-loadout-finder-size', size, `S${size}`, String(state.finderSize) === String(size))).join('')}
                ${chip('data-loadout-finder-buyable', '1', text('buyableOnly'), Boolean(state.finderBuyable))}
            </div>
            <p class="loadout-note" id="loadout-finder-count">${esc(text('finderCount', { count: list.length }))}</p>
            <ul class="loadout-options loadout-finderlist">${shown.map(([id, item]) => `<li>
                <div class="loadout-option-main">
                    <strong>${esc(itemName(id, item))}</strong>${familyButton(id)}${itemOriginal(id, item)}${weaponAttribution(item)}
                    <span class="loadout-meta">${esc(itemMeta(item))}</span>${drawFacts(item)}${drawPrice(id, item)}
                </div>
                ${drawMetric(item)}
                <div class="loadout-option-side"><button type="button" class="loadout-link" data-loadout-detail="${esc(id)}">${esc(text('partDetails'))}</button>
                    ${state.cart[id] ? `<span class="loadout-delta is-up">${esc(text('inCart', { count: state.cart[id] }))}</span>` : ''}
                    <button type="button" class="btn btn-secondary" data-loadout-cart-add="${esc(id)}">${esc(text('cartAdd'))}</button>
                </div>
            </li>`).join('') || `<li class="loadout-note">${esc(text('pickerEmpty'))}</li>`}</ul>
            ${grouped.length > shown.length ? `<button type="button" class="btn btn-secondary loadout-more" data-loadout-finder-more>${esc(text('finderMore', { count: grouped.length - shown.length }))}</button>` : ''}
        </div>`;
    }

    // 무기 상세: 지금 달린 무기를 같은 것끼리 묶어 한 표로 견준다.
    function drawWeapons(nodes) {
        const groups = new Map();
        for (const node of nodes) {
            if (!calc.isGun(node.item)) continue;
            const stats = calc.weaponStats(node.item);
            if (!stats.dps && !stats.alpha) continue;
            const key = `${node.itemId}|${node.turret ? 't' : 'p'}`;
            const group = groups.get(key) || { id: node.itemId, item: node.item, turret: node.turret, count: 0, stats, sustain: calc.weaponSustain(node.item) };
            group.count += 1; groups.set(key, group);
        }
        const rows = [...groups.values()].sort((a, b) => Number(a.turret) - Number(b.turret) || b.stats.dps * b.count - a.stats.dps * a.count);
        if (!rows.length) return `<div class="loadout-view"><p class="loadout-note">${esc(text('weaponsNone'))}</p></div>`;
        const kind = (item) => Object.keys(item.w.dmg || item.w.beamDps || {}).map((type) => table('damage')[type] || type).join('·');
        const total = rows.reduce((sum, row) => sum + row.stats.dps * row.count, 0);
        const sustainTotal = rows.reduce((sum, row) => sum + row.sustain.dps * row.count, 0);
        const limitText = (row) => (row.sustain.limit ? text(row.sustain.limit === 'heat' ? 'limitHeat' : 'limitCap', { fire: num(row.sustain.fireTime, 1), down: num(row.sustain.downTime, 1) }) : text('limitNone'));
        const ammoText = (w) => { const rate = w.rpm ? w.rpm / 60 : 0; return `${num(w.ammo)}${rate ? ` (${text('ammoTime', { value: num(w.ammo / rate) })})` : ''}`; };
        return `<div class="loadout-view"><div class="loadout-table-wrap" tabindex="0" role="region" aria-label="${esc(text('tableRegion'))}"><table class="loadout-table loadout-weapontable">
            <thead><tr><th>${esc(text('part'))}</th><th>${esc(text('whoFires'))}</th><th>${esc(text('qty'))}</th><th>${esc(text('size'))}</th><th>DPS</th><th>${esc(text('sustainDps'))}</th><th>${esc(text('dpsSum'))}</th><th>${esc(text('alphaShort'))}</th><th>${esc(text('rpmShort'))}</th><th>${esc(text('speedShort'))}</th><th>${esc(text('rangeShort'))}</th><th>${esc(text('dmgKind'))}</th><th>${esc(text('ammoShort'))}</th><th>${esc(text('limitCol'))}</th></tr></thead>
            <tbody>${rows.map((row) => `<tr>
                <td><strong>${esc(itemName(row.id, row.item))}</strong>${itemOriginal(row.id, row.item)}</td>
                <td>${esc(row.turret ? text('turret') : text('pilot'))}</td><td>${row.count}</td><td>S${esc(row.item.size ?? '?')}</td>
                <td>${esc(num(row.stats.dps))}</td><td>${esc(num(row.sustain.dps))}</td><td>${esc(num(row.stats.dps * row.count))}</td><td>${esc(num(row.stats.alpha, 1))}</td>
                <td>${esc(row.item.w.rpm ? num(row.item.w.rpm) : '—')}</td><td>${esc(row.item.w.speed ? `${num(row.item.w.speed)} m/s` : '—')}</td>
                <td>${esc(calc.weaponRange(row.item) ? `${num(calc.weaponRange(row.item))} m` : '—')}</td><td>${esc(kind(row.item))}</td>
                <td>${esc(row.item.w.ammo ? ammoText(row.item.w) : (row.item.w.regen ? (row.item.w.regen.load ? text('capacitor', { load: num(row.item.w.regen.load), rate: num(row.item.w.regen.perSec || 0, 1) }) : text('ammoRegen')) : '—'))}</td>
                <td>${esc(limitText(row))}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr><th colspan="4">${esc(text('total'))}</th><th>${esc(num(total))}</th><th colspan="9">${esc(text('sustainDps'))} ${esc(num(sustainTotal))}</th></tr></tfoot>
        </table></div>${drawMissiles(nodes)}</div>`;
    }

    function drawMissiles(nodes) {
        const groups = new Map();
        for (const node of nodes) {
            if (!node.item?.ms) continue;
            const group = groups.get(node.itemId) || { id: node.itemId, item: node.item, count: 0 };
            group.count += 1; groups.set(node.itemId, group);
        }
        const rows = [...groups.values()].sort((a, b) => (b.item.size || 0) - (a.item.size || 0));
        if (!rows.length) return '';
        const damage = (item) => calc.sumDamage(item.ms.dmg);
        return `<h3 class="loadout-subhead">${esc(text('missileTable'))}</h3><div class="loadout-table-wrap" tabindex="0" role="region" aria-label="${esc(text('tableRegion'))}"><table class="loadout-table loadout-missiletable">
            <thead><tr><th>${esc(text('part'))}</th><th>${esc(text('qty'))}</th><th>${esc(text('size'))}</th><th>${esc(text('dmgShort'))}</th><th>${esc(text('speedShort'))}</th><th>${esc(text('lockShort'))}</th><th>${esc(text('rangeShort'))}</th><th>${esc(text('trackShort'))}</th></tr></thead>
            <tbody>${rows.map((row) => `<tr>
                <td><strong>${esc(itemName(row.id, row.item))}</strong>${itemOriginal(row.id, row.item)}</td>
                <td>${row.count}</td><td>S${esc(row.item.size ?? '?')}</td><td>${esc(num(damage(row.item)))}</td>
                <td>${esc(row.item.ms.speed ? `${num(row.item.ms.speed)} m/s` : '—')}</td><td>${esc(row.item.ms.lock ? `${num(row.item.ms.lock, 1)}${text('seconds')}` : '—')}</td>
                <td>${esc(row.item.ms.rangeMax ? `${num(row.item.ms.rangeMax)} m` : '—')}</td><td>${esc(table('signals')[row.item.ms.signal] || row.item.ms.signal || '—')}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr><th colspan="3">${esc(text('total'))}</th><th colspan="5">${esc(num(rows.reduce((sum, row) => sum + damage(row.item) * row.count, 0)))}</th></tr></tfoot>
        </table></div>`;
    }

    // 구성 비교: 저장해 둔 로드아웃 하나를 지금 구성과 나란히 놓고 본다(다른 함선끼리도 가능).
    function compareMetrics(ship, totals, overrides = state.overrides, off = state.off, operation = state.operation) {
        const plan = calc.powerPlan(ship, state.items, overrides, { off, operation });
        const heads = calc.miningHeads(ship, state.items, overrides, { off, operation });
        const mining = (key) => heads.some((head) => head[key].value === null) ? null : heads.reduce((sum, head) => sum + head[key].value, 0);
        const flight = ship.base?.flight || {};
        return [
            ['burstDps', totals.dps.total], ['sustainDps', totals.sustain.total], ['pilot', totals.dps.pilot], ['turret', totals.dps.turret], ['alpha', totals.alpha.total], ['missiles', totals.missiles.damage],
            ['shield', totals.shield.hp], ['regenLabel', totals.shield.regen], ['hullHp', ship.base?.hull || 0], ['armorHp', ship.base?.armor?.hp || 0],
            ['power', totals.power.gen, 1], ['powerUseLabel', totals.power.use, 1, 'low'], ['cooling', totals.cooling.gen, 1], ['signatureEm', totals.signature.em, 0, 'low'], ['signatureIr', totals.signature.ir, 0, 'low'],
            ['qdSpeedLabel', (totals.quantum?.speed || 0) / 1000], ['spoolLabel', totals.quantum?.spool || 0, 1, 'low'], ['rangeLabel', totals.quantum?.range || 0], ['scmSpeed', flight.scm || 0], ['navSpeed', flight.max || 0],
            ['allocation', plan.allocated], ['powerReserve', plan.remaining], ['laserPower', mining('power')], ['extractionPower', mining('extraction')],
        ];
    }
    async function startCompare(index) {
        const build = readBuilds()[index];
        if (!build) return;
        state.compare = { name: build.name, cls: build.ship, overrides: build.overrides || {}, off: build.off || {}, operation: build.operation || {}, ship: null, failed: false };
        state.tab = 'compare'; draw();
        try {
            const buildShip = canonicalShip(build.ship);
            const ship = buildShip === state.shipCls ? state.ship : await fetchJson(`${DATA_BASE}/ships/${buildShip}.json?v=${state.meta?.stamp || ''}`);
            if (state.compare?.name !== build.name) return;
            ship.systems = state.systems[buildShip];
            state.compare.ship = ship;
            state.compare.overrides = calc.sanitizeOverrides(ship, state.items, Object.fromEntries(Object.entries(build.overrides || {}).map(([path, id]) => [path, canonicalItem(id)])));
            state.compare.operation = calc.sanitizeOperation(ship, state.items, state.compare.overrides, state.compare.operation, { off: state.compare.off });
        } catch (error) {
            console.warn('Loadout compare load failed', error);
            if (state.compare) state.compare.failed = true;
        }
        draw();
    }
    const compareTable = (mineLabel, mineSub, otherLabel, otherSub, mine, theirs) => `<div class="loadout-table-wrap" tabindex="0" role="region" aria-label="${esc(text('tableRegion'))}"><table class="loadout-table loadout-comparetable">
            <thead><tr><th>${esc(text('compareItem'))}</th><th>${esc(mineLabel)}<span class="loadout-origin">${esc(mineSub)}</span></th><th>${esc(otherLabel)}<span class="loadout-origin">${esc(otherSub)}</span></th><th>${esc(text('compareDiff'))}</th></tr></thead>
            <tbody>${mine.map(([key, value, digits = 0, better = 'high'], index) => `<tr><th scope="row">${esc(text(key))}</th><td>${value === null ? '—' : esc(num(value, digits))}</td><td>${theirs[index][1] === null ? '—' : esc(num(theirs[index][1], digits))}</td><td>${value === null || theirs[index][1] === null ? esc(text('unverifiedStack')) : drawChange(value, theirs[index][1], digits, better) || `<span class="loadout-meta">${esc(text('same'))}</span>`}</td></tr>`).join('')}</tbody>
        </table></div>`;
    // 저장하지 않고도 지금 구성(A)과 복제해 둔 다른 구성(B)을 바로 견준다.
    function drawAbCompare(totals) {
        const otherSlot = state.slot === 'A' ? 'B' : 'A';
        if (!state.alt) return `<section class="loadout-abcompare"><h3>${esc(text('abCompare'))}</h3><p class="loadout-note">${esc(text('abHint'))}</p><button type="button" class="btn btn-primary" data-loadout-ab="${otherSlot}">${esc(text('abOpen', { slot: otherSlot }))}</button></section>`;
        const theirs = compareMetrics(state.ship, calc.summarize(state.ship, state.items, state.alt.overrides, { off: state.alt.off }), state.alt.overrides, state.alt.off, state.alt.operation);
        return `<section class="loadout-abcompare"><div class="loadout-viewhead"><h3>${esc(text('abCompare'))}</h3><button type="button" class="btn btn-secondary" data-loadout-ab="${otherSlot}">${esc(text('abGo', { slot: otherSlot }))}</button><button type="button" class="btn btn-secondary" data-loadout-ab-copy>${esc(text('abCopy', { slot: otherSlot }))}</button></div>
            ${compareTable(text('abSlot', { slot: state.slot }), text('compareNow'), text('abSlot', { slot: otherSlot }), text('changedCount', { count: Object.keys(state.alt.overrides).length }), compareMetrics(state.ship, totals), theirs)}</section>`;
    }
    function drawCompare(totals) {
        const other = state.compare;
        const builds = readBuilds();
        const buildLabel = (build) => { const ship = state.index.find((entry) => entry.cls === canonicalShip(build.ship)); return `${build.name} · ${ship ? shipName(ship) : build.ship}`; };
        if (!other) return `<div class="loadout-view">${drawAbCompare(totals)}<div class="loadout-viewhead"><h3>${esc(text('savedCompare'))}</h3></div>${builds.length ? `<p class="loadout-note">${esc(text('compareChoose'))}</p><ul class="loadout-comparelist">${builds.map((build, index) => `<li><button type="button" class="btn btn-secondary" data-loadout-build-compare="${index}">${esc(buildLabel(build))}</button></li>`).join('')}</ul>` : `<p class="loadout-note">${esc(text('compareNone'))}</p>`}</div>`;
        if (other.failed) return `<div class="loadout-view"><p class="loadout-note" role="alert">${esc(text('loadFail'))}</p></div>`;
        if (!other.ship) return `<div class="loadout-view"><p class="loadout-note" role="status">${esc(text('loading'))}</p></div>`;
        const mine = compareMetrics(state.ship, totals);
        const theirs = compareMetrics(other.ship, calc.summarize(other.ship, state.items, other.overrides, { off: other.off }), other.overrides, other.off, other.operation);
        return `<div class="loadout-view"><div class="loadout-viewhead"><h3>${esc(text('tab_compare'))}</h3><label class="loadout-sort"><span>${esc(text('comparePick'))}</span><select id="loadout-compare-pick" aria-label="${esc(text('comparePick'))}">${builds.map((build, index) => `<option value="${index}" ${build.name === other.name && canonicalShip(build.ship) === canonicalShip(other.cls) ? 'selected' : ''}>${esc(buildLabel(build))}</option>`).join('')}</select></label><button type="button" class="btn btn-secondary" data-loadout-compare-clear>${esc(text('compareClear'))}</button></div>
            <div class="loadout-table-wrap" tabindex="0" role="region" aria-label="${esc(text('tableRegion'))}"><table class="loadout-table loadout-comparetable">
            <thead><tr><th>${esc(text('compareItem'))}</th><th>${esc(text('compareNow'))}<span class="loadout-origin">${esc(shipName(state.ship))}</span></th><th>${esc(other.name)}<span class="loadout-origin">${esc(shipName(other.ship))}</span></th><th>${esc(text('compareDiff'))}</th></tr></thead>
            <tbody>${mine.map(([key, value, digits = 0, better = 'high'], index) => `<tr><th scope="row">${esc(text(key))}</th><td>${value === null ? '—' : esc(num(value, digits))}</td><td>${theirs[index][1] === null ? '—' : esc(num(theirs[index][1], digits))}</td><td>${value === null || theirs[index][1] === null ? esc(text('unverifiedStack')) : drawChange(value, theirs[index][1], digits, better) || `<span class="loadout-meta">${esc(text('same'))}</span>`}</td></tr>`).join('')}</tbody>
        </table></div></div>`;
    }

    // 저장한 로드아웃: 이름을 붙여 여러 구성을 보관하고 다시 불러온다(이 브라우저에만 저장).
    function readBuilds() { const builds = readStored().builds; return Array.isArray(builds) ? builds : []; }
    function writeBuilds(builds) {
        // 성공 여부를 돌려준다 — 저장되지 않았는데 저장됐다고 안내하지 않기 위해서다.
        try { const stored = readStored(); stored.builds = builds.slice(0, 40); localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); return true; } catch (error) { console.warn('Loadout build save failed', error); return false; }
    }
    function drawBuilds() {
        const builds = readBuilds();
        const row = (build, index) => {
            const ship = state.index.find((entry) => entry.cls === canonicalShip(build.ship));
            return `<li><button type="button" class="loadout-buildload" data-loadout-build-load="${index}"><strong>${esc(build.name)}</strong><span class="loadout-meta">${esc(ship ? shipName(ship) : build.ship)} · ${esc(text('changedCount', { count: Object.keys(build.overrides || {}).length }))}</span></button><button type="button" class="loadout-link" data-loadout-build-compare="${index}">${esc(text('compareWith'))}</button><button type="button" class="loadout-link" data-loadout-build-delete="${index}">${esc(text('buildDelete'))}</button></li>`;
        };
        return `<section class="loadout-builds" aria-label="${esc(text('builds'))}">
            <div class="loadout-buildsave"><input type="text" id="loadout-build-name" maxlength="40" placeholder="${esc(text('buildName'))}" aria-label="${esc(text('buildName'))}" value="${esc(state.buildName || '')}"><button type="button" class="btn btn-secondary" data-loadout-build-save>${esc(text('buildSave'))}</button></div>
            ${builds.length ? `<ul class="loadout-buildlist">${builds.map(row).join('')}</ul>` : `<p class="loadout-note">${esc(text('buildsEmpty'))}</p>`}
        </section>`;
    }

    function drawTabs() {
        const tabs = state.ship ? ['slots', 'weapons', 'compare', 'finder', 'cart'] : ['finder', 'cart'];
        const count = cartCount();
        return `<div class="loadout-tabs" role="tablist" aria-label="${esc(text('tabsLabel'))}">${tabs.map((key) => `<button type="button" role="tab" aria-selected="${state.tab === key}" class="loadout-tab${state.tab === key ? ' is-active' : ''}" data-loadout-tab="${key}">${esc(text(`tab_${key}`))}${key === 'cart' && count ? ` <span class="loadout-badge">${count}</span>` : ''}</button>`).join('')}</div>`;
    }

    function drawSources() {
        const meta = state.meta || {};
        return `<details class="loadout-sources loadout-fold" id="loadout-sources" data-loadout-fold="sources" ${folds.has('sources') ? 'open' : ''}>
            <summary>${esc(text('sourceBrief', { version: meta.version || '' }))}</summary><p>
            <span>${esc(text('sourceStats'))}: ${esc(text('sourceGame'))}</span>
            <span>${esc(text('sourcePrices'))}: <a href="${esc(meta.priceSourceUrl || 'https://uexcorp.space/')}" target="_blank" rel="noopener noreferrer">UEX</a></span>
            ${lang() === 'ko' && state.ko?.source ? `<span>${esc(text('sourceTerms'))}: ${esc(state.ko.source)}</span>` : ''}
            ${meta.version ? `<span>${esc(text('sourceVersion', { version: meta.version }))}</span>` : ''}
            <span>${esc(text('sourceNote'))}</span>
        </p></details>`;
    }

    let composingInput = null;
    let summaryObserver;

    function draw() {
        const container = root();
        if (!container || !deps.canUse?.() || composingInput) return;
        state.mining = state.ship ? calc.miningHeads(state.ship, state.items, state.overrides, { off: state.off, operation: state.operation }) : [];
        const focusId = document.activeElement?.id;
        const caret = document.activeElement?.selectionStart;
        const scrolled = container.querySelector('.loadout-optwrap')?.scrollTop || 0;
        const detailScroll = container.querySelector('.loadout-detail-content')?.scrollTop || 0;
        let body = '';
        if (state.error) body = `<div class="loadout-error" role="alert"><p>${esc(state.error)}</p><button type="button" class="btn btn-secondary" data-loadout-retry>${esc(text('retry'))}</button></div>`;
        else if (!state.index) body = `<p class="loadout-note" role="status">${esc(text('loading'))}</p>`;
        else {
            body = state.ship ? '' : drawShipPicker();
            if (state.loading) body += `<p class="loadout-note" role="status">${esc(text('loading'))}</p>`;
            else if (state.ship) {
                const totals = calc.summarize(state.ship, state.items, state.overrides, { off: state.off });
                const stock = calc.summarize(state.ship, state.items, {});
                const cost = costSummary();
                const nodes = allNodes();
                const openNode = state.openPath ? nodes.find((node) => node.path === state.openPath) : null;
                if (!['slots', 'weapons', 'compare', 'finder', 'cart'].includes(state.tab)) state.tab = 'slots';
                const main = state.tab === 'weapons' ? drawWeapons(nodes) : state.tab === 'compare' ? drawCompare(totals) : state.tab === 'finder' ? drawFinder() : state.tab === 'cart' ? (state.cartOpen ? '' : drawCart())
                    : `${drawSlots(nodes)}<section class="loadout-shopping"><div class="loadout-viewhead"><h3>${esc(text('shopping'))}</h3>${cost.rows.length ? `<button type="button" class="btn btn-secondary" data-loadout-cart-changed>${esc(text('cartAddChanged'))}</button>` : ''}</div>${drawShopping(cost)}</section>`;
                body += `${drawShipHead(totals, stock)}
                    ${state.tab === 'cart' ? '' : drawSummary(totals, cost, stock)}
                    ${drawTabs()}
                    <div class="loadout-columns${state.tab === 'cart' ? ' is-cart' : ''}">
                        <div class="loadout-slots">${main}</div>
                        ${state.cartOpen ? drawCartDrawer() : state.detailId ? drawComponentDetail() : openNode ? drawPicker(openNode, nodes) : ''}
                        </div>`;
            }
            if (!state.ship && !state.loading) {
                if (!['finder', 'cart'].includes(state.tab)) state.tab = '';
                body += `${drawTabs()}${state.tab === 'finder' ? drawFinder() : state.tab === 'cart' ? (state.cartOpen ? '' : drawCart()) : ''}`;
            }
            if (!state.ship) body += state.cartOpen ? drawCartDrawer() : state.detailId ? drawComponentDetail() : '';
            body += drawSources();
        }
        container.innerHTML = body;
        summaryObserver?.disconnect();
        const toolbar = container.querySelector('.loadout-topbar');
        const identity = container.querySelector('.loadout-identity');
        if (toolbar && identity && typeof IntersectionObserver === 'function') {
            const update = () => toolbar.classList.toggle('is-scrolled', identity.getBoundingClientRect().bottom < 150);
            update();
            summaryObserver = new IntersectionObserver(update, { rootMargin: '-150px 0px 0px 0px' });
            summaryObserver.observe(identity);
        } else toolbar?.classList.add('is-scrolled');
        // CSSOM assignments keep dynamic measurements compatible with strict CSP.
        for (const bar of container.querySelectorAll('[data-loadout-width]')) bar.style.width = `${Math.max(0, Math.min(100, Number(bar.dataset.loadoutWidth) || 0))}%`;
        for (const block of container.querySelectorAll('[data-loadout-power-span]')) {
            const span = Math.max(1, Number(block.dataset.loadoutPowerSpan) || 1);
            block.style.flexGrow = String(span);
            block.style.maxHeight = `${Math.min(128, span * 18 + (span - 1) * 4)}px`;
        }
        for (const slot of container.querySelectorAll('[data-loadout-level]')) slot.style.setProperty('--lo-level', String(Math.max(0, Math.min(12, Number(slot.dataset.loadoutLevel) || 0))));
        container.classList.toggle('has-drawer', Boolean(state.cartOpen || state.detailId || (state.openPath && state.ship)));
        container.classList.toggle('is-compact', state.compact);
        window.VOLT_MOTION?.update(container, { view: state.tab, dialog: state.cartOpen ? 'cart' : state.detailId ? `detail:${state.detailId}` : state.openPath, panel: state.detailId ? state.detailTab : '', identity: state.shipCls, browsing: Boolean(container.querySelector('#loadout-ship-results')) });
        // 함선을 고른 뒤에는 큰 제목·설명을 접어 편집 화면이 바로 보이게 한다.
        document.getElementById('loadout')?.classList.toggle('has-ship', Boolean(state.ship));
        const options = container.querySelector('.loadout-optwrap');
        if (options && scrolled) options.scrollTop = scrolled;
        const detailContent = container.querySelector('.loadout-detail-content');
        if (detailContent && detailScroll) detailContent.scrollTop = detailScroll;
        if (focusId) {
            const target = document.getElementById(focusId);
            if (target) { target.focus({ preventScroll: true }); if (typeof caret === 'number' && target.setSelectionRange) { try { target.setSelectionRange(caret, caret); } catch (_error) { /* search 입력이 아닌 경우 */ } } }
        }
    }

    // ---- 동작 -------------------------------------------------------------
    function closePicker() {
        state.cartOpen = false;
        state.openPath = ''; state.pickerQuery = ''; state.pickerGrade = ''; state.pickerClass = ''; state.pickerDamage = ''; state.pickerKind = ''; state.pickerBuyable = false; state.pickerBulk = false; state.pickerLimit = 80; state.pickerReverse = false; state.detailId = '';
    }

    // 부품 선택 창을 닫고, 창을 열었던 "변경" 버튼으로 초점을 돌려보낸다.
    function dismissPicker() {
        if (state.cartOpen) { state.cartOpen = false; draw(); root()?.querySelector('[data-loadout-cart-open], [data-loadout-tab="cart"]')?.focus({ preventScroll: true }); return; }
        if (state.detailId) { const id = CSS.escape(state.detailReturn); state.detailId = ''; draw(); root()?.querySelector(`[data-loadout-detail="${id}"], [data-loadout-shop-detail="${id}"], [data-loadout-mount-detail="${id}"]`)?.focus({ preventScroll: true }); return; }
        const path = state.pickerOrigin || state.openPath;
        const attribute = state.pickerOriginAttribute || 'data-loadout-open';
        state.pickerOrigin = '';
        state.pickerOriginAttribute = '';
        closePicker(); draw();
        if (path) focusSlotControl(path, attribute);
    }

    // 직전 변경 취소용 기록. 부품 교체·기본값·전원 전환 직전에 지금 상태를 남긴다(최근 30번).
    function focusSlotControl(path, attribute = 'data-loadout-open') {
        const safe = CSS.escape(path);
        (root()?.querySelector(`[${attribute}="${safe}"]`) || root()?.querySelector(`[data-loadout-open="${safe}"], [data-loadout-component-open="${safe}"], [data-loadout-rack-open="${safe}"]`))?.focus({ preventScroll: true });
    }
    function remember() {
        state.redo = [];
        state.history.push({ overrides: { ...state.overrides }, off: { ...state.off }, operation: copyOperation() });
        if (state.history.length > 30) state.history.shift();
    }

    function setOverride(path, id) {
        const nodes = allNodes();
        const node = nodes.find((entry) => entry.path === path);
        if (!node || node.slot.kind !== 's') return;
        const wanted = new Set([...runOf(path), ...(state.pickerBulk ? siblingSlots(node, nodes).map((entry) => entry.path) : [])]);
        const targets = nodes.filter((entry) => wanted.has(entry.path));
        remember();
        state.operation = copyOperation();
        let next = { ...state.overrides };
        for (const target of targets) {
            // 이 자리를 바꾸면 그 아래 자리에 해 둔 변경은 의미가 없어지므로 함께 지운다.
            next = Object.fromEntries(Object.entries(next).filter(([key]) => key !== target.path && !key.startsWith(`${target.path}/`)));
            if (id !== (target.slot.item || '') && id !== canonicalItem(target.slot.item || '')) next[target.path] = id;
        }
        state.overrides = calc.sanitizeOverrides(state.ship, state.items, next);
        state.operation.activeModules = Object.fromEntries(Object.entries(state.operation.activeModules).filter(([key]) => !targets.some((target) => key === target.path || key.startsWith(`${target.path}/`))));
        if (id) state.familyOpen.add(state.families.get(id) || id);
        state.off = cleanOff(Object.fromEntries(Object.keys(state.off).filter((key) => !targets.some((entry) => key === entry.path || key.startsWith(`${entry.path}/`))).map((key) => [key, true])));
        state.operation = cleanOperation(state.operation);
        if (!state.keepPicker || !id) closePicker();
        writeStored(); draw(); loadPricesForChanged();
        deps.showToast?.(text('equippedNotice', { name: id ? itemName(id, state.items[id]) : text('empty') }));
        if (!state.openPath) focusSlotControl(path, state.pickerOriginAttribute || 'data-loadout-open');
    }

    function shareUrl() {
        const url = new URL(window.location.href);
        url.search = ''; url.hash = 'loadout';
        url.searchParams.set('loadout', state.shipCls);
        const encoded = calc.encodeOverrides(state.overrides);
        if (encoded) url.searchParams.set('set', encoded);
        if (Object.keys(state.off).length) url.searchParams.set('off', Object.keys(state.off).sort().join(','));
        if (Object.keys(state.operation.power).length || Object.keys(state.operation.activeModules).length) url.searchParams.set('op', JSON.stringify(state.operation));
        return url.toString();
    }

    function handleClick(event) {
        if (!root()?.contains(event.target)) return;
        if (event.target.closest('[data-loadout-close]')) { dismissPicker(); return; }
        const target = event.target.closest('button');
        if (!target) {
            const row = event.target.closest('[data-loadout-candidate]:not(.is-current)');
            if (row) setOverride(row.dataset.loadoutPath, row.dataset.loadoutCandidate);
            return;
        }
        if (target.hasAttribute('data-loadout-ship-market-retry')) { loadShipMarket(true); return; }
        if (target.hasAttribute('data-loadout-jump')) {
            closePicker(); state.tab = 'slots'; draw();
            const destination = target.dataset.loadoutJump === 'power' ? document.getElementById('loadout-power-title') : root()?.querySelector('[data-loadout-tab="slots"]');
            destination?.focus({ preventScroll: true });
            // Scroll the tablist itself: its horizontal overflow would otherwise
            // consume the button's scroll margin and hide it behind the header.
            (destination?.closest('.loadout-tabs') || destination)?.scrollIntoView({ block: 'start', behavior: 'instant' }); return;
        }
        if (target.hasAttribute('data-loadout-assembly-toggle')) { const path = target.dataset.loadoutAssemblyToggle; if (state.assemblies.has(path)) state.assemblies.delete(path); else state.assemblies.add(path); draw(); root()?.querySelector(`[data-loadout-assembly-toggle="${CSS.escape(path)}"]`)?.focus({ preventScroll: true }); return; }
        if (target.hasAttribute('data-loadout-module-active')) {
            const path = target.dataset.loadoutModuleActive;
            remember(); state.operation = copyOperation();
            if (state.operation.activeModules[path]) delete state.operation.activeModules[path]; else state.operation.activeModules[path] = true;
            state.operation = cleanOperation(state.operation); writeStored(); draw(); root()?.querySelector(`[data-loadout-module-active="${CSS.escape(path)}"]`)?.focus({ preventScroll: true }); return;
        }
        if (target.hasAttribute('data-loadout-pip')) { setPowerAllocation(target.dataset.loadoutPip, Number(target.dataset.loadoutValue)); return; }
        if (target.hasAttribute('data-loadout-power-auto') || target.hasAttribute('data-loadout-power-rated') || target.hasAttribute('data-loadout-power-clear')) {
            remember(); state.operation = copyOperation();
            const plan = calc.powerPlan(state.ship, state.items, state.overrides, { off: state.off });
            state.operation.power = target.hasAttribute('data-loadout-power-clear') ? Object.fromEntries(plan.groups.map((group) => [group.key, 0])) : target.hasAttribute('data-loadout-power-auto') ? calc.autoPowerPlan(plan) : {};
            state.operation = cleanOperation(state.operation);
            writeStored(); draw(); return;
        }
        if (target.hasAttribute('data-loadout-cart-open')) { closePicker(); state.cartOpen = true; loadPricesForCart(); draw(); document.getElementById('loadout-cart-close')?.focus(); return; }
        if (target.hasAttribute('data-loadout-detail-swap')) { state.detailId = ''; state.openPath = state.detailSlot; state.pickerLimit = 80; draw(); document.getElementById('loadout-picker-search')?.focus(); return; }
        if (target.hasAttribute('data-loadout-detail-equip')) { state.detailId = ''; setOverride(target.getAttribute('data-loadout-path'), target.getAttribute('data-loadout-detail-equip')); return; }
        const detail = target.getAttribute('data-loadout-detail') ?? target.getAttribute('data-loadout-shop-detail') ?? target.getAttribute('data-loadout-mount-detail');
        if (detail !== null && state.items[detail]) { state.detailShop = state.plan.shops[detail] || ''; state.detailId = detail; state.detailSlot = target.getAttribute('data-loadout-detail-slot') || ''; state.detailReturn = detail; state.detailTab = target.hasAttribute('data-loadout-shops') ? 'shops' : 'stats'; loadCategoryPrices(state.items[detail].type); draw(); document.getElementById('loadout-detail-close')?.focus(); return; }
        const shopPick = target.getAttribute('data-loadout-shop-pick');
        if (shopPick !== null) { state.detailShop = shopPick; draw(); root()?.querySelector(`[data-loadout-shop-pick="${CSS.escape(shopPick)}"]`)?.focus({ preventScroll: true }); return; }
        if (target.hasAttribute('data-loadout-detail-buy')) {
            const item = state.items[state.detailId];
            const offer = priceInfo(state.detailId, item).shops.find((shop) => planner.shopKey(shop) === state.detailShop);
            if (!offer) return;
            state.plan.shops[state.detailId] = state.detailShop; savePlan(); addToCart(state.detailId);
            closePicker(); state.cartOpen = true; draw(); document.getElementById('loadout-cart-close')?.focus(); return;
        }
        const detailTab = target.getAttribute('data-loadout-detail-tab');
        if (target.hasAttribute('data-loadout-mining')) { const resource = target.getAttribute('data-loadout-mining'); closePicker(); draw(); window.VOLT_APP?.showSection?.('mining'); window.VOLT_MINING?.open?.(resource); return; }
        if (['stats', 'shops', 'craft'].includes(detailTab)) { state.detailTab = detailTab; draw(); root()?.querySelector(`[data-loadout-detail-tab="${detailTab}"]`)?.focus(); return; }
        const collapse = target.getAttribute('data-loadout-collapse');
        if (collapse !== null) { if (state.collapsed.has(collapse)) state.collapsed.delete(collapse); else state.collapsed.add(collapse); draw(); root()?.querySelector(`[data-loadout-collapse="${collapse}"]`)?.focus({ preventScroll: true }); return; }
        if (target.hasAttribute('data-loadout-collapse-all')) { state.collapsed = state.collapsed.size ? new Set() : new Set(GROUP_ORDER); draw(); return; }
        if (target.hasAttribute('data-loadout-picker-more')) { state.pickerLimit += 80; draw(); return; }
        if (target.hasAttribute('data-loadout-redo')) {
            const next = state.redo.pop();
            if (next) { state.history.push({ overrides: { ...state.overrides }, off: { ...state.off }, operation: copyOperation() }); state.overrides = calc.sanitizeOverrides(state.ship, state.items, next.overrides); state.off = cleanOff(next.off); state.operation = cleanOperation(next.operation); closePicker(); writeStored(); draw(); loadPricesForChanged(); }
            return;
        }
        const family = target.getAttribute('data-loadout-family');
        if (family !== null) { if (state.familyOpen.has(family)) state.familyOpen.delete(family); else state.familyOpen.add(family); draw(); return; }
        const strategy = target.getAttribute('data-loadout-plan-mode');
        if (['cheapest', 'grouped'].includes(strategy)) { state.plan.mode = strategy; savePlan(); draw(); return; }
        if (target.hasAttribute('data-loadout-plan-reset')) { state.plan.shops = {}; savePlan(); draw(); return; }
        if (target.hasAttribute('data-loadout-refresh-prices')) { for (const type of new Set(cartRows().map((r) => r.item.type))) loadCategoryPrices(type, true); draw(); return; }
        const move = target.getAttribute('data-loadout-route-move');
        if (move !== null) {
            const keys = planner.plan(cartRows(), state.plan).groups.map((group) => group.key);
            const index = keys.indexOf(target.getAttribute('data-loadout-route-key'));
            const next = index + Number(move);
            if (index >= 0 && next >= 0 && next < keys.length) { [keys[index], keys[next]] = [keys[next], keys[index]]; state.plan.order = keys; savePlan(); draw(); }
            return;
        }
        if (target.hasAttribute('data-loadout-plan-copy')) {
            const plan = planner.plan(cartRows(), state.plan);
            const lines = plan.groups.map((g, i) => `${i + 1}. ${[g.shop.system, g.shop.place, g.shop.shop].filter(Boolean).join(' / ')}\n${g.rows.map((r) => `${shoppingName(r.id, r.item)} ×${r.qty}`).join('\n')}\n${credits(g.total)}`);
            if (plan.unknown.length) lines.push(text('planUnknown', { count: plan.unknown.length }));
            lines.push(`${text('total')}: ${credits(plan.total)}`);
            (navigator.clipboard?.writeText(lines.join('\n\n')) || Promise.reject()).then(() => deps.showToast?.(text('planCopied'))).catch(() => deps.showToast?.(text('shareFail'))); return;
        }
        const category = target.getAttribute('data-loadout-category');
        if (category !== null && ['', ...SUPER_GROUPS.map(([label]) => label)].includes(category)) { state.equipmentGroup = category; draw(); return; }
        if (target.hasAttribute('data-loadout-clear-filters')) {
            state.pickerQuery = ''; state.pickerGrade = ''; state.pickerClass = ''; state.pickerDamage = ''; state.pickerKind = ''; state.pickerBuyable = false;
            draw(); document.getElementById('loadout-picker-search')?.focus({ preventScroll: true }); return;
        }
        if (target.hasAttribute('data-loadout-retry')) { state.error = ''; render(); return; }
        if (target.hasAttribute('data-loadout-browse')) { state.browsing = !state.browsing; state.query = ''; draw(); if (state.browsing) document.getElementById('loadout-ship-search')?.focus({ preventScroll: true }); return; }
        const shipKind = target.getAttribute('data-loadout-ship-kind');
        if (shipKind !== null) { state.shipKind = shipKind; draw(); return; }
        const shipCls = target.getAttribute('data-loadout-ship');
        if (shipCls) { state.query = ''; state.browsing = false; closePicker(); selectShip(shipCls); return; }
        const openAttribute = ['data-loadout-open', 'data-loadout-component-open', 'data-loadout-rack-open'].find((attribute) => target.hasAttribute(attribute));
        const openPath = openAttribute ? target.getAttribute(openAttribute) : null;
        if (openPath !== null) {
            const same = state.openPath === openPath;
            if (!state.openPath) { state.pickerOrigin = openPath; state.pickerOriginAttribute = openAttribute; }
            closePicker();
            if (!same) {
                state.openPath = openPath;
                const node = allNodes().find((entry) => entry.path === openPath);
                for (const rule of node?.slot.acc || []) loadCategoryPrices(rule.type);
            }
            draw();
            if (!same) document.getElementById('loadout-picker-search')?.focus({ preventScroll: true });
            return;
        }
        const grade = target.getAttribute('data-loadout-grade');
        if (grade !== null) { state.pickerGrade = state.pickerGrade === grade ? '' : grade; draw(); return; }
        const sortKey = target.getAttribute('data-loadout-sort');
        if (sortKey !== null) { state.pickerReverse = state.pickerSort === sortKey ? !state.pickerReverse : false; state.pickerSort = sortKey; draw(); return; }
        const dmg = target.getAttribute('data-loadout-dmg');
        if (dmg !== null) { state.pickerDamage = state.pickerDamage === dmg ? '' : dmg; draw(); return; }
        const kind = target.getAttribute('data-loadout-kind');
        if (kind !== null) { state.pickerKind = state.pickerKind === kind ? '' : kind; draw(); return; }
        const klass = target.getAttribute('data-loadout-class');
        if (klass !== null) { state.pickerClass = state.pickerClass === klass ? '' : klass; draw(); return; }
        if (target.hasAttribute('data-loadout-buyable')) { state.pickerBuyable = !state.pickerBuyable; draw(); return; }
        if (target.hasAttribute('data-loadout-pick')) { setOverride(target.getAttribute('data-loadout-path'), target.getAttribute('data-loadout-pick')); return; }
        const powerPath = target.getAttribute('data-loadout-power');
        if (powerPath !== null) {
            remember();
            state.operation = copyOperation();
            const next = { ...state.off };
            if (next[powerPath]) delete next[powerPath]; else next[powerPath] = true;
            state.off = next;
            state.operation = cleanOperation(state.operation);
            // 화면을 덮는 선택 창에서 눌렀으면 창을 닫아 결과가 바로 보이게 한다.
            if (target.closest('.loadout-picker')) closePicker();
            writeStored(); draw(); return;
        }
        const splitParent = target.getAttribute('data-loadout-split');
        if (splitParent !== null) {
            const key = splitKey(splitParent);
            if (state.split[key]) delete state.split[key]; else state.split[key] = true;
            closePicker(); draw(); return;
        }
        const retryType = target.getAttribute('data-loadout-price-retry');
        if (retryType !== null) { loadCategoryPrices(retryType); draw(); return; }
        const resetPath = target.getAttribute('data-loadout-reset');
        if (resetPath !== null) {
            remember();
            state.operation = copyOperation();
            const paths = runOf(resetPath);
            state.overrides = Object.fromEntries(Object.entries(state.overrides).filter(([key]) => !paths.some((path) => key === path || key.startsWith(`${path}/`))));
            state.off = cleanOff(state.off);
            state.operation.activeModules = Object.fromEntries(Object.entries(state.operation.activeModules).filter(([key]) => !paths.some((path) => key === path || key.startsWith(`${path}/`))));
            state.operation = cleanOperation(state.operation);
            writeStored(); draw(); return;
        }
        if (target.hasAttribute('data-loadout-builds-toggle')) { state.buildsOpen = !state.buildsOpen; draw(); if (state.buildsOpen) document.getElementById('loadout-build-name')?.focus({ preventScroll: true }); return; }
        const abSlot = target.getAttribute('data-loadout-ab');
        if (abSlot !== null) {
            if (abSlot === state.slot) return;
            // 지금 구성을 넣어 두고 다른 쪽을 꺼낸다. 다른 쪽이 아직 없으면 지금 구성을 복제해 시작한다.
            const current = { overrides: { ...state.overrides }, off: { ...state.off }, operation: copyOperation() };
            const fresh = !state.alt;
            const next = state.alt || { overrides: { ...state.overrides }, off: { ...state.off }, operation: copyOperation() };
            state.alt = current; state.slot = abSlot; state.history = []; state.redo = [];
            state.overrides = calc.sanitizeOverrides(state.ship, state.items, next.overrides); state.off = cleanOff(next.off); state.operation = cleanOperation(next.operation);
            closePicker(); writeStored(); draw(); loadPricesForChanged();
            deps.showToast?.(text(fresh ? 'abStarted' : 'abSwitched', { slot: abSlot }));
            root()?.querySelector(`[data-loadout-ab="${abSlot}"]`)?.focus({ preventScroll: true });
            return;
        }
        if (target.hasAttribute('data-loadout-ab-copy')) {
            state.alt = { overrides: { ...state.overrides }, off: { ...state.off }, operation: copyOperation() };
            writeStored(); draw(); deps.showToast?.(text('abCopied', { slot: state.slot === 'A' ? 'B' : 'A' }));
            return;
        }
        if (target.hasAttribute('data-loadout-undo')) {
            const last = state.history.pop();
            if (last) state.redo.push({ overrides: { ...state.overrides }, off: { ...state.off }, operation: copyOperation() });
            if (last) { state.overrides = calc.sanitizeOverrides(state.ship, state.items, last.overrides); state.off = cleanOff(last.off); state.operation = cleanOperation(last.operation); closePicker(); writeStored(); draw(); loadPricesForChanged(); deps.showToast?.(text('undone')); }
            return;
        }
        if (target.hasAttribute('data-loadout-reset-all')) { remember(); state.overrides = {}; state.off = {}; state.operation = cleanOperation({}); closePicker(); writeStored(); draw(); deps.showToast?.(text('resetOk')); return; }
        const tab = target.getAttribute('data-loadout-tab') ?? target.getAttribute('data-loadout-view');
        if (tab !== null) { state.tab = tab; closePicker(); if (tab === 'cart') loadPricesForCart(); if (tab === 'finder') loadCategoryPrices(state.finderType || FINDER_TYPES[0]); draw(); return; }
        const cartAdd = target.getAttribute('data-loadout-cart-add');
        if (cartAdd !== null) { addToCart(cartAdd); deps.showToast?.(text('cartAdded')); draw(); return; }
        if (target.hasAttribute('data-loadout-cart-changed') || target.hasAttribute('data-loadout-quick-cart-changed')) {
            for (const row of costSummary().rows) addToCart(row.id, row.qty);
            deps.showToast?.(text('cartAdded')); draw(); return;
        }
        const inc = target.getAttribute('data-loadout-cart-inc');
        if (inc !== null) { setCartQuantity(inc, (Number(state.cart[inc]) || 0) + 1); draw(); return; }
        const dec = target.getAttribute('data-loadout-cart-dec');
        if (dec !== null) { setCartQuantity(dec, (Number(state.cart[dec]) || 0) - 1); draw(); return; }
        const remove = target.getAttribute('data-loadout-cart-remove');
        if (remove !== null) { setCartQuantity(remove, 0); draw(); return; }
        if (target.hasAttribute('data-loadout-cart-clear')) { writeCart({}); state.plan.shops = {}; state.plan.order = []; savePlan(); draw(); return; }
        const finderType = target.getAttribute('data-loadout-finder-type');
        if (finderType !== null) { state.finderType = finderType; state.finderSize = ''; state.finderLimit = 40; loadCategoryPrices(finderType); draw(); return; }
        const finderSize = target.getAttribute('data-loadout-finder-size');
        if (finderSize !== null) { state.finderSize = String(state.finderSize) === finderSize ? '' : finderSize; state.finderLimit = 40; draw(); return; }
        if (target.hasAttribute('data-loadout-finder-buyable')) { state.finderBuyable = !state.finderBuyable; draw(); return; }
        if (target.hasAttribute('data-loadout-finder-more')) { state.finderLimit += 40; draw(); return; }
        if (target.hasAttribute('data-loadout-build-save')) {
            const name = (document.getElementById('loadout-build-name')?.value || '').trim() || `${shipName(state.ship)} ${new Date().toLocaleDateString(lang() === 'en' ? 'en-US' : 'ko-KR')}`;
            const saved = writeBuilds([{ name: name.slice(0, 40), ship: state.shipCls, overrides: state.overrides, off: state.off, operation: copyOperation(), at: Date.now() }, ...readBuilds().filter((build) => !(build.name === name && build.ship === state.shipCls))]);
            // 실패하면 입력한 이름과 편집 내용을 그대로 두고 알린다.
            if (!saved) { deps.showToast?.(text('buildSaveFail')); return; }
            state.buildName = ''; state.buildsOpen = true; deps.showToast?.(text('buildSaved')); draw(); return;
        }
        const buildLoad = target.getAttribute('data-loadout-build-load');
        if (buildLoad !== null) { const build = readBuilds()[Number(buildLoad)]; if (build) { state.tab = 'slots'; state.buildsOpen = false; closePicker(); selectShip(build.ship, build.overrides || {}, build.off || {}, build.operation); } return; }
        const buildCompare = target.getAttribute('data-loadout-build-compare');
        if (buildCompare !== null) { closePicker(); state.buildsOpen = false; startCompare(Number(buildCompare)); return; }
        if (target.hasAttribute('data-loadout-compare-clear')) { state.compare = null; state.tab = 'slots'; draw(); return; }
        const buildDelete = target.getAttribute('data-loadout-build-delete');
        if (buildDelete !== null) { if (!writeBuilds(readBuilds().filter((_, index) => index !== Number(buildDelete)))) deps.showToast?.(text('buildSaveFail')); draw(); return; }
        if (target.hasAttribute('data-loadout-share')) {
            const url = shareUrl();
            (navigator.clipboard?.writeText ? navigator.clipboard.writeText(url) : Promise.reject(new Error('no clipboard')))
                .then(() => deps.showToast?.(text('shareOk')))
                .catch(() => { deps.showToast?.(text('shareFail')); window.prompt(text('share'), url); });
        }
    }

    function handleInput(event) {
        if (event.isComposing || composingInput) return;
        if (event.target.id === 'loadout-ship-search') { state.query = event.target.value; draw(); }
        if (event.target.id === 'loadout-picker-search') { state.pickerQuery = event.target.value; draw(); }
        if (event.target.id === 'loadout-finder-search') { state.finderQuery = event.target.value; state.finderLimit = 40; draw(); }
        if (event.target.id === 'loadout-build-name') { state.buildName = event.target.value; }
        if (event.target.id === 'loadout-qt-distance') {
            // 입력 중에는 화면 전체를 다시 그리지 않고 결과 글자만 바꾼다(숫자 입력이 끊기지 않게).
            state.qtDistance = Number(event.target.value) || 0;
            const output = document.getElementById('loadout-qt-time');
            const quantum = state.ship ? calc.summarize(state.ship, state.items, state.overrides, { off: state.off }).quantum : null;
            if (output) output.textContent = quantum ? travelText(quantum) : '—';
            const warning = document.getElementById('loadout-qt-warning');
            if (warning) { warning.textContent = travelWarning(quantum); warning.hidden = !warning.textContent; }
            event.target.setAttribute('aria-invalid', String(!(state.qtDistance >= 1 && state.qtDistance <= 999)));
        }
    }
    function powerAllocationLimit(group, remaining) {
        const available = Math.min(group.max, group.allocated + remaining);
        return available < group.min ? 0 : available;
    }
    function setPowerAllocation(key, value) {
        if (!Number.isFinite(value)) return;
        const plan = calc.powerPlan(state.ship, state.items, state.overrides, { off: state.off, operation: state.operation });
        const group = plan.groups.find((entry) => entry.key === key);
        if (!group) return;
        const next = value <= 0 ? 0 : Math.min(powerAllocationLimit(group, plan.remaining), Math.max(group.min, Math.round(value)));
        if (next === group.allocated) { const input = document.getElementById(`loadout-power-${key}`); if (input) input.value = String(next); return; }
        remember(); state.operation = copyOperation();
        state.operation.power = Object.fromEntries(plan.groups.map((entry) => [entry.key, entry.allocated]));
        state.operation.power[key] = next;
        writeStored(); draw(); document.getElementById(`loadout-power-${key}`)?.focus({ preventScroll: true });
    }

    function handleChange(event) {
        if (root()?.contains(event.target) && event.target.hasAttribute('data-loadout-power-value')) { setPowerAllocation(event.target.dataset.loadoutPowerValue, Number(event.target.value)); return; }
        if (['loadout-compact', 'loadout-keep-picker'].includes(event.target.id)) { const compact = event.target.id === 'loadout-compact' ? event.target.checked : state.compact; const keepPicker = event.target.id === 'loadout-keep-picker' ? event.target.checked : state.keepPicker; try { localStorage.setItem('volt-loadout-ui-v1', JSON.stringify({ compact, keepPicker })); } catch (_error) { /* optional preference */ } }
        if (event.target.id === 'loadout-compact') { state.compact = event.target.checked; draw(); }
        if (event.target.id === 'loadout-changed-only') { state.changedOnly = event.target.checked; draw(); }
        if (event.target.id === 'loadout-keep-picker') state.keepPicker = event.target.checked;
        const shopItem = event.target.getAttribute('data-loadout-cart-shop');
        if (shopItem !== null) {
            const value = event.target.value;
            const row = cartRows().find((entry) => entry.id === shopItem);
            if (!value) delete state.plan.shops[shopItem];
            else if (row?.info.shops.some((shop) => planner.shopKey(shop) === value)) state.plan.shops[shopItem] = value;
            savePlan(); draw();
        }
        if (event.target.id === 'loadout-picker-sort') { state.pickerReverse = false; state.pickerSort = event.target.value; draw(); }
        if (event.target.id === 'loadout-ship-mfr') { state.shipMfr = event.target.value; draw(); }
        if (event.target.id === 'loadout-finder-sort') { state.finderSort = event.target.value; draw(); }
        if (event.target.id === 'loadout-bulk') { state.pickerBulk = event.target.checked; }
        if (event.target.id === 'loadout-compare-pick') { startCompare(Number(event.target.value)); }
    }
    function handleKeydown(event) {
        if (root()?.contains(event.target) && event.target.hasAttribute('data-loadout-power-value') && event.key === 'Enter') {
            event.preventDefault(); setPowerAllocation(event.target.dataset.loadoutPowerValue, Number(event.target.value)); return;
        }
        if (!root() || (!root().contains(event.target) && !state.openPath && !state.detailId && !state.cartOpen)) return;
        if (event.key === 'Escape' && state.browsing) { state.browsing = false; draw(); root()?.querySelector('[data-loadout-browse]')?.focus(); return; }
        const tab = event.target.closest('[role="tab"]');
        if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
            const index = tabs.indexOf(tab); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            event.preventDefault(); const id = tabs[next].id; const key = tabs[next].getAttribute('data-loadout-tab'); tabs[next].click();
            (id ? document.getElementById(id) : root()?.querySelector(`[data-loadout-tab="${key}"]`))?.focus(); return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.target.closest('input, textarea, select, [contenteditable="true"]')) {
            const action = root()?.querySelector(event.shiftKey ? '[data-loadout-redo]' : '[data-loadout-undo]');
            if (action && !action.disabled) { event.preventDefault(); action.click(); } return;
        }
        if ((!state.openPath && !state.detailId && !state.cartOpen) || !root()) return;
        if (event.key === 'Escape') { dismissPicker(); return; }
        if (event.key !== 'Tab' || !isOverlayPicker()) return;
        // 화면을 덮는 창일 때는 그 안에서만 Tab이 돌게 한다.
        const picker = root().querySelector('.loadout-picker');
        const focusable = picker ? [...picker.querySelectorAll('button:not([disabled]), input, select, a[href], summary')].filter((el) => el.offsetParent !== null) : [];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (!picker.contains(document.activeElement)) { event.preventDefault(); first.focus(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    document.addEventListener('click', handleClick);
    document.addEventListener('input', handleInput);
    document.addEventListener('compositionstart', (event) => {
        if (root()?.contains(event.target) && /^(loadout-ship-search|loadout-picker-search|loadout-finder-search)$/.test(event.target.id)) composingInput = event.target;
    });
    document.addEventListener('compositionend', (event) => {
        if (composingInput !== event.target) return;
        composingInput = null;
        handleInput(event);
    });
    document.addEventListener('change', handleChange);
    document.addEventListener('keydown', handleKeydown);
    // toggle은 위로 전달되지 않으므로 잡는 단계에서 듣는다.
    document.addEventListener('toggle', (event) => {
        const key = event.target?.getAttribute?.('data-loadout-fold');
        if (!key || !root()?.contains(event.target)) return;
        if (event.target.open) folds.add(key); else folds.delete(key);
    }, true);

    window.VOLT_LOADOUT = { init, render, onLanguageChange: draw };
})();
