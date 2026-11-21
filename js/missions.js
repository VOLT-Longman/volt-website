/**
 * VOLT 임무 찾기 (#missions) — 임무 목록 · 임무 상세 · 등급 계산기 · 등급 올리는 길.
 *
 * 자료: /data/contracts/missions.json (게임 파일에서 뽑은 값, scripts/contracts/build-contracts-data.mjs).
 *   - 자료에 없는 값은 0이 아니라 "게임 자료에 없음"으로 보여 준다. 보수 금액(pay = 'calc')은 추정하지 않는다.
 *   - 파일이 6 MB라서 섹션을 처음 열 때만 받고, 목록은 한 번에 PAGE개씩만 그린다.
 *     검색어를 치는 동안에는 결과 영역만 다시 그려 입력 칸이 끊기지 않는다.
 * 계약: docs/helper-tools.md. 이 파일과 css/missions.css, tests/smoke/missions.spec.js 만 이 화면의 것이다.
 *
 * 주소(#missions?...) 키 — 공유 주소가 화면을 그대로 되살린다.
 *   link 키: m = 임무 id (상세 화면; tab=rank 와 같이 오면 계산기의 임무), tab = list | rank | path
 *            place = 장소 (게임 기록 이름, 성계지도의 장소 id) — 그곳에서 나오거나 그곳이 임무 장소 후보인 임무만 보여 준다 (성계지도가 보낸다)
 *   목록:   q 검색어 · view = table · sort (앞에 '-' 면 내림차순) · type, sys, org, con, scope, ev, flag (포함/제외 칩)
 *           con 값은 의뢰처 영어 이름으로 만든 글자(예: ling-family-hauling) — 자료를 다시 만들어도 바뀌지 않는다.
 *           scu = "최소-최대" · box = 가장 큰 상자 상한 · rank = 내 등급(평판 종류 칩을 하나만 포함했을 때)
 *   등급 계산기: cm = 계산할 임무 id · rep = 지금 평판 · pair = "세력.평판종류"
 *   등급 올리는 길: pp = "세력.평판종류" · prep = 지금 평판 · pto = 목표 등급 번호 · psys = 성계
 *
 * 공개 형태: window.VOLT_MISSIONS = { init(mount, ctx), onLanguageChange(lang), onRoute(params) }
 */
