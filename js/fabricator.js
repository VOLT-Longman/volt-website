/**
 * VOLT 제작 설계도 (#fabricator)
 *
 * 자료: /data/crafting/blueprints.json (게임 파일, scripts/crafting/build-blueprints-data.mjs).
 *       /data/contracts/missions.json 은 "이 설계도를 주는 임무"를 눌렀을 때만 받는다.
 * 가격은 쓰지 않는다 (UEX 호출 없음). 게임 자료에 없는 값은 "게임 자료에 없음"으로 적는다.
 * 계약: docs/helper-tools.md
 *
 * 주소 값 (#fabricator?...)
 *   bp    설계도 id (다른 화면에서 들어오는 연결 키)
 *   mat   재료 포함/제외 칩 (예: Iron,-Gold. 재료 id 하나만 주면 그 재료를 쓰는 설계도)
 *   tab   list(기본) | mats | pools | trades | cart
 *   q     검색어 (지금 탭)
 *   cat   큰 분류 (armor | fpsWeapon | shipComponent | shipWeapon | missionItem)
 *   sub   종류 (아이템 타입), sz 크기·무게 (S1.. 또는 Light/Medium/Heavy/Small/Large)
 *   own   default | earned | none
 *   pool  설계도 묶음 id (묶음 탭)
 *   list  모을 재료 목록: <설계도 id>.<수량>,... (내 저장 목록과 다르면 '받은 목록'으로만 보여 주고 저장하지 않는다)
 *   ql    재료 품질 0~1000 (기본 품질이 아닐 때만), tt 교환 종류 ships | items
 *
 * 공개 형태: window.VOLT_FABRICATOR = { init(mount, ctx), onLanguageChange(lang), onRoute(params) }
 */
