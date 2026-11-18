/**
 * 채광 안내 — 광물별로 캐는 곳을, 장소별로 나오는 광물을 보여 준다.
 * - 광물·암석·장소: /data/mining/mining.json (출처: 게임 파일, scripts/mining/build-mining-data.mjs)
 * - 시세: /api/uex/commodities (출처 UEX). 받지 못해도 나머지는 그대로 보인다.
 * 비중과 함량은 게임 파일 값이며 게임 안 실측값이 아니다.
 *
 * 추가 화면 (docs/helper-tools.md 2.2):
 * - 장소별: 할 수 있는 일 아이콘(함선·차량·손·채집·잔해), 종류·성계 포함/제외 칩, 묶음·표·광물×장소 표.
 * - 신호 찾기: 스캐너 숫자 → 암석 종류와 개수 후보. "기본 신호 값 × 암석 수" 규칙은 게임 안 확인 전이다.
 * - 정제소 찾기: 게임 파일의 정제 시설 목록 + UEX 이용자 보고 수율 보너스(/api/uex/refineries, /api/uex/terminals).
 * - 표 내려받기(CSV, data: 주소 — CSP 가 blob: 을 막는다), 표 복사, 주소 복사.
 *
 * 주소(해시) 키 — #mining?key=value
 *   m 광물 id · loc 장소 id (다른 화면이 쓰는 연결 키) · tab = location | sig | ref · q 검색어 · mode 방식
 *   lay = table | matrix · type, sys 포함/제외 칩 · sv 신호 값 · sm = approx | range · st 오차 · sv2 범위 끝 · ores UEX 광물 id 목록
 */
