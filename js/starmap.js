/**
 * VOLT 성계지도 (#starmap) — 무역·임무·채광 화면에 글자로만 나오는 장소가 실제로 어디에 있는지 보여 준다.
 *
 * 자료: /data/starmap/index.json + 지금 보는 항성계 파일 하나 (게임 파일에서 뽑은 값, docs/starmap-data.md).
 *       행성 그림은 /assets/models/starmap/tex/** (docs/starmap-assets.md).
 * 3D 화면은 js/starmap-viewer.js (ES 모듈). 함대원 확인을 통과해 이 화면이 열릴 때만 import() 한다.
 * WebGL 을 못 쓰면 목록·검색·정보 칸만으로 그대로 쓸 수 있다.
 * 계약: docs/helper-tools.md, 화면 설명: docs/starmap.md.
 *
 * 주소(#starmap?...) 키 — 다른 화면이 이 주소로 보낸다.
 *   link 키:
 *     sys   = stanton | pyro | nyx        볼 항성계 (없으면 focus·route·mark 에서 찾는다)
 *     focus = <장소>                       그곳을 고르고 카메라를 옮긴다
 *     route = <장소>,<장소>,…              순서대로 잇고 번호와 구간별 실제 거리를 보여 준다
 *     mark  = <장소>,<장소>,…              그곳들을 강조한다 ("이 상품을 파는 곳", "이 광물이 나오는 곳")
 *     area  = <채광 구역 id>,…             점이 아닌 채광 구역(소행성대 등)과 그 구역이 있는 곳
 *     site  = <임무 현장 id>               missions.json locations[].id
 *   <장소> 는 게임 기록 이름(data/trade/world.json · mining · missions.places 의 id) 또는 UEX 터미널 번호(숫자).
 *   화면 자체 키: m = 거리 재기 두 곳 "a,b" · hid=1 게임 지도에 안 나오는 곳도 보기 · off = 끈 종류 · with = trade,refinery,mine,mission
 *
 * 공개: window.VOLT_STARMAP = { init, onLanguageChange, onRoute, href(params), open(params), links, debug() }
 *   links = 다른 화면의 "지도에서 보기" 링크 (docs/starmap.md 3.1). 지도에 실제로 보일 때만 링크를 준다.
 */
