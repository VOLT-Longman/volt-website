/**
 * 개인 장비 안내 — 개인 무기와 방어구를 견주고, 색상·한정판 변종과 판매처를 보여 준다.
 * - 수치: /data/gear/weapons.json, /data/gear/armor.json (출처: 게임 파일, scripts/gear/build-gear-data.mjs)
 * - 판매처·가격: /api/uex/loadout-prices (출처 UEX). 받지 못해도 수치는 그대로 보인다.
 * 변종은 수치가 완전히 같은 것끼리 한 묶음이다. 가격은 변종마다 다르므로 묶음 안에서 가장 싼 것을 대표로 보여 준다.
 * 값은 게임 파일 그대로이며 게임 안에서 실측한 값이 아니다.
 */
(function () {
    'use strict';
    const DATA = { weapon: '/data/gear/weapons.json', armor: '/data/gear/armor.json', body: '/data/gear/body.json', icons: '/data/gear/icons.json', images: '/data/gear/images.json', attach: '/data/gear/attachments.json', models: '/data/gear/models.json' };
    const MOD_KEY = 'volt.gear.mod.v1';
    // 3D는 넓은 화면 + 마우스(정밀 포인터)에서만 켠다. 휴대폰은 항상 그림으로 보여 준다.
    const MOD_3D_QUERY = '(min-width: 1024px) and (pointer: fine)';
    const MOD_VIEWS = ['iso', 'side', 'top', 'back'];
    // index.html 이 이 파일에 붙인 ?v= 를 3D 보기 모듈에도 그대로 붙인다(배포 때 함께 바뀐다).
    const ASSET_QUERY = (() => { try { return new URL(document.currentScript.src).search; } catch (_error) { return ''; } })();
    const CART_KEY = 'volt.gear.cart.v1';
    const FIT_KEY = 'volt.gear.fit.v1';
    const BODY_PARTS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    // UEX 품목 분류: 개인 무기 18 / 팔 1 · 배낭 2 · 투구 3 · 다리 4 · 몸통 5 · 언더수트 24
    const PRICE_CATEGORIES = { weapon: [18], armor: [1, 2, 3, 4, 5, 24] };
    const KINDS = ['pistol', 'smg', 'rifle', 'lmg', 'hmg', 'shotgun', 'sniper', 'launcher', 'crossbow', 'tool'];
    const SLOTS = ['helmet', 'core', 'arms', 'legs', 'undersuit', 'backpack'];
    const CLASSES = ['light', 'medium', 'heavy'];
    const DAMAGE = ['physical', 'energy', 'distortion', 'thermal', 'biochemical', 'stun'];
    const PAGE = 60;
    const TEXT = {
        ko: {
            loading: '개인 장비 자료를 불러오는 중입니다…', loadError: '개인 장비 자료를 불러오지 못했습니다.', retry: '다시 시도',
            weapon: '무기', armor: '방어구', views: '장비 종류', search: '이름 검색 (스킨·버전 포함)', searchLabel: '검색', all: '전체',
            kinds: '무기 종류', pistol: '권총', smg: '기관단총', rifle: '라이플', lmg: '경기관총', hmg: '중기관총', shotgun: '샷건', sniper: '스나이퍼', launcher: '런처', crossbow: '석궁', tool: '도구',
            slot: '부위', helmet: '헬멧', core: '몸통 (코어)', arms: '팔', legs: '다리', undersuit: '언더수트', backpack: '배낭', allSlots: '부위 전체',
            armorClass: '아머 종류', light: '라이트 아머', medium: '미디움 아머', heavy: '헤비 아머', allClasses: '아머 종류 전체', noClass: '분류 없음',
            sort: '정렬', sortDefault: '기본', sortDps: '이론 DPS 높은 순', sortPrice: '최저가 낮은 순', sortCut: '피해 감소 높은 순', sortStore: '수납공간 큰 순',
            name: '이름', kind: '종류', damage: '한 발 피해', rate: '분당 발사 수', dps: '이론 DPS', mag: '탄창', speed: '탄속', range: '사거리', price: '최저가',
            cut: '피해 감소', temp: '견디는 온도', rad: '방사선 용량', store: '수납공간', variantsCount: '스킨·버전 {count}종', oneVariant: '1개 버전',
            physical: '물리', energy: '에너지', distortion: '디스토션', thermal: '열', biochemical: '생화학', stun: '기절',
            pick: '장비를 선택하면 성능, 스킨·버전, 판매처를 볼 수 있습니다.', noResult: '맞는 장비가 없습니다.', more: '{count}개 더 보기', count: '{count}종',
            modes: '발사 방식', mode: '방식', single: '단발', rapid: '연사', burst: '점사', charged: '충전', beam: '빔', sequence: '순차 발사', other: '기타',
            pulls: '방아쇠 한 번에 {shots}발 · 분당 {pulls}회', burstShots: '{count}점사', pellets: '산탄 {count}발', chargeTime: '충전 {time}초',
            basisSequence: '발사 순서의 대기 시간으로 계산한 값', basisAutomatic: '게임 파일 값', basisUpper: '최대 한도 — 장전·충전 동작 때문에 실제는 더 느릴 수 있음',
            basisTitle: '발사 속도 계산 기준', ammo: '탄약', dropLine: '{start}m부터 미터당 {per} 감소 (최저 {floor})', blast: '폭발 {dmg} · 반경 {radius}m',
            attachments: '부착물 슬롯', optics: '조준경', barrel: '총열', under: '하부', upTo: 'S{size}까지', mass: '무게', maker: '제조사', size: '크기',
            guns: '무기 슬롯', mags: '탄창 슬롯', radRate: '방사선 해소율', perSecond: '/초',
            variants: '스킨·버전별 판매처', variantName: '스킨·버전', shops: '판매처', cheapest: '최저가', noShop: '판매처 정보 없음', shopsCount: '{count}곳',
            variantsNote: '아래 스킨·버전은 성능이 같습니다. 판매처와 가격은 다를 수 있습니다.', priceLoading: '가격 확인 중', priceFailed: '가격을 불러오지 못했습니다',
            noShopNote: '판매처 정보가 없다고 해서 얻을 수 없다는 뜻은 아닙니다. 전리품·보상으로만 얻는 품목일 수 있습니다.',
            dpsNote: '이론 DPS = 피해 × 산탄 수 × 연사 ÷ 60. 재장전·반동·거리 감소를 뺀 값입니다.',
            sourcePrice: '판매처·가격: UEX',
            uec: 'aUEC', unknown: '—',
            preset: '세트로 착용', presetBare: '맨몸', presetLight: '라이트 아머 세트', presetMedium: '미디움 아머 세트', presetHeavy: '헤비 아머 세트', headShots: '머리에 맞으면', torsoShots: '몸통에 맞으면', limbShots: '팔다리에 맞으면', legend: '색 구분', legendLow: '6발 이상', legendMid: '3~5발', legendHigh: '2발 이하', legendCovered: '실선 = 방어구로 덮임',
            fit: '착용·피해 테스트', cart: '장바구니', cartCount: '장바구니 {count}', wear: '이 방어구 착용하기', shootWith: '이 무기로 피해 테스트', addCart: '담기', inCart: '담김 {count}',
            fitIntro: '가정 계산 · 실전 피해가 아닙니다. 같은 부위에 모두 명중하고 방어구 한 겹만 적용한다고 가정합니다. 아래 발 수는 전체 체력을 단순히 나눈 참고값이며, 실제 기절·사망을 예측하지 않습니다.', mannequin: '착용 상태', wearing: '착용 장비', attacker: '공격 무기', none: '없음', noWeapon: '무기를 고르세요',
            distance: '거리 (m)', fireMode: '발사 방식', head: '머리', torso: '몸통', leftArm: '왼팔', rightArm: '오른팔', leftLeg: '왼다리', rightLeg: '오른다리',
            bodyPart: '부위', cover: '착용 장비', bare: '맨몸', perShot: '예상 한 발 피해', shotsToDown: '전체 체력 기준 발 수', shots: '{count}발', timeToDown: '이론 시간', seconds: '{time}초', partHealth: '부위 체력',
            reduction: '받는 피해 배율', takesAll: '피해 없음', poolLine: '계산 기준: 전체 체력 {pool}', clearFit: '모두 벗기기', pickSlot: '{slot} 고르기',
            fitNote: '계산 방식: 한 발 피해 × 부위 배율 × 방어구의 피해 종류별 감소. 방어구가 덮지 않은 부위는 맨몸 배율을 씁니다. 방어구 조각이 없고 언더수트만 있으면 언더수트 값을 씁니다.',
            fitLimits: '게임 내 검증 전입니다. 방어구와 언더수트의 중첩, 내구도 저하, 출혈, 기절, 관통, 탄퍼짐, 빗나감은 반영하지 않습니다. 충전·폭발·기절·디스토션 피해는 이 시험에서 계산하지 않습니다. 시간은 일정한 자동 연사만 단순 환산하며 재장전을 제외합니다.',
            upperNote: '이 발사 방식의 연사는 최대 한도라, 실제 걸리는 시간은 더 길 수 있습니다.', summaryCut: '물리 피해 감소', summaryTemp: '견디는 온도', summaryStore: '총 수납공간', summaryMass: '방어구 무게',
            cartEmpty: '담은 장비가 없습니다. 무기나 방어구의 스킨·버전 목록에서 「담기」를 누르세요.', item: '품목', qty: '수량', unitPrice: '개당 가격', subtotal: '품목 합계', total: '합계', remove: '빼기', clearCart: '장바구니 비우기',
            byShop: '상점별로 살 것', unknownPrice: '가격 미확인 {count}종은 합계에 넣지 않았습니다.', cartNote: '가격은 UEX 기준 최저가입니다. 장바구니는 이 브라우저에만 저장됩니다.', decrease: '수량 줄이기', increase: '수량 늘리기',
            iconCredit: '무기 아이콘 © Cloud Imperium Games', imageBy: '이미지: {author}', imageWiki: 'Star Citizen Wiki', imageCig: '© Cloud Imperium Games', imageSource: '원본 보기',
            imageCredit: '장비 이미지: Star Citizen Wiki 기여자들 (이미지마다 만든 사람과 이용 조건 표시)', imageAlt: '{name} 게임 화면',
            imageExample: '이미지 예시: {name} · 선택한 스킨·버전과 색상이 다를 수 있습니다.', imageResize: '위키가 제공한 축소 사본', backList: '목록으로 돌아가기', pricePartial: '일부 분류의 가격을 불러오지 못했습니다.', excluded: '계산 제외',
            toolNote: '도구의 기본 탄약 참조는 실제 기능의 성능으로 검증되지 않아 공격 수치를 표시하지 않습니다.', specialMode: '별도 게임 모드 설정',
            scrollHint: '표를 좌우로 밀어 나머지 수치와 가격을 비교하세요.',
        },
        en: {
            loading: 'Loading personal gear…', loadError: 'Personal gear data could not be loaded.', retry: 'Retry',
            weapon: 'Weapons', armor: 'Armor', views: 'Gear type', search: 'Search by name (variants included)', searchLabel: 'Search', all: 'All',
            kinds: 'Weapon type', pistol: 'Pistol', smg: 'SMG', rifle: 'Rifle', lmg: 'LMG', hmg: 'HMG', shotgun: 'Shotgun', sniper: 'Sniper', launcher: 'Launcher', crossbow: 'Crossbow', tool: 'Tool',
            slot: 'Slot', helmet: 'Helmet', core: 'Core', arms: 'Arms', legs: 'Legs', undersuit: 'Undersuit', backpack: 'Backpack', allSlots: 'All slots',
            armorClass: 'Class', light: 'Light', medium: 'Medium', heavy: 'Heavy', allClasses: 'All classes', noClass: 'No class',
            sort: 'Sort', sortDefault: 'Default', sortDps: 'Highest theoretical DPS', sortPrice: 'Lowest price', sortCut: 'Highest damage reduction', sortStore: 'Largest storage',
            name: 'Name', kind: 'Type', damage: 'Damage/shot', rate: 'Rate (rpm)', dps: 'Theoretical DPS', mag: 'Magazine', speed: 'Velocity', range: 'Range', price: 'Lowest price',
            cut: 'Damage reduction', temp: 'Temperature range', rad: 'Radiation capacity', store: 'Storage', variantsCount: '{count} variants', oneVariant: 'Single item',
            physical: 'Physical', energy: 'Energy', distortion: 'Distortion', thermal: 'Thermal', biochemical: 'Biochemical', stun: 'Stun',
            pick: 'Pick an item to see its stats, variants and shops.', noResult: 'No gear matches.', more: 'Show {count} more', count: '{count} groups',
            modes: 'Fire modes', mode: 'Mode', single: 'Single', rapid: 'Auto', burst: 'Burst', charged: 'Charged', beam: 'Beam', sequence: 'Sequence', other: 'Other',
            pulls: '{shots} shots per pull · {pulls} pulls/min', burstShots: '{count}-round burst', pellets: '{count} pellets', chargeTime: '{time} s charge',
            basisSequence: 'Computed from the delays in the firing sequence', basisAutomatic: 'Game file value', basisUpper: 'Upper bound — reload or charge animations can make it slower',
            basisTitle: 'Basis of the rate', ammo: 'Ammo', dropLine: 'Drops {per} per metre from {start} m (floor {floor})', blast: 'Blast {dmg} · radius {radius} m',
            attachments: 'Attachment slots', optics: 'Optics', barrel: 'Barrel', under: 'Underbarrel', upTo: 'up to S{size}', mass: 'Mass', maker: 'Maker', size: 'Size',
            guns: 'Weapon slots', mags: 'Magazine slots', radRate: 'Radiation scrub rate', perSecond: '/s',
            variants: 'Variants and shops', variantName: 'Variant', shops: 'Shops', cheapest: 'Lowest price', noShop: 'No shop data', shopsCount: '{count} shops',
            variantsNote: 'These variants have identical stats. Only shops and prices differ.', priceLoading: 'Checking prices', priceFailed: 'Prices could not be loaded',
            noShopNote: 'No shop data does not mean an item cannot be obtained; it may be loot or a reward only.',
            dpsNote: 'Theoretical DPS = damage × pellets × rate ÷ 60. Reloads, recoil and range drop-off are not included.',
            sourcePrice: 'Shops and prices: UEX',
            uec: 'aUEC', unknown: '—',
            preset: 'Quick sets', presetBare: 'Bare', presetLight: 'Light set', presetMedium: 'Medium set', presetHeavy: 'Heavy set', headShots: 'Hit in the head', torsoShots: 'Hit in the torso', limbShots: 'Hit in a limb', legend: 'Colours', legendLow: '6+ shots', legendMid: '3–5 shots', legendHigh: '2 or fewer', legendCovered: 'Solid outline = covered by armor',
            fit: 'Fitting test', cart: 'Cart', cartCount: 'Cart {count}', wear: 'Put on the mannequin', shootWith: 'Shoot with this weapon', addCart: 'Add', inCart: 'In cart {count}',
            fitIntro: 'Hypothetical calculation, not in-game damage. Assumes every shot hits the same part and applies one armor layer only. Shot counts simply divide the health pool; they do not predict incapacitation or death.', mannequin: 'Fitting', wearing: 'Equipped', attacker: 'Attacking weapon', none: 'None', noWeapon: 'Pick a weapon',
            distance: 'Distance (m)', fireMode: 'Fire mode', head: 'Head', torso: 'Torso', leftArm: 'Left arm', rightArm: 'Right arm', leftLeg: 'Left leg', rightLeg: 'Right leg',
            bodyPart: 'Body part', cover: 'Covered by', bare: 'Bare', perShot: 'Hypothetical damage/shot', shotsToDown: 'Health-pool equivalent', shots: '{count} shots', timeToDown: 'Theoretical time', seconds: '{time} s', partHealth: 'Part health',
            reduction: 'Multiplier', takesAll: 'No damage', poolLine: 'Against a health pool of {pool}', clearFit: 'Remove everything', pickSlot: 'Pick {slot}',
            fitNote: 'How it is computed: damage per shot × body part multiplier × the armor reduction for each damage type. Uncovered parts use the bare multiplier. With no armor piece but an undersuit, the undersuit values apply.',
            fitLimits: 'Not verified in game. Armor/undersuit stacking, wear, bleeding, stun, penetration, spread and misses are not modeled. Charged, explosive, stun and distortion damage are excluded. Time is shown only for constant automatic fire, without reloads.',
            upperNote: 'The rate of this fire mode is an upper bound, so the real time can be longer.', summaryCut: 'Physical reduction', summaryTemp: 'Temperature range', summaryStore: 'Total storage', summaryMass: 'Armor mass',
            cartEmpty: 'Nothing in the cart. Use “Add” in the variant list of a weapon or armor piece.', item: 'Item', qty: 'Qty', unitPrice: 'Unit price', subtotal: 'Subtotal', total: 'Total', remove: 'Remove', clearCart: 'Empty the cart',
            byShop: 'What to buy at each shop', unknownPrice: '{count} items without a known price are left out of the total.', cartNote: 'Prices are the lowest known on UEX. The cart is stored in this browser only.', decrease: 'Decrease quantity', increase: 'Increase quantity',
            iconCredit: 'Weapon icons © Cloud Imperium Games', imageBy: 'Image: {author}', imageWiki: 'Star Citizen Wiki', imageCig: '© Cloud Imperium Games', imageSource: 'View original',
            imageCredit: 'Gear images: Star Citizen Wiki contributors (author and licence shown with each image)', imageAlt: 'In-game view of {name}',
            imageExample: 'Example image: {name}. Colour may differ from the selected variant.', imageResize: 'Thumbnail provided by the wiki', backList: 'Back to list', pricePartial: 'Prices for some categories could not be loaded.', excluded: 'Not modeled',
            toolNote: 'The default ammo references on tools are not verified as functional performance, so combat stats are not shown.', specialMode: 'Separate game-mode configuration',
            scrollHint: 'Swipe the table sideways to compare the remaining stats and prices.',
        },
    };
    Object.assign(TEXT.ko, { filters: '상세 필터', resetFilters: '필터 초기화', shopOnly: '상점에서 구매 가능한 장비만', shopOnlyNote: '스킨·버전 중 하나 이상을 상점에서 살 수 있는 장비', damageType: '피해 종류', minMag: '최소 탄창 용량', maxMass: '최대 무게 (kg)', minStore: '최소 수납공간 (µSCU)', environment: '사용할 온도 (°C)', filterCount: '필터 {count}개', matched: '{count} / {total}종', filterEmpty: '조건에 맞는 장비가 없습니다. 필터를 줄여 보세요.', afterHit: '1발 맞았을 때', remainingHealth: '피격 후 남은 부위 체력 (가정)', bodyHealth: '부위별 상태', choosePart: '부위를 선택해 보호 장비와 피해를 확인하세요.', fullHealth: '기본 부위 체력', allMakers: '모든 제조사', priceRetry: '판매처 다시 조회', selectedPart: '선택한 부위', equipment: '착용 장비' });
    Object.assign(TEXT.en, { filters: 'Filters', resetFilters: 'Reset filters', shopOnly: 'Available at shops only', shopOnlyNote: 'At least one variant has a confirmed shop listing', damageType: 'Damage type', minMag: 'Minimum magazine', maxMass: 'Maximum mass (kg)', minStore: 'Minimum storage (µSCU)', environment: 'Operating temperature (°C)', filterCount: '{count} filters', matched: '{count} / {total} groups', filterEmpty: 'No matching gear. Try removing a filter.', afterHit: 'One-hit scenario for this part', remainingHealth: 'Hypothetical remaining part health', bodyHealth: 'Body status', choosePart: 'Select a part to inspect its protection and damage.', fullHealth: 'Base part health', allMakers: 'All manufacturers', priceRetry: 'Retry shops', selectedPart: 'Selected part', equipment: 'Protecting equipment' });
    // 개조 화면. 자리 이름(조준경 부착물 등)과 수치 이름은 자료(attachments.json, 한국어 패치 표기)에서 온다.
    Object.assign(TEXT.ko, {
        mod: '개조', modThis: '이 무기 개조하기', modPick: '개조할 무기', modPickHint: '개조할 무기를 고르면 부착물 자리와 그 자리에 맞는 부품이 나옵니다.',
        modSlots: '부착물 자리', modEmpty: '비어 있음', modClear: '떼기', modFixed: '기본으로 들어가는 것만 보여 줍니다', modNoSlots: '이 무기에는 바꿔 달 수 있는 부착물 자리가 없습니다.',
        modParts: '{slot} 고르기', modPartsCount: '맞는 부품 {count}개', modFitted: '장착됨', modPartsNote: '목록에는 주요 수치만 나옵니다. 장착하면 수치 표에 전부 나옵니다.',
        modDesc: '게임 안 설명문', modDescNote: '설명문과 수치 표의 값이 다를 때가 있습니다. 둘 다 게임 파일에 적힌 그대로입니다.',
        modStats: '수치', modBase: '무기 기본 수치', modChanges: '부착물별 기록값', modStat: '항목', modChange: '기록값', modAfter: '부착물',
        modNoChange: '지금 장착한 부품은 수치를 바꾸지 않습니다.', modNothing: '장착한 부착물이 없습니다.',
        modEstimate: '각 부착물의 게임 기록값을 따로 보여 줍니다. 여러 부품의 효과가 겹치는 방식은 확인되지 않아 합산하거나 최종 성능을 추정하지 않습니다.',
        modSiteLabel: '＊ 표시는 게임 설명문에 없는 항목이라 사이트에서 이름을 붙였습니다. 게임에서 실제로 쓰이는 값인지 확인되지 않았습니다.',
        modDefaults: '게임 기본 상태', modStrip: '모두 떼기', modShare: '공유 주소 복사', modCopied: '주소를 복사했습니다.', modCopyFail: '복사하지 못했습니다. 주소 표시줄의 주소를 직접 복사하세요.',
        modSaved: '조합은 이 브라우저에 저장됩니다. 주소에도 담기므로 주소를 보내면 같은 조합이 열립니다.',
        mod3dLoading: '3D 모형을 불러오는 중입니다…', modCanvas: '{name} 3D 모형', modCanvasHelp: '끌어서 돌립니다. 모형을 한 번 누른 뒤에는 휠로 확대하고, 화살표 키로 돌리고, +, - 키로 확대·축소할 수 있습니다. 누르지 않았을 때는 Ctrl 을 누른 채 휠을 굴리면 확대됩니다.',
        modWhyLost: '3D 그림이 멈춰서 그림으로 보여 줍니다.', modRetry3d: '3D 다시 불러오기', modShared: '받은 주소의 조합을 보여 주고 있습니다. 저장해 둔 내 조합은 그대로 있고, 여기서 부품을 바꾸면 그때 내 조합으로 저장됩니다.',
        modDiffers: '이 부품은 게임 설명문의 숫자와 게임 기록값이 서로 다릅니다. 위 목록과 수치 표는 기록값이고, 아래는 설명문 그대로입니다. 게임 안에서 어느 쪽이 맞는지는 확인하지 못했습니다.',
        modViews: '보는 방향', modView_iso: '비스듬히', modView_side: '옆', modView_top: '위', modView_back: '뒤',
        modWhySmall: '화면이 작거나 터치 기기에서는 3D 대신 그림으로 보여 줍니다.', modWhyUnsupported: '이 브라우저에서는 3D를 쓸 수 없어 그림으로 보여 줍니다.', modWhyNoModel: '이 무기는 3D 모형이 준비되지 않아 그림으로 보여 줍니다.',
        modWhyNoData: '3D 모형 목록을 받지 못해 그림으로 보여 줍니다.', modWhyFailed: '3D 모형을 불러오지 못해 그림으로 보여 줍니다.', modNoImage: '이 무기는 보여 줄 그림이 없습니다.', modPartNoModel: '이 부품은 3D 모형이 없어 화면에는 나오지 않습니다.',
        modScopeZoom: '확대', modScopeNight: '야간 투시', modLight: '세기 {intensity} · 퍼짐 {fov}°',
        modCredit: '3D 모형과 겉면 그림 © Cloud Imperium Games. 비공식 팬 사이트에서 보여 주려고 게임 파일에서 변환한 것이며, 색과 질감은 실제 게임과 다를 수 있습니다.',
    });
    Object.assign(TEXT.en, {
        mod: 'Modding', modThis: 'Mod this weapon', modPick: 'Weapon to mod', modPickHint: 'Pick a weapon to see its attachment slots and the parts that fit them.',
        modSlots: 'Attachment slots', modEmpty: 'Empty', modClear: 'Remove', modFixed: 'Shows the default item only', modNoSlots: 'This weapon has no attachment slots you can change.',
        modParts: 'Choose: {slot}', modPartsCount: '{count} parts fit', modFitted: 'Fitted', modPartsNote: 'The list shows the main numbers only. Fit a part to see all of them in the stats table.',
        modDesc: 'In-game description', modDescNote: 'The description and the stats table sometimes disagree. Both are exactly what the game files say.',
        modStats: 'Stats', modBase: 'Base weapon stats', modChanges: 'Records for each attachment', modStat: 'Stat', modChange: 'Recorded value', modAfter: 'Attachment',
        modNoChange: 'The fitted parts do not change any stats.', modNothing: 'No attachments fitted.',
        modEstimate: 'Game records are shown separately for each attachment. Stacking rules are not verified, so these values are not combined and final weapon performance is not estimated.',
        modSiteLabel: '＊ marks stats that the in-game descriptions do not mention; the names are ours, and it is not confirmed that the game uses these values.',
        modDefaults: 'Game default', modStrip: 'Remove all', modShare: 'Copy share link', modCopied: 'Link copied.', modCopyFail: 'Could not copy. Copy the address from the address bar instead.',
        modSaved: 'Builds are saved in this browser. The address also carries the build, so sending it opens the same build.',
        mod3dLoading: 'Loading the 3D model…', modCanvas: '3D model of {name}', modCanvasHelp: 'Drag to turn. After clicking the model you can zoom with the wheel, turn it with the arrow keys and zoom with + and -. Without clicking, hold Ctrl and scroll to zoom.',
        modWhyLost: 'The 3D picture stopped, so a picture is shown instead.', modRetry3d: 'Load 3D again', modShared: 'Showing the build from the address you opened. Your own saved build is untouched; it is replaced only when you change a part here.',
        modDiffers: 'For this part the numbers in the game description and the values in the game data differ. The list and the table use the data values; the lines below are the description as written. Which one the game applies was not verified in game.',
        modViews: 'View direction', modView_iso: 'Angled', modView_side: 'Side', modView_top: 'Top', modView_back: 'Rear',
        modWhySmall: 'On small screens and touch devices a picture is shown instead of 3D.', modWhyUnsupported: 'This browser cannot show 3D, so a picture is shown instead.', modWhyNoModel: 'No 3D model is available for this weapon, so a picture is shown instead.',
        modWhyNoData: 'The 3D model list could not be loaded, so a picture is shown instead.', modWhyFailed: 'The 3D model could not be loaded, so a picture is shown instead.', modNoImage: 'There is no picture for this weapon.', modPartNoModel: 'This part has no 3D model, so it is not drawn.',
        modScopeZoom: 'Zoom', modScopeNight: 'Night vision', modLight: 'Intensity {intensity} · spread {fov}°',
        modCredit: '3D models and textures © Cloud Imperium Games. Converted from the game files for this unofficial fan site; colours and surfaces are approximate.',
    });
    const FILTER_DEFAULTS = { query: '', kind: '', slot: '', cls: '', maker: '', damageType: '', fireMode: '', minMag: '', maxMass: '', minStore: '', environment: '', shopOnly: false };
    const state = { ...FILTER_DEFAULTS, detailOpen: false, filtersOpen: window.innerWidth > 700, part: 'torso', view: 'weapon', data: {}, error: {}, loading: {}, sort: '', selected: { weapon: '', armor: '' }, limit: PAGE, prices: {}, priceState: {}, fit: { wear: {}, weapon: '', mode: 0, distance: 10 }, cart: {}, mod: { weapon: '', slot: '', builds: {}, visiting: {}, notice: '' } };
    let root = null;
    let composingSearch = null;
    let started = false;
    let modAccess = { status: 'loading', loggedIn: false, allowed: false };
    let refreshModAccess = () => Promise.resolve();
    let modAccessEpoch = 0;
    const modRequests = new Set();

    function setModAccess(access) {
        const wasAllowed = modAccess.allowed;
        const hadFocus = wasAllowed && root?.contains(document.activeElement);
        modAccess = { ...access, allowed: access.publicEditor === true || (access.status === 'ready' && access.loggedIn === true && access.allowed === true) };
        if (!modAccess.allowed) {
            modAccessEpoch++;
            for (const controller of modRequests) controller.abort();
            modRequests.clear();
            for (const key of ['attach', 'models']) { delete state.data[key]; delete state.loading[key]; delete state.error[key]; }
            stopMod3d();
        }
        if (state.view === 'mod' && root) {
            draw(!modAccess.allowed && hadFocus ? '[data-gear-mod-access-retry]' : undefined);
            if (modAccess.allowed && !wasAllowed) load('mod');
        }
    }

    function modGate() {
        const t = (key) => window.VOLT_I18N.t(`gear.modAccess.${key}`);
        const key = modAccess.status === 'loading' ? 'checking' : modAccess.status === 'error' ? 'error'
            : !modAccess.loggedIn ? 'signedOut' : modAccess.configured === false ? 'unconfigured' : 'missingRole';
        const current = /^#gear\?mod=[\w~-]+(?:&[\w~=-]+)*$/.test(window.location.hash) ? `/${window.location.hash}`
            : state.mod.weapon ? `/#gear?mod=${encodeURIComponent(state.mod.weapon)}` : '/#gear?view=mod';
        return `${toolbar()}<section class="gear-mod-gate community-gate" aria-labelledby="gear-mod-access-title">
            <h3 id="gear-mod-access-title">${esc(t('title'))}</h3><p role="status">${esc(t(key))}</p>
            <div class="community-gate-actions">${key === 'signedOut' ? `<a class="btn btn-primary" href="/auth/discord/login?returnTo=${esc(encodeURIComponent(current))}">${esc(t('login'))}</a>` : ''}
            <button type="button" class="btn btn-secondary" data-gear-mod-access-retry${key === 'checking' ? ' disabled' : ''}>${esc(t('retry'))}</button></div></section>`;
    }

    const lang = () => (window.VOLT_I18N?.getLang?.() === 'en' ? 'en' : 'ko');
    const text = (key, values) => String(TEXT[lang()][key] ?? TEXT.ko[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values?.[name] ?? '');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const label = (name) => (lang() === 'ko' && name?.ko ? name.ko : name?.en || '');
    const num = (value, digits = 0) => (Number(value) || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: digits });
    const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const variantName = (variant) => (lang() === 'ko' && variant[2] ? variant[2] : variant[1]);

    function readStored(key, fallback) { try { const value = JSON.parse(window.localStorage.getItem(key) || 'null'); return value && typeof value === 'object' ? value : fallback; } catch (_error) { return fallback; } }
    function store(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_error) { /* 저장을 못 해도 화면은 동작한다 */ } }
    const groupsOf = (view) => state.data[view]?.groups || [];
    const findGroup = (view, id) => groupsOf(view).find((group) => group.id === id) || null;
    // 변종 고유번호 → { view, group, variant }
    function findVariant(uuid) {
        for (const view of ['weapon', 'armor']) for (const group of groupsOf(view)) { const variant = group.variants.find((item) => item[0] === uuid); if (variant) return { view, group, variant }; }
        return null;
    }
    const cartTotal = () => Object.values(state.cart).reduce((sum, count) => sum + count, 0);
    const photoOf = (group) => state.data.images?.images?.[group.id] || null;
    const thumbOf = (group) => { const photo = photoOf(group); return photo ? `<img class="gear-thumb" src="/${esc(photo.file)}" width="${esc(photo.width)}" height="${esc(photo.height)}" alt="" loading="lazy" decoding="async">` : (state.view === 'weapon' ? iconOf(group) : ''); };
    // 상세의 큰 그림과 출처: 만든 사람 · 이용 조건 · 원본 주소를 함께 보여 준다.
    function figureOf(group) {
        const photo = photoOf(group); if (!photo) return '';
        const cig = /Cloud Imperium/i.test(photo.license);
        const licenseUrl = /^https:\/\/creativecommons\.org\/(licenses|publicdomain)\//.test(photo.licenseUrl || '') ? photo.licenseUrl : '';
        const license = licenseUrl ? `<a href="${esc(licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(photo.license)}</a>` : esc(photo.license);
        const credit = [cig ? text('imageCig') : (photo.author ? text('imageBy', { author: photo.author }) : ''), text('imageWiki'), text('imageResize')].filter(Boolean).map(esc).join(' · ');
        const safe = /^https:\/\/starcitizen\.tools\//.test(photo.source || '') ? photo.source : '';
        return `<figure class="gear-figure"><img src="/${esc(photo.file)}" width="${esc(photo.width)}" height="${esc(photo.height)}" alt="${esc(text('imageAlt', { name: label(group.name) }))}" loading="lazy" decoding="async">
            <figcaption>${esc(text('imageExample', { name: photo.page || group.name.en }))}<br>${credit}${cig ? '' : ` · ${license}`}${safe ? ` · <a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(text('imageSource'))}</a>` : ''}</figcaption></figure>`;
    }
    const iconOf = (group) => { const icon = state.data.icons?.icons?.[group.id]; return icon ? `<img class="gear-icon" src="/${esc(icon.file)}" width="${esc(icon.width)}" height="${esc(icon.height)}" alt="" loading="lazy" decoding="async">` : ''; };

    // ---- 수치 ---------------------------------------------------------------
    const totalDamage = (damage) => Object.values(damage || {}).reduce((sum, value) => sum + value, 0);
    // 대표 발사 방식: 연사가 가장 높은 것. 빔은 초당 피해를 그대로 쓴다.
    function bestMode(group) {
        if (group.combatVerified === false) return null;
        const modes = (group.modes || []).filter((mode) => mode.rpm || mode.beam);
        return modes.sort((a, b) => Number(a.k === 'charged') - Number(b.k === 'charged') || (b.rpm || 0) - (a.rpm || 0))[0] || null;
    }
    function dpsOf(group) {
        const mode = bestMode(group); if (!mode) return 0;
        if (mode.beam) return totalDamage(mode.beam);
        return totalDamage(group.ammo?.dmg) * (mode.pellets || 1) * (mode.rpm || 0) / 60;
    }
    const cutOf = (group) => group.cut?.[0] ?? -1;

    // ---- 가격 ---------------------------------------------------------------
    function shopsOf(variant, view = state.view) {
        const table = state.prices[view]; if (!table) return null;
        return table.byUuid.get(String(variant[0]).toLowerCase()) || (table.nameAllowed.has(norm(variant[1])) ? table.byName.get(norm(variant[1])) : null) || null;
    }
    function cheapest(group) {
        let best = null;
        for (const variant of group.variants) for (const shop of shopsOf(variant) || []) if (!best || shop.price < best.price) best = shop;
        return best;
    }
    function priceCell(group) {
        const status = state.priceState[state.view];
        if (status === 'loading') return `<span class="gear-muted">${esc(text('priceLoading'))}</span>`;
        if (status === 'failed') return `<span class="gear-muted">${esc(text('priceFailed'))}</span>`;
        const shop = cheapest(group);
        return shop ? `<strong>${esc(num(shop.price))}</strong> <small>${esc(text('uec'))}</small>` : `<span class="gear-muted">${esc(text('noShop'))}</span>`;
    }
    async function loadPrices(view) {
        if (state.priceState[view]) return;
        state.priceState[view] = 'loading';
        if (state.view === view) draw();
        const byUuid = new Map(); const byName = new Map(); let failed = 0;
        // One category at a time: each server miss already needs two upstream calls.
        for (const category of PRICE_CATEGORIES[view]) {
            try {
                const response = await fetch(`/api/uex/loadout-prices?category=${category}`, { headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error(String(response.status));
                const payload = await response.json();
                for (const [uuid, shops] of Object.entries(payload.data || {})) byUuid.set(uuid.toLowerCase(), shops);
                for (const item of payload.byName || []) byName.set(norm(item.name), item.shops);
            } catch (_error) { failed += 1; }
        }
        const nameCounts = new Map();
        for (const group of groupsOf(view)) for (const variant of group.variants) { const name = norm(variant[1]); nameCounts.set(name, (nameCounts.get(name) || 0) + (group.specialMode ? 2 : 1)); }
        const nameAllowed = new Set([...nameCounts].filter(([, count]) => count === 1).map(([name]) => name));
        state.prices[view] = { byUuid, byName, nameAllowed };
        state.priceState[view] = failed === PRICE_CATEGORIES[view].length ? 'failed' : failed ? 'partial' : 'ready';
        if (state.view === view || state.view === 'cart') draw();
    }

    // ---- 목록 ---------------------------------------------------------------
    function filtered() {
        const groups = state.data[state.view]?.groups || [];
        const query = state.query.trim().toLowerCase();
        const list = groups.filter((group) => {
            if (state.maker && (group.mfr || '') !== state.maker) return false;
            if (state.maxMass !== '' && (!Number.isFinite(group.mass) || group.mass > Number(state.maxMass))) return false;
            if (state.shopOnly && !cheapest(group)) return false;
            if (state.view === 'weapon') {
                if (state.damageType && (group.combatVerified === false || !(group.ammo?.dmg?.[state.damageType] > 0 || group.modes?.some((mode) => mode.beam?.[state.damageType] > 0)))) return false;
                if (state.fireMode && !group.modes?.some((mode) => mode.k === state.fireMode)) return false;
                if (state.minMag !== '' && (!Number.isFinite(group.mag) || group.mag < Number(state.minMag))) return false;
            } else {
                if (state.minStore !== '' && (!Number.isFinite(group.store) || group.store < Number(state.minStore))) return false;
                if (state.environment !== '' && (!group.temp || group.temp[0] > Number(state.environment) || group.temp[1] < Number(state.environment))) return false;
            }
            if (state.view === 'weapon' && state.kind && group.kind !== state.kind) return false;
            if (state.view === 'armor' && state.slot && group.slot !== state.slot) return false;
            if (state.view === 'armor' && state.cls && (state.cls === 'none' ? Boolean(group.cls) : group.cls !== state.cls)) return false;
            if (!query) return true;
            return `${group.name.ko || ''} ${group.name.en}`.toLowerCase().includes(query) || group.variants.some((variant) => `${variant[2] || ''} ${variant[1]}`.toLowerCase().includes(query));
        });
        if (state.sort === 'dps') list.sort((a, b) => dpsOf(b) - dpsOf(a));
        else if (state.sort === 'cut') list.sort((a, b) => cutOf(b) - cutOf(a));
        else if (state.sort === 'store') list.sort((a, b) => (b.store || 0) - (a.store || 0));
        else if (state.sort === 'price') list.sort((a, b) => (cheapest(a)?.price ?? Infinity) - (cheapest(b)?.price ?? Infinity));
        return list;
    }
    const option = (value, name, current) => `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(name)}</option>`;
    function activeFilters() {
        const labels = {query:'searchLabel',kind:'kinds',slot:'slot',cls:'armorClass',maker:'maker',damageType:'damageType',fireMode:'fireMode',minMag:'minMag',maxMass:'maxMass',minStore:'minStore',environment:'environment',shopOnly:'shopOnly'};
        return '<div class="gear-filter-chips">' + Object.keys(FILTER_DEFAULTS).filter(key => state[key] !== FILTER_DEFAULTS[key]).map(key => {
            const value = ['kind','slot','cls','damageType','fireMode'].includes(key) ? text(state[key] === 'none' ? 'noClass' : state[key]) : state[key];
            const title = text(labels[key]) + (key === 'shopOnly' ? '' : ': ' + value);
            return '<button type="button" class="gear-add" data-gear-clear-filter="' + key + '" aria-label="' + esc(title + ' · ' + text('remove')) + '">' + esc(title) + ' <span aria-hidden="true">×</span></button>';
        }).join('') + '</div>';
    }
    const filterCount = () => Object.keys(FILTER_DEFAULTS).filter((key) => state[key] !== FILTER_DEFAULTS[key]).length;
    function filters() {
        const weapon = state.view === 'weapon';
        const select = (id, title, entries, current) => `<label class="gear-select"><span>${esc(text(title))}</span><select id="gear-${id}">${option('', text('all'), current)}${entries.map(([value, name]) => option(value, name, current)).join('')}</select></label>`;
        const numeric = (id, title, current, min = '0') => `<label class="gear-select"><span>${esc(text(title))}</span><input id="gear-${id}" type="number" step="any"${min !== '' ? ` min="${min}"` : ''} value="${esc(current)}" placeholder="—" inputmode="decimal"></label>`;
        const makers = [...new Set(groupsOf(state.view).map((group) => group.mfr).filter(Boolean))].sort();
        return `<details class="gear-filters"${state.filtersOpen ? ' open' : ''}><summary>${esc(text('filters'))}<span>${esc(text('filterCount', { count: filterCount() }))}</span></summary><div class="gear-filter-fields">
            ${select('maker', 'maker', makers.map((maker) => [maker, maker]), state.maker)}
            ${weapon ? `${select('kind', 'kinds', KINDS.map((kind) => [kind, text(kind)]), state.kind)}${select('damage-type', 'damageType', DAMAGE.map((key) => [key, text(key)]), state.damageType)}${select('fire-mode', 'fireMode', ['single', 'rapid', 'burst', 'charged', 'beam', 'sequence'].map((key) => [key, text(key)]), state.fireMode)}${numeric('min-mag', 'minMag', state.minMag)}`
                : `${select('slot', 'slot', SLOTS.map((slot) => [slot, text(slot)]), state.slot)}${select('class', 'armorClass', [...CLASSES.map((cls) => [cls, text(cls)]), ['none', text('noClass')]], state.cls)}${numeric('min-store', 'minStore', state.minStore)}${numeric('environment', 'environment', state.environment, '')}`}
            ${numeric('max-mass', 'maxMass', state.maxMass)}
            <button type="button" class="gear-add" data-gear-reset-filters>${esc(text('resetFilters'))}</button>
        </div></details>`;
    }
    function toolbar() {
        const tab = (view) => `<button type="button" role="tab" class="gear-tab${state.view === view ? ' is-active' : ''}" aria-selected="${state.view === view}" data-gear-view="${view}">${esc(text(view))}</button>`;
        const tabs = `<div class="gear-tabs" role="tablist" aria-label="${esc(text('views'))}">${tab('weapon')}${tab('armor')}${tab('fit')}${tab('mod')}<button type="button" role="tab" class="gear-tab${state.view === 'cart' ? ' is-active' : ''}" aria-selected="${state.view === 'cart'}" data-gear-view="cart">${esc(cartTotal() ? text('cartCount', { count: cartTotal() }) : text('cart'))}</button></div>`;
        if (state.view === 'fit' || state.view === 'cart' || state.view === 'mod') return `<div class="gear-toolbar">${tabs}</div>`;
        const status = state.priceState[state.view];
        const weaponView = state.view === 'weapon';
        const sorts = weaponView ? [['', 'sortDefault'], ['dps', 'sortDps'], ['price', 'sortPrice']] : [['', 'sortDefault'], ['cut', 'sortCut'], ['store', 'sortStore'], ['price', 'sortPrice']];
        return `<div class="gear-toolbar">
            ${tabs}
            <label class="gear-search"><span>${esc(text('searchLabel'))}</span><input type="search" id="gear-search" value="${esc(state.query)}" placeholder="${esc(text('search'))}" autocomplete="off"></label>
            <label class="gear-select"><span>${esc(text('sort'))}</span><select id="gear-sort">${sorts.map(([value, key]) => option(value, text(key), state.sort)).join('')}</select></label>
            <label class="gear-shop-filter"><input id="gear-shop-only" type="checkbox"${state.shopOnly ? ' checked' : ''}><span>${esc(text('shopOnly'))}<small>${esc(text('shopOnlyNote'))}</small></span></label>
            ${status === 'loading' ? `<p class="gear-note" role="status">${esc(text('priceLoading'))}</p>` : status === 'failed' || status === 'partial' ? `<p class="gear-note" role="status">${esc(text(status === 'failed' ? 'priceFailed' : 'pricePartial'))} <button class="gear-add" type="button" data-gear-price-retry>${esc(text('priceRetry'))}</button></p>` : ''}
        </div>`;
    }
    const variantsTag = (group) => `<small class="gear-muted">${esc(group.variants.length > 1 ? text('variantsCount', { count: group.variants.length }) : text('oneVariant'))}${group.specialMode ? ` · ${esc(text('specialMode'))}` : ''}</small>`;
    const rowButton = (group) => `<div class="gear-item-name">${thumbOf(group)}<div><button type="button" class="gear-rowbtn" data-gear-pick="${esc(group.id)}" aria-pressed="${state.selected[state.view] === group.id}">${esc(label(group.name))}</button>${lang() === 'ko' && group.name.ko ? `<small class="gear-english">${esc(group.name.en)}</small>` : ''}${variantsTag(group)}</div></div>`;
    function rateCell(mode) {
        if (!mode) return text('unknown');
        if (mode.beam) return esc(text('beam'));
        return `${mode.basis === 'upperBound' ? '≤ ' : ''}${esc(num(mode.rpm))}`;
    }
    function weaponRows(list) {
        return `<thead><tr><th scope="col">${esc(text('name'))}</th><th scope="col" class="is-num gear-metric">${esc(text('dps'))}</th><th class="gear-secondary-col" scope="col">${esc(text('kind'))}</th><th scope="col" class="is-num gear-secondary-col">${esc(text('damage'))}</th><th scope="col" class="is-num gear-secondary-col">${esc(text('rate'))}</th><th scope="col" class="is-num gear-secondary-col">${esc(text('mag'))}</th><th scope="col" class="is-num gear-secondary-col">${esc(text('speed'))}</th><th scope="col" class="is-num">${esc(text('price'))}</th></tr></thead>
            <tbody>${list.map((group) => { const mode = bestMode(group); const damage = group.combatVerified === false ? 0 : totalDamage(group.ammo?.dmg); const dps = dpsOf(group); return `<tr class="${state.selected.weapon === group.id ? 'is-selected' : ''}">
                <th scope="row">${rowButton(group)}</th>
                <td class="is-num gear-metric">${dps ? `${mode?.basis === 'upperBound' ? '≤ ' : ''}${esc(num(dps))}` : esc(text('unknown'))}</td>
                <td class="gear-secondary-col"><span class="gear-tag">${esc(text(group.kind))}</span></td>
                <td class="is-num gear-secondary-col">${damage ? `${esc(num(damage, 1))}${mode?.pellets ? ` × ${esc(mode.pellets)}` : ''}` : esc(text('unknown'))}</td>
                <td class="is-num gear-secondary-col">${rateCell(mode)}</td>
                <td class="is-num gear-secondary-col">${group.combatVerified !== false && group.mag ? esc(num(group.mag)) : esc(text('unknown'))}</td>
                <td class="is-num gear-secondary-col">${group.combatVerified !== false && group.ammo?.speed ? `${esc(num(group.ammo.speed))} m/s` : esc(text('unknown'))}</td>
                <td class="is-num">${priceCell(group)}</td></tr>`; }).join('')}</tbody>`;
    }
    function armorRows(list) {
        return `<thead><tr><th scope="col">${esc(text('name'))}</th><th scope="col" class="is-num gear-metric">${esc(text('cut'))}</th><th scope="col">${esc(text('armorClass'))}</th><th class="gear-secondary-col" scope="col">${esc(text('slot'))}</th><th scope="col" class="is-num gear-secondary-col">${esc(text('temp'))}</th><th scope="col" class="is-num gear-secondary-col">${esc(text('store'))}</th><th scope="col" class="is-num">${esc(text('price'))}</th></tr></thead>
            <tbody>${list.map((group) => `<tr class="${state.selected.armor === group.id ? 'is-selected' : ''}">
                <th scope="row">${rowButton(group)}</th>
                <td class="is-num gear-metric">${group.cut ? `${esc(num(group.cut[0]))}%` : esc(text('unknown'))}</td>
                <td>${group.cls ? esc(text(group.cls)) : `<span class="gear-muted">${esc(text('unknown'))}</span>`}</td>
                <td class="gear-secondary-col"><span class="gear-tag">${esc(text(group.slot))}</span></td>
                <td class="is-num gear-secondary-col">${group.temp ? `${esc(num(group.temp[0]))} ~ ${esc(num(group.temp[1]))}°C` : esc(text('unknown'))}</td>
                <td class="is-num gear-secondary-col">${group.store ? `${esc(num(group.store / 1000, 1))}K µSCU` : esc(text('unknown'))}</td>
                <td class="is-num">${priceCell(group)}</td></tr>`).join('')}</tbody>`;
    }
    function list() {
        const rows = filtered();
        if (!rows.length) return `<div class="gear-empty" role="status"><p>${esc(text(state.shopOnly && state.priceState[state.view] === 'loading' ? 'priceLoading' : 'filterEmpty'))}</p><button type="button" class="gear-add" data-gear-reset-filters>${esc(text('resetFilters'))}</button></div>`;
        const shown = rows.slice(0, state.limit);
        return `<p class="gear-count" role="status">${esc(text('matched', { count: num(rows.length), total: num(groupsOf(state.view).length) }))}</p>
            <p class="gear-scroll-hint">${esc(text('scrollHint'))}</p>
            <div class="gear-tablewrap" tabindex="0" role="region" aria-label="${esc(text(state.view))}"><table class="gear-table">${state.view === 'weapon' ? weaponRows(shown) : armorRows(shown)}</table></div>
            ${rows.length > shown.length ? `<button type="button" class="btn btn-secondary gear-more" data-gear-more>${esc(text('more', { count: num(Math.min(PAGE, rows.length - shown.length)) }))}</button>` : ''}`;
    }

    // ---- 상세 ---------------------------------------------------------------
    const stat = (name, value) => `<div><dt>${esc(name)}</dt><dd>${value}</dd></div>`;
    const damageLine = (damage) => DAMAGE.filter((key) => damage?.[key]).map((key) => `${esc(text(key))} ${esc(num(damage[key], 2))}`).join(' · ');
    const BASIS = { sequence: 'basisSequence', automatic: 'basisAutomatic', upperBound: 'basisUpper' };
    function weaponDetail(group) {
        if (group.combatVerified === false) return `<p class="gear-note">${esc(text('toolNote'))}</p><dl class="gear-stats">${stat(text('kind'), esc(text(group.kind)))}${group.mass ? stat(text('mass'), `${esc(num(group.mass, 2))} kg`) : ''}${group.mfr ? stat(text('maker'), esc(group.mfr)) : ''}</dl>`;
        const ammo = group.ammo || {};
        const modes = (group.modes || []).map((mode) => `<tr><th scope="row">${esc(text(mode.k))}${mode.name ? ` <small class="gear-muted">${esc(mode.name)}</small>` : ''}</th>
            <td class="is-num">${mode.beam ? esc(damageLine(mode.beam)) : rateCell(mode)}</td>
            <td>${[mode.pulls ? text('pulls', { shots: mode.shots, pulls: mode.pulls }) : '', mode.burst ? text('burstShots', { count: mode.burst }) : '', mode.pellets ? text('pellets', { count: mode.pellets }) : '', mode.charge?.time ? text('chargeTime', { time: num(mode.charge.time, 2) }) : ''].filter(Boolean).map(esc).join(' · ')}</td>
            <td><small>${mode.basis ? esc(text(BASIS[mode.basis])) : ''}</small></td></tr>`).join('');
        const slots = ['optics', 'barrel', 'under'].filter((key) => group.slots?.[key]).map((key) => stat(text(key), esc(text('upTo', { size: group.slots[key] })))).join('');
        return `${group.specialMode ? `<p class="gear-assumption">${esc(text('specialMode'))}</p>` : ''}<dl class="gear-stats">
                ${stat(text('kind'), esc(text(group.kind)))}${group.mfr ? stat(text('maker'), esc(group.mfr)) : ''}${stat(text('size'), `S${esc(group.size ?? '?')}`)}${group.mass ? stat(text('mass'), `${esc(num(group.mass, 2))} kg`) : ''}
                ${group.mag ? stat(text('mag'), esc(num(group.mag))) : ''}${ammo.dmg ? stat(text('damage'), damageLine(ammo.dmg)) : ''}${ammo.speed ? stat(text('speed'), `${esc(num(ammo.speed))} m/s`) : ''}${ammo.range ? stat(text('range'), `${esc(num(ammo.range))} m`) : ''}
                ${dpsOf(group) ? stat(text('dps'), `${bestMode(group)?.basis === 'upperBound' ? '≤ ' : ''}${esc(num(dpsOf(group)))}`) : ''}
            </dl>
            ${ammo.drop && (ammo.drop[1] || ammo.drop[0]) ? `<p class="gear-note">${esc(text('dropLine', { start: num(ammo.drop[0], 1), per: num(ammo.drop[1], 3), floor: num(ammo.drop[2], 2) }))}</p>` : ''}
            ${ammo.blast ? `<p class="gear-note">${esc(text('blast', { dmg: damageLine(ammo.blast.dmg), radius: num(ammo.blast.radius, 1) }))}</p>` : ''}
            ${modes ? `<section><h4>${esc(text('modes'))}</h4><div class="gear-tablewrap"><table class="gear-table"><thead><tr><th scope="col">${esc(text('mode'))}</th><th scope="col" class="is-num">${esc(text('rate'))}</th><th scope="col"></th><th scope="col">${esc(text('basisTitle'))}</th></tr></thead><tbody>${modes}</tbody></table></div></section>` : ''}
            ${slots ? `<section><h4>${esc(text('attachments'))}</h4><dl class="gear-stats">${slots}</dl></section>` : ''}
            <p class="gear-note">${esc(text('dpsNote'))}</p>`;
    }
    function armorDetail(group) {
        return `<dl class="gear-stats">
                ${stat(text('slot'), esc(text(group.slot)))}${group.cls ? stat(text('armorClass'), esc(text(group.cls))) : ''}${group.mfr ? stat(text('maker'), esc(group.mfr)) : ''}${group.mass ? stat(text('mass'), `${esc(num(group.mass, 2))} kg`) : ''}
                ${group.temp ? stat(text('temp'), `${esc(num(group.temp[0]))} ~ ${esc(num(group.temp[1]))}°C`) : ''}${group.rad ? stat(text('rad'), esc(num(group.rad[0]))) + stat(text('radRate'), `${esc(num(group.rad[1], 1))}${esc(text('perSecond'))}`) : ''}
                ${group.store ? stat(text('store'), `${esc(num(group.store))} µSCU`) : ''}${group.guns ? stat(text('guns'), esc(num(group.guns))) : ''}${group.mags ? stat(text('mags'), esc(num(group.mags))) : ''}
            </dl>
            ${group.cut ? `<section><h4>${esc(text('cut'))}</h4><dl class="gear-stats">${DAMAGE.map((key, index) => stat(text(key), `${esc(num(group.cut[index]))}%`)).join('')}</dl></section>` : ''}`;
    }
    function variants(group) {
        const status = state.priceState[state.view];
        const rows = group.variants.map((variant) => {
            const shops = shopsOf(variant) || []; const best = shops[0];
            return `<tr><th scope="row">${esc(variantName(variant))}</th>
                <td class="is-num">${status === 'loading' ? `<span class="gear-muted">${esc(text('priceLoading'))}</span>` : best ? `<strong>${esc(num(best.price))}</strong> <small>${esc(text('uec'))}</small>` : `<span class="gear-muted">${esc(text('noShop'))}</span>`}</td>
                <td>${best ? (shops.length > 1 ? `<details class="gear-shops"><summary>${esc([best.shop, best.place, best.system].filter(Boolean).join(' · '))} · ${esc(text('shopsCount', { count: shops.length }))}</summary><ul>${shops.map((shop) => `<li>${esc([shop.shop, shop.place, shop.system].filter(Boolean).join(' · '))} <strong>${esc(num(shop.price))} ${esc(text('uec'))}</strong></li>`).join('')}</ul></details>` : esc([best.shop, best.place, best.system].filter(Boolean).join(' · '))) : ''}</td>
                <td class="is-num"><button type="button" class="gear-add" data-gear-add="${esc(variant[0])}" aria-label="${esc(variantName(variant))} ${esc(text('addCart'))}">${esc(state.cart[variant[0]] ? text('inCart', { count: state.cart[variant[0]] }) : text('addCart'))}</button></td></tr>`;
        }).join('');
        return `<section class="gear-variants"><h4>${esc(text('variants'))} <small class="gear-muted">${esc(group.variants.length > 1 ? text('variantsCount', { count: group.variants.length }) : text('oneVariant'))}</small></h4>
            ${group.variants.length > 1 ? `<p class="gear-note">${esc(text('variantsNote'))}</p>` : ''}
            <div class="gear-tablewrap" tabindex="0" role="region" aria-label="${esc(text('variants'))}"><table class="gear-table"><thead><tr><th scope="col">${esc(text('variantName'))}</th><th scope="col" class="is-num">${esc(text('cheapest'))}</th><th scope="col">${esc(text('shops'))}</th><th scope="col" class="is-num">${esc(text('cart'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
            <p class="gear-note">${esc(status === 'failed' ? text('priceFailed') : status === 'partial' ? text('pricePartial') : text('noShopNote'))}</p></section>`;
    }
    function detail() {
        const group = (state.data[state.view]?.groups || []).find((item) => item.id === state.selected[state.view]);
        if (!group) return `<p class="gear-hint">${esc(text('pick'))}</p>`;
        return `<section class="gear-detail" aria-labelledby="gear-detail-title">
            <button type="button" class="gear-add gear-back" data-gear-back>${esc(text('backList'))}</button>
            <header class="gear-detail-head"><h3 id="gear-detail-title" tabindex="-1">${esc(label(group.name))}</h3>${lang() === 'ko' && group.name.ko ? `<span class="gear-muted">${esc(group.name.en)}</span>` : ''}</header>
            ${figureOf(group)}
            <div class="gear-actions">${state.view === 'weapon' ? `${photoOf(group) ? '' : iconOf(group)}${group.combatVerified === false ? '' : `<button type="button" class="btn btn-secondary" data-gear-shoot="${esc(group.id)}">${esc(text('shootWith'))}</button>`}<button type="button" class="btn btn-secondary" data-gear-mod="${esc(group.id)}">${esc(text('modThis'))}</button>` : (group.slot ? `<button type="button" class="btn btn-secondary" data-gear-wear="${esc(group.id)}">${esc(text('wear'))}</button>` : '')}</div>
            ${state.view === 'weapon' ? weaponDetail(group) : armorDetail(group)}
            ${variants(group)}
        </section>`;
    }

    // ---- 착용 시험 -----------------------------------------------------------
    // 한 발 피해: 탄의 피해 종류별 값에 거리 감소를 먹인 뒤, 부위 배율과 방어구 감소를 곱한다.
    function shotDamage(weapon, mode, distance) {
        const damage = { ...(mode?.beam || weapon.ammo?.dmg || {}) };
        const drop = weapon.ammo?.drop; const main = Object.keys(damage)[0];
        if (!mode?.beam && drop && main && distance > drop[0]) damage[main] = Math.max(drop[2] || 0, damage[main] - drop[1] * (distance - drop[0]));
        return damage;
    }
    function coverOf(part) {
        const body = state.data.body; if (!body) return null;
        for (const slot of ['helmet', 'core', 'arms', 'legs']) { const group = findGroup('armor', state.fit.wear[slot]); if (group && (group.covers || body.covers[slot]).includes(part)) return group; }
        const undersuit = findGroup('armor', state.fit.wear.undersuit);
        return undersuit && (undersuit.covers || body.covers.undersuit).includes(part) ? undersuit : null;
    }
    function fitRows() {
        const body = state.data.body; const weapon = findGroup('weapon', state.fit.weapon);
        const modes = (weapon?.modes || []).filter((mode) => mode.rpm || mode.beam);
        const mode = modes[Math.min(state.fit.mode, modes.length - 1)] || null;
        const base = weapon ? shotDamage(weapon, mode, Number(state.fit.distance) || 0) : {};
        return BODY_PARTS.map((id) => {
            const part = body.parts.find((item) => item.id === id); const cover = coverOf(id);
            const raw = DAMAGE.reduce((sum, key) => sum + (base[key] || 0), 0) * (mode?.pellets || 1);
            const supported = weapon && mode?.k !== 'charged' && !weapon.ammo?.blast && !base.stun && !base.distortion && (!cover || cover.cut);
            const taken = supported ? DAMAGE.reduce((sum, key, index) => sum + (base[key] || 0) * (cover ? part.armored * (1 - (cover.cut[index] ?? 0) / 100) : part.naked), 0) * (mode?.pellets || 1) : null;
            const hits = taken > 0 ? Math.ceil(body.pool / taken) : null;
            // 빔은 초당 피해라 발 수 대신 시간으로 보여 준다.
            const seconds = mode?.beam ? (taken > 0 ? body.pool / taken : null) : (hits && mode?.k === 'rapid' && mode.rpm ? (hits - 1) * 60 / mode.rpm : null);
            return { part, cover, raw, taken, hits, seconds, beam: Boolean(mode?.beam), mode };
        });
    }
    // Original vector silhouette. Front view: the subject's right is on the left.
    // Body parts and health come exclusively from Star Citizen body.json.
    const FIGURE = {
        head: 'M147 24 Q150 13 166 13 Q183 13 186 29 L186 48 Q183 64 175 69 L175 80 L157 80 L157 69 Q146 62 145 47 Z',
        torso: 'M155 76 L177 76 L192 87 L203 94 L200 134 Q194 159 192 183 L198 210 L188 236 L167 226 L146 236 L136 210 L142 183 Q140 159 134 134 L131 94 L142 87 Z',
        arm: 'M130 94 Q118 92 113 111 L104 151 L103 174 L94 205 L88 234 L89 251 L95 259 L101 255 L103 239 L111 211 L121 187 L123 169 L135 130 Z',
        leg: 'M139 214 L164 229 L161 274 L156 309 L157 327 L151 365 L148 397 L152 409 L148 417 L123 417 Q118 414 124 406 L132 397 L132 366 L131 329 L133 307 L131 275 Z',
    };
    function mannequin(rows) {
        const armed = Boolean(state.fit.weapon);
        const card = (id) => {
            const row = rows.find((item) => item.part.id === id);
            const known = armed && Number.isFinite(row.taken) && !row.beam;
            const remaining = known ? Math.max(0, row.part.health - row.taken) : row.part.health;
            return `<button type="button" class="gear-body-card${state.part === id ? ' is-selected' : ''}" data-gear-part="${id}" aria-pressed="${state.part === id}">
                <span class="gear-body-label">${esc(text(id))}<strong>${known ? `${esc(num(remaining, 1))}<small> / </small>` : ''}${esc(num(row.part.health))} <small>HP</small></strong></span>
                <meter min="0" max="${esc(row.part.health)}" value="${esc(remaining)}" aria-label="${esc(text(id))} ${esc(text(known ? 'remainingHealth' : 'fullHealth'))}"></meter>
                <span class="gear-body-equipment">${esc(row.cover ? label(row.cover.name) : text('bare'))}</span>
                <span class="gear-body-damage">${esc(known ? text('afterHit') : text('fullHealth'))}${known ? ` · <strong>−${esc(num(row.taken, 1))}</strong>` : ''}</span>
            </button>`;
        };
        const part = (id, shape, mirror = false) => {
            const row = rows.find((item) => item.part.id === id);
            return `<path class="gear-silhouette-part${row.cover ? ' is-protected' : ''}${state.part === id ? ' is-selected' : ''}" d="${shape}"${mirror ? ' transform="translate(334 0) scale(-1 1)"' : ''}/>`;
        };
        const selected = rows.find((row) => row.part.id === state.part) || rows[0];
        return `<div class="gear-body-heading"><h3>${esc(text('bodyHealth'))}</h3><span>${esc(text('poolLine', { pool: num(state.data.body.pool) }))}</span></div>
            <p class="gear-note">${esc(text('choosePart'))}</p>
            <div class="gear-body-map">
                <div class="gear-body-cards">${['head', 'rightArm', 'rightLeg'].map(card).join('')}</div>
                <svg class="gear-mannequin" viewBox="75 0 184 430" role="img" aria-label="${esc(text('mannequin'))}">
                    <defs><linearGradient id="gear-suit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#656d76"/><stop offset="0.5" stop-color="#363e47"/><stop offset="1" stop-color="#222a32"/></linearGradient></defs>
                    <path class="gear-body-axis" d="M167 0V430M80 112H254M80 232H254M80 326H254"/>
                    ${part('rightArm', FIGURE.arm)}${part('leftArm', FIGURE.arm, true)}${part('rightLeg', FIGURE.leg)}${part('leftLeg', FIGURE.leg, true)}${part('torso', FIGURE.torso)}${part('head', FIGURE.head)}
                    <path class="gear-suit-seams" d="M145 36L152 32H180L186 36M155 76L167 93L177 76M167 93V172M139 127L159 133H175L197 127M144 180H190M143 197H191M138 214L167 220L195 214M134 305L154 309M200 305L180 309M133 330L154 334M201 330L180 334"/>
                </svg>
                <div class="gear-body-cards">${['torso', 'leftArm', 'leftLeg'].map(card).join('')}</div>
            </div>
            <dl class="gear-body-inspector"><div><dt>${esc(text('selectedPart'))}</dt><dd>${esc(text(selected.part.id))}</dd></div><div><dt>${esc(text('equipment'))}</dt><dd>${esc(selected.cover ? label(selected.cover.name) : text('bare'))}</dd></div><div><dt>${esc(selected.beam ? (lang() === 'ko' ? '가정한 초당 피해' : 'Hypothetical damage/second') : text('perShot'))}</dt><dd>${armed && Number.isFinite(selected.taken) ? esc(num(selected.taken, 1)) : esc(text('unknown'))}</dd></div></dl>`;
    }
    function fitView() {
        const body = state.data.body; const armor = state.data.armor; const weapons = state.data.weapon;
        if (['weapon', 'armor', 'body'].some((key) => state.error[key])) return `<div class="gear-status" role="alert">${esc(text('loadError'))} <button type="button" class="gear-add" data-gear-retry>${esc(text('retry'))}</button></div>`;
        if (!body || !armor || !weapons) return `<p class="gear-status" role="status">${esc(text('loading'))}</p>`;
        const rows = fitRows(); const weapon = findGroup('weapon', state.fit.weapon);
        const modes = (weapon?.modes || []).filter((mode) => mode.rpm || mode.beam); const mode = rows[0].mode;
        const slotSelect = (slot) => { const options = groupsOf('armor').filter((group) => group.slot === slot); const current = state.fit.wear[slot] || '';
            return `<label class="gear-select"><span>${esc(text(slot))}</span><select data-gear-slot="${slot}" aria-label="${esc(text('pickSlot', { slot: text(slot) }))}">${option('', text('none'), current)}${['light', 'medium', 'heavy', ''].map((cls) => { const list = options.filter((group) => (group.cls || '') === cls); return list.length ? `<optgroup label="${esc(cls ? text(cls) : text('noClass'))}">${list.map((group) => option(group.id, label(group.name), current)).join('')}</optgroup>` : ''; }).join('')}</select></label>`; };
        const worn = SLOTS.map((slot) => findGroup('armor', state.fit.wear[slot])).filter(Boolean);
        const temps = worn.filter((group) => group.temp); const stores = worn.reduce((sum, group) => sum + (group.store || 0), 0); const mass = worn.reduce((sum, group) => sum + (group.mass || 0), 0);
        const summary = worn.length ? `<dl class="gear-stats">
            ${temps.length ? stat(text('summaryTemp'), `${esc(num(Math.max(...temps.map((group) => group.temp[0]))))} ~ ${esc(num(Math.min(...temps.map((group) => group.temp[1]))))}°C`) : ''}
            ${stores ? stat(text('summaryStore'), `${esc(num(stores))} µSCU`) : ''}${mass ? stat(text('summaryMass'), `${esc(num(mass, 1))} kg`) : ''}</dl>` : '';
        const table = `<div class="gear-tablewrap" tabindex="0" role="region" aria-label="${esc(text('fit'))}"><table class="gear-table gear-fit-table">
            <thead><tr><th scope="col">${esc(text('bodyPart'))}</th><th scope="col">${esc(text('cover'))}</th><th scope="col" class="is-num">${esc(text('perShot'))}</th><th scope="col" class="is-num">${esc(text('reduction'))}</th><th scope="col" class="is-num">${esc(text('shotsToDown'))}</th><th scope="col" class="is-num">${esc(text('timeToDown'))}</th><th scope="col">${esc(text('partHealth'))}</th></tr></thead>
            <tbody>${rows.map((row) => `<tr><th scope="row">${esc(text(row.part.id))}</th>
                <td>${row.cover ? esc(label(row.cover.name)) : `<span class="gear-muted">${esc(text('bare'))}</span>`}</td>
                <td class="is-num">${weapon && row.taken !== null ? `<strong>${esc(num(row.taken, 1))}</strong>` : esc(text('unknown'))}</td>
                <td class="is-num">${weapon && row.taken !== null && row.raw > 0 ? `×${esc(num(row.taken / row.raw, 2))}` : esc(text('unknown'))}</td>
                <td class="is-num">${!weapon ? esc(text('unknown')) : row.taken === null ? esc(text('excluded')) : row.beam ? esc(text('beam')) : row.hits ? esc(text('shots', { count: num(row.hits) })) : esc(text('takesAll'))}</td>
                <td class="is-num">${weapon && row.seconds !== null ? `${row.mode?.basis === 'upperBound' ? '≥ ' : ''}${esc(text('seconds', { time: num(row.seconds, 1) }))}` : esc(text('unknown'))}</td>
                <td><meter class="gear-meter" min="0" max="${esc(row.part.health)}" value="${esc(Math.max(0, row.part.health - (weapon ? row.taken : 0)))}" aria-label="${esc(text(row.part.id))} ${esc(text('partHealth'))}"></meter> <small class="gear-muted">${esc(num(row.part.health))}</small></td></tr>`).join('')}</tbody></table></div>`;
        return `<p class="gear-assumption" role="note">${esc(text('fitIntro'))}</p>
            <div class="gear-fit">
                <div class="gear-fit-body">${mannequin(rows)}</div>
                <div class="gear-fit-main">
                    ${weapon ? `<dl class="gear-stats gear-fit-headline">${[['headShots', 'head'], ['torsoShots', 'torso'], ['limbShots', 'leftArm']].map(([key, id]) => { const item = rows.find((entry) => entry.part.id === id); return stat(text(key), item.taken === null ? esc(text('excluded')) : item.beam ? `${esc(num(item.seconds, 1))}${esc(lang() === 'ko' ? '초' : ' s')}` : item.hits ? esc(text('shots', { count: num(item.hits) })) : esc(text('takesAll'))); }).join('')}</dl>` : ''}
                    <section><h3>${esc(text('wearing'))}</h3>
                        <div class="gear-presets" role="group" aria-label="${esc(text('preset'))}">${[['', 'presetBare'], ['light', 'presetLight'], ['medium', 'presetMedium'], ['heavy', 'presetHeavy']].map(([cls, key]) => `<button type="button" class="gear-add" data-gear-preset="${cls}">${esc(text(key))}</button>`).join('')}</div>
                        <div class="gear-fit-slots">${SLOTS.filter((slot) => slot !== 'backpack').map(slotSelect).join('')}</div>${summary}
                        <button type="button" class="gear-add" data-gear-clear-fit>${esc(text('clearFit'))}</button></section>
                    <section><h3>${esc(text('attacker'))}</h3><div class="gear-fit-slots">
                        <label class="gear-select"><span>${esc(text('weapon'))}</span><select id="gear-fit-weapon">${option('', text('noWeapon'), state.fit.weapon)}${KINDS.filter((kind) => kind !== 'tool').map((kind) => { const list = groupsOf('weapon').filter((group) => group.kind === kind && (group.ammo?.dmg || group.modes?.some((item) => item.beam))); return list.length ? `<optgroup label="${esc(text(kind))}">${list.map((group) => option(group.id, label(group.name), state.fit.weapon)).join('')}</optgroup>` : ''; }).join('')}</select></label>
                        ${modes.length > 1 ? `<label class="gear-select"><span>${esc(text('fireMode'))}</span><select id="gear-fit-mode">${modes.map((item, index) => option(String(index), `${text(item.k)}${item.name ? ` ${item.name}` : ''}`, String(Math.min(state.fit.mode, modes.length - 1)))).join('')}</select></label>` : ''}
                        <label class="gear-select"><span>${esc(text('distance'))}</span><input type="number" id="gear-fit-distance" min="0" max="2000" step="5" inputmode="numeric" value="${esc(state.fit.distance)}"></label>
                    </div></section>
                    <p class="gear-count" role="status">${esc(text('poolLine', { pool: num(body.pool) }))}</p>
                    ${table}
                    ${mode?.basis === 'upperBound' ? `<p class="gear-note">${esc(text('upperNote'))}</p>` : ''}
                    <p class="gear-note">${esc(text('fitNote'))}</p><p class="gear-note">${esc(text('fitLimits'))}</p>
                </div>
            </div>`;
    }

    // ---- 장바구니 -----------------------------------------------------------
    function cartView() {
        const entries = Object.entries(state.cart).map(([uuid, count]) => ({ uuid, count, found: findVariant(uuid) })).filter((entry) => entry.found);
        if (!entries.length) return `<p class="gear-empty">${esc(text('cartEmpty'))}</p>`;
        let total = 0; let unknown = 0; const byShop = new Map();
        const rows = entries.map((entry) => {
            const best = (shopsOf(entry.found.variant, entry.found.view) || [])[0];
            if (best) { total += best.price * entry.count; const key = [best.shop, best.place, best.system].filter(Boolean).join(' · '); byShop.set(key, [...(byShop.get(key) || []), { entry, price: best.price }]); } else unknown += 1;
            const name = variantName(entry.found.variant);
            return `<tr><th scope="row">${esc(name)} <small class="gear-muted">${esc(text(entry.found.view === 'weapon' ? entry.found.group.kind : entry.found.group.slot))}</small></th>
                <td class="is-num"><span class="gear-qty"><button type="button" data-gear-qty="${esc(entry.uuid)}" data-step="-1" aria-label="${esc(name)} ${esc(text('decrease'))}">−</button><span>${esc(num(entry.count))}</span><button type="button" data-gear-qty="${esc(entry.uuid)}" data-step="1" aria-label="${esc(name)} ${esc(text('increase'))}">+</button></span></td>
                <td class="is-num">${best ? `${esc(num(best.price))}` : `<span class="gear-muted">${esc(text('noShop'))}</span>`}</td>
                <td class="is-num">${best ? `<strong>${esc(num(best.price * entry.count))}</strong>` : ''}</td>
                <td>${best ? esc([best.shop, best.place, best.system].filter(Boolean).join(' · ')) : ''}</td>
                <td class="is-num"><button type="button" class="gear-add" data-gear-remove="${esc(entry.uuid)}" aria-label="${esc(name)} ${esc(text('remove'))}">${esc(text('remove'))}</button></td></tr>`;
        }).join('');
        const shops = [...byShop].map(([shop, list]) => `<li><strong>${esc(shop)}</strong><ul>${list.map(({ entry, price }) => `<li>${esc(variantName(entry.found.variant))} × ${esc(num(entry.count))} <small class="gear-muted">${esc(num(price * entry.count))} ${esc(text('uec'))}</small></li>`).join('')}</ul></li>`).join('');
        return `<div class="gear-tablewrap" tabindex="0" role="region" aria-label="${esc(text('cart'))}"><table class="gear-table"><thead><tr><th scope="col">${esc(text('item'))}</th><th scope="col" class="is-num">${esc(text('qty'))}</th><th scope="col" class="is-num">${esc(text('unitPrice'))}</th><th scope="col" class="is-num">${esc(text('subtotal'))}</th><th scope="col">${esc(text('shops'))}</th><th scope="col"></th></tr></thead><tbody>${rows}</tbody></table></div>
            <p class="gear-cart-total">${esc(text('total'))} <strong>${esc(num(total))}</strong> ${esc(text('uec'))}</p>
            ${unknown ? `<p class="gear-note">${esc(text('unknownPrice', { count: unknown }))}</p>` : ''}
            ${shops ? `<section><h3>${esc(text('byShop'))}</h3><ul class="gear-shoplist">${shops}</ul></section>` : ''}
            <button type="button" class="gear-add" data-gear-clear-cart>${esc(text('clearCart'))}</button>
            <p class="gear-note">${esc(text('cartNote'))}</p>`;
    }
    function special() {
        return `${toolbar()}<div class="gear-special">${state.view === 'fit' ? fitView() : cartView()}</div>
            <p class="gear-sources">${esc(text('sourcePrice'))}</p><p class="gear-note">${state.data.images ? `<br>${esc(text('imageCredit'))}` : ''}${state.data.icons ? `<br>${esc(text('iconCredit'))}` : ''}</p>`;
    }

    // ---- 개조 ---------------------------------------------------------------
    // 조합: { 무기 묶음 id: { 자리 이름: 부착물 클래스 | null } }. 적어 두지 않은 자리는 게임 기본 상태다.
    // 부품 위치·모형은 모두 자료(models.json, manifest)에서 오고, 여기서 손으로 맞추는 숫자는 없다.
    const MOD_DATA = ['weapon', 'attach', 'models'];
    const mod3d = { status: 'off', reason: '', weapon: '', viewer: null, canvas: null, token: 0, view: 'iso', module: null, bad: new Set() };
    const modQuery = typeof window.matchMedia === 'function' ? window.matchMedia(MOD_3D_QUERY) : null;
    const modPorts = (id) => { const ports = state.data.attach?.weapons?.[id]?.ports; return Array.isArray(ports) ? ports.filter((port) => port && typeof port.name === 'string') : []; };
    const modPart = (cls) => (typeof cls === 'string' && Object.hasOwn(state.data.attach?.attachments || {}, cls) ? state.data.attach.attachments[cls] : null);
    const modAllowed = (port, cls) => cls === null || (Boolean(modPart(cls)) && Array.isArray(port.compatible) && port.compatible.includes(cls));
    // 지금 조합: 바꿀 수 있는 자리는 저장한 값(그 자리에 맞는 부품일 때만), 나머지는 게임 기본.
    // state.mod.visiting: 받은 주소로 들어온 조합. 저장하지 않고 보여 주기만 한다 — 부품을 바꾸면 그때 내 조합이 된다.
    function modBuild(id) {
        const source = state.mod.visiting?.[id] || state.mod.builds[id];
        const saved = source && typeof source === 'object' ? source : {}; const build = {};
        for (const port of modPorts(id)) build[port.name] = port.editable && Object.hasOwn(saved, port.name) && modAllowed(port, saved[port.name]) ? saved[port.name] : (modPart(port.default) ? port.default : null);
        return build;
    }
    const saveMod = () => store(MOD_KEY, { weapon: state.mod.weapon, builds: state.mod.builds });
    function modSet(id, changes) {
        const build = modBuild(id); const next = {};
        for (const port of modPorts(id)) if (port.editable) next[port.name] = Object.hasOwn(changes, port.name) ? changes[port.name] : build[port.name];
        state.mod.builds[id] = next; delete state.mod.visiting[id]; state.mod.notice = ''; saveMod();
    }
    function modPick(id) { state.mod.weapon = String(id || ''); state.mod.slot = ''; state.mod.notice = ''; saveMod(); }
    function modSlot(id) { const ports = modPorts(id).filter((port) => port.editable); return (ports.find((port) => port.name === state.mod.slot) || ports[0])?.name || ''; }
    const modModelOk = (id) => { const entry = state.data.models?.weapons?.[id]; return entry?.ok === true && typeof entry.manifest === 'string' && /^assets\/models\/gear\/weapons\/[\w~.-]+\/manifest\.json$/.test(entry.manifest) && !entry.manifest.includes('..'); };
    const modPartHasModel = (cls) => state.data.models?.parts?.[cls]?.ok === true;

    // 주소: #gear?mod=<무기>&optics=<부품>&barrel=-… 그대로 붙여 넣으면 같은 조합이 열린다.
    let modSeenHash = ''; // 마지막으로 읽었거나 써 넣은 주소. 같은 주소를 두 번 읽어 고른 자리를 되돌리지 않는다.
    function modHash() {
        const id = state.mod.weapon; if (state.view !== 'mod' || !findGroup('weapon', id)) return '#gear';
        const build = modBuild(id); const query = new URLSearchParams({ mod: id });
        for (const port of modPorts(id)) if (port.editable) query.set(port.name.replace(/_attach$/, ''), build[port.name] || '-');
        return `#gear?${query}`;
    }
    function syncModUrl() {
        if (window.location.hash.split('?')[0] !== '#gear') return;
        if (state.view === 'mod' && !modAccess.allowed) return;
        if (state.view === 'mod' && !(state.data.attach && state.data.weapon)) return; // 자료가 오기 전에는 받은 주소를 지우지 않는다
        const hash = modHash();
        modSeenHash = hash;
        if (hash !== window.location.hash) { try { window.history.replaceState(window.history.state, '', hash); } catch (_error) { /* 주소를 못 바꿔도 화면은 동작한다 */ } }
    }
    function readModHash() {
        if (window.location.hash === '#gear?view=mod') { state.view = 'mod'; return false; }
        const match = /^#gear\?(.+)$/.exec(window.location.hash); if (!match || window.location.hash === modSeenHash) return false;
        modSeenHash = window.location.hash;
        const query = new URLSearchParams(match[1]); const id = query.get('mod') || '';
        if (!/^[\w~.-]{1,80}$/.test(id)) return false;
        const build = {};
        for (const [key, value] of query) if (key !== 'mod' && /^[a-z]{1,30}$/.test(key) && /^(?:-|[\w~.-]{1,80})$/.test(value)) build[`${key}_attach`] = value === '-' ? null : value;
        state.view = 'mod'; state.mod.weapon = id; state.mod.slot = ''; state.mod.notice = '';
        // 저장해 둔 조합과 다를 때만 "받은 조합"으로 띄운다. 저장소의 내 조합은 건드리지 않는다.
        const mine = state.mod.builds[id] && typeof state.mod.builds[id] === 'object' ? state.mod.builds[id] : null;
        delete state.mod.visiting[id];
        if (Object.keys(build).length && (!mine || Object.keys(build).some((name) => (mine[name] ?? null) !== build[name]))) {
            state.mod.visiting[id] = build;
            if (mine) state.mod.notice = 'modShared';
        }
        saveMod();
        return true;
    }

    // 수치 표기: 배율은 퍼센트 변화로, 조준경 값은 그대로.
    const modPercent = (mult) => { const value = (mult - 1) * 100; return `${value > 0 ? '+' : value < 0 ? '−' : ''}${num(Math.abs(value), 1)}%`; };
    function modValue(unit, value) {
        if (unit === 'mult') return Number.isFinite(value) ? modPercent(value) : '';
        if (unit === 'mult3') return Array.isArray(value) ? value.map((item) => (Number.isFinite(item) ? modPercent(item) : text('unknown'))).join(' / ') : '';
        if (unit === 'add') return Number.isFinite(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${num(Math.abs(value))}` : '';
        if (unit === 'x') return Number.isFinite(value) ? `${num(value, 2)}x` : '';
        if (unit === 'm') return Number.isFinite(value) ? `${num(value)} m` : '';
        if (unit === 'count') return Number.isFinite(value) ? num(value) : '';
        if (unit === 'enum') return value === 'nightvision' ? text('modScopeNight') : value === 'zoom' ? text('modScopeZoom') : '';
        if (unit === 'light') return value && Number.isFinite(value.intensity) && Number.isFinite(value.fov) ? text('modLight', { intensity: num(value.intensity, 1), fov: num(value.fov) }) : '';
        return '';
    }
    // 목록에는 게임 설명문에 나오는 항목과 조준경 배율만 짧게 보여 준다.
    function modChips(part) {
        const fields = state.data.attach?.statFields || {};
        return Object.keys(fields).filter((key) => Object.hasOwn(part.stats || {}, key) && (fields[key].labelSource === 'game' || ['zoom', 'zoom2', 'scope', 'light'].includes(key)))
            .map((key) => { const value = modValue(fields[key].unit, part.stats[key]); return value ? `<span class="gear-mod-chip">${esc(label(fields[key].label))} <strong>${esc(value)}</strong></span>` : ''; }).join('');
    }
    function modStats(group, build) {
        const fitted = modPorts(group.id).filter((port) => port.editable).map((port) => modPart(build[port.name])).filter(Boolean);
        const combat = group.combatVerified !== false; const mode = combat ? bestMode(group) : null; const ammo = group.ammo || {};
        const fields = state.data.attach?.statFields || {};
        // Keep each source value separate: modifier stacking and final weapon
        // performance have not been verified against the game's calculation.
        const rows = fitted.flatMap((part) => Object.keys(fields).filter((key) => Object.hasOwn(part.stats || {}, key)).map((key) => {
            const field = fields[key]; const value = modValue(field.unit, part.stats[key]);
            return value ? `<tr><th scope="row">${esc(label(field.label))}${field.labelSource === 'site' ? '<span aria-hidden="true"> ＊</span>' : ''}</th><td class="is-num">${esc(value)}</td><td>${esc(label(part.name))}</td></tr>` : '';
        })).join('');
        const baseStats = combat ? `<dl class="gear-stats">${ammo.dmg ? stat(text('damage'), damageLine(ammo.dmg)) : ''}${mode ? stat(text('rate'), rateCell(mode)) : ''}${group.mag ? stat(text('mag'), esc(num(group.mag))) : ''}${ammo.speed ? stat(text('speed'), `${esc(num(ammo.speed))} m/s`) : ''}${group.mass ? stat(text('mass'), `${esc(num(group.mass, 2))} kg`) : ''}</dl>` : `<p class="gear-note">${esc(text('toolNote'))}</p>`;
        return `<section class="gear-mod-panel gear-mod-stats" aria-labelledby="gear-mod-stats-title"><h3 id="gear-mod-stats-title">${esc(text('modStats'))}</h3>
            <h4>${esc(text('modBase'))}</h4>${baseStats}
            <h4>${esc(text('modChanges'))}</h4>
            ${rows ? `<div class="gear-tablewrap" tabindex="0" role="region" aria-label="${esc(text('modChanges'))}"><table class="gear-table gear-mod-table"><thead><tr><th scope="col">${esc(text('modStat'))}</th><th scope="col" class="is-num">${esc(text('modChange'))}</th><th scope="col" class="is-num">${esc(text('modAfter'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="gear-note">${esc(text('modEstimate'))}</p>${/＊/.test(rows) ? `<p class="gear-note">${esc(text('modSiteLabel'))}</p>` : ''}` : `<p class="gear-note" role="status">${esc(text(fitted.length ? 'modNoChange' : 'modNothing'))}</p>`}
        </section>`;
    }
    function modStage(group) {
        const id = group.id; let why = '';
        if (!modQuery?.matches) why = 'modWhySmall';
        else if (state.error.models) why = 'modWhyNoData';
        else if (state.data.models && !modModelOk(id)) why = 'modWhyNoModel';
        else if (mod3d.status === 'failed' && mod3d.weapon === id) why = mod3d.reason === 'unsupported' ? 'modWhyUnsupported' : mod3d.reason === 'lost' ? 'modWhyLost' : 'modWhyFailed';
        if (why) return `<div class="gear-mod-stage" data-gear-mod-3d="off">${figureOf(group) || (iconOf(group) ? `<div class="gear-mod-still">${iconOf(group)}</div>` : `<p class="gear-note">${esc(text('modNoImage'))}</p>`)}</div><p class="gear-note gear-mod-why">${esc(text(why))}</p>${why === 'modWhyLost' || why === 'modWhyFailed' ? `<button type="button" class="gear-add" data-gear-mod-retry3d>${esc(text('modRetry3d'))}</button>` : ''}`;
        const ready = mod3d.status === 'ready' && mod3d.weapon === id;
        return `<div class="gear-mod-stage is-3d" data-gear-mod-3d="${ready ? 'ready' : 'loading'}"><div class="gear-mod-view" data-gear-mod-stage></div>${ready ? '' : `<p class="gear-mod-wait" role="status">${esc(text('mod3dLoading'))}</p>`}</div>
            ${ready ? `<div class="gear-mod-viewbar" role="group" aria-label="${esc(text('modViews'))}">${MOD_VIEWS.map((view) => `<button type="button" class="gear-add" data-gear-mod-view="${view}" aria-pressed="${mod3d.view === view}">${esc(text(`modView_${view}`))}</button>`).join('')}</div><p class="gear-note">${esc(text('modCanvasHelp'))}</p>` : ''}`;
    }
    function modSlots(group, build, slot) {
        const ports = modPorts(group.id); const ready = mod3d.status === 'ready' && mod3d.weapon === group.id;
        const sizeText = (port) => (port.minSize === port.maxSize ? `S${port.maxSize}` : `S${port.minSize}~S${port.maxSize}`);
        const rows = ports.filter((port) => port.editable || modPart(build[port.name])).map((port) => {
            const cls = build[port.name]; const part = modPart(cls); const name = part ? label(part.name) : text('modEmpty');
            const head = `<span class="gear-mod-slotname">${esc(label(port.label))} <small>${esc(sizeText(port))}</small></span><strong>${esc(name)}</strong>`;
            const missing = ready && part && (!modPartHasModel(cls) || mod3d.bad.has(cls)) ? `<small class="gear-muted">${esc(text('modPartNoModel'))}</small>` : '';
            if (!port.editable) return `<li class="gear-mod-slot is-fixed"><div class="gear-mod-slotbtn">${head}<small class="gear-muted">${esc(text('modFixed'))}</small>${missing}</div></li>`;
            return `<li class="gear-mod-slot${port.name === slot ? ' is-selected' : ''}"><button type="button" class="gear-mod-slotbtn" data-gear-mod-slot="${esc(port.name)}" aria-pressed="${port.name === slot}">${head}${missing}</button>
                <button type="button" class="gear-add" data-gear-mod-clear="${esc(port.name)}"${part ? '' : ' disabled'} aria-label="${esc(`${label(port.label)} ${text('modClear')}`)}">${esc(text('modClear'))}</button></li>`;
        }).join('');
        return `<section class="gear-mod-panel gear-mod-slots" aria-labelledby="gear-mod-slots-title"><h3 id="gear-mod-slots-title">${esc(text('modSlots'))}</h3>
            ${rows ? `<ul class="gear-mod-slotlist">${rows}</ul>` : ''}${ports.some((port) => port.editable) ? '' : `<p class="gear-note">${esc(text('modNoSlots'))}</p>`}</section>`;
    }
    function modParts(group, build, slot) {
        const port = modPorts(group.id).find((item) => item.name === slot && item.editable); if (!port) return '';
        const current = build[port.name]; const list = (Array.isArray(port.compatible) ? port.compatible : []).filter((cls) => modPart(cls));
        const items = list.map((cls) => {
            const part = modPart(cls); const chips = modChips(part);
            const meta = [part.type ? label(part.type) : '', Number.isFinite(part.size) ? `S${part.size}` : '', lang() === 'ko' && part.mfrKo ? part.mfrKo : part.mfr].filter(Boolean).join(' · ');
            return `<li><button type="button" class="gear-mod-part${cls === current ? ' is-fitted' : ''}" data-gear-mod-part="${esc(cls)}" aria-pressed="${cls === current}"><span class="gear-mod-partname">${esc(label(part.name))}${cls === current ? ` <span class="gear-tag">${esc(text('modFitted'))}</span>` : ''}</span><small class="gear-muted">${esc(meta)}</small>${chips ? `<span class="gear-mod-chips">${chips}</span>` : ''}</button></li>`;
        }).join('');
        const lines = modPart(current)?.desc; const desc = lines ? (lang() === 'ko' && Array.isArray(lines.ko) && lines.ko.length ? lines.ko : lines.en) : null;
        return `<section class="gear-mod-panel gear-mod-parts" aria-labelledby="gear-mod-parts-title"><h3 id="gear-mod-parts-title">${esc(text('modParts', { slot: label(port.label) }))} <small class="gear-muted">${esc(text('modPartsCount', { count: num(list.length) }))}</small></h3>
            <ul class="gear-mod-partlist">${items}</ul>
            <p class="gear-note">${esc(text('modPartsNote'))}</p>
            ${Array.isArray(desc) && desc.length ? `<div class="gear-mod-desc"><h4>${esc(text('modDesc'))}: ${esc(label(modPart(current).name))}</h4><ul>${desc.map((line) => `<li>${esc(line)}</li>`).join('')}</ul><p class="gear-note">${esc(text(Array.isArray(modPart(current).descDiffers) && modPart(current).descDiffers.length ? 'modDiffers' : 'modDescNote'))}</p></div>` : ''}</section>`;
    }
    function modView() {
        if (!modAccess.allowed) return modGate();
        if (state.error.weapon || state.error.attach) return `${toolbar()}<div class="gear-status" role="alert"><p>${esc(text('loadError'))}</p><button type="button" class="btn btn-secondary" data-gear-retry>${esc(text('retry'))}</button></div>`;
        if (!state.data.weapon || !state.data.attach) return `${toolbar()}<p class="gear-status" role="status">${esc(text('loading'))}</p>`;
        const group = findGroup('weapon', state.mod.weapon); const current = group ? group.id : '';
        const picker = `<label class="gear-select"><span>${esc(text('modPick'))}</span><select id="gear-mod-weapon">${option('', text('noWeapon'), current)}${KINDS.map((kind) => { const list = groupsOf('weapon').filter((item) => item.kind === kind); return list.length ? `<optgroup label="${esc(text(kind))}">${list.map((item) => option(item.id, label(item.name), current)).join('')}</optgroup>` : ''; }).join('')}</select></label>`;
        const credit = `<p class="gear-note gear-art-credit">${esc(text('modCredit'))}${state.data.images ? `<br>${esc(text('imageCredit'))}` : ''}${state.data.icons ? `<br>${esc(text('iconCredit'))}` : ''}</p>`;
        if (!group) return `${toolbar()}<div class="gear-mod"><div class="gear-mod-bar">${picker}</div><p class="gear-hint">${esc(text('modPickHint'))}</p></div>${credit}`;
        const build = modBuild(group.id); const slot = modSlot(group.id); const editable = modPorts(group.id).some((port) => port.editable);
        return `${toolbar()}<div class="gear-mod">
            <div class="gear-mod-bar">${picker}
                ${editable ? `<button type="button" class="gear-add" data-gear-mod-defaults>${esc(text('modDefaults'))}</button><button type="button" class="gear-add" data-gear-mod-strip>${esc(text('modStrip'))}</button>` : ''}
                <button type="button" class="gear-add" data-gear-mod-share>${esc(text('modShare'))}</button>
                <p class="gear-note gear-mod-notice" role="status">${state.mod.notice ? esc(text(state.mod.notice)) : ''}</p></div>
            <div class="gear-mod-grid">
                <section class="gear-mod-panel gear-mod-show" aria-labelledby="gear-mod-title"><h3 id="gear-mod-title" tabindex="-1">${esc(label(group.name))}${lang() === 'ko' && group.name.ko ? ` <small class="gear-muted">${esc(group.name.en)}</small>` : ''}</h3>${modStage(group)}</section>
                ${modSlots(group, build, slot)}${modParts(group, build, slot)}${modStats(group, build)}
            </div>
            <p class="gear-note">${esc(text('modSaved'))}</p></div>${credit}`;
    }

    // 3D 보기: 될 때만 켠다. 캔버스는 다시 그릴 때마다 새 자리로 옮겨 붙인다(같은 캔버스, 같은 3D 상태).
    const gearActive = () => document.getElementById('gear')?.classList.contains('active') === true;
    const modWants3d = () => modAccess.allowed && state.view === 'mod' && gearActive() && modQuery?.matches === true && Boolean(state.data.attach) && Boolean(findGroup('weapon', state.mod.weapon)) && modModelOk(state.mod.weapon);
    function stopMod3d() {
        mod3d.token += 1; mod3d.viewer?.dispose(); mod3d.canvas?.remove();
        Object.assign(mod3d, { status: 'off', reason: '', weapon: '', viewer: null, canvas: null }); mod3d.bad.clear();
    }
    // 3D에 보낼 조합: 모형이 없는 부품은 비워 둔다(자리 목록에 그 사실을 적는다).
    function modViewerParts(id) { const build = modBuild(id); for (const name of Object.keys(build)) if (!modPartHasModel(build[name]) || mod3d.bad.has(build[name])) build[name] = null; return build; }
    function mountModCanvas() {
        const place = root?.querySelector('[data-gear-mod-stage]'); const canvas = mod3d.canvas; if (!place || !canvas) return;
        const group = findGroup('weapon', mod3d.weapon);
        canvas.setAttribute('aria-label', text('modCanvas', { name: group ? label(group.name) : '' }));
        if (canvas.parentNode !== place) place.appendChild(canvas);
    }
    function applyMod3d() {
        const viewer = mod3d.viewer; if (!viewer || mod3d.status !== 'ready') return;
        const id = mod3d.weapon; const wanted = modViewerParts(id); const now = viewer.stats().parts || {};
        for (const name of viewer.ports || []) {
            const cls = wanted[name] ?? null; if ((now[name] ?? null) === cls) continue;
            viewer.setPart(name, cls).catch(() => { if (cls && mod3d.viewer === viewer) { mod3d.bad.add(cls); if (state.view === 'mod') draw(); } });
        }
        const slot = modSlot(id); viewer.highlightPort(slot && !modBuild(id)[slot] ? slot : null);
        viewer.render();
    }
    function startMod3d(id) {
        stopMod3d();
        const token = mod3d.token; const canvas = document.createElement('canvas');
        canvas.className = 'gear-mod-canvas'; canvas.setAttribute('role', 'img'); canvas.tabIndex = 0;
        Object.assign(mod3d, { status: 'loading', weapon: id, canvas });
        mountModCanvas();
        (async () => {
            try {
                mod3d.module = mod3d.module || await import(`/js/gear-viewer.js${ASSET_QUERY}`);
                if (token !== mod3d.token) return;
                if (!mod3d.module.isSupported()) throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
                // 3D 그림이 멈추면(그래픽 자원을 잃으면) 멈춘 그림을 두지 않고 사진으로 바꾼 뒤 다시 불러올 단추를 준다.
                const onContext = (info) => {
                    if (info?.type !== 'lost' || token !== mod3d.token) return;
                    stopMod3d(); Object.assign(mod3d, { status: 'failed', reason: 'lost', weapon: id });
                    if (state.view === 'mod') draw();
                };
                const version = typeof state.data.models.assetVersion === 'string' ? state.data.models.assetVersion : '';
                const viewer = await mod3d.module.createGunViewer(canvas, { manifestUrl: `/${state.data.models.weapons[id].manifest}`, partsIndex: state.data.models.parts || {}, parts: modViewerParts(id), view: mod3d.view, version, onContext });
                if (token !== mod3d.token) { viewer.dispose(); return; }
                for (const item of viewer.failed || []) if (item?.cls) mod3d.bad.add(item.cls);
                Object.assign(mod3d, { status: 'ready', viewer });
            } catch (error) {
                if (token !== mod3d.token) return;
                canvas.remove();
                Object.assign(mod3d, { status: 'failed', reason: error?.code === 'unsupported' ? 'unsupported' : 'failed', weapon: id, viewer: null, canvas: null });
                refreshModAccess();
            }
            if (state.view === 'mod') draw();
        })();
    }
    function syncMod3d() {
        if (!modWants3d()) { if (mod3d.status !== 'off') stopMod3d(); return; }
        if (mod3d.status === 'failed' && mod3d.weapon === state.mod.weapon) return; // 그림으로 보여 주는 중. 다시 불러오기 단추나 무기 바꾸기로만 다시 시도한다
        if (mod3d.weapon !== state.mod.weapon || mod3d.status === 'off') { startMod3d(state.mod.weapon); return; }
        mountModCanvas(); applyMod3d();
    }

    function draw(focus) {
        if (!root || (composingSearch?.isConnected && state.view !== 'mod')) return;
        const activeElement = document.activeElement; const active = activeElement?.id; let keep = '';
        if (!focus && activeElement && root.contains(activeElement) && !active) {
            if (activeElement === mod3d.canvas) keep = 'canvas.gear-mod-canvas';
            else { const mark = [...activeElement.attributes].find((item) => item.name.startsWith('data-gear-') && item.name !== 'data-gear-mod-stage'); if (mark) keep = `${activeElement.tagName.toLowerCase()}[${mark.name}="${CSS.escape(mark.value)}"]`; }
        }
        const partScroll = root.querySelector('.gear-mod-partlist')?.scrollTop || 0; const caret = active === 'gear-search' ? document.activeElement.selectionStart : null;
        let html;
        // 화면 전체를 이 한 곳에서 다시 그린다. 모든 동적 값은 esc()를 거친다.
        if (state.view === 'mod') html = modView();
        else if (state.view === 'fit' || state.view === 'cart') html = special();
        else if (state.error[state.view]) html = `${toolbar()}<div class="gear-status" role="alert"><p>${esc(text('loadError'))}</p><button type="button" class="btn btn-secondary" data-gear-retry>${esc(text('retry'))}</button></div>`;
        else if (!state.data[state.view]) html = `${toolbar()}<p class="gear-status" role="status">${esc(text('loading'))}</p>`;
        else html = `${toolbar()}<div class="gear-workspace">${filters()}<div class="gear-columns${state.detailOpen ? ' is-reading' : ''}"><div class="gear-list" data-gear-type="${state.view}">${activeFilters()}${list()}</div><div class="gear-side">${detail()}</div></div></div>
            <p class="gear-sources">${esc(text('sourcePrice'))}</p><p class="gear-note">${state.data.images ? `<br>${esc(text('imageCredit'))}` : ''}${state.data.icons ? `<br>${esc(text('iconCredit'))}` : ''}</p>`;
        const template = document.activeElement?.matches('input[type="search"]') && root.contains(document.activeElement) ? document.createElement('template') : null;
        const output = template || root;
        output.innerHTML = html;
        if (template) window.VOLT_SEARCH_RENDER(root, template.content);
        if (partScroll) { const partList = root.querySelector('.gear-mod-partlist'); if (partList) partList.scrollTop = partScroll; }
        syncModUrl(); syncMod3d();
        const target = focus ? root.querySelector(focus) : (active && /^gear-/.test(active) ? document.getElementById(active) : keep ? root.querySelector(keep) : null);
        if (target && target !== activeElement) target.focus();
        if (target !== activeElement && caret !== null && target?.id === 'gear-search') target.setSelectionRange(caret, caret);
    }

    async function load(view) {
        if (view === 'mod') { if (!modAccess.allowed) { draw(); return; } await Promise.all(MOD_DATA.map(load)); if (state.view === view) draw(); return; }
        if (view === 'fit' || view === 'cart') { await Promise.all(['weapon', 'armor', 'body'].map(load)); if (state.view === view) draw(); return; }
        const protectedData = view === 'attach' || view === 'models';
        if (protectedData && !modAccess.allowed) return;
        if (state.data[view] || state.loading[view]) return;
        const epoch = modAccessEpoch; const controller = new AbortController();
        if (protectedData) modRequests.add(controller);
        state.loading[view] = true; state.error[view] = false;
        draw();
        try {
            const response = await fetch(DATA[view], { cache: protectedData ? 'no-store' : 'no-cache', signal: controller.signal });
            if (protectedData && [401, 403].includes(response.status)) {
                setModAccess({ status: 'ready', loggedIn: response.status !== 401, configured: true, allowed: false });
                return;
            }
            if (!response.ok) throw new Error(String(response.status));
            const data = await response.json();
            if (protectedData && (epoch !== modAccessEpoch || !modAccess.allowed)) return;
            state.data[view] = data;
        } catch (_error) { if (protectedData && epoch !== modAccessEpoch) return; state.error[view] = true; }
        finally { modRequests.delete(controller); }
        state.loading[view] = false;
        if (state.view === view || (state.view === 'mod' && MOD_DATA.includes(view))) draw();
        if (state.data[view] && PRICE_CATEGORIES[view]) loadPrices(view);
    }

    function render() {
        root = document.getElementById('gear-app');
        if (!root || started) return;
        started = true;
        root.addEventListener('click', (event) => {
            const target = event.target.closest('button'); if (!target || !root.contains(target)) return;
            if (target.hasAttribute('data-gear-mod-access-retry')) { refreshModAccess(); return; }
            if (target.hasAttribute('data-gear-retry')) { load(state.view); return; }
            if (target.dataset.gearClearFilter && Object.hasOwn(FILTER_DEFAULTS, target.dataset.gearClearFilter)) { state[target.dataset.gearClearFilter] = FILTER_DEFAULTS[target.dataset.gearClearFilter]; state.limit = PAGE; draw('#gear-search'); return; }
            if (target.hasAttribute('data-gear-reset-filters')) { Object.assign(state, FILTER_DEFAULTS); state.limit = PAGE; draw('#gear-search'); return; }
            if (target.hasAttribute('data-gear-price-retry')) { delete state.priceState[state.view]; loadPrices(state.view); draw(); return; }
            if (target.dataset.gearPart) { state.part = target.dataset.gearPart; draw(`[data-gear-part="${state.part}"]`); return; }
            if (target.hasAttribute('data-gear-back')) {
                state.detailOpen = false;
                const row = `[data-gear-pick="${CSS.escape(state.selected[state.view])}"]`;
                draw(root.querySelector(row) ? row : '#gear-search');
                return;
            }
            if (target.dataset.gearView) { state.detailOpen = false; state.view = target.dataset.gearView; Object.assign(state, FILTER_DEFAULTS); state.sort = ''; state.limit = PAGE; draw(`[data-gear-view="${state.view}"]`); load(state.view); return; }
            if (target.dataset.gearAdd) { const uuid = target.dataset.gearAdd; state.cart[uuid] = Math.min(99, (state.cart[uuid] || 0) + 1); store(CART_KEY, state.cart); draw(`[data-gear-add="${uuid}"]`); return; }
            if (target.dataset.gearQty) { const uuid = target.dataset.gearQty; const next = (state.cart[uuid] || 0) + Number(target.dataset.step); if (next > 0) state.cart[uuid] = Math.min(next, 99); else delete state.cart[uuid]; store(CART_KEY, state.cart); draw(state.cart[uuid] ? `[data-gear-qty="${uuid}"][data-step="${target.dataset.step}"]` : '[data-gear-view="cart"]'); return; }
            if (target.dataset.gearRemove) { delete state.cart[target.dataset.gearRemove]; store(CART_KEY, state.cart); draw('[data-gear-view="cart"]'); return; }
            if (target.hasAttribute('data-gear-clear-cart')) { state.cart = {}; store(CART_KEY, state.cart); draw('[data-gear-view="cart"]'); return; }
            if (target.hasAttribute('data-gear-preset')) {
                // 등급별 저항은 제품이 달라도 같다. 부위마다 그 등급의 첫 제품을 입힌다(언더수트는 그대로 둔다).
                const cls = target.getAttribute('data-gear-preset'); const undersuit = state.fit.wear.undersuit; state.fit.wear = undersuit ? { undersuit } : {};
                if (cls) for (const slot of ['helmet', 'core', 'arms', 'legs']) { const first = groupsOf('armor').find((group) => group.slot === slot && group.cls === cls); if (first) state.fit.wear[slot] = first.id; }
                store(FIT_KEY, state.fit); draw(`[data-gear-preset="${cls}"]`); return;
            }
            if (target.hasAttribute('data-gear-clear-fit')) { state.fit.wear = {}; store(FIT_KEY, state.fit); draw('[data-gear-view="fit"]'); return; }
            if (target.dataset.gearWear) { const group = findGroup('armor', target.dataset.gearWear); if (group?.slot) { state.fit.wear[group.slot] = group.id; store(FIT_KEY, state.fit); state.view = 'fit'; draw('[data-gear-view="fit"]'); load('fit'); } return; }
            if (target.dataset.gearMod) { state.view = 'mod'; modPick(target.dataset.gearMod); draw(); load('mod').then(() => { if (state.view === 'mod') draw('#gear-mod-title'); }); return; }
            if (state.view === 'mod') {
                const id = findGroup('weapon', state.mod.weapon)?.id; const port = (name) => modPorts(id).find((item) => item.name === name && item.editable);
                if (target.dataset.gearModSlot) { if (id && port(target.dataset.gearModSlot)) { state.mod.slot = target.dataset.gearModSlot; state.mod.notice = ''; draw(`[data-gear-mod-slot="${CSS.escape(state.mod.slot)}"]`); } return; }
                if (target.dataset.gearModPart) { const slot = id && port(modSlot(id)); const cls = target.dataset.gearModPart; if (slot && modAllowed(slot, cls)) { modSet(id, { [slot.name]: cls }); draw(`[data-gear-mod-part="${CSS.escape(cls)}"]`); } return; }
                if (target.dataset.gearModClear) { const slot = id && port(target.dataset.gearModClear); if (slot) { modSet(id, { [slot.name]: null }); draw(`[data-gear-mod-slot="${CSS.escape(slot.name)}"]`); } return; }
                if (target.hasAttribute('data-gear-mod-defaults')) { if (id) { delete state.mod.builds[id]; delete state.mod.visiting[id]; state.mod.notice = ''; saveMod(); draw('[data-gear-mod-defaults]'); } return; }
                if (target.hasAttribute('data-gear-mod-strip')) { if (id) { modSet(id, Object.fromEntries(modPorts(id).filter((item) => item.editable).map((item) => [item.name, null]))); draw('[data-gear-mod-strip]'); } return; }
                if (target.dataset.gearModView) { if (MOD_VIEWS.includes(target.dataset.gearModView)) { mod3d.view = target.dataset.gearModView; mod3d.viewer?.setView(mod3d.view); draw(`[data-gear-mod-view="${mod3d.view}"]`); } return; }
                if (target.hasAttribute('data-gear-mod-retry3d')) { if (id) { stopMod3d(); draw('#gear-mod-title'); } return; }
                if (target.hasAttribute('data-gear-mod-share')) {
                    const done = (key) => { state.mod.notice = key; if (state.view === 'mod') draw('[data-gear-mod-share]'); };
                    try { window.navigator.clipboard.writeText(window.location.href).then(() => done('modCopied'), () => done('modCopyFail')); } catch (_error) { done('modCopyFail'); }
                    return;
                }
            }
            if (target.dataset.gearShoot) { state.fit.weapon = target.dataset.gearShoot; state.fit.mode = 0; store(FIT_KEY, state.fit); state.view = 'fit'; draw('[data-gear-view="fit"]'); load('fit'); return; }
            if (target.hasAttribute('data-gear-more')) { const before = state.limit; state.limit += PAGE; draw(`.gear-list tbody tr:nth-child(${before + 1}) .gear-rowbtn`); return; }
            if (target.dataset.gearPick) { state.detailOpen = true; state.selected[state.view] = target.dataset.gearPick; draw('#gear-detail-title'); }
        });
        const applySearch = (input) => {
            if (state.query === input.value) return;
            state.detailOpen = false;
            state.query = input.value;
            state.limit = PAGE;
            draw();
        };
        root.addEventListener('compositionstart', (event) => {
            if (event.target.id === 'gear-search') composingSearch = event.target;
        });
        root.addEventListener('compositionend', (event) => {
            if (event.target !== composingSearch) return;
            composingSearch = null;
            if (state.query === event.target.value) draw();
            else applySearch(event.target);
        });
        root.addEventListener('input', (event) => {
            if (event.target.id === 'gear-search' && !event.isComposing && !composingSearch?.isConnected) applySearch(event.target);
        });
        root.addEventListener('toggle', (event) => { if (event.target.classList?.contains('gear-filters')) state.filtersOpen = event.target.open; }, true);
        root.addEventListener('change', (event) => {
            const slot = event.target.dataset?.gearSlot;
            if (slot) { if (event.target.value) state.fit.wear[slot] = event.target.value; else delete state.fit.wear[slot]; store(FIT_KEY, state.fit); draw(`[data-gear-slot="${slot}"]`); return; }
            if (event.target.id === 'gear-mod-weapon') { modPick(event.target.value); draw('#gear-mod-weapon'); return; }
            if (event.target.id === 'gear-fit-weapon') { state.fit.weapon = event.target.value; state.fit.mode = 0; store(FIT_KEY, state.fit); draw('#gear-fit-weapon'); return; }
            if (event.target.id === 'gear-fit-mode') { state.fit.mode = Number(event.target.value) || 0; store(FIT_KEY, state.fit); draw('#gear-fit-mode'); return; }
            if (event.target.id === 'gear-fit-distance') { state.fit.distance = Math.min(2000, Math.max(0, Number(event.target.value) || 0)); store(FIT_KEY, state.fit); draw('#gear-fit-distance'); return; }
            const key = { 'gear-kind': 'kind', 'gear-slot': 'slot', 'gear-class': 'cls', 'gear-sort': 'sort', 'gear-maker': 'maker', 'gear-damage-type': 'damageType', 'gear-fire-mode': 'fireMode', 'gear-min-mag': 'minMag', 'gear-max-mass': 'maxMass', 'gear-min-store': 'minStore', 'gear-environment': 'environment', 'gear-shop-only': 'shopOnly' }[event.target.id]; if (!key) return;
            state.detailOpen = false;
            state[key] = key === 'shopOnly' ? event.target.checked : event.target.value; state.limit = PAGE; draw(`#${event.target.id}`);
        });
        window.VOLT_I18N?.onChange?.(() => draw());
        state.cart = Object.fromEntries(Object.entries(readStored(CART_KEY, {})).filter(([key, count]) => /^[a-f0-9-]{36}$/i.test(key) && Number.isSafeInteger(count) && count > 0).map(([key, count]) => [key, Math.min(99, count)]));
        const savedFit = readStored(FIT_KEY, null);
        if (savedFit) state.fit = { wear: savedFit.wear && typeof savedFit.wear === 'object' ? savedFit.wear : {}, weapon: String(savedFit.weapon || ''), mode: Number(savedFit.mode) || 0, distance: Number(savedFit.distance) || 0 };
        const savedMod = readStored(MOD_KEY, null);
        if (savedMod) {
            const builds = {};
            for (const [id, build] of Object.entries(savedMod.builds && typeof savedMod.builds === 'object' ? savedMod.builds : {}).slice(0, 200)) {
                if (!/^[\w~.-]{1,80}$/.test(id) || !build || typeof build !== 'object') continue;
                builds[id] = Object.fromEntries(Object.entries(build).filter(([name, cls]) => /^[a-z_]{1,40}$/.test(name) && (cls === null || (typeof cls === 'string' && /^[\w~.-]{1,80}$/.test(cls)))));
            }
            state.mod.builds = builds; state.mod.weapon = /^[\w~.-]{1,80}$/.test(String(savedMod.weapon || '')) ? String(savedMod.weapon) : '';
        }
        readModHash();
        // 받은 주소(#gear?mod=…)로 들어오거나, 화면 크기·섹션이 바뀌면 개조 화면과 3D를 다시 맞춘다. 섹션을 떠나면 3D를 놓아 준다.
        window.addEventListener('hashchange', () => { if (readModHash()) { draw(); load('mod'); } });
        modQuery?.addEventListener?.('change', () => { if (state.view === 'mod') draw(); });
        const section = document.getElementById('gear');
        if (section && typeof MutationObserver === 'function') new MutationObserver(() => { if (readModHash()) { draw(); load('mod'); } else if (state.view === 'mod') { if (gearActive()) draw(); else syncMod3d(); } }).observe(section, { attributes: true, attributeFilter: ['class'] });
        // 아이콘은 없어도 화면이 동작한다.
        fetch(DATA.images, { cache: 'no-cache' }).then((response) => (response.ok ? response.json() : null)).then((images) => { if (images) { state.data.images = images; draw(); } }).catch(() => {});
        fetch(DATA.icons, { cache: 'no-cache' }).then((response) => (response.ok ? response.json() : null)).then((icons) => { if (icons) { state.data.icons = icons; draw(); } }).catch(() => {});
        load(state.view);
    }

    window.VOLT_GEAR = { render, setAccess: setModAccess, initAccess: (refresh) => { refreshModAccess = refresh; } };
})();