(function () {
    'use strict';

    const H = window.VOLT_HELPER;
    const SECTION = 'missions';
    const DATA_URL = '/data/contracts/missions.json';
    const PAGE = 30;
    const PICK_PAGE = 12;
    const CHIP_KEYS = ['type', 'sys', 'org', 'con', 'scope', 'ev', 'flag'];
    const FLAGS = ['illegal', 'share', 'once', 'bp', 'cargo', 'combat', 'items', 'event'];
    const SORTS = ['title', 'rank', 'rep', 'pay', 'scu', 'time', 'contractor', 'type', 'system', 'box'];
    const sortLabel = key => t(({ contractor: 'colCon', type: 'colType', system: 'colSys', box: 'colBox' })[key] || 'sort_' + key);
    const BOXES = [1, 2, 4, 8, 16, 24, 32];
    const SLOT_KEYS = ['slotDone', 'slotProgress', 'slotFailed', 'slotAbandoned', 'slotWithdrawn'];
    const AXES = ['axisSkill', 'axisMind', 'axisRisk', 'axisKnow'];

    const TEXT = {
        ko: {
            loading: '임무 자료를 불러오는 중입니다… (처음 한 번만 받습니다)', retry: '다시 시도',
            tabs: '임무 도구', tabList: '임무 목록', tabRank: '등급 계산기', tabPath: '등급 올리는 길',
            share: '이 화면 주소 복사', haulingLink: '운송 평판 등급표는 운송 계약 화면에 있습니다', haulingGo: '운송 계약 열기',
            search: '임무 검색', searchPh: '찾을 말', searchHint: '임무 이름, 의뢰처, 설명 글, 임무 종류, 세력, 화물, 장소 이름에서 찾습니다.', filters: '걸러 보기', filtersOn: '걸러 보기 ({n}개 적용)',
            chipHelp: '한 번 누르면 그것만 보기(＋), 한 번 더 누르면 빼고 보기(−), 또 누르면 풀립니다.', clear: '조건 모두 풀기',
            fType: '임무 종류', fSys: '임무가 나오는 행성계', fOrg: '평판을 주는 세력', fCon: '의뢰처', fScope: '평판 종류', fEv: '이벤트', fFlag: '특징',
            flag_illegal: '불법', flag_share: '공유 가능', flag_once: '한 번만', flag_bp: '설계도 보상', flag_cargo: '화물 있음', flag_combat: '교전 있음', flag_items: '물품 보상', flag_event: '이벤트 때만',
            repeatable: '반복 가능', legal: '합법',
            scuRange: '화물 양 (SCU)', scuMin: '최소 SCU', scuMax: '최대 SCU', scuNote: '화물 양을 정하면 화물 양이 자료에 적힌 임무만 남습니다.', scuFlip: '최소 화물 양이 최대보다 큽니다. 두 값을 바꿔 보세요.',
            box: '가장 큰 상자', boxAny: '상관없음', boxUpTo: '{n} SCU 이하', boxNote: '그보다 큰 상자가 필요한 화물 임무만 뺍니다. 상자 크기가 자료에 없는 화물 임무와 화물이 없는 임무는 남습니다. 화물 임무만 보려면 특징에서 ‘화물 있음’을 고르세요.', boxUnknownCount: '이 중 {n}개는 화물 상자 크기가 게임 자료에 없어 내 배에 맞는지 알 수 없습니다.', boxNoData: '상자 크기 게임 자료에 없음',
            myRank: '내 등급', rankAny: '상관없음', rankNeedScope: '평판 종류를 하나만 ‘포함’으로 고르면 내 등급으로 거를 수 있습니다.',
            viewLabel: '보기 방식', viewTiles: '카드', viewTable: '표', sortLabel: '정렬', sortDefault: '기본 (세력 · 등급 순, 이벤트 임무는 뒤)',
            sort_title: '이름', sort_rank: '필요 등급', sort_rep: '평판 보상', sort_pay: '보수', sort_scu: '화물 양', sort_time: '예상 시간',
            asc: '오름차순', desc: '내림차순', sortDir: '정렬 방향',
            count: '{total}개 중 {n}개', noResult: '조건에 맞는 임무가 없습니다. 조건을 줄여 보세요.', more: '{n}개 더 보기',
            colTitle: '임무', colCon: '의뢰처', colType: '종류', colSys: '행성계', colRank: '필요 등급', colRep: '평판', colPay: '보수', colCargo: '화물', colBox: '가장 큰 상자', colPlace: '장소', dropped: '주소에 있던 조건 {n}개는 지금 자료에 없어 뺐습니다.',
            noTitle: '이름 없는 임무', noName: '이름 없음', rankNo: '{n}단계', token: '게임에서 정해짐', tokenHint: '게임 안에서 채워지는 자리입니다',
            tok_location: '장소', tok_destination: '목적지', tok_target: '목표', tok_creature: '생물', tok_ship: '함선', tok_item: '물품', tok_system: '행성계', tok_amount: '수량', tok_code: '번호', tok_person: '요청한 사람', tok_pay: '보수', tok_contractor: '의뢰처 문구',
            payCalc: '금액이 게임 자료에 없음', payNone: '돈 보상 없음', payMax: '최대 {v}', repCalc: '양이 게임 자료에 없음', repNone: '평판 보상 없음',
            rankRange: '{a} ~ {b}', rankFrom: '{a} 이상', rankUpTo: '{b} 이하', rankNone: '등급 조건 없음', anySys: '행성계 정보 없음',
            back: '목록으로', calcThis: '이 임무로 등급 계산', alsoShown: '게임에서 이렇게도 보입니다', variantNote: '어느 문구가 보일지는 게임 자료에 없습니다.',
            secBrief: '임무 설명', briefAlt: '다른 설명 문구 {n}개', noBrief: '설명 글이 게임 자료에 없습니다.',
            patchNote: '한글 패치에 덧붙은 참고 글 보기', patchWarn: '아래 글은 게임에 나오는 임무 설명이 아니라 한글 패치를 만든 분들이 덧붙인 참고 글입니다. 평판, 대기 시간, 난이도(7단계로 적음), 적 수가 이 화면의 값과 다를 수 있습니다. 다를 때는 이 화면의 다른 칸에 있는 값이 게임 파일 값입니다.',
            secReq: '받는 조건', secReward: '보상', secPay: '보수', secRep: '평판', secHaul: '화물 주문', secSites: '임무 장소', secCombat: '교전', secPre: '먼저 해야 하는 일',
            secEvent: '이벤트', secBp: '설계도 보상', secItems: '물품 보상', secOdd: '자료에서 이상한 점', secVariants: '다른 지역판 {n}개', secCooldown: '다시 받기',
            reqRank: '필요 등급', reqRankBy: '{org} · {scope}', reqRep: '평판 {v} 이상', offered: '임무가 나오는 곳', offeredNote: '임무를 받을 수 있는 곳입니다. 실제로 임무를 하는 곳과 다를 수 있습니다.',
            sysBy_sites: '행성계는 임무 장소 조건에서 읽은 값입니다.', sysBy_mixed: '받는 곳 조건과 임무 장소 조건이 서로 다른 행성계를 가리킵니다. 어느 쪽이 맞는지 게임 자료로는 알 수 없습니다.',
            legality: '합법 여부', legalYes: '합법', legalNo: '불법', sharing: '공유', shareYes: '일행과 공유할 수 있음', shareNo: '공유할 수 없음', shareDef: '(임무 틀의 기본값)',
            repeat: '반복', onceYes: '한 번만 할 수 있음', onceNo: '여러 번 할 수 있음', players: '한 임무 인원', playersValue: '최대 {n}명', playersAny: '제한 없음으로 적힘 (-1)',
            timeEst: '예상 시간', timeNote: '분 단위는 값 크기로 미룬 것입니다', deadline: '제한 시간 값', deadlineNote: '단위가 게임 자료에 적혀 있지 않습니다',
            buyIn: '받을 때 내는 돈', rental: '빌려주는 탈것', rentalValue: '{name} · {time}', crime: '범죄 등급', crimeValue: '{a} ~ {b}일 때만 받을 수 있음',
            cdAfter: '끝낸 뒤 다시 받기까지', cdOff: '대기 시간이 꺼져 있음 (적힌 값 {v})', cdAbandon: '포기한 뒤 다시 받기까지', plusMinus: '{v} (±{d})',
            reAbandon: '포기한 뒤 다시 받기', reFail: '실패한 뒤 다시 받기', can: '가능', cannot: '불가', cdNote: '분 단위는 2880(48시간) · 10080(7일) 같은 값에서 미룬 것이며 게임에서 재 본 값이 아닙니다.',
            payFixed: '정해진 금액', payInputs: '보수 계산에 쓰이는 값 (계산식은 게임 자료에 없음)', payReason: '이 임무의 보수는 게임이 계산해서 정하는데, 금액도 계산식도 게임 파일에 없습니다. 그래서 금액을 추정하지 않습니다.',
            profile: '난이도 묶음', weights: '비중', axisSkill: '조작 실력', axisMind: '신경 쓸 일', axisRisk: '잃을 위험', axisKnow: '게임 지식', level: '{n} / 8', levelNote: '단계 설명은 게임 파일의 영문 이름을 우리말로 옮긴 것입니다.',
            rankBonus: '등급에 따른 보수 추가 (게임 파일 값)', partial: '일부만 끝냈을 때', partialBand: '끝낸 비율 {a}~{b}%', partialPay: '보수 ×{v}', partialRep: '평판 ×{v}', partialAmount: '약 {v}',
            slotDone: '끝냈을 때', slotProgress: '진행 중', slotFailed: '실패했을 때', slotAbandoned: '포기했을 때', slotWithdrawn: '철회됐을 때',
            slotNote: '어느 결과에 주는지는 게임 파일의 칸 순서에서 미룬 것입니다.', repLine: '{org} · {scope}', givesTag: '끝내면 받는 완료 표시', points: '이벤트 점수',
            order: '주문 {n}', orderTotal: '화물 합계', pickups: '싣는 곳 {n}곳', dropoffs: '내리는 곳 {n}곳', maxBox: '가장 큰 상자 {n} SCU', boxValue: '상자 {n} SCU 이하', boxUnset: '상자 크기 제한 없음으로 읽음 (확인 안 됨)',
            placeFilter: '장소: {name}', placeNote: '이곳에서 나오는 임무와, 이곳이 임무 장소 후보에 들어 있는 임무만 보여 줍니다.', placeWait: '임무 장소 자료를 확인하는 중입니다…', placeClear: '장소 조건 풀기',
            mapAll: '후보 모두', fromTo: '{a} → {b}', pickupN: '싣는 곳 {n}', dropoffN: '내리는 곳 {n}', pickup: '싣는 곳', dropoff: '내리는 곳', site: '임무 장소',
            pieces: '{n}개', anyOf: '다음 중 하나', setOf: '{name} 종류 중 아무거나', setMembers: '해당 물품 {n}종', missionItem: '임무 물품', taggedItem: '임무가 지정한 물품', haulNote: '주문마다 적힌 그대로입니다. 같은 화물이라도 합치지 않습니다.',
            siteNamed: '후보 {n}곳', siteMany: '후보 {n}곳 (목록이 길어 싣지 않음)', siteUnknown: '후보를 게임 자료에서 찾지 못함', siteDyn: '실제 임무에서는 다른 조건으로 더 좁혀집니다', siteNeed: '이 중 {a}~{b}곳', siteTimes: '같은 조건의 장소 {n}곳', unnamedPlace: '이름 없는 장소',
            cShips: '함선', cNpcs: '사람(지상 · 선내)', cCreatures: '생물 · 물건', cNums: '교전 설정 값', cGroup: '무리', cEach: '{n}척', cEachNpc: '{n}', cAlt: '다음 중 하나', cWeight: '비중 {v}',
            npcSpawn: '한 번에 {a}~{b}명씩, 동시에 최대 {c}명, 모두 {d}명까지', npcOpts: '후보 {n}가지 중 하나', tagsNote: '분류 꼬리표는 게임 파일에 적힌 영문 그대로입니다. 실제 함선 모델은 게임이 그때그때 고릅니다.',
            chanceNote: '확률 값은 게임 파일에 적힌 그대로입니다. 0~1로 적힌 것과 0~100으로 적힌 것이 섞여 있습니다.',
            role_ace: '에이스 조종사', role_wave: '{n}차 증원', role_reinforce: '증원', role_interdict: '이동 중 끼어드는 무리', role_ambush: '매복', role_boss: '우두머리', role_friend: '지키거나 다뤄야 하는 쪽', role_enemy: '적', role_other: '기타',
            num_ace: '에이스 조종사가 나올 확률 값', num_reinforce: '증원이 올 확률 값', num_ambush: '매복 확률 값', num_interdict: '이동 중 끼어들 확률 값', num_encounter: '교전이 생길 확률 값',
            num_waves: '물결(증원) 수', num_delay: '물결 사이 간격 (단위 표시 없음)', num_maxships: '한 번에 나오는 함선 최대 수', num_zones: '지켜야 하는 구역 수', num_search: '찾아야 하는 곳 수', num_kill: '처치해야 하는 수', num_wavecount: '{n}차 물결의 수', num_child: '하위 임무 수',
            preDone: '선행 임무 완료 기록이 필요합니다', preDoneN: '선행 임무 완료 기록이 {n}만큼 필요합니다', preNot: '해당 임무를 이미 완료했다면 받을 수 없습니다', preGivers: '같은 세력에서 이 표시를 주는 임무', preGiversNone: '이 표시를 주는 임무를 같은 세력 안에서 찾지 못했습니다.',
            preRep: '{org} · {scope} 등급 {range}', preRepEx: '{org} · {scope} 등급이 {range}이면 받을 수 없습니다', preRepExAny: '{org} · {scope} 평판에 제외 조건이 걸려 있습니다 (범위 표시 없음)', preNone: '먼저 해야 하는 일이 자료에 없습니다.',
            evOnly: '이 임무는 이벤트 ‘{name}’ 때만 나옵니다.', evNow: '지금 이벤트가 열려 있는지는 게임 자료로 알 수 없습니다.', evOnInFile: '(게임 파일에는 켜짐으로 표시)',
            bpChance: '나올 확률 {v}', bpFrom: '아래 묶음에서 나옵니다. 한 번에 몇 개가 나오는지는 게임 자료에 없습니다.', bpWeight: '비중 {v}', bpNull: '빈 칸 (비중 {v}) — 나올 확률을 낮추는지는 알 수 없습니다', bpOpen: '{name} 제작 설계도 보기', bpSlot: '{slot}',
            itemTimes: '{name} × {n}', itemWeighted: '다음 묶음 중 하나 (비중 {v})',
            odd_templateMissing: '임무 틀이 게임 파일에 없습니다. 게임에 나오지 않을 수 있습니다.', odd_templateNotForRelease: '임무 틀에 ‘출시용 아님’ 표시가 있습니다. 게임에 나오지 않을 수 있습니다.',
            odd_rankButNoRep: '등급 조건은 있는데 평판 보상이 없습니다.', odd_repOtherFaction: '평판 보상이 다른 세력을 가리킵니다.', odd_resultNoSlot: '어느 결과에 주는지 표시가 없는 보상이 있습니다. 보상으로 세지 않았습니다.',
            oddNote: '게임 자료가 서로 안 맞아 보이는 곳입니다. 게임에서 확인한 내용이 아닙니다.', oddNoSlot: '결과 칸이 없는 값', oddRes_pay: '돈', oddRes_item: '물품', oddRes_tags: '완료 표시', oddRes_refund: '환불 배수', oddRes_bp: '설계도 묶음', oddRes_rep: '평판',
            oddIllegal: '합법 여부가 게임 자료에 없습니다.', oddBySrc: '세력은 평판 보상에서 읽은 값입니다.', oddRaw: '설명이 채워지지 않은 자리 표시뿐입니다.',
            vSwap: '{a} 대신 {b}', vSame: '같은 임무가 장소만 바뀌어 여러 개 있습니다. 목록에는 하나로 묶어 보여 줍니다.',
            rankPick: '계산할 임무', rankPickHint: '임무 이름으로 찾아 고르세요. 평판을 주는 임무만 나옵니다.', rankChange: '다른 임무 고르기', pickCount: '찾은 임무 {total}개 중 {n}개', pickMore: '{n}개 더 보기', rankNoMission: '아직 임무를 고르지 않았습니다. 위에서 찾아 고르거나, 임무 목록에서 임무를 연 뒤 ‘이 임무로 등급 계산’을 누르세요.',
            rankNoRep: '이 임무는 끝냈을 때 주는 평판 양이 게임 자료에 없어 계산할 수 없습니다.', rankWhich: '어느 평판을 볼까요', rankNow: '지금 내 평판', rankNowHint: '비워 두면 시작 값 {v}로 계산합니다.',
            rankPer: '한 번 끝낼 때 +{v}', rankLoss: '{slot} {v}', rankNowAt: '지금 등급: {name}', colRankName: '등급', colNeed: '필요 평판', colLeft: '남은 평판', colRuns: '이 임무 횟수',
            reached: '도달함', runs: '{n}회', gated: '관문 표시', gatedNote: '‘관문 표시’는 게임 파일에 있는 표시이며 뜻은 자료에 설명이 없습니다.', ceiling: '이 평판의 상한: {v}', repOver: '적은 평판이 게임 파일에 적힌 상한({v})보다 큽니다. 값을 다시 확인해 주세요.',
            rankWindow: '이 임무는 {range} 등급에서만 받을 수 있습니다. 그 범위를 벗어난 등급의 횟수는 참고용입니다.', rankOther: '이 임무의 등급 조건은 다른 평판({name})에 걸려 있습니다.', refOnly: '참고',
            partyNote: '일행과 함께 할 때 평판을 어떻게 나누는지는 게임 자료에 없어 계산하지 않습니다.', calcNote: '횟수 = 남은 평판 ÷ 한 번에 받는 평판 (올림). 게임 파일 값이며 서버 설정으로 달라질 수 있습니다.',
            pathPair: '세력 · 평판 종류', pathNow: '지금 내 평판', pathTo: '목표 등급', pathSys: '행성계', pathSysAny: '모든 행성계', pathPick: '세력과 평판 종류를 고르세요.',
            pathStep: '{a} → {b}', pathNeed: '평판 {v} 더 필요', pathBest: '반복해서 하기 좋은 임무 (한 번에 +{v})', pathRuns: '{n}회 반복', pathNoRepeat: '이 등급에서 평판을 주는 반복 임무가 게임 자료에 없습니다. 여기서부터는 계산할 수 없습니다.',
            pathOnce: '한 번만 할 수 있는 임무 (하면 그만큼 횟수가 줄어듭니다)', pathUnlock: '{name} 등급이 되면 새로 열리는 임무 {n}개', pathMore: '외 {n}개', pathTotal: '반복 임무 합계 {n}회', pathDone: '이미 목표 등급입니다.',
            pathCross: '등급 조건이 다른 평판에 걸림', pathNote: '평판 값만으로 만든 단순한 계산입니다. 임무 장소, 다시 받기 대기 시간, 먼저 해야 하는 임무, 이벤트 여부는 따지지 않았습니다. 이벤트 때만 나오는 임무와 출시용이 아닌 임무는 뺐습니다.',
            dataNote: '서버 설정에 따라 값이 달라질 수 있습니다. 빈칸은 값 미확인을 뜻합니다.',
        },
        en: {
            loading: 'Loading mission data… (downloaded once)', retry: 'Retry',
            tabs: 'Mission tools', tabList: 'Missions', tabRank: 'Rank calculator', tabPath: 'Rank progression',
            share: 'Copy link to this view', haulingLink: 'The hauling reputation ladder is on the Hauling Contracts screen', haulingGo: 'Open Hauling Contracts',
            search: 'Search missions', searchPh: 'Search text', searchHint: 'Searches mission name, contractor, briefing, mission type, faction, cargo and place names.', filters: 'Filters', filtersOn: 'Filters ({n} active)',
            chipHelp: 'Press once to show only that (＋), again to leave it out (−), a third time to clear.', clear: 'Clear all filters',
            fType: 'Mission type', fSys: 'System where it is offered', fOrg: 'Faction giving reputation', fCon: 'Contractor', fScope: 'Reputation type', fEv: 'Event', fFlag: 'Traits',
            flag_illegal: 'Illegal', flag_share: 'Sharable', flag_once: 'Once only', flag_bp: 'Blueprint reward', flag_cargo: 'Has cargo', flag_combat: 'Has combat', flag_items: 'Item reward', flag_event: 'Event only',
            repeatable: 'Repeatable', legal: 'Legal',
            scuRange: 'Cargo amount (SCU)', scuMin: 'Min SCU', scuMax: 'Max SCU', scuNote: 'With a cargo amount set, only missions whose cargo amount is in the data remain.', scuFlip: 'The minimum cargo amount is larger than the maximum. Try swapping them.',
            box: 'Largest box', boxAny: 'Any', boxUpTo: '{n} SCU or smaller', boxNote: 'Drops only cargo missions that need a bigger box. Cargo missions with no box size in the data and missions without cargo stay. To see cargo missions only, pick “Has cargo” under Traits.', boxUnknownCount: '{n} of these have no cargo box size in the game files, so whether they fit your ship is unknown.', boxNoData: 'box size not in the game files',
            myRank: 'My rank', rankAny: 'Any', rankNeedScope: 'Set exactly one reputation type to “include” to filter by your rank.',
            viewLabel: 'Layout', viewTiles: 'Cards', viewTable: 'Table', sortLabel: 'Sort', sortDefault: 'Default (faction, rank; event missions last)',
            sort_title: 'Name', sort_rank: 'Rank needed', sort_rep: 'Reputation', sort_pay: 'Payout', sort_scu: 'Cargo amount', sort_time: 'Expected time',
            asc: 'Ascending', desc: 'Descending', sortDir: 'Sort direction',
            count: '{n} of {total}', noResult: 'No missions match. Try fewer filters.', more: 'Show {n} more',
            colTitle: 'Mission', colCon: 'Contractor', colType: 'Type', colSys: 'System', colRank: 'Rank needed', colRep: 'Reputation', colPay: 'Payout', colCargo: 'Cargo', colBox: 'Largest box', colPlace: 'Place', dropped: '{n} filter value(s) in the link are not in the current data and were removed.',
            noTitle: 'Untitled mission', noName: 'No name', rankNo: 'Step {n}', token: 'set in game', tokenHint: 'Filled in by the game',
            tok_location: 'location', tok_destination: 'destination', tok_target: 'target', tok_creature: 'creature', tok_ship: 'ship', tok_item: 'item', tok_system: 'system', tok_amount: 'amount', tok_code: 'code', tok_person: 'requester', tok_pay: 'payout', tok_contractor: 'contractor text',
            payCalc: 'Amount not in the game files', payNone: 'No money reward', payMax: 'up to {v}', repCalc: 'amount not in the game files', repNone: 'No reputation reward',
            rankRange: '{a} – {b}', rankFrom: '{a} or higher', rankUpTo: 'up to {b}', rankNone: 'No rank requirement', anySys: 'No system in the data',
            back: 'Back to list', calcThis: 'Calculate ranks with this mission', alsoShown: 'Also shown in game as', variantNote: 'Which wording the game shows is not in the game files.',
            secBrief: 'Briefing', briefAlt: '{n} other briefing texts', noBrief: 'No briefing text in the game files.',
            patchNote: 'Show the note added by the Korean patch', patchWarn: 'The text below is not the in-game briefing. It was added by the authors of the Korean language patch. Its reputation, wait time, difficulty (written out of 7) and enemy counts can differ from this screen. Where they differ, the other blocks on this screen show the game file values.',
            secReq: 'Requirements', secReward: 'Rewards', secPay: 'Payout', secRep: 'Reputation', secHaul: 'Hauling orders', secSites: 'Mission sites', secCombat: 'Combat', secPre: 'Prerequisites',
            secEvent: 'Event', secBp: 'Blueprint reward', secItems: 'Item rewards', secOdd: 'Data oddities', secVariants: '{n} other location versions', secCooldown: 'Taking it again',
            reqRank: 'Rank needed', reqRankBy: '{org} · {scope}', reqRep: '{v} reputation or more', offered: 'Offered at', offeredNote: 'Where the mission can be accepted. It may take place somewhere else.',
            sysBy_sites: 'The system was read from the mission-site conditions.', sysBy_mixed: 'The offer condition and the mission-site condition name different systems. The game files do not say which applies.',
            legality: 'Legality', legalYes: 'Legal', legalNo: 'Illegal', sharing: 'Sharing', shareYes: 'Can be shared with your party', shareNo: 'Cannot be shared', shareDef: '(mission template default)',
            repeat: 'Repeat', onceYes: 'Can be done once only', onceNo: 'Can be repeated', players: 'Players per mission', playersValue: 'up to {n}', playersAny: 'stored as unlimited (-1)',
            timeEst: 'Expected time', timeNote: 'minutes is assumed from the size of the value', deadline: 'Time limit value', deadlineNote: 'the game files give no unit',
            buyIn: 'Fee to accept', rental: 'Vehicle on loan', rentalValue: '{name} · {time}', crime: 'Crime rating', crimeValue: 'only at {a} – {b}',
            cdAfter: 'Wait after finishing', cdOff: 'Cooldown switched off (stored value {v})', cdAbandon: 'Wait after abandoning', plusMinus: '{v} (±{d})',
            reAbandon: 'Take again after abandoning', reFail: 'Take again after failing', can: 'yes', cannot: 'no', cdNote: 'Minutes is assumed from values such as 2880 (48 h) and 10080 (7 d); it was not timed in game.',
            payFixed: 'Fixed amount', payInputs: 'Values the payout calculation appears to use (the formula is not in the game files)', payReason: 'The game calculates this payout, and neither the amount nor the formula is in the game files. No amount is estimated here.',
            profile: 'Difficulty profile', weights: 'weights', axisSkill: 'Handling skill', axisMind: 'Attention needed', axisRisk: 'Risk of loss', axisKnow: 'Game knowledge', level: '{n} / 8', levelNote: 'Level descriptions are the names written in the game files.',
            rankBonus: 'Extra payout by rank (game file values)', partial: 'If only partly completed', partialBand: '{a}–{b}% completed', partialPay: 'payout ×{v}', partialRep: 'reputation ×{v}', partialAmount: 'about {v}',
            slotDone: 'On completion', slotProgress: 'In progress', slotFailed: 'On failure', slotAbandoned: 'On abandoning', slotWithdrawn: 'When withdrawn',
            slotNote: 'Which outcome a reward belongs to is inferred from the slot order in the game files.', repLine: '{org} · {scope}', givesTag: 'Completion marks you receive', points: 'Event points',
            order: 'Order {n}', orderTotal: 'Total cargo', pickups: '{n} pickup(s)', dropoffs: '{n} drop-off(s)', maxBox: 'largest box {n} SCU', boxValue: 'boxes up to {n} SCU', boxUnset: 'read as no box size limit (not verified)',
            placeFilter: 'Place: {name}', placeNote: 'Only missions offered here, and missions that list this place as a possible mission site.', placeWait: 'Checking mission-site data…', placeClear: 'Clear place filter',
            mapAll: 'all candidates', fromTo: '{a} → {b}', pickupN: 'Pickup {n}', dropoffN: 'Drop-off {n}', pickup: 'Pickup', dropoff: 'Drop-off', site: 'Mission site',
            pieces: '× {n}', anyOf: 'One of', setOf: 'any {name}', setMembers: '{n} matching items', missionItem: 'Mission item', taggedItem: 'Item chosen by the mission', haulNote: 'Listed per order as written. Identical cargo in separate orders is not merged.',
            siteNamed: '{n} candidate(s)', siteMany: '{n} candidates (list too long to show)', siteUnknown: 'candidates not found in the game files', siteDyn: 'the live mission narrows this further by other conditions', siteNeed: '{a}–{b} of these', siteTimes: '{n} sites with the same condition', unnamedPlace: 'Unnamed place',
            cShips: 'Ships', cNpcs: 'People (on foot)', cCreatures: 'Creatures and objects', cNums: 'Combat settings', cGroup: 'Group', cEach: '{n} ship(s)', cEachNpc: '{n}', cAlt: 'one of', cWeight: 'weight {v}',
            npcSpawn: '{a}–{b} at a time, up to {c} at once, {d} in total', npcOpts: 'one of {n} options', tagsNote: 'Class tags are the labels written in the game files. The game picks the actual ship model at run time.',
            chanceNote: 'Chance values are shown as stored. Some are written on a 0–1 scale and some on 0–100.',
            role_ace: 'Ace pilot', role_wave: 'Reinforcement wave {n}', role_reinforce: 'Reinforcements', role_interdict: 'Group that cuts in during travel', role_ambush: 'Ambush', role_boss: 'Boss', role_friend: 'Side to protect or handle', role_enemy: 'Hostile', role_other: 'Other',
            num_ace: 'Ace pilot chance value', num_reinforce: 'Reinforcement chance value', num_ambush: 'Ambush chance value', num_interdict: 'Interdiction chance value', num_encounter: 'Encounter chance value',
            num_waves: 'Number of waves', num_delay: 'Delay between waves (no unit given)', num_maxships: 'Most ships at once', num_zones: 'Zones to defend', num_search: 'Places to search', num_kill: 'Number to eliminate', num_wavecount: 'Size of wave {n}', num_child: 'Number of sub-missions',
            preDone: 'A prerequisite mission completion is required', preDoneN: 'Required prerequisite completion marks: {n}', preNot: 'Unavailable if the excluded mission was completed', preGivers: 'Missions of the same faction that give this mark', preGiversNone: 'No mission of the same faction gives this mark.',
            preRep: '{org} · {scope} rank {range}', preRepEx: 'Not available while {org} · {scope} rank is {range}', preRepExAny: '{org} · {scope} reputation has an exclusion condition (no range given)', preNone: 'No prerequisites in the data.',
            evOnly: 'This mission appears only during the event “{name}”.', evNow: 'The game files do not say whether the event is running now.', evOnInFile: '(marked enabled in the game files)',
            bpChance: 'Drop chance {v}', bpFrom: 'Comes from the pool below. How many drop at once is not in the game files.', bpWeight: 'weight {v}', bpNull: 'Empty entry (weight {v}) — whether it lowers the chance is unknown', bpOpen: 'Open the {name} blueprint', bpSlot: '{slot}',
            itemTimes: '{name} × {n}', itemWeighted: 'One of these sets (weight {v})',
            odd_templateMissing: 'The mission template is missing from the game files. It may not appear in game.', odd_templateNotForRelease: 'The mission template is flagged “not for release”. It may not appear in game.',
            odd_rankButNoRep: 'It has a rank requirement but no reputation reward.', odd_repOtherFaction: 'The reputation reward points at another faction.', odd_resultNoSlot: 'A reward has no outcome set. It is not counted as a reward.',
            oddNote: 'Places where the game data looks inconsistent. Not checked in game.', oddNoSlot: 'Values with no outcome slot', oddRes_pay: 'money', oddRes_item: 'item', oddRes_tags: 'completion marks', oddRes_refund: 'refund multiplier', oddRes_bp: 'blueprint pool', oddRes_rep: 'reputation',
            oddIllegal: 'Legality is not in the game files.', oddBySrc: 'The faction was read from the reputation reward.', oddRaw: 'The briefing is only an unfilled placeholder.',
            vSwap: '{b} instead of {a}', vSame: 'The same mission exists several times with only the place changed. The list shows it once.',
            rankPick: 'Mission to calculate', rankPickHint: 'Find a mission by name. Only missions that give reputation are listed.', rankChange: 'Pick another mission', pickCount: '{n} of {total} missions found', pickMore: 'Show {n} more', rankNoMission: 'No mission chosen yet. Find one above, or open a mission in the list and press “Calculate ranks with this mission”.',
            rankNoRep: 'The reputation this mission gives on completion is not in the game files, so nothing can be calculated.', rankWhich: 'Which reputation', rankNow: 'My reputation now', rankNowHint: 'Leave empty to use the starting value {v}.',
            rankPer: '+{v} per completion', rankLoss: '{slot} {v}', rankNowAt: 'Current rank: {name}', colRankName: 'Rank', colNeed: 'Reputation needed', colLeft: 'Still to earn', colRuns: 'Runs of this mission',
            reached: 'reached', runs: '{n} runs', gated: 'gate flag', gatedNote: '“Gate flag” is a marker in the game files; the data does not explain its meaning.', ceiling: 'Ceiling of this reputation: {v}', repOver: 'The reputation you entered is above the ceiling in the game files ({v}). Please check the value.',
            rankWindow: 'This mission can only be taken at {range}. Run counts for ranks outside that window are for reference.', rankOther: 'This mission’s rank requirement is on another reputation ({name}).', refOnly: 'reference',
            partyNote: 'How reputation is shared in a party is not in the game files, so it is not calculated.', calcNote: 'Runs = reputation still to earn ÷ reputation per run, rounded up. Game file values; server settings may differ.',
            pathPair: 'Faction · reputation type', pathNow: 'My reputation now', pathTo: 'Target rank', pathSys: 'System', pathSysAny: 'All systems', pathPick: 'Choose a faction and reputation type.',
            pathStep: '{a} → {b}', pathNeed: '{v} more reputation needed', pathBest: 'Good mission to repeat (+{v} each)', pathRuns: 'repeat {n} times', pathNoRepeat: 'No repeatable mission gives this reputation at this rank in the game files. Nothing can be calculated from here.',
            pathOnce: 'Once-only missions (each one lowers the count)', pathUnlock: '{n} missions open when you reach {name}', pathMore: 'and {n} more', pathTotal: '{n} repeatable runs in total', pathDone: 'You are already at the target rank.',
            pathCross: 'rank requirement on another reputation', pathNote: 'A simple calculation from reputation values only. Mission location, cooldowns, prerequisite missions and events are not considered. Event-only missions and missions not for release are left out.',
            dataNote: 'Values can vary by server settings. A blank means the value is unknown.',
        },
    };
    const t = H.translator(TEXT);
    const esc = H.esc;

    const load = { data: null, error: null };
    let ix = null;          // 자료를 받은 뒤 만든 찾아보기 표
    let root = null;
    let headEl = null;
    let bodyEl = null;
    let typingTimer = 0;
    let statusText = '';
    const view = {};

    function resetView() {
        // m = 상세 화면의 임무, calcM = 등급 계산기의 임무. 둘을 따로 두어야 '임무 목록' 탭이 늘 목록을 연다.
        Object.assign(view, { tab: 'list', m: '', calcM: '', q: '', place: '', view: 'tiles', sort: '', scuMin: '', scuMax: '', box: '', rank: '', limit: PAGE, filtersOpen: false,
            calcRep: '', calcPair: '', pick: '', pickLimit: PICK_PAGE, pathPair: '', pathRep: '', pathTo: '', pathSys: '' });
        view.chips = Object.fromEntries(CHIP_KEYS.map((key) => [key, H.chips()]));
    }
    resetView();

    // ── 주소 ↔ 화면 상태 ─────────────────────────────────────────────────────
    const cleanNumber = (value) => (/^-?\d+(\.\d+)?$/.test(String(value ?? '').trim()) ? String(value).trim() : '');

    function applyParams(params) {
        const p = params || {};
        resetView();
        view.tab = ['rank', 'path'].includes(p.tab) ? p.tab : 'list';
        view.m = typeof p.m === 'string' ? p.m : '';
        view.calcM = typeof p.cm === 'string' ? p.cm : '';
        // 다른 화면이 보내는 주소(#missions?tab=rank&m=...)는 계산기의 임무를 뜻한다.
        if (view.tab === 'rank' && !view.calcM) view.calcM = view.m;
        if (view.tab !== 'list') view.m = '';
        view.q =typeof p.q === 'string' ? p.q.slice(0, 80) : '';
        view.place = typeof p.place === 'string' && /^[\w.\-']{1,120}$/.test(p.place) ? p.place : '';
        view.view = p.view === 'table' ? 'table' : 'tiles';
        view.sort = SORTS.includes(String(p.sort || '').replace(/^-/, '')) ? p.sort : '';
        CHIP_KEYS.forEach((key) => { if (typeof p[key] === 'string') view.chips[key].decode(p[key]); });
        const scu = /^(\d*(?:\.\d+)?)-(\d*(?:\.\d+)?)$/.exec(p.scu || '');
        if (scu) { view.scuMin = scu[1]; view.scuMax = scu[2]; }
        view.box = BOXES.includes(Number(p.box)) ? String(Number(p.box)) : '';
        view.rank = /^\d+$/.test(p.rank || '') ? p.rank : '';
        view.calcRep = cleanNumber(p.rep);
        view.calcPair = typeof p.pair === 'string' ? p.pair : '';
        view.pathPair = typeof p.pp === 'string' ? p.pp : '';
        view.pathRep = cleanNumber(p.prep);
        view.pathTo = /^\d+$/.test(p.pto || '') ? p.pto : '';
        view.pathSys = typeof p.psys === 'string' ? p.psys : '';
        view.filtersOpen = activeFilters() > 0;
    }

    // 주소에 적힌 조건 가운데 지금 자료에 없는 것(예전 주소, 잘못 친 값)을 뺀다. 뺀 개수를 돌려준다.
    // 그대로 두면 아무 칩도 켜지지 않은 채 결과가 0개가 된다.
    function sanitize() {
        if (!ix) return 0;
        let dropped = 0;
        CHIP_KEYS.forEach((key) => {
            const chips = view.chips[key];
            const known = key === 'flag' ? new Set(FLAGS) : ix.used[key];
            [...chips.included(), ...chips.excluded()].forEach((id) => {
                if (known.has(id)) return;
                chips.set(id, 'any');
                dropped += 1;
            });
        });
        const scope = rankScope();
        if (view.rank !== '' && (!scope || Number(view.rank) >= (load.data.scopes[scope]?.ranks?.length || 0))) {
            view.rank = '';
            dropped += 1;
        }
        if (dropped) {
            view.filtersOpen = activeFilters() > 0;
            statusText = t('dropped', { n: H.num(dropped) });
            if (H.parseHash().section === SECTION) syncHash();   // 자료를 받는 사이 다른 화면으로 갔으면 주소를 건드리지 않는다
        }
        return dropped;
    }

    // 목록의 조건이 같은지 견주는 값 — 같으면 '더 보기'로 늘린 줄 수를 그대로 둔다.
    const listKey = () => JSON.stringify([view.q.trim(), view.place, view.view, view.sort, view.scuMin, view.scuMax, view.box, view.rank, CHIP_KEYS.map((key) => view.chips[key].encode())]);

    function currentParams() {
        const p = { tab: view.tab === 'list' ? '' : view.tab, m: view.tab === 'list' ? view.m : '', cm: view.calcM, q: view.q.trim(), place: view.tab === 'list' ? view.place : '', view: view.view === 'table' ? 'table' : '', sort: view.sort,
            scu: view.scuMin || view.scuMax ? `${view.scuMin}-${view.scuMax}` : '', box: view.box, rank: view.rank,
            rep: view.calcRep, pair: view.calcPair, pp: view.pathPair, prep: view.pathRep, pto: view.pathTo, psys: view.pathSys };
        CHIP_KEYS.forEach((key) => { p[key] = view.chips[key].encode(); });
        return p;
    }

    function syncHash(push) {
        H.writeHash(SECTION, currentParams(), { push: Boolean(push) });
    }

    function activeFilters() {
        return CHIP_KEYS.reduce((sum, key) => sum + view.chips[key].included().length + view.chips[key].excluded().length, 0)
            + (view.scuMin || view.scuMax ? 1 : 0) + (view.box ? 1 : 0) + (view.rank ? 1 : 0);
    }

    // ── 이름 · 글 ───────────────────────────────────────────────────────────
    // 자료의 글은 [영어] 또는 [영어, 한국어]. 한국어 화면에서는 한글 패치 문구를 먼저 쓴다.
    // 한글 패치 글 끝에는 패치를 만든 분들이 덧붙인 안내(평판 · 쿨다운 · 미션 상세 정보)가 붙어 있는 것이 많다.
    // 게임 글이 아니고 게임 파일 값과 다를 때도 있어서, 임무 글에서 떼어 내 따로 표시한다. [게임 글, 덧붙은 글]
    const PATCH_HEADS = new Set(['평판', '쿨다운', '미션 상세 정보']);
    const patchCache = new Map();
    function koParts(index) {
        let parts = patchCache.get(index);
        if (parts) return parts;
        const ko = load.data.texts[index]?.[1] || '';
        const lines = ko.split('\n');
        const at = ko.includes('미션 상세 정보') ? lines.findIndex((line) => PATCH_HEADS.has(line.trim())) : -1;
        parts = at < 0 ? [ko, ''] : [lines.slice(0, at).join('\n').trim(), lines.slice(at).join('\n').trim()];
        patchCache.set(index, parts);
        return parts;
    }
    function textAt(index) {
        if (!Number.isInteger(index) || !load.data.texts[index]) return '';
        return (H.lang() === 'ko' && koParts(index)[0]) || load.data.texts[index][0] || '';
    }
    const patchNoteAt = (index) => (H.lang() === 'ko' && Number.isInteger(index) && load.data.texts[index] ? koParts(index)[1] : '');
    // 이름 {en, ko?}. raw: 1 은 게임 파일에 표시 이름이 없어 내부 id가 들어 있다는 뜻 — 이름처럼 보여 주지 않는다.
    function nameOf(value, id) {
        if (!value) return id ? `${t('noName')} (${id})` : t('noName');
        if (value.raw) return `${t('noName')} (${value.en})`;
        return H.name(value) || id || t('noName');
    }
    const words = (id) => String(id || '').replace(/_BP\d*$|_Scenario$|_MissionScenario$/g, '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2').trim();

    const TOKENS = [[/^(location|hint_location|initiatorlocation|defendlocation)/, 'location'], [/^destination/, 'destination'], [/^(targetname|ambushtarget)/, 'target'], [/^creature/, 'creature'],
        [/^(ship|shipstory)/, 'ship'], [/^item/, 'item'], [/^system/, 'system'], [/(amount|total|fuel|rate)/, 'amount'], [/(code|number)$/, 'code'], [/^initiatorname/, 'person'],
        [/(payment|reward)/, 'pay'], [/^contractor/, 'contractor']];
    function tokenLabel(key) {
        const low = String(key).toLowerCase();
        const hit = TOKENS.find(([pattern]) => pattern.test(low));
        return hit ? t(`tok_${hit[1]}`) : t('token');
    }
    const TOKEN_PATTERN = /\{([^{}|]+)(?:\|[^{}]*)?\}/g;
    // 게임이 나중에 채우는 자리({Location|Address} 등)는 작은 표지로 바꿔 보여 준다.
    const rich = (value) => esc(value).replace(TOKEN_PATTERN, (_, key) => `<span class="missions-token" title="${esc(t('tokenHint'))}">${esc(tokenLabel(key))}</span>`);
    const plain = (value) => String(value ?? '').replace(TOKEN_PATTERN, (_, key) => `[${tokenLabel(key)}]`);
    const paragraphs = (value) => rich(String(value).trim()).split(/\n{2,}/).map((part) => `<p>${part.replace(/\n/g, '<br>')}</p>`).join('');

    const titleOf = (c) => textAt(c.t) || '';
    const titleHtml = (c) => (titleOf(c) ? rich(titleOf(c)) : esc(t('noTitle')));
    const contractorOf = (c) => plain(textAt(c.con));
    const typeName = (c) => (c.type ? nameOf(load.data.types[c.type], c.type) : '');
    const orgName = (id) => nameOf(load.data.factions[id], id);
    const scopeName = (id) => ix.scopeLabels[id] || nameOf(load.data.scopes[id]?.name, id);
    function repName(faction, scope) {
        const org = orgName(faction);
        const label = scopeName(scope);
        return org && org.toLowerCase().endsWith(label.toLowerCase()) ? org : t('repLine', { org, scope: label });
    }
    function sysName(id) {
        const place = load.data.places[`${id}SolarSystem`] || load.data.places[id];
        return place?.name && !place.name.raw ? H.name(place.name) : id;
    }
    function placeName(id) {
        const place = load.data.places[id];
        if (place?.name && !place.name.raw) return H.name(place.name);
        if (['Stanton', 'Pyro', 'Nyx'].includes(id)) return sysName(id);
        const both = /^(Stanton|Pyro|Nyx)And(Stanton|Pyro|Nyx)$/.exec(id);
        if (both) return `${sysName(both[1])} · ${sysName(both[2])}`;
        return '';
    }
    function rankName(scopeId, index) {
        const rank = load.data.scopes[scopeId]?.ranks?.[index];
        if (!rank) return t('rankNo', { n: index });
        return rank.name && !rank.name.raw ? H.name(rank.name) : `${t('rankNo', { n: index })} (${H.num(rank.min)})`;
    }
    function rankRange(scopeId, min, max) {
        const a = Number.isInteger(min) ? rankName(scopeId, min) : '';
        const b = Number.isInteger(max) ? rankName(scopeId, max) : '';
        if (a && b) return a === b ? a : t('rankRange', { a, b });
        if (a) return t('rankFrom', { a });
        return b ? t('rankUpTo', { b }) : t('rankNone');
    }
    const signed = (n) => `${n > 0 ? '+' : ''}${H.num(n)}`;
    const minutes = (value) => H.duration(Number(value) * 60);
    function payText(pay) {
        if (pay === 'calc') return t('payCalc');
        if (pay === 'none' || !pay) return t('payNone');
        const unit = pay.cur === 'UEC' || !pay.cur ? 'aUEC' : pay.cur;
        return `${H.num(pay.a)} ${unit}${pay.max ? ` (${t('payMax', { v: H.num(pay.max) })})` : ''}`;
    }

    // ── 찾아보기 표 만들기 (자료를 받은 뒤 한 번) ──────────────────────────
    const pairId = (f, s) => `${f}.${s}`;
    function buildIndex(data) {
        // 찾기에는 게임 글만 쓴다 (한글 패치에 덧붙은 안내는 뺀다).
        const lowTexts = data.texts.map((pair, index) => (pair ? `${pair[0] || ''}\n${koParts(index)[0]}` : '').toLowerCase());
        const few = (list, max) => (list.length > max ? `${list.slice(0, max).join(', ')} ${t('pathMore', { n: H.num(list.length - max) })}` : list.join(', '));
        // 화물 이름 (주문에 적힌 것 모두, 겹치는 것은 한 번).
        function goodsOf(c) {
            const out = [];
            const walk = (rows) => {
                for (const r of rows) {
                    if (r.or) for (const group of r.or) walk(group);
                    else if (r.r) out.push(nameOf(data.resources[r.r], r.r));
                    else if (r.e) out.push(nameOf(data.items[r.e], r.e));
                    else if (r.es) out.push(nameOf(data.haulSets[r.es]?.name, r.es));
                }
            };
            for (const order of c.haul?.orders || []) walk(order.rows || []);
            return [...new Set(out)];
        }
        // 임무 장소: 싣는 곳 → 내리는 곳, 아니면 임무 장소 이름. 후보가 게임 자료에 이름으로 적힌 것만.
        function routeOf(c) {
            const names = (test) => few([...new Set((c.sites || []).filter((site) => test(site.k)).flatMap((site) => site.at || [])
                .map((index) => (data.locations[index]?.name ? H.name(data.locations[index].name) : '')).filter(Boolean))], 2);
            const from = names((kind) => kind === 'pickup');
            const to = names((kind) => kind === 'dropoff');
            if (from || to) return t('fromTo', { a: from || t('token'), b: to || t('token') });
            const at = names((kind) => kind !== 'pickup' && kind !== 'dropoff');
            if (at) return at;
            return few([...new Set([...(c.loc || []), ...(c.at || [])].filter((id) => !/^(Stanton|Pyro|Nyx)(And(Stanton|Pyro|Nyx))?$/.test(id)).map(placeName).filter(Boolean))], 2);
        }
        const conKey = (index) => String(data.texts[index]?.[0] || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `t${index}`;
        const conText = new Map();  // 의뢰처 글자 → 글 번호 (이름표용)
        const byId = new Map();
        const givers = new Map();   // 완료 표시 → 그 표시를 주는 임무들
        const pairs = new Map();    // "세력.평판종류" → { f, s, count }
        const used = Object.fromEntries(CHIP_KEYS.map((key) => [key, new Set()]));
        const entries = data.contracts.map((c, i) => {
            const flags = new Set();
            if (c.illegal === 1) flags.add('illegal');
            if (c.share === 1) flags.add('share');
            if (c.once === 1) flags.add('once');
            if (c.bp?.length) flags.add('bp');
            if (c.haul) flags.add('cargo');
            if (c.combat !== undefined) flags.add('combat');
            if (c.items?.length || c.itemsW?.length) flags.add('items');
            if (c.ev?.length) flags.add('event');
            // 끝냈을 때 주는 평판만 보상으로 센다 (on 이 없으면 '끝냈을 때'). on: [] 은 결과 칸이 없는 값이라 세지 않는다.
            const gain = new Map();
            (c.rep || []).forEach((r) => {
                if (r.on !== undefined) return;
                const id = pairId(r.f, r.s);
                const entry = gain.get(id) || { f: r.f, s: r.s, n: 0, calc: false };
                if (r.calc) entry.calc = true; else entry.n += Number(r.n) || 0;
                gain.set(id, entry);
            });
            gain.forEach((entry, id) => {
                if (entry.n > 0) pairs.set(id, { f: entry.f, s: entry.s, count: (pairs.get(id)?.count || 0) + 1 });
            });
            const own = gain.get(pairId(c.by, c.scope));
            const main = own || [...gain.values()].sort((a, b) => b.n - a.n)[0] || null;
            const scu = c.haul?.scu;
            const scuLo = Array.isArray(scu) ? scu[0] : H.isKnown(scu) ? scu : null;
            const scuHi = Array.isArray(scu) ? scu[1] : scuLo;
            const scopes = [...new Set([c.scope, ...[...gain.values()].map((g) => g.s)].filter(Boolean))];
            (c.gives || []).forEach((entry) => {
                const label = Array.isArray(entry) ? entry[0] : entry;
                if (!givers.has(label)) givers.set(label, []);
                givers.get(label).push(i);
            });
            byId.set(c.id, i);
            (c.v || []).forEach((variant) => { if (!byId.has(variant.id)) byId.set(variant.id, i); });
            if (c.type) used.type.add(c.type);
            for (const id of c.sys || []) used.sys.add(id);
            if (c.by) used.org.add(c.by);
            const con = Number.isInteger(c.con) && data.texts[c.con] ? conKey(c.con) : '';
            if (con) {
                used.con.add(con);
                if (!conText.has(con)) conText.set(con, c.con);
            }
            for (const id of scopes) used.scope.add(id);
            for (const id of c.ev || []) used.ev.add(id);
            const goods = goodsOf(c);
            const route = routeOf(c);
            const meta = [c.n, words(c.n), c.type, ...(data.types[c.type] ? Object.values(data.types[c.type]) : []), ...(data.factions[c.by] ? Object.values(data.factions[c.by]) : []), ...goods, route]
                .filter((part) => typeof part === 'string').join('\n').toLowerCase();
            const fixed = typeof c.pay === 'object' && c.pay;
            // 기본 순서: 세력이 있는 보통 임무 → 세력 없는 임무 → 이벤트 때만 나오는 임무 → 임무 틀에 문제가 있는 임무.
            const rest = (c.odd || []).some((code) => /^template/.test(code)) ? 3 : c.ev?.length ? 2 : c.by ? 0 : 1;
            return { c, i, flags, gain, main, scopes, scuLo, scuHi, box: c.haul?.maxBox ?? null, meta, con, goods, route, rest,
                // 찾기: 이름, 의뢰처가 맨 앞 두 개 (계산기의 임무 찾기는 이 둘만 본다), 그 뒤로 설명 글과 다른 문구.
                texts: [c.t, c.con, c.d, ...(c.tAlt || []), ...(c.dAlt || [])].filter(Number.isInteger).map((index) => lowTexts[index]),
                payA: fixed ? Number(c.pay.a) : null, payCur: fixed && c.pay.cur && c.pay.cur !== 'UEC' ? 1 : 0 };
        });
        // 같은 이름의 평판 종류(예: '평판'이 둘)는 뒤에 구분 글자를 붙인다.
        const scopeLabels = {};
        const seen = new Map();
        Object.entries(data.scopes).forEach(([id, scope]) => {
            let base = scope.name?.raw ? `${t('noName')} (${words(id.replace(/^.*?ReputationScope_?/, ''))})` : H.name(scope.name);
            if (H.lang() === 'ko' && base === 'Battaglia') base = '바타글리아';
            const qualifier = words(id.split('_').pop());
            const localized = H.lang() === 'ko' && qualifier === 'Battaglia' ? '바타글리아' : qualifier;
            scopeLabels[id] = seen.has(base) && localized !== base ? base + ' · ' + localized : base;
            seen.set(base, id);
        });
        return { entries, byId, givers, pairs, used, scopeLabels, conText };
    }

    const tellApart = (e) => [e.goods.slice(0, 2).join(', '), e.route].filter(Boolean).join(' · ');

    // ── 거르기 · 정렬 ───────────────────────────────────────────────────────
    function rankScope() {
        const included = view.chips.scope.included();
        return included.length === 1 ? included[0] : '';
    }

    // 장소 → 그 장소와 이어진 임무 번호들. 이어진다 = 임무가 나오는 곳(지역이면 그 지역에 든 곳 모두)이거나, 임무 장소 후보가 지도에서 그곳에 놓여 있다.
    // 임무 장소 후보가 어디에 놓였는지는 성계지도의 연결 목록(VOLT_STARMAP.links)에서 읽는다. 아직 못 받았으면 나오는 곳만으로 거른다.
    let placeIx = null;
    function placeEntries(id) {
        const links = window.VOLT_STARMAP?.links;
        const sites = Boolean(links?.ready?.());
        if (!placeIx || placeIx.sites !== sites || placeIx.ix !== ix) {
            const map = new Map();
            const add = (place, i) => {
                for (const key of [place, place.replace(/SolarSystem$/, 'Star')]) { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(i); }
            };
            const siteAt = new Map();
            ix.entries.forEach((e) => {
                for (const place of [...(e.c.at || []), ...(e.c.loc || [])]) {
                    add(place, e.i);
                    for (const member of load.data.localities[place]?.members || []) add(member, e.i);
                }
                if (!sites) return;
                for (const site of e.c.sites || []) {
                    for (const n of site.at || []) {
                        if (!siteAt.has(n)) siteAt.set(n, links.site(load.data.locations[n]?.id)?.at || []);
                        for (const place of siteAt.get(n)) add(place, e.i);
                    }
                }
            });
            placeIx = { sites, ix, map };
        }
        return placeIx.map.get(id) || new Set();
    }
    // 장소 조건의 이름: 임무 자료의 장소 이름, 없으면 성계지도에 적힌 이름(지도에서 "에어리어 18"을 골라 넘어왔는데 다른 이름으로 보이지 않게),
    // 그것도 아직 없으면 그곳에 놓인 임무 현장의 이름, 마지막으로 기록 이름 그대로. 지도 이름은 그 항성계 자료를 받아야 알 수 있어서 한 번 받아 오고 다시 그린다.
    const placeNameAsked = new Set();
    function placeLabel(id) {
        const named = placeName(id);
        if (named) return named;
        const links = window.VOLT_STARMAP?.links;
        const onMap = links?.name?.(id);
        if (onMap) return onMap;
        if (links?.ready?.() && links.loadName && !placeNameAsked.has(id)) {
            placeNameAsked.add(id);
            links.loadName(id).then((name) => { if (name && load.data && view.place === id) draw(); });
        }
        const location = links?.ready?.() ? load.data.locations.find((item) => item.name && (links.site(item.id)?.at || []).includes(id)) : null;
        return location ? H.name(location.name) : id;
    }

    function filtered() {
        const terms = view.q.toLowerCase().split(/\s+/).filter(Boolean);
        const here = view.place ? placeEntries(view.place) : null;
        const chips = view.chips;
        const wantFlags = chips.flag.included();
        const dropFlags = chips.flag.excluded();
        const scuMin = view.scuMin === '' ? null : Number(view.scuMin);
        const scuMax = view.scuMax === '' ? null : Number(view.scuMax);
        const box = view.box === '' ? null : Number(view.box);
        const scope = rankScope();
        const rank = scope && view.rank !== '' ? Number(view.rank) : null;
        const list = ix.entries.filter((e) => {
            const c = e.c;
            if (here && !here.has(e.i)) return false;
            if (!chips.type.test([c.type]) || !chips.sys.test(c.sys || []) || !chips.org.test([c.by]) || !chips.con.test([e.con || null]) || !chips.scope.test(e.scopes) || !chips.ev.test(c.ev || [])) return false;
            if (wantFlags.some((flag) => !e.flags.has(flag)) || dropFlags.some((flag) => e.flags.has(flag))) return false;
            if (scuMin !== null || scuMax !== null) {
                if (e.scuLo === null || (scuMin !== null && e.scuHi < scuMin) || (scuMax !== null && e.scuLo > scuMax)) return false;
            }
            // 상자 크기가 자료에 없는 임무는 '너무 큼'으로 치지 않는다 (모르는 값은 모르는 값이다).
            if (box !== null && e.box !== null && e.box > box) return false;
            if (rank !== null && (c.scope !== scope || (c.min ?? 0) > rank || (c.max ?? Infinity) < rank)) return false;
            return terms.every((term) => e.meta.includes(term) || e.texts.some((value) => value.includes(term)));
        });
        const key = view.sort.replace(/^-/, '');
        if (!key) return list.sort((a, b) => a.rest - b.rest || a.i - b.i);
        const direction = view.sort.startsWith('-') ? -1 : 1;
        // 보수는 화폐가 다르면 견줄 수 없으므로 aUEC 를 먼저, 다른 화폐를 그 뒤에 따로 줄 세운다.
        const group = key === 'pay' ? (e) => e.payCur : () => 0;
        const value = { title: (e) => plain(titleOf(e.c)).toLowerCase() || null, rank: (e) => e.c.min ?? null, rep: (e) => (e.main && e.main.n > 0 ? e.main.n : null),
            contractor: e => contractorOf(e.c) || null, type: e => typeName(e.c) || null,
            system: e => (e.c.sys || []).map(sysName).join(', ') || null, box: e => e.box ?? null,
            pay: (e) => e.payA, scu: (e) => e.scuHi, time: (e) => e.c.time ?? null }[key];
        // 자료에 없는 값은 방향과 상관없이 맨 뒤로 보낸다.
        return list.map((e) => [value(e), e]).sort((a, b) => {
            if (a[0] === null || b[0] === null) return (a[0] === null) - (b[0] === null) || a[1].i - b[1].i;
            if (group(a[1]) !== group(b[1])) return group(a[1]) - group(b[1]);
            const order = typeof a[0] === 'string' ? a[0].localeCompare(b[0], H.lang()) : a[0] - b[0];
            return order * direction || a[1].i - b[1].i;
        }).map((pairOf) => pairOf[1]);
    }

    // ── 목록 화면 ───────────────────────────────────────────────────────────
    const option = (value, label, current) => `<option value="${esc(value)}"${String(current) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;

    function chipGroup(key, label, options) {
        if (!options.length) return '';
        const chips = view.chips[key];
        return `<fieldset class="missions-chipset"><legend>${esc(label)}</legend><div class="missions-chips">${options.map(([id, name]) => {
            const state = chips.get(id);
            const mark = { include: '＋', exclude: '−' }[state] || '';
            return `<button type="button" class="missions-chip is-${state}" data-ms-chip="${key}" data-id="${esc(id)}" data-focus="chip:${key}:${esc(id)}" data-state="${state}" aria-pressed="${{ include: 'true', exclude: 'mixed' }[state] || 'false'}" aria-label="${esc(`${name}: ${chips.label(state)}`)}">${mark ? `<span class="missions-chip-mark" aria-hidden="true">${mark}</span>` : ''}${esc(name)}</button>`;
        }).join('')}</div></fieldset>`;
    }

    function filterPanel() {
        const { data } = load;
        const sortByName = (list) => list.sort((a, b) => a[1].localeCompare(b[1], H.lang()));
        const scope = rankScope();
        const ranks = scope ? data.scopes[scope]?.ranks || [] : [];
        const active = activeFilters();
        return `<details class="missions-filters"${view.filtersOpen ? ' open' : ''} data-ms-filters>
            <summary data-focus="filters">${esc(active ? t('filtersOn', { n: active }) : t('filters'))}</summary>
            <p class="missions-hint">${esc(t('chipHelp'))}</p>
            ${chipGroup('flag', t('fFlag'), FLAGS.map((flag) => [flag, t(`flag_${flag}`)]))}
            ${chipGroup('sys', t('fSys'), [...ix.used.sys].sort().map((id) => [id, sysName(id)]))}
            ${chipGroup('type', t('fType'), sortByName([...ix.used.type].map((id) => [id, nameOf(data.types[id], id)])))}
            ${chipGroup('scope', t('fScope'), sortByName([...ix.used.scope].map((id) => [id, scopeName(id)])))}
            <div class="missions-fields">
                <label><span>${esc(t('myRank'))}</span><select id="missions-rank" data-focus="rank"${scope ? '' : ' disabled'}>${option('', t('rankAny'), view.rank)}${ranks.map((_, index) => option(index, rankName(scope, index), view.rank)).join('')}</select>
                    <small>${esc(scope ? scopeName(scope) : t('rankNeedScope'))}</small></label>
                <div class="missions-range" role="group" aria-label="${esc(t('scuRange'))}"><span>${esc(t('scuRange'))}</span>
                    <div><input type="number" inputmode="decimal" min="0" step="any" id="missions-scu-min" data-focus="scu-min" value="${esc(view.scuMin)}" aria-label="${esc(t('scuMin'))}" placeholder="${esc(t('scuMin'))}">
                    <span aria-hidden="true">~</span><input type="number" inputmode="decimal" min="0" step="any" id="missions-scu-max" data-focus="scu-max" value="${esc(view.scuMax)}" aria-label="${esc(t('scuMax'))}" placeholder="${esc(t('scuMax'))}"></div>
                    <small>${esc(t('scuNote'))}</small></div>
                <label><span>${esc(t('box'))}</span><select id="missions-box" data-focus="box">${option('', t('boxAny'), view.box)}${BOXES.map((size) => option(size, t('boxUpTo', { n: size }), view.box)).join('')}</select>
                    <small>${esc(t('boxNote'))}</small></label>
            </div>
            ${chipGroup('org', t('fOrg'), sortByName([...ix.used.org].map((id) => [id, orgName(id)])))}
            ${chipGroup('con', t('fCon'), sortByName([...ix.used.con].map((id) => [id, plain(textAt(ix.conText.get(id)))])))}
            ${chipGroup('ev', t('fEv'), [...ix.used.ev].sort().map((id) => [id, words(data.scenarios[id]?.name || id)]))}
            <button type="button" class="btn btn-secondary missions-clear" data-ms-clear data-focus="clear"${active ? '' : ' disabled'}>${esc(t('clear'))}</button>
        </details>`;
    }

    function toolbar() {
        const key = view.sort.replace(/^-/, '');
        const down = view.sort.startsWith('-');
        return `<div class="missions-toolbar">
            <label class="missions-search"><span>${esc(t('search'))}</span>
                <input type="search" id="missions-q" data-focus="q" value="${esc(view.q)}" placeholder="${esc(t('searchPh'))}" aria-describedby="missions-q-hint" autocomplete="off" spellcheck="false" maxlength="80"></label>
            <label class="missions-sort"><span>${esc(t('sortLabel'))}</span><select id="missions-sort" data-focus="sort">${option('', t('sortDefault'), key)}${SORTS.map((id) => option(id, sortLabel(id), key)).join('')}</select></label>
            <button type="button" class="missions-toggle" data-ms-dir data-focus="dir"${key ? '' : ' disabled'} aria-label="${esc(`${t('sortDir')}: ${t(down ? 'desc' : 'asc')}`)}"><span aria-hidden="true">${down ? '↓' : '↑'}</span> ${esc(t(down ? 'desc' : 'asc'))}</button>
            <div class="missions-viewswitch" role="group" aria-label="${esc(t('viewLabel'))}">${['tiles', 'table'].map((id) => `<button type="button" class="missions-toggle${view.view === id ? ' is-on' : ''}" data-ms-view="${id}" data-focus="view:${id}" aria-pressed="${view.view === id}">${esc(t(id === 'tiles' ? 'viewTiles' : 'viewTable'))}</button>`).join('')}</div>
        </div><p class="missions-hint" id="missions-q-hint">${esc(t('searchHint'))}</p>`;
    }

    function tagList(e) {
        const c = e.c;
        const tags = (c.sys || []).map((id) => `<li class="missions-tag is-sys">${esc(sysName(id))}</li>`);
        if (c.illegal === 1) tags.push(`<li class="missions-tag is-illegal">${esc(t('flag_illegal'))}</li>`);
        if (c.once === 1) tags.push(`<li class="missions-tag">${esc(t('flag_once'))}</li>`);
        if (c.share === 1) tags.push(`<li class="missions-tag">${esc(t('flag_share'))}</li>`);
        if (c.ev?.length) tags.push(`<li class="missions-tag is-event">${esc(t('flag_event'))}</li>`);
        if (c.bp?.length) tags.push(`<li class="missions-tag is-bp">${esc(t('flag_bp'))}</li>`);
        if (c.combat !== undefined) tags.push(`<li class="missions-tag is-combat">${esc(t('flag_combat'))}</li>`);
        return tags.join('');
    }
    const rankCell = (c) => (c.scope ? rankRange(c.scope, c.min, c.max) : t('rankNone'));
    function repCell(e) {
        if (!e.main) return t('repNone');
        return e.main.n ? `${signed(e.main.n)} · ${scopeName(e.main.s)}` : `${scopeName(e.main.s)}: ${t('repCalc')}`;
    }
    function cargoCell(e) {
        if (!e.c.haul) return '';
        if (e.scuLo === null) return H.unknown('game');
        return e.scuLo === e.scuHi ? H.scu(e.scuLo) : `${H.num(e.scuLo)}–${H.scu(e.scuHi)}`;
    }

    function tile(e) {
        const c = e.c;
        const cargo = cargoCell(e);
        const goods = e.goods.length > 3 ? `${e.goods.slice(0, 3).join(', ')} ${t('pathMore', { n: H.num(e.goods.length - 3) })}` : e.goods.join(', ');
        return `<li class="missions-tile"><h4><button type="button" class="missions-open" data-ms-open="${esc(c.id)}" data-focus="open:${esc(c.id)}">${titleHtml(c)}</button></h4>
            <p class="missions-sub">${esc([contractorOf(c), typeName(c)].filter(Boolean).join(' · '))}</p>
            <ul class="missions-tags">${tagList(e)}</ul>
            <dl class="missions-facts"><div><dt>${esc(t('colRank'))}</dt><dd>${esc(rankCell(c))}</dd></div><div><dt>${esc(t('colRep'))}</dt><dd>${esc(repCell(e))}</dd></div>
                <div><dt>${esc(t('colPay'))}</dt><dd${c.pay === 'calc' ? ' class="is-unknown"' : ''}>${c.pay === 'calc' ? '—' : esc(payText(c.pay))}</dd></div>
                ${cargo ? `<div><dt>${esc(t('colCargo'))}</dt><dd>${esc([goods, cargo, e.box ? t('maxBox', { n: e.box }) : t('boxNoData')].filter(Boolean).join(' · '))}</dd></div>` : ''}
                ${e.route ? `<div><dt>${esc(t('colPlace'))}</dt><dd>${esc(e.route)}</dd></div>` : ''}
                </dl></li>`;
    }

    function tableRow(e) {
        const c = e.c;
        const apart = tellApart(e);
        const tag = (flag, kind) => (e.flags.has(flag) ? ` <span class="missions-tag is-${kind}">${esc(t(`flag_${flag}`))}</span>` : '');
        return `<tr><th scope="row"><button type="button" class="missions-open" data-ms-open="${esc(c.id)}" data-focus="open:${esc(c.id)}">${titleHtml(c)}</button>${tag('illegal', 'illegal')}${tag('bp', 'bp')}${tag('event', 'event')}${apart ? `<small class="missions-apart">${esc(apart)}</small>` : ''}</th>
            <td>${esc(contractorOf(c))}</td><td>${esc(typeName(c))}</td><td>${esc((c.sys || []).map(sysName).join(', '))}</td><td>${esc(rankCell(c))}</td>
            <td class="is-num">${esc(repCell(e))}</td><td class="is-num${c.pay === 'calc' ? ' is-unknown' : ''}">${c.pay === 'calc' ? '—' : esc(payText(c.pay))}</td><td class="is-num">${esc(cargoCell(e) || '—')}</td>
            <td class="is-num${c.haul && !e.box ? ' is-unknown' : ''}">${esc(e.box ? H.scu(e.box) : c.haul ? H.unknown('game') : '—')}</td></tr>`;
    }

    function tableHtml(shown) {
        const key = view.sort.replace(/^-/, '');
        const down = view.sort.startsWith('-');
        const head = (label, sortKey, numeric) => {
            if (!sortKey) return `<th scope="col"${numeric ? ' class="is-num"' : ''}>${esc(label)}</th>`;
            const on = key === sortKey;
            return `<th scope="col"${numeric ? ' class="is-num"' : ''} aria-sort="${on ? (down ? 'descending' : 'ascending') : 'none'}"><button type="button" class="missions-th" data-ms-sort="${sortKey}" data-focus="th:${sortKey}">${esc(label)}<span class="volt-sort-arrow" aria-hidden="true">${on ? (down ? ' ↓' : ' ↑') : ' ↕'}</span></button></th>`;
        };
        return `<div class="missions-tablewrap" tabindex="0" role="region" aria-label="${esc(t('tabList'))}"><table class="missions-table">
            <thead><tr>${head(t('colTitle'), 'title')}${head(t('colCon'), 'contractor')}${head(t('colType'), 'type')}${head(t('colSys'), 'system')}${head(t('colRank'), 'rank')}${head(t('colRep'), 'rep', true)}${head(t('colPay'), 'pay', true)}${head(t('colCargo'), 'scu', true)}${head(t('colBox'), 'box', true)}</tr></thead>
            <tbody>${shown.map(tableRow).join('')}</tbody></table></div>`;
    }

    let lastRows = [];      // 지금 조건에 맞는 임무 (거르고 줄 세운 것). '더 보기'가 다시 계산하지 않도록 둔다.
    const moreLabel = (rest) => t('more', { n: H.num(Math.min(PAGE, rest)) });

    function resultsHtml() {
        const rows = filtered();
        lastRows = rows;
        const notes = [];
        if (view.scuMin !== '' && view.scuMax !== '' && Number(view.scuMin) > Number(view.scuMax)) notes.push(t('scuFlip'));
        if (view.box !== '') {
            const unknown = rows.filter((e) => e.c.haul && e.box === null).length;
            if (unknown) notes.push(t('boxUnknownCount', { n: H.num(unknown) }));
        }
        const linksReady = Boolean(window.VOLT_STARMAP?.links?.ready?.());
        const placeBar = view.place ? `<div class="missions-placebar" data-ms-placebar><p><strong>${esc(t('placeFilter', { name: placeLabel(view.place) }))}</strong> ${esc(t('placeNote'))}${linksReady || !window.VOLT_STARMAP?.links ? '' : ` ${esc(t('placeWait'))}`}</p>
            <div class="missions-placebar-acts">${mapLink({ focus: view.place }, { name: placeLabel(view.place), cls: 'missions-maplink-place' })}<button type="button" class="btn btn-secondary" data-ms-placeclear data-focus="placeclear">${esc(t('placeClear'))}</button></div></div>` : '';
        const count = `${placeBar}<p class="missions-count" role="status">${esc(t('count', { n: H.num(rows.length), total: H.num(ix.entries.length) }))}</p>${notes.map((value) => `<p class="missions-note is-unknown" data-ms-listnote>${esc(value)}</p>`).join('')}`;
        if (!rows.length) return `${count}<p class="helper-soon missions-empty">${esc(t('noResult'))}</p>`;
        const shown = rows.slice(0, view.limit);
        const rest = rows.length - shown.length;
        return `${count}${view.view === 'table' ? tableHtml(shown) : `<ul class="missions-tiles">${shown.map(tile).join('')}</ul>`}
            ${rest > 0 ? `<button type="button" class="btn btn-secondary missions-more" data-ms-more data-focus="more">${esc(moreLabel(rest))}</button>` : ''}`;
    }

    // '더 보기': 이미 그린 줄은 그대로 두고 새 줄만 뒤에 붙인다 (줄이 많아져도 누를 때 드는 시간이 늘지 않는다).
    function appendRows(from) {
        const out = bodyEl.querySelector('[data-ms-out]');
        const table = view.view === 'table';
        const list = out?.querySelector(table ? '.missions-table tbody' : '.missions-tiles');
        const rows = lastRows.slice(from, view.limit);
        if (!list || !rows.length) { drawOut(); return; }
        const holder = document.createElement(table ? 'tbody' : 'ul');
        paint(holder, rows.map(table ? tableRow : tile).join(''));
        const first = holder.firstElementChild;
        list.append(...holder.children);
        const rest = lastRows.length - Math.min(lastRows.length, view.limit);
        const button = out.querySelector('[data-ms-more]');
        if (button && rest > 0) button.textContent = moreLabel(rest);
        else button?.remove();
        first?.querySelector('.missions-open')?.focus();
    }

    function listHtml() {
        return `${toolbar()}${filterPanel()}<div class="missions-results" data-ms-out>${resultsHtml()}</div>`;
    }

    // ── 임무 상세 ───────────────────────────────────────────────────────────
    const block = (title, inner, extraClass) => (inner ? `<section class="missions-block${extraClass ? ` ${extraClass}` : ''}"><h4>${esc(title)}</h4>${inner}</section>` : '');
    const row = (label, valueHtml) => (valueHtml ? `<div><dt>${esc(label)}</dt><dd>${valueHtml}</dd></div>` : '');
    const note = (value) => `<p class="missions-note">${esc(value)}</p>`;
    // 이름이 같은 임무가 많아서, 고르는 목록에서는 화물과 장소을 옆에 붙인다.
    const missionLink = (index, apart) => {
        const e = ix.entries[index];
        const extra = apart ? tellApart(e) : '';
        return `<a href="${esc(H.buildHash(SECTION, { m: e.c.id }))}" data-ms-open="${esc(e.c.id)}">${titleHtml(e.c)}</a>${extra ? ` <small class="missions-apart">${esc(extra)}</small>` : ''}`;
    };
    const itemName = (id) => nameOf(load.data.items[id], id);
    const slotNames = (on) => (on.length ? on.map((slot) => t(SLOT_KEYS[slot] || 'slotDone')).join(' · ') : t('oddNoSlot'));

    // 항성계 전체에서 나오는 임무는 "나오는 곳"이 항성 기록으로 적혀 있다. 지도에 항성 하나를 찍으면 항성에서 나오는 임무처럼 읽히므로 표시에서 뺀다.
    const SYSTEM_WIDE = /^(Stanton|Pyro|Nyx)(Star|SolarSystem)?$/;
    function requirementsBlock(c) {
        const cd = load.data.cooldowns[c.cd];
        const places = [...new Set([...(c.loc || []), ...(c.at || [])])];
        const named = places.map(placeName).filter(Boolean);
        const regions = (c.loc || []).filter((id) => !placeName(id));
        const members = [...new Set(regions.flatMap((id) => load.data.localities[id]?.members || []).map(placeName).filter(Boolean))];
        const where = [(c.sys || []).map(sysName).join(', ') || t('anySys'), [...new Set(named)].join(', ')].filter(Boolean).join(' — ');
        let cooldown = '';
        if (cd) {
            const span = (value, spread) => (spread ? t('plusMinus', { v: minutes(value), d: minutes(spread) }) : minutes(value));
            cooldown = `<dl class="missions-kv">${row(t('cdAfter'), esc(cd.on === 1 ? span(cd.p, cd.pv) : cd.on === 0 ? t('cdOff', { v: minutes(cd.p) }) : H.unknown('game')))}
                ${row(t('cdAbandon'), esc(H.isKnown(cd.a) ? span(cd.a, cd.av) : H.unknown('game')))}${row(t('reAbandon'), esc(t(cd.ra ? 'can' : 'cannot')))}${row(t('reFail'), esc(t(cd.rf ? 'can' : 'cannot')))}</dl>${note(t('cdNote'))}`;
        }
        const rankHtml = c.scope ? `${esc(rankRange(c.scope, c.min, c.max))}<small>${esc(t('reqRankBy', { org: c.by ? orgName(c.by) : '', scope: scopeName(c.scope) }))}${Number.isInteger(c.min) && H.isKnown(load.data.scopes[c.scope]?.ranks?.[c.min]?.min) ? ` · ${esc(t('reqRep', { v: H.num(load.data.scopes[c.scope].ranks[c.min].min) }))}` : ''}</small>` : esc(t('rankNone'));
        return block(t('secReq'), `<dl class="missions-kv">${row(t('reqRank'), rankHtml)}
            ${row(t('offered'), `${esc(where)}${mapLink({ mark: places.filter((id) => !SYSTEM_WIDE.test(id)) }, { name: t('offered'), count: true, cls: 'missions-maplink-offer' })}${members.length ? `<details class="missions-fold"><summary>${esc(t('siteNamed', { n: members.length }))}</summary><p>${esc(members.join(', '))}</p></details>` : ''}<small>${esc(t('offeredNote'))}${c.sysBy ? ` ${esc(t(`sysBy_${c.sysBy}`))}` : ''}</small>`)}
            ${row(t('legality'), esc(c.illegal === 1 ? t('legalNo') : c.illegal === 0 ? t('legalYes') : H.unknown('game')))}
            ${row(t('sharing'), esc(c.share === undefined ? H.unknown('game') : `${t(c.share ? 'shareYes' : 'shareNo')}${c.shareDef ? ` ${t('shareDef')}` : ''}`))}
            ${row(t('repeat'), esc(t(c.once ? 'onceYes' : 'onceNo')))}
            ${c.players !== undefined ? row(t('players'), esc(c.players === -1 ? t('playersAny') : t('playersValue', { n: H.num(c.players) }))) : ''}
            ${c.pre?.crime ? row(t('crime'), esc(t('crimeValue', { a: c.pre.crime[0], b: c.pre.crime[1] }))) : ''}
            ${c.buyIn !== undefined ? row(t('buyIn'), esc(H.price(c.buyIn, { unknown: 'game' }))) : ''}
            ${c.rental ? row(t('rental'), esc(t('rentalValue', { name: itemName(c.rental[0]), time: minutes(c.rental[1]) }))) : ''}
            ${c.limit !== undefined ? row(t('deadline'), `${esc(H.num(c.limit))}<small>${esc(t('deadlineNote'))}</small>`) : ''}</dl>`)
            + block(t('secCooldown'), cooldown);
    }

    function prerequisitesBlock(c) {
        const pre = c.pre || {};
        const lines = [];
        (pre.done || []).forEach((entry) => {
            const need = [...new Set(entry.need || [])];
            const not = [...new Set(entry.not || [])];
            const related = tags => [...new Set(tags.flatMap((label) => ix.givers.get(label) || []))].filter((index) => ix.entries[index].c.by === c.by && index !== ix.byId.get(c.id));
            if (need.length) {
                const givers = related(need);
                lines.push(`<li>${esc(entry.n ? t('preDoneN', { n: H.num(entry.n) }) : t('preDone'))}
                    ${givers.length ? `<details class="missions-fold"><summary>${esc(t('preGivers'))} (${H.num(givers.length)})</summary><ul>${givers.slice(0, 12).map((index) => `<li>${missionLink(index)}</li>`).join('')}${givers.length > 12 ? `<li>${esc(t('pathMore', { n: H.num(givers.length - 12) }))}</li>` : ''}</ul></details>` : `<small>${esc(t('preGiversNone'))}</small>`}</li>`);
            }
            if (not.length) {
                const names = related(not).map(index => plain(titleOf(ix.entries[index].c))).filter(Boolean);
                lines.push(`<li>${esc(t('preNot'))}${names.length ? ' · ' + esc([...new Set(names)].join(', ')) : ''}</li>`);
            }
        });
        (pre.rep || []).forEach((entry) => {
            const names = { org: orgName(entry.f), scope: scopeName(entry.s) };
            const hasRange = Number.isInteger(entry.min) || Number.isInteger(entry.max);
            const range = hasRange ? rankRange(entry.s, entry.min, entry.max) : entry.cmp ? `${entry.cmp} ${entry.rank ?? ''}` : '';
            if (entry.ex) lines.push(`<li>${esc(range ? t('preRepEx', { ...names, range }) : t('preRepExAny', names))}</li>`);
            else if (range) lines.push(`<li>${esc(t('preRep', { ...names, range }))}</li>`);
        });
        return block(t('secPre'), lines.length ? `<ul class="missions-list">${lines.join('')}</ul>` : '');
    }

    // 난이도 단계 설명 — 게임 파일의 영문 이름(예: Normal_PvE_only_action_4)을 우리말로 옮긴 것. 순서는 1~8단계.
    const LEVELS_KO = {
        mechanicalSkill: ['손을 쓸 일이 없음', '위험한 조작 없음', '쉬운 PvE 교전', '보통 PvE 교전', '어려운 PvE 또는 쉬운 PvP 교전', '여럿이 하는 PvE 또는 고수끼리의 PvP 교전', '큰 무리가 맞붙는 PvE · PvP 교전 (전쟁터 수준)', '아직 이런 콘텐츠 없음'],
        mentalLoad: ['자리를 비워도 됨', '거의 생각할 일이 없음', '가벼운 반복 작업', '가끔 집중해야 함', '접시 열 개를 한꺼번에 돌리는 수준', '혼자 감당하기 매우 어려움', '매우 복잡함, 혼자서는 할 수 없음', '아직 이런 콘텐츠 없음'],
        riskOfLoss: ['안전함', '땀도 안 날 정도', '위험이 적음 (지상 교전이며 함선 교전은 아님)', '함선이 망가지거나 화물을 잃을 수 있음', '플레이어가 죽거나 함선이 터질 수 있음', '플레이어도 함선도 잃기 쉬움', '도움이 없으면 플레이어와 함선을 잃음', '아직 이런 콘텐츠 없음'],
        gameKnowledge: ['입문 · 튜토리얼 수준', '지상 조작 (걷기, 사격, 모비글라스)', '비행 조작 (비행, 도킹, 퀀텀 이동)', '지상 · 비행 · 직업을 두루 아는 수준', '지상 · 비행 · 직업을 깊이 아는 수준', '가장 좋은 전술까지 아는 수준', '개발자나 다름없는 수준', '아직 이런 콘텐츠 없음'],
    };

    function payoutBlock(c) {
        const { data } = load;
        let inner = `<p class="missions-big${c.pay === 'calc' ? ' is-unknown' : ''}">${esc(payText(c.pay))}</p>`;
        if (c.pay === 'calc') {
            inner += note(t('payReason'));
            const inputs = [];
            if (c.time !== undefined) inputs.push(row(t('timeEst'), `${esc(minutes(c.time))}<small>${esc(t('timeNote'))}</small>`));
            if (c.diff) {
                const weights = data.difficultyProfiles[c.diff[0]];
                inputs.push(row(t('profile'), `${esc(words(c.diff[0]))}${weights ? `<small>${esc(t('weights'))} ${esc(weights.join(' · '))}</small>` : ''}`));
                Object.keys(data.difficultyLevels || {}).slice(0, 4).forEach((axis, index) => {
                    const level = c.diff[index + 1];
                    const label = data.difficultyLevels[axis]?.[level - 1];
                    const own = H.lang() === 'ko' && label?.endsWith(`_${level}`) ? LEVELS_KO[axis]?.[level - 1] : '';
                    inputs.push(row(t(AXES[index]), `${esc(t('level', { n: level }))}${own ? `<small>${esc(own)}</small>` : label ? `<small lang="en">${esc(label.replace(/_\d$/, '').replace(/_/g, ' '))}</small>` : ''}`));
                });
            }
            if (inputs.length) inner += `<h5>${esc(t('payInputs'))}</h5><dl class="missions-kv">${inputs.join('')}</dl>${c.diff ? note(t('levelNote')) : ''}`;
        }
        const bonus = (data.rankPayBonus || []).find((entry) => entry.f === c.by && entry.s === c.scope);
        if (bonus) inner += `<h5>${esc(t('rankBonus'))}</h5><ul class="missions-inline">${bonus.ranks.map(([index, fraction]) => `<li>${esc(rankName(c.scope, index))} +${esc(H.percent(fraction * 100))}</li>`).join('')}</ul>`;
        const partial = data.partials?.[c.pp];
        if (partial) {
            inner += `<h5>${esc(t('partial'))}</h5><ul class="missions-list">${partial.map((band) => {
                const parts = [t('partialPay', { v: band.pay })];
                if (typeof c.pay === 'object' && c.pay) parts.push(t('partialAmount', { v: H.price(c.pay.a * band.pay) }));
                for (const [scope, multiplier] of Object.entries(band.rep || {})) parts.push(`${scopeName(scope)} ${t('partialRep', { v: multiplier })}`);
                return `<li>${esc(t('partialBand', { a: band.from, b: band.to }))}: ${esc(parts.join(' · '))}</li>`;
            }).join('')}</ul>`;
        }
        return block(t('secPay'), inner);
    }

    function reputationBlock(c, e) {
        const real = (c.rep || []).filter((r) => r.on === undefined || r.on.length);
        if (!real.length) return block(t('secRep'), `<p>${esc(t('repNone'))}</p>`);
        const line = (r) => `<li><strong class="${r.calc ? 'is-unknown' : r.n < 0 ? 'is-loss' : 'is-gain'}">${esc(r.calc ? t('repCalc') : signed(r.n))}</strong> ${esc(repName(r.f, r.s))}</li>`;
        const groups = new Map();
        real.forEach((r) => {
            const key = r.on === undefined ? '0' : r.on.join(',');
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
        });
        const inner = [...groups.entries()].sort().map(([key, list]) => `<h5>${esc(slotNames(key.split(',').map(Number)))}</h5><ul class="missions-list">${list.map(line).join('')}</ul>`).join('');
        const canCalc = [...e.gain.values()].some((gain) => gain.n > 0);
        return block(t('secRep'), `${inner}${note(t('slotNote'))}${canCalc ? `<button type="button" class="btn btn-secondary" data-ms-calc="${esc(c.id)}" data-focus="calc">${esc(t('calcThis'))}</button>` : ''}`);
    }

    function haulRow(r) {
        const { data } = load;
        const amount = (scu) => (Array.isArray(scu) ? `${H.num(scu[0])}–${H.scu(scu[1])}` : H.scu(scu));
        const ends = (value, kind) => (value ? t(/\d/.test(value) ? `${kind}N` : kind, { n: (/\d+/.exec(value) || [''])[0] }) : '');
        const route = r.from || r.to ? ` <small>${esc(r.from && r.to ? t('fromTo', { a: ends(r.from, 'pickup'), b: ends(r.to, 'dropoff') }) : ends(r.from, 'pickup') || ends(r.to, 'dropoff'))}</small>` : '';
        if (r.or) return `<li>${esc(t('anyOf'))}<ul class="missions-list">${r.or.map((group) => `<li><ul class="missions-list">${group.map(haulRow).join('')}</ul></li>`).join('')}</ul></li>`;
        if (r.r) return `<li><strong>${esc(nameOf(data.resources[r.r], r.r))}</strong> ${esc(amount(r.scu))} · ${esc(r.box > 0 ? t('boxValue', { n: r.box }) : r.box === -1 ? t('boxUnset') : H.unknown('game'))}${route}</li>`;
        if (r.e) return `<li><strong>${esc(itemName(r.e))}</strong> ${esc(t('pieces', { n: H.num(r.n) }))}${route}</li>`;
        if (r.es) {
            const set = data.haulSets[r.es];
            return `<li><strong>${esc(t('setOf', { name: nameOf(set?.name, r.es) }))}</strong> ${esc(t('pieces', { n: H.num(r.n) }))}${set?.of?.length ? `<details class="missions-fold"><summary>${esc(t('setMembers', { n: H.num(set.of.length) }))}</summary><p>${esc(set.of.map(itemName).join(', '))}</p></details>` : ''}</li>`;
        }
        if (r.mi) return `<li><strong>${esc(r.mi.map(itemName).join(', ') || t('missionItem'))}</strong> ${esc(t('pieces', { n: H.num(r.n) }))} <small>${esc(t('missionItem'))}</small></li>`;
        return `<li><strong>${esc(t('taggedItem'))}</strong> ${esc(t('pieces', { n: H.num(r.n) }))}</li>`;
    }

    function haulBlock(c) {
        const haul = c.haul;
        if (!haul) return '';
        const summary = [haul.scu !== undefined ? `${t('orderTotal')} ${Array.isArray(haul.scu) ? `${H.num(haul.scu[0])}–${H.scu(haul.scu[1])}` : H.scu(haul.scu)}` : `${t('orderTotal')}: ${H.unknown('game')}`,
            haul.maxBox ? t('maxBox', { n: haul.maxBox }) : '', haul.pickups ? t('pickups', { n: haul.pickups }) : '', haul.dropoffs ? t('dropoffs', { n: haul.dropoffs }) : ''].filter(Boolean);
        const isHauling = /^Hauling/.test(c.type || '');
        return block(t('secHaul'), `<p class="missions-big">${esc(summary.join(' · '))}</p>
            ${haul.orders.map((order, index) => `<h5>${esc(t('order', { n: index + 1 }))}</h5><ul class="missions-list">${order.rows.map(haulRow).join('')}</ul>`).join('')}
            ${note(t('haulNote'))}${isHauling ? `<p class="missions-note">${esc(t('haulingLink'))} — <a href="#hauling">${esc(t('haulingGo'))}</a></p>` : ''}`);
    }

    // "지도에서 보기": 성계지도에 실제로 보일 수 있는 곳일 때만 링크가 나온다 (js/starmap.js VOLT_STARMAP.links).
    function mapLink(params, options) {
        return window.VOLT_STARMAP?.links?.button?.(params, options) || '';
    }
    // 임무 장소 한 줄(싣는 곳 · 내리는 곳 · 임무 장소)의 후보들이 지도에서 놓인 곳. 후보 목록이 자료에 없으면 빈 목록.
    function siteObjects(site) {
        const links = window.VOLT_STARMAP?.links;
        if (!links?.ready?.() || !site.at) return [];
        return [...new Set(site.at.flatMap((index) => links.site(load.data.locations[index]?.id)?.at || []))];
    }
    function siteLink(site, label) {
        const { data } = load;
        // 후보가 한 곳이면 그 현장을 그대로 연다(따로 찍힌 지점, "근처" 추정까지 지도가 보여 준다). 여러 곳이면 놓인 곳을 모두 표시한다.
        if (site.at?.length === 1) return mapLink({ site: data.locations[site.at[0]]?.id }, { name: label, cls: 'missions-maplink' });
        return mapLink({ mark: siteObjects(site) }, { name: label, count: true, cls: 'missions-maplink' });
    }
    // 임무 전체: 싣는 곳과 내리는 곳이 한 곳씩으로 정해져 있으면 그 둘을 잇는 경로, 아니면 후보를 모두 표시한다.
    function sitesLink(c) {
        const of = (kind) => [...new Set(c.sites.filter((site) => (kind === 'site' ? site.k !== 'pickup' && site.k !== 'dropoff' : site.k === kind)).flatMap(siteObjects))];
        const from = of('pickup');
        const to = of('dropoff');
        if (from.length === 1 && to.length === 1 && from[0] !== to[0]) return mapLink({ route: [from[0], to[0]] }, { name: `${t('pickup')} → ${t('dropoff')}`, note: `${t('pickup')} → ${t('dropoff')}`, cls: 'missions-maplink-all' });
        return mapLink({ mark: [...from, ...to, ...of('site')] }, { name: t('secSites'), note: t('mapAll'), count: true, cls: 'missions-maplink-all' });
    }

    function sitesBlock(c) {
        if (!c.sites?.length) return '';
        const { data } = load;
        return block(t('secSites'), `${c.sites.length > 1 ? sitesLink(c) : ''}<ul class="missions-list">${c.sites.map((site) => {
            const names = (site.at || []).map((index) => { const place = data.locations[index]; return place?.name ? H.name(place.addr || place.name) : t('unnamedPlace'); });
            const facts = [site.at ? t('siteNamed', { n: H.num(site.n ?? names.length) }) : site.n ? t('siteMany', { n: H.num(site.n) }) : t('siteUnknown'),
                site.need ? t('siteNeed', { a: site.need[0], b: site.need[1] }) : '', site.x ? t('siteTimes', { n: site.x }) : '', site.dyn ? t('siteDyn') : ''].filter(Boolean);
            return `<li><strong>${esc(t(site.k === 'pickup' ? 'pickup' : site.k === 'dropoff' ? 'dropoff' : 'site'))}</strong> ${esc(facts.join(' · '))}${names.length ? `<p class="missions-places">${esc([...new Set(names)].join(' / '))}</p>` : ''}${siteLink(site, t(site.k === 'pickup' ? 'pickup' : site.k === 'dropoff' ? 'dropoff' : 'site'))}</li>`;
        }).join('')}</ul>`);
    }

    const ROLES = [[/AcePilot/i, 'ace'], [/Wave\s*0?(\d)/i, 'wave'], [/Reinforc/i, 'reinforce'], [/Interdict/i, 'interdict'], [/Ambus/i, 'ambush'], [/Boss/i, 'boss'],
        [/Escort ?Ship|ShipToDefend|AttackedShip|Friendly|Allied|Recipient|ShipToBoard|CargoShip|HeistShip|Salvage|BoardedShip|Defenders/i, 'friend'],
        [/Hostile|Enem|Target|Hijack|Bomber|Combatant|Vanduul|Wave|Eliminate|Mauler/i, 'enemy']];
    function roleOf(...names) {
        for (const value of names) {
            for (const [pattern, key] of ROLES) {
                const hit = pattern.exec(String(value || ''));
                if (hit) return t(`role_${key}`, { n: hit[1] });
            }
        }
        return t('role_other');
    }
    const NUMS = [[/AcePilotChance/, 'ace'], [/Ambush/, 'ambush'], [/Interdiction/, 'interdict'], [/Reinforcement.*Chance|ChanceOfReinforcements/, 'reinforce'], [/PercentageChanceOfEncounter/, 'encounter'],
        [/NumberOfWaves|MaxWaves/, 'waves'], [/WaveDelay/, 'delay'], [/MaxShips/, 'maxships'], [/ZonesToDefend/, 'zones'], [/NumberOfSearchs/, 'search'], [/TotalToKill/, 'kill'],
        [/Wave(\d)Count/, 'wavecount'], [/NumberOfChildMissions/, 'child']];

    function combatBlock(c) {
        const { data } = load;
        const combat = data.combats[c.combat];
        if (!combat) return '';
        const tags = (index) => `<span class="missions-tagline" lang="en">${esc(String(data.tagSets[index] || '').split('|').join(' · '))}</span>`;
        const slot = (entry, unit) => (Array.isArray(entry) ? `<li>${esc(t(unit, { n: H.num(entry[0]) }))} ${tags(entry[1])}</li>`
            : `<li>${esc(t('cAlt'))}<ul class="missions-list">${entry.alt.map((alt) => `<li>${esc(t(unit, { n: H.num(alt[0]) }))} ${tags(alt[1])} <small>${esc(t('cWeight', { v: alt[2] }))}</small></li>`).join('')}</ul></li>`);
        const groupsOf = (list, render) => list.map((prop) => `<li><strong>${esc(roleOf(prop.p, ...prop.g.map((g) => (typeof g === 'number' ? data.spawnGroups[g]?.n : g.n))))}</strong>
            <ul class="missions-list">${prop.g.map(render).join('')}</ul></li>`).join('');
        const shipGroup = (index) => { const group = data.spawnGroups[index] || { s: [] }; return `<li>${esc(t('cGroup'))}<ul class="missions-list">${group.s.map((entry) => slot(entry, 'cEach')).join('')}</ul></li>`; };
        const npcGroup = (group) => `<li><em lang="en">${esc(group.n || t('cGroup'))}</em>${group.opts > 1 ? ` <small>${esc(t('npcOpts', { n: group.opts }))}</small>` : ''}
            <ul class="missions-list">${group.o.map((o) => `<li>${esc(t('npcSpawn', { a: o[1], b: o[2], c: o[3], d: o[4] }))} ${tags(o[0])}</li>`).join('')}</ul></li>`;
        const creatureGroup = (group) => `<li><em lang="en">${esc(group.n || t('cGroup'))}</em><ul class="missions-list">${group.s.map((entry) => slot(entry, 'cEachNpc')).join('')}</ul></li>`;
        const nums = Object.entries(combat.nums || {}).map(([key, value]) => {
            const hit = NUMS.map(([pattern, id]) => [pattern.exec(key), id]).find(([match]) => match);
            const label = hit ? t(`num_${hit[1]}`, { n: hit[0][1] }) : words(key);
            return row(label, `${esc(Array.isArray(value) ? t('plusMinus', { v: value[0], d: value[1] }) : String(value))}<small lang="en">${esc(words(key))}</small>`);
        }).join('');
        return block(t('secCombat'), `${combat.ships ? `<h5>${esc(t('cShips'))}</h5><ul class="missions-list">${groupsOf(combat.ships, shipGroup)}</ul>` : ''}
            ${combat.npcs ? `<h5>${esc(t('cNpcs'))}</h5><ul class="missions-list">${groupsOf(combat.npcs, npcGroup)}</ul>` : ''}
            ${combat.creatures ? `<h5>${esc(t('cCreatures'))}</h5><ul class="missions-list">${groupsOf(combat.creatures, creatureGroup)}</ul>` : ''}
            ${nums ? `<h5>${esc(t('cNums'))}</h5><dl class="missions-kv">${nums}</dl>${note(t('chanceNote'))}` : ''}${note(t('tagsNote'))}`);
    }

    function blueprintBlock(c) {
        if (!c.bp?.length) return '';
        const { data } = load;
        return block(t('secBp'), `${c.bp.map(([poolId, chance, slotIndex]) => {
            const pool = data.pools[poolId] || [];
            return `<h5>${esc(t('bpChance', { v: H.percent(Number(chance) * 100) }))}${slotIndex !== undefined ? ` · ${esc(t(SLOT_KEYS[slotIndex] || 'slotDone'))}` : ''}</h5>
                <ul class="missions-bps">${pool.map((entry) => {
                    const id = Array.isArray(entry) ? entry[0] : entry;
                    const weight = Array.isArray(entry) ? entry[1] : null;
                    if (id === null) return `<li class="is-unknown">${esc(t('bpNull', { v: weight }))}</li>`;
                    const bp = data.blueprints[id];
                    const name = bp && !bp.raw && H.name(bp) || t('noName');
                    return `<li><a href="${esc(H.buildHash('fabricator', { bp: id }))}" aria-label="${esc(t('bpOpen', { name }))}">${esc(name)}</a>${weight !== null && weight !== 1 ? ` <small>${esc(t('bpWeight', { v: weight }))}</small>` : ''}</li>`;
                }).join('')}</ul>`;
        }).join('')}${note(t('bpFrom'))}`, 'is-wide');
    }

    function itemsBlock(c) {
        const lines = (c.items || []).map(([id, amount]) => `<li>${esc(t('itemTimes', { name: itemName(id), n: H.num(amount) }))}</li>`);
        for (const [weight, list] of c.itemsW || []) lines.push(`<li>${esc(t('itemWeighted', { v: weight }))}<ul class="missions-list">${list.map(([id, amount]) => `<li>${esc(t('itemTimes', { name: itemName(id), n: H.num(amount) }))}</li>`).join('')}</ul></li>`);
        const marks = (c.gives || []).map((entry) => (Array.isArray(entry) ? `${entry[0]} × ${H.num(entry[1])}` : entry));
        return block(t('secItems'), lines.length ? `<ul class="missions-list">${lines.join('')}</ul>` : '')
            + block(t('givesTag'), marks.length || c.pts !== undefined ? `<p lang="en">${esc(marks.join(', '))}</p>${c.pts !== undefined ? `<p>${esc(t('points'))}: ${esc(H.num(c.pts))}</p>` : ''}` : '');
    }

    function eventBlock(c) {
        if (!c.ev?.length) return '';
        return block(t('secEvent'), `${c.ev.map((id) => { const scenario = load.data.scenarios[id]; return `<p>${esc(t('evOnly', { name: words(scenario?.name || id) }))}${scenario?.enabledInFile ? ` ${esc(t('evOnInFile'))}` : ''}</p>`; }).join('')}${note(t('evNow'))}`);
    }

    function oddBlock(c) {
        const lines = (c.odd || []).map((code) => `<li>${esc(TEXT.ko[`odd_${code}`] ? t(`odd_${code}`) : code)}</li>`);
        for (const r of (c.rep || []).filter((entry) => entry.on && !entry.on.length)) lines.push(`<li>${esc(t('oddNoSlot'))}: ${esc(t('oddRes_rep'))} ${esc(r.calc ? t('repCalc') : signed(r.n))} (${esc(repName(r.f, r.s))})</li>`);
        (c.res || []).forEach(([kind, on, ...payload]) => {
            const value = kind === 'item' ? t('itemTimes', { name: itemName(payload[0]), n: payload[1] }) : kind === 'pay' ? (payload[0] === 'calc' ? t('payCalc') : H.num(payload[0]))
                : kind === 'tags' ? (payload[0] || []).join(', ') : kind === 'bp' ? words(payload[0]) : String(payload[0]);
            lines.push(`<li>${esc(slotNames(on))}: ${esc(t(`oddRes_${kind}`))} ${esc(value)}</li>`);
        });
        if (c.illegal === undefined) lines.push(`<li>${esc(t('oddIllegal'))}</li>`);
        if (c.bySrc) lines.push(`<li>${esc(t('oddBySrc'))}</li>`);
        if (c.dRaw) lines.push(`<li>${esc(t('oddRaw'))}</li>`);
        if (c.sysBy === 'mixed') lines.push(`<li>${esc(t('sysBy_mixed'))}</li>`);
        return block(t('secOdd'), lines.length ? `<ul class="missions-list">${lines.join('')}</ul>${note(t('oddNote'))}` : '', 'is-odd');
    }

    function variantsBlock(c) {
        if (!c.v?.length) return '';
        const label = (id) => placeName(id) || id;
        return `<details class="missions-block missions-fold is-wide"><summary>${esc(t('secVariants', { n: H.num(c.v.length) }))}</summary><p class="missions-note">${esc(t('vSame'))}</p>
            <ul class="missions-list">${c.v.map((variant) => `<li>${esc((variant.swap || []).map(([from, to]) => t('vSwap', { a: label(from), b: label(to) })).join(' · ') || (variant.loc || []).map(label).join(', ') || variant.id)}${Number.isInteger(variant.t) ? ` — ${rich(textAt(variant.t))}` : ''}</li>`).join('')}</ul></details>`;
    }

    function detailHtml(e) {
        const c = e.c;
        const alt = (c.tAlt || []).map(textAt).filter(Boolean);
        const brief = textAt(c.d);
        const briefAlt = (c.dAlt || []).map(textAt).filter(Boolean);
        const patch = patchNoteAt(c.d) || patchNoteAt(c.t);
        const patchHtml = patch ? `<details class="missions-fold missions-patch" data-ms-patch><summary>${esc(t('patchNote'))}</summary><p class="missions-note is-unknown">${esc(t('patchWarn'))}</p><div class="missions-brief">${paragraphs(patch)}</div></details>` : '';
        return `<article class="missions-detail" data-ms-detail="${esc(c.id)}">
            <button type="button" class="btn btn-secondary missions-back" data-ms-back data-focus="back">← ${esc(t('back'))}</button>
            <header class="missions-detail-head"><h3 tabindex="-1" data-focus="detail-title">${titleHtml(c)}</h3>
                <p class="missions-sub">${esc([contractorOf(c), typeName(c), c.by ? orgName(c.by) : ''].filter((value, index, list) => value && list.indexOf(value) === index).join(' · '))}</p>
                <ul class="missions-tags">${tagList(e)}</ul>
                ${alt.length ? `<p class="missions-note">${esc(t('alsoShown'))}: ${alt.map(rich).join(' / ')} <small>${esc(t('variantNote'))}</small></p>` : ''}</header>
            <p class="missions-summary-line">${esc(t('colRank'))} · ${esc(rankCell(c))} <span>${esc(t('colPay'))} · ${esc(payText(c.pay))}</span></p>
            <div class="missions-overview">
                ${block(t('secBrief'), brief ? `<div class="missions-brief">${paragraphs(brief)}</div>${briefAlt.length ? `<details class="missions-fold"><summary>${esc(t('briefAlt', { n: briefAlt.length }))}</summary>${briefAlt.map((value) => `<div class="missions-brief">${paragraphs(value)}</div>`).join('<hr>')}<p class="missions-note">${esc(t('variantNote'))}</p></details>` : ''}${patchHtml}` : `<p>${esc(t('noBrief'))}</p>${patchHtml}`, 'missions-story')}
                <div class="missions-overview-facts">${requirementsBlock(c)}${payoutBlock(c)}${sitesBlock(c)}</div>
            </div>
            <div class="missions-blocks">
                ${prerequisitesBlock(c)}${reputationBlock(c, e)}${haulBlock(c)}${combatBlock(c)}${eventBlock(c)}${blueprintBlock(c)}${itemsBlock(c)}${oddBlock(c)}${variantsBlock(c)}
            </div></article>`;
    }

    // ── 등급 계산기 ─────────────────────────────────────────────────────────
    const scopeOf = (id) => load.data.scopes[id] || { ranks: [] };
    function rankAt(scope, reputation) {
        let index = 0;
        scope.ranks.forEach((rank, i) => { if (rank.min <= reputation) index = i; });
        return index;
    }
    const numberOr = (value, fallback) => (value === '' || !Number.isFinite(Number(value)) ? fallback : Number(value));

    function pickerHtml() {
        const terms = view.pick.toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length) return '';
        const hits = ix.entries.filter((e) => e.main && e.main.n > 0 && terms.every((term) => e.meta.includes(term) || e.texts.slice(0, 2).some((value) => value.includes(term))));
        if (!hits.length) return `<p class="missions-note">${esc(t('noResult'))}</p>`;
        const shown = hits.slice(0, view.pickLimit);
        const rest = hits.length - shown.length;
        return `<p class="missions-count" role="status">${esc(t('pickCount', { n: H.num(shown.length), total: H.num(hits.length) }))}</p>
            <ul class="missions-picks">${shown.map((e, index) => `<li><button type="button" class="missions-pick" data-ms-pick="${esc(e.c.id)}" data-focus="pick:${index}">${titleHtml(e.c)}<small>${esc([contractorOf(e.c), repCell(e)].filter(Boolean).join(' · '))}</small>${tellApart(e) ? `<small>${esc(tellApart(e))}</small>` : ''}</button></li>`).join('')}</ul>
            ${rest > 0 ? `<button type="button" class="btn btn-secondary missions-more" data-ms-pickmore data-focus="pickmore">${esc(t('pickMore', { n: H.num(Math.min(PICK_PAGE, rest)) }))}</button>` : ''}`;
    }

    function calcGains(e) {
        return e ? [...e.gain.values()].filter((gain) => gain.n > 0) : [];
    }

    function calcOutHtml(e) {
        const gains = calcGains(e);
        if (!e) return `<p class="helper-soon">${esc(t('rankNoMission'))}</p>`;
        if (!gains.length) return `<p class="helper-soon">${esc(t('rankNoRep'))}</p>`;
        const c = e.c;
        const gain = gains.find((entry) => pairId(entry.f, entry.s) === view.calcPair) || gains[0];
        const scope = scopeOf(gain.s);
        const now = numberOr(view.calcRep, scope.initial ?? 0);
        const at = rankAt(scope, now);
        const sameLadder = c.scope === gain.s && c.by === gain.f;
        const losses = (c.rep || []).filter((r) => r.on?.length && r.f === gain.f && r.s === gain.s && Number.isFinite(r.n)).map((r) => t('rankLoss', { slot: slotNames(r.on), v: signed(r.n) }));
        const notes = [];
        if (sameLadder && (Number.isInteger(c.min) || Number.isInteger(c.max))) notes.push(t('rankWindow', { range: rankRange(c.scope, c.min, c.max) }));
        if (!sameLadder && c.scope) notes.push(t('rankOther', { name: `${c.by ? `${orgName(c.by)} · ` : ''}${scopeName(c.scope)}` }));
        const over = H.isKnown(scope.ceiling) && now > scope.ceiling;
        const rows = scope.ranks.map((rank, index) => {
            const left = rank.min - now;
            const outside = sameLadder && ((Number.isInteger(c.max) && index > c.max + 1) || (Number.isInteger(c.min) && index <= c.min && left > 0));
            return `<tr class="${index === at ? 'is-now' : ''}${outside ? ' is-ref' : ''}"><th scope="row">${esc(rankName(gain.s, index))}${rank.gated ? ` <span class="missions-tag">${esc(t('gated'))}</span>` : ''}</th>
                <td class="is-num">${left > 0 ? `<strong>${esc(t('runs', { n: H.num(Math.ceil(left / gain.n)) }))}</strong>${outside ? ` <small>${esc(t('refOnly'))}</small>` : ''}` : '—'}</td>
                <td class="is-num">${esc(left > 0 ? H.num(left) : t('reached'))}</td><td class="is-num">${esc(H.num(rank.min))}</td></tr>`;
        }).join('');
        return `<p class="missions-big">${esc(t('rankPer', { v: H.num(gain.n) }))} <small>${esc(repName(gain.f, gain.s))}${losses.length ? ` · ${esc(losses.join(' · '))}` : ''}</small></p>
            <p class="missions-note">${esc(t('rankNowAt', { name: rankName(gain.s, at) }))}${H.isKnown(scope.ceiling) ? ` · ${esc(t('ceiling', { v: H.num(scope.ceiling) }))}` : ''}</p>
            ${over ? `<p class="missions-note is-unknown" data-ms-over>${esc(t('repOver', { v: H.num(scope.ceiling) }))}</p>` : ''}${notes.map(note).join('')}
            <div class="missions-tablewrap" tabindex="0" role="region" aria-label="${esc(t('tabRank'))}"><table class="missions-table missions-ranktable"><thead><tr><th scope="col">${esc(t('colRankName'))}</th><th scope="col" class="is-num">${esc(t('colRuns'))}</th><th scope="col" class="is-num">${esc(t('colLeft'))}</th><th scope="col" class="is-num">${esc(t('colNeed'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
            ${scope.ranks.some((rank) => rank.gated) ? note(t('gatedNote')) : ''}${note(t('calcNote'))}${note(t('partyNote'))}`;
    }

    function rankHtml() {
        const e = ix.entries[ix.byId.get(view.calcM)];
        const gains = calcGains(e);
        const gain = gains.find((entry) => pairId(entry.f, entry.s) === view.calcPair) || gains[0];
        const scope = gain ? scopeOf(gain.s) : null;
        const apart = e ? tellApart(e) : '';
        return `<div class="missions-form">
            ${e ? `<div class="missions-chosen"><span>${esc(t('rankPick'))}</span><strong><a href="${esc(H.buildHash(SECTION, { m: e.c.id }))}" data-ms-open="${esc(e.c.id)}">${titleHtml(e.c)}</a></strong><small>${esc([contractorOf(e.c), typeName(e.c), apart].filter(Boolean).join(' · '))}</small></div>` : ''}
            <label class="missions-search"><span>${esc(e ? t('rankChange') : t('rankPick'))}</span><input type="search" id="missions-pick" data-focus="pick" value="${esc(view.pick)}" placeholder="${esc(t('rankPickHint'))}" autocomplete="off" spellcheck="false" maxlength="80"></label>
            <div data-ms-pickout>${pickerHtml()}</div>
            ${gains.length > 1 ? `<label><span>${esc(t('rankWhich'))}</span><select id="missions-pair" data-focus="pair">${gains.map((entry) => option(pairId(entry.f, entry.s), `${orgName(entry.f)} · ${scopeName(entry.s)} (+${H.num(entry.n)})`, pairId(gain.f, gain.s))).join('')}</select></label>` : ''}
            ${gain ? `<label><span>${esc(t('rankNow'))}</span><input type="number" inputmode="numeric" id="missions-rep" data-focus="rep" value="${esc(view.calcRep)}" placeholder="${esc(H.num(scope.initial ?? 0))}"><small>${esc(t('rankNowHint', { v: H.num(scope.initial ?? 0) }))}</small></label>` : ''}
        </div><div class="missions-out" data-ms-out>${calcOutHtml(e)}</div>`;
    }

    // ── 등급 올리는 길 ─────────────────────────────────────────────────────────
    function pathOutHtml() {
        const pair = ix.pairs.get(view.pathPair);
        if (!pair) return `<p class="helper-soon">${esc(t('pathPick'))}</p>`;
        const scope = scopeOf(pair.s);
        const id = pairId(pair.f, pair.s);
        let reputation = numberOr(view.pathRep, scope.initial ?? 0);
        const start = rankAt(scope, reputation);
        const target = Math.min(scope.ranks.length - 1, numberOr(view.pathTo, scope.ranks.length - 1));
        if (target <= start) return `<p class="helper-soon">${esc(t('pathDone'))}</p>${note(t('pathNote'))}`;
        const inSystem = (e) => !view.pathSys || (e.c.sys || []).includes(view.pathSys);
        const usable = (e) => !e.c.ev?.length && !(e.c.odd || []).some((code) => /^template/.test(code)) && inSystem(e);
        const ownLadder = (e) => e.c.scope === pair.s && e.c.by === pair.f;
        // 등급 조건이 이 평판에 걸린 임무만 등급으로 따진다. 등급 조건이 없거나 다른 평판에 걸린 임무는 언제나 받을 수 있는 것으로 둔다.
        const openAt = (e, rank) => !ownLadder(e) || ((e.c.min ?? 0) <= rank && (e.c.max ?? Infinity) >= rank);
        const paying = ix.entries.filter((e) => usable(e) && (e.gain.get(id)?.n || 0) > 0);
        const link = (e) => `<li>${missionLink(e.i, true)} <small>${esc(`+${H.num(e.gain.get(id)?.n || 0)}`)}${!ownLadder(e) && e.c.scope ? ` · ${esc(t('pathCross'))}` : ''}</small></li>`;
        const listed = new Set();
        let total = 0;
        let stopped = false;
        const steps = [];
        for (let rank = start; rank < target && !stopped; rank += 1) {
            const need = scope.ranks[rank + 1].min - reputation;
            const open = paying.filter((e) => openAt(e, rank));
            const repeat = open.filter((e) => !e.c.once);
            const best = repeat.reduce((max, e) => Math.max(max, e.gain.get(id).n), 0);
            const once = open.filter((e) => e.c.once && !listed.has(e.i));
            for (const e of once) listed.add(e.i);
            // 다음 등급이 되면 새로 받을 수 있는 임무 (이벤트 때만 나오는 임무와 출시용이 아닌 임무는 다른 목록처럼 뺀다).
            const unlocked = ix.entries.filter((e) => usable(e) && ownLadder(e) && e.c.min === rank + 1);
            let body;
            if (need <= 0) body = `<p>${esc(t('reached'))}</p>`;
            else if (!best) { body = `<p class="is-unknown">${esc(t('pathNoRepeat'))}</p>`; stopped = true; }
            else {
                const runs = Math.ceil(need / best);
                total += runs;
                reputation += runs * best;
                const top = repeat.filter((e) => e.gain.get(id).n === best);
                body = `<p class="missions-big">${esc(t('pathRuns', { n: H.num(runs) }))}</p><h5>${esc(t('pathBest', { v: H.num(best) }))}</h5>
                    <ul class="missions-list">${top.slice(0, 3).map(link).join('')}${top.length > 3 ? `<li>${esc(t('pathMore', { n: H.num(top.length - 3) }))}</li>` : ''}</ul>`;
            }
            steps.push(`<li class="missions-step"><h4>${esc(t('pathStep', { a: rankName(pair.s, rank), b: rankName(pair.s, rank + 1) }))} <small>${esc(need > 0 ? t('pathNeed', { v: H.num(need) }) : t('reached'))}</small></h4>
                ${body}
                ${once.length ? `<h5>${esc(t('pathOnce'))}</h5><ul class="missions-list">${once.slice(0, 5).map(link).join('')}${once.length > 5 ? `<li>${esc(t('pathMore', { n: H.num(once.length - 5) }))}</li>` : ''}</ul>` : ''}
                ${unlocked.length ? `<details class="missions-fold" data-ms-unlock><summary>${esc(t('pathUnlock', { name: rankName(pair.s, rank + 1), n: H.num(unlocked.length) }))}</summary><ul class="missions-list">${unlocked.slice(0, 8).map((e) => `<li>${missionLink(e.i, true)}</li>`).join('')}${unlocked.length > 8 ? `<li>${esc(t('pathMore', { n: H.num(unlocked.length - 8) }))}</li>` : ''}</ul></details>` : ''}</li>`);
        }
        return `<p class="missions-big" data-ms-total>${esc(t('pathTotal', { n: H.num(total) }))}</p><ol class="missions-steps">${steps.join('')}</ol>${note(t('pathNote'))}${note(t('partyNote'))}`;
    }

    function pathHtml() {
        const pairs = [...ix.pairs.entries()].map(([id, pair]) => [id, repName(pair.f, pair.s)]).sort((a, b) => a[1].localeCompare(b[1], H.lang()));
        const pair = ix.pairs.get(view.pathPair);
        const scope = pair ? scopeOf(pair.s) : null;
        return `<div class="missions-form">
            <label><span>${esc(t('pathPair'))}</span><select id="missions-pp" data-focus="pp">${option('', '—', view.pathPair)}${pairs.map(([id, label]) => option(id, label, view.pathPair)).join('')}</select></label>
            ${scope ? `<label><span>${esc(t('pathNow'))}</span><input type="number" inputmode="numeric" id="missions-prep" data-focus="prep" value="${esc(view.pathRep)}" placeholder="${esc(H.num(scope.initial ?? 0))}"><small>${esc(t('rankNowHint', { v: H.num(scope.initial ?? 0) }))}</small></label>
            <label><span>${esc(t('pathTo'))}</span><select id="missions-pto" data-focus="pto">${scope.ranks.map((_, index) => option(index, rankName(pair.s, index), view.pathTo === '' ? scope.ranks.length - 1 : view.pathTo)).join('')}</select></label>
            <label><span>${esc(t('pathSys'))}</span><select id="missions-psys" data-focus="psys">${option('', t('pathSysAny'), view.pathSys)}${[...ix.used.sys].sort().map((id) => option(id, sysName(id), view.pathSys)).join('')}</select></label>` : ''}
        </div><div class="missions-out" data-ms-out>${pathOutHtml()}</div>`;
    }

    // ── 그리기 ──────────────────────────────────────────────────────────────
    // 이 파일의 유일한 HTML 싱크. 넘기는 문자열의 모든 동적 값은 esc() / rich() 를 거친다.
    function paint(target, html) {
        if (target) target.innerHTML = html;
    }

    function headHtml() {
        // 탭: 고른 탭만 Tab 키로 닿고, 나머지는 좌우 화살표 · Home · End 로 옮긴다 (onKeydown).
        const tab = (id, label) => `<button type="button" role="tab" id="missions-tab-${id}" class="missions-tab${view.tab === id ? ' is-on' : ''}" data-ms-tab="${id}" data-focus="tab:${id}" aria-selected="${view.tab === id}" aria-controls="missions-panel" tabindex="${view.tab === id ? 0 : -1}">${esc(label)}</button>`;
        return `<div class="missions-tabs" role="tablist" aria-label="${esc(t('tabs'))}">${tab('list', t('tabList'))}<a class="missions-tab" role="tab" aria-selected="false" href="#missions?tab=hauling">${H.lang() === 'ko' ? '운송 계약' : 'Hauling contracts'}</a>${tab('rank', t('tabRank'))}${tab('path', t('tabPath'))}</div>
            <div class="missions-share"><button type="button" class="btn btn-secondary" data-ms-share data-focus="share">${esc(t('share'))}</button><span class="missions-status" role="status" data-ms-status>${esc(statusText)}</span></div>`;
    }

    function bodyHtml() {
        const source = `<footer class="missions-source"><p>${esc(t('dataNote'))}</p>
            <p>${esc(t('haulingLink'))} — <a href="#hauling">${esc(t('haulingGo'))}</a></p></footer>`;
        if (view.tab === 'rank') return `${rankHtml()}${source}`;
        if (view.tab === 'path') return `${pathHtml()}${source}`;
        const e = ix.entries[ix.byId.get(view.m)];
        return `${e ? detailHtml(e) : `<p class="missions-note">${H.lang() === 'ko' ? '게임 자료에서 보상 금액을 확인할 수 없는 임무는 —로 표시합니다.' : 'A dash in the pay column means the amount is unavailable.'}</p>${listHtml()}`}${source}`;
    }

    function draw(focusKey) {
        if (!root) return;
        bodyEl.classList.toggle('is-loading', !load.data && !load.error);
        headEl.classList.toggle('is-loading', !load.data && !load.error);
        if (load.error || !load.data) {
            bodyEl.removeAttribute('role');
            bodyEl.removeAttribute('aria-labelledby');
        } else {
            bodyEl.setAttribute('role', 'tabpanel');
            bodyEl.setAttribute('aria-labelledby', `missions-tab-${view.tab}`);
        }
        if (load.error) {
            paint(headEl, '');
            paint(bodyEl, `<div class="helper-soon helper-soon-error" role="alert"><p>${esc(H.errorText(load.error))}</p><button type="button" class="btn btn-secondary" data-ms-retry>${esc(t('retry'))}</button></div>`);
            return;
        }
        if (!load.data) {
            paint(headEl, '');
            paint(bodyEl, `<p class="helper-soon" role="status">${esc(t('loading'))}</p>`);
            return;
        }
        const key = focusKey || (root.contains(document.activeElement) ? document.activeElement.getAttribute('data-focus') : '');
        paint(headEl, headHtml());
        paint(bodyEl, bodyHtml());
        if (key) root.querySelector(`[data-focus="${window.CSS.escape(key)}"]`)?.focus({ preventScroll: !focusKey });
    }

    // 결과 영역만 다시 그린다 — 입력 칸은 건드리지 않으므로 치는 도중 끊기지 않는다.
    function drawOut() {
        const out = bodyEl?.querySelector('[data-ms-out]');
        if (!out) return draw();
        if (view.tab === 'rank') paint(out, calcOutHtml(ix.entries[ix.byId.get(view.calcM)]));
        else if (view.tab === 'path') paint(out, pathOutHtml());
        else paint(out, resultsHtml());
        return undefined;
    }

    function later(job) {
        window.clearTimeout(typingTimer);
        typingTimer = window.setTimeout(job, 140);
    }

    let indexLanguage;
    async function readMissions() {
        const data = await H.loadJson(DATA_URL);
        if (!Array.isArray(data?.contracts) || !Array.isArray(data?.texts)) throw Object.assign(new Error('Unexpected mission data'), { helperType: 'data' });
        if (load.data !== data || indexLanguage !== H.lang()) {
            load.data = data;
            patchCache.clear();
            ix = buildIndex(data);
            indexLanguage = H.lang();
        }
    }
    async function preview(id, place) {
        await readMissions();
        if (place) await window.VOLT_STARMAP?.links?.load?.();
        const indexes = place ? [...placeEntries(place)] : ix.byId.has(id) ? [ix.byId.get(id)] : [];
        return { count: indexes.length, items: indexes.slice(0, 5).map(index => {
            const { c } = ix.entries[index];
            return { id: c.id, name: plain(titleOf(c)) || t('noTitle'),
                rank: t('colRank') + ' · ' + rankCell(c), pay: t('colPay') + ' · ' + payText(c.pay) };
        }) };
    }

    async function fetchData() {
        load.error = null;
        draw();
        try {
            await readMissions();
            sanitize();
        } catch (error) {
            load.error = error;
        }
        draw();
    }

    // ── 입력 처리 ───────────────────────────────────────────────────────────
    function setStatus(message) {
        statusText = message;
        const node = headEl?.querySelector('[data-ms-status]');
        if (node) node.textContent = message;
    }

    function onClick(event) {
        const target = event.target.closest('[data-ms-open],[data-ms-back],[data-ms-chip],[data-ms-clear],[data-ms-placeclear],[data-ms-view],[data-ms-sort],[data-ms-dir],[data-ms-more],[data-ms-share],[data-ms-calc],[data-ms-pick],[data-ms-pickmore],[data-ms-tab],[data-ms-retry]');
        if (!target || !root.contains(target)) return;
        const data = target.dataset;
        if (data.msRetry !== undefined) { fetchData(); return; }
        if (!ix) return;
        if (data.msShare === undefined) statusText = '';   // '주소를 복사했습니다' 같은 안내는 다음 동작에서 지운다
        if (data.msOpen) {
            if (event.ctrlKey || event.metaKey || event.shiftKey) return;   // 새 탭으로 여는 것은 그대로 둔다
            event.preventDefault();
            view.tab = 'list';
            view.m = data.msOpen;
            syncHash(true);
            draw('detail-title');
            root.scrollIntoView({ block: 'start' });
        } else if (data.msBack !== undefined) {
            const id = view.m;
            view.m = '';
            syncHash(true);
            draw(`open:${id}`);
        } else if (data.msChip) {
            view.chips[data.msChip].cycle(data.id);
            if (data.msChip === 'scope' && !rankScope()) view.rank = '';
            view.limit = PAGE;
            view.filtersOpen = true;
            syncHash();
            draw();
        } else if (data.msPlaceclear !== undefined) {
            view.place = '';
            view.limit = PAGE;
            syncHash();
            draw('q');
        } else if (data.msClear !== undefined) {
            for (const key of CHIP_KEYS) view.chips[key].clear();
            Object.assign(view, { scuMin: '', scuMax: '', box: '', rank: '', limit: PAGE, filtersOpen: true });
            syncHash();
            draw('filters');
        } else if (data.msView) {
            view.view = data.msView;
            syncHash();
            draw();
        } else if (data.msSort) {
            view.sort = view.sort === data.msSort ? `-${data.msSort}` : data.msSort;
            syncHash();
            draw();
        } else if (data.msDir !== undefined) {
            view.sort = view.sort.startsWith('-') ? view.sort.slice(1) : `-${view.sort}`;
            syncHash();
            draw();
        } else if (data.msMore !== undefined) {
            const before = view.limit;
            view.limit += PAGE;
            setStatus('');
            appendRows(before);
        } else if (data.msPickmore !== undefined) {
            const before = view.pickLimit;
            view.pickLimit += PICK_PAGE;
            setStatus('');
            paint(bodyEl.querySelector('[data-ms-pickout]'), pickerHtml());
            bodyEl.querySelector(`[data-focus="pick:${before}"]`)?.focus();
        } else if (data.msShare !== undefined) {
            H.copyShareUrl(SECTION, currentParams()).then((ok) => setStatus(H.text(ok ? 'copied' : 'copyFailed')));
        } else if (data.msCalc || data.msPick) {
            Object.assign(view, { tab: 'rank', m: '', calcM: data.msCalc || data.msPick, calcPair: '', pick: '', pickLimit: PICK_PAGE });
            syncHash(true);
            draw(data.msPick ? 'rep' : 'tab:rank');
        } else if (data.msTab) {
            openTab(data.msTab);
        }
    }

    function openTab(id) {
        view.tab = id;
        if (id === 'list') view.m = '';    // '임무 목록' 탭은 늘 목록을 연다 (보던 임무는 뒤로 가기로 돌아간다)
        syncHash(true);
        draw(`tab:${id}`);
    }

    function onKeydown(event) {
        const tab = event.target.closest?.('[data-ms-tab]');
        if (!tab || !ix) return;
        const ids = ['list', 'rank', 'path'];
        const at = ids.indexOf(tab.dataset.msTab);
        const next = { ArrowRight: ids[(at + 1) % ids.length], ArrowLeft: ids[(at + ids.length - 1) % ids.length], Home: ids[0], End: ids[ids.length - 1] }[event.key];
        if (!next) return;
        event.preventDefault();
        statusText = '';
        if (next !== view.tab) openTab(next);
    }

    function onInput(event) {
        const { id, value } = event.target;
        if (!ix) return;
        setStatus('');
        if (id === 'missions-q') { view.q = value; view.limit = PAGE; later(() => { syncHash(); drawOut(); }); }
        else if (id === 'missions-scu-min' || id === 'missions-scu-max') {
            view[id.endsWith('min') ? 'scuMin' : 'scuMax'] = /^\d+(\.\d+)?$/.test(value) ? value : '';
            view.limit = PAGE;
            later(() => { syncHash(); drawOut(); });
        } else if (id === 'missions-rep') { view.calcRep = cleanNumber(value); later(() => { syncHash(); drawOut(); }); }
        else if (id === 'missions-prep') { view.pathRep = cleanNumber(value); later(() => { syncHash(); drawOut(); }); }
        else if (id === 'missions-pick') { view.pick = value; view.pickLimit = PICK_PAGE; later(() => paint(bodyEl.querySelector('[data-ms-pickout]'), pickerHtml())); }
    }

    function onChange(event) {
        const { id, value } = event.target;
        if (!ix) return;
        const field = { 'missions-sort': 'sort', 'missions-box': 'box', 'missions-rank': 'rank', 'missions-pair': 'calcPair', 'missions-pp': 'pathPair', 'missions-pto': 'pathTo', 'missions-psys': 'pathSys' }[id];
        if (!field) return;
        statusText = '';
        view[field] = value;
        if (field === 'pathPair') { view.pathTo = ''; view.pathRep = ''; }
        view.limit = PAGE;
        syncHash();
        draw();
    }

    function onToggle(event) {
        if (event.target.matches?.('[data-ms-filters]')) view.filtersOpen = event.target.open;
    }

    window.VOLT_MISSIONS = {
        preview,
        // 섹션이 처음 열릴 때 한 번. mount = #missions-app, ctx = { section, lang, params }
        init(mount, ctx) {
            root = mount;
            headEl = H.el('div', { class: 'missions-head' });
            bodyEl = H.el('div', { class: 'missions-body', id: 'missions-panel' });
            root.replaceChildren(headEl, bodyEl);
            root.addEventListener('click', onClick);
            root.addEventListener('keydown', onKeydown);
            root.addEventListener('input', onInput);
            root.addEventListener('change', onChange);
            root.addEventListener('toggle', onToggle, true);
            applyParams(ctx?.params);
            fetchData();
            window.VOLT_STARMAP?.links?.load?.().then((ready) => { if (ready && load.data && view.tab === 'list' && (view.m || view.place)) draw(); });
        },
        // 언어가 바뀔 때마다 (init 뒤에만). 이름표를 새 언어로 다시 만든다.
        onLanguageChange() {
            if (load.data) ix = buildIndex(load.data);
            statusText = '';
            draw();
        },
        // 섹션이 다시 열리거나 주소(#missions?...)가 바뀔 때. 값이 없는 주소(#missions)는 기본 화면이다.
        onRoute(params) {
            const before = { tab: view.tab, m: view.m, key: listKey(), limit: view.limit };
            applyParams(params);
            statusText = '';
            sanitize();
            // 브라우저의 뒤로 가기로 임무에서 목록으로 돌아오면, 늘려 둔 줄 수와 보던 자리를 그대로 둔다.
            if (listKey() === before.key) view.limit = before.limit;
            const opened = before.tab === 'list' && before.m && view.tab === 'list' && !view.m && ix ? ix.entries[ix.byId.get(before.m)] : null;
            draw();
            if (!opened) return;
            // 섹션을 여는 쪽(navigation.js)이 이 뒤에 화면을 맨 위로 올리므로, 그 일이 끝난 다음에 보던 줄로 돌아간다.
            window.setTimeout(() => {
                const rowButton = view.tab === 'list' && !view.m ? root.querySelector(`[data-focus="${window.CSS.escape(`open:${opened.c.id}`)}"]`) : null;
                if (!rowButton) return;
                rowButton.focus({ preventScroll: true });
                rowButton.scrollIntoView({ block: 'center', behavior: 'instant' });
            }, 0);
        },
    };
})();