(function () {
    'use strict';
    const DATA_URL = '/data/mining/mining.json';
    const H = window.VOLT_HELPER;
    // 게임과 UEX의 표기만 다른 상품 (게임 id → UEX 이름).
    const UEX_ALIASES = { Raw_Ice: 'Ice (Raw)', RawSilicon: 'Silicon (Raw)', RawOuratite: 'Ouratite (Raw)' };
    const TEXT = {
        ko: {
            loading: '채광 자료를 불러오는 중입니다…', loadError: '채광 자료를 불러오지 못했습니다.', retry: '다시 시도',
            byMineral: '광물별', byLocation: '장소별', views: '보기 방식', search: '광물·장소 이름 검색', searchLabel: '검색',
            modeAll: '전체', ship: '함선 채광', vehicle: '지상 차량 채광', hand: '손 채광', modes: '채광 방식',
            mineral: '광물', method: '방식', refined: '정제 후', price: 'UEX 판매 시세', instability: '불안정성', resistance: '저항',
            noRefine: '정제 없음', priceUnknown: '시세 정보 없음', priceLoading: '시세 확인 중', priceFailed: '시세를 불러오지 못했습니다',
            noResult: '맞는 항목이 없습니다.', pick: '광물을 고르면 캐는 곳이 나옵니다.', pickLocation: '장소를 고르면 나오는 광물이 나옵니다.',
            whereTitle: '{name} — 캐는 곳', place: '장소', rock: '암석', rockShare: '암석 비중', content: '함량', chance: '포함 확률',
            placesCount: '{count}곳', system: '성계', whatTitle: '{name} — 나오는 광물', rocksCount: '암석 {count}종',
            areaNote: '이 이름은 게임에 표시되는 이름이 아니라 내부 구분을 풀어 쓴 것입니다.',
            traits: '채광 특성', window: '최적 구간 위치', windowThinness: '최적 구간 좁기', explosion: '폭발 보정값',
            sourceGame: '광물·암석·장소: Star Citizen 게임 파일 {version}', sourcePrice: '시세: UEX 이용자 보고', sourceRef: '정제 수율 보너스: UEX 이용자 보고', sourceRefAt: '{age} 받아 옴', sourceNote: '비중·함량·확률은 게임 파일에 적힌 값이며, 게임 안에서 실측한 값이 아닙니다.',
            perScu: 'aUEC/SCU', backToList: '목록으로', unofficial: '임시 구분명',
            priceUnitNote: '시세는 SCU당 값입니다. 손 채광 광물 한 개의 판매 가격이 아닙니다.',
            detailNote: '같은 광물이 여러 줄이면 원본의 별도 구성 항목입니다. 함량·확률을 합산하지 않습니다. 암석 비중순으로 표시하며 실제 수율 순위가 아닙니다.',
            traitsVary: '암석에 따라 특성 정의가 다릅니다. 하나로 확정할 수 없는 값은 —로 표시합니다.',
            // ── 추가 화면 ──
            bySig: '신호 찾기', byRef: '정제소 찾기', harvest: '채집', salvage: '잔해 수거', activities: '할 수 있는 일',
            layout: '목록 모양', layTiles: '묶음', layTable: '표', layMatrix: '광물 × 장소',
            typeChips: '장소 종류', sysChips: '성계', chipHelp: '누를 때마다 포함 → 제외 → 상관없음으로 바뀝니다.',
            tPlanet: '행성', tMoon: '위성', tBelt: '소행성대', tLagrange: '라그랑주 지점', tCluster: '소행성 무리', tCave: '동굴', tEvent: '행사', tSite: '시설',
            type: '종류', share: '주소 복사', csv: 'CSV 내려받기', copyTable: '표 복사', tableCopied: '표를 복사했습니다. 표 계산 프로그램에 붙여 넣을 수 있습니다.',
            tableCopyFailed: '표를 복사하지 못했습니다.', csvDone: 'CSV 파일을 만들었습니다. 내려받기가 시작되지 않으면 "표 복사"를 써 주세요.',
            usedBy: '게임 안 장소', sharedNote: '이 목록은 위 장소들이 함께 씁니다. 장소마다 따로 정해진 값이 아니며, 목록 이름은 우리가 붙인 것입니다.',
            unplacedGroup: '쓰는 곳을 찾지 못한 목록', unplacedNote: '게임 파일 안에서 이 목록을 쓰는 실제 장소를 찾지 못했습니다. 갈 수 있는 장소가 아닐 수 있습니다.',
            sitesGroup: '행사·동굴·시설 목록', sitesToggle: '행사·동굴·시설 목록 보기 ({count})', sitesHide: '행사·동굴·시설 목록 숨기기',
            siteNote: '행사·시험용이거나 고정 자리 목록입니다. 지금 게임에서 열려 있는지는 게임 파일로 알 수 없습니다.',
            caveNote: '이 목록이 실제로 어느 동굴·시설에 쓰이는지는 확인하지 못했습니다. 내부 이름만 있습니다.',
            noName: '이름 없음 (내부 이름)', maybeOff: '지금 없을 수 있음',
            sig: '신호 값 (1개)', clusterSize: '한 무리 개수', groupWeight: '묶음 가중치 {value}', countUnit: '{value}개',
            unresolved: '어떤 암석인지 게임 파일에 비어 있는 항목: {list}',
            slotTitle: '고정 자리', slotName: '자리', slotChance: '자리 확률 (파일 값)', slotItems: '나오는 것 · 가중치 (파일 값)', slotDeep: '깊은 곳 {value}',
            also: '암석·식물 줄이 똑같은 다른 목록: {list}',
            harvestTitle: '채집할 수 있는 식물', plant: '이름', gives: '얻는 것', notPlant: '식물 아님', slotChanceShort: '열매 자리 확률 (파일 값)',
            salvageTitle: '잔해', salvageNote: '잔해 하나에서 나오는 자재 양은 게임 자료에 없습니다.',
            sFresh: '통째 잔해', sPoor: '부품 잔해 (낮음)', sNormal: '부품 잔해 (보통)', sElite: '부품 잔해 (높음)', salvageKind: '종류',
            wShip: '함선 잔해', wDebrisS: '부품 조각 (소)', wDebrisM: '부품 조각 (중)', wDebrisXl: '부품 조각 (특대)', wScrap: '고철 더미',
            qualityTitle: '품질 분포 (게임 파일 값)', qMin: '최소', qMax: '최대', qMean: '평균값', qDev: '표준편차', qSystem: '{system} 전용 값', qDefault: '기본 값',
            qualityNote: '품질이 이 숫자들에서 어떻게 정해지는지는 게임 자료에 없습니다. 그래서 범위를 따로 계산하지 않고 파일에 적힌 값만 그대로 보여 줍니다(평균값이 최소보다 낮게 적힌 것도 그대로입니다).',
            areasTitle: '지형별 보정값 (뜻 미확인)', areasNote: '이 숫자가 배수인지 켜고 끄는 값인지 확인하지 못했습니다. 파일 값만 적습니다.', areaName: '지형 (내부 이름을 옮긴 말)', areaGlobal: '전체 값', areaMods: '항목별 값',
            specialTitle: '희귀 암석과 행사 전용 암석', specialNote: '등급은 게임 파일 내부 이름에서 읽은 것입니다. 행사·시설 전용 암석은 지금 게임에 없을 수 있습니다.',
            tier: '등급', tierCommon: '흔함', tierUncommon: '드묾', tierRare: '희귀', tierEpic: '매우 희귀', tierLegendary: '전설', siteOnly: '행사·시설 전용', where: '나오는 곳',
            tableRocks: '암석 종류', tableMinerals: '광물 종류', tablePlants: '식물', tableSalvage: '잔해 묶음', tableSig: '함선 암석 신호 값',
            matrixNote: '칸의 글자: 함 = 함선 채광, 차 = 지상 차량 채광, 손 = 손 채광, 채 = 채집. 빈칸은 게임 파일에 없다는 뜻입니다.', mShip: '함', mVehicle: '차', mHand: '손', mHarvest: '채',
            resource: '자원',
            sigIntro: '스캐너에 뜬 숫자를 적으면, 게임 파일의 암석 신호 값과 무리 개수로 가능한 후보를 모두 보여 줍니다.',
            sigUnverified: '확인 전: "스캐너 숫자 = 암석 하나의 신호 값 × 무리의 암석 수"라는 규칙은 게임 파일에 적혀 있지 않습니다. 게임 안에서 확인이 필요한 추정입니다.',
            sigShared: '손 채광 암석은 모두 3,000, 지상 차량 채광 암석은 모두 4,000이라 숫자만으로는 어떤 광물인지 가릴 수 없습니다. 함선 채광 암석만 광물마다 값이 다릅니다. 지표와 소행성의 같은 광물도 값이 같습니다.',
            sigValue: '스캐너 숫자', sigHow: '찾는 방법', sigExact: '정확히', sigApprox: '비슷한 값', sigRange: '범위', sigTol: '오차 (±)', sigTo: '범위 끝',
            sigPlaceholder: '예: 7170', sigEmpty: '숫자를 적으면 후보가 나옵니다.', sigNone: '게임 파일의 신호 값에 1~{max}개를 곱해서는 이 숫자가 나오지 않습니다.', sigNoneListed: '게임 파일에 적힌 무리 개수와 맞는 후보는 없습니다. 아래 참고 후보를 보세요.',
            sigOne: '암석 하나(× 1)는 언제나 후보에 넣습니다. 무리로 뭉칠 확률(파일 값)이 100이 아닌 암석이 있고, 그 값의 단위도 확인되지 않았기 때문입니다.',
            sigFound: '후보 {count}개', sigMore: '후보가 많아 {shown}개만 보여 줍니다. 범위를 좁혀 주세요.',
            sigCalc: '1개 값 × 개수', sigKind: '종류', sigNames: '후보', sigOtherTitle: '무리 개수에 없는 경우 ({count})',
            sigOtherNote: '게임 파일에 적힌 "한 무리 개수"에는 없는 개수입니다. 참고로만 보세요.',
            sigChart: '신호 값 그림', sigChartBase: '암석 하나의 기본 신호 값 (개수 1)', sigChartNear: '입력한 값 근처에서 나올 수 있는 값',
            sigLegend: '굵은 선 = 입력한 값 · 밝은 선 = 맞는 후보 · 흐린 선 = 근처의 다른 값', sigLane: '{name}: {count}개 표시',
            refIntro: '정제 수율과 정제 시간의 실제 숫자는 게임 파일에 없습니다. 아래 보너스는 UEX 이용자들이 보고한 값(%)이며, 정제소 목록의 바탕은 게임 파일의 별 지도 정제 시설 표시입니다.',
            refGameNote: '게임 파일의 표시는 별 지도의 시설 꼬리표일 뿐, 정제 창구가 실제로 열려 있다는 보장은 아닙니다. UEX에도 있는 곳이 더 확실합니다.',
            refAgeNote: '칸마다 보고가 얼마나 오래됐는지 함께 적습니다. 수율 보너스 보고는 몇 주 전 것이 많습니다(가격이 아니므로 3일 기준으로 걸러 내지 않습니다).',
            refOres: '광물 고르기', refClear: '모두 해제', refLoading: 'UEX 정제 보고를 받는 중입니다…', refRetry: '다시 받기', refEmpty: 'UEX 정제 보고가 없습니다.',
            refinery: '정제소', refCheck: '확인', refBoth: '게임 파일 · UEX 모두', refGameOnly: '게임 파일에만 있음', refUexOnly: 'UEX에만 있음',
            refAvg: '고른 광물 평균', refBestTitle: '고른 광물에 가장 좋은 정제소', refBest: '{name} — 평균 {value} ({known}/{total}개 광물 보고)',
            refBestNone: '고른 광물의 보고가 있는 정제소가 없습니다.', refBestNote: '추정: 고른 광물의 보너스를 단순 평균한 값입니다. 광물마다 양이 같다고 가정하며, 보고가 없는 광물은 빼고 계산합니다. 보고가 모두 있는 정제소를 먼저 놓습니다.',
            refPick: '광물을 고르면 그 광물에 가장 좋은 정제소를 찾아 줍니다.', refMethods: '정제 방식 등급 (UEX)', refMethod: '방식', refYield: '수율', refCost: '비용', refSpeed: '속도',
            refMethodNote: '등급은 UEX의 1~3 표기이며 실제 배율이 아닙니다. 어느 쪽 숫자가 좋은지는 UEX가 밝히지 않았습니다. 방식 이름은 UEX 영어 표기입니다.',
            refNoReport: '{name}: UEX에 정제 수율 보고가 없는 광물입니다. 그래서 가장 좋은 정제소를 고를 수 없습니다. 아래에서 다른 광물을 고를 수 있습니다.',
            refNoNames: 'UEX 정제소 이름 목록을 받지 못했습니다. 수율 보고가 어느 정제소 것인지 맞출 수 없어 게임 파일의 정제소 목록만 보여 줍니다.', refUnchecked: 'UEX 확인 못 함',
            refFind: '정제소 찾기', refNameMatch: '게임 파일과 UEX의 정제소는 이름으로 맞춘 것입니다.', refTerminal: '정제소 #{id}',
            marketBest: '최근 보고 최고 판매가 ({days}일 이내)', marketNone: '{days}일 이내 보고 없음', marketLink: '시세 화면에서 보기', marketLoading: '확인 중', marketFailed: '최근 보고를 받지 못했습니다',
            avgNote: 'UEX 평균 판매 시세는 여러 거래소 보고의 평균이라 보고 시각이 따로 없습니다. 그래서 보고 시각이 있는 "최근 보고 최고 판매가"를 함께 적습니다.',
            priceAvg: 'UEX 평균 판매 시세', ageLabel: '가격 보고 기준', ageOption: '{n}일 이내 보고만', priceRetry: '시세 다시 받기',
            shareOf: '비중', sameRows: '× {count}종', rocksUnknown: '암석 종류: 게임 자료에 없음', qPlace: '{place} 전용 값', slotInternal: '내부 이름 {name}',
            unknownGame: '게임 자료에 없음', unknownUex: '보고 없음',
        },
        en: {
            loading: 'Loading mining data…', loadError: 'Mining data could not be loaded.', retry: 'Retry',
            byMineral: 'By mineral', byLocation: 'By location', views: 'View', search: 'Search minerals or locations', searchLabel: 'Search',
            modeAll: 'All', ship: 'Ship mining', vehicle: 'Ground vehicle mining', hand: 'Hand mining', modes: 'Mining method',
            mineral: 'Mineral', method: 'Method', refined: 'Refines to', price: 'UEX sell price', instability: 'Instability', resistance: 'Resistance',
            noRefine: 'Not refined', priceUnknown: 'No price data', priceLoading: 'Checking price', priceFailed: 'Prices could not be loaded',
            noResult: 'Nothing matches.', pick: 'Pick a mineral to see where it is mined.', pickLocation: 'Pick a location to see its minerals.',
            whereTitle: '{name} — where to mine', place: 'Location', rock: 'Rock', rockShare: 'Rock share', content: 'Content', chance: 'Chance',
            placesCount: '{count} locations', system: 'System', whatTitle: '{name} — minerals found', rocksCount: '{count} rock types',
            areaNote: 'This name is not shown in game; it spells out an internal label.',
            traits: 'Mining traits', window: 'Optimal window position', windowThinness: 'Optimal window thinness', explosion: 'Explosion modifier',
            sourceGame: 'Minerals, rocks and locations: Star Citizen game files {version}', sourcePrice: 'Prices: UEX player reports', sourceRef: 'Refining yield bonuses: UEX player reports', sourceRefAt: 'fetched {age}', sourceNote: 'Shares, content and chances are the values written in the game files, not rates measured in game.',
            perScu: 'aUEC/SCU', backToList: 'Back to list', unofficial: 'Descriptive label',
            priceUnitNote: 'Prices are per SCU, not the sale price of one hand-mined gem.',
            detailNote: 'Repeated minerals are separate entries in the source composition. Content and chances are not added together. Sorted by rock share, not measured yield.',
            traitsVary: 'Traits vary between rock definitions. Values without a single confirmed definition are shown as —.',
            bySig: 'Signature finder', byRef: 'Refinery finder', harvest: 'Harvesting', salvage: 'Salvage', activities: 'What you can do here',
            layout: 'List layout', layTiles: 'Tiles', layTable: 'Table', layMatrix: 'Mineral × location',
            typeChips: 'Location type', sysChips: 'System', chipHelp: 'Each press cycles include → exclude → any.',
            tPlanet: 'Planet', tMoon: 'Moon', tBelt: 'Asteroid belt', tLagrange: 'Lagrange point', tCluster: 'Asteroid cluster', tCave: 'Cave', tEvent: 'Event', tSite: 'Facility',
            type: 'Type', share: 'Copy link', csv: 'Download CSV', copyTable: 'Copy table', tableCopied: 'Table copied. You can paste it into a spreadsheet.',
            tableCopyFailed: 'The table could not be copied.', csvDone: 'CSV file created. If no download starts, use "Copy table".',
            usedBy: 'In-game places', sharedNote: 'The places above share this one table. The values are not set per place, and the table name is our own label.',
            unplacedGroup: 'Tables with no place found', unplacedNote: 'No real place using this table was found in the game files. It may not be a place you can go to.',
            sitesGroup: 'Event, cave and facility tables', sitesToggle: 'Show event, cave and facility tables ({count})', sitesHide: 'Hide event, cave and facility tables',
            siteNote: 'This is an event, test or fixed-slot table. The game files cannot tell whether it is active in game right now.',
            caveNote: 'Which cave or facility actually uses this table could not be resolved. Only the internal name exists.',
            noName: 'No name (internal name)', maybeOff: 'May be inactive',
            sig: 'Signature (one)', clusterSize: 'Cluster size', groupWeight: 'Group weight {value}', countUnit: '{value}',
            unresolved: 'Entries whose rock is blank in the game files: {list}',
            slotTitle: 'Fixed slots', slotName: 'Slot', slotChance: 'Slot chance (file value)', slotItems: 'What appears · weight (file value)', slotDeep: 'deep {value}',
            also: 'Other tables with identical rock and plant rows: {list}',
            harvestTitle: 'Harvestable plants', plant: 'Name', gives: 'Gives', notPlant: 'Not a plant', slotChanceShort: 'Fruit slot chance (file value)',
            salvageTitle: 'Salvage', salvageNote: 'How much material one wreck gives is not in the game files.',
            sFresh: 'Whole wrecks', sPoor: 'Part debris (low)', sNormal: 'Part debris (normal)', sElite: 'Part debris (high)', salvageKind: 'Kind',
            wShip: 'Ship wreck', wDebrisS: 'Part debris (small)', wDebrisM: 'Part debris (medium)', wDebrisXl: 'Part debris (extra large)', wScrap: 'Scrap pile',
            qualityTitle: 'Quality distribution (game file values)', qMin: 'Min', qMax: 'Max', qMean: 'Mean', qDev: 'Std dev', qSystem: '{system} only', qDefault: 'Default',
            qualityNote: 'How quality is drawn from these numbers is not in the game files. No range is calculated; the file values are shown as written (including a mean written below the minimum).',
            areasTitle: 'Terrain modifiers (meaning unverified)', areasNote: 'Whether these numbers are multipliers or on/off switches is not confirmed. Only the file values are shown.', areaName: 'Terrain (internal name)', areaGlobal: 'Global', areaMods: 'Per item',
            specialTitle: 'Rare rocks and event-only rocks', specialNote: 'Tiers are read from internal game file names. Event and facility rocks may not be in the game right now.',
            tier: 'Tier', tierCommon: 'Common', tierUncommon: 'Uncommon', tierRare: 'Rare', tierEpic: 'Epic', tierLegendary: 'Legendary', siteOnly: 'Event / facility only', where: 'Found at',
            tableRocks: 'Rock types', tableMinerals: 'Minerals', tablePlants: 'Plants', tableSalvage: 'Salvage sets', tableSig: 'Ship rock signatures',
            matrixNote: 'Cell letters: S = ship mining, V = ground vehicle mining, H = hand mining, P = plant harvesting. Blank means not in the game files.', mShip: 'S', mVehicle: 'V', mHand: 'H', mHarvest: 'P',
            resource: 'Resource',
            sigIntro: 'Type the number your scanner shows to see every candidate allowed by the rock signatures and cluster sizes in the game files.',
            sigUnverified: 'Unverified: the rule "scanner number = signature of one rock × rocks in the cluster" is not written in the game files. It is an estimate that still needs an in-game check.',
            sigShared: 'All hand-mining rocks share 3,000 and all ground-vehicle rocks share 4,000, so the number alone cannot tell those minerals apart. Only ship-mining rocks differ per mineral. Surface and asteroid versions of a mineral also share a value.',
            sigValue: 'Scanner number', sigHow: 'Match', sigExact: 'Exact', sigApprox: 'Approximate', sigRange: 'Range', sigTol: 'Tolerance (±)', sigTo: 'Range end',
            sigPlaceholder: 'e.g. 7170', sigEmpty: 'Type a number to see candidates.', sigNone: 'No game-file signature multiplied by 1 to {max} gives this number.', sigNoneListed: 'No candidate matches the cluster sizes written in the game files. See the reference candidates below.',
            sigOne: 'A single rock (× 1) is always kept as a candidate: some rocks have a clustering chance (file value) below 100, and the unit of that value is unverified.',
            sigFound: '{count} candidates', sigMore: 'Too many candidates; showing {shown}. Narrow the range.',
            sigCalc: 'One rock × count', sigKind: 'Kind', sigNames: 'Candidates', sigOtherTitle: 'Counts outside the cluster sizes ({count})',
            sigOtherNote: 'These counts are not among the cluster sizes written in the game files. For reference only.',
            sigChart: 'Signature chart', sigChartBase: 'Base signature of one rock (count 1)', sigChartNear: 'Values possible near the typed number',
            sigLegend: 'Thick line = typed value · bright line = matching candidate · faint line = other nearby value', sigLane: '{name}: {count} marks',
            refIntro: 'Real refining yield and time numbers are not in the game files. The bonuses below are values (%) reported by UEX players; the refinery list is based on the star-map refinery tag in the game files.',
            refGameNote: 'The game-file tag is only a star-map amenity label, not a guarantee that a refinery desk is open. Places that UEX also lists are more certain.',
            refAgeNote: 'Each cell shows how old the report is. Yield bonus reports are often weeks old (they are not prices, so the 3-day cut-off is not applied).',
            refOres: 'Pick minerals', refClear: 'Clear all', refLoading: 'Loading UEX refinery reports…', refRetry: 'Reload', refEmpty: 'No UEX refinery reports.',
            refinery: 'Refinery', refCheck: 'Check', refBoth: 'Game files and UEX', refGameOnly: 'Game files only', refUexOnly: 'UEX only',
            refAvg: 'Average for selection', refBestTitle: 'Best refinery for the selection', refBest: '{name} — average {value} ({known}/{total} minerals reported)',
            refBestNone: 'No refinery has a report for the selected minerals.', refBestNote: 'Estimate: a plain average of the bonuses of the selected minerals. It assumes equal amounts of each mineral and leaves out minerals with no report. Refineries with every report come first.',
            refPick: 'Pick minerals to find the best refinery for them.', refMethods: 'Refining method ratings (UEX)', refMethod: 'Method', refYield: 'Yield', refCost: 'Cost', refSpeed: 'Speed',
            refMethodNote: 'Ratings are UEX labels from 1 to 3, not real multipliers. UEX does not state which end of the scale is better.',
            refNoReport: '{name}: UEX has no refining yield reports for this mineral, so no best refinery can be picked. You can pick other minerals below.',
            refNoNames: 'The UEX refinery name list could not be loaded. Yield reports cannot be matched to refineries, so only the game-file refinery list is shown.', refUnchecked: 'Not checked with UEX',
            refFind: 'Find a refinery', refNameMatch: 'Game-file refineries and UEX refineries are matched by name.', refTerminal: 'Refinery #{id}',
            marketBest: 'Best recent sell report (within {days} d)', marketNone: 'No report within {days} d', marketLink: 'Open in Market Prices', marketLoading: 'Checking', marketFailed: 'Recent reports could not be loaded',
            avgNote: 'The UEX average sell price is an average over many shops, so it has no single report time. The "best recent sell report" shown with it carries its report time.',
            priceAvg: 'UEX average sell price', ageLabel: 'Price report cut-off', ageOption: 'Reports up to {n} d old', priceRetry: 'Reload prices',
            shareOf: 'Share', sameRows: '× {count} kinds', rocksUnknown: 'Rock types: not in the game files', qPlace: '{place} only', slotInternal: 'internal name {name}',
            unknownGame: 'Not in the game files', unknownUex: 'Not reported',
        },
    };
    const MODES = ['ship', 'vehicle', 'hand'];
    const ACTS = ['ship', 'vehicle', 'hand', 'harvest', 'salvage'];
    const VIEWS = ['mineral', 'location', 'sig', 'ref'];
    const LAYOUTS = ['tiles', 'table', 'matrix'];
    const TYPES = ['planet', 'moon', 'belt', 'lagrange', 'cluster', 'cave', 'event', 'site'];
    const SITE_TYPES = ['cave', 'event', 'site'];
    const TYPE_KEYS = { planet: 'tPlanet', moon: 'tMoon', belt: 'tBelt', lagrange: 'tLagrange', cluster: 'tCluster', cave: 'tCave', event: 'tEvent', site: 'tSite' };
    const TIER_KEYS = { common: 'tierCommon', uncommon: 'tierUncommon', rare: 'tierRare', epic: 'tierEpic', legendary: 'tierLegendary' };
    const SALVAGE_KEYS = { fresh: 'sFresh', poor: 'sPoor', normal: 'sNormal', elite: 'sElite' };
    const WRECK_KEYS = { ship: 'wShip', 'debris-s': 'wDebrisS', 'debris-m': 'wDebrisM', 'debris-xl': 'wDebrisXl', scrap: 'wScrap' };
    const SIG_MAX_COUNT = 30; // 후보로 따져 보는 가장 큰 개수 (게임 파일의 가장 큰 무리는 25개).
    const SIG_MAX_ROWS = 60;
    const AGE_CHOICES = [1, 3, 7, 15];
    // 게임 파일의 내부 영어 이름을 한국어 화면에서 풀어 적은 말 (게임에 표시되는 이름이 아니다).
    const SLOT_KO = {
        'FPS mineables': '손 채광 암석', 'Ground mineables': '지상 차량 채광 암석', 'LOOSE - MINING': '흩어진 암석', 'LOOSE - PLANTS': '흩어진 식물', Mineables: '암석',
        'Regular minerals': '일반 광물', Plants: '식물', Remains: '유해', Harvestables: '채집물', 'Minable Rare': '암석 (희귀)', 'Minable Uncommon': '암석 (드묾)', 'Minable Common': '암석 (흔함)',
        Central: '가운데', Left: '왼쪽', Right: '오른쪽', Central_Savrilium: '가운데 (사브릴륨)', Left_Savrilium: '왼쪽 (사브릴륨)', Right_Savrilium: '오른쪽 (사브릴륨)',
        'Aphorite minable': '아포라이트 암석', 'Sadaryx minable': '사다릭스 암석',
    };
    const AREA_KO = { Deserts: '사막', Trash: '쓰레기 지대', Savanna: '사바나', Acidic: '산성 지대', Polluted: '오염 지대', Coastline: '해안', Obsidian: '흑요석 지대', Snow: '눈 지대', Tundra: '툰드라', Rivers: '강', DeadSavannah: '죽은 사바나' };
    // UEX 정제 보고에만 있는 상품 (채광 광물이 아님): UEX 이름 → 게임 파일 이름 (data/trade/world.json 의 표기).
    const UEX_EXTRA_NAMES = { constructionmaterialrubble: { en: 'Construction Rubble', ko: '자재 부스러기' }, constructionmaterialsalvage: { en: 'Construction Salvage', ko: '자재 파편' } };
    // 할 수 있는 일 아이콘 (16×16, 직접 그린 단순한 선 그림).
    const ICONS = {
        ship: '<path d="M8 1.5 11 9l3 3-6-1.5L2 12l3-3z"/>',
        vehicle: '<path d="M2 6h8l3 3v2H2z"/><circle cx="5" cy="12.5" r="1.5"/><circle cx="11" cy="12.5" r="1.5"/>',
        hand: '<path d="M3 13.5 10.5 6"/><path d="M6.5 3c3.5 0 6.5 3 6.5 6.5"/>',
        harvest: '<path d="M3 13C3 6 8 3 13 3c0 6-4 10-10 10z"/><path d="M3 13l6-6"/>',
        salvage: '<path d="M2 4h5L6 7l2 2-2 3H2z"/><path d="M10 4h4v8H9l2-3-2-2z"/>',
    };
    const chipSet = (value) => (H?.chips ? H.chips(value) : { get: () => 'any', cycle: () => 'any', test: () => true, encode: () => '', decode() {}, clear() {}, set() {}, isEmpty: () => true, included: () => [], excluded: () => [], label: () => '' });
    const state = {
        data: null, error: false, view: 'mineral', query: '', mode: '', mineral: '', location: '', prices: null, priceState: 'loading',
        layout: 'tiles', typeChips: chipSet(), sysChips: chipSet(), showSites: false, notice: '',
        sig: { value: '', how: 'exact', tol: '50', to: '' },
        ref: { status: 'idle', error: null, data: null, meta: null, terminals: [], ores: new Set(), want: '', missing: '', namesFailed: false },
        priceIds: new Map(), priceError: null, market: null, marketState: 'idle', marketError: null, marketBest: null,
    };
    let root = null;
    let started = false;
    let index = null;

    const lang = () => (window.VOLT_I18N?.getLang?.() === 'en' ? 'en' : 'ko');
    const text = (key, values) => String(TEXT[lang()][key] ?? TEXT.ko[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values?.[name] ?? '');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const label = (name) => (lang() === 'ko' && name?.ko ? name.ko : name?.en || '');
    const num = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: digits }) : '—';
    // 새 화면의 숫자: 모르는 값은 0이나 —가 아니라 "게임 자료에 없음"으로 적는다.
    const known = (value, digits = 0) => (Number.isFinite(value) ? num(value, digits) : text('unknownGame'));
    const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const haystack = (name) => `${name?.ko || ''} ${name?.en || ''}`.toLowerCase();
    const icon = (act) => `<svg class="mining-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ICONS[act] || ''}</svg>`;
    const actTag = (act, compact) => `<span class="mining-tag is-${esc(act)}${compact ? ' is-compact' : ''}">${icon(act)}${compact ? `<span class="visually-hidden">${esc(text(act))}</span>` : esc(text(act))}</span>`;
    const typeLabel = (type) => text(TYPE_KEYS[type] || type);

    // 팔 때의 상품: 정제되는 광물은 정제 상품, 아니면 원석 그대로.
    function priceOf(mineral) {
        if (!state.prices) return null;
        const sold = mineral.refined || mineral;
        return state.prices.get(norm(UEX_ALIASES[sold.id] || sold.name.en)) ?? null;
    }
    function priceCell(mineral) {
        if (state.priceState === 'loading') return `<span class="mining-muted">${esc(text('priceLoading'))}</span>`;
        if (state.priceState === 'failed') return `<span class="mining-muted">${esc(text('priceFailed'))}</span>`;
        const price = priceOf(mineral);
        return price ? `<strong>${esc(num(price))}</strong> <small>${esc(text('perScu'))}</small>` : `<span class="mining-muted">${esc(text('priceUnknown'))}</span>`;
    }
    function priceText(mineral) {
        if (state.priceState === 'loading') return text('priceLoading');
        if (state.priceState === 'failed') return text('priceFailed');
        const price = priceOf(mineral);
        return price ? String(price) : text('priceUnknown');
    }

    // Preserve every composition entry; no unverified yield formula or merging.
    function sourcesOf(mineralId) {
        const rows = [];
        for (const location of state.data.locations) {
            for (const group of location.groups) {
                for (const rock of group.rocks) {
                    for (const part of rock.minerals.filter((mineral) => mineral.id === mineralId)) rows.push({ location, mode: group.mode, rock, part });
                }
            }
        }
        return rows.sort((a, b) => (b.rock.share || 0) - (a.rock.share || 0) || label(a.location.name).localeCompare(label(b.location.name)));
    }

    // ── 자료 색인 (받은 뒤 한 번) ───────────────────────────────────────────
    function clusterSizes(clusterId) {
        const out = new Set();
        for (const size of state.data.clusters?.[clusterId]?.sizes || []) {
            for (let count = size.min; count <= size.max && count <= 99; count += 1) out.add(count);
        }
        return out;
    }
    function sizeRange(clusterId) {
        const sizes = [...clusterSizes(clusterId)];
        if (!sizes.length) return text('unknownGame');
        const low = Math.min(...sizes);
        const high = Math.max(...sizes);
        return text('countUnit', { value: low === high ? num(low) : `${num(low)}–${num(high)}` });
    }
    function buildIndex() {
        const data = state.data;
        const minerals = new Map([...(data.minerals || []), ...(data.extraMinerals || [])].map((mineral) => [mineral.id, mineral]));
        const listed = new Set((data.minerals || []).map((mineral) => mineral.id));
        const places = new Map((data.places || []).map((place) => [place.id, place]));
        const rockUse = new Map();
        const thingClusters = new Map();
        const useRock = (rockId, clusterId, minerals_) => {
            const use = rockUse.get(rockId) || { clusters: new Set(), lone: false, minerals: null };
            if (clusterId) use.clusters.add(clusterId); else use.lone = true;
            if (minerals_ && !use.minerals) use.minerals = minerals_;
            rockUse.set(rockId, use);
        };
        const useThing = (id, clusterId) => {
            const use = thingClusters.get(id) || { clusters: new Set(), lone: false };
            if (clusterId) use.clusters.add(clusterId); else use.lone = true;
            thingClusters.set(id, use);
        };
        const entries = [];
        const addEntry = (source, isSite) => {
            const acts = new Set();
            const rocks = new Set();
            const mineralIds = new Set();
            const plantIds = new Set();
            for (const group of source.groups || []) {
                if (group.rocks?.length || group.unresolved?.length) acts.add(group.mode);
                for (const rock of group.rocks || []) {
                    rocks.add(rock.id);
                    useRock(rock.id, rock.cluster, rock.minerals);
                    for (const part of rock.minerals || []) mineralIds.add(part.id);
                }
            }
            for (const slot of source.slots || []) {
                for (const item of slot.items || []) {
                    if (item.rock) {
                        rocks.add(item.rock);
                        useRock(item.rock, '', null);
                        for (const mode of data.rocks?.[item.rock]?.modes || []) acts.add(mode);
                        for (const part of data.rocks?.[item.rock]?.minerals || []) mineralIds.add(part.id);
                    }
                    if (item.plant) { acts.add('harvest'); plantIds.add(item.plant); useThing(item.plant, ''); }
                }
            }
            if (source.harvest?.items?.length) {
                acts.add('harvest');
                for (const item of source.harvest.items) { plantIds.add(item.id); useThing(item.id, item.cluster); }
            }
            if (source.salvage?.length) {
                acts.add('salvage');
                for (const part of source.salvage) for (const item of data.salvageSets?.[part.set] || []) useThing(item.id, item.cluster);
            }
            const used = (source.usedBy || []).map((id) => places.get(id)).filter(Boolean);
            const systems = [...new Set([source.system, ...used.map((place) => place.system)].filter(Boolean))];
            entries.push({
                id: source.id, source, isSite, unplaced: source.unplaced === true, type: source.type || '', systems, used,
                acts: ACTS.filter((act) => acts.has(act)), rocks, mineralIds, plantIds, unknownRocks: (source.groups || []).some((group) => group.unresolved?.length > 0), unknownMinerals: false,
                hay: `${haystack(source.name)} ${String(source.id).toLowerCase()} ${used.map((place) => haystack(place.name)).join(' ')}`,
            });
        };
        for (const location of data.locations || []) addEntry(location, false);
        for (const site of data.sites || []) addEntry(site, true);
        // 이름이 없는 암석 조성(행사 전용)은 rocks 표의 조성을 쓴다.
        for (const [rockId, rock] of Object.entries(data.rocks || {})) if (rock.minerals && rockUse.has(rockId) && !rockUse.get(rockId).minerals) rockUse.get(rockId).minerals = rock.minerals;

        // 고정 자리의 암석은 조성이 다른 목록에 적혀 있을 수 있어, 모든 목록을 읽은 뒤에 광물을 채운다. 조성을 끝내 모르면 "모름"으로 남긴다.
        for (const entry of entries) {
            if (entry.unknownRocks) entry.unknownMinerals = true;
            for (const slot of entry.source.slots || []) for (const item of slot.items || []) {
                if (!item.rock) continue;
                const parts = rockUse.get(item.rock)?.minerals || [];
                if (!parts.length) entry.unknownMinerals = true;
                for (const part of parts) entry.mineralIds.add(part.id);
            }
        }

        // 신호 값 후보: 같은 이름·값·방식의 암석(지표·소행성 변종)은 하나로 합친다.
        const sigItems = new Map();
        const addSig = (key, item, sizes) => {
            const kept = sigItems.get(key) || { ...item, sizes: new Set() };
            for (const size of sizes) kept.sizes.add(size);
            if (!kept.mineralId && item.mineralId) kept.mineralId = item.mineralId;
            sigItems.set(key, kept);
        };
        const sizesFor = (use) => {
            const sizes = new Set();
            for (const clusterId of use?.clusters || []) for (const size of clusterSizes(clusterId)) sizes.add(size);
            // 암석 하나(× 1)는 언제나 후보다: 무리로 뭉칠 확률이 100이 아닌 암석이 있고 그 단위도 확인되지 않았다.
            sizes.add(1);
            return sizes;
        };
        for (const [rockId, rock] of Object.entries(data.rocks || {})) {
            if (!Number.isFinite(rock.sig)) continue;
            const use = rockUse.get(rockId);
            const parts = use?.minerals || rock.minerals || [];
            const main = parts.find((part) => norm(minerals.get(part.id)?.name?.en) === norm(rock.name?.en)) || parts[0];
            const lane = (rock.modes || [])[0] || 'ship';
            addSig(`rock|${norm(rock.name?.en) || rockId}|${rock.sig}|${lane}`, { name: rock.name || { en: rockId }, sig: rock.sig, lane, tier: rock.tier || '', mineralId: main && listed.has(main.id) ? main.id : '' }, sizesFor(use));
        }
        for (const [id, plant] of Object.entries(data.harvestables || {})) {
            if (Number.isFinite(plant.sig)) addSig(`plant|${id}`, { name: plant.name || { en: id }, sig: plant.sig, lane: 'harvest', tier: '', mineralId: '' }, sizesFor(thingClusters.get(id)));
        }
        for (const [id, wreck] of Object.entries(data.wrecks || {})) {
            if (Number.isFinite(wreck.sig)) addSig(`wreck|${norm(wreck.name?.en) || id}|${wreck.sig}`, { name: wreck.name || { en: id }, sig: wreck.sig, lane: 'salvage', tier: '', mineralId: '' }, sizesFor(thingClusters.get(id)));
        }
        index = { minerals, listed, places, entries, entryById: new Map(entries.map((entry) => [entry.id, entry])), rockUse, sigItems: [...sigItems.values()] };
    }
    const entryName = (entry) => label(entry.source.name) || entry.id;
    // 모르는 개수는 0으로 적지 않는다.
    const countText = (count, unknown) => (unknown ? (count ? `${num(count)} + ${text('unknownGame')}` : text('unknownGame')) : num(count));
    const slotLabel = (name) => (lang() === 'ko' && SLOT_KO[name]) || name;
    const areaLabel = (name) => (lang() === 'ko' && AREA_KO[name]) || name;
    const mineralName = (id) => label(index.minerals.get(id)?.name) || id;
    const rockName = (id) => label(state.data.rocks?.[id]?.name) || id;
    function mineralLink(id) {
        return index.listed.has(id) ? `<button type="button" class="mining-rowbtn" data-mining-mineral="${esc(id)}">${esc(mineralName(id))}</button>` : `<span>${esc(mineralName(id))}</span>`;
    }

    // ── 위쪽 도구 줄 ────────────────────────────────────────────────────────
    function toolbar() {
        const tab = (view, key) => `<button type="button" id="mining-view-${view}" role="tab" aria-controls="mining-list-panel" class="mining-tab${state.view === view ? ' is-active' : ''}" aria-selected="${state.view === view}" tabindex="${state.view === view ? '0' : '-1'}" data-mining-view="${view}">${esc(text(key))}</button>`;
        const chip = (mode, key) => `<button type="button" id="mining-mode-${mode || 'all'}" class="mining-chip${state.mode === mode ? ' is-active' : ''}" aria-pressed="${state.mode === mode}" data-mining-mode="${mode}">${mode ? icon(mode) : ''}${esc(text(key))}</button>`;
        const listView = state.view === 'mineral' || state.view === 'location';
        const modes = state.view === 'location' ? ACTS : MODES;
        return `<div class="mining-toolbar">
            <div class="mining-tabs" role="tablist" aria-label="${esc(text('views'))}">${tab('mineral', 'byMineral')}${tab('location', 'byLocation')}${tab('sig', 'bySig')}${tab('ref', 'byRef')}</div>
            ${listView ? `<label class="mining-search"><span class="visually-hidden">${esc(text('searchLabel'))}</span><input type="search" id="mining-search" value="${esc(state.query)}" placeholder="${esc(text('search'))}" autocomplete="off"></label>
            <div class="mining-chips" role="group" aria-label="${esc(text('modes'))}">${chip('', 'modeAll')}${modes.map((mode) => chip(mode, mode)).join('')}</div>` : ''}
        </div>${state.view === 'location' ? locationFilters() : ''}${actionBar()}`;
    }
    function triChip(kind, chips, id, name) {
        const now = chips.get(id);
        const mark = { include: '＋', exclude: '－', any: '' }[now];
        return `<button type="button" id="mining-${kind}-${esc(norm(id))}" class="mining-chip mining-tri is-${now}" data-mining-chip="${kind}" data-mining-chip-id="${esc(id)}" aria-label="${esc(`${name}: ${chips.label(now)}`)}">${mark ? `<span aria-hidden="true">${mark}</span>` : ''}${esc(name)}</button>`;
    }
    function locationFilters() {
        const systems = [...new Set(index.entries.flatMap((entry) => entry.systems))];
        const lay = (id, key) => `<button type="button" id="mining-lay-${id}" class="mining-chip${state.layout === id ? ' is-active' : ''}" aria-pressed="${state.layout === id}" data-mining-layout="${id}">${esc(text(key))}</button>`;
        return `<div class="mining-filters">
            <div class="mining-filter"><span class="mining-filter-name">${esc(text('layout'))}</span><div class="mining-chips" role="group" aria-label="${esc(text('layout'))}">${lay('tiles', 'layTiles')}${lay('table', 'layTable')}${lay('matrix', 'layMatrix')}</div></div>
            <div class="mining-filter"><span class="mining-filter-name">${esc(text('typeChips'))}</span><div class="mining-chips" role="group" aria-label="${esc(text('typeChips'))}">${TYPES.map((type) => triChip('type', state.typeChips, type, typeLabel(type))).join('')}</div></div>
            <div class="mining-filter"><span class="mining-filter-name">${esc(text('sysChips'))}</span><div class="mining-chips" role="group" aria-label="${esc(text('sysChips'))}">${systems.map((system) => triChip('sys', state.sysChips, system, system)).join('')}</div></div>
            <p class="mining-note">${esc(text('chipHelp'))}</p>
        </div>`;
    }
    function hasTable() {
        if (state.view === 'location') return state.layout !== 'tiles';
        if (state.view === 'ref') return true;
        if (state.view === 'sig') return sigQuery() !== null;
        return true;
    }
    function actionBar() {
        const table = hasTable();
        return `<div class="mining-actions">
            <button type="button" id="mining-share" class="mining-action" data-mining-action="share">${esc(text('share'))}</button>
            ${table ? `<button type="button" id="mining-csv" class="mining-action" data-mining-action="csv">${esc(text('csv'))}</button>
            <button type="button" id="mining-copy" class="mining-action" data-mining-action="copy">${esc(text('copyTable'))}</button>` : ''}
            <span class="mining-notice" role="status">${esc(state.notice)}</span>
        </div>`;
    }

    // ── 광물별 ──────────────────────────────────────────────────────────────
    function mineralList() {
        const query = state.query.trim().toLowerCase();
        const list = state.data.minerals.filter((mineral) => (!state.mode || mineral.modes.includes(state.mode))
            && (!query || haystack(mineral.name).includes(query) || haystack(mineral.refined?.name).includes(query)));
        if (!list.length) return `<p class="mining-empty">${esc(text('noResult'))}</p>`;
        const sorted = [...list].sort((a, b) => (priceOf(b) || 0) - (priceOf(a) || 0) || label(a.name).localeCompare(label(b.name)));
        const days = num(maxAgeDays(), 1);
        return `${priceTools()}<p class="mining-note">${esc(text('priceUnitNote'))} ${esc(text('avgNote'))}</p><div class="mining-tablewrap"><table class="mining-table" data-mining-csv="minerals">
            <thead><tr><th scope="col">${esc(text('mineral'))}</th><th scope="col">${esc(text('method'))}</th><th scope="col">${esc(text('refined'))}</th><th scope="col" class="is-num mining-price-column" data-csv="${esc(text('priceAvg'))}">${esc(text('priceAvg'))}<small class="mining-recent">${esc(text('marketBest', { days }))}</small></th><th scope="col" class="mining-csv-only">${esc(text('marketBest', { days }))}</th><th scope="col" class="is-num">${esc(text('instability'))}</th><th scope="col" class="is-num">${esc(text('resistance'))}</th></tr></thead>
            <tbody>${sorted.map((mineral) => `<tr class="${state.mineral === mineral.id ? 'is-selected' : ''}">
                <th scope="row" data-csv="${esc(label(mineral.name))}"><button type="button" class="mining-rowbtn" data-mining-mineral="${esc(mineral.id)}" aria-pressed="${state.mineral === mineral.id}">${esc(label(mineral.name))}</button><span class="mining-mobile-price"><span>${esc(text('priceAvg'))}</span>${priceCell(mineral)}</span><span class="mining-mobile-price"><span>${esc(text('marketBest', { days }))}</span>${recentCell(mineral)}</span></th>
                <td data-csv="${esc(mineral.modes.map((mode) => text(mode)).join(' / '))}">${mineral.modes.map((mode) => actTag(mode)).join(' ')}</td>
                <td>${mineral.refined ? esc(label(mineral.refined.name)) : `<span class="mining-muted">${esc(text('noRefine'))}</span>`}</td>
                <td class="is-num mining-price-column" data-csv="${esc(priceText(mineral))}">${priceCell(mineral)}${recentState(mineral) === 'unlisted' ? '' : `<span class="mining-recent">${recentCell(mineral, true)}</span>`}</td>
                <td class="mining-csv-only">${esc(recentText(mineral))}</td>
                <td class="is-num">${esc(num(mineral.instability, 1))}</td>
                <td class="is-num">${esc(num(mineral.resistance, 2))}</td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    function qualityRecords(mineralIds, systems) {
        const quality = state.data.quality || {};
        const rows = new Map();
        for (const id of mineralIds) {
            const ref = index.minerals.get(id)?.quality;
            if (!ref?.dist || !quality.dists?.[ref.dist]) continue;
            const add = (key, record, tag) => {
                const row = rows.get(key) || { record, tag, names: [] };
                row.names.push(mineralName(id));
                rows.set(key, row);
            };
            // 성계를 모르는 목록(이름 없는 시설)은 파일에 있는 전용 값을 모두 보여 준다.
            const here = (quality.overrides?.[ref.over] || []).filter((item) => !systems.length || systems.includes(item.system));
            const overrides = here.filter((item) => !item.place);
            const coveredAll = systems.length > 0 && systems.every((system) => overrides.some((item) => item.system === system));
            if (!coveredAll) add(`d|${ref.dist}`, quality.dists[ref.dist], text('qDefault'));
            for (const item of overrides) add(`o|${ref.over}|${item.system}`, item, text('qSystem', { system: item.system }));
            // 장소 하나에만 적용되는 값 (예: QV 브레이커 스테이션).
            for (const item of here.filter((entry) => entry.place)) add(`p|${ref.over}|${item.place}`, item, text('qPlace', { place: `${label(item.name) || item.place}${item.system ? ` (${item.system})` : ''}` }));
        }
        return [...rows.values()];
    }
    function qualityBlock(mineralIds, systems) {
        const rows = qualityRecords(mineralIds, systems);
        if (!rows.length) return '';
        return `<div class="mining-group"><h4>${esc(text('qualityTitle'))}</h4>
            <div class="mining-tablewrap" tabindex="0" role="region" aria-label="${esc(text('qualityTitle'))}"><table class="mining-table">
            <thead><tr><th scope="col">${esc(text('mineral'))}</th><th scope="col" class="is-num">${esc(text('qMin'))}</th><th scope="col" class="is-num">${esc(text('qMax'))}</th><th scope="col" class="is-num">${esc(text('qMean'))}</th><th scope="col" class="is-num">${esc(text('qDev'))}</th></tr></thead>
            <tbody>${rows.map((row) => `<tr><th scope="row">${esc([...new Set(row.names)].join(', '))} <small class="mining-muted">${esc(row.tag)}</small></th>
                <td class="is-num">${esc(known(row.record.min))}</td><td class="is-num">${esc(known(row.record.max))}</td><td class="is-num">${esc(known(row.record.mean))}</td><td class="is-num">${esc(known(row.record.stddev))}</td></tr>`).join('')}</tbody></table></div>
            <p class="mining-note">${esc(text('qualityNote'))}</p></div>`;
    }

    // 보고 시각이 있는 최근 가격 (UEX /market). 평균 시세에는 보고 시각이 없어 따로 보여 준다.
    function maxAgeDays() {
        const days = Number(window.VOLT_TRADE_ENGINE?.state?.get?.()?.maxAgeDays ?? state.ageDays);
        return Number.isFinite(days) && days > 0 ? days : (H?.DEFAULT_PRICE_AGE_DAYS || 3);
    }
    // 가격 보고 기준(며칠 전 보고까지 쓸지)은 여러 화면이 함께 쓰는 값이다.
    function setMaxAgeDays(value) {
        const days = Number(value);
        if (!Number.isFinite(days) || days <= 0) return;
        if (window.VOLT_TRADE_ENGINE?.state?.set) window.VOLT_TRADE_ENGINE.state.set({ maxAgeDays: days });
        else state.ageDays = days;
    }
    function priceTools() {
        const days = maxAgeDays();
        const choices = AGE_CHOICES.includes(days) ? AGE_CHOICES : [...AGE_CHOICES, days].sort((a, b) => a - b);
        const failed = state.priceState === 'failed' || state.marketState === 'failed';
        const error = state.priceState === 'failed' ? state.priceError : state.marketError;
        return `<div class="mining-pricebar">
            <label class="mining-field mining-age"><span>${esc(text('ageLabel'))}</span><select id="mining-age">${choices.map((choice) => `<option value="${choice}"${choice === days ? ' selected' : ''}>${esc(text('ageOption', { n: num(choice, 1) }))}</option>`).join('')}</select></label>
            ${failed ? `<div class="mining-ref-error" id="mining-price-error" role="alert"><p>${esc(H?.errorText ? H.errorText(error) : text('priceFailed'))}</p><button type="button" id="mining-price-retry" class="mining-action" data-mining-price-retry>${esc(text('priceRetry'))}</button></div>` : ''}
        </div>`;
    }
    function soldId(mineral) {
        const sold = mineral.refined || mineral;
        return state.priceIds.get(norm(UEX_ALIASES[sold.id] || sold.name.en)) || null;
    }
    // 광물마다 기준 날짜 안의 보고 가운데 가장 높은 판매가 한 줄. 보고 시각을 항상 함께 적는다.
    function recentBest(mineral) {
        const id = soldId(mineral);
        if (!id || !H || !Array.isArray(state.market)) return null;
        const days = maxAgeDays();
        const stamp = Math.floor(Date.now() / 60000);
        const kept = state.marketBest;
        if (!kept || kept.days !== days || kept.rows !== state.market || kept.stamp !== stamp) {
            const map = new Map();
            for (const row of state.market) {
                if (!(Number(row.sell) > 0) || H.ageLevel(row.at, days) !== 'ok') continue;
                const best = map.get(row.c);
                if (!best || row.sell > best.sell) map.set(row.c, row);
            }
            state.marketBest = { days, rows: state.market, stamp, map };
        }
        return state.marketBest.map.get(id) || null;
    }
    function recentState(mineral) {
        if (state.priceState === 'failed' || state.marketState === 'failed') return 'failed';
        if (state.priceState === 'loading' || state.marketState !== 'ready') return 'loading';
        if (!soldId(mineral)) return 'unlisted';
        return recentBest(mineral) ? 'ok' : 'none';
    }
    function recentText(mineral) {
        const now = recentState(mineral);
        if (now === 'ok') { const best = recentBest(mineral); return `${best.sell} (${H.age(best.at)})`; }
        return now === 'failed' ? text('marketFailed') : now === 'loading' ? text('marketLoading') : now === 'unlisted' ? text('unknownUex') : text('marketNone', { days: num(maxAgeDays(), 1) });
    }
    function recentCell(mineral, compact) {
        if (recentState(mineral) !== 'ok') return `<span class="mining-muted">${esc(recentText(mineral))}</span>`;
        const best = recentBest(mineral);
        return `<strong>${esc(num(best.sell))}</strong> <small>${compact ? '' : `${esc(text('perScu'))} · `}${esc(H.age(best.at))}</small>`;
    }
    // 상세의 최근 가격 칸은 받기 전에도 자리를 잡아 둔다 (늦게 와서 아래 내용을 밀지 않게).
    function marketLine(mineral) {
        const id = soldId(mineral);
        const link = id && H?.buildHash ? ` <a class="mining-link" href="${esc(H.buildHash('market', { c: id }))}">${esc(text('marketLink'))}</a>` : '';
        return `<div class="mining-market"><dt>${esc(text('marketBest', { days: num(maxAgeDays(), 1) }))}</dt><dd>${recentCell(mineral)}${link}</dd></div>`;
    }

    function mineralDetail() {
        const mineral = state.data.minerals.find((item) => item.id === state.mineral);
        if (!mineral) return `<p class="mining-hint">${esc(text('pick'))}</p>`;
        const rows = sourcesOf(mineral.id).filter((row) => !state.mode || row.mode === state.mode);
        const places = new Set(rows.filter((row) => !row.location.unplaced).map((row) => row.location.id)).size;
        const systems = [...new Set(rows.flatMap((row) => index.entryById.get(row.location.id)?.systems || []))];
        const quality = qualityBlock([mineral.id], systems);
        return `<section class="mining-detail" aria-labelledby="mining-detail-title">
            <header class="mining-detail-head"><h3 id="mining-detail-title" tabindex="-1">${esc(text('whereTitle', { name: label(mineral.name) }))}</h3><span class="mining-muted">${esc(text('placesCount', { count: places }))}</span></header>
            <p class="mining-note">${esc(text('detailNote'))}</p>${mineral.traitsVary ? `<p class="mining-note">${esc(text('traitsVary'))}</p>` : ''}
            <dl class="mining-traits" aria-label="${esc(text('traits'))}">
                <div><dt>${esc(text('instability'))}</dt><dd>${esc(num(mineral.instability, 1))}</dd></div>
                <div><dt>${esc(text('resistance'))}</dt><dd>${esc(num(mineral.resistance, 2))}</dd></div>
                <div><dt>${esc(text('window'))}</dt><dd>${esc(num(mineral.window, 2))}</dd></div>
                <div><dt>${esc(text('windowThinness'))}</dt><dd>${esc(num(mineral.windowThinness, 2))}</dd></div>
                <div><dt>${esc(text('explosion'))}</dt><dd>${esc(num(mineral.explosion, 1))}</dd></div>
                <div><dt>${esc(text('priceAvg'))}</dt><dd>${priceCell(mineral)}</dd></div>
                ${marketLine(mineral)}
            </dl>
            ${mineral.refined && mineral.modes.includes('ship') ? `<div class="mining-detail-actions"><button type="button" id="mining-refine-go" class="mining-action" data-mining-refine="${esc(mineral.id)}">${esc(text('refFind'))}</button></div>` : ''}
            ${rows.length ? `<div class="mining-tablewrap"><table class="mining-table">
                <thead><tr><th scope="col">${esc(text('place'))}</th><th scope="col">${esc(text('method'))}</th><th scope="col">${esc(text('rock'))}</th><th scope="col" class="is-num">${esc(text('rockShare'))}</th><th scope="col" class="is-num">${esc(text('content'))}</th><th scope="col" class="is-num">${esc(text('chance'))}</th><th scope="col" class="is-num">${esc(text('sig'))}</th></tr></thead>
                <tbody>${rows.map((row) => `<tr>
                    <th scope="row"><button type="button" class="mining-rowbtn" data-mining-location="${esc(row.location.id)}">${esc(label(row.location.name))}</button>${!row.location.named ? ` <small class="mining-muted">${esc(text('unofficial'))}</small>` : ''} <small class="mining-muted">${esc(row.location.system || '')}</small></th>
                    <td>${actTag(row.mode)}</td>
                    <td>${esc(label(row.rock.name) || row.rock.id)}</td>
                    <td class="is-num">${esc(num(row.rock.share, 1))}%</td>
                    <td class="is-num">${esc(num(row.part.min, 1))}–${esc(num(row.part.max, 1))}%</td>
                    <td class="is-num">${esc(num(Number.isFinite(row.part.chance) ? row.part.chance * 100 : undefined))}%</td>
                    <td class="is-num">${esc(known(state.data.rocks?.[row.rock.id]?.sig))}</td>
                </tr>`).join('')}</tbody></table></div>` : `<p class="mining-empty">${esc(text('noResult'))}</p>`}
        </section>${quality ? `<section class="mining-panel">${quality}</section>` : ''}`;
    }

    // ── 장소별 ──────────────────────────────────────────────────────────────
    function sitesShown() {
        return state.showSites || SITE_TYPES.some((type) => state.typeChips.get(type) === 'include') || index.entryById.get(state.location)?.isSite === true;
    }
    function visibleEntries() {
        const query = state.query.trim().toLowerCase();
        return index.entries.filter((entry) => (!state.mode || entry.acts.includes(state.mode))
            && state.typeChips.test([entry.type]) && state.sysChips.test(entry.systems) && (!query || entry.hay.includes(query)));
    }
    function entryTags(entry) {
        const tags = [];
        if (!entry.source.named && !entry.isSite) tags.push(text('unofficial'));
        if (entry.isSite && !entry.source.name) tags.push(text('noName'));
        if (entry.isSite || entry.unplaced) tags.push(text('maybeOff'));
        return tags;
    }
    function tile(entry) {
        const used = entry.used.map((place) => label(place.name)).join(', ');
        return `<li><button type="button" class="mining-place${state.location === entry.id ? ' is-selected' : ''}" data-mining-location="${esc(entry.id)}" aria-pressed="${state.location === entry.id}">
            <strong>${esc(entryName(entry))}</strong>${entryTags(entry).map((tag) => `<small class="mining-muted">${esc(tag)}</small>`).join('')}
            ${used ? `<small class="mining-used">${esc(text('usedBy'))}: ${esc(used)}</small>` : ''}
            <span class="mining-acts">${entry.acts.map((act) => actTag(act)).join(' ')}</span>
        </button></li>`;
    }
    function tileGroups() {
        const all = visibleEntries();
        const reachable = all.filter((entry) => !entry.isSite && !entry.unplaced);
        const unplaced = all.filter((entry) => !entry.isSite && entry.unplaced);
        const sites = all.filter((entry) => entry.isSite);
        const systems = [...new Set(reachable.map((entry) => entry.source.system || ''))];
        const group = (title, list, note) => `<section class="mining-system"><h3>${esc(title)}</h3>${note ? `<p class="mining-note">${esc(note)}</p>` : ''}<ul class="mining-places">${list.map(tile).join('')}</ul></section>`;
        const shown = sitesShown();
        const parts = systems.map((system) => group(system, reachable.filter((entry) => (entry.source.system || '') === system)));
        if (unplaced.length) parts.push(group(text('unplacedGroup'), unplaced, text('unplacedNote')));
        if (sites.length) {
            parts.push(`<div class="mining-sites-toggle"><button type="button" id="mining-sites-toggle" class="mining-action" data-mining-sites aria-expanded="${shown}">${esc(shown ? text('sitesHide') : text('sitesToggle', { count: sites.length }))}</button></div>`);
            if (shown) parts.push(group(text('sitesGroup'), sites, text('siteNote')));
        }
        if (!reachable.length && !unplaced.length && !sites.length) return `<p class="mining-empty">${esc(text('noResult'))}</p>`;
        return parts.join('') + specialBlock();
    }
    function listEntries() {
        const shown = sitesShown();
        return visibleEntries().filter((entry) => !entry.isSite || shown);
    }
    function sitesToggleRow() {
        const count = visibleEntries().filter((entry) => entry.isSite).length;
        const shown = sitesShown();
        return count ? `<div class="mining-sites-toggle"><button type="button" id="mining-sites-toggle" class="mining-action" data-mining-sites aria-expanded="${shown}">${esc(shown ? text('sitesHide') : text('sitesToggle', { count }))}</button></div>` : '';
    }
    function shipSigRange(entry) {
        const sigs = [...entry.rocks].map((id) => state.data.rocks?.[id]).filter((rock) => rock?.modes?.includes('ship') && Number.isFinite(rock.sig)).map((rock) => rock.sig);
        if (!sigs.length) return '';
        const low = Math.min(...sigs);
        const high = Math.max(...sigs);
        return low === high ? num(low) : `${num(low)}–${num(high)}`;
    }
    function locationTable() {
        const list = listEntries();
        if (!list.length) return `<p class="mining-empty">${esc(text('noResult'))}</p>${sitesToggleRow()}`;
        return `<div class="mining-tablewrap"><table class="mining-table" data-mining-csv="locations">
            <thead><tr><th scope="col">${esc(text('place'))}</th><th scope="col">${esc(text('system'))}</th><th scope="col">${esc(text('type'))}</th><th scope="col">${esc(text('activities'))}</th><th scope="col">${esc(text('usedBy'))}</th><th scope="col" class="is-num">${esc(text('tableRocks'))}</th><th scope="col" class="is-num">${esc(text('tableMinerals'))}</th><th scope="col" class="is-num">${esc(text('tablePlants'))}</th><th scope="col" class="is-num">${esc(text('tableSalvage'))}</th><th scope="col" class="is-num">${esc(text('tableSig'))}</th></tr></thead>
            <tbody>${list.map((entry) => `<tr class="${state.location === entry.id ? 'is-selected' : ''}">
                <th scope="row" data-csv="${esc([entryName(entry), ...entryTags(entry)].join(' · '))}"><button type="button" class="mining-rowbtn" data-mining-location="${esc(entry.id)}" aria-pressed="${state.location === entry.id}">${esc(entryName(entry))}</button>${entryTags(entry).map((tag) => ` <small class="mining-muted">${esc(tag)}</small>`).join('')}</th>
                <td>${esc(entry.systems.join(', '))}</td>
                <td>${esc(typeLabel(entry.type))}</td>
                <td data-csv="${esc(entry.acts.map((act) => text(act)).join(' / '))}"><span class="mining-acts">${entry.acts.map((act) => actTag(act, true)).join(' ')}</span></td>
                <td>${esc(entry.used.map((place) => label(place.name)).join(', '))}</td>
                <td class="is-num">${esc(countText(entry.rocks.size, entry.unknownRocks))}</td>
                <td class="is-num">${esc(countText(entry.mineralIds.size, entry.unknownMinerals))}</td>
                <td class="is-num">${esc(num(entry.plantIds.size))}</td>
                <td class="is-num">${esc(num((entry.source.salvage || []).length))}</td>
                <td class="is-num">${esc(shipSigRange(entry))}</td>
            </tr>`).join('')}</tbody></table></div>${sitesToggleRow()}`;
    }
    function matrix() {
        const list = listEntries();
        if (!list.length) return `<p class="mining-empty">${esc(text('noResult'))}</p>${sitesToggleRow()}`;
        const letters = { ship: text('mShip'), vehicle: text('mVehicle'), hand: text('mHand') };
        const cells = new Map();
        const mark = (resourceId, entryId, letter) => {
            const key = `${resourceId}|${entryId}`;
            const kept = cells.get(key) || [];
            if (!kept.includes(letter)) kept.push(letter);
            cells.set(key, kept);
        };
        for (const entry of list) {
            for (const group of entry.source.groups || []) for (const rock of group.rocks || []) for (const part of rock.minerals || []) mark(part.id, entry.id, letters[group.mode] || group.mode);
            for (const slot of entry.source.slots || []) for (const item of slot.items || []) {
                const rock = item.rock ? state.data.rocks?.[item.rock] : null;
                const parts = rock ? (index.rockUse.get(item.rock)?.minerals || rock.minerals || []) : [];
                for (const part of parts) mark(part.id, entry.id, letters[(rock.modes || [])[0]] || '');
            }
            for (const plantId of entry.plantIds) mark(plantId, entry.id, text('mHarvest'));
        }
        const wantMinerals = state.mode !== 'harvest' && state.mode !== 'salvage';
        const wantPlants = !state.mode || state.mode === 'harvest';
        const rows = [];
        if (wantMinerals) for (const mineral of index.minerals.values()) if (!state.mode || mineral.modes.includes(state.mode)) rows.push({ id: mineral.id, name: label(mineral.name), mineral: index.listed.has(mineral.id) });
        if (wantPlants) for (const [id, plant] of Object.entries(state.data.harvestables || {})) rows.push({ id, name: label(plant.name) || id, mineral: false });
        const used = rows.filter((row) => list.some((entry) => cells.has(`${row.id}|${entry.id}`)));
        if (!used.length) return `<p class="mining-empty">${esc(text('noResult'))}</p>${sitesToggleRow()}`;
        return `<p class="mining-note">${esc(text('matrixNote'))}</p><div class="mining-tablewrap mining-matrixwrap"><table class="mining-table mining-matrix" data-mining-csv="matrix">
            <thead><tr><th scope="col" class="mining-matrix-corner">${esc(text('resource'))}</th>${list.map((entry) => `<th scope="col" data-csv="${esc(entryName(entry))}"><button type="button" class="mining-rowbtn mining-matrix-col" data-mining-location="${esc(entry.id)}">${esc(entryName(entry))}</button></th>`).join('')}</tr></thead>
            <tbody>${used.map((row) => `<tr><th scope="row" data-csv="${esc(row.name)}">${row.mineral ? `<button type="button" class="mining-rowbtn" data-mining-mineral="${esc(row.id)}">${esc(row.name)}</button>` : esc(row.name)}</th>${list.map((entry) => {
                const found = cells.get(`${row.id}|${entry.id}`);
                return `<td class="mining-matrix-cell${found ? ' is-on' : ''}">${found ? esc(found.join('·')) : ''}</td>`;
            }).join('')}</tr>`).join('')}</tbody></table></div>${sitesToggleRow()}`;
    }
    function specialBlock() {
        const list = state.data.special || [];
        if (!list.length) return '';
        const where = (item) => [...(item.at || []), ...(item.sites || [])].map((id) => {
            const entry = index.entryById.get(id);
            return entry ? `<button type="button" class="mining-rowbtn" data-mining-location="${esc(id)}">${esc(entryName(entry))}</button>` : esc(id);
        }).join(', ');
        return `<section class="mining-system mining-special"><h3>${esc(text('specialTitle'))}</h3><p class="mining-note">${esc(text('specialNote'))}</p>
            <div class="mining-tablewrap"><table class="mining-table">
            <thead><tr><th scope="col">${esc(text('rock'))}</th><th scope="col">${esc(text('tier'))}</th><th scope="col" class="is-num">${esc(text('sig'))}</th><th scope="col">${esc(text('where'))}</th></tr></thead>
            <tbody>${list.map((item) => `<tr><th scope="row">${esc(rockName(item.rock))}</th>
                <td>${esc(item.tier ? text(TIER_KEYS[item.tier] || item.tier) : '')}${item.siteOnly ? ` <small class="mining-warn">${esc(text('siteOnly'))} · ${esc(text('maybeOff'))}</small>` : ''}</td>
                <td class="is-num">${esc(known(state.data.rocks?.[item.rock]?.sig))}</td>
                <td>${where(item)}</td></tr>`).join('')}</tbody></table></div></section>`;
    }

    function rockRows(rocks) {
        return rocks.map((rock) => `<tr>
            <th scope="row">${esc(label(rock.name) || rock.id)}</th>
            <td class="is-num">${esc(num(rock.share, 1))}%</td>
            <td class="is-num">${esc(known(state.data.rocks?.[rock.id]?.sig))}</td>
            <td class="is-num">${esc(sizeRange(rock.cluster))}</td>
            <td><ul class="mining-parts">${rock.minerals.map((part) => `<li>${mineralLink(part.id)} <small>${esc(num(part.min, 1))}–${esc(num(part.max, 1))}% · ${esc(num(Number.isFinite(part.chance) ? part.chance * 100 : undefined))}%</small></li>`).join('')}</ul></td>
        </tr>`).join('');
    }
    function slotBlock(entry) {
        const slots = entry.source.slots || [];
        if (!slots.length) return '';
        const item = (part) => {
            const name = part.rock ? rockName(part.rock) : (label(state.data.harvestables?.[part.plant]?.name) || part.plant);
            const sig = part.rock ? state.data.rocks?.[part.rock]?.sig : state.data.harvestables?.[part.plant]?.sig;
            return `<li><span>${esc(name)}</span> <small>${esc(known(part.w, 3))}${Number.isFinite(part.wDeep) ? ` · ${esc(text('slotDeep', { value: num(part.wDeep, 3) }))}` : ''} · ${esc(text('sig'))} ${esc(known(sig))}</small></li>`;
        };
        return `<div class="mining-group"><h4>${esc(text('slotTitle'))}</h4><p class="mining-note mining-warn">${esc(text('caveNote'))}</p>
            <div class="mining-tablewrap" tabindex="0" role="region" aria-label="${esc(text('slotTitle'))}"><table class="mining-table">
            <thead><tr><th scope="col">${esc(text('slotName'))}</th><th scope="col" class="is-num">${esc(text('slotChance'))}</th><th scope="col">${esc(text('slotItems'))}</th></tr></thead>
            <tbody>${slots.map((slot, order) => `<tr><th scope="row">${esc(slotLabel(slot.name) || `#${order + 1}`)}${slot.name && slotLabel(slot.name) !== slot.name ? ` <small class="mining-muted">${esc(text('slotInternal', { name: slot.name }))}</small>` : ''}</th>
                <td class="is-num">${esc(known(slot.chance, 3))}${Number.isFinite(slot.chanceDeep) ? ` <small>${esc(text('slotDeep', { value: num(slot.chanceDeep, 3) }))}</small>` : ''}</td>
                <td><ul class="mining-parts">${(slot.items || []).map(item).join('')}</ul></td></tr>`).join('')}</tbody></table></div>
            ${entry.source.also?.length ? `<p class="mining-note">${esc(text('also', { list: entry.source.also.join(', ') }))}</p>` : ''}</div>`;
    }
    function harvestBlock(entry) {
        const harvest = entry.source.harvest;
        if (!harvest?.items?.length) return '';
        return `<div class="mining-group"><h4>${actTag('harvest')} ${esc(text('harvestTitle'))} <span class="mining-muted">${esc(text('groupWeight', { value: known(harvest.weight, 4) }))}</span></h4>
            <div class="mining-tablewrap" tabindex="0" role="region" aria-label="${esc(text('harvestTitle'))}"><table class="mining-table">
            <thead><tr><th scope="col">${esc(text('plant'))}</th><th scope="col" class="is-num">${esc(text('shareOf'))}</th><th scope="col" class="is-num">${esc(text('sig'))}</th><th scope="col" class="is-num">${esc(text('clusterSize'))}</th><th scope="col">${esc(text('gives'))}</th><th scope="col" class="is-num">${esc(text('slotChanceShort'))}</th></tr></thead>
            <tbody>${harvest.items.map((item) => {
                const plant = state.data.harvestables?.[item.id] || {};
                return `<tr><th scope="row">${esc(label(plant.name) || item.id)}${plant.kind && plant.kind !== 'plant' ? ` <small class="mining-muted">${esc(text('notPlant'))}</small>` : ''}</th>
                    <td class="is-num">${esc(num(item.share, 1))}%</td>
                    <td class="is-num">${esc(known(plant.sig))}</td>
                    <td class="is-num">${esc(sizeRange(item.cluster))}</td>
                    <td>${esc((plant.gives || []).map((give) => label(give.name) || give.id).join(', ') || text('unknownGame'))}</td>
                    <td class="is-num">${esc(known(plant.slotChance, 2))}</td></tr>`;
            }).join('')}</tbody></table></div></div>`;
    }
    // 화면에 보이는 값이 모두 같은 줄(이름·종류·비중·신호 값·개수)은 한 줄로 모으고 몇 종인지 적는다. 비중은 더하지 않는다.
    function salvageRows(setId) {
        const rows = new Map();
        for (const item of state.data.salvageSets?.[setId] || []) {
            const wreck = state.data.wrecks?.[item.id] || {};
            const row = {
                name: label(wreck.name) || item.id, kind: wreck.kind ? text(WRECK_KEYS[wreck.kind] || wreck.kind) : text('unknownGame'), share: num(item.share, 2),
                sig: known(wreck.sig), size: item.cluster ? sizeRange(item.cluster) : text('countUnit', { value: num(1) }), count: 1,
            };
            const key = [row.name, row.kind, row.share, row.sig, row.size].join('|');
            if (rows.has(key)) rows.get(key).count += 1; else rows.set(key, row);
        }
        return [...rows.values()];
    }
    function salvageBlock(entry) {
        const salvage = entry.source.salvage || [];
        if (!salvage.length) return '';
        return `<div class="mining-group"><h4>${actTag('salvage')} ${esc(text('salvageTitle'))}</h4><p class="mining-note">${esc(text('salvageNote'))}</p>
            ${salvage.map((part) => `<div class="mining-tablewrap" tabindex="0" role="region" aria-label="${esc(text('salvageTitle'))}"><table class="mining-table">
            <caption>${esc(text(SALVAGE_KEYS[part.kind] || part.kind))} <span class="mining-muted">${esc(text('groupWeight', { value: known(part.weight, 5) }))}</span></caption>
            <thead><tr><th scope="col">${esc(text('plant'))}</th><th scope="col">${esc(text('salvageKind'))}</th><th scope="col" class="is-num">${esc(text('shareOf'))}</th><th scope="col" class="is-num">${esc(text('sig'))}</th><th scope="col" class="is-num">${esc(text('clusterSize'))}</th></tr></thead>
            <tbody>${salvageRows(part.set).map((row) => `<tr><th scope="row">${esc(row.name)}</th>
                    <td>${esc(row.kind)}</td>
                    <td class="is-num">${esc(row.share)}%${row.count > 1 ? ` <small class="mining-muted">${esc(text('sameRows', { count: row.count }))}</small>` : ''}</td>
                    <td class="is-num">${esc(row.sig)}</td>
                    <td class="is-num">${esc(row.size)}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>`;
    }
    function areasBlock(entry) {
        const areas = entry.source.areas || [];
        if (!areas.length) return '';
        const itemName = (id) => label(state.data.harvestables?.[id]?.name) || label(state.data.rocks?.[id]?.name) || id;
        return `<div class="mining-group"><h4>${esc(text('areasTitle'))}</h4><p class="mining-note">${esc(text('areasNote'))}</p>
            <div class="mining-tablewrap" tabindex="0" role="region" aria-label="${esc(text('areasTitle'))}"><table class="mining-table">
            <thead><tr><th scope="col">${esc(text('areaName'))}</th><th scope="col" class="is-num">${esc(text('areaGlobal'))}</th><th scope="col">${esc(text('areaMods'))}</th></tr></thead>
            <tbody>${areas.map((area) => `<tr><th scope="row">${esc(areaLabel(area.name))}${areaLabel(area.name) !== area.name ? ` <small class="mining-muted">${esc(text('slotInternal', { name: area.name }))}</small>` : ''}</th><td class="is-num">${esc(known(area.global, 2))}</td>
                <td><ul class="mining-parts">${Object.entries(area.mods || {}).map(([id, value]) => `<li><span>${esc(itemName(id))}</span> <small>${esc(known(value, 2))}</small></li>`).join('')}</ul></td></tr>`).join('')}</tbody></table></div></div>`;
    }
    function locationDetail() {
        const entry = index.entryById.get(state.location);
        if (!entry) return `<p class="mining-hint">${esc(text('pickLocation'))}</p>`;
        const location = entry.source;
        const groups = (location.groups || []).filter((group) => !state.mode || group.mode === state.mode);
        const showOther = (act) => !state.mode || state.mode === act;
        const shared = entry.used.length > 1 || entry.used.some((place) => place.system !== location.system);
        const body = `${groups.map((group) => `<div class="mining-group"><h4>${actTag(group.mode)} <span class="mining-muted">${esc(group.unresolved?.length && !group.rocks.length ? text('rocksUnknown') : text('rocksCount', { count: group.rocks.length }))} · ${esc(text('groupWeight', { value: known(group.weight, 5) }))}</span></h4>
                ${group.unresolved?.length ? `<p class="mining-note mining-warn">${esc(text('unresolved', { list: group.unresolved.join(', ') }))}</p>` : ''}
                ${group.rocks.length ? `<div class="mining-tablewrap"><table class="mining-table">
                <thead><tr><th scope="col">${esc(text('rock'))}</th><th scope="col" class="is-num">${esc(text('rockShare'))}</th><th scope="col" class="is-num">${esc(text('sig'))}</th><th scope="col" class="is-num">${esc(text('clusterSize'))}</th><th scope="col">${esc(text('mineral'))} · ${esc(text('content'))} · ${esc(text('chance'))}</th></tr></thead>
                <tbody>${rockRows(group.rocks)}</tbody></table></div>` : ''}</div>`).join('')}
            ${slotBlock(entry)}${showOther('harvest') ? harvestBlock(entry) : ''}${showOther('salvage') ? salvageBlock(entry) : ''}`;
        return `<section class="mining-detail" aria-labelledby="mining-detail-title">
            <header class="mining-detail-head"><h3 id="mining-detail-title" tabindex="-1">${esc(text('whatTitle', { name: entryName(entry) }))}</h3><span class="mining-muted">${esc([entry.systems.join(', '), entry.type ? typeLabel(entry.type) : ''].filter(Boolean).join(' · '))}</span></header>
            <div class="mining-acts" role="group" aria-label="${esc(text('activities'))}">${entry.acts.map((act) => actTag(act)).join(' ')}</div>
            ${location.kind === 'area' && !location.named ? `<p class="mining-note">${esc(text('areaNote'))}</p>` : ''}
            ${entry.isSite ? `<p class="mining-note mining-warn">${esc(text('siteNote'))}${location.unplaced ? ` ${esc(text('unplacedNote'))}` : ''}</p>` : ''}
            ${!entry.isSite && entry.unplaced ? `<p class="mining-note mining-warn">${esc(text('unplacedNote'))}</p>` : ''}
            ${entry.used.length ? `<p class="mining-note"><strong>${esc(text('usedBy'))}:</strong> ${esc(entry.used.map((place) => `${label(place.name)} (${place.system})`).join(', '))}</p>${shared ? `<p class="mining-note mining-warn">${esc(text('sharedNote'))}</p>` : ''}` : ''}
            ${body.trim() || `<p class="mining-empty">${esc(text('noResult'))}</p>`}
            ${qualityBlock([...entry.mineralIds], entry.systems)}${areasBlock(entry)}
        </section>`;
    }

    // ── 신호 찾기 ───────────────────────────────────────────────────────────
    const parseValue = (value) => {
        const parsed = Number(String(value || '').replace(/[,\s]/g, ''));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    function sigQuery() {
        const value = parseValue(state.sig.value);
        if (value === null) return null;
        if (state.sig.how === 'approx') {
            const tol = parseValue(state.sig.tol) ?? 0;
            return { value, low: value - tol, high: value + tol };
        }
        if (state.sig.how === 'range') {
            const to = parseValue(state.sig.to) ?? value;
            return { value, low: Math.min(value, to), high: Math.max(value, to) };
        }
        return { value, low: value, high: value };
    }
    function sigMatches(query) {
        const groups = new Map();
        for (const item of index.sigItems) {
            for (let count = 1; count <= SIG_MAX_COUNT; count += 1) {
                const value = item.sig * count;
                if (value < query.low || value > query.high) continue;
                const listed = item.sizes.has(count);
                const key = `${value}|${item.sig}|${count}|${item.lane}|${listed}`;
                const group = groups.get(key) || { value, sig: item.sig, count, lane: item.lane, listed, items: [] };
                group.items.push(item);
                groups.set(key, group);
            }
        }
        return [...groups.values()].sort((a, b) => Math.abs(a.value - query.value) - Math.abs(b.value - query.value) || a.value - b.value || a.count - b.count);
    }
    function sigTable(rows, csv) {
        return `<div class="mining-tablewrap" tabindex="0" role="region" aria-label="${esc(text('sigNames'))}"><table class="mining-table mining-sig-table"${csv ? ' data-mining-csv="signature"' : ''}>
            <thead><tr><th scope="col" class="is-num">${esc(text('sigValue'))}</th><th scope="col" class="is-num">${esc(text('sigCalc'))}</th><th scope="col">${esc(text('sigKind'))}</th><th scope="col">${esc(text('sigNames'))}</th></tr></thead>
            <tbody>${rows.map((row) => `<tr><th scope="row" class="is-num">${esc(num(row.value))}</th>
                <td class="is-num">${esc(num(row.sig))} × ${esc(num(row.count))}</td>
                <td data-csv="${esc(text(row.lane))}">${actTag(row.lane)}</td>
                <td data-csv="${esc(row.items.map((item) => label(item.name)).join(', '))}"><ul class="mining-parts">${row.items.map((item) => `<li>${item.mineralId ? `<button type="button" class="mining-rowbtn" data-mining-mineral="${esc(item.mineralId)}">${esc(label(item.name))}</button>` : `<span>${esc(label(item.name))}</span>`}${item.tier ? ` <small>${esc(text(TIER_KEYS[item.tier] || item.tier))}</small>` : ''}</li>`).join('')}</ul></td>
            </tr>`).join('')}</tbody></table></div>`;
    }
    function sigChart(query, hits) {
        let low = 1500;
        let high = 4500;
        const marks = new Map();
        if (query) {
            const center = (query.low + query.high) / 2;
            const half = Math.max(((query.high - query.low) / 2) * 1.25, center * 0.08, 300);
            low = Math.max(0, center - half);
            high = center + half;
        }
        const x = (value) => Math.round(((value - low) / (high - low)) * 1000);
        for (const item of index.sigItems) {
            for (const count of query ? item.sizes : [1]) {
                const value = item.sig * count;
                if (value < low || value > high) continue;
                const key = `${item.lane}|${value}`;
                const mark = marks.get(key) || { lane: item.lane, value, names: [], hit: false };
                mark.names.push(`${label(item.name)} ${num(item.sig)} × ${num(count)}`);
                marks.set(key, mark);
            }
        }
        for (const row of hits) if (row.listed) { const mark = marks.get(`${row.lane}|${row.value}`); if (mark) mark.hit = true; }
        const lanes = ACTS.map((lane) => {
            const list = [...marks.values()].filter((mark) => mark.lane === lane);
            return `<div class="mining-sig-lane"><span class="mining-sig-lane-name">${icon(lane)}${esc(text(lane))}</span>
                <svg class="mining-sig-svg" viewBox="0 0 1000 20" preserveAspectRatio="none" role="img" aria-label="${esc(text('sigLane', { name: text(lane), count: list.length }))}">
                    <line class="mining-sig-base" x1="0" y1="10" x2="1000" y2="10"/>
                    ${list.map((mark) => `<line class="mining-sig-mark${mark.hit ? ' is-hit' : ''}" x1="${x(mark.value)}" y1="3" x2="${x(mark.value)}" y2="17"><title>${esc(`${num(mark.value)} — ${[...new Set(mark.names)].slice(0, 6).join(', ')}`)}</title></line>`).join('')}
                    ${query ? `<line class="mining-sig-target" x1="${x(query.value)}" y1="0" x2="${x(query.value)}" y2="20"/>` : ''}
                </svg></div>`;
        }).join('');
        return `<div class="mining-group mining-sig-chart"><h4>${esc(text('sigChart'))} <span class="mining-muted">${esc(text(query ? 'sigChartNear' : 'sigChartBase'))}</span></h4>
            ${lanes}
            <div class="mining-sig-axis" aria-hidden="true"><span>${esc(num(low))}</span><span>${esc(num((low + high) / 2))}</span><span>${esc(num(high))}</span></div>
            <p class="mining-note">${esc(text('sigLegend'))}</p></div>`;
    }
    function sigPanel() {
        const query = sigQuery();
        const how = (id, key) => `<button type="button" id="mining-sig-how-${id}" class="mining-chip${state.sig.how === id ? ' is-active' : ''}" aria-pressed="${state.sig.how === id}" data-mining-sig-how="${id}">${esc(text(key))}</button>`;
        const field = (id, key, value, placeholder) => `<label class="mining-field"><span>${esc(text(key))}</span><input type="text" inputmode="numeric" id="${id}" value="${esc(value)}" placeholder="${esc(placeholder || '')}" autocomplete="off"></label>`;
        const all = query ? sigMatches(query) : [];
        const listed = all.filter((row) => row.listed);
        const other = all.filter((row) => !row.listed);
        const shown = listed.slice(0, SIG_MAX_ROWS);
        let result;
        if (!query) result = `<p class="mining-hint">${esc(text('sigEmpty'))}</p>`;
        else if (!listed.length) result = `<p class="mining-empty" id="mining-sig-result">${esc(other.length ? text('sigNoneListed') : text('sigNone', { max: SIG_MAX_COUNT }))}</p>`;
        else result = `<p class="mining-note" id="mining-sig-result"><strong>${esc(text('sigFound', { count: listed.length }))}</strong>${listed.length > shown.length ? ` · ${esc(text('sigMore', { shown: shown.length }))}` : ''}</p>${sigTable(shown, true)}`;
        return `<section class="mining-tool" aria-labelledby="mining-sig-title">
            <h3 id="mining-sig-title" class="mining-tool-title">${esc(text('bySig'))}</h3>
            <p class="mining-note">${esc(text('sigIntro'))}</p>
            <p class="mining-note mining-warn" id="mining-sig-unverified">${esc(text('sigUnverified'))}</p>
            <p class="mining-note">${esc(text('sigShared'))}</p>
            <p class="mining-note" id="mining-sig-one">${esc(text('sigOne'))}</p>
            <div class="mining-form">
                ${field('mining-sig-value', 'sigValue', state.sig.value, text('sigPlaceholder'))}
                <div class="mining-filter"><span class="mining-filter-name">${esc(text('sigHow'))}</span><div class="mining-chips" role="group" aria-label="${esc(text('sigHow'))}">${how('exact', 'sigExact')}${how('approx', 'sigApprox')}${how('range', 'sigRange')}</div></div>
                ${state.sig.how === 'approx' ? field('mining-sig-tol', 'sigTol', state.sig.tol) : ''}
                ${state.sig.how === 'range' ? field('mining-sig-to', 'sigTo', state.sig.to) : ''}
            </div>
            ${result}
            ${other.length ? `<div class="mining-group"><h4>${esc(text('sigOtherTitle', { count: other.length }))}</h4><p class="mining-note">${esc(text('sigOtherNote'))}</p>${sigTable(other.slice(0, SIG_MAX_ROWS), false)}</div>` : ''}
            ${sigChart(query, all)}
        </section>`;
    }

    // ── 정제소 찾기 ─────────────────────────────────────────────────────────
    const stationKey = (value) => norm(String(value || '').replace(/\([^)]*\)/g, ' ').replace(/^refinement (processing|center)\s*-\s*/i, '').replace(/\bstation\b/ig, ' '));
    function refModel() {
        const data = state.ref.data || {};
        const yields = Array.isArray(data.yields) ? data.yields : [];
        const names = data.commodities && typeof data.commodities === 'object' ? data.commodities : {};
        const aliasIds = Object.fromEntries(Object.entries(UEX_ALIASES).map(([id, name]) => [norm(name), id]));
        const ores = Object.entries(names).map(([id, name]) => {
            const mineral = index.minerals.get(aliasIds[norm(name)]) || [...index.minerals.values()].find((item) => norm(item.name?.en) === norm(name))
                || [...index.minerals.values()].find((item) => item.name?.en?.includes('(') && norm(item.name.en.split('(')[0]) === norm(String(name).split('(')[0]));
            return { id: Number(id), name: mineral ? label(mineral.name) : (label(UEX_EXTRA_NAMES[norm(name)]) || String(name)), mineralId: mineral?.id || '' };
        }).sort((a, b) => a.name.localeCompare(b.name));
        const terminals = new Map(state.ref.terminals.filter((row) => row && row.type === 'refinery').map((row) => [row.id, row]));
        const byTerminal = new Map();
        for (const row of yields) {
            if (!byTerminal.has(row.t)) byTerminal.set(row.t, new Map());
            byTerminal.get(row.t).set(row.c, row);
        }
        const rows = (state.data.refineries || []).map((game) => ({ game, terminalId: null }));
        // 정제소 이름 목록이 없으면 수율 보고를 정제소와 맞출 수 없다. 번호만 있는 줄을 만들지 않고 게임 파일 목록만 남긴다.
        const unnamed = state.ref.status === 'ready' && (state.ref.namesFailed || (terminals.size === 0 && byTerminal.size > 0));
        for (const terminalId of unnamed ? [] : new Set([...terminals.keys(), ...byTerminal.keys()])) {
            const terminal = terminals.get(terminalId);
            const keys = terminal ? [terminal.station, terminal.nick, terminal.city, terminal.name].map(stationKey).filter(Boolean) : [];
            const match = rows.find((row) => row.terminalId === null && row.game.name?.en && keys.includes(stationKey(row.game.name.en)) && (!terminal.system || terminal.system === row.game.system));
            if (match) match.terminalId = terminalId; else rows.push({ game: null, terminalId });
        }
        const selected = ores.filter((ore) => state.ref.ores.has(ore.id));
        for (const row of rows) {
            const terminal = terminals.get(row.terminalId);
            row.name = row.game ? (label(row.game.name) || row.game.id) : (terminal?.station || terminal?.city || terminal?.nick || terminal?.name || text('refTerminal', { id: row.terminalId }));
            row.system = row.game?.system || terminal?.system || '';
            row.yields = byTerminal.get(row.terminalId) || new Map();
            const values = selected.map((ore) => row.yields.get(ore.id)).filter(Boolean).map((cell) => cell.v);
            row.known = values.length;
            row.average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        }
        rows.sort((a, b) => (selected.length ? ((b.known === selected.length) - (a.known === selected.length)) || ((b.average ?? -Infinity) - (a.average ?? -Infinity)) : 0)
            || ((b.yields.size > 0) - (a.yields.size > 0)) || a.system.localeCompare(b.system) || a.name.localeCompare(b.name));
        return { ores, selected, rows, methods: Array.isArray(data.methods) ? data.methods : [], hasYields: yields.length > 0, unnamed };
    }
    const bonus = (value) => `${value > 0 ? '+' : ''}${num(value, 1)}%`;
    function refPanel() {
        const ref = state.ref;
        const model = refModel();
        const usable = !model.unnamed;
        const columns = !usable ? [] : model.selected.length ? model.selected : model.ores;
        const check = (row) => (!usable ? text('refUnchecked') : row.game && row.terminalId !== null ? text('refBoth') : row.game ? text('refGameOnly') : text('refUexOnly'));
        const retry = `<button type="button" id="mining-ref-retry" class="mining-action" data-mining-ref-retry>${esc(text('refRetry'))}</button>`;
        let status = '';
        if (ref.status === 'loading' || ref.status === 'idle') status = `<p class="mining-note" role="status">${esc(text('refLoading'))}</p>`;
        else if (ref.status === 'failed') status = `<div class="mining-ref-error" role="alert"><p>${esc(H?.errorText ? H.errorText(ref.error) : text('priceFailed'))}</p>${retry}</div>`;
        else if (!usable) status = `<div class="mining-ref-error" id="mining-ref-nonames" role="alert"><p>${esc(text('refNoNames'))}</p>${retry}</div>`;
        else if (!model.hasYields) status = `<p class="mining-note mining-warn">${esc(text('refEmpty'))}</p>`;
        let best = '';
        const missing = ref.missing && usable && ref.status === 'ready' ? `<p class="mining-note mining-warn" id="mining-ref-missing" role="status">${esc(text('refNoReport', { name: mineralName(ref.missing) }))}</p>` : '';
        if (ref.status === 'ready' && model.hasYields && usable) {
            if (!model.selected.length) best = `<p class="mining-hint" id="mining-ref-best">${esc(text('refPick'))}</p>`;
            else {
                const top = model.rows.filter((row) => row.known > 0);
                const lead = top.filter((row) => row.known === top[0].known && row.average === top[0].average).slice(0, 3);
                best = `<div class="mining-best" id="mining-ref-best"><h4>${esc(text('refBestTitle'))}</h4>${lead.length
                    ? `<ul>${lead.map((row) => `<li><strong>${esc(text('refBest', { name: row.name, value: bonus(row.average), known: row.known, total: model.selected.length }))}</strong> <small class="mining-muted">${esc(row.system)}</small></li>`).join('')}</ul>`
                    : `<p>${esc(text('refBestNone'))}</p>`}<p class="mining-note">${esc(text('refBestNote'))}</p></div>`;
            }
        }
        const oreChips = model.ores.length && usable ? `<div class="mining-filter"><span class="mining-filter-name">${esc(text('refOres'))}</span><div class="mining-chips" role="group" aria-label="${esc(text('refOres'))}">
            ${model.ores.map((ore) => `<button type="button" id="mining-ore-${ore.id}" class="mining-chip${ref.ores.has(ore.id) ? ' is-active' : ''}" aria-pressed="${ref.ores.has(ore.id)}" data-mining-ore="${ore.id}">${esc(ore.name)}</button>`).join('')}
            ${ref.ores.size ? `<button type="button" id="mining-ore-clear" class="mining-chip" data-mining-ore="clear">${esc(text('refClear'))}</button>` : ''}</div></div>` : '';
        const cell = (row, ore) => {
            const found = row.yields.get(ore.id);
            if (!found) return `<td class="is-num mining-muted" data-csv="${esc(text('unknownUex'))}">${esc(text('unknownUex'))}</td>`;
            return `<td class="is-num mining-bonus ${found.v > 0 ? 'is-plus' : found.v < 0 ? 'is-minus' : ''}" data-csv="${esc(`${bonus(found.v)} (${H ? H.age(found.at) : ''})`)}"><strong>${esc(bonus(found.v))}</strong><small>${esc(H ? H.age(found.at) : '')}</small></td>`;
        };
        const table = `<div class="mining-tablewrap" tabindex="0" role="region" aria-label="${esc(text('byRef'))}"><table class="mining-table mining-ref-table" data-mining-csv="refineries">
            <thead><tr><th scope="col">${esc(text('refinery'))}</th><th scope="col" class="mining-ref-wide">${esc(text('system'))}</th><th scope="col" class="mining-ref-wide">${esc(text('refCheck'))}</th>${model.selected.length && usable ? `<th scope="col" class="is-num">${esc(text('refAvg'))}</th>` : ''}${columns.map((ore) => `<th scope="col" class="is-num">${esc(ore.name)}</th>`).join('')}</tr></thead>
            <tbody>${model.rows.map((row) => `<tr><th scope="row" data-csv="${esc(`${row.name}${row.game && !row.game.name ? ` (${text('noName')})` : ''}`)}">${esc(row.name)}${row.game && !row.game.name ? ` <small class="mining-muted">${esc(text('noName'))}</small>` : ''}<small class="mining-ref-narrow mining-muted">${esc([row.system, check(row)].filter(Boolean).join(' · '))}</small></th>
                <td class="mining-ref-wide">${esc(row.system)}</td>
                <td class="mining-ref-wide"><span class="mining-tag ${usable && row.game && row.terminalId !== null ? 'is-both' : 'is-partial'}">${esc(check(row))}</span></td>
                ${model.selected.length && usable ? `<td class="is-num" data-csv="${esc(row.average === null ? text('unknownUex') : `${bonus(row.average)} (${row.known}/${model.selected.length})`)}">${row.average === null ? `<span class="mining-muted">${esc(text('unknownUex'))}</span>` : `<strong>${esc(bonus(row.average))}</strong> <small>${esc(`${row.known}/${model.selected.length}`)}</small>`}</td>` : ''}
                ${columns.map((ore) => cell(row, ore)).join('')}</tr>`).join('')}</tbody></table></div>`;
        const rating = (value) => (Number.isFinite(value) ? `${num(value)} / 3` : text('unknownUex'));
        const methods = model.methods.length ? `<div class="mining-group"><h4>${esc(text('refMethods'))}</h4>
            <div class="mining-tablewrap" tabindex="0" role="region" aria-label="${esc(text('refMethods'))}"><table class="mining-table mining-method-table">
            <thead><tr><th scope="col">${esc(text('refMethod'))}</th><th scope="col" class="is-num">${esc(text('refYield'))}</th><th scope="col" class="is-num">${esc(text('refCost'))}</th><th scope="col" class="is-num">${esc(text('refSpeed'))}</th></tr></thead>
            <tbody>${model.methods.map((method) => `<tr><th scope="row">${esc(method.name)}</th><td class="is-num">${esc(rating(method.yield))}</td><td class="is-num">${esc(rating(method.cost))}</td><td class="is-num">${esc(rating(method.speed))}</td></tr>`).join('')}</tbody></table></div>
            <p class="mining-note">${esc(text('refMethodNote'))}</p></div>` : '';
        return `<section class="mining-tool" aria-labelledby="mining-ref-title">
            <h3 id="mining-ref-title" class="mining-tool-title">${esc(text('byRef'))}</h3>
            <p class="mining-note mining-warn" id="mining-ref-intro">${esc(text('refIntro'))}</p>
            <p class="mining-note">${esc(text('refGameNote'))} ${esc(text('refNameMatch'))}</p>
            ${status}${missing}${oreChips}${best}
            ${usable ? `<p class="mining-note">${esc(text('refAgeNote'))}</p>` : ''}
            ${table}${usable ? methods : ''}
        </section>`;
    }
    async function loadRefineries(refresh) {
        if (!H?.uex || state.ref.status === 'loading') return;
        state.ref.status = 'loading';
        state.ref.error = null;
        draw();
        const [refineries, terminals] = await Promise.allSettled([H.uex('refineries', { refresh: refresh === true }), H.uex('terminals')]);
        if (refineries.status === 'fulfilled') {
            state.ref.data = refineries.value.data;
            state.ref.meta = refineries.value.meta;
            state.ref.terminals = terminals.status === 'fulfilled' && Array.isArray(terminals.value.data) ? terminals.value.data : [];
            state.ref.namesFailed = terminals.status !== 'fulfilled';
            state.ref.status = 'ready';
            applyWantedOre();
        } else {
            state.ref.status = 'failed';
            state.ref.error = refineries.reason;
        }
        draw();
    }
    // 광물 상세의 "정제소 찾기"에서 넘어온 광물을 UEX 광물 번호로 바꿔 고른다.
    function applyWantedOre() {
        if (!state.ref.want || state.ref.status !== 'ready') return;
        const ore = refModel().ores.find((item) => item.mineralId === state.ref.want);
        // UEX 보고가 없는 광물이면 앞서 고른 광물을 그대로 두지 않는다 (다른 광물의 답을 보여 주게 된다).
        state.ref.ores = new Set(ore ? [ore.id] : []);
        state.ref.missing = ore ? '' : state.ref.want;
        state.ref.want = '';
    }
    async function loadMarket(refresh) {
        if (!H?.uex || state.marketState !== 'idle') return;
        state.marketState = 'loading';
        try {
            const result = await H.uex('market', { refresh: refresh === true });
            state.market = Array.isArray(result.data) ? result.data : [];
            state.marketState = 'ready';
            state.marketError = null;
        } catch (error) { state.marketState = 'failed'; state.marketError = error; }
        draw();
    }

    // ── 주소 · 표 내보내기 ──────────────────────────────────────────────────
    function hashParams() {
        const params = {};
        if (state.view !== 'mineral') params.tab = state.view;
        if (state.mineral) params.m = state.mineral;
        if (state.location) params.loc = state.location;
        if (state.query) params.q = state.query;
        if (state.mode) params.mode = state.mode;
        if (state.layout !== 'tiles') params.lay = state.layout;
        if (!state.typeChips.isEmpty()) params.type = state.typeChips.encode();
        if (!state.sysChips.isEmpty()) params.sys = state.sysChips.encode();
        if (state.view === 'location' && state.showSites) params.sites = '1';
        if (state.view === 'sig' && state.sig.value) {
            params.sv = state.sig.value;
            if (state.sig.how !== 'exact') params.sm = state.sig.how;
            if (state.sig.how === 'approx') params.st = state.sig.tol;
            if (state.sig.how === 'range') params.sv2 = state.sig.to;
        }
        if (state.ref.ores.size) params.ores = [...state.ref.ores].sort((a, b) => a - b).join(',');
        return params;
    }
    const onMining = () => Boolean(H?.parseHash) && H.parseHash().section === 'mining';
    function syncHash() {
        if (state.data && onMining()) H.writeHash('mining', hashParams());
    }
    // 주소의 값으로 화면 상태를 정한다. 모르는 키와 모르는 값은 조용히 무시한다.
    function applyHash(params) {
        if (!params || !Object.keys(params).length) return false;
        state.view = VIEWS.includes(params.tab) ? params.tab : (params.loc && !params.m ? 'location' : 'mineral');
        state.mineral = params.m || '';
        state.location = params.loc || '';
        state.query = params.q || '';
        state.mode = ACTS.includes(params.mode) ? params.mode : '';
        state.layout = LAYOUTS.includes(params.lay) ? params.lay : 'tiles';
        state.typeChips.decode(params.type || '');
        state.sysChips.decode(params.sys || '');
        state.showSites = params.sites === '1';
        state.ref.missing = '';
        state.sig = { value: params.sv || '', how: ['approx', 'range'].includes(params.sm) ? params.sm : 'exact', tol: params.st || '50', to: params.sv2 || '' };
        state.ref.ores = new Set(String(params.ores || '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0));
        return true;
    }
    function validateState() {
        if (!state.data) return;
        if (state.mineral && !state.data.minerals.some((item) => item.id === state.mineral)) state.mineral = '';
        if (state.location && !index.entryById.has(state.location)) state.location = '';
        if (state.view !== 'location' && !MODES.includes(state.mode)) state.mode = '';
        for (const type of [...state.typeChips.included(), ...state.typeChips.excluded()]) if (!TYPES.includes(type)) state.typeChips.set(type, 'any');
        // 모르는 성계 값이 남으면 칩에는 보이지 않으면서 목록만 비게 된다.
        const systems = new Set(index.entries.flatMap((entry) => entry.systems));
        for (const system of [...state.sysChips.included(), ...state.sysChips.excluded()]) if (!systems.has(system)) state.sysChips.set(system, 'any');
    }
    function tableCells() {
        const table = root?.querySelector('table[data-mining-csv]');
        if (!table) return null;
        const cellText = (cell) => (cell.hasAttribute('data-csv') ? cell.getAttribute('data-csv') : cell.textContent).replace(/\s+/g, ' ').trim();
        return { name: table.getAttribute('data-mining-csv'), rows: [...table.rows].map((row) => [...row.cells].map(cellText)) };
    }
    // CSP 가 blob: 을 허용하지 않으므로 data: 주소로 내려받는다. 안 되는 브라우저를 위해 "표 복사"를 함께 둔다.
    function downloadCsv() {
        const cells = tableCells();
        if (!cells) return;
        const quote = (value) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
        const csv = cells.rows.map((row) => row.map(quote).join(',')).join('\r\n');
        const link = document.createElement('a');
        link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`;
        link.download = `volt-mining-${cells.name}.csv`;
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        state.notice = text('csvDone');
        draw();
    }
    async function copyTable() {
        const cells = tableCells();
        if (!cells) return;
        let done = false;
        try {
            await navigator.clipboard.writeText(cells.rows.map((row) => row.join('\t')).join('\n'));
            done = true;
        } catch (_error) { done = false; }
        state.notice = text(done ? 'tableCopied' : 'tableCopyFailed');
        draw();
    }
    async function copyLink() {
        const done = H?.copyShareUrl ? await H.copyShareUrl('mining', hashParams()) : false;
        state.notice = H?.text ? H.text(done ? 'copied' : 'copyFailed') : '';
        draw();
    }

    function sourcesLine() {
        // 게임 버전은 한 곳(함께 쓰는 출처 줄)에만 적는다. UEX 줄은 이 화면이 UEX에서 실제로 받는 것만 적는다.
        const game = H?.sourceLine ? H.sourceLine(state.data, null) : text('sourceGame', { version: state.data.gameVersion || state.data.version });
        let uex = '';
        if (state.view === 'mineral') uex = state.priceState === 'failed' ? text('priceFailed') : state.marketState === 'failed' ? `${text('sourcePrice')} · ${text('marketFailed')}` : text('sourcePrice');
        else if (state.view === 'ref') {
            const fetched = Date.parse(state.ref.meta?.fetchedAt || '');
            uex = state.ref.status === 'failed' ? (H?.errorText ? H.errorText(state.ref.error) : text('priceFailed'))
                : `${text('sourceRef')}${state.ref.status === 'ready' && Number.isFinite(fetched) && H?.age ? ` · ${text('sourceRefAt', { age: H.age(fetched / 1000) })}` : ''}`;
        }
        return `<p class="mining-sources">${esc(game)}${uex ? `<br>${esc(uex)}` : ''}<br>${esc(text('sourceNote'))}${state.view === 'mineral' ? `<br>${esc(text('priceUnitNote'))}` : ''}</p>`;
    }

    function draw(focusDetail) {
        if (!root) return;
        // 화면 전체를 이 한 곳에서 다시 그린다. 모든 동적 값은 esc()를 거친다.
        const focused = root.contains(document.activeElement) ? document.activeElement : null;
        const focusId = focused ? focused.id : '';
        const active = Boolean(focusId) && focused.tagName === 'INPUT';
        const caret = active ? focused.selectionStart : null;
        let html;
        if (state.error) html = `<div class="mining-status" role="alert"><p>${esc(text('loadError'))}</p><button type="button" class="btn btn-secondary" data-mining-retry>${esc(text('retry'))}</button></div>`;
        else if (!state.data) html = `<p class="mining-status" role="status">${esc(text('loading'))}</p>`;
        else {
            let list;
            let side = '';
            if (state.view === 'mineral') { list = mineralList(); side = mineralDetail(); }
            else if (state.view === 'location') { list = state.layout === 'table' ? locationTable() : state.layout === 'matrix' ? matrix() : tileGroups(); side = locationDetail(); }
            else if (state.view === 'sig') list = sigPanel();
            else list = refPanel();
            const wide = state.view === 'sig' || state.view === 'ref' || (state.view === 'location' && state.layout !== 'tiles');
            html = `${toolbar()}
            <div class="mining-columns${wide ? ' is-wide' : ''}">
                <div class="mining-list" id="mining-list-panel" role="tabpanel" aria-labelledby="mining-view-${state.view}">${list}</div>
                ${side ? `<div class="mining-side">${side}</div>` : ''}
            </div>
            ${sourcesLine()}`;
        }
        root.innerHTML = html;
        if (state.data) {
            const selected = state.data.minerals.find(item => item.id === state.mineral);
            window.VOLT_JOURNEY?.drawMiningActions?.(state.view === 'mineral' ? selected : null);
            if (state.view === 'mineral' && state.priceState === 'ready') loadMarket();
            syncHash();
        }
        if (active) { const input = document.getElementById(focusId); input?.focus(); if (caret !== null) { try { input?.setSelectionRange(caret, caret); } catch (_error) { /* 글자 위치를 못 옮기는 입력칸 */ } } }
        else if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
        if (focusDetail) document.getElementById('mining-detail-title')?.focus({ preventScroll: false });
    }

    function setView(view) {
        if (state.view !== view) state.query = '';
        state.view = view;
        if (view !== 'location' && !MODES.includes(state.mode)) state.mode = '';
        if (view !== 'ref') state.ref.missing = '';
        if (view === 'ref' && state.ref.status === 'idle') loadRefineries();
    }
    function onClick(event) {
        const target = event.target.closest('button'); if (!target || !root.contains(target)) return;
        state.notice = '';
        if (target.hasAttribute('data-mining-retry')) { state.error = false; load(); return; }
        if (target.dataset.miningView) { setView(target.dataset.miningView); draw(); return; }
        if (target.hasAttribute('data-mining-mode')) { state.mode = target.dataset.miningMode; draw(); return; }
        if (target.dataset.miningMineral) { setView('mineral'); state.mineral = target.dataset.miningMineral; window.VOLT_JOURNEY?.miningSelection?.(state.mineral, state.location); draw(true); return; }
        if (target.dataset.miningLocation) { setView('location'); state.location = target.dataset.miningLocation; window.VOLT_JOURNEY?.miningSelection?.(state.mineral, state.location); draw(true); return; }
        if (target.dataset.miningLayout) { state.layout = LAYOUTS.includes(target.dataset.miningLayout) ? target.dataset.miningLayout : 'tiles'; draw(); return; }
        if (target.dataset.miningChip) { (target.dataset.miningChip === 'type' ? state.typeChips : state.sysChips).cycle(target.dataset.miningChipId); draw(); return; }
        if (target.hasAttribute('data-mining-sites')) { state.showSites = !sitesShown(); if (!state.showSites) { for (const type of SITE_TYPES) if (state.typeChips.get(type) === 'include') state.typeChips.set(type, 'any'); if (index.entryById.get(state.location)?.isSite) state.location = ''; } draw(); return; }
        if (target.dataset.miningSigHow) { state.sig.how = target.dataset.miningSigHow; draw(); return; }
        if (target.dataset.miningOre) { const id = Number(target.dataset.miningOre); state.ref.missing = ''; if (target.dataset.miningOre === 'clear') state.ref.ores = new Set(); else if (state.ref.ores.has(id)) state.ref.ores.delete(id); else state.ref.ores.add(id); draw(); return; }
        if (target.hasAttribute('data-mining-ref-retry')) { state.ref.status = 'idle'; loadRefineries(true); return; }
        if (target.hasAttribute('data-mining-price-retry')) { state.priceState = 'loading'; state.marketState = 'idle'; loadPrices(true); return; }
        if (target.dataset.miningRefine) { state.ref.want = target.dataset.miningRefine; setView('ref'); applyWantedOre(); draw(); return; }
        if (target.dataset.miningAction === 'share') { copyLink(); return; }
        if (target.dataset.miningAction === 'csv') { downloadCsv(); return; }
        if (target.dataset.miningAction === 'copy') copyTable();
    }
    function onInput(event) {
        const id = event.target.id;
        if (id === 'mining-search') state.query = event.target.value;
        else if (id === 'mining-sig-value') state.sig.value = event.target.value;
        else if (id === 'mining-sig-tol') state.sig.tol = event.target.value;
        else if (id === 'mining-sig-to') state.sig.to = event.target.value;
        else return;
        state.notice = '';
        draw();
    }
    function onChange(event) {
        if (event.target.id !== 'mining-age') return;
        setMaxAgeDays(event.target.value);
        state.notice = '';
        draw();
    }
    // 탭 줄: 화살표·Home·End 로 옮긴다 (탭 하나만 Tab 순서에 든다).
    function onKeydown(event) {
        const tab = event.target.closest?.('[role="tab"]');
        if (!tab || !root.contains(tab)) return;
        const at = VIEWS.indexOf(tab.dataset.miningView);
        const next = { ArrowRight: (at + 1) % VIEWS.length, ArrowLeft: (at + VIEWS.length - 1) % VIEWS.length, Home: 0, End: VIEWS.length - 1 }[event.key];
        if (next === undefined || at < 0) return;
        event.preventDefault();
        state.notice = '';
        setView(VIEWS[next]);
        draw();
        document.getElementById(`mining-view-${VIEWS[next]}`)?.focus();
    }
    // 붙여 넣은 주소나 뒤로 가기로 값이 바뀌면 그 값대로 다시 그린다. 값 없는 #mining 은 지금 화면을 그대로 둔다.
    function onHashChange() {
        if (!state.data || !onMining()) return;
        if (applyHash(H.readHash('mining'))) {
            validateState();
            if (state.view === 'ref' && state.ref.status === 'idle') loadRefineries();
            draw();
        } else syncHash();
    }

    // 실패 이유(로그인·멤버·시간 초과 등)를 가려 받기 위해 함께 쓰는 UEX 도우미로 받는다.
    async function loadPrices(refresh) {
        if (refresh) draw();
        try {
            if (!H?.uex) throw new Error('no helper');
            const result = await H.uex('commodities', { refresh: refresh === true });
            const rows = Array.isArray(result.data) ? result.data : [];
            state.prices = new Map(rows.filter((row) => Number(row.price_sell) > 0).map((row) => [norm(row.name), Number(row.price_sell)]));
            state.priceIds = new Map(rows.filter((row) => Number.isInteger(Number(row.id)) && Number(row.id) > 0).map((row) => [norm(row.name), Number(row.id)]));
            state.priceState = 'ready';
            state.priceError = null;
        } catch (error) { state.prices = new Map(); state.priceIds = new Map(); state.priceState = 'failed'; state.priceError = error; }
        draw();
    }

    async function load() {
        draw();
        try {
            if (H?.loadJson) state.data = await H.loadJson(DATA_URL);
            else {
                const response = await fetch(DATA_URL, { cache: 'no-cache' });
                if (!response.ok) throw new Error(String(response.status));
                state.data = await response.json();
            }
            buildIndex();
            validateState();
        } catch (_error) { state.data = null; state.error = true; }
        if (state.data && state.view === 'ref' && state.ref.status === 'idle') loadRefineries();
        draw();
        applyPending();
        if (state.data && state.priceState === 'loading') loadPrices();
    }

    function render() {
        root = document.getElementById('mining-app');
        if (!root || started) return;
        started = true;
        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        root.addEventListener('change', onChange);
        root.addEventListener('keydown', onKeydown);
        // 다른 화면에서 가격 보고 기준을 바꾸면 이 화면의 최근 가격도 따라간다.
        window.VOLT_TRADE_ENGINE?.state?.subscribe?.(() => { if (state.data && state.view === 'mineral') draw(); });
        window.VOLT_I18N?.onChange?.(() => draw());
        if (H?.readHash) applyHash(H.readHash('mining'));
        window.addEventListener('hashchange', onHashChange);
        load();
    }

    // 다른 화면(로드아웃의 제작 재료)에서 광물을 지정해 연다. 정제 상품 id 로 와도 원광을 찾아 준다.
    function open(resourceId, locationId = '') {
        state.pending = resourceId;
        state.pendingLocation = locationId;
        applyPending();
    }
    function applyPending() {
        if ((!state.pending && !state.pendingLocation) || !state.data) return;
        const mineral = state.data.minerals.find((item) => item.id === state.pending || item.refined?.id === state.pending);
        const location = state.data.locations.find(item => item.id === state.pendingLocation);
        state.pending = ''; state.pendingLocation = '';
        if (!mineral && !location) return;
        state.view = location ? 'location' : 'mineral'; state.query = ''; state.mode = ''; state.mineral = mineral?.id || ''; state.location = location?.id || '';
        window.VOLT_JOURNEY?.miningSelection?.(state.mineral, state.location);
        draw(true);
    }

    window.VOLT_MINING = { render, open };
})();