(function () {
    'use strict';

    const H = window.VOLT_HELPER;
    const SECTION = 'fabricator';
    const DATA_URL = '/data/crafting/blueprints.json';
    const MISSIONS_URL = '/data/contracts/missions.json';
    const CART_KEY = 'volt-fabricator-list-v1';
    const PAGE = 60;
    const MISSION_PAGE = 20;
    const TABS = ['list', 'mats', 'pools', 'trades', 'cart'];
    const KINDS = ['armor', 'fpsWeapon', 'shipComponent', 'shipWeapon', 'missionItem', 'other'];
    const OWNS = ['default', 'earned', 'none'];

    const TEXT = {
        ko: {
            loading: '설계도 자료를 불러오는 중입니다…', retry: '다시 시도',
            tabs: '보기 고르기', tabList: '설계도', tabMats: '재료', tabPools: '설계도 묶음', tabTrades: '위켈로 교환', tabCart: '모을 재료 목록',
            search: '설계도 이름 검색', searchLabel: '검색', searchPool: '묶음 이름이나 설계도 이름 검색', searchTrade: '교환 이름이나 물건 이름 검색',
            cat: '큰 분류', sub: '종류', sz: '크기 · 무게', own: '얻는 방법', all: '전체',
            kind_armor: '방어구 · 옷', kind_fpsWeapon: '개인 무기', kind_shipComponent: '함선 부품', kind_shipWeapon: '함선 무기', kind_missionItem: '임무 물품', kind_other: '기타',
            ownDefault: '처음부터 가진 설계도', ownEarned: '임무 · 보상으로 얻음', ownNone: '얻는 방법 자료에 없음',
            matFilter: '재료로 거르기', matFilterOn: '재료로 거르기 ({n}개 고름)',
            matHint: '재료를 누를 때마다 포함 → 제외 → 상관없음 순서로 바뀝니다. 포함은 고른 재료 중 하나라도 쓰는 설계도, 제외는 그 재료를 쓰는 설계도를 뺍니다.',
            clear: '거르기 모두 풀기', count: '{n}개', countOf: '{n}개 중 {shown}개 표시', more: '더 보기', noResult: '맞는 설계도가 없습니다.',
            oddValue: '게임 파일에 적힌 그대로입니다. 같은 수치의 다른 값들(대부분 {m} 안팎)과 크게 달라서, 게임 파일에 잘못 적힌 값일 수 있습니다.',
            slot_Completed: '완료', slot_InProgress: '진행 중', slot_Failed: '실패', slot_Abandoned: '포기', slot_Withdrawn: '철회',
            tradeShip: '함선 교환', tradeItem: '물품 교환',
            sharedNote: '주소로 받은 목록을 보고 있습니다. 내 모을 재료 목록({n}개)은 그대로 저장되어 있고, 여기서 바꾼 것은 내 목록에 저장되지 않습니다.', sharedEmpty: '받은 목록이 비어 있습니다.',
            sharedMerge: '내 목록에 더하기', sharedReplace: '내 목록을 이 목록으로 바꾸기', sharedMine: '내 목록 보기',
            sharedMerged: '받은 목록을 내 목록에 더했습니다.', sharedReplaced: '내 목록을 받은 목록으로 바꿨습니다.',
            pick: '설계도를 고르면 필요한 재료와 얻는 방법이 나옵니다.', back: '목록으로',
            noName: '이름이 게임 자료에 없음', internalName: '게임 내부 이름',
            add: '준비물에 담기', added: '모을 재료 목록에 담았습니다: {name} (지금 {n}개)', addAria: '준비물에 담기: {name}', copyLink: '이 화면 주소 복사',
            maker: '만든 곳', size: '크기', grade: '등급 값', craftTime: '제작 시간', craftTimeNote: '게임 파일 값',
            noOutput: '이 설계도로 만들어지는 물건이 게임 자료에 없습니다.',
            quality: '재료 품질', qualityHelp: '품질을 움직이면 아래 칸마다 적힌 값이 바뀝니다. 0 ~ 1000, 처음 값은 게임 기본 품질 {n}입니다.',
            slots: '필요한 재료', slot: '칸', slotNoName: '칸 이름이 게임 자료에 없음', pickSlots: '아래 칸 가운데 {n}칸만 채우면 됩니다. 그래서 준비물 합계에는 넣지 않습니다.',
            alternatives: '아래 재료 가운데 하나를 고릅니다 (더하지 않습니다).', or: '또는',
            pieces: '{n}개', minQuality: '최소 품질 {q}', multiplier: '수량 배수 {x}가 적혀 있지만 필요량에 곱해지는지 확인되지 않아 곱하지 않았습니다.',
            effects: '품질에 따라 바뀌는 값', noEffects: '이 칸은 품질에 따라 바뀌는 값이 게임 자료에 없습니다.',
            atQuality: '품질 {q}일 때 {v}', addValue: '{v} 더함', rangeNone: '값 범위가 게임 자료에 없음', outOfRange: '품질 {q}의 값은 게임 자료에 없음',
            effectNote: '숫자는 게임 파일에 적힌 그대로입니다. 더하는 값이라고 적힌 것 말고는, 이 숫자가 기본 수치에 곱해지는지 게임 파일에 적혀 있지 않습니다. 1보다 크면 늘고 작으면 준다고 읽을 수는 있지만 우리의 해석입니다. 같은 수치를 바꾸는 칸이 둘일 때 어떻게 합쳐지는지도 게임 자료에 없습니다.',
            mineLink: '캐는 곳 보기', noSource: '얻는 곳이 우리 자료에 없음', noReturn: '분해해도 돌려받지 못함',
            sources: '이 설계도를 얻는 방법', srcDefault: '처음부터 가지고 있는 설계도입니다.', srcNone: '이 설계도는 어느 보상 묶음에도 없고 처음부터 가진 것도 아닙니다. 상점 · 전리품은 우리 자료에 없어서 얻는 방법을 알 수 없습니다.',
            srcPools: '이 설계도가 들어 있는 보상 묶음', poolOpen: '묶음 보기',
            poolDraw: '묶음에서 설계도 하나만 나오는지 전부 주는지, 이미 가진 설계도를 어떻게 다루는지는 게임 자료에 없습니다.',
            srcEvent: '이벤트 점수 보상 ({scenario}) · {points}점 이상', eventNote: '이벤트가 열려 있는지는 서버가 정하므로 여기서는 알 수 없습니다.',
            srcTrade: '위켈로 교환: {name}', srcTemp: '임시 설계도 설정에 이름이 올라 있음 ({name}). 게임 안에서 무슨 뜻인지는 확인되지 않았습니다.',
            missionsBtn: '이 설계도를 주는 임무 찾기', missionsBtnPool: '이 묶음을 주는 임무 찾기', missionsHint: '임무 자료는 커서 누를 때만 불러옵니다.',
            missionsLoading: '임무 자료를 불러오는 중입니다…', missionsNone: '이 묶음을 주는 임무가 임무 자료에 없습니다.', missionsTitle: '이 설계도를 주는 임무', missionsTitlePool: '이 묶음을 주는 임무',
            missionCount: '같은 이름 {n}건', chance: '묶음을 받을 확률 값 {p}', resultSlot: '결과 구분: {slot}', minRank: '최소 등급 {rank}', illegal: '불법', eventOnly: '이벤트 전용',
            missionOpen: '임무 찾기에서 보기', missionNoTitle: '제목이 게임 자료에 없음', moreMissions: '임무 더 보기 ({n}건 남음)',
            matsTitle: '재료 {n}종', matName: '재료', matUnit: '세는 단위', matUses: '쓰는 설계도', matSource: '얻는 곳', matShow: '{n}개 보기', unitScu: 'SCU', unitPc: '낱개', unitBoth: 'SCU · 낱개',
            poolsTitle: '설계도 묶음 {n}개', poolPick: '묶음을 고르면 들어 있는 설계도와 쓰이는 곳이 나옵니다.', poolName: '묶음 이름 (게임 내부 이름)', poolItems: '들어 있는 설계도 {n}개',
            poolMissing: '게임 파일에서 설계도 이름이 비어 있는 칸 {n}개', poolRepeat: '같은 설계도가 여러 번 적힌 묶음입니다. 한 번만 보여 줍니다.', poolUsed: '이 묶음이 쓰이는 곳', poolNoUse: '이벤트 보상 · 위켈로 교환에는 쓰이지 않습니다.', noPool: '맞는 묶음이 없습니다.',
            tradesTitle: '위켈로 교환 {n}건', tradeAll: '전체', tradeShips: '함선 교환', tradeItems: '물품 교환', tradeNeed: '가져갈 것', tradeGive: '받는 것', tradeRoll: '받는 물건 묶음',
            tradeRollNote: '게임 파일 가중치 값 {w}. 이 값이 확률인지는 확인되지 않았습니다.', tradeBp: '함께 받는 설계도 묶음', tradeAccess: '조건', noTrade: '맞는 교환이 없습니다.',
            tradeTags: '먼저 끝낸 계약 표시 {tags} (어느 계약이 주는지는 확인되지 않음)', tradeCrime: '범죄 등급 {a} ~ {b}', tradeRep: '평판 {name} (평판 값 {rep}) 부터', tradeRepMax: '게임 파일의 위쪽 값은 {name}. 넘으면 안 되는 한도인지는 확인되지 않았습니다.',
            tradeOv: '이 계약에는 게임이 실제로 쓰는지 확인되지 않은 추가 화물 설정이 있습니다. 여기 적힌 것에는 들어 있지 않습니다.', tradeNote: '공개된 위켈로 교환만 있습니다. 적힌 수량은 게임 파일 값입니다.',
            cartEmpty: '담은 설계도가 없습니다. 설계도 화면에서 "준비물에 담기"를 눌러 주세요.', cartItems: '만들 것', qty: '수량', qtyAria: '{name} 수량', remove: '빼기', removeAria: '{name} 빼기', cartClear: '모두 비우기',
            cartTotals: '재료 합계', cartChoices: '골라야 하는 칸 (합계에 넣지 않음)', cartTime: '제작 시간 합계', cartTimeNote: '하나씩 차례로 만들 때. 게임 파일 값을 더한 것입니다.',
            cartCopy: '글자로 복사', cartCopied: '모을 재료 목록을 복사했습니다.', cartCopyFailed: '복사하지 못했습니다. 아래 글자를 직접 골라 복사해 주세요.', cartText: '복사할 글자',
            cartHead: 'VOLT 제작 준비물', cartNote: '같은 재료라도 최소 품질이 다르면 줄을 나눴습니다. SCU와 낱개는 다른 단위입니다.',
            notes: '제작기와 분해', stations: '제작기', dismantle: '분해: {time}, 효율 값 {eff}. 이 값으로 돌려받는 양이 어떻게 정해지는지는 게임 자료에 없습니다.', dismantleNoReturn: '분해해도 돌려받지 못하는 재료: {list}',
            stationNote: '제작기가 어디에 있는지는 우리 자료에 없습니다.',
            sourceNote: '게임 파일에 적힌 값이며 게임 안에서 직접 재 본 값이 아닙니다.',
        },
        en: {
            loading: 'Loading blueprint data…', retry: 'Try again',
            tabs: 'Choose a view', tabList: 'Blueprints', tabMats: 'Materials', tabPools: 'Blueprint pools', tabTrades: 'Wikelo trades', tabCart: 'Materials to collect',
            search: 'Search blueprint names', searchLabel: 'Search', searchPool: 'Search pool or blueprint names', searchTrade: 'Search trade or item names',
            cat: 'Category', sub: 'Type', sz: 'Size · weight', own: 'How you get it', all: 'All',
            kind_armor: 'Armor & clothing', kind_fpsWeapon: 'Personal weapons', kind_shipComponent: 'Ship components', kind_shipWeapon: 'Ship weapons', kind_missionItem: 'Mission items', kind_other: 'Other',
            ownDefault: 'Owned from the start', ownEarned: 'From missions or rewards', ownNone: 'No source in our data',
            matFilter: 'Filter by material', matFilterOn: 'Filter by material ({n} chosen)',
            matHint: 'Each press cycles a material through include → exclude → any. Include keeps blueprints that use at least one chosen material; exclude drops blueprints that use it.',
            oddValue: 'Exactly as written in the game files. It is far from the other values for this stat (mostly around {m}), so it may be a mistake in the game files.',
            slot_Completed: 'completed', slot_InProgress: 'in progress', slot_Failed: 'failed', slot_Abandoned: 'abandoned', slot_Withdrawn: 'withdrawn',
            tradeShip: 'Ship trade', tradeItem: 'Item trade',
            sharedNote: 'You are viewing a list from a link. Your own shopping list ({n} items) is still saved, and changes made here are not saved to it.', sharedEmpty: 'The list from the link is empty.',
            sharedMerge: 'Add to my list', sharedReplace: 'Replace my list with this one', sharedMine: 'Show my list',
            sharedMerged: 'Added the linked list to your list.', sharedReplaced: 'Replaced your list with the linked list.',
            clear: 'Clear all filters', count: '{n} found', countOf: 'showing {shown} of {n}', more: 'Show more', noResult: 'No blueprint matches.',
            pick: 'Pick a blueprint to see its materials and how to get it.', back: 'Back to list',
            noName: 'No name in the game files', internalName: 'internal game name',
            add: 'Add to shopping list', added: 'Added to the shopping list: {name} (now {n})', addAria: 'Add to shopping list: {name}', copyLink: 'Copy link to this view',
            maker: 'Maker', size: 'Size', grade: 'Grade value', craftTime: 'Craft time', craftTimeNote: 'game file value',
            noOutput: 'The game files name no item that this blueprint produces.',
            quality: 'Material quality', qualityHelp: 'Move the quality to change the values listed in each slot below. 0 to 1000; it starts at the game default quality {n}.',
            slots: 'Materials needed', slot: 'Slot', slotNoName: 'Slot name not in the game files', pickSlots: 'Fill only {n} of the slots below. They are therefore left out of shopping-list totals.',
            alternatives: 'Choose one of these materials (they are not added together).', or: 'or',
            pieces: '{n} pcs', minQuality: 'min. quality {q}', multiplier: 'A quantity multiplier of {x} is written here, but whether the game multiplies the amount by it is not verified, so it is not applied.',
            effects: 'Values that change with quality', noEffects: 'The game files list no quality-dependent value for this slot.',
            atQuality: 'at quality {q}: {v}', addValue: 'adds {v}', rangeNone: 'value range not in the game files', outOfRange: 'no value in the game files for quality {q}',
            effectNote: 'Numbers are exactly as written in the game files. Except where marked as an added value, the files do not say that the number multiplies the base stat. Reading "above 1 raises it, below 1 lowers it" is our interpretation. How two slots that change the same stat combine is not in the game files either.',
            mineLink: 'Where to mine it', noSource: 'No known source in our data', noReturn: 'Not returned when dismantled',
            sources: 'How to get this blueprint', srcDefault: 'You own this blueprint from the start.', srcNone: 'This blueprint is in no reward pool and is not owned from the start. Shops and loot are not in our data, so its source is unknown.',
            srcPools: 'Reward pools that contain this blueprint', poolOpen: 'Open pool',
            poolDraw: 'The game files do not say whether a pool gives one blueprint or all of them, nor how blueprints you already own are handled.',
            srcEvent: 'Event score reward ({scenario}) · {points} points or more', eventNote: 'Whether the event is running is decided by the server and cannot be known here.',
            srcTrade: 'Wikelo trade: {name}', srcTemp: 'Named by a temporary-blueprint setting ({name}). What that means in play is not verified.',
            missionsBtn: 'Find missions that award this blueprint', missionsBtnPool: 'Find missions that award this pool', missionsHint: 'The mission data is large, so it is loaded only when you ask.',
            missionsLoading: 'Loading mission data…', missionsNone: 'No mission in the mission data awards this pool.', missionsTitle: 'Missions that award this blueprint', missionsTitlePool: 'Missions that award this pool',
            missionCount: '{n} with the same name', chance: 'pool chance value {p}', resultSlot: 'result slot: {slot}', minRank: 'min. rank {rank}', illegal: 'Illegal', eventOnly: 'Event only',
            missionOpen: 'Open in Mission Finder', missionNoTitle: 'Title not in the game files', moreMissions: 'Show more missions ({n} left)',
            matsTitle: '{n} materials', matName: 'Material', matUnit: 'Counted in', matUses: 'Blueprints using it', matSource: 'Where to get it', matShow: 'Show {n}', unitScu: 'SCU', unitPc: 'pieces', unitBoth: 'SCU · pieces',
            poolsTitle: '{n} blueprint pools', poolPick: 'Pick a pool to see its blueprints and where it is used.', poolName: 'Pool name (internal game name)', poolItems: '{n} blueprints inside',
            poolMissing: '{n} entries whose blueprint name is empty in the game files', poolRepeat: 'This pool lists the same blueprint more than once. It is shown once.', poolUsed: 'Where this pool is used', poolNoUse: 'Not used by event rewards or Wikelo trades.', noPool: 'No pool matches.',
            tradesTitle: '{n} Wikelo trades', tradeAll: 'All', tradeShips: 'Ship trades', tradeItems: 'Item trades', tradeNeed: 'Bring', tradeGive: 'You get', tradeRoll: 'Item set you get',
            tradeRollNote: 'Game file weighting value {w}. Whether it is a chance is not verified.', tradeBp: 'Blueprint pool given with it', tradeAccess: 'Conditions', noTrade: 'No trade matches.',
            tradeTags: 'completed-contract tag {tags} (which contract gives it is not verified)', tradeCrime: 'crime stat {a} to {b}', tradeRep: 'standing {name} (reputation {rep}) or higher', tradeRepMax: 'The upper value in the game files is {name}. Whether it is a limit you must not exceed is not verified.',
            tradeOv: 'This contract carries an extra cargo setting that the game may not use. It is not included here.', tradeNote: 'Released Wikelo trades only. Amounts are game file values.',
            cartEmpty: 'No blueprints added yet. Press "Add to shopping list" on a blueprint.', cartItems: 'To craft', qty: 'Quantity', qtyAria: 'Quantity of {name}', remove: 'Remove', removeAria: 'Remove {name}', cartClear: 'Empty the list',
            cartTotals: 'Material totals', cartChoices: 'Slots where you choose (not in the totals)', cartTime: 'Total craft time', cartTimeNote: 'crafted one after another; a sum of game file values.',
            cartCopy: 'Copy as text', cartCopied: 'Materials to collect copied.', cartCopyFailed: 'Could not copy. Please select the text below and copy it yourself.', cartText: 'Text to copy',
            cartHead: 'VOLT crafting shopping list', cartNote: 'The same material is listed on separate lines when the minimum quality differs. SCU and pieces are different units.',
            notes: 'Fabricators and dismantling', stations: 'Fabricators', dismantle: 'Dismantling: {time}, efficiency value {eff}. How that turns into returned amounts is not in the game files.', dismantleNoReturn: 'Materials not returned when dismantled: {list}',
            stationNote: 'Where fabricators stand in the world is not in our data.',
            sourceNote: 'Values are as written in the game files, not measured in game.',
        },
    };
    // 종류(아이템 타입) 이름. 게임 이름이 아니라 화면 분류용 쉬운 말.
    const TYPE_LABELS = {
        WeaponGun: ['함선 무기', 'Ship gun'], WeaponPersonal: ['총', 'Gun'], WeaponAttachment: ['탄창', 'Magazine'],
        Char_Armor_Arms: ['팔', 'Arms'], Char_Armor_Torso: ['몸통', 'Torso'], Char_Armor_Helmet: ['헬멧', 'Helmet'], Char_Armor_Legs: ['다리', 'Legs'],
        Char_Armor_Backpack: ['배낭', 'Backpack'], Char_Armor_Undersuit: ['언더슈트', 'Undersuit'], Clothing: ['옷', 'Clothing'],
        Cooler: ['쿨러', 'Cooler'], PowerPlant: ['파워 플랜트', 'Power plant'], QuantumDrive: ['퀀텀 드라이브', 'Quantum drive'], Shield: ['실드 제너레이터', 'Shield generator'],
        Radar: ['레이더', 'Radar'], TractorBeam: ['견인 광선', 'Tractor beam'], SalvageHead: ['샐비징 헤드', 'Salvage head'], SalvageModifier: ['샐비징 모듈', 'Salvage module'],
        WeaponMining: ['채광 레이저', 'Mining laser'], MiningModifier: ['채광 모듈', 'Mining module'], DockingCollar: ['연료 도킹 장치', 'Fuel docking collar'],
        Container: ['화물 컨테이너', 'Cargo container'], Cargo: ['화물', 'Cargo'], Misc: ['기타', 'Other'], none: ['분류 없음', 'No type'],
    };
    const SIZE_LABELS = {
        armor: { Light: ['라이트 아머', 'Light'], Medium: ['미디움 아머', 'Medium'], Heavy: ['헤비 아머', 'Heavy'] },
        fpsWeapon: { Small: ['소형', 'Small'], Medium: ['중형', 'Medium'], Large: ['대형', 'Large'] },
    };

    const t = H.translator(TEXT);
    const e = H.esc;

    let root = null;
    let D = null; // blueprints.json
    let X = null; // 찾아보기 표
    let loadError = null;
    let M = null; // missions.json (눌렀을 때만)
    let missionState = 'idle'; // idle | loading | ready | error
    let missionError = null;
    let missionIndex = null; // 묶음 id → [{ c, chance, slot }]
    const cart = new Map(); // 내 목록: 설계도 번호 → 수량 (localStorage 에 저장)
    let shared = null; // 주소로 받은 목록 (Map). 저장하지 않고 준비물 탭에서만 보여 준다.
    let paintedTab = '';
    const S = {
        tab: 'list', q: '', cat: '', sub: '', sz: '', own: '', mats: H.chips(), bpId: '', bp: null, pool: '',
        tradeType: '', quality: 500, shown: PAGE, missionsShown: MISSION_PAGE, matsOpen: false, status: '',
    };

    // ── 작은 도우미 ──────────────────────────────────────────────────────────
    const pair = (labels) => (labels ? labels[H.lang() === 'en' ? 1 : 0] : '');
    const fmt = (value, digits = 4) => H.num(value, { digits });
    const round6 = (value) => Math.round(value * 1e6) / 1e6;
    const lower = (value) => String(value || '').toLowerCase();
    // 주소에서 온 글자로 찾을 때 constructor · __proto__ 같은 물려받은 이름에 걸리지 않게 한다.
    const has = (object, key) => Boolean(object) && Object.hasOwn(object, key);
    const TRADE_TYPES = [['ships', 'WIkelo_Ships'], ['items', 'WIkelo_SmallItems']];
    const SLOT_KEYS = ['Completed', 'InProgress', 'Failed', 'Abandoned', 'Withdrawn'];
    const defaultQuality = () => (H.isKnown(D?.globals?.defaultQuality) ? Number(D.globals.defaultQuality) : 500);
    const clampQuality = (value) => Math.max(0, Math.min(1000, Math.round(Number(value) || 0)));
    // 제작 시간은 초까지 그대로 적는다 (H.duration 은 분으로 반올림한다).
    function craftTime(seconds) {
        if (!H.isKnown(seconds) || Number(seconds) < 0) return H.unknown();
        const total = Math.round(Number(seconds));
        const parts = [[Math.floor(total / 3600), 'durHour'], [Math.floor((total % 3600) / 60), 'durMin'], [total % 60, 'durSec']];
        return parts.filter(([n]) => n > 0).map(([n, key]) => H.text(key, { n })).join(' ') || H.text('durSec', { n: 0 });
    }

    function paint(node, html) {
        if (node) node.innerHTML = html;
    }

    function btn(act, id, labelHtml, options = {}) {
        const pressed = options.pressed === undefined ? '' : ` aria-pressed="${options.pressed ? 'true' : 'false'}"`;
        const aria = options.aria ? ` aria-label="${e(options.aria)}"` : '';
        return `<button type="button" class="${e(options.cls || 'fab-btn')}" data-act="${e(act)}" data-id="${e(id ?? '')}" data-fk="${e(`${act}:${id ?? ''}`)}"${pressed}${aria}>${labelHtml}</button>`;
    }

    function outputClass(bp) {
        // 만들어지는 물건이 없다고 적힌 설계도는 물건 이름을 지어내지 않고 설계도 id 를 그대로 쓴다.
        if (bp.noOutput) return String(bp.id);
        return bp.o || String(bp.id).replace(/^BP_CRAFT_/, '');
    }
    function bpName(i) {
        const bp = D.blueprints[i];
        return bp.name ? H.name(bp.name) : outputClass(bp);
    }
    function kindOf(bp) {
        const kind = D.categories[bp.c]?.kind;
        return KINDS.includes(kind) ? kind : 'other';
    }
    function typeKey(bp) {
        const type = D.itemTypes[bp.t]?.type;
        if (!type) return 'none';
        return type.startsWith('Char_Clothing') ? 'Clothing' : type;
    }
    function typeLabel(key) {
        return pair(TYPE_LABELS[key]) || key;
    }
    function sizeKey(bp) {
        const kind = kindOf(bp);
        const sub = D.itemTypes[bp.t]?.sub;
        if (SIZE_LABELS[kind]) return SIZE_LABELS[kind][sub] ? sub : '';
        return H.isKnown(bp.z) ? `S${bp.z}` : '';
    }
    function sizeLabel(kind, key) {
        return pair(SIZE_LABELS[kind]?.[key]) || key;
    }
    function matName(index) {
        const mat = D.materials[index];
        return mat ? H.name(mat.name) || mat.id : '';
    }
    function amountText(option) {
        return option.scu !== undefined ? `${fmt(option.scu)} SCU` : t('pieces', { n: fmt(option.pc) });
    }
    function slotLabel(slot) {
        const entry = D.slotNames[slot.n];
        if (entry?.name) return e(H.name(entry.name));
        return `${e(t('slotNoName'))}${entry?.debug ? ` <code>${e(entry.debug)}</code>` : ''}`;
    }
    function statLabel(stat, bp) {
        const type = D.itemTypes[bp?.t];
        const alt = (stat.alt || []).find((entry) => (entry.types || []).includes(type?.type) || (entry.subTypes || []).includes(type?.sub));
        return H.name((alt || stat).name) || stat.id;
    }

    // ── 품질에 따른 값 ───────────────────────────────────────────────────────
    function signed(value) {
        return `${Number(value) > 0 ? '+' : ''}${fmt(value)}`;
    }
    function modAt(mod, quality) {
        const range = (mod.r || []).find((row) => quality >= row[0] && quality <= row[1]);
        if (!range) return null;
        const span = range[1] - range[0];
        return span > 0 ? range[2] + ((range[3] - range[2]) * (quality - range[0])) / span : range[2];
    }
    function modRangeText(mod) {
        if (!mod.r || !mod.r.length) return t('rangeNone');
        const show = mod.add ? signed : (value) => fmt(value);
        return mod.r.map((row) => `${fmt(row[0], 0)}~${fmt(row[1], 0)}: ${row[2] === row[3] ? show(row[2]) : `${show(row[2])} → ${show(row[3])}`}`).join(' · ');
    }
    function modValueText(mod, quality) {
        if (!mod.r || !mod.r.length) return t('rangeNone');
        const value = modAt(mod, quality);
        if (value === null) return t('outOfRange', { q: fmt(quality, 0) });
        return t('atQuality', { q: fmt(quality, 0), v: mod.add ? t('addValue', { v: signed(value) }) : fmt(value) });
    }

    // ── 찾아보기 표 ──────────────────────────────────────────────────────────
    function buildIndex() {
        const byId = new Map(D.blueprints.map((bp, i) => [bp.id, i]));
        const bpPools = D.blueprints.map(() => []);
        const poolItems = Object.create(null);
        Object.entries(D.pools).forEach(([id, pool]) => {
            const seen = new Set();
            (pool.e || []).forEach(([index]) => {
                if (!D.blueprints[index] || seen.has(index)) return;
                seen.add(index);
                bpPools[index].push(id);
            });
            poolItems[id] = { items: [...seen], repeat: (pool.e || []).length > seen.size, missing: pool.missing };
        });
        const recipeMats = D.recipes.map((recipe) => [...new Set(recipe.slots.flatMap((slot) => slot.o.map((option) => option.mat)))]);
        const matUses = D.materials.map(() => ({ count: 0, scu: false, pc: false }));
        for (const bp of D.blueprints) {
            for (const mat of recipeMats[bp.r] || []) if (matUses[mat]) matUses[mat].count += 1;
        }
        for (const option of D.recipes.flatMap((recipe) => recipe.slots.flatMap((slot) => slot.o))) {
            const used = matUses[option.mat];
            if (used) used[option.scu !== undefined ? 'scu' : 'pc'] = true;
        }
        const poolUse = Object.create(null);
        const use = (id) => {
            if (!poolUse[id]) poolUse[id] = { tiers: [], trades: [], temp: [] };
            return poolUse[id];
        };
        for (const tier of D.eventTiers || []) for (const id of tier.pools || []) use(id).tiers.push(tier);
        (D.trades || []).forEach((trade, index) => {
            for (const [id] of trade.bp || []) use(id).trades.push(index);
        });
        for (const entry of D.tempBlueprints || []) use(entry.pool).temp.push(entry);
        const search = D.blueprints.map((bp) => lower([bp.name?.en, bp.name?.ko, bp.id, D.makers[bp.m]?.name?.en, D.makers[bp.m]?.name?.ko, D.makers[bp.m]?.id].filter(Boolean).join(' ')));
        const matById = new Map(D.materials.map((mat, i) => [mat.id, i]));
        // 같은 수치의 다른 값들과 3배 넘게 차이 나는 값 (게임 파일 오타로 보이는 것) 을 표시해 둔다. 값은 바꾸지 않는다.
        const byStat = new Map();
        D.mods.forEach((mod) => {
            if (mod.add) return;
            for (const row of mod.r || []) byStat.set(mod.s, [...(byStat.get(mod.s) || []), row[2], row[3]]);
        });
        const odd = new Map();
        D.mods.forEach((mod, index) => {
            const values = [...(byStat.get(mod.s) || [])].sort((a, b) => a - b);
            const median = values[Math.floor(values.length / 2)];
            if (mod.add || !(median > 0) || values.length < 6) return;
            if ((mod.r || []).some((row) => [row[2], row[3]].some((value) => value > median * 3 || value < median / 3))) odd.set(index, median);
        });
        X = { byId, bpPools, poolItems, recipeMats, matUses, poolUse, search, matById, odd, order: {} };
    }
    function sourceOf(i) {
        if (D.blueprints[i].d) return 'default';
        return X.bpPools[i].length ? 'earned' : 'none';
    }
    function ordered() {
        const lang = H.lang();
        if (!X.order[lang]) {
            const names = D.blueprints.map((_, i) => bpName(i));
            X.order[lang] = D.blueprints.map((_, i) => i).sort((a, b) => names[a].localeCompare(names[b], lang));
        }
        return X.order[lang];
    }
    function tokens() {
        return lower(S.q).split(/\s+/).filter(Boolean);
    }
    function filtered() {
        const words = tokens();
        const list = ordered().filter((i) => {
            const bp = D.blueprints[i];
            if (S.cat && kindOf(bp) !== S.cat) return false;
            if (S.sub && typeKey(bp) !== S.sub) return false;
            if (S.sz && sizeKey(bp) !== S.sz) return false;
            if (S.own && sourceOf(i) !== S.own) return false;
            if (!S.mats.test((X.recipeMats[bp.r] || []).map((mat) => D.materials[mat]?.id))) return false;
            return words.every((word) => X.search[i].includes(word));
        });
        if (!words.length) return list;
        // 검색어와 이름이 똑같은 것, 그 말로 시작하는 것, 그 말이 들어 있는 것 순서로 앞에 둔다.
        const query = words.join(' ');
        const rank = (i) => Math.min(...[D.blueprints[i].name?.ko, D.blueprints[i].name?.en, bpName(i)].filter(Boolean).map((name) => {
            const text = lower(name).replace(/\s+/g, ' ').trim();
            return text === query ? 0 : text.startsWith(query) ? 1 : text.includes(query) ? 2 : 3;
        }));
        const ranks = new Map(list.map((i) => [i, rank(i)]));
        return list.sort((a, b) => ranks.get(a) - ranks.get(b));
    }

    // ── 주소 값 ──────────────────────────────────────────────────────────────
    const viewed = () => shared || cart; // 준비물 탭이 지금 보여 주는 목록
    function listString(map) {
        return [...map].map(([i, qty]) => `${D.blueprints[i].id}.${qty}`).join(',');
    }
    function parseList(value) {
        const map = new Map();
        String(value || '').split(',').forEach((part) => {
            const cut = part.lastIndexOf('.');
            const index = X.byId.get(cut > 0 ? part.slice(0, cut) : part);
            const qty = Math.floor(Number(cut > 0 ? part.slice(cut + 1) : 1));
            if (index !== undefined && qty >= 1) map.set(index, Math.min(qty, 999));
        });
        return map;
    }
    const sameList = (a, b) => listString(a).split(',').sort().join(',') === listString(b).split(',').sort().join(',');
    function saveCart() {
        try {
            window.localStorage.setItem(CART_KEY, listString(cart));
        } catch (_error) { /* 저장하지 못해도 화면은 그대로 쓴다 */ }
    }
    function loadCart() {
        cart.clear();
        try {
            parseList(window.localStorage.getItem(CART_KEY) || '').forEach((qty, index) => { cart.set(index, qty); });
        } catch (_error) { /* 저장된 목록 없이 시작 */ }
    }
    // 주소의 목록: 내 목록이 비어 있으면 내 목록으로 삼고, 내 목록과 다르면 '받은 목록'으로만 보여 준다 (내 목록을 덮어쓰지 않는다).
    function takeLinkedList(value) {
        shared = null;
        if (S.tab !== 'cart' || typeof value !== 'string') return;
        const linked = parseList(value);
        if (sameList(linked, cart)) return;
        if (cart.size) {
            shared = linked;
            return;
        }
        linked.forEach((qty, index) => { cart.set(index, qty); });
        saveCart();
    }
    let pending = {};
    function applyParams(params) {
        pending = params || {};
        const p = pending;
        S.tab = TABS.includes(p.tab) ? p.tab : (p.pool && !p.bp ? 'pools' : 'list');
        S.q = typeof p.q === 'string' ? p.q.slice(0, 80) : '';
        S.cat = KINDS.includes(p.cat) ? p.cat : '';
        S.sub = typeof p.sub === 'string' ? p.sub : '';
        S.sz = typeof p.sz === 'string' ? p.sz : '';
        S.own = OWNS.includes(p.own) ? p.own : '';
        S.mats = H.chips(typeof p.mat === 'string' ? p.mat : '');
        S.bpId = typeof p.bp === 'string' ? p.bp : '';
        S.pool = typeof p.pool === 'string' ? p.pool : '';
        S.shown = PAGE;
        S.missionsShown = MISSION_PAGE;
        S.matsOpen = !S.mats.isEmpty();
        S.status = '';
        if (D) resolveParams();
    }
    // 자료가 온 뒤에, 모르는 id를 조용히 버린다.
    function resolveParams() {
        if (pending.mineral) {
            const matches = D.materials.filter((mat) => mat.mine === pending.mineral);
            if (matches.length) S.mats = H.chips(matches.map((mat) => mat.id).join(','));
            else S.q = pending.mineral;
            S.matsOpen = matches.length > 0;
        }
        const index = X.byId.get(S.bpId);
        S.bp = index === undefined ? null : index;
        if (S.bp === null) S.bpId = '';
        if (!has(D.pools, S.pool)) S.pool = '';
        [...S.mats.included(), ...S.mats.excluded()].forEach((id) => { if (!X.matById.has(id)) S.mats.set(id, 'any'); });
        if (S.sub && !has(TYPE_LABELS, S.sub)) S.sub = '';
        if (S.sz && !/^(S\d|Light|Medium|Heavy|Small|Large)$/.test(S.sz)) S.sz = '';
        S.quality = typeof pending.ql === 'string' && /^\d{1,4}$/.test(pending.ql) ? clampQuality(pending.ql) : defaultQuality();
        S.tradeType = (TRADE_TYPES.find(([key]) => key === pending.tt) || ['', ''])[1];
        takeLinkedList(pending.list);
    }
    function hashParams() {
        return {
            tab: S.tab === 'list' ? '' : S.tab,
            q: S.q,
            cat: S.tab === 'list' ? S.cat : '', sub: S.tab === 'list' ? S.sub : '', sz: S.tab === 'list' ? S.sz : '', own: S.tab === 'list' ? S.own : '',
            mat: S.tab === 'list' ? S.mats.encode() : '',
            bp: S.tab === 'list' && S.bp !== null ? D.blueprints[S.bp].id : '',
            pool: S.tab === 'pools' ? S.pool : '',
            list: S.tab === 'cart' ? listString(viewed()) : '',
            ql: S.tab === 'list' && S.bp !== null && S.quality !== defaultQuality() ? String(S.quality) : '',
            tt: S.tab === 'trades' ? (TRADE_TYPES.find(([, type]) => type === S.tradeType) || ['', ''])[0] : '',
        };
    }
    function sync(push) {
        if (S.tab !== 'cart') shared = null; // 받은 목록은 준비물 탭에서만 본다
        if (D) H.writeHash(SECTION, hashParams(), { push: Boolean(push) });
    }

    // ── 임무 자료 (눌렀을 때만) ──────────────────────────────────────────────
    function loadMissions() {
        if (missionState === 'loading' || missionState === 'ready') return;
        missionState = 'loading';
        missionError = null;
        render();
        H.loadJson(MISSIONS_URL).then((data) => {
            M = data;
            missionIndex = Object.create(null);
            const put = (pool, row) => {
                if (!missionIndex[pool]) missionIndex[pool] = [];
                missionIndex[pool].push(row);
            };
            (M.contracts || []).forEach((c) => {
                for (const entry of c.bp || []) put(entry[0], { c, chance: entry[1], slot: entry[2] });
                (c.res || []).forEach((entry) => { if (entry[0] === 'bp') put(entry[2], { c, chance: entry[3], slots: entry[1] }); });
            });
            missionState = 'ready';
            render();
        }, (error) => {
            missionState = 'error';
            missionError = error;
            render();
        });
    }
    function missionText(index) {
        const row = M.texts?.[index];
        if (!row) return '';
        const value = (H.lang() === 'ko' && row[1]) || row[0] || '';
        return String(value).replace(/\{[^}]*\}/g, '…').replace(/\s+/g, ' ').trim();
    }
    function slotText(row) {
        const slots = row.slots || (H.isKnown(row.slot) && row.slot !== 0 ? [row.slot] : []);
        return slots.map((slot) => {
            const name = M.resultSlots?.[slot] ?? slot;
            return SLOT_KEYS.includes(name) ? t(`slot_${name}`) : name;
        }).join(', ');
    }
    function missionGroups(poolIds) {
        const groups = new Map();
        poolIds.flatMap((pool) => missionIndex[pool] || []).forEach((row) => {
            const c = row.c;
            const title = missionText(c.t);
            const key = [title, c.by, c.type, (c.sys || []).join('+'), row.chance, c.min, slotText(row)].join('|');
            const group = groups.get(key);
            if (group) {
                if (!group.ids.has(c.id)) { group.ids.add(c.id); group.count += 1; }
            } else groups.set(key, { c, row, title, count: 1, ids: new Set([c.id]) });
        });
        return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, H.lang()));
    }
    function missionsHtml(poolIds, forPool) {
        if (!poolIds.length) return '';
        if (missionState === 'idle') {
            return `<div class="fab-missions">${btn('missions', '', e(t(forPool ? 'missionsBtnPool' : 'missionsBtn')), { cls: 'fab-btn fab-btn-main' })}<p class="fab-note">${e(t('missionsHint'))}</p></div>`;
        }
        if (missionState === 'loading') return `<p class="fab-status" role="status">${e(t('missionsLoading'))}</p>`;
        if (missionState === 'error') {
            return `<div class="fab-missions"><p class="fab-status" role="alert">${e(H.errorText(missionError))}</p>${btn('missions', '', e(t('retry')))}</div>`;
        }
        const groups = missionGroups(poolIds);
        const title = `<h4>${e(t(forPool ? 'missionsTitlePool' : 'missionsTitle'))} <small>${e(t('count', { n: fmt(groups.length, 0) }))}</small></h4>`;
        if (!groups.length) return `<div class="fab-missions">${title}<p class="fab-note">${e(t('missionsNone'))}</p></div>`;
        const rows = groups.slice(0, S.missionsShown).map((group) => {
            const c = group.c;
            const rank = M.scopes?.[c.scope]?.ranks?.[c.min]?.name;
            const slot = slotText(group.row);
            const meta = [
                H.name(M.factions?.[c.by]), H.name(M.types?.[c.type]), (c.sys || []).join(' · '),
                rank && !rank.raw ? t('minRank', { rank: H.name(rank) }) : '',
                H.isKnown(group.row.chance) ? t('chance', { p: fmt(group.row.chance) }) : '',
                slot ? t('resultSlot', { slot }) : '',
                group.count > 1 ? t('missionCount', { n: fmt(group.count, 0) }) : '',
            ].filter(Boolean);
            const tags = `${c.illegal === 1 ? `<span class="fab-tag is-warn">${e(t('illegal'))}</span>` : ''}${c.ev?.length ? `<span class="fab-tag">${e(t('eventOnly'))}</span>` : ''}`;
            return `<li><a class="fab-link" href="${e(H.buildHash('missions', { m: c.id }))}" title="${e(t('missionOpen'))}">${e(group.title || t('missionNoTitle'))}</a> ${tags}<span class="fab-meta">${e(meta.join(' · '))}</span></li>`;
        }).join('');
        const left = groups.length - S.missionsShown;
        return `<div class="fab-missions">${title}<ul class="fab-missionlist">${rows}</ul>${left > 0 ? btn('more-missions', '', e(t('moreMissions', { n: fmt(left, 0) }))) : ''}<p class="fab-note">${e(t('poolDraw'))}</p></div>`;
    }

    // ── 화면 조각 ────────────────────────────────────────────────────────────
    const TAB_LABELS = { list: 'tabList', mats: 'tabMats', pools: 'tabPools', trades: 'tabTrades', cart: 'tabCart' };
    function tabsHtml() {
        return `<div class="fab-tabs" role="group" aria-label="${e(t('tabs'))}" data-region="tabs">${tabButtons()}</div>`;
    }
    function tabButtons() {
        const group = ({ pools: 'list', trades: 'mats' })[S.tab] || S.tab;
        return ['list', 'mats', 'cart'].map((tab) => {
            const badge = tab === 'cart' && cart.size ? ` <span class="fab-badge">${e(fmt(cart.size, 0))}</span>` : '';
            return btn('tab', tab, `${e(t(TAB_LABELS[tab]))}${badge}`, { cls: `fab-tab${group === tab ? ' is-active' : ''}`, pressed: group === tab });
        }).join('');
    }
    function searchHtml(placeholderKey) {
        return `<label class="fab-search"><span class="visually-hidden">${e(t('searchLabel'))}</span><input type="search" id="fab-q" data-in="q" data-fk="q" value="${e(S.q)}" placeholder="${e(t(placeholderKey))}" autocomplete="off" maxlength="80"></label>`;
    }
    function chipRow(labelKey, act, current, options) {
        if (options.length < 2) return '';
        const chips = [['', t('all')], ...options].map(([id, label, count]) => btn(act, id, `${e(label)}${count === undefined ? '' : ` <small>${e(fmt(count, 0))}</small>`}`, { cls: `fab-chip${current === id ? ' is-active' : ''}`, pressed: current === id })).join('');
        return `<div class="fab-chiprow" role="group" aria-label="${e(t(labelKey))}"><span class="fab-chiplabel">${e(t(labelKey))}</span><div class="fab-chips">${chips}</div></div>`;
    }
    function countBy(list, keyOf) {
        const counts = new Map();
        list.forEach((bp) => { const key = keyOf(bp); if (key) counts.set(key, (counts.get(key) || 0) + 1); });
        return counts;
    }
    function filtersHtml() {
        const all = D.blueprints;
        const kinds = countBy(all, kindOf);
        const kindOptions = KINDS.filter((kind) => kinds.has(kind)).map((kind) => [kind, t(`kind_${kind}`), kinds.get(kind)]);
        let rows = chipRow('cat', 'cat', S.cat, kindOptions);
        if (S.cat) {
            const inKind = all.filter((bp) => kindOf(bp) === S.cat);
            const types = countBy(inKind, typeKey);
            rows += chipRow('sub', 'sub', S.sub, [...types].map(([key, count]) => [key, typeLabel(key), count]).sort((a, b) => a[1].localeCompare(b[1], H.lang())));
            const sizes = countBy(S.sub ? inKind.filter((bp) => typeKey(bp) === S.sub) : inKind, sizeKey);
            const order = ['Small', 'Light', 'Medium', 'Heavy', 'Large'];
            rows += chipRow('sz', 'sz', S.sz, [...sizes].map(([key, count]) => [key, sizeLabel(S.cat, key), count]).sort((a, b) => (order.indexOf(a[0]) - order.indexOf(b[0])) || a[0].localeCompare(b[0])));
        }
        rows += chipRow('own', 'own', S.own, [['default', t('ownDefault')], ['earned', t('ownEarned')], ['none', t('ownNone')]]);
        const chosen = S.mats.included().length + S.mats.excluded().length;
        const matChips = D.materials.map((mat, i) => ({ mat, i, label: matName(i) })).sort((a, b) => a.label.localeCompare(b.label, H.lang())).map(({ mat, label }) => {
            const state = S.mats.get(mat.id);
            return `<button type="button" class="fab-chip fab-matchip is-${e(state)}" data-act="mat" data-id="${e(mat.id)}" data-fk="${e(`mat:${mat.id}`)}" aria-label="${e(`${label}: ${S.mats.label(state)}`)}"><span class="fab-chipstate" aria-hidden="true">${state === 'include' ? '＋' : state === 'exclude' ? '－' : ''}</span>${e(label)}${state === 'any' ? '' : ` <small>${e(S.mats.label(state))}</small>`}</button>`;
        }).join('');
        rows += `<details class="fab-matfilter" data-details="mats"${S.matsOpen ? ' open' : ''}><summary data-fk="matsummary">${e(chosen ? t('matFilterOn', { n: chosen }) : t('matFilter'))}</summary><p class="fab-note">${e(t('matHint'))}</p><div class="fab-chips">${matChips}</div></details>`;
        const active = S.q || S.cat || S.sub || S.sz || S.own || chosen;
        return `<div class="fab-filters">${searchHtml('search')}${rows}${active ? btn('clear', '', e(t('clear')), { cls: 'fab-btn fab-btn-quiet' }) : ''}</div>`;
    }
    function tagsHtml(i) {
        const source = sourceOf(i);
        const key = { default: 'ownDefault', earned: 'ownEarned', none: 'ownNone' }[source];
        return `<span class="fab-tag is-${e(source)}">${e(t(key))}</span>`;
    }
    function bpMeta(i) {
        const bp = D.blueprints[i];
        const kind = kindOf(bp);
        const size = sizeKey(bp);
        return [t(`kind_${kind}`), typeKey(bp) === 'none' ? '' : typeLabel(typeKey(bp)), size ? sizeLabel(kind, size) : ''].filter(Boolean).join(' · ');
    }
    function resultsHtml() {
        const list = filtered();
        if (!list.length) return `<p class="fab-count">${e(t('count', { n: 0 }))}</p><p class="fab-empty">${e(t('noResult'))}</p>`;
        const shown = list.slice(0, S.shown);
        const rows = shown.map((i) => {
            const bp = D.blueprints[i];
            const name = bpName(i);
            const mats = (X.recipeMats[bp.r] || []).map(matName).join(', ');
            const label = `<span class="fab-rowname">${e(name)}</span><span class="fab-meta">${e(bpMeta(i))}</span><span class="fab-meta">${e(mats)}</span>`;
            return `<li class="fab-row${S.bp === i ? ' is-selected' : ''}">${btn('bp', bp.id, label, { cls: 'fab-rowbtn', pressed: S.bp === i })}<span class="fab-rowside">${tagsHtml(i)}${btn('add', bp.id, '<span aria-hidden="true">＋</span>', { cls: 'fab-btn fab-btn-icon', aria: t('addAria', { name }) })}</span></li>`;
        }).join('');
        const count = list.length > shown.length ? t('countOf', { n: fmt(list.length, 0), shown: fmt(shown.length, 0) }) : t('count', { n: fmt(list.length, 0) });
        return `<p class="fab-count">${e(count)}</p><ul class="fab-list">${rows}</ul>${list.length > shown.length ? btn('more', '', e(t('more'))) : ''}`;
    }
    function materialSource(mat) {
        if (!mat) return '';
        const noReturn = mat.noReturn ? ` <span class="fab-tag">${e(t('noReturn'))}</span>` : '';
        if (mat.mine) return `<a class="fab-link" href="${e(H.buildHash('mining', { m: mat.mine }))}">${e(t('mineLink'))}</a>${noReturn}`;
        return `<span class="fab-unknown">${e(t('noSource'))}</span>${noReturn}`;
    }
    function effectsHtml(mods, bp, minQuality) {
        return mods.map((index) => {
            const mod = D.mods[index];
            const stat = mod && D.stats[mod.s];
            if (!mod || !stat) return '';
            const value = mod.r?.length ? `<strong class="fab-modval" data-fab-mod="${e(index)}" data-fab-min="${e(minQuality)}">${e(modValueText(mod, Math.max(S.quality, minQuality)))}</strong>` : '';
            const odd = X.odd.has(index) ? `<span class="fab-unknown">${e(t('oddValue', { m: fmt(X.odd.get(index), 2) }))}</span>` : '';
            return `<li><span class="fab-stat">${e(statLabel(stat, bp))}</span><span class="fab-range">${e(modRangeText(mod))}</span>${value}${odd}</li>`;
        }).join('');
    }
    function slotHtml(slot, bp) {
        const options = slot.o.map((option) => {
            const mat = D.materials[option.mat];
            const minQ = H.isKnown(option.q) ? Number(option.q) : 0;
            const own = option.f?.length ? `<ul class="fab-effects">${effectsHtml(option.f, bp, minQ)}</ul>` : '';
            const mult = H.isKnown(option.x) ? `<p class="fab-note">${e(t('multiplier', { x: fmt(option.x) }))}</p>` : '';
            return `<li class="fab-option"><div class="fab-optionmain"><strong>${e(matName(option.mat) || H.unknown())}</strong><span class="fab-amount">${e(amountText(option))}</span><span class="fab-meta">${e(H.isKnown(option.q) ? t('minQuality', { q: fmt(option.q, 0) }) : H.unknown())}</span></div><div class="fab-optionsrc">${materialSource(mat)}</div>${mult}${own}</li>`;
        });
        const slotMin = Math.min(...slot.o.map((option) => (H.isKnown(option.q) ? Number(option.q) : 0)));
        const effects = slot.f?.length ? `<ul class="fab-effects">${effectsHtml(slot.f, bp, slotMin)}</ul>` : (slot.o.some((option) => option.f?.length) ? '' : `<p class="fab-note">${e(t('noEffects'))}</p>`);
        const choose = slot.o.length > 1 ? `<p class="fab-note fab-choose">${e(t('alternatives'))}</p>` : '';
        return `<li class="fab-slot"><h5>${slotLabel(slot)}</h5>${choose}<ul class="fab-options${slot.o.length > 1 ? ' is-alt' : ''}">${options.join(slot.o.length > 1 ? `<li class="fab-or" aria-hidden="true">${e(t('or'))}</li>` : '')}</ul>${effects}</li>`;
    }
    function poolUseHtml(id) {
        const use = X.poolUse[id];
        if (!use) return '';
        const rows = [
            ...use.tiers.map((tier) => `<li>${e(t('srcEvent', { scenario: tier.scenario, points: fmt(tier.minPoints, 0) }))} <span class="fab-meta">${e(t('eventNote'))}</span></li>`),
            ...use.trades.map((index) => `<li>${btn('trade', D.trades[index].id, e(t('srcTrade', { name: H.name(D.trades[index].name) })), { cls: 'fab-linkbtn' })}</li>`),
            ...use.temp.map((entry) => `<li>${e(t('srcTemp', { name: `${entry.in} / ${entry.name}` }))}</li>`),
        ];
        return rows.join('');
    }
    function sourcesHtml(i) {
        const bp = D.blueprints[i];
        const pools = X.bpPools[i];
        let body = '';
        if (bp.d) body += `<p>${e(t('srcDefault'))}</p>`;
        if (!bp.d && !pools.length) body += `<p class="fab-unknown">${e(t('srcNone'))}</p>`;
        if (pools.length) {
            const rows = pools.map((id) => `<li>${btn('pool', id, `<code>${e(id)}</code>`, { cls: 'fab-linkbtn', aria: `${t('poolOpen')}: ${id}` })}<ul class="fab-sublist">${poolUseHtml(id)}</ul></li>`).join('');
            body += `<h4>${e(t('srcPools'))} <small>${e(t('count', { n: pools.length }))}</small></h4><ul class="fab-poolrefs">${rows}</ul>${missionsHtml(pools, false)}`;
        }
        return `<section class="fab-block"><h4 class="fab-blocktitle">${e(t('sources'))}</h4>${body}</section>`;
    }
    function detailHtml() {
        if (S.bp === null) return `<p class="fab-hint">${e(t('pick'))}</p>`;
        const i = S.bp;
        const bp = D.blueprints[i];
        const recipe = D.recipes[bp.r] || { slots: [] };
        const name = bpName(i);
        const maker = D.makers[bp.m];
        const facts = [
            [t('craftTime'), `${craftTime(recipe.s)} (${t('craftTimeNote')})`],
            maker ? [t('maker'), H.name(maker.name) || maker.id] : null,
            H.isKnown(bp.z) ? [t('size'), `S${bp.z}`] : null,
            H.isKnown(bp.g) ? [t('grade'), fmt(bp.g, 0)] : null,
        ].filter(Boolean).map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('');
        const hasRanges = recipe.slots.some((slot) => [...(slot.f || []), ...slot.o.flatMap((option) => option.f || [])].some((index) => D.mods[index]?.r?.length));
        const slider = hasRanges ? `<div class="fab-quality"><label for="fab-quality">${e(t('quality'))} <output id="fab-quality-out" for="fab-quality">${e(fmt(S.quality, 0))}</output></label><input type="range" id="fab-quality" data-in="quality" data-fk="quality" min="0" max="1000" step="1" value="${e(S.quality)}"><p class="fab-note">${e(t('qualityHelp', { n: fmt(D.globals?.defaultQuality, 0) }))}</p></div>` : '';
        const pick = H.isKnown(recipe.pick) ? `<p class="fab-note fab-choose">${e(t('pickSlots', { n: fmt(recipe.pick, 0) }))}</p>` : '';
        return `<article class="fab-detail" aria-labelledby="fab-detail-title">
            ${btn('back', '', `<span aria-hidden="true">←</span> ${e(t('back'))}`, { cls: 'fab-btn fab-back' })}
            <header class="fab-detailhead"><div><h3 id="fab-detail-title" tabindex="-1">${e(name)}</h3><p class="fab-meta">${e(bpMeta(i))}${bp.name ? '' : ` · ${e(t('noName'))} (${e(t('internalName'))})`}</p><p class="fab-id"><code>${e(bp.id)}</code></p></div><div class="fab-headside">${tagsHtml(i)}</div></header>
            <div class="fab-actions">${btn('add', bp.id, e(t('add')), { cls: 'fab-btn fab-btn-main' })}${btn('copy', '', e(t('copyLink')))}</div>
            ${bp.noOutput ? `<p class="fab-unknown">${e(t('noOutput'))}</p>` : ''}
            <dl class="fab-facts">${facts}</dl>
            <section class="fab-block"><h4 class="fab-blocktitle">${e(t('slots'))}</h4>${pick}${slider}<ul class="fab-slots">${recipe.slots.map((slot) => slotHtml(slot, bp)).join('')}</ul>${hasRanges ? `<p class="fab-note">${e(t('effectNote'))}</p>` : ''}</section>
            ${sourcesHtml(i)}
        </article>`;
    }
    function notesHtml() {
        const stations = (D.stations || []).map((station) => `<li>${e(H.name(station.name) || station.id)}</li>`).join('');
        const dis = D.dismantle;
        const names = (dis?.noReturn?.resources || []).map((id) => matName(X.matById.get(id)) || id).join(', ');
        const dismantle = dis ? `<p>${e(t('dismantle', { time: craftTime(dis.s), eff: fmt(dis.efficiency) }))}</p>${names ? `<p>${e(t('dismantleNoReturn', { list: names }))}</p>` : ''}` : '';
        return `<details class="fab-notes"><summary data-fk="notes">${e(t('notes'))}</summary>${stations ? `<h4>${e(t('stations'))}</h4><ul>${stations}</ul><p class="fab-note">${e(t('stationNote'))}</p>` : ''}${dismantle}</details>`;
    }
    function listTab() {
        return `<div class="fab-browse${S.bp !== null ? ' has-detail' : ''}"><div class="fab-listpane">${filtersHtml()}<div class="fab-results" data-region="results">${resultsHtml()}</div>${notesHtml()}</div><div class="fab-detailpane" data-region="detail">${detailHtml()}</div></div>`;
    }
    function matsTab() {
        const rows = D.materials.map((mat, i) => ({ mat, i, label: matName(i) })).sort((a, b) => a.label.localeCompare(b.label, H.lang())).map(({ mat, i, label }) => {
            const use = X.matUses[i];
            const unit = use.scu && use.pc ? t('unitBoth') : use.scu ? t('unitScu') : use.pc ? t('unitPc') : H.unknown();
            return `<tr><th scope="row">${e(label)}</th><td>${e(unit)}</td><td>${use.count ? btn('mat-show', mat.id, e(t('matShow', { n: fmt(use.count, 0) })), { cls: 'fab-linkbtn', aria: `${label}: ${t('matShow', { n: fmt(use.count, 0) })}` }) : e(fmt(0, 0))}</td><td>${materialSource(mat)}</td></tr>`;
        }).join('');
        return `<h3 class="fab-title">${e(t('matsTitle', { n: fmt(D.materials.length, 0) }))}</h3><div class="fab-tablewrap"><table class="fab-table"><thead><tr><th scope="col">${e(t('matName'))}</th><th scope="col">${e(t('matUnit'))}</th><th scope="col">${e(t('matUses'))}</th><th scope="col">${e(t('matSource'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    function poolResultsHtml() {
        const words = tokens();
        const ids = Object.keys(D.pools).filter((id) => {
            if (!words.length) return true;
            const hay = `${lower(id)} ${X.poolItems[id].items.map((i) => X.search[i]).join(' ')}`;
            return words.every((word) => hay.includes(word));
        });
        if (!ids.length) return `<p class="fab-empty">${e(t('noPool'))}</p>`;
        const rows = ids.map((id) => `<li class="fab-row${S.pool === id ? ' is-selected' : ''}">${btn('pool', id, `<span class="fab-rowname"><code>${e(id)}</code></span><span class="fab-meta">${e(t('poolItems', { n: fmt(X.poolItems[id].items.length, 0) }))}</span>`, { cls: 'fab-rowbtn', pressed: S.pool === id })}</li>`).join('');
        return `<p class="fab-count">${e(t('count', { n: fmt(ids.length, 0) }))}</p><ul class="fab-list">${rows}</ul>`;
    }
    function poolDetailHtml() {
        const info = S.pool ? X.poolItems[S.pool] : null;
        if (!info) return `<p class="fab-hint">${e(t('poolPick'))}</p>`;
        const names = info.items.map((i) => ({ i, name: bpName(i) })).sort((a, b) => a.name.localeCompare(b.name, H.lang()));
        const items = names.map(({ i, name }) => `<li>${btn('bp', D.blueprints[i].id, e(name), { cls: 'fab-linkbtn' })} <span class="fab-meta">${e(bpMeta(i))}</span></li>`).join('');
        const used = poolUseHtml(S.pool);
        return `<article class="fab-detail" aria-labelledby="fab-detail-title">
            ${btn('back', '', `<span aria-hidden="true">←</span> ${e(t('back'))}`, { cls: 'fab-btn fab-back' })}
            <header class="fab-detailhead"><div><p class="fab-meta">${e(t('poolName'))}</p><h3 id="fab-detail-title" tabindex="-1"><code>${e(S.pool)}</code></h3></div></header>
            <div class="fab-actions">${btn('copy', '', e(t('copyLink')))}</div>
            <section class="fab-block"><h4 class="fab-blocktitle">${e(t('poolItems', { n: fmt(info.items.length, 0) }))}</h4>${info.repeat ? `<p class="fab-note">${e(t('poolRepeat'))}</p>` : ''}${H.isKnown(info.missing) && info.missing > 0 ? `<p class="fab-note">${e(t('poolMissing', { n: fmt(info.missing, 0) }))}</p>` : ''}<ul class="fab-poolitems">${items}</ul><p class="fab-note">${e(t('poolDraw'))}</p></section>
            <section class="fab-block"><h4 class="fab-blocktitle">${e(t('poolUsed'))}</h4>${used ? `<ul class="fab-sublist">${used}</ul>` : `<p class="fab-note">${e(t('poolNoUse'))}</p>`}${missionsHtml([S.pool], true)}</section>
        </article>`;
    }
    function poolsTab() {
        return `<div class="fab-browse${S.pool ? ' has-detail' : ''}"><div class="fab-listpane"><h3 class="fab-title">${e(t('poolsTitle', { n: fmt(Object.keys(D.pools).length, 0) }))}</h3><div class="fab-filters">${searchHtml('searchPool')}</div><div class="fab-results" data-region="results">${poolResultsHtml()}</div></div><div class="fab-detailpane" data-region="detail">${poolDetailHtml()}</div></div>`;
    }
    function tradeItemName(index) {
        const item = D.tradeItems[index];
        return item ? H.name(item.name) || item.id : H.unknown();
    }
    function needText(row) {
        if (row.res !== undefined) {
            const mat = X.matById.get(row.res);
            const amount = H.isKnown(row.maxScu) && row.maxScu > row.minScu ? `${fmt(row.minScu)} ~ ${fmt(row.maxScu)} SCU` : `${fmt(row.minScu)} SCU`;
            return `${mat === undefined ? row.res : matName(mat)} ${H.isKnown(row.minScu) ? amount : H.unknown()}`;
        }
        // max 0 은 게임 파일에 그렇게 적힌 값이다 (위쪽 한도 없음인지 확인 안 됨). min 을 수량으로 쓴다.
        const amount = H.isKnown(row.max) && row.max > row.min ? `${fmt(row.min, 0)} ~ ${fmt(row.max, 0)}` : (H.isKnown(row.min) ? fmt(row.min, 0) : H.unknown());
        return `${tradeItemName(row.i)} × ${amount}`;
    }
    function accessText(access) {
        if (!access) return [];
        const lines = [];
        if (access.tags?.length) lines.push(t('tradeTags', { tags: access.tags.join(', ') }));
        if (Array.isArray(access.crime)) lines.push(t('tradeCrime', { a: fmt(access.crime[0], 0), b: fmt(access.crime[1], 0) }));
        if (access.rep?.min) {
            lines.push(t('tradeRep', { name: H.name(access.rep.min.name), rep: fmt(access.rep.min.rep, 0) }));
            if (access.rep.max && access.rep.max.id !== access.rep.min.id) lines.push(t('tradeRepMax', { name: H.name(access.rep.max.name) }));
        }
        return lines;
    }
    function tradeHay(trade) {
        const items = [...(trade.need || []), ...(trade.give || []), ...(trade.roll || []).flatMap((group) => group.items || [])];
        const names = items.map((row) => (row.res !== undefined ? `${row.res} ${matName(X.matById.get(row.res))}` : `${D.tradeItems[row.i]?.name?.en || ''} ${D.tradeItems[row.i]?.name?.ko || ''}`));
        return lower(`${trade.name?.en || ''} ${trade.name?.ko || ''} ${trade.key || ''} ${names.join(' ')}`);
    }
    function tradeResultsHtml() {
        const words = tokens();
        const list = D.trades.filter((trade) => (!S.tradeType || trade.type === S.tradeType) && (!words.length || words.every((word) => tradeHay(trade).includes(word))));
        if (!list.length) return `<p class="fab-empty">${e(t('noTrade'))}</p>`;
        const li = (rows) => rows.map((row) => `<li>${e(row)}</li>`).join('');
        const cards = list.map((trade) => {
            const give = trade.give?.length ? `<div><h5>${e(t('tradeGive'))}</h5><ul>${li(trade.give.map((row) => `${tradeItemName(row.i)} × ${fmt(row.n, 0)}`))}</ul></div>` : '';
            const roll = (trade.roll || []).map((group) => `<div><h5>${e(t('tradeRoll'))}</h5><ul>${li((group.items || []).map((row) => `${tradeItemName(row.i)} × ${fmt(row.n, 0)}`))}</ul><p class="fab-note">${e(t('tradeRollNote', { w: fmt(group.w) }))}</p></div>`).join('');
            const pools = trade.bp?.length ? `<div><h5>${e(t('tradeBp'))}</h5><ul>${trade.bp.map(([id, chance]) => `<li>${btn('pool', id, `<code>${e(id)}</code>`, { cls: 'fab-linkbtn', aria: `${t('poolOpen')}: ${id}` })} <span class="fab-meta">${e(H.isKnown(chance) ? t('chance', { p: fmt(chance) }) : '')}</span></li>`).join('')}</ul></div>` : '';
            const access = accessText(D.tradeAccess?.[trade.a]);
            return `<li class="fab-trade" id="fab-trade-${e(trade.id)}"><h4>${e(H.name(trade.name) || trade.key)}</h4><p class="fab-meta">${e(t(trade.type === 'WIkelo_Ships' ? 'tradeShip' : 'tradeItem'))}</p>
                <div class="fab-tradegrid"><div><h5>${e(t('tradeNeed'))}</h5><ul>${li((trade.need || []).map(needText))}</ul></div>${give}${roll}${pools}</div>
                ${access.length ? `<div class="fab-access"><h5>${e(t('tradeAccess'))}</h5><ul>${li(access)}</ul></div>` : ''}${trade.ovUnused ? `<p class="fab-note">${e(t('tradeOv'))}</p>` : ''}</li>`;
        }).join('');
        return `<p class="fab-count">${e(t('count', { n: fmt(list.length, 0) }))}</p><ul class="fab-trades">${cards}</ul>`;
    }
    function tradesTab() {
        const types = [['WIkelo_Ships', t('tradeShips')], ['WIkelo_SmallItems', t('tradeItems')]].filter(([type]) => D.trades.some((trade) => trade.type === type));
        const chips = [['', t('tradeAll')], ...types].map(([id, label]) => btn('trade-type', id, e(label), { cls: `fab-chip${S.tradeType === id ? ' is-active' : ''}`, pressed: S.tradeType === id })).join('');
        return `<h3 class="fab-title">${e(t('tradesTitle', { n: fmt(D.trades.length, 0) }))}</h3><p class="fab-note">${e(t('tradeNote'))}</p><div class="fab-filters">${searchHtml('searchTrade')}<div class="fab-chips" role="group" aria-label="${e(t('tabTrades'))}">${chips}</div></div><div class="fab-results" data-region="results">${tradeResultsHtml()}</div>`;
    }

    // ── 모을 재료 목록 ──────────────────────────────────────────────────────────
    function cartTotals() {
        const sums = new Map();
        const choices = [];
        let seconds = 0;
        let timeKnown = true;
        viewed().forEach((qty, i) => {
            const recipe = D.recipes[D.blueprints[i].r];
            if (!recipe) return;
            if (H.isKnown(recipe.s)) seconds += recipe.s * qty;
            else timeKnown = false;
            recipe.slots.forEach((slot) => {
                if (H.isKnown(recipe.pick) || H.isKnown(slot.pick) || slot.o.length !== 1) {
                    choices.push({ i, qty, slot });
                    return;
                }
                const option = slot.o[0];
                const unit = option.scu !== undefined ? 'scu' : 'pc';
                const key = `${option.mat}|${unit}|${option.q}`;
                const row = sums.get(key) || { mat: option.mat, unit, q: option.q, amount: 0 };
                row.amount = round6(row.amount + (unit === 'scu' ? option.scu : option.pc) * qty);
                sums.set(key, row);
            });
        });
        const rows = [...sums.values()].sort((a, b) => matName(a.mat).localeCompare(matName(b.mat), H.lang()) || (a.q ?? 0) - (b.q ?? 0));
        return { rows, choices, seconds: timeKnown ? seconds : null };
    }
    function totalAmount(row) {
        return row.unit === 'scu' ? `${fmt(row.amount)} SCU` : t('pieces', { n: fmt(row.amount) });
    }
    function choiceText(choice) {
        const entry = D.slotNames[choice.slot.n];
        const slotName = entry?.name ? H.name(entry.name) : t('slotNoName');
        const options = choice.slot.o.map((option) => `${matName(option.mat)} ${amountText(option)} (${t('minQuality', { q: fmt(option.q, 0) })})`).join(` ${t('or')} `);
        return `${bpName(choice.i)} × ${fmt(choice.qty, 0)} / ${slotName}: ${options}`;
    }
    function cartText() {
        const totals = cartTotals();
        const lines = [`${t('cartHead')} (${H.sourceLine(D)})`, '', `[${t('cartItems')}]`];
        for (const [i, qty] of viewed()) lines.push(`- ${bpName(i)} × ${fmt(qty, 0)}`);
        lines.push('', `[${t('cartTotals')}]`);
        for (const row of totals.rows) lines.push(`- ${matName(row.mat)} ${totalAmount(row)} (${t('minQuality', { q: fmt(row.q, 0) })})`);
        if (totals.choices.length) {
            lines.push('', `[${t('cartChoices')}]`);
            for (const choice of totals.choices) lines.push(`- ${choiceText(choice)}`);
        }
        lines.push('', `${t('cartTime')}: ${craftTime(totals.seconds)} (${t('cartTimeNote')})`);
        return lines.join('\n');
    }
    function cartTab() {
        const banner = shared ? `<div class="fab-shared" role="note"><p>${e(t('sharedNote', { n: fmt(cart.size, 0) }))}</p><div class="fab-actions">${shared.size ? `${btn('shared-merge', '', e(t('sharedMerge')))}${btn('shared-replace', '', e(t('sharedReplace')))}` : ''}${btn('shared-mine', '', e(t('sharedMine')), { cls: 'fab-btn fab-btn-main' })}</div></div>` : '';
        if (!viewed().size) return `${banner}<p class="fab-hint">${e(t(shared ? 'sharedEmpty' : 'cartEmpty'))}</p>`;
        const totals = cartTotals();
        const items = [...viewed()].map(([i, qty]) => {
            const bp = D.blueprints[i];
            const name = bpName(i);
            return `<li class="fab-cartrow">${btn('bp', bp.id, e(name), { cls: 'fab-linkbtn' })}<span class="fab-qty">${btn('qty-down', bp.id, '<span aria-hidden="true">−</span>', { cls: 'fab-btn fab-btn-icon', aria: `${t('qtyAria', { name })} −1` })}<input type="number" inputmode="numeric" min="1" max="999" step="1" value="${e(qty)}" data-in="qty" data-id="${e(bp.id)}" data-fk="${e(`qty:${bp.id}`)}" aria-label="${e(t('qtyAria', { name }))}">${btn('qty-up', bp.id, '<span aria-hidden="true">＋</span>', { cls: 'fab-btn fab-btn-icon', aria: `${t('qtyAria', { name })} +1` })}${btn('remove', bp.id, e(t('remove')), { cls: 'fab-btn fab-btn-quiet', aria: t('removeAria', { name }) })}</span></li>`;
        }).join('');
        const rows = totals.rows.map((row) => `<tr><th scope="row">${e(matName(row.mat))}</th><td class="is-num">${e(totalAmount(row))}</td><td>${e(H.isKnown(row.q) ? t('minQuality', { q: fmt(row.q, 0) }) : H.unknown())}</td><td>${materialSource(D.materials[row.mat])}</td></tr>`).join('');
        const choices = totals.choices.length ? `<section class="fab-block"><h4 class="fab-blocktitle">${e(t('cartChoices'))}</h4><ul class="fab-sublist">${totals.choices.map((choice) => `<li>${e(choiceText(choice))}</li>`).join('')}</ul></section>` : '';
        return `${banner}<div class="fab-cart">
            <section class="fab-block"><h3 class="fab-blocktitle">${e(t('cartItems'))}</h3><ul class="fab-cartlist">${items}</ul><div class="fab-actions">${btn('cart-clear', '', e(t('cartClear')), { cls: 'fab-btn fab-btn-quiet' })}${btn('copy', '', e(t('copyLink')))}</div></section>
            <section class="fab-block"><h3 class="fab-blocktitle">${e(t('cartTotals'))}</h3><div class="fab-tablewrap"><table class="fab-table"><thead><tr><th scope="col">${e(t('matName'))}</th><th scope="col" class="is-num">${e(t('qty'))}</th><th scope="col">${e(t('minQuality', { q: '' }).trim())}</th><th scope="col">${e(t('matSource'))}</th></tr></thead><tbody>${rows}</tbody></table></div><p class="fab-note">${e(t('cartNote'))}</p>
            <dl class="fab-facts"><div><dt>${e(t('cartTime'))}</dt><dd>${e(craftTime(totals.seconds))}</dd></div></dl><p class="fab-note">${e(t('cartTimeNote'))}</p></section>
            ${choices}
            <section class="fab-block"><h3 class="fab-blocktitle">${e(t('cartCopy'))}</h3><div class="fab-actions">${btn('cart-copy', '', e(t('cartCopy')), { cls: 'fab-btn fab-btn-main' })}</div><label class="fab-copytext"><span class="visually-hidden">${e(t('cartText'))}</span><textarea id="fab-cart-text" readonly rows="8" data-fk="carttext">${e(cartText())}</textarea></label></section>
        </div>`;
    }

    // ── 그리기 ───────────────────────────────────────────────────────────────
    function pageHtml() {
        if (loadError) return `<div class="fab-status" role="alert"><p>${e(H.errorText(loadError))}</p>${btn('reload', '', e(t('retry')))}</div>`;
        if (!D) return `<p class="fab-status" role="status">${e(t('loading'))}</p>`;
        const body = { list: listTab, mats: matsTab, pools: poolsTab, trades: tradesTab, cart: cartTab }[S.tab]();
        const sub = S.tab === 'list' ? 'pools' : S.tab === 'mats' && D.trades?.length ? 'trades' : null;
        const filter = sub ? btn('tab', sub, e(t(TAB_LABELS[sub])), { cls: 'fab-chip' }) : '';
        return `${tabsHtml()}${filter}<p class="fab-live" role="status" aria-live="polite" data-region="status">${e(S.status)}</p><div class="fab-body fab-body-${e(S.tab)}">${body}</div><p class="fab-source">${e(H.sourceLine(D))} · ${e(t('sourceNote'))}</p>`;
    }
    function render(focusKey) {
        if (!root) return;
        const active = document.activeElement;
        const key = focusKey || (active && root.contains(active) ? active.getAttribute('data-fk') : null);
        const caret = active && active.tagName === 'INPUT' && active.type === 'search' ? active.selectionStart : null;
        // 같은 이름표를 가진 버튼이 목록과 상세에 함께 있을 수 있어서 몇 번째였는지도 기억한다.
        const sameKey = () => [...root.querySelectorAll('[data-fk]')].filter((node) => node.getAttribute('data-fk') === key);
        const nth = key && !focusKey ? Math.max(0, sameKey().indexOf(active)) : 0;
        // 목록과 상세가 따로 스크롤되므로, 같은 탭을 다시 그릴 때는 보던 자리를 지킨다.
        const panes = ['.fab-listpane', '.fab-detailpane'];
        const tops = paintedTab === S.tab ? panes.map((selector) => root.querySelector(selector)?.scrollTop || 0) : [0, 0];
        paint(root, pageHtml());
        paintedTab = D ? S.tab : '';
        panes.forEach((selector, index) => {
            const pane = root.querySelector(selector);
            if (pane && tops[index]) pane.scrollTop = tops[index];
        });
        if (!key) return;
        const matches = sameKey();
        const next = matches[nth] || matches[0];
        if (!next) return;
        next.focus({ preventScroll: true });
        if (caret !== null && next.type === 'search') {
            try { next.setSelectionRange(caret, caret); } catch (_error) { /* 커서 위치를 못 옮겨도 된다 */ }
        }
    }
    function renderResults() {
        const html = { list: resultsHtml, pools: poolResultsHtml, trades: tradeResultsHtml }[S.tab];
        if (html) paint(root.querySelector('[data-region="results"]'), html());
    }
    function say(message) {
        S.status = message;
        const node = root.querySelector('[data-region="status"]');
        if (node) node.textContent = message;
    }
    function focusDetail() {
        const title = root.querySelector('#fab-detail-title');
        if (!title) return;
        title.focus({ preventScroll: true });
        if (isNarrow()) {
            root.scrollIntoView({ block: 'start' });
            return;
        }
        // 넓은 화면: 상세 칸을 맨 위로 돌리고, 화면 밖에 있으면 보이는 데까지만 끌어온다.
        const pane = root.querySelector('.fab-detailpane');
        if (!pane) return;
        pane.scrollTop = 0;
        const box = pane.getBoundingClientRect();
        if (box.top < 80 || box.top > window.innerHeight - 200) pane.scrollIntoView({ block: 'start' });
    }
    function isNarrow() {
        return window.matchMedia('(max-width: 1000px)').matches;
    }

    // ── 동작 ─────────────────────────────────────────────────────────────────
    function openBlueprint(id) {
        const index = X.byId.get(id);
        if (index === undefined) return;
        if (S.tab !== 'list') S.q = '';
        S.tab = 'list';
        S.bp = index;
        S.bpId = id;
        S.missionsShown = MISSION_PAGE;
        S.status = '';
        sync(true);
        render();
        focusDetail();
    }
    function openPool(id) {
        if (!has(D.pools, id)) return;
        if (S.tab !== 'pools') S.q = '';
        S.tab = 'pools';
        S.pool = id;
        S.missionsShown = MISSION_PAGE;
        S.status = '';
        sync(true);
        render();
        focusDetail();
    }
    // 받은 목록을 보고 있을 때는 저장하지 않는다 (내 목록을 지킨다).
    function keepList() {
        if (!shared) saveCart();
    }
    function addTo(map, id, delta) {
        const index = X.byId.get(id);
        if (index === undefined) return;
        const qty = Math.max(0, Math.min(999, (map.get(index) || 0) + delta));
        if (qty) map.set(index, qty);
        else map.delete(index);
    }
    async function copyText(value, okKey, failKey) {
        let ok = false;
        try {
            await navigator.clipboard.writeText(value);
            ok = true;
        } catch (_error) {
            ok = false;
        }
        say(ok ? t(okKey) : t(failKey));
        if (!ok) root.querySelector('#fab-cart-text')?.select();
    }
    const ACTIONS = {
        reload() { load(); },
        tab(id) {
            if (!TABS.includes(id) || id === S.tab) return;
            S.tab = id;
            S.q = '';
            S.status = '';
            sync(true);
            render();
        },
        cat(id) { S.cat = S.cat === id ? '' : id; S.sub = ''; S.sz = ''; S.shown = PAGE; sync(); render(); },
        sub(id) { S.sub = S.sub === id ? '' : id; S.sz = ''; S.shown = PAGE; sync(); render(); },
        sz(id) { S.sz = S.sz === id ? '' : id; S.shown = PAGE; sync(); render(); },
        own(id) { S.own = S.own === id ? '' : id; S.shown = PAGE; sync(); render(); },
        mat(id) { S.mats.cycle(id); S.matsOpen = true; S.shown = PAGE; sync(); render(); },
        clear() { S.q = ''; S.cat = ''; S.sub = ''; S.sz = ''; S.own = ''; S.mats.clear(); S.shown = PAGE; sync(); render('q'); },
        more() { S.shown += PAGE; renderResults(); },
        bp(id) { openBlueprint(id); },
        pool(id) { openPool(id); },
        back() {
            const key = S.tab === 'pools' ? `pool:${S.pool}` : `bp:${S.bpId}`;
            if (S.tab === 'pools') S.pool = '';
            else { S.bp = null; S.bpId = ''; }
            sync(true);
            render(key);
            // 좁은 화면: 보던 줄로 돌아간다 (맨 위로 튀지 않게).
            const row = document.activeElement;
            if (isNarrow() && row && root.contains(row) && row.getAttribute('data-fk') === key) row.scrollIntoView({ block: 'center' });
        },
        add(id) {
            // 담기는 언제나 내 목록에 한다. 화면 전체를 다시 그리지 않고 탭의 숫자와 안내만 바꾼다.
            const index = X.byId.get(id);
            if (index === undefined) return;
            addTo(cart, id, 1);
            saveCart();
            paint(root.querySelector('[data-region="tabs"]'), tabButtons());
            say(t('added', { name: bpName(index), n: fmt(cart.get(index), 0) }));
        },
        'qty-up'(id) { addTo(viewed(), id, 1); keepList(); sync(); render(); },
        'qty-down'(id) { if ((viewed().get(X.byId.get(id)) || 0) > 1) addTo(viewed(), id, -1); keepList(); sync(); render(); },
        remove(id) { viewed().delete(X.byId.get(id)); keepList(); sync(); render('tab:cart'); },
        'cart-clear'() { viewed().clear(); keepList(); sync(); render('tab:cart'); },
        'shared-merge'() {
            if (!shared) return;
            shared.forEach((qty, index) => { cart.set(index, Math.min(999, (cart.get(index) || 0) + qty)); });
            shared = null;
            saveCart(); sync(); render('tab:cart');
            say(t('sharedMerged'));
        },
        'shared-replace'() {
            if (!shared) return;
            cart.clear();
            shared.forEach((qty, index) => { cart.set(index, qty); });
            shared = null;
            saveCart(); sync(); render('tab:cart');
            say(t('sharedReplaced'));
        },
        'shared-mine'() { shared = null; sync(); render('tab:cart'); },
        'cart-copy'() { copyText(cartText(), 'cartCopied', 'cartCopyFailed'); },
        copy() { H.copyShareUrl(SECTION, hashParams()).then((ok) => say(H.text(ok ? 'copied' : 'copyFailed'))); },
        missions() { loadMissions(); },
        'more-missions'() { S.missionsShown += MISSION_PAGE; render(); },
        'mat-show'(id) { S.tab = 'list'; S.q = ''; S.cat = ''; S.sub = ''; S.sz = ''; S.own = ''; S.mats = H.chips(id); S.matsOpen = true; S.bp = null; S.bpId = ''; S.shown = PAGE; sync(true); render('tab:list'); },
        trade(id) {
            S.tab = 'trades'; S.q = ''; S.tradeType = '';
            sync(true);
            render();
            const card = [...root.querySelectorAll('.fab-trade')].find((node) => node.id === `fab-trade-${id}`);
            if (card) { card.setAttribute('tabindex', '-1'); card.focus(); }
        },
        'trade-type'(id) { S.tradeType = TRADE_TYPES.some(([, type]) => type === id) ? id : ''; sync(); render(); },
    };
    function onClick(event) {
        const target = event.target.closest?.('[data-act]');
        if (!target || !root.contains(target) || !D && target.dataset.act !== 'reload') return;
        const action = ACTIONS[target.dataset.act];
        if (action) action(target.dataset.id || '');
    }
    function onInput(event) {
        const target = event.target;
        const kind = target?.dataset?.in;
        if (!D || !kind) return;
        if (kind === 'q') {
            S.q = String(target.value || '').slice(0, 80);
            S.shown = PAGE;
            sync();
            renderResults();
        } else if (kind === 'quality') {
            S.quality = clampQuality(target.value);
            const out = root.querySelector('#fab-quality-out');
            if (out) out.textContent = fmt(S.quality, 0);
            root.querySelectorAll('[data-fab-mod]').forEach((node) => {
                const mod = D.mods[Number(node.getAttribute('data-fab-mod'))];
                if (mod) node.textContent = modValueText(mod, Math.max(S.quality, Number(node.getAttribute('data-fab-min')) || 0));
            });
        }
    }
    function onChange(event) {
        const target = event.target;
        // 품질은 손을 뗐을 때만 주소에 적는다 (움직이는 동안 주소를 계속 바꾸지 않는다).
        if (D && target?.dataset?.in === 'quality') sync();
        if (!D || target?.dataset?.in !== 'qty') return;
        const index = X.byId.get(target.dataset.id);
        if (index === undefined) return;
        const qty = Math.max(1, Math.min(999, Math.floor(Number(target.value)) || 1));
        viewed().set(index, qty);
        keepList();
        sync();
        render();
    }
    function onToggle(event) {
        if (event.target?.dataset?.details === 'mats') S.matsOpen = event.target.open;
    }

    function load() {
        loadError = null;
        render();
        H.loadJson(DATA_URL).then((data) => {
            D = data;
            buildIndex();
            loadCart();
            resolveParams();
            render();
        }, (error) => {
            loadError = error;
            render();
        });
    }

    window.VOLT_FABRICATOR = {
        init(mount, ctx) {
            root = mount;
            root.addEventListener('click', onClick);
            root.addEventListener('input', onInput);
            root.addEventListener('change', onChange);
            root.addEventListener('toggle', onToggle, true);
            applyParams(ctx?.params || {});
            load();
        },
        onLanguageChange() {
            render();
        },
        onRoute(params) {
            applyParams(params || {});
            render();
        },
    };
})();