(function () {
    'use strict';

    const H = window.VOLT_HELPER;
    const SECTION = 'starmap';
    const SYSTEMS = ['stanton', 'pyro', 'nyx'];
    const KIND_ORDER = ['star', 'planet', 'moon', 'city', 'station', 'jump', 'lagrange', 'poi', 'outpost', 'asteroid', 'nav', 'anomaly', 'other'];
    const TOP_GROUPS = ['station', 'jump', 'lagrange', 'asteroid', 'other'];
    const FLAGS = ['trade', 'refinery', 'mine', 'mission'];
    const ASSET_QUERY = (() => { try { return new URL(document.currentScript.src).search; } catch (_error) { return ''; } })();
    const LIST_LIMIT = 40;
    let returnHash = '';
    window.addEventListener('hashchange', (event) => {
        const previous = new URL(event.oldURL).hash;
        if (!/^#starmap(?:\?|$)/.test(location.hash)) { returnHash = ''; return; }
        if (/^#(?:routes|market|missions|mining|hauling|tours|trade-planner)(?:\?|$)/.test(previous)) {
            returnHash = previous;
            if (ui.phase === 'ready' && ui.parts) drawTop();
        }
    });

    const TEXT = {
        ko: {
            loading: '성계지도 자료를 불러오는 중입니다…', retry: '다시 시도',
            back: '이전 화면으로 돌아가기', systems: '항성계 고르기', share: '이 화면 주소 복사',
            exits: '다른 항성계로 가는 길', goTo: '{name}{ro} 이동', viaGate: '{gate} 거쳐 감',
            search: '장소 찾기', searchPh: '장소 이름 (한글·영어)', searchHint: '위치 자료가 없는 곳도 찾습니다. 다른 항성계의 장소도 나옵니다.',
            results: '찾은 곳 {n}곳', resultsMore: '찾은 곳 {n}곳 중 {shown}곳', noResult: '맞는 곳이 없습니다.', searching: '찾는 중…',
            list: '장소 목록', listHint: '목록에서 고르면 지도가 그곳으로 옮겨 갑니다.',
            needs: '할 일로 거르기', need_trade: '무역', need_refinery: '정제', need_mine: '채광', need_mission: '임무',
            moreFilters: '종류로 거르기', showHidden: '게임 지도에 안 나오는 곳도 보기', kinds: '지도에 보일 종류',
            open: '{name} 펼치기', close: '{name} 접기', places: '{n}곳',
            mapLabels: '지도 이름표', labelGate: '게이트웨이', labelBelt: '소행성 지대',
            kind_star: '항성', kind_planet: '행성', kind_moon: '위성', kind_city: '정착지', kind_station: '정거장', kind_jump: '점프 포인트',
            kind_lagrange: '라그랑주 포인트', kind_poi: '관심 지점', kind_outpost: '전초기지', kind_asteroid: '소행성', kind_nav: '이동 지점', kind_anomaly: '이상현상', kind_other: '그 밖',
            group_station: '우주 정거장 · 휴게소', group_jump: '점프 포인트', group_lagrange: '라그랑주 포인트', group_asteroid: '소행성 · 채광 구역', group_other: '그 밖',
            noName: '이름 자료 없음', noPos: '위치 자료 없음', hiddenInGame: '게임 지도에는 안 나옴', guess: '추정',
            mapLabel: '{name} 항성계 지도. 장소를 고르려면 옆의 목록이나 검색을 쓰세요.',
            scaleTitle: '거리는 줄여서 그렸습니다.', scaleBody: '실제 거리는 숫자로 보여 줍니다.', scaleHow: '어떻게 그렸나요',
            scale1: '항성에서 행성·정거장·점프 포인트까지는 실제 비율 그대로입니다. 위아래 높이도 그대로입니다.',
            scale2: '천체는 실제보다 훨씬 크게 그렸습니다. 실제 크기로는 점으로도 안 보입니다.',
            scale3: '위성·궤도 정거장처럼 천체 가까이에 있는 것은 방향은 그대로 두고, 겹치지 않게 벌려 그렸습니다. 표면의 장소는 구 위에 찍었습니다.',
            scale4: '아무것도 움직이지 않습니다. 게임 파일에 궤도 운동이 없기 때문입니다. 둥근 선은 거리를 가늠하는 안내선입니다.',
            scale5: '표면 그림과 장소 표시의 동서 방향 맞춤은 추정입니다. 게임 지도는 이 그림을 계속 돌려 보여 주기 때문에 기준이 없습니다.',
            scale6: '항성계는 하나씩 따로 그립니다. 항성계끼리의 방향과 거리는 게임 자료에 없습니다.',
            scale7: '이름 끝의 * 표시는 게임에 수치가 없어 놓인 자리에서 잰 고리(추정)입니다.',
            home: '전체 보기', zoomIn: '가까이', zoomOut: '멀리', measure: '거리 재기', measureOn: '거리 재기 끄기',
            legend: '표시 설명', legendGuide: '둥근 선 = 거리 안내선 (움직이지 않음)', legendStem: '세로 선 = 궤도면에서 떨어진 높이',
            view3dLoading: '3D 지도를 준비하는 중입니다…',
            view3dNone: '이 기기에서는 3D 지도를 그릴 수 없습니다. 아래 목록과 검색으로 장소를 찾고 정보를 볼 수 있습니다.',
            view3dLost: '3D 지도가 멈췄습니다. 목록과 검색은 그대로 쓸 수 있습니다.', view3dRetry: '3D 지도 다시 열기',
            texFailed: '행성 그림 일부를 불러오지 못해 단색으로 그렸습니다.',
            infoEmpty: '지도나 목록에서 장소를 고르면 여기에 정보가 나옵니다.', infoClose: '선택 풀기', sheetOpen: '정보 펼치기', sheetClose: '정보 접기', infoTitle: '고른 장소',
            fType: '종류', fGameType: '게임 분류', fParent: '속한 곳', fBody: '있는 천체', fGeo: '표면 위치', fLaw: '관할', fAmenities: '시설',
            fFromStar: '항성에서 거리', fFromParent: '{name}에서 거리', fRadius: '반지름', fQt: '퀀텀 도착 거리', fAlt: '표면에서 높이',
            geoText: '위도 {lat}° · 경도 {lon}°', geoNote: '경도 0도 선은 이 지도가 정한 기준입니다.',
            onSurface: '표면', straight: '직선 거리',
            guessAt: '위치 자료가 게임 파일에 없습니다. 기록 이름으로 보면 {name} 근처로 추정됩니다.', noPosNote: '위치 자료가 게임 파일에 없어 지도에 찍지 않았습니다.',
            jumpUsable: '{name}{ro} 이어지는 점프 포인트입니다.', jumpClosed: '이 게임 버전에서는 쓸 수 없는 점프 포인트입니다.', jumpGuess: '목적지 추정: {name} (기록 이름에서 읽음)',
            jumpLength: '점프 구간의 길이와 걸리는 시간은 게임 자료에 없습니다.',
            links: '이 장소로 할 수 있는 일', linkMarket: '여기서 사고파는 상품 보기', linkRoutes: '여기서 출발하는 무역 경로', linkMissions: '이곳의 임무',
            linkMining: '여기서 나오는 광물', linkRefinery: '정제소 찾기에서 보기', terminalNo: '터미널 {n}',
            missionsNote: '이곳에서 나오는 임무와 이곳이 임무 장소 후보인 임무를 임무 화면에서 보여 줍니다.',
            bodyPlaces: '이 천체에 있는 곳', bodyPlacesNone: '이 천체에 딸린 장소가 자료에 없습니다.',
            mapLinkName: '{name} 지도에서 보기', mapLinkCount: '{n}곳',
            actFocus: '지도에서 보기', actMeasure: '여기서부터 거리 재기', actShare: '이 장소 주소 복사',
            otherSystem: '{name} 항성계에 있습니다.', showThere: '{name}에서 보기',
            routeTitle: '경로', routeLeg: '{a} → {b}', routeTotal: '구간 합계 {d}', routeTotalPart: '구간 합계 {d} (거리를 모르는 구간 제외)', routeTotalJump: '구간 합계 {d} (점프 구간은 빼고 더한 값)', routeClear: '경로 지우기',
            legJump: '다른 항성계로 넘어갑니다. {gate}까지 {d1}, 건너편 {exit}에서 {d2}.', legNoPos: '위치 자료 없음', legUnknown: '찾을 수 없는 장소',
            unknownPlace: '찾을 수 없는 장소 ({id})',
            markTitle: '표시한 곳 {n}곳', markHere: '이 항성계 {n}곳', markClear: '표시 지우기', markGuess: '추정 위치',
            areaTitle: '채광 구역', areaClear: '구역 지우기', areaAt: '이 구역이 있는 곳 {n}곳', areaMore: '외 {n}곳',
            areaRing: '{name} 둘레 {a} ~ {b} (게임 수치)', areaBand: '항성에서 {a} ~ {b} (게임에 수치가 없어 놓인 자리에서 잰 값, 추정)', areaNoShape: '고리 수치: 게임 자료에 없음',
            areaElsewhere: '이 구역은 {name} 항성계에 있습니다.', areaUnknown: '지도에서 찾을 수 없는 구역 ({id})',
            siteTitle: '임무 현장', siteClear: '현장 지우기', siteAt: '이 현장이 있는 곳 {n}곳', siteSpots: '따로 찍힌 지점 {n}곳', siteSpot: '임무 현장',
            siteNear: '{name} 근처 (정확한 위치 자료 없음)', siteUnknown: '지도에서 찾을 수 없는 임무 현장 ({id})',
            measureTitle: '거리 재기', measureHint: '지도나 목록에서 두 곳을 차례로 고르세요.', measurePick2: '{a} 에서부터 잽니다. 두 번째 곳을 고르세요.',
            measureSame: '같은 항성계 · 직선 거리 {d}', measureCross: '서로 다른 항성계입니다. 직선 거리는 잴 수 없습니다.', measureNoPos: '위치 자료가 없는 곳이 있어 잴 수 없습니다.',
            measureClear: '다시 재기',
            timeEstimate: '퀀텀 이동 시간 (추정): 약 {t}', timeBasis: '{ship}의 기본 퀀텀 드라이브({drive}) 기준 · 직선 거리 · 게임 안에서 재 보지 않은 값',
            timeJump: '두 번의 퀀텀 이동만 더한 값입니다. 점프에 걸리는 시간은 게임 자료에 없어 넣지 않았습니다.',
            timeNoShip: '무역 경로 화면에서 내 함선을 고르면 퀀텀 이동 시간(추정)도 보여 줍니다.', timeNoDrive: '{ship}의 퀀텀 드라이브 값이 게임 자료에 없어 시간을 추정하지 않았습니다.',
            timeSameBody: '같은 천체에 있는 두 곳이라 퀀텀 이동 시간은 계산하지 않았습니다.', timePick: '함선 고르러 가기',
            copied: '주소를 복사했습니다.', picked: '{name}{eul} 골랐습니다.',
            unplaced: '놓인 자리 없음',
            unplacedNote: '게임 파일에 이곳이 놓인 자리가 없습니다. 지금 게임에서 갈 수 있는 곳인지 확인되지 않아, 거래·정제 연결과 지도 표시를 넣지 않았습니다.',
            fArt: '표면 그림', stubNote: '게임 파일에 임시 천체로만 놓여 있어 크기를 알 수 없습니다.',
            bodyShown: '게임 지도에 나오는 곳 {n}곳',
            jumpNamed: '기록 이름에 적힌 곳: {named} · 게임 파일에서 이어진 곳: {name}',
            areaShared: '{name}{wa} 같은 광물이 나오는 곳', areaSharedNote: '이 구역의 광물 목록은 {name} 것을 함께 씁니다. 이름은 다른 항성계의 장소 이름입니다.',
            areaAlso: '같은 광물이 나오는 작은 채광 지점(광구)이 다른 곳에 {n}곳 더 있습니다. 지도에는 따로 표시하지 않았습니다.',
            areasTitle: '채광 구역 {n}곳', areasElse: '{name} 항성계에 {n}곳', sameName: '같은 이름 {n}곳',
        },
        en: {
            loading: 'Loading star map data…', retry: 'Try again',
            back: 'Return to previous screen', systems: 'Choose a star system', share: 'Copy link to this view',
            exits: 'Ways to other systems', goTo: 'Go to {name}', viaGate: 'via {gate}',
            search: 'Find a place', searchPh: 'Place name (Korean or English)', searchHint: 'Places without position data are found too, and places in other systems.',
            results: '{n} places found', resultsMore: 'Showing {shown} of {n} places', noResult: 'No place matches.', searching: 'Searching…',
            list: 'Places', listHint: 'Pick a place in the list and the map moves to it.',
            needs: 'Filter by activity', need_trade: 'Trade', need_refinery: 'Refining', need_mine: 'Mining', need_mission: 'Missions',
            moreFilters: 'Filter by type', showHidden: 'Also show places the in-game map hides', kinds: 'Types shown on the map',
            open: 'Expand {name}', close: 'Collapse {name}', places: '{n} places',
            mapLabels: 'Map labels', labelGate: 'Gateways', labelBelt: 'Asteroid belts',
            kind_star: 'Star', kind_planet: 'Planet', kind_moon: 'Moon', kind_city: 'Settlement', kind_station: 'Station', kind_jump: 'Jump point',
            kind_lagrange: 'Lagrange point', kind_poi: 'Point of interest', kind_outpost: 'Outpost', kind_asteroid: 'Asteroid', kind_nav: 'Nav point', kind_anomaly: 'Anomaly', kind_other: 'Other',
            group_station: 'Stations and rest stops', group_jump: 'Jump points', group_lagrange: 'Lagrange points', group_asteroid: 'Asteroids and mining fields', group_other: 'Other',
            noName: 'No name in the game files', noPos: 'No position data', hiddenInGame: 'Hidden on the in-game map', guess: 'Estimate',
            mapLabel: 'Map of the {name} system. Use the list or the search next to it to pick a place.',
            scaleTitle: 'Distances are not to scale.', scaleBody: 'Real distances are shown as numbers.', scaleHow: 'How this is drawn',
            scale1: 'From the star out to planets, stations and jump points the proportions are real, including height above and below the plane.',
            scale2: 'Bodies are drawn far larger than they are. At true size they would not even be a dot.',
            scale3: 'Things close to a body, such as moons and orbital stations, keep their direction but are spread out so they do not overlap. Surface places sit on the globe.',
            scale4: 'Nothing moves, because the game files hold no orbital motion. The circles are distance guides only.',
            scale5: 'How the surface picture lines up east–west with the place markers is an estimate. The in-game map keeps scrolling this picture, so there is no reference.',
            scale6: 'Each system is drawn on its own. Direction and distance between systems are not in the game files.',
            scale7: 'A * after a name marks a ring measured from where its pieces sit, because the game gives no numbers (estimate).',
            home: 'Whole system', zoomIn: 'Zoom in', zoomOut: 'Zoom out', measure: 'Measure', measureOn: 'Stop measuring',
            legend: 'Legend', legendGuide: 'Circle = distance guide (does not move)', legendStem: 'Vertical line = height off the orbital plane',
            view3dLoading: 'Preparing the 3D map…',
            view3dNone: 'This device cannot draw the 3D map. You can still find places and read their details with the list and search below.',
            view3dLost: 'The 3D map stopped. The list and search still work.', view3dRetry: 'Reopen the 3D map',
            texFailed: 'Some planet pictures could not be loaded, so those bodies are drawn in a plain colour.',
            infoEmpty: 'Pick a place on the map or in the list to see its details here.', infoClose: 'Clear selection', sheetOpen: 'Expand details', sheetClose: 'Collapse details', infoTitle: 'Selected place',
            fType: 'Type', fGameType: 'Game category', fParent: 'Belongs to', fBody: 'On body', fGeo: 'Surface position', fLaw: 'Jurisdiction', fAmenities: 'Services',
            fFromStar: 'Distance from the star', fFromParent: 'Distance from {name}', fRadius: 'Radius', fQt: 'Quantum arrival distance', fAlt: 'Height above the surface',
            geoText: 'Latitude {lat}° · longitude {lon}°', geoNote: 'The zero line of longitude is this map\'s own convention.',
            onSurface: 'Surface', straight: 'straight line',
            guessAt: 'The game files hold no position for this place. Going by its record name it is probably near {name}.', noPosNote: 'The game files hold no position for this place, so it is not placed on the map.',
            jumpUsable: 'A jump point leading to {name}.', jumpClosed: 'This jump point cannot be used in this game version.', jumpGuess: 'Probable destination: {name} (read from the record name)',
            jumpLength: 'The length and duration of the jump are not in the game files.',
            links: 'What you can do with this place', linkMarket: 'See what is bought and sold here', linkRoutes: 'Trade routes starting here', linkMissions: 'Missions here',
            linkMining: 'Minerals found here', linkRefinery: 'Open in the refinery finder', terminalNo: 'terminal {n}',
            missionsNote: 'Opens the mission screen with missions offered here and missions that list this place as a possible site.',
            bodyPlaces: 'Places at this body', bodyPlacesNone: 'The data has no places attached to this body.',
            mapLinkName: 'Show {name} on the map', mapLinkCount: '{n} places',
            actFocus: 'Show on the map', actMeasure: 'Measure from here', actShare: 'Copy link to this place',
            otherSystem: 'It is in the {name} system.', showThere: 'Show in {name}',
            routeTitle: 'Route', routeLeg: '{a} → {b}', routeTotal: 'Legs total {d}', routeTotalPart: 'Legs total {d} (legs of unknown length left out)', routeTotalJump: 'Legs total {d} (not counting the jump itself)', routeClear: 'Clear route',
            legJump: 'Crosses to another system: {d1} to {gate}, then {d2} from {exit} on the far side.', legNoPos: 'no position data', legUnknown: 'place not found',
            unknownPlace: 'Place not found ({id})',
            markTitle: '{n} places marked', markHere: '{n} in this system', markClear: 'Clear marks', markGuess: 'estimated position',
            areaTitle: 'Mining field', areaClear: 'Clear field', areaAt: 'Found at {n} places', areaMore: 'and {n} more',
            areaRing: 'Around {name}, {a} to {b} (game values)', areaBand: '{a} to {b} from the star (measured from where its pieces sit because the game gives no numbers; estimate)', areaNoShape: 'Ring size: not in the game files',
            areaElsewhere: 'This field is in the {name} system.', areaUnknown: 'Field not found on the map ({id})',
            siteTitle: 'Mission site', siteClear: 'Clear site', siteAt: 'Found at {n} places', siteSpots: '{n} separately placed points', siteSpot: 'Mission site',
            siteNear: 'Near {name} (no exact position data)', siteUnknown: 'Mission site not found on the map ({id})',
            measureTitle: 'Measure', measureHint: 'Pick two places, one after the other, on the map or in the list.', measurePick2: 'Measuring from {a}. Pick the second place.',
            measureSame: 'Same system · straight-line distance {d}', measureCross: 'These are in different systems. A straight-line distance cannot be measured.', measureNoPos: 'One of the places has no position data, so this cannot be measured.',
            measureClear: 'Measure again',
            timeEstimate: 'Quantum travel time (estimate): about {t}', timeBasis: 'Default quantum drive of {ship} ({drive}) · straight line · not timed in game',
            timeJump: 'This adds the two quantum flights only. The time the jump takes is not in the game files and is left out.',
            timeNoShip: 'Choose your ship on the Trade Routes screen to also see a quantum travel time estimate here.', timeNoDrive: 'The game files hold no quantum drive values for {ship}, so no time is estimated.',
            timeSameBody: 'Both places are at the same body, so no quantum travel time is worked out.', timePick: 'Choose a ship',
            copied: 'Link copied.', picked: '{name} selected.',
            unplaced: 'Not placed',
            unplacedNote: 'The game files do not place this station anywhere. Whether it can be visited in the current game is unconfirmed, so no trade or refining links and no map marker are shown.',
            fArt: 'Surface picture', stubNote: 'The game files only place a stand-in body here, so its size is unknown.',
            bodyShown: '{n} of them on the in-game map',
            jumpNamed: 'Named in the record: {named} · leads to, per the game files: {name}',
            areaShared: 'Same minerals as {name}', areaSharedNote: 'This field uses the mineral list of {name}. That name belongs to a place in another system.',
            areaAlso: 'The same minerals are also found at {n} small mining claims elsewhere. They are not marked on the map.',
            areasTitle: '{n} mining fields', areasElse: '{n} in the {name} system', sameName: '{n} with this name',
            places1: '1 place', results1: '1 place found', mapLinkCount1: '1 place', markTitle1: '1 place marked', areaAt1: 'Found at 1 place', siteAt1: 'Found at 1 place', siteSpots1: '1 separately placed point',
        },
    };
    const translate = H.translator(TEXT);
    // 한국어 조사: 이름의 마지막 글자 받침에 맞춘다 ({ro} = 로/으로, {eul} = 을/를). 영어 문구에는 이 자리가 없다.
    function t(key, vars) {
        if (!vars || vars.name === undefined || H.lang() !== 'ko') return translate(key, vars);
        const text = String(vars.name).replace(/\s*\[[^\]]*\]\s*$/, '');
        const code = text.charCodeAt(text.length - 1);
        const final = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : (/[lmnr]$/i.test(text) ? 4 : 0);
        return translate(key, { ...vars, ro: final && final !== 8 ? '으로' : '로', eul: final ? '을' : '를', wa: final ? '과' : '와' });
    }
    // 개수가 들어가는 문구: 영어는 하나일 때 단수 문구(<key>1)를 쓴다. 한국어는 그대로.
    function tn(key, n, vars) {
        const one = H.lang() === 'en' && Number(n) === 1 && TEXT.en[`${key}1`] ? `${key}1` : key;
        return t(one, { ...vars, n: typeof n === 'number' ? H.num(n) : n });
    }
    const esc = H.esc;

    const st = { sys: null, focus: null, route: [], mark: [], area: [], site: null, measure: [], measuring: false, hidden: false, off: [], need: [], q: '', open: new Set(), sheet: false };
    const db = { index: null, textures: null, systems: new Map(), cargo: null, cargoState: '' };
    const labelGroups = { planet: 'kind_planet', moon: 'kind_moon', gateway: 'labelGate', station: 'kind_station', belt: 'labelBelt' };
    const hiddenLabels = new Set(['belt']);
    const ui = { mount: null, parts: null, phase: 'loading', error: null, flash: '', flashTimer: 0, view: 'idle', texFailed: false, token: 0, searchTimer: 0, searchAll: false };
    let viewer = null;
    let viewerModule = null;

    // ── 자료 ──────────────────────────────────────────────────────────────
    function prepare(data) {
        const byId = new Map(data.objects.map((object) => [object.id, object]));
        const uex = new Map();
        const anchor = new Map();
        const kids = new Map();
        for (const object of data.objects) {
            for (const id of [...(object.uex || []), ...(object.uexRef || [])]) if (!uex.has(id)) uex.set(id, object.id);
            let parent = object.body && object.body !== object.id ? byId.get(object.body) : null;
            if (!parent) {
                parent = byId.get(object.parent);
                while (parent && !(parent.kind === 'planet' || parent.kind === 'moon')) parent = byId.get(parent.parent);
            }
            if (parent && parent.id !== object.id) {
                anchor.set(object.id, parent.id);
                if (!kids.has(parent.id)) kids.set(parent.id, []);
                kids.get(parent.id).push(object);
            }
        }
        const siteAt = new Set(Object.values(data.sites || {}).flatMap((site) => site.at || []));
        return { data, byId, uex, anchor, kids, siteAt, regions: new Map((data.regions || []).map((region) => [region.id, region])) };
    }
    async function ensureSystem(id) {
        if (db.systems.has(id)) return db.systems.get(id);
        const meta = db.index?.systems.find((system) => system.id === id);
        const system = prepare(await H.loadJson(`/${meta?.file || `data/starmap/${id}.json`}`));
        db.systems.set(id, system);
        return system;
    }
    const ensureAll = () => Promise.all(SYSTEMS.map(ensureSystem));
    const cur = () => db.systems.get(st.sys) || null;
    const metaOf = (id) => db.index?.systems.find((system) => system.id === id) || null;
    const systemName = (id) => H.name(metaOf(id)?.name) || id;

    // 장소 글자(게임 기록 이름 또는 UEX 터미널 번호) → { id, sys, o }. 올라와 있는 항성계 자료에서만 찾는다.
    function find(token) {
        if (token === null || token === undefined || token === '') return null;
        const text = String(token);
        const order = [st.sys, ...SYSTEMS.filter((id) => id !== st.sys)].filter((id) => db.systems.has(id));
        for (const sys of order) {
            const system = db.systems.get(sys);
            const id = system.byId.has(text) ? text : (/^\d+$/.test(text) ? system.uex.get(Number(text)) : null);
            if (id) return { id, sys, o: system.byId.get(id) };
        }
        return null;
    }
    const list = (value) => String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    // ── 글자 ──────────────────────────────────────────────────────────────
    function nameOf(object) {
        if (!object) return '';
        return object.name ? H.name(object.name) : t('noName');
    }
    // 지도 이름표: 한글 패치 이름에서 대괄호 안 영어는 뺀 짧은 이름 + (고른 곳만) 영어 이름.
    function mapLabel(object) {
        if (!object.name) return { text: object.id ? t('noName') : '', sub: '' };
        const full = H.name(object.name);
        const short = full.replace(/\s*\[[^\]]*\]\s*$/, '') || full;
        const english = object.name.en || '';
        return { text: short, sub: H.lang() === 'ko' && english && english !== short ? english : '' };
    }
    function dist(metres) {
        if (!H.isKnown(metres)) return H.unknown('game');
        const km = metres / 1000;
        if (metres < 1000) return `${H.num(metres)} m`;
        if (metres < 1e7) return `${H.num(km, { digits: km < 100 ? 1 : 0 })} km`;
        const game = metres >= 1e9 ? `${H.num(metres / 1e9, { digits: 2 })} Gm` : `${H.num(metres / 1e6, { digits: 1 })} Mm`;
        let plain;
        if (H.lang() === 'ko') plain = km >= 1e8 ? `${H.num(km / 1e8, { digits: 2 })}억 km` : km >= 1e4 ? `${H.num(km / 1e4, { digits: km < 1e5 ? 1 : 0 })}만 km` : `${H.num(km)} km`;
        else plain = km >= 1e6 ? `${H.num(km / 1e6, { digits: 2 })} million km` : `${H.num(km)} km`;
        return `${game} (${plain})`;
    }
    const kindName = (kind) => t(`kind_${KIND_ORDER.includes(kind) ? kind : 'other'}`);
    const flagsOf = (object) => FLAGS.filter((flag) => object[flag] === 1);

    // 위치 없는 정거장도 기본 목록에 둔다. 지도상의 점은 pos가 있는 장소만 그린다.
    const offMap = (object) => object.h === 1;
    function visible(object) {
        if (['star', 'planet', 'moon'].includes(object.kind)) return true;
        if (st.off.includes(object.kind)) return false;
        if (st.need.length) return st.need.some((flag) => object[flag] === 1);
        if (object.kind === 'jump') return true;
        return !offMap(object) || st.hidden;
    }
    // 채광 구역 이름. 다른 항성계의 장소 이름이 붙은 광물 목록을 함께 쓰는 곳(shared)은 그 이름을 이곳 이름처럼 쓰지 않는다.
    const regionName = (region) => (region.shared ? t('areaShared', { name: H.name(region.name) }) : H.name(region.name));

    // ── 주소 ──────────────────────────────────────────────────────────────
    function hashParams() {
        return {
            sys: st.sys, focus: st.focus, route: st.route.join(','), mark: st.mark.join(','), area: st.area.join(','), site: st.site,
            m: st.measure.join(','), hid: st.hidden ? 1 : '', off: st.off.join(','), with: st.need.join(','),
        };
    }
    const syncHash = (push) => H.writeHash(SECTION, hashParams(), { push: push === true });
    function normalize(params) {
        const out = {};
        for (const [key, value] of Object.entries(params || {})) out[key] = Array.isArray(value) ? value.join(',') : value;
        return out;
    }

    async function openRoute(params) {
        const token = ++ui.token;
        const p = params || {};
        try {
            if (!db.index) {
                ui.phase = 'loading';
                drawAll();
                const [index, textures] = await Promise.all([H.loadJson('/data/starmap/index.json'), H.loadJson('/data/starmap/textures.json')]);
                db.index = index;
                db.textures = textures;
            }
            const tokens = [p.focus, ...list(p.route), ...list(p.mark), ...list(p.m)].filter(Boolean);
            let sys = SYSTEMS.includes(p.sys) ? p.sys : null;
            const areas = list(p.area);
            if (!sys && !tokens.length) {
                const hint = areas.length ? db.index.regionSystems?.[areas[0]] : (p.site ? db.index.siteSystems?.[p.site] : null);
                const mine = String(window.VOLT_TRADE_ENGINE?.state?.get?.().system || '').toLowerCase();
                sys = hint?.[0] || (SYSTEMS.includes(mine) ? mine : 'stanton');
            }
            if (sys) await ensureSystem(sys);
            const here = sys ? db.systems.get(sys) : null;
            const known = (value) => here && (here.byId.has(String(value)) || (/^\d+$/.test(String(value)) && here.uex.has(Number(value))));
            if (!sys || tokens.some((value) => !known(value))) await ensureAll();
            if (token !== ui.token) return;
            st.sys = sys;
            const idOf = (value) => find(value)?.id || String(value);
            if (!st.sys) st.sys = find(tokens[0])?.sys || 'stanton';
            st.focus = p.focus ? idOf(p.focus) : null;
            st.route = list(p.route).map(idOf);
            st.mark = list(p.mark).map(idOf);
            st.area = areas;
            st.site = p.site || null;
            st.measure = list(p.m).slice(0, 2).map(idOf);
            st.hidden = p.hid === '1';
            st.off = list(p.off).filter((kind) => KIND_ORDER.includes(kind));
            st.need = list(p.with).filter((flag) => FLAGS.includes(flag));
            if (!db.systems.has(st.sys)) await ensureSystem(st.sys);
            if (token !== ui.token) return;
            ui.phase = 'ready';
            ui.error = null;
            if (st.focus) reveal(st.focus);
            drawAll();
            startViewer(true);
            if (st.measure.length === 2) ensureCargo();
            // 다른 화면에서 장소·경로를 들고 왔으면 지도가 바로 보이게 내려 준다 (라우터가 맨 위로 올린 다음에).
            if (st.focus || st.route.length || st.mark.length || st.area.length || st.site) {
                window.setTimeout(() => { if (token === ui.token && sectionOpen()) ui.parts.stage.scrollIntoView({ block: 'start', behavior: 'instant' }); }, 60);
            }
        } catch (error) {
            if (token !== ui.token) return;
            ui.phase = 'error';
            ui.error = error;
            drawAll();
        }
    }

    // ── 3D 화면 ───────────────────────────────────────────────────────────
    const sectionOpen = () => Boolean(document.getElementById(SECTION)?.classList.contains('active') && document.getElementById(SECTION)?.hasAttribute('data-helper-allowed'));
    // 3D 파일(three.js 2 MB)을 받기 전에 이 기기가 WebGL2 를 쓸 수 있는지 먼저 본다. 못 쓰면 아무것도 받지 않는다.
    function canWebgl2() {
        try {
            if (typeof WebGL2RenderingContext === 'undefined') return false;
            const gl = document.createElement('canvas').getContext('webgl2');
            if (!gl) return false;
            gl.getExtension('WEBGL_lose_context')?.loseContext();
            return true;
        } catch (_error) { return false; }
    }
    async function startViewer(refocus) {
        if (ui.phase !== 'ready' || !sectionOpen()) return;
        if (viewer) { loadViewerSystem(refocus); return; }
        if (ui.view === 'loading' || ui.view === 'none') return;
        if (!viewerModule && !canWebgl2()) { ui.view = 'none'; drawHud(); return; }
        ui.view = 'loading';
        drawHud();
        try {
            viewerModule = viewerModule || await import(`/js/starmap-viewer.js${ASSET_QUERY}`);
            if (!viewerModule.isSupported()) throw new Error('webgl-unavailable');
            if (!sectionOpen() || viewer) { if (!viewer) ui.view = 'idle'; return; }
            viewer = viewerModule.createViewer(ui.parts.view, {
                label: mapLabel,
                onPick: (id) => pick(id, { fromMap: true }),
                onRegionPick: (id) => {
                    st.area = [id];
                    syncHash();
                    drawOver();
                    syncViewer();
                },
                onTextureError: () => { ui.texFailed = true; drawHud(); },
                onContextLost: () => { stopViewer(); ui.view = 'lost'; drawHud(); },
            });
            ui.view = 'ready';
            loadViewerSystem();
        } catch (_error) {
            // WebGL 을 못 쓰거나 3D 파일을 못 받은 경우: 오류 화면 대신 목록만으로 쓴다.
            viewer = null;
            ui.view = 'none';
        }
        drawHud();
    }
    function stopViewer() {
        if (viewer) { try { viewer.dispose(); } catch (_error) { /* 이미 닫힘 */ } }
        viewer = null;
        ui.loadedSys = null;
        if (ui.view === 'ready' || ui.view === 'loading') ui.view = 'idle';
    }
    function focusTarget() {
        const found = st.focus ? find(st.focus) : null;
        if (!found || found.sys !== st.sys) return null;
        return found.o.pos ? found.id : (found.o.guess?.at || null);
    }
    function loadViewerSystem(refocus) {
        const system = cur();
        if (!viewer || !system) return;
        if (ui.loadedSys !== st.sys) {
            ui.loadedSys = st.sys;
            viewer.load({ system: system.data, reachM: metaOf(st.sys).reachM, starColor: db.index.starColor?.linearRgb, textures: db.textures });
            viewer.update(viewerState());
            aim(true);
            return;
        }
        viewer.update(viewerState());
        if (refocus) aim(false);
    }
    // 고른 곳이 있으면 그곳으로, 없고 경로·표시가 있으면 그것들이 다 보이게, 아무것도 없으면 전체 보기.
    function aim(instant) {
        const target = focusTarget();
        if (target) { viewer.focus(target, { instant }); return; }
        const state = viewerState();
        const ids = [...new Set([...state.stops.map((stop) => stop.id), ...state.marks, ...state.paths.flatMap((path) => path.ids)])];
        if (ids.length > 1) viewer.frame(ids, { instant });
        else viewer.focus(ids[0] === cur().data.star ? null : ids[0], { instant });
    }
    function linkBetween(from, to) {
        for (const link of db.index.links || []) {
            if (link.a.sys === from && link.b.sys === to) return { here: link.a, there: link.b };
            if (link.b.sys === from && link.a.sys === to) return { here: link.b, there: link.a };
        }
        return null;
    }
    // 두 곳 사이: 같은 항성계면 직선 거리, 다르면 점프 포인트를 거치는 두 구간.
    function leg(aToken, bToken) {
        const a = find(aToken);
        const b = find(bToken);
        if (!a || !b) return { state: 'unknown', a, b };
        if (!a.o.pos || !b.o.pos) return { state: 'nopos', a, b };
        if (a.sys === b.sys) return { state: 'same', a, b, m: distance(a.o.pos, b.o.pos) };
        const link = linkBetween(a.sys, b.sys);
        if (!link) return { state: 'unknown', a, b };
        return { state: 'jump', a, b, link, m1: distance(a.o.pos, link.here.pos), m2: distance(link.there.pos, b.o.pos) };
    }
    function pathsFor(tokens, kind) {
        const paths = [];
        for (let index = 0; index + 1 < tokens.length; index++) {
            const part = leg(tokens[index], tokens[index + 1]);
            if (part.state === 'same' && part.a.sys === st.sys) paths.push({ kind, dashed: false, ids: [part.a.id, part.b.id] });
            if (part.state === 'jump') {
                if (part.a.sys === st.sys) paths.push({ kind, dashed: true, ids: [part.a.id, part.link.here.jump] });
                if (part.b.sys === st.sys) paths.push({ kind, dashed: true, ids: [part.link.there.jump, part.b.id] });
            }
        }
        return paths;
    }
    function siteHere() { return st.site ? cur()?.data.sites?.[st.site] || null : null; }
    function viewerState() {
        const system = cur();
        const here = (token) => {
            const found = find(token);
            if (!found || found.sys !== st.sys) return null;
            return found.o.pos ? found.id : (found.o.guess?.at || null);
        };
        const marks = st.mark.map(here).filter(Boolean);
        for (const id of st.area) for (const at of system.regions.get(id)?.at || []) marks.push(at);
        const site = siteHere();
        for (const at of site?.at || []) marks.push(at);
        for (const at of site?.near || []) marks.push(at);
        return {
            selected: focusTarget(),
            marks: [...new Set(marks)],
            stops: st.route.map((token, index) => ({ id: here(token), n: index + 1 })).filter((stop) => stop.id),
            paths: [...pathsFor(st.route, 'route'), ...(st.measure.length === 2 ? pathsFor(st.measure, 'measure') : [])],
            spots: (site?.spots || []).map((spot) => ({ pos: [spot[1], spot[2], spot[3]], at: spot[0], text: t('siteSpot') })),
            rings: st.area, hiddenLabels,
            filter: { hidden: st.hidden, off: st.off, need: st.need },
        };
    }
    const syncViewer = () => { if (viewer && ui.loadedSys === st.sys) viewer.update(viewerState()); };

    // ── 함선 (거리 재기의 시간 추정) ────────────────────────────────────────
    function ensureCargo() {
        if (db.cargo || db.cargoState === 'loading') return;
        if (!window.VOLT_TRADE_ENGINE?.state?.get?.().ship) return;
        db.cargoState = 'loading';
        H.loadJson('/data/trade/cargo.json').then((cargo) => { db.cargo = cargo; db.cargoState = 'ready'; drawOver(); })
            .catch(() => { db.cargoState = 'failed'; });
    }
    function shipName(id) {
        const ship = window.VOLT_SHIPDB_CANONICAL?.getShip?.(id);
        return ship ? ((H.lang() === 'ko' && ship.nameKo) || ship.name || id) : id;
    }
    function timeHtml(part) {
        const engine = window.VOLT_TRADE_ENGINE;
        const shipId = engine?.state?.get?.().ship;
        if (!shipId) return `<p class="starmap-note">${esc(t('timeNoShip'))} <a class="starmap-link" href="#routes">${esc(t('timePick'))}</a></p>`;
        if (!db.cargo) { ensureCargo(); return ''; }
        const sameBody = part.state === 'same' && (() => {
            const system = db.systems.get(part.a.sys);
            const bodyOf = (id) => (['planet', 'moon'].includes(system.byId.get(id).kind) ? id : system.anchor.get(id));
            return bodyOf(part.a.id) && bodyOf(part.a.id) === bodyOf(part.b.id);
        })();
        if (sameBody) return `<p class="starmap-note">${esc(t('timeSameBody'))}</p>`;
        const ship = (db.cargo.ships || []).find((row) => row.id === shipId);
        const drive = ship?.qd ? db.cargo.drives?.[ship.qd] : null;
        const flights = (part.state === 'same' ? [part.m] : [part.m1, part.m2]).map((metres) => engine.travel.quantumTravel(metres, drive));
        if (!drive || flights.some((flight) => !flight)) return `<p class="starmap-note">${esc(t('timeNoDrive', { ship: shipName(shipId) }))}</p>`;
        const seconds = flights.reduce((sum, flight) => sum + flight.totalSeconds, 0);
        return `<p class="starmap-estimate"><span class="starmap-tag is-guess">${esc(t('guess'))}</span> ${esc(t('timeEstimate', { t: H.duration(seconds) }))}</p>
            <p class="starmap-note">${esc(t('timeBasis', { ship: shipName(shipId), drive: H.name(drive.name) }))}${part.state === 'jump' ? ` ${esc(t('timeJump'))}` : ''}</p>`;
    }

    // ── 그리기 ────────────────────────────────────────────────────────────
    // 이 파일의 유일한 innerHTML 싱크. 동적 값은 모두 esc() 를 거친다.
    // 내용이 그대로면 다시 그리지 않는다 (누르고 있던 자리의 초점을 잃지 않게).
    const painted = new WeakMap();
    function paint(node, html) {
        if (!node || painted.get(node) === html) return;
        painted.set(node, html);
        node.innerHTML = html;
    }

    function build(mount) {
        const el = H.el;
        const parts = {
            top: el('div', { class: 'starmap-top' }),
            search: el('input', { type: 'search', id: 'starmap-q', class: 'starmap-q', autocomplete: 'off', spellcheck: 'false', maxlength: '60', 'aria-describedby': 'starmap-q-hint' }),
            searchLabel: el('label', { for: 'starmap-q', class: 'starmap-q-label' }),
            searchHint: el('p', { id: 'starmap-q-hint', class: 'starmap-note' }),
            results: el('div', { class: 'starmap-results', 'aria-live': 'polite' }),
            tree: el('nav', { class: 'starmap-tree' }),
            view: el('div', { class: 'starmap-view', role: 'img' }),
            hud: el('div', { class: 'starmap-hud' }),
            info: el('section', { class: 'starmap-info', 'aria-live': 'polite' }),
            over: el('div', { class: 'starmap-over' }),
            status: el('p', { class: 'visually-hidden', role: 'status' }),
        };
        const searchBox = el('div', { class: 'starmap-search' }, parts.searchLabel, parts.search, parts.searchHint, parts.results);
        const stage = el('div', { class: 'starmap-stage' }, parts.view, parts.hud);
        parts.stage = stage;
        parts.panel = el('div', { class: 'starmap-panel' }, parts.over, parts.info);
        parts.grid = el('div', { class: 'starmap-grid' }, searchBox, stage, parts.panel, parts.tree);
        parts.root = el('div', { class: 'starmap-root' }, parts.top, parts.grid, parts.status);
        mount.replaceChildren(parts.root);
        return parts;
    }

    function drawAll() {
        const parts = ui.parts;
        if (!parts) return;
        parts.root.dataset.phase = ui.phase;
        parts.grid.hidden = ui.phase !== 'ready';
        if (ui.phase !== 'ready') {
            paint(parts.top, ui.phase === 'error'
                ? `<div class="helper-soon helper-soon-error" role="alert"><p>${esc(H.errorText(ui.error))}</p><button type="button" class="btn starmap-btn" data-act="retry">${esc(t('retry'))}</button></div>`
                : `<p class="helper-soon" role="status">${esc(t('loading'))}</p>`);
            return;
        }
        parts.searchLabel.textContent = t('search');
        parts.search.placeholder = t('searchPh');
        parts.searchHint.textContent = t('searchHint');
        parts.view.setAttribute('aria-label', t('mapLabel', { name: systemName(st.sys) }));
        drawTop();
        drawResults();
        drawTree();
        drawHud();
        drawInfo();
        drawOver();
    }

    function drawTop() {
        const system = cur();
        const tabs = db.index.systems.map((meta) => `<button type="button" class="starmap-tab" data-act="sys" data-id="${esc(meta.id)}" aria-pressed="${meta.id === st.sys}">${esc(H.name(meta.name))}</button>`).join('');
        const exits = (system.data.jumps || []).filter((jump) => jump.usable === 1).map((jump) => {
            const gate = system.byId.get(jump.station) || system.byId.get(jump.id);
            return `<button type="button" class="starmap-exit" data-act="jump" data-id="${esc(jump.id)}">${esc(t('goTo', { name: systemName(jump.to) }))}<small>${esc(t('viaGate', { gate: mapLabel(gate).text }))}</small></button>`;
        }).join('');
        paint(ui.parts.top, `
            <div class="starmap-tabs" role="group" aria-label="${esc(t('systems'))}">${tabs}</div>
            <div class="starmap-exits" role="group" aria-label="${esc(t('exits'))}"><span class="starmap-exits-title">${esc(t('exits'))}</span>${exits}</div>
            <div class="starmap-share">${returnHash ? `<a class="btn starmap-btn" href="${esc(returnHash)}">${esc(t('back'))}</a>` : ''}<button type="button" class="btn starmap-btn" data-act="share">${esc(t('share'))}</button><span class="starmap-flash" role="status">${esc(ui.flash)}</span></div>`);
    }

    function tags(object, withKind) {
        const out = [];
        if (withKind) out.push(`<span class="starmap-tag">${esc(kindName(object.kind))}</span>`);
        for (const flag of flagsOf(object)) out.push(`<span class="starmap-tag is-${flag}">${esc(t(`need_${flag}`))}</span>`);
        if (object.nopos === 1) out.push(`<span class="starmap-tag is-nopos">${esc(t(object.unplaced === 1 ? 'unplaced' : 'noPos'))}</span>`);
        return out.join('');
    }
    function row(object, sys, extra) {
        const current = st.focus === object.id ? ' aria-current="true"' : '';
        return `<button type="button" class="starmap-row" data-act="pick" data-id="${esc(object.id)}" data-sys="${esc(sys)}"${current}>
            <span class="starmap-row-name">${esc(nameOf(object))}</span><span class="starmap-row-tags">${extra || ''}${tags(object, true)}</span></button>`;
    }

    function searchHits() {
        const query = st.q.trim().toLowerCase();
        if (!query) return null;
        const hits = [];
        for (const sys of [st.sys, ...SYSTEMS.filter((id) => id !== st.sys)]) {
            const system = db.systems.get(sys);
            if (!system) continue;
            for (const object of system.data.objects) {
                const en = (object.name?.en || '').toLowerCase();
                const ko = (object.name?.ko || '').toLowerCase();
                const at = Math.min(...[en.indexOf(query), ko.indexOf(query), object.id.toLowerCase().indexOf(query)].map((value) => (value < 0 ? 999 : value)));
                if (at === 999) continue;
                hits.push({ object, sys, score: at + (object.h === 1 ? 5 : 0) + (sys === st.sys ? 0 : 2) + KIND_ORDER.indexOf(object.kind) / 100 });
            }
        }
        return hits.sort((a, b) => a.score - b.score);
    }
    function drawResults() {
        const hits = searchHits();
        if (!hits) { paint(ui.parts.results, ''); return; }
        const shown = hits.slice(0, LIST_LIMIT);
        const head = !hits.length ? t('noResult') : hits.length > shown.length ? t('resultsMore', { n: hits.length, shown: shown.length }) : tn('results', hits.length);
        paint(ui.parts.results, `<p class="starmap-results-head">${esc(head)}${ui.searchAll ? '' : ` · ${esc(t('searching'))}`}</p>
            <ul class="starmap-list">${shown.map((hit) => {
                const system = db.systems.get(hit.sys);
                const parent = system.byId.get(system.anchor.get(hit.object.id) || hit.object.parent);
                const where = [hit.sys !== st.sys ? systemName(hit.sys) : '', parent && parent.id !== hit.object.id ? mapLabel(parent).text : ''].filter(Boolean).join(' · ');
                return `<li>${row(hit.object, hit.sys, where ? `<span class="starmap-tag is-where">${esc(where)}</span>` : '')}</li>`;
            }).join('')}</ul>`);
    }

    function branch(object, system, depth) {
        const kids = (system.kids.get(object.id) || []).filter(visible);
        const key = `b:${object.id}`;
        const open = st.open.has(key);
        const label = nameOf(object);
        let inner = '';
        if (open && kids.length) {
            const sorted = kids.slice().sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || nameOf(a).localeCompare(nameOf(b), H.lang()));
            inner = `<ul class="starmap-list is-nested">${sorted.map((kid) => (['planet', 'moon'].includes(kid.kind) ? branch(kid, system, depth + 1) : `<li>${row(kid, st.sys)}</li>`)).join('')}</ul>`;
        }
        const toggle = kids.length
            ? `<button type="button" class="starmap-toggle" data-act="toggle" data-id="${esc(key)}" aria-expanded="${open}" aria-label="${esc(t(open ? 'close' : 'open', { name: label }))}"><span aria-hidden="true">${open ? '−' : '+'}</span></button>`
            : '<span class="starmap-toggle is-empty" aria-hidden="true"></span>';
        return `<li class="starmap-branch">${toggle}${row(object, st.sys, kids.length ? `<span class="starmap-tag is-count">${esc(tn('places', kids.length))}</span>` : '')}${inner}</li>`;
    }
    function drawTree() {
        const system = cur();
        const objects = system.data.objects;
        const star = system.byId.get(system.data.star);
        const top = objects.filter((object) => !system.anchor.has(object.id) && object.id !== star.id);
        const planets = top.filter((object) => object.kind === 'planet' || object.kind === 'moon')
            .sort((a, b) => (a.pos ? Math.hypot(...a.pos) : Infinity) - (b.pos ? Math.hypot(...b.pos) : Infinity));
        const groupOf = (object) => (TOP_GROUPS.includes(object.kind) ? object.kind : 'other');
        const groups = TOP_GROUPS.map((group) => {
            const members = top.filter((object) => !['planet', 'moon'].includes(object.kind) && groupOf(object) === group && visible(object))
                .sort((a, b) => nameOf(a).localeCompare(nameOf(b), H.lang()));
            if (!members.length) return '';
            const key = `g:${group}`;
            const open = st.open.has(key);
            const label = t(`group_${group}`);
            return `<li class="starmap-branch"><button type="button" class="starmap-toggle" data-act="toggle" data-id="${esc(key)}" aria-expanded="${open}" aria-label="${esc(t(open ? 'close' : 'open', { name: label }))}"><span aria-hidden="true">${open ? '−' : '+'}</span></button>
                <button type="button" class="starmap-row is-group" data-act="toggle" data-id="${esc(key)}"><span class="starmap-row-name">${esc(label)}</span><span class="starmap-row-tags"><span class="starmap-tag is-count">${esc(tn('places', members.length))}</span></span></button>
                ${open ? `<ul class="starmap-list is-nested">${members.map((object) => `<li>${row(object, st.sys)}</li>`).join('')}</ul>` : ''}</li>`;
        }).join('');
        const needs = FLAGS.map((flag) => `<button type="button" class="starmap-chip is-${flag}" data-act="need" data-id="${flag}" aria-pressed="${st.need.includes(flag)}">${esc(t(`need_${flag}`))}</button>`).join('');
        const kinds = KIND_ORDER.filter((kind) => !['star', 'planet', 'moon', 'other'].includes(kind) && system.data.objects.some((object) => object.kind === kind))
            .map((kind) => `<label class="starmap-check"><input type="checkbox" data-kind="${kind}"${st.off.includes(kind) ? '' : ' checked'}> <span>${esc(kindName(kind))}</span></label>`).join('');
        paint(ui.parts.tree, `
            <h3 class="starmap-h">${esc(t('list'))} · ${esc(systemName(st.sys))}</h3>
            <p class="starmap-note">${esc(t('listHint'))}</p>
            <div class="starmap-chips" role="group" aria-label="${esc(t('needs'))}"><span class="starmap-chips-title">${esc(t('needs'))}</span>${needs}</div>
            <details class="starmap-filters"${ui.filtersOpen ? ' open' : ''}><summary>${esc(t('moreFilters'))}</summary>
                <label class="starmap-check"><input type="checkbox" data-filter="hidden"${st.hidden ? ' checked' : ''}> <span>${esc(t('showHidden'))}</span></label>
                <fieldset class="starmap-kinds"><legend>${esc(t('kinds'))}</legend>${kinds}</fieldset></details>
            <ul class="starmap-list is-root"><li class="starmap-branch"><span class="starmap-toggle is-empty" aria-hidden="true"></span>${row(star, st.sys)}</li>
                ${planets.map((object) => branch(object, system, 0)).join('')}${groups}</ul>`);
    }

    function drawHud() {
        if (!ui.parts || ui.phase !== 'ready') return;
        const has3d = ui.view === 'ready';
        ui.parts.view.hidden = !has3d;
        ui.parts.root.dataset.view = ui.view;
        const legend = ['city', 'station', 'outpost', 'jump', 'lagrange', 'asteroid']
            .map((kind) => `<li><i class="starmap-key is-${kind}" aria-hidden="true"></i>${esc(kindName(kind))}</li>`).join('');
        const tools = has3d ? `<div class="starmap-tools">
                <button type="button" class="starmap-tool" data-act="home">${esc(t('home'))}</button>
                <button type="button" class="starmap-tool is-icon" data-act="zoom-in" aria-label="${esc(t('zoomIn'))}"><span aria-hidden="true">＋</span></button>
                <button type="button" class="starmap-tool is-icon" data-act="zoom-out" aria-label="${esc(t('zoomOut'))}"><span aria-hidden="true">－</span></button>
                <button type="button" class="starmap-tool" data-act="measure" aria-pressed="${st.measuring}">${esc(t(st.measuring ? 'measureOn' : 'measure'))}</button></div>` : `<div class="starmap-tools">
                <button type="button" class="starmap-tool" data-act="measure" aria-pressed="${st.measuring}">${esc(t(st.measuring ? 'measureOn' : 'measure'))}</button></div>`;
        const message = ui.view === 'none' ? `<p class="starmap-fallback" role="status">${esc(t('view3dNone'))}</p>`
            : ui.view === 'lost' ? `<p class="starmap-fallback" role="status">${esc(t('view3dLost'))} <button type="button" class="starmap-tool" data-act="retry3d">${esc(t('view3dRetry'))}</button></p>`
                : ui.view === 'loading' || ui.view === 'idle' ? `<p class="starmap-fallback is-wait" role="status">${esc(t('view3dLoading'))}</p>` : '';
        paint(ui.parts.hud, `${message}${tools}
            ${has3d ? `<p class="starmap-scale"><strong>${esc(t('scaleTitle'))}</strong> ${esc(t('scaleBody'))}</p>
            <details class="starmap-how-labels"${ui.labelsOpen ? ' open' : ''}><summary>${esc(t('mapLabels'))}</summary>
                <fieldset class="starmap-kinds" aria-label="${esc(t('mapLabels'))}">${Object.entries(labelGroups).map(([key, label]) => `<label class="starmap-check"><input type="checkbox" data-map-label="${key}"${hiddenLabels.has(key) ? '' : ' checked'}> <span>${esc(t(label))}</span></label>`).join('')}</fieldset></details>
            <details class="starmap-how"${ui.howOpen ? ' open' : ''}><summary>${esc(t('scaleHow'))} · ${esc(t('legend'))}</summary>
                <ul class="starmap-how-list">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<li>${esc(t(`scale${n}`))}</li>`).join('')}</ul>
                <ul class="starmap-legend">${legend}<li><i class="starmap-key is-guide" aria-hidden="true"></i>${esc(t('legendGuide'))}</li><li><i class="starmap-key is-stem" aria-hidden="true"></i>${esc(t('legendStem'))}</li></ul></details>
            ${ui.texFailed ? `<p class="starmap-note">${esc(t('texFailed'))}</p>` : ''}` : ''}`);
    }

    function field(label, value, note) {
        return `<div class="starmap-field"><dt>${esc(label)}</dt><dd>${value}${note ? `<small>${esc(note)}</small>` : ''}</dd></div>`;
    }
    function pickLink(found, text) {
        return `<button type="button" class="starmap-link" data-act="pick" data-id="${esc(found.id)}" data-sys="${esc(found.sys)}">${esc(text || nameOf(found.o))}</button>`;
    }
    function drawInfo() {
        const parts = ui.parts;
        const found = st.focus ? find(st.focus) : null;
        parts.info.dataset.empty = String(!found);
        parts.root.dataset.picked = String(Boolean(found));
        parts.root.dataset.sheet = ui.sheetOpen ? 'open' : 'peek';
        if (!found) {
            paint(parts.info, st.focus ? `<p class="starmap-note" role="status">${esc(t('unknownPlace', { id: st.focus }))}</p>` : `<p class="starmap-note">${esc(t('infoEmpty'))}</p>`);
            return;
        }
        const { o, sys } = found;
        const system = db.systems.get(sys);
        const index = db.index;
        const english = o.name?.en && H.lang() === 'ko' && o.name.ko && !o.name.ko.includes(o.name.en) ? `<p class="starmap-info-en" lang="en">${esc(o.name.en)}</p>` : '';
        const badges = [`<span class="starmap-tag">${esc(kindName(o.kind))}</span>`, ...flagsOf(o).map((flag) => `<span class="starmap-tag is-${flag}">${esc(t(`need_${flag}`))}</span>`)];
        if (o.h === 1) badges.push(`<span class="starmap-tag">${esc(t('hiddenInGame'))}</span>`);
        if (o.unplaced === 1) badges.push(`<span class="starmap-tag is-nopos">${esc(t('unplaced'))}</span>`);
        else if (o.nopos === 1) badges.push(`<span class="starmap-tag is-nopos">${esc(t('noPos'))}</span>`);

        const rows = [];
        const gameType = index.types?.[o.type]?.name ? H.name(index.types[o.type].name) : '';
        if (gameType && gameType !== kindName(o.kind)) rows.push(field(t('fGameType'), esc(gameType)));
        const parent = o.parent ? system.byId.get(o.parent) : null;
        if (parent) rows.push(field(t('fParent'), pickLink({ id: parent.id, sys, o: parent })));
        const body = o.body && o.body !== o.parent ? system.byId.get(o.body) : null;
        if (body) rows.push(field(t('fBody'), pickLink({ id: body.id, sys, o: body })));
        if (o.geo) {
            rows.push(field(t('fGeo'), esc(t('geoText', { lat: H.num(o.geo[0], { digits: 1 }), lon: H.num(o.geo[1], { digits: 1 }) })), t('geoNote')));
            if (o.surf !== 1) rows.push(field(t('fAlt'), esc(dist(o.geo[2]))));
        }
        rows.push(field(t('fLaw'), esc(o.law ? (H.name(index.laws?.[o.law]?.name) || o.law) : H.unknown('game'))));
        if (o.am?.length) rows.push(field(t('fAmenities'), esc(o.am.map((code) => H.name(index.amenities?.[code]?.name) || code).join(' · '))));
        if (o.pos) {
            const star = system.byId.get(system.data.star);
            if (o.id !== star.id) rows.push(field(t('fFromStar'), esc(dist(distance(o.pos, star.pos))), t('straight')));
            const near = body || parent;
            if (near && near.id !== star.id && near.pos) rows.push(field(t('fFromParent', { name: mapLabel(near).text }), esc(o.surf === 1 ? `${t('onSurface')} · ${dist(distance(o.pos, near.pos))}` : dist(distance(o.pos, near.pos))), t('straight')));
        }
        // 임시 천체(stub)의 크기는 자리 표시용 값이라 실제 값처럼 보여 주지 않는다.
        if (['star', 'planet', 'moon'].includes(o.kind)) rows.push(o.stub === 1 ? field(t('fRadius'), esc(H.unknown('game')), t('stubNote')) : field(t('fRadius'), esc(dist(o.r))));
        if (['planet', 'moon'].includes(o.kind) && !o.tex && o.pos) rows.push(field(t('fArt'), esc(H.unknown('game'))));
        rows.push(field(t('fQt'), esc(o.qt ? dist(o.qt[1]) : H.unknown('game'))));

        const notes = [];
        if (o.unplaced === 1) notes.push(`<p class="starmap-warn">${esc(t('unplacedNote'))}</p>`);
        else if (o.nopos === 1) {
            const guess = o.guess?.at ? system.byId.get(o.guess.at) : null;
            notes.push(guess ? `<p class="starmap-warn"><span class="starmap-tag is-guess">${esc(t('guess'))}</span> ${esc(t('guessAt', { name: nameOf(guess) }))}</p>` : `<p class="starmap-warn">${esc(t('noPosNote'))}</p>`);
        }
        const jumpId = o.kind === 'jump' ? o.id : o.gate;
        const jump = jumpId ? (system.data.jumps || []).find((entry) => entry.id === jumpId) : null;
        if (jump) {
            notes.push(jump.usable === 1
                ? `<p class="starmap-jump">${esc(t('jumpUsable', { name: systemName(jump.to) }))} <button type="button" class="btn starmap-btn" data-act="jump" data-id="${esc(jump.id)}">${esc(t('goTo', { name: systemName(jump.to) }))}</button></p>${jump.named ? `<p class="starmap-warn">${esc(t('jumpNamed', { named: jump.named, name: systemName(jump.to) }))}</p>` : ''}<p class="starmap-note">${esc(t('jumpLength'))}</p>`
                : `<p class="starmap-warn">${esc(t('jumpClosed'))}${jump.toName ? ` <span class="starmap-tag is-guess">${esc(t('guess'))}</span> ${esc(t('jumpGuess', { name: jump.toName }))}` : ''}</p>`);
        }

        // 다른 화면으로 가는 길: 연결 자료가 있을 때만 보여 준다.
        const links = [];
        // UEX 에서 지금 쓰이는 터미널이 따로 있으면 그것만 건다 (닫힌 터미널·행사용 함선 터미널은 뺀다).
        (o.uexLive || o.uex || []).forEach((terminal, n, all) => {
            const suffix = all.length > 1 ? ` (${t('terminalNo', { n: n + 1 })})` : '';
            links.push(`<a class="starmap-out" href="${esc(H.buildHash('market', { t: terminal }))}">${esc(t('linkMarket') + suffix)}</a>`);
            links.push(`<a class="starmap-out" href="${esc(H.buildHash('routes', { from: terminal }))}">${esc(t('linkRoutes') + suffix)}</a>`);
        });
        // 임무: 임무가 나오는 곳(mission)이거나 임무 현장이 이곳에 놓여 있을 때(sites[].at). 임무 화면은 place 로 그 임무들만 보여 준다.
        if (o.mission === 1 || system.siteAt.has(o.id)) links.push(`<a class="starmap-out" href="${esc(H.buildHash('missions', { place: o.id }))}" title="${esc(t('missionsNote'))}">${esc(t('linkMissions'))}</a>`);
        if (o.mine === 1) links.push(`<a class="starmap-out" href="${esc(H.buildHash('mining', { loc: o.id }))}">${esc(t('linkMining'))}</a>`);
        for (const area of o.areas || []) {
            const region = system.regions.get(area);
            links.push(`<a class="starmap-out" href="${esc(H.buildHash('mining', { loc: area }))}">${esc(`${t('linkMining')} · ${region ? regionName(region) : area}`)}</a>`);
        }
        if (o.refinery === 1) links.push(`<a class="starmap-out" href="${esc(H.buildHash('mining', { tab: 'ref', ref: o.id }))}">${esc(t('linkRefinery'))}</a>`);

        let places = '';
        if (['planet', 'moon'].includes(o.kind)) {
            const kids = system.kids.get(o.id) || [];
            const counts = FLAGS.map((flag) => [flag, kids.filter((kid) => kid[flag] === 1).length]).filter(([, n]) => n > 0)
                .map(([flag, n]) => `<button type="button" class="starmap-chip is-${flag}" data-act="need-open" data-id="${flag}">${esc(t(`need_${flag}`))} ${H.num(n)}</button>`).join('');
            // 목록의 곳 수는 게임 지도에 나오는 곳만 센다. 여기는 전부를 세므로, 둘이 다르면 함께 적는다.
            const onGameMap = kids.filter((kid) => !offMap(kid)).length;
            places = `<div class="starmap-links"><h4 class="starmap-h">${esc(t('bodyPlaces'))} · ${esc(tn('places', kids.length))}${kids.length && onGameMap !== kids.length ? ` <small class="starmap-note">(${esc(t('bodyShown', { n: H.num(onGameMap) }))})</small>` : ''}</h4>${kids.length ? `<div class="starmap-chips">${counts}</div>` : `<p class="starmap-note">${esc(t('bodyPlacesNone'))}</p>`}</div>`;
        }
        const elsewhere = sys !== st.sys ? `<p class="starmap-warn">${esc(t('otherSystem', { name: systemName(sys) }))} <button type="button" class="btn starmap-btn" data-act="pick" data-id="${esc(o.id)}" data-sys="${esc(sys)}">${esc(t('showThere', { name: systemName(sys) }))}</button></p>` : '';

        paint(parts.info, `
            <div class="starmap-info-head">
                <div><h3 class="starmap-info-title" tabindex="-1">${esc(nameOf(o))}</h3>${english}</div>
                <div class="starmap-acts">
                    <button type="button" class="starmap-tool is-icon starmap-sheet-toggle" data-act="sheet" aria-expanded="${Boolean(ui.sheetOpen)}" aria-label="${esc(t(ui.sheetOpen ? 'sheetClose' : 'sheetOpen'))}"><span aria-hidden="true">${ui.sheetOpen ? '▼' : '▲'}</span></button>
                    <button type="button" class="starmap-tool is-icon" data-act="clear" aria-label="${esc(t('infoClose'))}"><span aria-hidden="true">×</span></button>
                </div>
            </div>
            <p class="starmap-row-tags">${badges.join('')}</p>
            ${elsewhere}${notes.join('')}
            ${links.length ? `<div class="starmap-links"><h4 class="starmap-h">${esc(t('links'))}</h4>${links.join('')}</div>` : ''}
            ${places}
            <dl class="starmap-fields">${rows.join('')}</dl>
            <div class="starmap-acts">
                ${o.pos || o.guess ? `<button type="button" class="starmap-tool" data-act="refocus">${esc(t('actFocus'))}</button>` : ''}
                <button type="button" class="starmap-tool" data-act="measure-from">${esc(t('actMeasure'))}</button>
                <button type="button" class="starmap-tool" data-act="share-place">${esc(t('actShare'))}</button>
            </div>`);
    }

    function legText(part) {
        if (part.state === 'same') return esc(dist(part.m));
        if (part.state === 'nopos') return esc(t('legNoPos'));
        if (part.state === 'unknown') return esc(t('legUnknown'));
        const gate = db.systems.get(part.a.sys).byId.get(part.link.here.station || part.link.here.jump);
        const exit = db.systems.get(part.b.sys).byId.get(part.link.there.station || part.link.there.jump);
        return `<span class="starmap-tag is-jump">${esc(systemName(part.a.sys))} → ${esc(systemName(part.b.sys))}</span> ${esc(t('legJump', { gate: mapLabel(gate).text, d1: dist(part.m1), exit: mapLabel(exit).text, d2: dist(part.m2) }))}`;
    }
    function stopLink(token) {
        const found = find(token);
        return found ? pickLink(found) : `<span class="starmap-missing">${esc(t('unknownPlace', { id: token }))}</span>`;
    }
    // 장소 목록 한 묶음. 종류와 이름이 같은 곳이 여럿이면(같은 이름을 쓰는 소행성 무리 등) 한 줄로 묶고 개수를 적는다.
    function placeItems(objects, sys, limit) {
        const groups = new Map();
        for (const object of objects) {
            const key = `${object.kind}|${nameOf(object)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(object);
        }
        const all = [...groups.values()];
        const shown = all.slice(0, limit);
        const rest = all.slice(limit).reduce((sum, group) => sum + group.length, 0);
        return `${shown.map((group) => `<li>${pickLink({ id: group[0].id, sys, o: group[0] })}${group.length > 1 ? `<span class="starmap-tag is-where">${esc(kindName(group[0].kind))} · ${esc(t('sameName', { n: H.num(group.length) }))}</span>` : ''}</li>`).join('')}${rest ? `<li class="starmap-note">${esc(t('areaMore', { n: H.num(rest) }))}</li>` : ''}`;
    }
    function drawOver() {
        if (!ui.parts || ui.phase !== 'ready') return;
        const blocks = [];
        const system = cur();

        if (st.measuring || st.measure.length) {
            let body;
            if (st.measure.length < 2) {
                body = `<p class="starmap-note">${st.measure.length ? esc(t('measurePick2', { a: nameOf(find(st.measure[0])?.o) || st.measure[0] })) : esc(t('measureHint'))}</p>`;
            } else {
                const part = leg(st.measure[0], st.measure[1]);
                const head = `<p class="starmap-pair">${stopLink(st.measure[0])} <span aria-hidden="true">↔</span> ${stopLink(st.measure[1])}</p>`;
                if (part.state === 'same') body = `${head}<p class="starmap-big">${esc(t('measureSame', { d: dist(part.m) }))}</p>${timeHtml(part)}`;
                else if (part.state === 'jump') body = `${head}<p class="starmap-big">${esc(t('measureCross'))}</p><p>${legText(part)}</p><p class="starmap-note">${esc(t('jumpLength'))}</p>${timeHtml(part)}`;
                else body = `${head}<p class="starmap-warn">${esc(part.state === 'nopos' ? t('measureNoPos') : t('legUnknown'))}</p>`;
            }
            blocks.push(`<section class="starmap-card is-measure" data-over="measure"><h3 class="starmap-h">${esc(t('measureTitle'))}</h3>${body}
                ${st.measure.length ? `<button type="button" class="starmap-tool" data-act="measure-clear">${esc(t('measureClear'))}</button>` : ''}</section>`);
        }

        if (st.route.length) {
            let total = 0;
            let partial = false;
            let jumps = false;
            const items = st.route.map((token, index) => {
                let legHtml = '';
                if (index + 1 < st.route.length) {
                    const part = leg(token, st.route[index + 1]);
                    if (part.state === 'same') total += part.m;
                    else if (part.state === 'jump') { total += part.m1 + part.m2; jumps = true; } else partial = true;
                    legHtml = `<p class="starmap-leg" data-leg="${part.state}"><span aria-hidden="true">↓</span> ${legText(part)}</p>`;
                }
                return `<li><span class="starmap-stop-no">${index + 1}</span>${stopLink(token)}${legHtml}</li>`;
            }).join('');
            blocks.push(`<section class="starmap-card is-route" data-over="route"><h3 class="starmap-h">${esc(t('routeTitle'))}</h3><ol class="starmap-route">${items}</ol>
                <p class="starmap-big">${esc(t(partial ? 'routeTotalPart' : jumps ? 'routeTotalJump' : 'routeTotal', { d: dist(total) }))}</p>
                ${jumps ? `<p class="starmap-note">${esc(t('jumpLength'))}</p>` : ''}
                <button type="button" class="starmap-tool" data-act="route-clear">${esc(t('routeClear'))}</button></section>`);
        }

        if (st.mark.length) {
            const found = st.mark.map((token) => ({ token, hit: find(token) }));
            const here = found.filter((entry) => entry.hit?.sys === st.sys).length;
            const items = found.map(({ token, hit }) => {
                if (!hit) return `<li><span class="starmap-missing">${esc(t('unknownPlace', { id: token }))}</span></li>`;
                const extra = [hit.sys !== st.sys ? `<span class="starmap-tag is-where">${esc(systemName(hit.sys))}</span>` : '',
                    hit.o.nopos === 1 ? `<span class="starmap-tag is-nopos">${esc(hit.o.guess ? t('markGuess') : hit.o.unplaced === 1 ? t('unplaced') : t('noPos'))}</span>` : ''].join('');
                return `<li>${pickLink(hit)}${extra}</li>`;
            }).join('');
            blocks.push(`<section class="starmap-card is-mark" data-over="mark"><h3 class="starmap-h">${esc(tn('markTitle', st.mark.length))} · ${esc(t('markHere', { n: here }))}</h3>
                <ul class="starmap-marks">${items}</ul><button type="button" class="starmap-tool" data-act="mark-clear">${esc(t('markClear'))}</button></section>`);
        }

        // 채광 구역: 카드 한 장에 묶는다. 이 항성계의 구역은 자세히, 다른 항성계의 구역은 항성계마다 한 줄로.
        if (st.area.length) {
            const here = [];
            const elsewhere = new Map();
            const unknown = [];
            for (const id of st.area) {
                const region = system.regions.get(id);
                const others = (db.index.regionSystems?.[id] || []).filter((sys) => sys !== st.sys);
                if (region) here.push({ id, region, others });
                else if (others.length) for (const sys of others) { if (!elsewhere.has(sys)) elsewhere.set(sys, []); elsewhere.get(sys).push(id); }
                else unknown.push(id);
            }
            const limit = here.length > 1 ? 5 : 12;
            const blocks2 = here.map(({ id, region, others }) => {
                const shape = region.ring ? t('areaRing', { name: mapLabel(system.byId.get(region.ring.of)).text, a: dist(region.ring.inner), b: dist(region.ring.outer) })
                    : region.band ? t('areaBand', { a: dist(region.band.inner), b: dist(region.band.outer) }) : region.noShape && !region.shared ? t('areaNoShape') : '';
                const at = (region.at || []).map((objectId) => system.byId.get(objectId)).filter(Boolean);
                return `<div class="starmap-area" data-area="${esc(id)}"><p class="starmap-big">${esc(regionName(region))}</p>
                    ${region.shared ? `<p class="starmap-note">${esc(t('areaSharedNote', { name: H.name(region.name) }))}</p>` : ''}
                    ${shape ? `<p>${region.band ? `<span class="starmap-tag is-guess">${esc(t('guess'))}</span> ` : ''}${esc(shape)}</p>` : ''}
                    <p class="starmap-note">${esc(tn('areaAt', at.length))}</p>
                    <ul class="starmap-marks">${placeItems(at, st.sys, limit)}</ul>
                    ${region.also?.length ? `<p class="starmap-note">${esc(t('areaAlso', { n: H.num(region.also.length) }))}</p>` : ''}
                    <a class="starmap-out" href="${esc(H.buildHash('mining', { loc: id }))}">${esc(t('linkMining'))}</a>
                    ${others.length ? `<p class="starmap-note">${esc(t('areaElsewhere', { name: others.map(systemName).join(' · ') }))}</p>` : ''}</div>`;
            });
            const elseHtml = [...elsewhere].map(([sys, ids]) => {
                const loaded = db.systems.get(sys);
                const names = loaded ? ids.map((id) => loaded.regions.get(id)).filter(Boolean).map(regionName) : [];
                return `<p><span>${esc(here.length || elsewhere.size > 1 || ids.length > 1 ? t('areasElse', { name: systemName(sys), n: H.num(ids.length) }) : t('areaElsewhere', { name: systemName(sys) }))}${names.length ? ` · ${esc(names.join(', '))}` : ''}</span>
                    <button type="button" class="starmap-tool" data-act="sys" data-id="${esc(sys)}">${esc(t('showThere', { name: systemName(sys) }))}</button></p>`;
            }).join('');
            blocks.push(`<section class="starmap-card is-area" data-over="area"><h3 class="starmap-h">${esc(st.area.length > 1 ? t('areasTitle', { n: H.num(st.area.length) }) : t('areaTitle'))}</h3>${blocks2.join('')}
                ${elseHtml ? `<div class="starmap-area-else">${elseHtml}</div>` : ''}
                ${unknown.map((id) => `<p class="starmap-warn">${esc(t('areaUnknown', { id }))}</p>`).join('')}
                <button type="button" class="starmap-tool" data-act="area-clear">${esc(t('areaClear'))}</button></section>`);
        }

        if (st.site) {
            const site = siteHere();
            const elsewhere = (db.index.siteSystems?.[st.site] || []).filter((sys) => sys !== st.sys);
            let body;
            if (!site) {
                body = elsewhere.length ? `<p>${elsewhere.map((sys) => `<button type="button" class="starmap-tool" data-act="sys" data-id="${esc(sys)}">${esc(t('showThere', { name: systemName(sys) }))}</button>`).join('')}</p>`
                    : `<p class="starmap-warn">${esc(t('siteUnknown', { id: st.site }))}</p>`;
            } else {
                const at = (site.at || []).map((objectId) => system.byId.get(objectId)).filter(Boolean);
                body = `${at.length ? `<p class="starmap-note">${esc(tn('siteAt', at.length))}</p><ul class="starmap-marks">${placeItems(at, st.sys, 12)}</ul>` : ''}
                    ${site.spots?.length ? `<p>${esc(tn('siteSpots', site.spots.length))}</p>` : ''}
                    ${(site.near || []).map((objectId) => { const object = system.byId.get(objectId); return object ? `<p><span class="starmap-tag is-guess">${esc(t('guess'))}</span> ${esc(t('siteNear', { name: nameOf(object) }))}</p>` : ''; }).join('')}`;
            }
            blocks.push(`<section class="starmap-card is-site" data-over="site"><h3 class="starmap-h">${esc(t('siteTitle'))}</h3>${body}<button type="button" class="starmap-tool" data-act="site-clear">${esc(t('siteClear'))}</button></section>`);
        }
        ui.parts.over.hidden = !blocks.length;
        paint(ui.parts.over, blocks.join(''));
    }

    // ── 동작 ──────────────────────────────────────────────────────────────
    function flash(message) {
        ui.flash = message;
        window.clearTimeout(ui.flashTimer);
        ui.flashTimer = window.setTimeout(() => { ui.flash = ''; if (ui.phase === 'ready') drawTop(); }, 4000);
        if (ui.phase === 'ready') drawTop();
        ui.parts.status.textContent = message;
    }
    // 목록에서 그곳이 보이도록 위 가지를 펼친다.
    function reveal(id) {
        const found = find(id);
        if (!found) return;
        const system = db.systems.get(found.sys);
        let at = system.anchor.get(found.id);
        if (!at && !['star', 'planet', 'moon'].includes(found.o.kind)) st.open.add(`g:${TOP_GROUPS.includes(found.o.kind) ? found.o.kind : 'other'}`);
        while (at) { st.open.add(`b:${at}`); at = system.anchor.get(at); }
    }
    async function switchSystem(sys, focus) {
        if (!SYSTEMS.includes(sys)) return;
        const token = ++ui.token;
        try {
            await ensureSystem(sys);
        } catch (error) {
            ui.phase = 'error'; ui.error = error; drawAll(); return;
        }
        if (token !== ui.token) return;
        st.sys = sys;
        st.focus = focus || null;
        if (st.focus) reveal(st.focus);
        syncHash(true);
        drawAll();
        loadViewerSystem();
        if (st.focus) alignStage(true);
    }
    // 휴대폰: 장소를 고르면 아래에서 정보 판이 올라온다. 지도가 화면 밖에 있거나 판에 가려지면 지도를 머리글 바로 아래로 올린다.
    function alignStage(force) {
        if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 699px)').matches || ui.view !== 'ready') return;
        const rect = ui.parts.view.getBoundingClientRect();
        if (force === true || rect.top < 56 || rect.bottom > window.innerHeight * 0.66 + 4) ui.parts.stage.scrollIntoView({ block: 'start', behavior: 'instant' });
        // 목록·검색 결과가 다시 그려지면서 지도가 조금 밀릴 수 있다. 잠깐 뒤에 한 번 더 맞춘다.
        if (force !== 'again') { window.clearTimeout(ui.alignTimer); ui.alignTimer = window.setTimeout(() => { if (st.focus && sectionOpen()) alignStage('again'); }, 220); }
    }
    function pick(id, options = {}) {
        const found = find(id);
        if (!found) return;
        if (st.measuring && !(st.measure.length === 1 && st.measure[0] === found.id)) {
            st.measure = st.measure.length >= 2 ? [found.id] : [...st.measure, found.id];
            if (st.measure.length === 2) { st.measuring = false; ensureCargo(); drawHud(); }
        }
        if (found.sys !== st.sys) { switchSystem(found.sys, found.id); return; }
        st.focus = found.id;
        ui.sheetOpen = false;
        reveal(found.id);
        syncHash();
        drawTree();
        drawInfo();
        drawOver();
        if (st.q) drawResults();
        syncViewer();
        if (!options.fromMap || !found.o.pos) viewer?.focus(focusTarget());
        ui.parts.status.textContent = t('picked', { name: nameOf(found.o) });
        if (options.fromList) refocus(`[data-act="pick"][data-id="${CSS.escape(found.id)}"]`, options.within);
        alignStage(Boolean(options.fromList) && Boolean(found.o.pos || found.o.guess));
    }
    function refocus(selector, within) {
        const node = (within && ui.parts[within] ? ui.parts[within] : ui.mount).querySelector(selector);
        node?.focus({ preventScroll: true });
    }
    function redrawFiltered() {
        syncHash();
        drawTree();
        syncViewer();
    }

    function onClick(event) {
        const target = event.target.closest('[data-act]');
        if (!target || !ui.mount.contains(target)) return;
        const act = target.dataset.act;
        const id = target.dataset.id;
        const within = ['tree', 'results', 'info', 'over'].find((key) => ui.parts[key]?.contains(target));
        if (act === 'retry') { openRoute(H.readHash(SECTION)); return; }
        if (ui.phase !== 'ready') return;
        if (act === 'sys') { if (id !== st.sys) switchSystem(id, null); return; }
        if (act === 'pick') { pick(id, { sys: target.dataset.sys, fromList: true, within }); return; }
        if (act === 'toggle') {
            if (st.open.has(id)) st.open.delete(id); else st.open.add(id);
            drawTree();
            refocus(`.starmap-toggle[data-id="${CSS.escape(id)}"]`, 'tree');
            return;
        }
        if (act === 'need' || act === 'need-open') {
            if (act === 'need-open') { st.need = [id]; if (st.focus) st.open.add(`b:${st.focus}`); } else st.need = st.need.includes(id) ? st.need.filter((flag) => flag !== id) : [...st.need, id];
            redrawFiltered();
            if (act === 'need') refocus(`[data-act="need"][data-id="${id}"]`, 'tree');
            else ui.parts.tree.querySelector(`[data-act="pick"][data-id="${CSS.escape(st.focus || '')}"]`)?.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (act === 'jump') {
            const jump = (cur().data.jumps || []).find((entry) => entry.id === id);
            if (!jump || jump.usable !== 1) return;
            ensureSystem(jump.to).then((system) => {
                const peer = (system.data.jumps || []).find((entry) => entry.id === jump.peer);
                switchSystem(jump.to, peer?.station || jump.peer);
            }).catch((error) => { ui.phase = 'error'; ui.error = error; drawAll(); });
            return;
        }
        if (act === 'home') { viewer?.focus(null); return; }
        if (act === 'zoom-in') { viewer?.zoomBy(0.6); return; }
        if (act === 'zoom-out') { viewer?.zoomBy(1.6); return; }
        if (act === 'refocus') { viewer?.focus(focusTarget()); ui.parts.view.scrollIntoView({ block: 'nearest' }); return; }
        if (act === 'sheet') { ui.sheetOpen = !ui.sheetOpen; drawInfo(); refocus('[data-act="sheet"]', 'info'); return; }
        if (act === 'clear') { st.focus = null; syncHash(); drawTree(); drawInfo(); syncViewer(); return; }
        if (act === 'measure') {
            st.measuring = !st.measuring;
            if (st.measuring) st.measure = [];
            syncHash(); drawHud(); drawOver(); syncViewer();
            refocus('[data-act="measure"]', 'hud');
            return;
        }
        if (act === 'measure-from') {
            st.measuring = true;
            st.measure = st.focus ? [st.focus] : [];
            syncHash(); drawHud(); drawOver(); syncViewer();
            return;
        }
        if (act === 'measure-clear') { st.measure = []; st.measuring = true; syncHash(); drawHud(); drawOver(); syncViewer(); return; }
        if (act === 'route-clear') { st.route = []; syncHash(); drawOver(); syncViewer(); return; }
        if (act === 'mark-clear') { st.mark = []; syncHash(); drawOver(); syncViewer(); return; }
        if (act === 'area-clear') { st.area = []; syncHash(); drawOver(); syncViewer(); return; }
        if (act === 'site-clear') { st.site = null; syncHash(); drawOver(); syncViewer(); return; }
        if (act === 'retry3d') { ui.view = 'idle'; startViewer(); return; }
        if (act === 'share' || act === 'share-place') {
            const params = act === 'share' ? hashParams() : { sys: find(st.focus)?.sys || st.sys, focus: st.focus };
            H.copyShareUrl(SECTION, params).then((ok) => flash(H.text(ok ? 'copied' : 'copyFailed')));
        }
    }
    function onChange(event) {
        const input = event.target;
        if (ui.phase !== 'ready' || !input.matches?.('input[type="checkbox"]')) return;
        const group = input.dataset.mapLabel;
        if (Object.hasOwn(labelGroups, group)) {
            if (input.checked) hiddenLabels.delete(group);
            else hiddenLabels.add(group);
            syncViewer();
            return;
        }
        ui.filtersOpen = true;
        if (input.dataset.filter === 'hidden') st.hidden = input.checked;
        else if (input.dataset.kind) st.off = input.checked ? st.off.filter((kind) => kind !== input.dataset.kind) : [...new Set([...st.off, input.dataset.kind])];
        else return;
        const selector = input.dataset.kind ? `input[data-kind="${input.dataset.kind}"]` : 'input[data-filter="hidden"]';
        redrawFiltered();
        refocus(selector, 'tree');
    }
    function onInput(event) {
        if (event.target !== ui.parts?.search || ui.phase !== 'ready') return;
        st.q = event.target.value;
        window.clearTimeout(ui.searchTimer);
        // 검색어를 지우면 결과 칸을 바로 비운다: 조금 뒤에 비우면 그 사이에 고른 장소의 지도가 위로 밀려 올라간다.
        if (st.q.trim()) ui.searchTimer = window.setTimeout(drawResults, 120); else drawResults();
        if (!ui.searchAll && st.q.trim()) {
            ensureAll().then(() => { ui.searchAll = true; drawResults(); }).catch(() => { ui.searchAll = true; drawResults(); });
        }
    }
    function onToggle(event) {
        if (event.target.classList?.contains('starmap-filters')) ui.filtersOpen = event.target.open;
        if (event.target.classList?.contains('starmap-how-labels')) ui.labelsOpen = event.target.open;
        if (event.target.classList?.contains('starmap-how')) ui.howOpen = event.target.open;
    }

    // ── 계약 (docs/helper-tools.md 2.1) ────────────────────────────────────
    function init(mount, ctx) {
        ui.mount = mount;
        ui.parts = build(mount);
        mount.addEventListener('click', onClick);
        mount.addEventListener('change', onChange);
        mount.addEventListener('input', onInput);
        mount.addEventListener('toggle', onToggle, true);
        window.VOLT_TRADE_ENGINE?.state?.subscribe?.(() => { if (ui.phase === 'ready') drawOver(); });
        // 이 화면을 떠나면 3D 자원을 내려놓고, 돌아오면 다시 만든다.
        const section = document.getElementById(SECTION);
        if (section && typeof MutationObserver === 'function') {
            new MutationObserver(() => { if (sectionOpen()) startViewer(); else stopViewer(); }).observe(section, { attributes: true, attributeFilter: ['class', 'data-helper-allowed'] });
        }
        drawAll();
        openRoute(ctx?.params || {});
    }
    function onRoute(params) {
        if (!ui.mount) return;
        openRoute(params || {});
    }
    function onLanguageChange() {
        if (!ui.mount) return;
        drawAll();
        syncViewer();
    }

    // ── 다른 화면의 "지도에서 보기" ────────────────────────────────────────
    // 무역·임무·채광 화면은 장소 옆에 이 링크를 단다. 지도에 보일 수 있는 곳인지 /data/starmap/links.json
    // (scripts/starmap/build-link-index.mjs 가 지도 자료에서 만든 작은 목록)으로 먼저 확인하고, 아니면 빈 글자를 돌려준다.
    // 함대원 확인을 통과한 화면에서만 부른다. 통과하지 못했으면 요청 자체를 하지 않는다.
    const MARK_LIMIT = 140;
    const PIN_PATH = 'M8 1.2a4.6 4.6 0 0 0-4.6 4.6c0 3.3 4.6 9 4.6 9s4.6-5.7 4.6-9A4.6 4.6 0 0 0 8 1.2Zm0 6.4a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z';
    const PIN = `<svg class="volt-map-link-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="${PIN_PATH}"/></svg>`;
    const linkDb = { promise: null, ready: false, sysOf: new Map(), guess: new Set(), uex: new Map(), areas: {}, sites: {}, flat: [] };
    const linksAllowed = () => Boolean(document.getElementById(SECTION)?.hasAttribute('data-helper-allowed'));
    function loadLinks() {
        if (linkDb.ready) return Promise.resolve(true);
        if (!linksAllowed()) return Promise.resolve(false);
        if (!linkDb.promise) {
            linkDb.promise = H.loadJson('/data/starmap/links.json').then((data) => {
                for (const group of ['places', 'guess']) {
                    for (const sys of SYSTEMS) {
                        for (const id of data[group]?.[sys] || []) { linkDb.sysOf.set(id, sys); linkDb.flat.push(id); if (group === 'guess') linkDb.guess.add(id); }
                    }
                }
                for (const [terminal, id] of Object.entries(data.uex || {})) linkDb.uex.set(String(terminal), id);
                linkDb.areas = data.areas || {};
                linkDb.sites = data.sites || {};
                linkDb.ready = true;
                return true;
            }).catch(() => { linkDb.promise = null; return false; });
        }
        return linkDb.promise;
    }
    // 장소 글자(게임 기록 이름 또는 UEX 터미널 번호) → { id, sys, guess } 또는 null(지도에 보일 수 없음).
    function linkPlace(token) {
        if (!linkDb.ready || token === null || token === undefined || token === '') return null;
        const text = String(token);
        const id = linkDb.sysOf.has(text) ? text : (/^\d+$/.test(text) ? linkDb.uex.get(text) : null);
        return id ? { id, sys: linkDb.sysOf.get(id), guess: linkDb.guess.has(id) } : null;
    }
    // 지도에 적힌 이름(게임 한글 패치 이름). 그 항성계 자료가 이미 올라와 있을 때만 바로 돌려준다.
    function linkName(id) {
        for (const system of db.systems.values()) { const object = system.byId.get(String(id)); if (object) return object.name ? H.name(object.name) : ''; }
        return '';
    }
    // 이름이 필요하면 그 장소가 있는 항성계 자료 하나를 받아 온다 (임무 화면의 장소 조건 줄).
    function loadLinkName(id) {
        const hit = linkPlace(id);
        if (!hit || !linksAllowed()) return Promise.resolve('');
        return ensureSystem(hit.sys).then(() => linkName(hit.id)).catch(() => '');
    }
    const linkArea = (id) => (linkDb.ready && Object.hasOwn(linkDb.areas, String(id)) ? linkDb.areas[String(id)] : null);
    function linkSite(id) {
        const site = linkDb.ready && Object.hasOwn(linkDb.sites, String(id)) ? linkDb.sites[String(id)] : null;
        if (!site) return null;
        const ids = (numbers) => (numbers || []).map((n) => linkDb.flat[n]).filter(Boolean);
        const at = ids(site.at);
        const near = ids(site.near);
        const first = at[0] || near[0];
        return { at, near, spots: site.spots || 0, sys: first ? linkDb.sysOf.get(first) : null };
    }
    // 화면이 준 값에서 지도에 보일 수 있는 것만 남긴다. 아무것도 안 남으면 null.
    //   focus: 장소 하나 · route: 장소들(순서대로, 둘 이상이 지도에 있어야 한다) · mark: 장소들 · area: 채광 구역 id(들) · site: 임무 현장 id
    function linkTarget(params) {
        if (!linkDb.ready) return null;
        const p = params || {};
        const arr = (value) => (Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value]);
        const out = {};
        let sys = null;
        let shown = 0;
        let total = 0;
        let guess = false;
        const see = (hit) => { sys = sys || hit.sys; guess = guess || hit.guess; };
        if (arr(p.focus).length) {
            total += 1;
            const hit = linkPlace(p.focus);
            if (hit) { out.focus = hit.id; see(hit); shown += 1; }
        }
        const route = arr(p.route);
        if (route.length) {
            const hits = route.map(linkPlace);
            total += route.length;
            if (hits.filter(Boolean).length >= 2) {
                out.route = route.map((token, n) => (hits[n] ? hits[n].id : String(token)));
                hits.filter(Boolean).forEach(see);
                shown += hits.filter(Boolean).length;
            }
        }
        const mark = arr(p.mark);
        if (mark.length) {
            const hits = [...new Map(mark.map(linkPlace).filter(Boolean).map((hit) => [hit.id, hit])).values()];
            total += new Set(mark.map(String)).size;
            if (hits.length) {
                const kept = hits.slice(0, MARK_LIMIT);
                out.mark = kept.map((hit) => hit.id);
                kept.forEach(see);
                shown += kept.length;
            }
        }
        const areas = arr(p.area).map(String).filter((id) => linkArea(id));
        total += arr(p.area).length;
        if (areas.length) { out.area = [...new Set(areas)]; sys = sys || linkArea(areas[0])[0]; shown += out.area.length; }
        if (arr(p.site).length) {
            total += 1;
            const site = linkSite(p.site);
            if (site) { out.site = String(p.site); sys = sys || site.sys; shown += 1; guess = guess || (!site.at.length && !site.spots); }
        }
        if (!Object.keys(out).length) return null;
        if (SYSTEMS.includes(p.sys)) sys = p.sys;
        if (sys) out.sys = sys;
        return { params: out, href: H.buildHash(SECTION, normalize(out)), shown, total, guess, kind: Object.keys(out).find((key) => key !== 'sys') };
    }
    // 링크 한 개의 HTML. 지도에 보일 것이 없으면 ''. opts: { name: 읽어 주는 이름, note: 옆에 작게 보일 말, count: true 면 "N곳"을 붙인다, cls: 덧붙일 class }
    function linkButton(params, opts = {}) {
        const target = linkTarget(params);
        if (!target) return '';
        const label = opts.name ? t('mapLinkName', { name: opts.name }) : t('actFocus');
        const count = opts.count ? tn('mapLinkCount', target.shown) : '';
        return `<a class="volt-map-link${opts.cls ? ` ${esc(opts.cls)}` : ''}" href="${esc(target.href)}" data-map-link="${esc(target.kind)}" aria-label="${esc(count ? `${label} (${count})` : label)}">${PIN}<span>${esc(t('actFocus'))}</span>${opts.note ? `<small>${esc(opts.note)}</small>` : ''}${count ? `<small>${esc(count)}</small>` : ''}${target.guess ? `<small class="volt-map-link-guess">${esc(t('guess'))}</small>` : ''}</a>`;
    }

    // 같은 링크를 요소로 만든다 (HTML 글자를 쓰지 않고 요소를 직접 붙이는 화면용: 무역플래너). 보일 것이 없으면 null.
    function linkNode(params, opts = {}) {
        const target = linkTarget(params);
        if (!target) return null;
        const label = opts.name ? t('mapLinkName', { name: opts.name }) : t('actFocus');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        for (const [key, value] of [['class', 'volt-map-link-icon'], ['viewBox', '0 0 16 16'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(key, value);
        const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        shape.setAttribute('fill-rule', 'evenodd');
        shape.setAttribute('d', PIN_PATH);
        svg.append(shape);
        return H.el('a', { class: `volt-map-link${opts.cls ? ` ${opts.cls}` : ''}`, href: target.href, 'data-map-link': target.kind, 'aria-label': label }, svg, H.el('span', { text: t('actFocus') }),
            ...(target.guess ? [H.el('small', { class: 'volt-map-link-guess', text: t('guess') })] : []));
    }

    window.VOLT_STARMAP = {
        init, onLanguageChange, onRoute,
        links: { load: loadLinks, ready: () => linkDb.ready, place: linkPlace, area: linkArea, site: linkSite, target: linkTarget, button: linkButton, node: linkNode, name: linkName, loadName: loadLinkName },
        // 다른 화면이 쓰는 입구: href({ focus, route: [...], mark: [...], area, site, sys }) → '#starmap?...'
        href: (params) => H.buildHash(SECTION, normalize(params)),
        open: (params) => H.go(SECTION, normalize(params)),
        debug: () => ({ phase: ui.phase, view: ui.view, state: { ...st, open: [...st.open] }, loaded: [...db.systems.keys()], viewer: viewer ? viewer.stats() : null, screenOf: (id) => viewer?.screenOf(id) || null }),
    };
})();
