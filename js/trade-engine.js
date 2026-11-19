/**
 * VOLT trade engine (window.VOLT_TRADE_ENGINE) — 무역 경로 · 시세 · 순회 무역 화면이 함께 쓰는 계산 모듈.
 *
 * 순수 계산만 한다: DOM을 만지지 않고, fetch 하지 않는다. 받는 것은
 *   /api/uex/market, /api/uex/terminals (선택: /api/uex/commodities, /api/uex/vehicle-prices) 의 data,
 *   data/trade/cargo.json, data/trade/world.json (선택: data/canonical/ships-canonical.json) 과 설정 객체이고,
 * 돌려주는 것은 평범한 객체다. 전체 설명과 기본값의 근거는 docs/trade-engine.md.
 *
 * 지키는 규칙
 *  - 자료에 없는 값은 null 로 둔다 (0 으로 채우지 않는다). 상점이 얼마나 더 받아 주는지는 자료에 없다:
 *    판매 수량을 그것으로 줄이지 않고 destination.takes = null 로 알린다.
 *  - 시간은 전부 추정이다. 퀀텀 비행은 scripts/trade/travel-model.mjs 를 그대로 옮긴 것(검증 안 됨)이고,
 *    착륙·터미널·손으로 싣는 시간은 게임 파일에 없어서 TIME_DEFAULTS 의 값은 "우리가 정한 가정"이다. 플레이어가 바꿀 수 있다.
 *  - 가격 보고는 기본 3일 이내 것만 쓴다 (settings.maxAgeDays). 보고 시각은 결과에 항상 같이 나간다.
 *
 * 공개 함수 (자세한 입력·출력은 docs/trade-engine.md)
 *   buildModel(inputs)                         시장 모델 (터미널별 살 것·팔 것·시설·게임 위치)
 *   settings(partial)                          설정 정리 (state.get() 을 그대로 넣어도 된다)
 *   shipProfile(model, settings)               함선 화물칸: 상자 크기별로 실을 수 있는 양
 *   splitBoxes(profile, scu, sizes)            SCU 를 상자로 나누기
 *   travelBetween(model, settings, a, b)       두 터미널 사이 비행 시간 (추정)
 *   evaluateRoute(model, settings, {from,to,commodities?})  한 경로의 수량·상자·이익·시간
 *   rankRoutes(model, settings, filters)       A→B 경로 순위
 *   compareShips(model, settings, {from,to})   한 경로를 모든 함선으로 비교
 *   nextLegs(model, settings, {from,toward?})  도착지에서 이어 갈 다음 구간
 *   findChains(model, settings, options)       여러 곳을 도는 경로 (2~8곳, 작업량 상한 있음)
 *   planMixedLoad(model, settings, plan)       정해 둔 화물 + 남는 칸 채우기
 *   whereToSell(model, settings, {cargo,at?})  이미 실은 화물을 어디에 팔지
 *   commoditySummary / commodityDetail / terminalSheet   가장 싼 구매처 · 가장 비싼 판매처 · 차익 표
 *   shipsForBudget(model, settings, options)   내 돈에 맞는 화물선
 *   travel.{trapezoidSeconds, quantumTravel, distanceMeters}   travel-model.mjs 와 같은 식
 *   state.{get,set,reset,subscribe,defaults}   여러 화면이 함께 쓰는 선택값 (localStorage 'volt-helper-state-v1')
 *
 * 개인 정보는 저장하지 않으며, 저장한 값은 이 브라우저 밖으로 나가지 않는다.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.VOLT_TRADE_ENGINE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, (root) => {
    'use strict';

    const VERSION = 1;
    const STATE_KEY = 'volt-helper-state-v1';
    const STANDARD_BOXES = [1, 2, 4, 8, 16, 24, 32];
    const DAY_SECONDS = 86400;
    const FUTURE_TOLERANCE_SECONDS = 300; // 보고 시각이 이보다 더 미래면 시각을 모르는 것으로 본다.

    // ── 시간 설정 ────────────────────────────────────────────────────────────
    // 전부 "우리가 정한 가정"이다 (게임 파일에 없음, 다른 사이트의 측정값 아님, 게임에서 재지 않음).
    // 딱 떨어지는 값으로 두었고 플레이어가 바꾼다. 자동 적재 시간만 world.json 의 게임 값이다.
    const TIME_DEFAULTS = Object.freeze({
        loading: 'auto',          // 'auto' = 자동 적재가 보고된 터미널에서는 자동, 아니면 손으로 / 'manual' = 항상 손으로
        takeoffSeconds: 120,      // 출발: 함선에 타서 퀀텀 준비까지
        landingSeconds: 180,      // 도착: 퀀텀이 끝난 뒤 착륙·도킹까지
        atmosphereSeconds: 180,   // 지표면에 있는 곳이면 뜨고 내릴 때마다 더하는 시간
        terminalSeconds: 60,      // 터미널에서 사거나 파는 데 한 번에 드는 시간
        manualBaseSeconds: 60,    // 손으로 싣거나 내릴 때 한 번에 드는 준비 시간
        manualBoxSeconds: 30,     // 손으로 옮길 때 상자 하나에 드는 시간
        sameBodySeconds: 600,     // 같은 행성·위성에 딸린 두 곳 사이 (지표면끼리, 또는 지표면과 그 궤도 정거장 사이). 거리로 계산하지 않는 값
        jumpSeconds: 300,         // 점프 포인트를 지나 다른 항성계로 넘어가는 시간
    });
    const TIME_LIMIT_SECONDS = 4 * 3600;

    // 화면이 추정 옆에 붙일 설명. 화면마다 문구가 달라지지 않게 여기 둔다.
    const ASSUMPTIONS = Object.freeze({
        'time.quantum': {
            ko: '퀀텀 비행 시간은 게임 파일의 드라이브 수치로 계산한 추정이며 게임에서 재어 확인하지 않았습니다. 직선 거리, 함선의 기본 퀀텀 드라이브 기준입니다.',
            en: 'Quantum flight time is an estimate from the drive values in the game files and has not been timed in game. Straight-line distance, default quantum drive of the ship.',
        },
        'time.manual': {
            ko: '출발·착륙·터미널·손으로 싣는 시간은 게임 파일에 없어서 우리가 정한 기본값입니다. 시간 설정에서 바꿀 수 있습니다.',
            en: 'Take-off, landing, terminal and hand-loading times are not in the game files; these are our own default guesses. You can change them in the time settings.',
        },
        'time.autoLoad': {
            ko: '자동 적재 시간은 게임 파일의 상자별 값입니다 (단위를 초로 읽었고 게임에서 확인하지 않았습니다).',
            en: 'Auto-loading time uses the per-box values in the game files (read as seconds, not confirmed in game).',
        },
        'time.sameBody': {
            ko: '같은 행성·위성에 딸린 두 곳 사이(지표면끼리, 또는 지표면과 그 궤도 정거장 사이)의 이동 시간은 거리로 계산한 값이 아니라 우리가 정한 기본값입니다.',
            en: 'Travel between two places at the same planet or moon (surface to surface, or surface to a station in its orbit) is our own default, not computed from the distance.',
        },
        'time.jump': {
            ko: '다른 항성계로 가는 길은 게이트웨이 정거장까지의 퀀텀 비행 두 번에, 우리가 정한 점프 시간을 더했습니다.',
            en: 'A trip to another system is two quantum flights to and from the gateway stations plus our own default guess for the jump.',
        },
        'cargo.packing': {
            ko: '상자 배치는 화물칸 크기에 맞춰 큰 상자부터 쌓아 본 한 가지 방법입니다. 상자를 자유롭게 돌릴 수 있다고 가정했습니다.',
            en: 'The box layout is one way to stack the hold, largest boxes first, assuming boxes may be turned freely.',
        },
        'cargo.boxesAssumed': {
            ko: '이 상품의 상자 크기는 보고가 없어 터미널의 최대 상자 크기까지 모두 된다고 보았습니다.',
            en: 'Box sizes for this good were not reported; all sizes up to the terminal limit are assumed.',
        },
        'cargo.capacityOverride': {
            ko: '화물칸 크기를 직접 입력한 값으로 계산했습니다. 칸 모양과 최대 상자 크기는 반영하지 않았습니다.',
            en: 'Uses the hold size you typed in; grid shape and largest box are not considered.',
        },
        'stock.unknown': {
            ko: '재고 보고가 없습니다. 수량을 재고로 줄이지 않았으니 실제로는 덜 살 수 있습니다.',
            en: 'Stock was not reported. The quantity is not limited by stock, so you may be able to buy less.',
        },
        'demand.unknown': {
            ko: '도착지가 몇 SCU까지 받아 주는지는 자료에 없습니다. 수량을 그것으로 줄이지 않았습니다.',
            en: 'How many SCU the destination will take is not in the data. The quantity is not limited by it.',
        },
        'price.static': {
            ko: '가격은 사고파는 동안 변하지 않는다고 보았습니다. 실제로는 많이 살수록 오르고 많이 팔수록 내립니다.',
            en: 'Prices are assumed not to move while you trade. In game, buying raises and selling lowers them.',
        },
        'payback.repeat': {
            ko: '본전까지의 횟수는 같은 경로를 같은 가격·재고로 되풀이한다고 가정한 값입니다. 연료·수리·보험 비용은 넣지 않았습니다.',
            en: 'Runs to pay back assume the same route repeated at the same prices and stock. Fuel, repair and insurance are not included.',
        },
        'payback.oneWay': {
            ko: '본전까지 걸리는 시간은 가는 길만 센 값입니다 (횟수 × 한 번 가는 시간). 빈 배로 돌아오는 시간은 넣지 않았습니다.',
            en: 'Time to pay back counts the outbound trips only (runs × one trip). Flying back empty is not included.',
        },
        'rent.period': {
            ko: '대여 가격이 며칠 치인지는 자료에 없습니다.',
            en: 'The rental period behind the rent price is not in the data.',
        },
        'fuel.unit': {
            ko: '퀀텀 연료 사용량은 단위를 SCU/Gm으로 가정한 추정입니다.',
            en: 'Quantum fuel use is an estimate that assumes the unit is SCU per Gm.',
        },
    });

    // ── 작은 도구 ────────────────────────────────────────────────────────────
    const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
    const numOrNull = (value) => (isNum(value) ? value : null);
    const round6 = (value) => Math.round(value * 1e6) / 1e6;
    const clampInt = (value, low, high, fallback) => (isNum(value) ? Math.min(high, Math.max(low, Math.round(value))) : fallback);
    const normName = (value) => String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
    const toIdSet = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const list = (Array.isArray(value) ? value : [value]).map(Number).filter((id) => Number.isFinite(id));
        return list.length ? new Set(list) : null;
    };
    const toNameSet = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const list = (Array.isArray(value) ? value : [value]).map((name) => String(name).toLowerCase()).filter(Boolean);
        return list.length ? new Set(list) : null;
    };

    // ── 퀀텀 비행 (scripts/trade/travel-model.mjs 와 같은 식. 검증 안 된 추정) ──────────────
    const TRAVEL_MODEL_STATUS = 'unvalidated-estimate';

    function trapezoidSeconds(distanceM, speed, accel) {
        if (!(distanceM > 0) || !(speed > 0)) return 0;
        if (!(accel > 0)) return distanceM / speed;
        const rampDistance = speed * speed / accel;
        if (distanceM <= rampDistance) return 2 * Math.sqrt(distanceM / accel);
        return distanceM / speed + speed / accel;
    }

    function quantumTravel(distanceM, drive) {
        if (!drive || !(drive.speed > 0) || !(distanceM >= 0)) return null;
        const rates = [drive.a1, drive.a2].filter((rate) => rate > 0);
        const times = rates.length ? rates.map((rate) => trapezoidSeconds(distanceM, drive.speed, rate)) : [distanceM / drive.speed];
        const minSeconds = Math.min(...times);
        const maxSeconds = Math.max(...times);
        const seconds = (minSeconds + maxSeconds) / 2;
        const spool = Number.isFinite(drive.spool) ? drive.spool : undefined;
        return {
            status: TRAVEL_MODEL_STATUS,
            seconds, minSeconds, maxSeconds,
            cruiseOnlySeconds: distanceM / drive.speed,
            spoolSeconds: spool,
            cooldownSeconds: Number.isFinite(drive.cool) ? drive.cool : undefined,
            totalSeconds: seconds + (spool || 0),
            fuelScu: Number.isFinite(drive.fuel) ? drive.fuel * distanceM / 1e9 : undefined,
        };
    }

    function distanceMeters(a, b) {
        if (!a || !b) return null;
        return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000;
    }

    // ── 설정 ────────────────────────────────────────────────────────────────
    function cleanTime(raw) {
        const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const out = {};
        for (const key of Object.keys(TIME_DEFAULTS)) {
            if (key === 'loading') {
                if (source.loading === 'auto' || source.loading === 'manual') out.loading = source.loading;
            } else if (isNum(source[key]) && source[key] >= 0) {
                out[key] = Math.min(TIME_LIMIT_SECONDS, source[key]);
            }
        }
        return out;
    }

    /** 플레이어가 바꾼 값(없으면 {})에 기본값을 채운 시간 설정. */
    function timeSettings(overrides) {
        return { ...TIME_DEFAULTS, ...cleanTime(overrides) };
    }

    function cleanBoxes(raw) {
        if (!Array.isArray(raw)) return null;
        const list = STANDARD_BOXES.filter((size) => raw.includes(size));
        return list.length && list.length < STANDARD_BOXES.length ? list : null; // 전부 켠 것은 null 과 같다.
    }

    /**
     * 계산에 넣는 설정을 정리한다. state.get() 을 그대로 넣어도 되고, 화면이 값을 덧붙여도 된다.
     * ship: cargo.json 함선 id / budget: aUEC, null = 정하지 않음(돈으로 줄이지 않는다) / maxAgeDays: 기본 3
     * boxes: 쓸 상자 크기 목록, null = 전부 / capacityScu: 화물칸을 직접 입력 (없으면 게임 값)
     * time: 바꾼 시간 값 / now: 기준 시각(ms), 기본 Date.now()
     */
    const CLEANED = new WeakSet();

    function settings(partial) {
        if (partial && typeof partial === 'object' && CLEANED.has(partial)) return partial;
        const source = partial && typeof partial === 'object' ? partial : {};
        const out = {
            ship: typeof source.ship === 'string' && source.ship ? source.ship : null,
            budget: isNum(source.budget) && source.budget >= 0 ? source.budget : null,
            system: typeof source.system === 'string' && source.system ? source.system : null,
            maxAgeDays: isNum(source.maxAgeDays) && source.maxAgeDays > 0 ? source.maxAgeDays : 3,
            boxes: cleanBoxes(source.boxes),
            capacityScu: isNum(source.capacityScu) && source.capacityScu > 0 ? Math.floor(source.capacityScu) : null,
            time: timeSettings(source.time),
            now: isNum(source.now) ? source.now : Date.now(),
        };
        CLEANED.add(out);
        return out;
    }

    // ── 보고 나이 ───────────────────────────────────────────────────────────
    /** 보고가 몇 초 전 것인지. 시각이 없거나 미래면 null (모름). */
    function ageSeconds(at, now) {
        if (!isNum(at) || at <= 0) return null;
        const age = now / 1000 - at;
        if (age < -FUTURE_TOLERANCE_SECONDS) return null;
        return Math.max(0, age);
    }

    /** 'ok' | 'old' | 'unknown' — 기준일보다 오래됐거나 시각을 모르면 계산에 쓰지 않는다. */
    function ageLevel(at, maxAgeDays, now) {
        const age = ageSeconds(at, now);
        if (age === null) return 'unknown';
        return age <= maxAgeDays * DAY_SECONDS ? 'ok' : 'old';
    }

    // ── 시장 모델 ───────────────────────────────────────────────────────────
    const FLAG_NAMES = ['autoLoad', 'freightElevator', 'loadingDock', 'dockingPort', 'cargoCenter', 'refinery', 'refuel', 'repair', 'nqa', 'playerOwned'];

    function listOf(value, key) {
        if (Array.isArray(value)) return value;
        if (value && Array.isArray(value[key])) return value[key];
        if (value && Array.isArray(value.data)) return value.data;
        return [];
    }

    function boxList(value) {
        if (!Array.isArray(value)) return null;
        const list = STANDARD_BOXES.filter((size) => value.includes(size));
        return list.length ? list : null;
    }

    /**
     * 받은 자료를 한 번 정리한다. 설정(함선·돈·기준일)과는 무관하므로 자료가 바뀔 때만 다시 만든다.
     * inputs: { market, terminals, cargo, world, commodities?, vehiclePrices?, ships? }
     */
    function buildModel(inputs) {
        const input = inputs || {};
        const world = input.world || {};
        const cargo = input.cargo || {};
        const locations = new Map(listOf(world.locations).map((location) => [location.id, location]));
        const bodies = new Map(listOf(world.bodies).map((body) => [body.id, body]));
        const joinMap = world.joins?.terminals?.map || {};
        const gameCommodityByName = new Map(listOf(world.commodities).map((commodity) => [normName(commodity.name?.en), commodity]));

        // 게이트웨이 정거장: 'Stanton>Pyro' → Stanton 에 있는 Pyro 행 게이트웨이
        const gates = new Map();
        for (const location of locations.values()) {
            if (location.gate && location.p) gates.set(location.system + '>' + location.gate, location);
        }

        const terminals = new Map();
        for (const row of listOf(input.terminals)) {
            if (!row || !isNum(row.id) || (row.type && row.type !== 'commodity')) continue;
            const location = locations.get(joinMap[row.id]) || null;
            const body = location ? bodies.get(location.body) || null : null;
            const lagrange = location && !location.p && location.at ? bodies.get(location.at) : null;
            const position = location?.p || lagrange?.p || null;
            const flags = {};
            for (const flag of FLAG_NAMES) if (Array.isArray(row.flags) && row.flags.includes(flag)) flags[flag] = true;
            const uexName = row.nick || row.name || '';
            terminals.set(row.id, {
                id: row.id,
                code: row.code || null,
                uexName,
                name: location?.name || { en: uexName },
                live: row.live !== false,
                system: location?.system || row.system || null,
                place: row.city || row.station || row.outpost || row.moon || row.planet || row.orbit || null,
                planet: row.planet || null,
                moon: row.moon || null,
                faction: row.faction || null,
                flags,                                   // 보고된 것만 true. 없는 것은 "보고 없음"이지 "없음"이 아니다.
                maxBox: isNum(row.maxBox) && row.maxBox > 0 ? row.maxBox : null,
                locationId: location?.id || null,
                location,
                amenities: location?.am || null,          // 게임 파일의 시설 코드 (world.amenities)
                pad: location?.pad || null,
                hangar: location?.hangar || null,
                law: location?.law || null,
                surface: location ? location.surface === 1 : null,
                isStation: location ? location.surface !== 1 : (isNum(row.stationId) ? true : null),
                bodyId: body?.id || null,
                bodyKind: body?.kind || null,
                position,
                positionBasis: location?.p ? 'location' : (lagrange?.p ? 'lagrange' : null),
                buys: [],
                sells: [],
            });
        }

        const commodities = new Map();
        const uexCommodities = new Map(listOf(input.commodities).filter((row) => row && isNum(row.id)).map((row) => [row.id, row]));
        const commodityOf = (id) => {
            if (commodities.has(id)) return commodities.get(id);
            const uex = uexCommodities.get(id) || null;
            const game = uex ? gameCommodityByName.get(normName(uex.name)) || null : null;
            const entry = {
                id,
                name: game?.name || (uex?.name ? { en: uex.name } : null), // null = 이름을 모름 (commodities 를 주지 않았을 때)
                code: uex?.code || null,
                gameId: game?.id || null,
                group: game?.group || uex?.kind || null,
                game,
                uexIllegal: uex ? Number(uex.is_illegal) === 1 : null,
                buys: [],
                sells: [],
            };
            commodities.set(id, entry);
            return entry;
        };

        const counts = { rows: 0, buyRows: 0, sellRows: 0, unknownTerminal: 0, notLive: 0 };
        for (const row of listOf(input.market)) {
            if (!row || !isNum(row.t) || !isNum(row.c)) continue;
            const terminal = terminals.get(row.t);
            if (!terminal) { counts.unknownTerminal += 1; continue; }
            counts.rows += 1;
            if (!terminal.live) counts.notLive += 1;
            const commodity = commodityOf(row.c);
            const at = isNum(row.at) && row.at > 0 ? row.at : null;
            const box = boxList(row.box);
            if (isNum(row.buy) && row.buy > 0) {
                const entry = { t: row.t, c: row.c, terminal, commodity, price: row.buy, stock: isNum(row.stock) && row.stock >= 0 ? row.stock : null, level: numOrNull(row.sb), box, at };
                terminal.buys.push(entry); commodity.buys.push(entry); counts.buyRows += 1;
            }
            if (isNum(row.sell) && row.sell > 0) {
                // room: 상점이 더 받아 주는 SCU. 지금 프록시는 보내지 않는다(자료에 없음). 나중에 자료가 생기면 그때만 쓴다.
                const entry = { t: row.t, c: row.c, terminal, commodity, price: row.sell, inv: numOrNull(row.inv), level: numOrNull(row.ss), room: isNum(row.room) && row.room >= 0 ? row.room : null, box, at };
                terminal.sells.push(entry); commodity.sells.push(entry); counts.sellRows += 1;
            }
        }

        const ships = new Map(listOf(cargo.ships).map((ship) => [ship.id, ship]));
        const boxInfo = new Map(listOf(world.boxes).map((box) => [box.scu, box]));

        // 함선 가격 (선택): UEX uuid = 게임 기록 id → canonical 함선 id. uuid 가 없으면 이름으로 하나만 맞을 때만.
        const vehicles = new Map();
        const vehicleTerminals = input.vehiclePrices?.terminals || {};
        if (input.vehiclePrices && Array.isArray(input.vehiclePrices.vehicles)) {
            const catalog = listOf(input.ships, 'ships');
            const byRef = new Map(catalog.filter((ship) => ship && ship.gameRef).map((ship) => [String(ship.gameRef).toLowerCase(), ship.id]));
            const normIds = [...ships.keys()].map((id) => [normName(id), id]);
            for (const vehicle of input.vehiclePrices.vehicles) {
                if (!vehicle) continue;
                let shipId = vehicle.uuid ? byRef.get(String(vehicle.uuid).toLowerCase()) : null;
                let matchedBy = shipId ? 'uuid' : null;
                if (!shipId) {
                    // 이름으로 맞추기: (1) UEX 이름이 함선 id 로 끝나거나, (2) id 의 낱말이 UEX 이름의 낱말로 순서대로 들어 있을 때.
                    // 가장 길게 맞는 것이 하나뿐일 때만 쓴다.
                    const wanted = normName(vehicle.name);
                    const words = String(vehicle.name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
                    const inOrder = (id) => { let at = -1; return id.split('-').every((token) => { at = words.indexOf(token, at + 1); return at >= 0; }); };
                    const hits = normIds.filter(([norm, id]) => norm.length >= 3 && (wanted.endsWith(norm) || inOrder(id)));
                    const best = hits.sort((a, b) => b[0].length - a[0].length)[0];
                    if (best && hits.filter(([norm]) => norm.length === best[0].length).length === 1) { shipId = best[1]; matchedBy = 'name'; }
                }
                if (!shipId || !ships.has(shipId) || vehicles.has(shipId)) continue;
                vehicles.set(shipId, { uexId: vehicle.id, name: vehicle.name || null, matchedBy, buy: Array.isArray(vehicle.buy) ? vehicle.buy : [], rent: Array.isArray(vehicle.rent) ? vehicle.rent : [] });
            }
        }

        return {
            version: VERSION,
            header: { gameVersion: world.gameVersion || cargo.gameVersion || null, builtAt: world.builtAt || cargo.builtAt || null, source: world.source || null },
            world, cargo, terminals, commodities, locations, bodies, gates, ships, boxInfo,
            loading: world.loading || {},
            drives: cargo.drives || {},
            vehicles, vehicleTerminals,
            hasCommodityNames: uexCommodities.size > 0,
            counts,
            cache: { pack: new Map(), profile: new Map(), travel: new Map(), candidates: new Map() },
        };
    }

    // ── 합법 여부 ───────────────────────────────────────────────────────────
    function lawCode(model, game, lawId) {
        if (!game || !game.illegal || !lawId) return null;
        const jurisdictions = model.world.jurisdictions || {};
        let current = lawId;
        for (let depth = 0; depth < 6 && current; depth += 1) {
            if (game.illegal[current]) return game.illegal[current];
            const entry = jurisdictions[current];
            current = entry && entry.inherits && entry.parent ? entry.parent : null;
        }
        return null;
    }

    /**
     * 상품이 두 터미널의 관할에서 합법인지. 게임 파일이 기준이고, 게임 자료로 판단할 수 없을 때만 UEX 표시를 쓴다.
     * legal: true | false | null(모름). from / to: 'p'(금지) | 'c<n>'(통제 n급) | null.
     */
    function legality(model, commodity, fromTerminal, toTerminal) {
        const game = commodity.game;
        const places = [fromTerminal, toTerminal].filter(Boolean);
        if (game && places.every((terminal) => terminal.law)) {
            const from = fromTerminal ? lawCode(model, game, fromTerminal.law) : null;
            const to = toTerminal ? lawCode(model, game, toTerminal.law) : null;
            return { legal: !from && !to, from, to, source: 'game' };
        }
        if (commodity.uexIllegal !== null) return { legal: !commodity.uexIllegal, from: null, to: null, source: 'uex' };
        return { legal: null, from: null, to: null, source: null };
    }

    // ── 화물칸과 상자 ───────────────────────────────────────────────────────
    const ORIENTATIONS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

    /** 한 칸(셀 단위 x,y,z)에 큰 상자부터 실제로 쌓아 본다. 돌려주는 것: 놓인 상자 크기 목록. */
    function packGrid(dims, sizesDesc, boxInfo) {
        const X = dims[0]; const Y = dims[1]; const Z = dims[2];
        const used = new Uint8Array(X * Y * Z);
        const placed = [];
        const free = (x, y, z, a, b, c) => {
            if (x + a > X || y + b > Y || z + c > Z) return false;
            for (let k = z; k < z + c; k += 1) for (let j = y; j < y + b; j += 1) for (let i = x; i < x + a; i += 1) if (used[i + X * (j + Y * k)]) return false;
            return true;
        };
        for (const size of sizesDesc) {
            const cells = boxInfo.get(size)?.cells;
            if (!cells) continue;
            const shapes = [];
            for (const order of ORIENTATIONS) {
                const shape = [cells[order[0]], cells[order[1]], cells[order[2]]];
                if (shape[0] <= X && shape[1] <= Y && shape[2] <= Z && !shapes.some((other) => other[0] === shape[0] && other[1] === shape[1] && other[2] === shape[2])) shapes.push(shape);
            }
            if (!shapes.length) continue;
            for (let z = 0; z < Z; z += 1) for (let y = 0; y < Y; y += 1) for (let x = 0; x < X; x += 1) {
                if (used[x + X * (y + Y * z)]) continue;
                for (const shape of shapes) {
                    if (!free(x, y, z, shape[0], shape[1], shape[2])) continue;
                    for (let k = z; k < z + shape[2]; k += 1) for (let j = y; j < y + shape[1]; j += 1) for (let i = x; i < x + shape[0]; i += 1) used[i + X * (j + Y * k)] = 1;
                    placed.push(size);
                    break;
                }
            }
        }
        return placed;
    }

    function addSlot(slots, size, minBox, count) {
        if (!(count > 0)) return;
        const found = slots.find((slot) => slot.size === size && slot.minBox === minBox);
        if (found) found.count += count;
        else slots.push({ size, minBox, count });
    }

    const sortSlots = (slots) => slots.sort((a, b) => b.size - a.size || a.minBox - b.minBox);

    /** 남은 공간(SCU)을 표준 상자 크기의 빈 자리로 다시 나눈다. */
    function decompose(slots, scu, minBox) {
        let rest = scu;
        for (let index = STANDARD_BOXES.length - 1; index >= 0 && rest > 0; index -= 1) {
            const size = STANDARD_BOXES[index];
            if (size > rest || size < minBox) continue;
            const count = Math.floor(rest / size);
            addSlot(slots, size, minBox, count);
            rest -= count * size;
        }
    }

    /**
     * 함선 화물칸을 "빈 자리" 목록으로 만든다.
     * profile = { id, known, scu(게임 값), capacity(켜 둔 상자로 실제 쌓이는 양), slots[{size,minBox,count}], maxBox, minBox,
     *             drive, driveId, tank, deck, ground, override, sizes }
     * 화물칸을 모르는 함선(scu 없음)은 known:false, capacity:null.
     */
    function shipProfile(model, settingsInput) {
        const s = settings(settingsInput);
        const enabled = s.boxes || STANDARD_BOXES;
        const key = [s.ship, enabled.join('.'), s.capacityScu || ''].join('|');
        const cached = model.cache.profile.get(key);
        if (cached) return cached;
        const ship = s.ship ? model.ships.get(s.ship) : null;
        const driveId = ship?.qd || null;
        const profile = {
            id: s.ship, exists: Boolean(ship), known: false, scu: ship && isNum(ship.scu) ? ship.scu : null, capacity: null, slots: [],
            maxBox: null, minBox: null, driveId, drive: driveId ? model.drives[driveId] || null : null,
            tank: ship && isNum(ship.qt) ? ship.qt : null, deck: ship?.deck === 1, ground: ship?.k === 'g', override: false, sizes: enabled, capCache: new Map(),
        };
        const slots = [];
        if (s.capacityScu) {
            profile.override = true;
            const top = enabled[enabled.length - 1];
            addSlot(slots, top, 1, Math.floor(s.capacityScu / top));
            decompose(slots, s.capacityScu % top, 1);
            profile.known = true;
        } else if (ship && isNum(ship.scu)) {
            profile.known = true;
            for (const grid of ship.g || []) {
                const minBox = grid.minBox || 1;
                const sizes = enabled.filter((size) => size <= grid.box && size >= minBox).sort((a, b) => b - a);
                if (!sizes.length) continue;
                const packKey = grid.c.join('x') + '|' + sizes.join('.');
                let placed = model.cache.pack.get(packKey);
                if (!placed) { placed = packGrid(grid.c, sizes, model.boxInfo); model.cache.pack.set(packKey, placed); }
                const copies = grid.n || 1;
                for (const size of placed) addSlot(slots, size, minBox, copies);
            }
        }
        sortSlots(slots);
        profile.slots = slots;
        if (profile.known) {
            profile.capacity = slots.reduce((sum, slot) => sum + slot.size * slot.count, 0);
            profile.maxBox = slots.length ? slots[0].size : null;
            profile.minBox = slots.length ? Math.min(...slots.map((slot) => slot.minBox)) : null;
        }
        model.cache.profile.set(key, profile);
        return profile;
    }

    /** 빈 자리 하나(size)에 허용된 상자로 limit SCU 까지 채우는 가장 좋은 방법. */
    function fillSlot(size, minBox, allowedDesc, limit) {
        let best = null;
        for (let start = 0; start < allowedDesc.length; start += 1) {
            let rest = Math.min(size, limit);
            const boxes = [];
            let total = 0;
            for (let index = start; index < allowedDesc.length && rest > 0; index += 1) {
                const box = allowedDesc[index];
                if (box > size || box < minBox || box > rest) continue;
                const count = Math.floor(rest / box);
                boxes.push([box, count]);
                rest -= count * box;
                total += count * box;
            }
            if (!best || total > best.total) best = { boxes, total };
            if (best.total === Math.min(size, limit)) break;
        }
        return best || { boxes: [], total: 0 };
    }

    /**
     * 빈 자리 목록(slots, 고쳐 쓴다)에서 want SCU 를 허용된 상자 크기로 싣는다.
     * 돌려주는 것: { got, boxes: Map(size → count) }. 쓰다 남은 자리는 작은 빈 자리로 되돌려 둔다.
     */
    function takeFromSlots(slots, allowedDesc, want) {
        const boxes = new Map();
        let got = 0;
        const returned = [];
        const add = (pattern, times) => { for (const [box, count] of pattern.boxes) boxes.set(box, (boxes.get(box) || 0) + count * times); };
        for (let index = 0; index < slots.length && got < want; index += 1) {
            const slot = slots[index];
            if (!slot.count) continue;
            const full = fillSlot(slot.size, slot.minBox, allowedDesc, slot.size);
            if (!full.total) continue;
            const rest = want - got;
            const whole = Math.min(slot.count, Math.floor(rest / full.total));
            if (whole > 0) {
                add(full, whole);
                slot.count -= whole;
                got += whole * full.total;
                if (full.total < slot.size) returned.push([slot.size - full.total, slot.minBox, whole]);
            }
            const left = want - got;
            if (left > 0 && slot.count > 0) {
                const part = fillSlot(slot.size, slot.minBox, allowedDesc, left);
                if (part.total > 0) {
                    add(part, 1);
                    slot.count -= 1;
                    got += part.total;
                    returned.push([slot.size - part.total, slot.minBox, 1]);
                }
            }
        }
        if (returned.length) {
            for (const [scu, minBox, times] of returned) for (let n = 0; n < times; n += 1) decompose(slots, scu, minBox);
            sortSlots(slots);
        }
        return { got, boxes };
    }

    const cloneSlots = (slots) => slots.map((slot) => ({ size: slot.size, minBox: slot.minBox, count: slot.count }));
    const boxesToList = (map) => [...map.entries()].sort((a, b) => b[0] - a[0]).map(([scu, count]) => ({ scu, count }));

    /**
     * SCU 를 이 함선에 실을 상자로 나눈다. sizes: 터미널이 주는 상자 크기 (없으면 켜 둔 크기 전부).
     * 돌려주는 것: { scu(실제로 실리는 양), boxes[{scu,count}], boxCount, leftover(상자로 못 맞춘 양) }
     */
    function splitBoxes(profile, scu, sizes) {
        const allowed = (sizes || profile.sizes).filter((size) => profile.sizes.includes(size)).sort((a, b) => b - a);
        const want = Math.max(0, Math.floor(isNum(scu) ? scu : 0));
        const taken = takeFromSlots(cloneSlots(profile.slots), allowed, want);
        const boxes = boxesToList(taken.boxes);
        return { scu: taken.got, boxes, boxCount: boxes.reduce((sum, box) => sum + box.count, 0), leftover: want - taken.got };
    }

    // ── 시간 ────────────────────────────────────────────────────────────────
    /**
     * 두 터미널 사이 비행 (추정). known:false 면 seconds 는 null 이고 reason 에 까닭이 있다.
     * mode: 'same-place' | 'same-body' | 'quantum' | 'jump'
     */
    function travelBetween(model, settingsInput, fromId, toId) {
        const s = settings(settingsInput);
        const profile = shipProfile(model, s);
        return withFuel(profile, travelFor(model, profile, s.time, model.terminals.get(Number(fromId)), model.terminals.get(Number(toId))));
    }

    function travelFor(model, profile, time, from, to) {
        const unknown = (reason) => ({ known: false, seconds: null, reason, estimate: true });
        if (!from || !to) return unknown('no-terminal');
        const key = (profile.driveId || '-') + '|' + from.id + '|' + to.id + '|' + time.sameBodySeconds + '|' + time.jumpSeconds;
        const cached = model.cache.travel.get(key);
        if (cached) return cached;
        if (model.cache.travel.size > 60000) model.cache.travel.clear();
        let result;
        if (from.locationId && from.locationId === to.locationId) {
            result = { known: true, estimate: true, mode: 'same-place', seconds: 0, distanceM: 0, assumptions: [] };
        } else if (!from.position || !to.position) {
            result = unknown('no-position');
        } else if (from.system === to.system && from.bodyId && from.bodyId === to.bodyId && (from.bodyKind === 'planet' || from.bodyKind === 'moon')) {
            // 둘 다 지표면이 아니어도(예: 지표면 전초기지 ↔ 그 행성 궤도의 정거장) 같은 값을 쓴다. 그때는 orbit:true 로 알린다.
            result = { known: true, estimate: true, mode: 'same-body', orbit: !(from.surface === true && to.surface === true), seconds: time.sameBodySeconds, distanceM: distanceMeters(from.position, to.position), assumptions: ['time.sameBody'] };
        } else if (!profile.drive) {
            result = unknown(profile.exists ? 'no-drive' : 'no-ship');
        } else if (from.system === to.system) {
            const distanceM = distanceMeters(from.position, to.position);
            const quantum = quantumTravel(distanceM, profile.drive);
            result = {
                known: true, estimate: true, mode: 'quantum', seconds: quantum.totalSeconds, minSeconds: quantum.minSeconds + (quantum.spoolSeconds || 0),
                maxSeconds: quantum.maxSeconds + (quantum.spoolSeconds || 0), distanceM, fuelScu: numOrNull(quantum.fuelScu), assumptions: ['time.quantum'],
            };
        } else {
            const out = model.gates.get(from.system + '>' + to.system);
            const back = model.gates.get(to.system + '>' + from.system);
            if (!out || !back) {
                result = unknown('no-gateway');
            } else {
                const first = quantumTravel(distanceMeters(from.position, out.p), profile.drive);
                const second = quantumTravel(distanceMeters(back.p, to.position), profile.drive);
                const spool = (first.spoolSeconds || 0) + (second.spoolSeconds || 0);
                result = {
                    known: true, estimate: true, mode: 'jump', seconds: first.totalSeconds + time.jumpSeconds + second.totalSeconds,
                    minSeconds: first.minSeconds + second.minSeconds + spool + time.jumpSeconds, maxSeconds: first.maxSeconds + second.maxSeconds + spool + time.jumpSeconds,
                    distanceM: distanceMeters(from.position, out.p) + distanceMeters(back.p, to.position), jumpSeconds: time.jumpSeconds, gateways: [out.id, back.id],
                    fuelScu: isNum(first.fuelScu) && isNum(second.fuelScu) ? first.fuelScu + second.fuelScu : null, assumptions: ['time.quantum', 'time.jump'],
                };
            }
        }
        model.cache.travel.set(key, result);
        return result;
    }

    /** 비행 결과에 이 함선의 연료통을 붙인다 (같은 드라이브를 쓰는 함선끼리 비행 결과를 함께 쓰므로 따로 붙인다). */
    function withFuel(profile, flight) {
        if (!flight.known || !isNum(flight.fuelScu)) return flight;
        return { ...flight, tankScu: profile.tank, fuelEnough: isNum(profile.tank) ? flight.fuelScu <= profile.tank : null };
    }

    /** 싣거나 내리는 시간. boxes: Map(size → count). side: 'load' | 'unload'. */
    function handlingTime(model, profile, time, terminal, boxes, scu, side) {
        const boxCount = [...boxes.values()].reduce((sum, count) => sum + count, 0);
        if (!boxCount) return { seconds: 0, mode: 'none', boxCount: 0, fee: null };
        const auto = time.loading === 'auto' && terminal.flags.autoLoad === true;
        if (!auto) {
            return { seconds: time.manualBaseSeconds + time.manualBoxSeconds * boxCount, mode: 'manual', boxCount, fee: null, why: time.loading === 'manual' ? 'setting' : 'auto-not-reported' };
        }
        const base = side === 'load' ? model.loading.baseLoad : model.loading.baseUnload;
        let seconds = isNum(base) ? base : 0;
        let fee = isNum(model.loading.baseFee) ? model.loading.baseFee : null;
        let known = isNum(base);
        if (profile.deck && isNum(model.loading.deckPerScu)) {
            seconds += model.loading.deckPerScu * scu; // 화물 갑판 함선(헐 C): 상자별 값 대신 SCU당 값
        }
        for (const [size, count] of boxes) {
            const info = model.boxInfo.get(size);
            const each = info ? info[side] : null;
            if (!profile.deck || !isNum(model.loading.deckPerScu)) {
                if (isNum(each)) seconds += each * count; else known = false;
            }
            if (fee !== null && info && isNum(info.fee)) fee += info.fee * count; else fee = null;
        }
        // 게임 값이 빠져 있으면 자동 적재 시간을 지어내지 않고 손으로 싣는 가정으로 돌아간다.
        if (!known) return { seconds: time.manualBaseSeconds + time.manualBoxSeconds * boxCount, mode: 'manual', boxCount, fee: null, why: 'auto-time-missing' };
        return { seconds, mode: 'auto', boxCount, fee };
    }

    /** 한 구간의 전체 시간. boxes 가 비어 있으면 빈 배로 가는 시간(터미널·적재 없음). */
    function legTime(model, profile, time, from, to, boxes, scu) {
        const flight = withFuel(profile, travelFor(model, profile, time, from, to));
        const loaded = boxes && boxes.size > 0;
        const load = loaded ? handlingTime(model, profile, time, from, boxes, scu, 'load') : { seconds: 0, mode: 'none', boxCount: 0, fee: null };
        const unload = loaded ? handlingTime(model, profile, time, to, boxes, scu, 'unload') : { seconds: 0, mode: 'none', boxCount: 0, fee: null };
        const moving = flight.known && flight.mode !== 'same-place';
        const air = flight.known && flight.mode !== 'same-body' && flight.mode !== 'same-place';
        const parts = {
            buy: loaded ? time.terminalSeconds : 0,
            load: load.seconds,
            depart: moving ? time.takeoffSeconds + (air && from.surface ? time.atmosphereSeconds : 0) : 0,
            flight: flight.known ? flight.seconds : null,
            arrive: moving ? time.landingSeconds + (air && to.surface ? time.atmosphereSeconds : 0) : 0,
            sell: loaded ? time.terminalSeconds : 0,
            unload: unload.seconds,
        };
        const assumptions = new Set(['time.manual', ...(flight.assumptions || [])]);
        if (load.mode === 'auto' || unload.mode === 'auto') assumptions.add('time.autoLoad');
        if (isNum(flight.fuelScu)) assumptions.add('fuel.unit');
        return {
            known: flight.known,
            estimate: true,
            seconds: flight.known ? parts.buy + parts.load + parts.depart + parts.flight + parts.arrive + parts.sell + parts.unload : null,
            parts, flight, load, unload,
            reason: flight.known ? null : flight.reason,
            assumptions: [...assumptions],
        };
    }

    // ── 후보 경로 (함선·돈과 무관한 부분) ─────────────────────────────────────
    function cleanFilters(filters) {
        const f = filters && typeof filters === 'object' ? filters : {};
        return {
            commodity: toIdSet(f.commodity), from: toIdSet(f.from), to: toIdSet(f.to),
            system: toNameSet(f.system), fromSystem: toNameSet(f.fromSystem), toSystem: toNameSet(f.toSystem),
            sameSystem: f.sameSystem === true,
            stationsOnly: f.stationsOnly === true, legalOnly: f.legalOnly === true, fullLoadOnly: f.fullLoadOnly === true,
            avoidFull: f.avoidFull === true, includeNotLive: f.includeNotLive === true,
            maxGoods: clampInt(f.maxGoods, 1, 8, 1),
            returnTrip: f.returnTrip === true,
            sort: ['perHour', 'profit', 'margin', 'roi'].includes(f.sort) ? f.sort : 'perHour',
            limit: clampInt(f.limit, 1, 500, 50),
            minProfit: isNum(f.minProfit) ? f.minProfit : 0,
        };
    }

    const setKey = (set) => (set ? [...set].sort().join(',') : '');

    /**
     * 가격이 맞는 (구매처, 판매처) 쌍과 그 쌍으로 옮길 수 있는 상품들 (차익 큰 순).
     * 기준일보다 오래된 보고, 시각 모르는 보고, 품절 보고, 지금 게임에 없는 터미널은 여기서 빠진다.
     */
    function candidates(model, s, f) {
        const key = [Math.floor(s.now / 60000), s.maxAgeDays, setKey(f.commodity), setKey(f.from), setKey(f.to), setKey(f.system), setKey(f.fromSystem), setKey(f.toSystem),
            f.sameSystem, f.stationsOnly, f.legalOnly, f.avoidFull, f.includeNotLive].join('|');
        const cachedValue = model.cache.candidates.get(key);
        if (cachedValue) return cachedValue;
        const stats = { buyRows: 0, sellRows: 0, tooOld: 0, ageUnknown: 0, soldOut: 0, notLive: 0, illegal: 0, legalUnknown: 0, fullDestination: 0, pairs: 0, pairGoods: 0 };
        const fresh = (row) => {
            const level = ageLevel(row.at, s.maxAgeDays, s.now);
            if (level === 'ok') return true;
            if (level === 'old') stats.tooOld += 1; else stats.ageUnknown += 1;
            return false;
        };
        const placeOk = (terminal, own, side) => {
            if (!terminal.live && !f.includeNotLive) { stats.notLive += 1; return false; }
            if (own && !own.has(terminal.id)) return false;
            const system = terminal.system ? terminal.system.toLowerCase() : null;
            if (f.system && !(system && f.system.has(system))) return false;
            if (side && !(system && side.has(system))) return false;
            if (f.stationsOnly && terminal.isStation !== true) return false;
            return true;
        };
        const pairs = new Map();
        for (const commodity of model.commodities.values()) {
            if (f.commodity && !f.commodity.has(commodity.id)) continue;
            const buys = [];
            for (const row of commodity.buys) {
                if (!placeOk(row.terminal, f.from, f.fromSystem) || !fresh(row)) continue;
                if (row.stock === 0) { stats.soldOut += 1; continue; }
                buys.push(row);
            }
            if (!buys.length) continue;
            const sells = [];
            for (const row of commodity.sells) {
                if (!placeOk(row.terminal, f.to, f.toSystem) || !fresh(row)) continue;
                if (f.avoidFull && row.level === 7) { stats.fullDestination += 1; continue; }
                sells.push(row);
            }
            stats.buyRows += buys.length;
            stats.sellRows += sells.length;
            for (const buy of buys) {
                for (const sell of sells) {
                    if (sell.price <= buy.price || sell.t === buy.t) continue;
                    if (f.sameSystem && buy.terminal.system !== sell.terminal.system) continue;
                    const law = legality(model, commodity, buy.terminal, sell.terminal);
                    if (f.legalOnly && law.legal !== true) {
                        if (law.legal === false) stats.illegal += 1; else stats.legalUnknown += 1;
                        continue;
                    }
                    const pairKey = buy.t * 1e7 + sell.t;
                    let pair = pairs.get(pairKey);
                    if (!pair) { pair = { from: buy.terminal, to: sell.terminal, goods: [] }; pairs.set(pairKey, pair); }
                    pair.goods.push({ commodity, buy, sell, margin: sell.price - buy.price, law });
                    stats.pairGoods += 1;
                }
            }
        }
        for (const pair of pairs.values()) pair.goods.sort((a, b) => b.margin - a.margin || a.commodity.id - b.commodity.id);
        stats.pairs = pairs.size;
        const value = { pairs, stats };
        if (model.cache.candidates.size >= 6) model.cache.candidates.delete(model.cache.candidates.keys().next().value);
        model.cache.candidates.set(key, value);
        return value;
    }

    // ── 수량 · 상자 · 이익 ───────────────────────────────────────────────────
    /** 이 상품을 이 쌍으로 옮길 때 쓸 수 있는 상자 크기 (큰 순). assumed: 출발지 상자 보고가 없어 가정함. */
    function allowedBoxes(profile, good, from, to) {
        const offered = good.buy.box;
        let limit = Infinity;
        if (!offered && isNum(from.maxBox)) limit = from.maxBox;
        const destLimit = good.sell.box ? good.sell.box[good.sell.box.length - 1] : to.maxBox;
        if (isNum(destLimit)) limit = Math.min(limit, destLimit);
        const base = offered || STANDARD_BOXES;
        const list = [];
        for (let index = base.length - 1; index >= 0; index -= 1) {
            const size = base[index];
            if (size <= limit && profile.sizes.includes(size)) list.push(size);
        }
        return { list, assumed: !offered };
    }

    /**
     * 한 쌍에 최대 maxGoods 가지 상품을 싣는다.
     * 수량 = 다음 중 가장 작은 것: 함선에 실리는 양, 재고(보고가 있을 때), 돈 ÷ 가격(돈을 정했을 때),
     *        도착지가 받아 주는 양(자료에 있을 때만 — 지금은 없다). 그다음 상자로 나눠 맞는 만큼만.
     * 싣는 순서: 먼저 SCU당 차익이 큰 순. 실을 수 있는 상품이 maxGoods 보다 많으면 "그 상품 하나만 실었을 때의 이익"이
     *        큰 순으로도 한 번 더 실어 보고, 이익이 더 큰 쪽을 쓴다 (재고가 몇 SCU뿐인 상품이 화물칸을 채울 상품을 가리지 않게).
     *        두 가지 순서만 견준다 — 모든 조합을 다 따지지는 않는다.
     */
    function loadPair(profile, pair, budget, maxGoods, only) {
        const list = only ? pair.goods.filter((good) => only.has(good.commodity.id)) : pair.goods;
        const first = loadInOrder(profile, pair, budget, maxGoods, list);
        if (list.length <= maxGoods) return first;
        // 상자 맞추기 전의 어림값으로 줄을 세운다 (빈 화물칸 기준). 같으면 원래 순서(SCU당 차익 큰 순)를 지킨다.
        const alone = (good) => {
            const allowed = allowedBoxes(profile, good, pair.from, pair.to);
            let want = emptyHoldCap(profile, allowed.list);
            if (good.buy.stock !== null) want = Math.min(want, Math.floor(good.buy.stock));
            if (budget !== null) want = Math.min(want, Math.floor(budget / good.buy.price));
            if (good.sell.room !== null) want = Math.min(want, Math.floor(good.sell.room));
            return Math.max(0, want) * good.margin;
        };
        const ranked = list.map((good, index) => ({ good, index, value: alone(good) })).sort((a, b) => b.value - a.value || a.index - b.index);
        if (ranked.every((item, index) => item.index === index)) return first;
        const second = loadInOrder(profile, pair, budget, maxGoods, ranked.map((item) => item.good));
        return second.profit > first.profit ? second : first;
    }

    /** 빈 화물칸에 이 상자 크기들로 실리는 양 (상자 크기 조합별로 한 번만 계산해 둔다). */
    function emptyHoldCap(profile, allowedList) {
        const capKey = allowedList.join('.');
        let cap = profile.capCache.get(capKey);
        if (cap === undefined) { cap = takeFromSlots(cloneSlots(profile.slots), allowedList, Infinity).got; profile.capCache.set(capKey, cap); }
        return cap;
    }

    function loadInOrder(profile, pair, budget, maxGoods, list) {
        const slots = cloneSlots(profile.slots);
        const goods = [];
        const totalBoxes = new Map();
        let money = budget;
        let quantity = 0; let investment = 0; let revenue = 0;
        for (const good of list) {
            if (goods.length >= maxGoods) break;
            const allowed = allowedBoxes(profile, good, pair.from, pair.to);
            const shipCap = goods.length ? takeFromSlots(cloneSlots(slots), allowed.list, Infinity).got : emptyHoldCap(profile, allowed.list);
            const caps = {
                ship: shipCap,
                stock: good.buy.stock,                                             // null = 보고 없음
                budget: money === null ? null : Math.floor(money / good.buy.price), // null = 돈을 정하지 않음
                destination: good.sell.room,                                       // null = 자료에 없음
            };
            let want = caps.ship; let limitedBy = 'ship';
            for (const name of ['stock', 'budget', 'destination']) {
                if (caps[name] !== null && Math.floor(caps[name]) < want) { want = Math.floor(caps[name]); limitedBy = name; }
            }
            if (!(want > 0)) continue;
            const taken = takeFromSlots(slots, allowed.list, want);
            if (!(taken.got > 0)) continue;
            if (taken.got < want) limitedBy = 'boxes';
            const cost = round6(taken.got * good.buy.price);
            const income = round6(taken.got * good.sell.price);
            if (money !== null) money = round6(money - cost);
            for (const [size, count] of taken.boxes) totalBoxes.set(size, (totalBoxes.get(size) || 0) + count);
            quantity += taken.got; investment += cost; revenue += income;
            goods.push({
                c: good.commodity.id, quantity: taken.got, boxes: boxesToList(taken.boxes), boxesAssumed: allowed.assumed,
                buyPrice: good.buy.price, sellPrice: good.sell.price, margin: good.margin,
                cost, revenue: income, profit: round6(income - cost),
                caps, limitedBy, stockKnown: good.buy.stock !== null,
                destination: { takes: good.sell.room, level: good.sell.level, inv: good.sell.inv, full: good.sell.level === 7 },
                buyAt: good.buy.at, sellAt: good.sell.at,
                legal: good.law.legal, illegal: { from: good.law.from, to: good.law.to }, legalSource: good.law.source,
            });
        }
        return { goods, boxes: totalBoxes, quantity, investment: round6(investment), revenue: round6(revenue), profit: round6(revenue - investment), moneyLeft: money };
    }

    function describeRoute(model, profile, s, pair, load) {
        const time = legTime(model, profile, s.time, pair.from, pair.to, load.boxes, load.quantity);
        const assumptions = new Set(['price.static', 'cargo.packing', ...time.assumptions]);
        let oldestAt = null;
        for (const good of load.goods) {
            if (!good.stockKnown) assumptions.add('stock.unknown');
            if (good.destination.takes === null) assumptions.add('demand.unknown');
            if (good.boxesAssumed) assumptions.add('cargo.boxesAssumed');
            for (const at of [good.buyAt, good.sellAt]) if (oldestAt === null || at < oldestAt) oldestAt = at;
        }
        if (profile.override) assumptions.add('cargo.capacityOverride');
        const fee = isNum(time.load.fee) || isNum(time.unload.fee) ? (time.load.fee || 0) + (time.unload.fee || 0) : null;
        return {
            from: pair.from.id, to: pair.to.id,
            goods: load.goods,
            boxes: boxesToList(load.boxes),
            quantity: load.quantity,
            capacity: profile.capacity,
            full: profile.capacity !== null && load.quantity >= profile.capacity,
            investment: load.investment, revenue: load.revenue, profit: load.profit,
            roi: load.investment > 0 ? load.profit / load.investment : null,
            marginPerScu: load.quantity > 0 ? load.profit / load.quantity : null,
            time,
            seconds: time.seconds,
            profitPerHour: time.known && time.seconds > 0 ? load.profit / time.seconds * 3600 : null,
            autoLoadFee: fee,                         // 게임 파일 값(단위를 aUEC로 읽음, 확인 안 됨). 이익에서 빼지 않았다.
            oldestAt,
            legal: load.goods.every((good) => good.legal === true) ? true : (load.goods.some((good) => good.legal === false) ? false : null),
            assumptions: [...assumptions],
        };
    }

    const SORTERS = {
        perHour: (a, b) => (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity) || b.profit - a.profit,
        profit: (a, b) => b.profit - a.profit,
        margin: (a, b) => (b.marginPerScu ?? -Infinity) - (a.marginPerScu ?? -Infinity) || b.profit - a.profit,
        roi: (a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity) || b.profit - a.profit,
    };
    const tieBreak = (a, b) => a.from - b.from || a.to - b.to;

    function prepare(model, settingsInput, filters) {
        const s = settings(settingsInput);
        return { s, f: cleanFilters(filters), profile: shipProfile(model, s) };
    }

    function shipProblem(profile) {
        if (!profile.id) return 'no-ship';
        if (!profile.exists && !profile.override) return 'unknown-ship';
        if (!profile.known) return 'cargo-unknown';       // 게임 자료에 화물칸 값이 없는 함선
        if (!(profile.capacity > 0)) return 'no-cargo';   // 기본 장착에 화물칸이 없거나, 켜 둔 상자가 하나도 안 들어감
        return null;
    }

    /** 돌아오는 길: 같은 두 곳을 반대로. 실을 것이 없으면 빈 배로 돌아오는 시간만. */
    function addReturn(model, profile, s, f, route, pair) {
        // 돌아오는 길은 출발지·도착지·상품 필터와 무관하게 찾는다 (나머지 필터는 그대로).
        const cand = candidates(model, s, { ...f, from: null, to: null, commodity: null, fromSystem: null, toSystem: null });
        const backPair = cand.pairs.get(pair.to.id * 1e7 + pair.from.id);
        const money = s.budget === null ? null : round6(s.budget + route.profit);
        const load = backPair ? loadPair(profile, backPair, money, f.maxGoods, null) : null;
        const loaded = load && load.quantity > 0 && load.profit > 0;
        const back = loaded ? describeRoute(model, profile, s, backPair, load)
            : { from: pair.to.id, to: pair.from.id, goods: [], boxes: [], quantity: 0, investment: 0, revenue: 0, profit: 0, empty: true, time: legTime(model, profile, s.time, pair.to, pair.from, null, 0) };
        if (!loaded) back.seconds = back.time.seconds;
        route.ret = back;
        const known = route.time.known && back.time.known;
        const seconds = known ? route.seconds + back.seconds : null;
        const profit = round6(route.profit + back.profit);
        route.roundTrip = { profit, seconds, profitPerHour: known && seconds > 0 ? profit / seconds * 3600 : null };
    }

    /**
     * A→B 경로 순위.
     * filters: commodity, from, to (UEX id 또는 목록) · system / fromSystem / toSystem (이름) · sameSystem · stationsOnly ·
     *          fullLoadOnly · legalOnly · avoidFull(가득 찼다고 보고된 판매처 빼기) · includeNotLive ·
     *          maxGoods(한 곳에서 싣는 상품 가짓수 1~8, 기본 1) · returnTrip · sort('perHour'|'profit'|'margin'|'roi') · limit(기본 50) · minProfit
     * 돌려주는 것: { ok, problem, routes[], total, stats, ship, settings }
     */
    function rankRoutes(model, settingsInput, filters) {
        const { s, f, profile } = prepare(model, settingsInput, filters);
        const problem = shipProblem(profile);
        const base = { ok: !problem, problem, routes: [], total: 0, stats: null, ship: publicProfile(profile), settings: s };
        if (problem) return base;
        const cand = candidates(model, s, f);
        const routes = [];
        let noTime = 0;
        for (const pair of cand.pairs.values()) {
            const load = loadPair(profile, pair, s.budget, f.maxGoods, null);
            if (!(load.quantity > 0) || !(load.profit > f.minProfit)) continue;
            if (f.fullLoadOnly && load.quantity < profile.capacity) continue;
            const route = describeRoute(model, profile, s, pair, load);
            if (!route.time.known) noTime += 1;
            if (f.returnTrip) addReturn(model, profile, s, f, route, pair);
            routes.push(route);
        }
        const sorter = SORTERS[f.sort];
        const scoreOf = f.returnTrip && (f.sort === 'perHour' || f.sort === 'profit')
            ? (route) => ({ profitPerHour: route.roundTrip.profitPerHour, profit: route.roundTrip.profit, marginPerScu: route.marginPerScu, roi: route.roi })
            : (route) => route;
        routes.sort((a, b) => sorter(scoreOf(a), scoreOf(b)) || tieBreak(a, b));
        return { ...base, routes: routes.slice(0, f.limit), total: routes.length, stats: { ...cand.stats, routes: routes.length, timeUnknown: noTime } };
    }

    /** 순위 전체가 필요 없을 때: 가장 좋은 경로 하나만 (시간당 이익, 시간을 모르면 이익). */
    function bestRoute(model, profile, s, f) {
        const cand = candidates(model, s, f);
        let best = null;
        for (const pair of cand.pairs.values()) {
            const load = loadPair(profile, pair, s.budget, f.maxGoods, null);
            if (!(load.quantity > 0) || !(load.profit > f.minProfit)) continue;
            if (f.fullLoadOnly && load.quantity < profile.capacity) continue;
            const time = legTime(model, profile, s.time, pair.from, pair.to, load.boxes, load.quantity);
            const perHour = time.known && time.seconds > 0 ? load.profit / time.seconds : null;
            const better = !best || (perHour ?? -Infinity) > (best.perHour ?? -Infinity)
                || (perHour === best.perHour && (load.profit > best.load.profit || (load.profit === best.load.profit && tieBreak({ from: pair.from.id, to: pair.to.id }, { from: best.pair.from.id, to: best.pair.to.id }) < 0)));
            if (better) best = { pair, load, perHour };
        }
        return best ? describeRoute(model, profile, s, best.pair, best.load) : null;
    }

    function publicProfile(profile) {
        return {
            id: profile.id, exists: profile.exists, known: profile.known, scu: profile.scu, capacity: profile.capacity,
            maxBox: profile.maxBox, minBox: profile.minBox, driveId: profile.driveId, hasDrive: Boolean(profile.drive),
            tank: profile.tank, deck: profile.deck, ground: profile.ground, override: profile.override, sizes: profile.sizes.slice(),
            slots: cloneSlots(profile.slots),
        };
    }

    function findPair(model, s, f, fromId, toId) {
        const cand = candidates(model, s, { ...f, from: new Set([Number(fromId)]), to: new Set([Number(toId)]), commodity: null });
        return { cand, pair: cand.pairs.get(Number(fromId) * 1e7 + Number(toId)) || null };
    }

    /**
     * 한 경로를 자세히: { from, to, commodities?(이 상품들만, 없으면 차익 큰 순으로 maxGoods 가지) }.
     * 실을 것이 없어도 시간은 돌려준다 (route.quantity = 0).
     */
    function evaluateRoute(model, settingsInput, request, filters) {
        const { s, f, profile } = prepare(model, settingsInput, filters);
        const req = request || {};
        const from = model.terminals.get(Number(req.from));
        const to = model.terminals.get(Number(req.to));
        const problem = shipProblem(profile) || (!from || !to ? 'unknown-terminal' : null);
        if (problem) return { ok: false, problem, route: null, ship: publicProfile(profile), settings: s };
        const only = toIdSet(req.commodities);
        const { cand, pair } = findPair(model, s, f, from.id, to.id);
        const usePair = pair || { from, to, goods: [] };
        const load = loadPair(profile, usePair, s.budget, only ? Math.max(f.maxGoods, only.size) : f.maxGoods, only);
        const route = describeRoute(model, profile, s, usePair, load);
        if (f.returnTrip) addReturn(model, profile, s, f, route, usePair);
        return { ok: true, problem: null, route, stats: cand.stats, ship: publicProfile(profile), settings: s };
    }

    /**
     * 한 경로를 모든 함선으로 비교. request: { from, to, commodities?, ships?(id 목록, 없으면 화물칸이 있는 함선 전부) }
     * 돌려주는 것: rows[{ ship, capacity, quantity, profit, investment, seconds, profitPerHour, route }], unknownCargo[id]
     */
    function compareShips(model, settingsInput, request, filters) {
        const base = settings(settingsInput);
        const req = request || {};
        const ids = Array.isArray(req.ships) && req.ships.length ? req.ships : [...model.ships.keys()];
        const rows = [];
        const unknownCargo = [];
        for (const id of ids) {
            const ship = model.ships.get(id);
            if (!ship) continue;
            if (!isNum(ship.scu)) { unknownCargo.push(id); continue; }
            if (!(ship.scu > 0)) continue;
            const result = evaluateRoute(model, { ...base, ship: id, capacityScu: null }, req, filters);
            if (!result.ok || !(result.route.quantity > 0)) continue;
            const route = result.route;
            rows.push({ ship: id, capacity: route.capacity, quantity: route.quantity, investment: route.investment, profit: route.profit, seconds: route.seconds, profitPerHour: route.profitPerHour, route });
        }
        rows.sort((a, b) => SORTERS.perHour(a, b) || (a.ship < b.ship ? -1 : 1));
        return { rows, unknownCargo, settings: base };
    }

    /**
     * 지금 있는 터미널에서 이어 갈 다음 구간. request: { from, toward?(돌아가고 싶은 터미널) }
     * toward 를 주면 각 경로에 homeSeconds(도착지에서 그곳까지 빈 배 비행 시간)와 closer(지금보다 가까워지는지)를 붙인다.
     */
    function nextLegs(model, settingsInput, request, filters) {
        const req = request || {};
        const result = rankRoutes(model, settingsInput, { ...(filters || {}), from: req.from });
        const home = req.toward === undefined || req.toward === null ? null : model.terminals.get(Number(req.toward));
        if (!home || !result.ok) return result;
        const profile = shipProfile(model, result.settings);
        const here = model.terminals.get(Number(req.from));
        const nowHome = here ? travelFor(model, profile, result.settings.time, here, home) : null;
        for (const route of result.routes) {
            const after = travelFor(model, profile, result.settings.time, model.terminals.get(route.to), home);
            route.homeSeconds = after.known ? after.seconds : null;
            route.arrivesHome = route.to === home.id;
            route.closer = after.known && nowHome && nowHome.known ? after.seconds < nowHome.seconds : null;
        }
        return result;
    }

    // ── 여러 곳을 도는 경로 ──────────────────────────────────────────────────
    /**
     * options: stops(들르는 곳 수 2~8, 기본 3) · mode('flyOn' 계속 가기 | 'roundTrip' 출발지로 돌아오기) · start(터미널 id) ·
     *          maxLegSeconds(한 구간 최대 시간) · stayInSystem(한 항성계 안에서만) · goal('perHour'|'profit') ·
     *          limit(기본 10) · beam(한 단계에 남기는 후보 수, 기본 24, 최대 200) · maxWork(구간 계산 횟수 상한, 기본 40,000, 최대 400,000)
     *          + rankRoutes 의 필터(system, stationsOnly, legalOnly, avoidFull, maxGoods).
     * 같은 터미널을 두 번 들르지 않는다(같은 재고를 두 번 세지 않으려고). 돈은 구간마다 번 만큼 늘어난다.
     * 작업량 상한에 닿으면 그때까지 찾은 것을 돌려주고 truncated:true 로 알린다 — 브라우저가 멈추지 않는다.
     */
    function findChains(model, settingsInput, options) {
        const o = options && typeof options === 'object' ? options : {};
        const { s, f, profile } = prepare(model, settingsInput, { ...o, sameSystem: o.stayInSystem === true, from: null, to: null, returnTrip: false });
        const stops = clampInt(o.stops, 2, 8, 3);
        const mode = o.mode === 'roundTrip' ? 'roundTrip' : 'flyOn';
        const goal = o.goal === 'profit' ? 'profit' : 'perHour';
        const beamWidth = clampInt(o.beam, 1, 200, 24);
        const maxWork = clampInt(o.maxWork, 1, 400000, 40000);
        const limit = clampInt(o.limit, 1, 100, 10);
        const maxLeg = isNum(o.maxLegSeconds) && o.maxLegSeconds > 0 ? o.maxLegSeconds : null;
        const problem = shipProblem(profile);
        const out = { ok: !problem, problem, chains: [], stops, mode, goal, truncated: false, work: 0, maxWork, shortened: false, ship: publicProfile(profile), settings: s };
        if (problem) return out;
        const start = o.start === undefined || o.start === null || o.start === '' ? null : model.terminals.get(Number(o.start));
        if (o.start !== undefined && o.start !== null && o.start !== '' && !start) return { ...out, ok: false, problem: 'unknown-terminal' };

        const cand = candidates(model, s, f);
        const outgoing = new Map();
        for (const pair of cand.pairs.values()) {
            if (!outgoing.has(pair.from.id)) outgoing.set(pair.from.id, []);
            outgoing.get(pair.from.id).push(pair);
        }
        const score = (chain) => (goal === 'profit' ? chain.profit : (chain.seconds > 0 ? chain.profit / chain.seconds : -Infinity));
        const evalLeg = (pair, money) => {
            out.work += 1;
            const load = loadPair(profile, pair, money, f.maxGoods, null);
            if (!(load.quantity > 0) || !(load.profit > 0)) return null;
            const route = describeRoute(model, profile, s, pair, load);
            if (!route.time.known || (maxLeg !== null && route.seconds > maxLeg)) return null;
            return route;
        };

        let beam = (start ? [start.id] : [...outgoing.keys()]).map((id) => ({ stops: [id], legs: [], profit: 0, seconds: 0, money: s.budget }));
        let best = [];
        search:
        for (let depth = 1; depth < stops; depth += 1) {
            const next = [];
            for (const chain of beam) {
                const last = chain.stops[chain.stops.length - 1];
                for (const pair of outgoing.get(last) || []) {
                    if (chain.stops.includes(pair.to.id)) continue;
                    if (out.work >= maxWork) { out.truncated = true; break search; }
                    const leg = evalLeg(pair, chain.money);
                    if (!leg) continue;
                    next.push({
                        stops: [...chain.stops, pair.to.id], legs: [...chain.legs, leg],
                        profit: round6(chain.profit + leg.profit), seconds: chain.seconds + leg.seconds,
                        money: chain.money === null ? null : round6(chain.money + leg.profit),
                    });
                }
            }
            if (!next.length) break;
            next.sort((a, b) => score(b) - score(a) || a.stops.join(',').localeCompare(b.stops.join(',')));
            beam = next.slice(0, beamWidth);
            best = beam;
        }
        if (!best.length) return out;
        out.shortened = best[0].stops.length < stops;

        const chains = [];
        for (const chain of best) {
            const result = { stops: chain.stops, legs: chain.legs, profit: chain.profit, seconds: chain.seconds, closing: null };
            if (mode === 'roundTrip') {
                const first = model.terminals.get(chain.stops[0]);
                const lastTerminal = model.terminals.get(chain.stops[chain.stops.length - 1]);
                const pair = cand.pairs.get(lastTerminal.id * 1e7 + first.id);
                let closing = null;
                if (pair && out.work < maxWork) closing = evalLeg(pair, chain.money);
                if (!closing) {
                    const time = legTime(model, profile, s.time, lastTerminal, first, null, 0);
                    if (!time.known || (maxLeg !== null && time.seconds > maxLeg)) continue;
                    closing = { from: lastTerminal.id, to: first.id, goods: [], boxes: [], quantity: 0, investment: 0, revenue: 0, profit: 0, empty: true, time, seconds: time.seconds, profitPerHour: 0, assumptions: time.assumptions };
                }
                result.closing = closing;
                result.profit = round6(result.profit + closing.profit);
                result.seconds += closing.seconds;
            }
            result.investment = result.legs.reduce((peak, leg) => Math.max(peak, leg.investment), 0); // 한 번에 가장 많이 묶이는 돈
            result.profitPerHour = result.seconds > 0 ? result.profit / result.seconds * 3600 : null;
            result.assumptions = [...new Set([...result.legs, ...(result.closing ? [result.closing] : [])].flatMap((leg) => leg.assumptions || []))];
            chains.push(result);
        }
        chains.sort((a, b) => score(b) - score(a) || a.stops.join(',').localeCompare(b.stops.join(',')));
        out.chains = chains.slice(0, limit);
        return out;
    }

    // ── 섞어 싣기 ───────────────────────────────────────────────────────────
    /**
     * 정해 둔 화물 + 남는 칸 채우기.
     * plan: { from(터미널), fixed:[{ c, scu }](꼭 실을 상품과 양), fill(남는 칸을 차익 좋은 상품으로 채울지, 기본 true),
     *         to?(판매처를 정했으면), limit(판매처 후보 수, 기본 5) }
     * 판매처를 정하지 않으면 전체 이익이 가장 큰 판매처 한 곳을 고르고 다음 후보도 함께 준다.
     * 정해 둔 상품은 손해가 나도 싣는다(이익이 음수로 나온다). 그 판매처가 받지 않는 상품은 unsold 에 적힌다.
     */
    function planMixedLoad(model, settingsInput, plan, filters) {
        const { s, f, profile } = prepare(model, settingsInput, filters);
        const p = plan || {};
        const from = model.terminals.get(Number(p.from));
        const problem = shipProblem(profile) || (!from ? 'unknown-terminal' : null);
        if (problem) return { ok: false, problem, options: [], ship: publicProfile(profile), settings: s };
        const fixed = (Array.isArray(p.fixed) ? p.fixed : []).filter((item) => item && isNum(Number(item.c)) && Number(item.scu) > 0).map((item) => ({ c: Number(item.c), scu: Math.floor(Number(item.scu)) }));
        const fill = p.fill !== false;
        const limit = clampInt(p.limit, 1, 50, 5);
        const maxFill = Math.max(0, f.maxGoods);
        const freshRow = (row) => ageLevel(row.at, s.maxAgeDays, s.now) === 'ok';
        const buyRows = new Map(from.buys.filter(freshRow).map((row) => [row.c, row]));
        const targets = p.to !== undefined && p.to !== null && p.to !== '' ? [model.terminals.get(Number(p.to))].filter(Boolean)
            : [...model.terminals.values()].filter((terminal) => terminal.id !== from.id && (terminal.live || f.includeNotLive)
                && (!f.system || (terminal.system && f.system.has(terminal.system.toLowerCase()))) && (!f.stationsOnly || terminal.isStation === true));
        const fillCand = fill ? candidates(model, s, { ...f, from: new Set([from.id]), to: null, commodity: null }) : null;

        const options = [];
        for (const to of targets) {
            const sellRows = new Map(to.sells.filter(freshRow).map((row) => [row.c, row]));
            const goods = [];
            const unsold = [];
            for (const item of fixed) {
                const buy = buyRows.get(item.c);
                const sell = sellRows.get(item.c);
                if (!buy) { unsold.push({ c: item.c, why: 'not-sold-here' }); continue; }
                if (!sell) { unsold.push({ c: item.c, why: 'not-bought-there' }); continue; }
                const commodity = buy.commodity;
                goods.push({ commodity, buy: { ...buy, stock: buy.stock === null ? item.scu : Math.min(buy.stock, item.scu), stockReported: buy.stock }, sell, margin: sell.price - buy.price, law: legality(model, commodity, from, to), fixed: true });
            }
            if (fixed.length && !goods.length) continue;
            const fixedIds = new Set(goods.map((good) => good.commodity.id));
            const fillPair = fillCand ? fillCand.pairs.get(from.id * 1e7 + to.id) : null;
            const fillGoods = fillPair ? fillPair.goods.filter((good) => !fixedIds.has(good.commodity.id)).slice(0, maxFill) : [];
            if (!goods.length && !fillGoods.length) continue;
            const load = loadPair(profile, { from, to, goods: [...goods, ...fillGoods] }, s.budget, goods.length + fillGoods.length, null);
            if (!(load.quantity > 0)) continue;
            const route = describeRoute(model, profile, s, { from, to }, load);
            for (const good of route.goods) {
                good.fixed = fixedIds.has(good.c);
                if (good.fixed) {
                    const asked = fixed.find((item) => item.c === good.c).scu;
                    good.requested = asked;
                    good.stockKnown = buyRows.get(good.c).stock !== null;
                    good.caps.stock = buyRows.get(good.c).stock;
                    if (good.limitedBy === 'stock' && (good.caps.stock === null || asked <= good.caps.stock)) good.limitedBy = good.quantity >= asked ? 'requested' : good.limitedBy;
                    if (!good.stockKnown && !route.assumptions.includes('stock.unknown')) route.assumptions.push('stock.unknown');
                }
            }
            route.unsold = unsold;
            options.push(route);
        }
        // 정해 둔 상품을 더 많이 처리하는 곳이 먼저, 그다음 이익.
        options.sort((a, b) => a.unsold.length - b.unsold.length || b.profit - a.profit || tieBreak(a, b));
        return { ok: true, problem: null, options: options.slice(0, limit), total: options.length, ship: publicProfile(profile), settings: s };
    }

    /**
     * 이미 실은 화물을 어디에 팔지. request: { cargo:[{ c, scu, paid?(SCU당 산 값) }], at?(지금 있는 터미널), limit }
     * 돌려주는 것:
     *   single[]  한 곳에서 다 팔 때 판매처 순위 (받지 않는 상품은 unsold). at 을 주면 가는 시간과 시간당 수입도.
     *   perGood[] 상품마다 가장 비싸게 사 주는 곳 목록.
     * 이익은 paid 를 준 상품에만 나온다. 받아 주는 양은 자료에 없어 수량을 줄이지 않는다 (demand.unknown).
     */
    function whereToSell(model, settingsInput, request, filters) {
        const { s, f, profile } = prepare(model, settingsInput, filters);
        const req = request || {};
        const cargoList = (Array.isArray(req.cargo) ? req.cargo : []).filter((item) => item && isNum(Number(item.c)) && Number(item.scu) > 0)
            .map((item) => ({ c: Number(item.c), scu: Number(item.scu), paid: isNum(item.paid) ? item.paid : null }));
        const limit = clampInt(req.limit, 1, 100, 10);
        const here = req.at === undefined || req.at === null || req.at === '' ? null : model.terminals.get(Number(req.at)) || null;
        const canTime = here && profile.exists;
        const stats = { tooOld: 0, ageUnknown: 0 };
        const single = [];
        const perGoodMap = new Map(cargoList.map((item) => [item.c, []]));
        for (const terminal of model.terminals.values()) {
            if (!terminal.live && !f.includeNotLive) continue;
            if (here && terminal.id === here.id) continue;
            if (f.system && !(terminal.system && f.system.has(terminal.system.toLowerCase()))) continue;
            if (f.stationsOnly && terminal.isStation !== true) continue;
            const rows = new Map();
            for (const row of terminal.sells) {
                if (!perGoodMap.has(row.c)) continue;
                const level = ageLevel(row.at, s.maxAgeDays, s.now);
                if (level !== 'ok') { stats[level === 'old' ? 'tooOld' : 'ageUnknown'] += 1; continue; }
                if (f.avoidFull && row.level === 7) continue;
                const law = legality(model, row.commodity, null, terminal);
                if (f.legalOnly && law.legal !== true) continue;
                rows.set(row.c, { row, law });
            }
            if (!rows.size) continue;
            const goods = [];
            const unsold = [];
            let revenue = 0; let profit = 0; let profitKnown = true; let oldestAt = null;
            for (const item of cargoList) {
                const hit = rows.get(item.c);
                if (!hit) { unsold.push(item.c); continue; }
                const income = round6(item.scu * hit.row.price);
                const gain = item.paid === null ? null : round6(income - item.scu * item.paid);
                if (gain === null) profitKnown = false; else profit += gain;
                revenue += income;
                if (oldestAt === null || hit.row.at < oldestAt) oldestAt = hit.row.at;
                const entry = { c: item.c, t: terminal.id, quantity: item.scu, sellPrice: hit.row.price, revenue: income, profit: gain, sellAt: hit.row.at,
                    destination: { takes: hit.row.room, level: hit.row.level, inv: hit.row.inv, full: hit.row.level === 7 }, legal: hit.law.legal, illegal: { to: hit.law.to } };
                goods.push(entry);
                perGoodMap.get(item.c).push(entry);
            }
            const time = canTime ? legTime(model, profile, s.time, here, terminal, null, 0) : null;
            // 출발 + 비행 + 착륙 + 터미널 한 번. 내리는 시간은 넣지 않는다 (실은 상자 구성을 모른다).
            const seconds = time && time.known ? time.seconds + s.time.terminalSeconds : null;
            single.push({
                t: terminal.id, goods, unsold, revenue: round6(revenue), profit: profitKnown && goods.length ? round6(profit) : null,
                seconds, revenuePerHour: seconds ? revenue / seconds * 3600 : null, time, oldestAt,
            });
        }
        single.sort((a, b) => a.unsold.length - b.unsold.length || b.revenue - a.revenue || a.t - b.t);
        const perGood = cargoList.map((item) => ({ c: item.c, scu: item.scu, places: perGoodMap.get(item.c).sort((a, b) => b.sellPrice - a.sellPrice || a.t - b.t).slice(0, limit) }));
        return { ok: true, single: single.slice(0, limit), perGood, stats, assumptions: ['demand.unknown', 'price.static', ...(canTime ? ['time.quantum', 'time.manual'] : [])], settings: s };
    }

    // ── 시세 표 ─────────────────────────────────────────────────────────────
    function rowView(row, s, side) {
        const age = ageSeconds(row.at, s.now);
        const view = { t: row.t, c: row.c, price: row.price, at: row.at, ageSeconds: age, ageLevel: ageLevel(row.at, s.maxAgeDays, s.now), box: row.box, live: row.terminal.live };
        if (side === 'buy') { view.stock = row.stock; view.stockLevel = row.level; view.soldOut = row.stock === 0; } else { view.inv = row.inv; view.level = row.level; view.full = row.level === 7; view.takes = row.room; }
        return view;
    }

    function tableFilter(f) {
        return (row) => (row.terminal.live || f.includeNotLive)
            && (!f.system || (row.terminal.system && f.system.has(row.terminal.system.toLowerCase())))
            && (!f.stationsOnly || row.terminal.isStation === true);
    }

    // 가격이 같으면 더 최근 보고를 앞에 둔다. 보고 시각도 같으면 터미널 id 가 작은 쪽.
    const newerFirst = (row, other) => row.at > other.at || (row.at === other.at && row.t < other.t);

    /**
     * 상품마다: 가장 싼 구매처, 가장 비싼 판매처, 차익. 기준일 안의 보고만 쓴다(품절 보고는 구매처에서 뺀다).
     * 가격이 같은 곳이 여럿이면 가장 최근에 보고된 곳을 고른다.
     * 돌려주는 것: rows[{ c, name, cheapestBuy, bestSell, margin, marginPercent, buyPlaces, sellPlaces, oldBuy, oldSell, legalEverywhere }]
     * sort: 'margin'(기본) | 'marginPercent' | 'name'
     */
    function commoditySummary(model, settingsInput, filters) {
        const s = settings(settingsInput);
        const f = cleanFilters(filters);
        const keep = tableFilter(f);
        const rows = [];
        for (const commodity of model.commodities.values()) {
            if (f.commodity && !f.commodity.has(commodity.id)) continue;
            let cheapest = null; let best = null; let buyPlaces = 0; let sellPlaces = 0; let oldBuy = 0; let oldSell = 0;
            for (const row of commodity.buys) {
                if (!keep(row)) continue;
                if (ageLevel(row.at, s.maxAgeDays, s.now) !== 'ok') { oldBuy += 1; continue; }
                if (row.stock === 0) continue;
                buyPlaces += 1;
                if (!cheapest || row.price < cheapest.price || (row.price === cheapest.price && newerFirst(row, cheapest))) cheapest = row;
            }
            for (const row of commodity.sells) {
                if (!keep(row)) continue;
                if (ageLevel(row.at, s.maxAgeDays, s.now) !== 'ok') { oldSell += 1; continue; }
                sellPlaces += 1;
                if (!best || row.price > best.price || (row.price === best.price && newerFirst(row, best))) best = row;
            }
            if (!buyPlaces && !sellPlaces && !oldBuy && !oldSell) continue;
            const margin = cheapest && best ? round6(best.price - cheapest.price) : null;
            const illegalSomewhere = commodity.game ? Boolean(commodity.game.illegal) : commodity.uexIllegal;
            rows.push({
                c: commodity.id, name: commodity.name, code: commodity.code, group: commodity.group,
                cheapestBuy: cheapest ? rowView(cheapest, s, 'buy') : null, bestSell: best ? rowView(best, s, 'sell') : null,
                margin, marginPercent: margin !== null && cheapest.price > 0 ? margin / cheapest.price * 100 : null,
                buyPlaces, sellPlaces, oldBuy, oldSell,
                legalEverywhere: illegalSomewhere === null ? null : !illegalSomewhere,
            });
        }
        const by = filters && filters.sort;
        if (by === 'name') rows.sort((a, b) => String(a.name?.en || a.c).localeCompare(String(b.name?.en || b.c)));
        else if (by === 'marginPercent') rows.sort((a, b) => (b.marginPercent ?? -Infinity) - (a.marginPercent ?? -Infinity) || a.c - b.c);
        else rows.sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity) || a.c - b.c);
        return { rows, settings: s };
    }

    /** 한 상품: 살 수 있는 곳(싼 순)과 팔 수 있는 곳(비싼 순). 오래된 보고도 ageLevel 을 붙여 함께 준다. */
    function commodityDetail(model, settingsInput, commodityId, filters) {
        const s = settings(settingsInput);
        const f = cleanFilters(filters);
        const commodity = model.commodities.get(Number(commodityId));
        if (!commodity) return { ok: false, problem: 'unknown-commodity', settings: s };
        const keep = tableFilter(f);
        const rank = { ok: 0, old: 1, unknown: 2 };
        const buys = commodity.buys.filter(keep).map((row) => rowView(row, s, 'buy')).sort((a, b) => rank[a.ageLevel] - rank[b.ageLevel] || a.price - b.price || a.t - b.t);
        const sells = commodity.sells.filter(keep).map((row) => rowView(row, s, 'sell')).sort((a, b) => rank[a.ageLevel] - rank[b.ageLevel] || b.price - a.price || a.t - b.t);
        return {
            ok: true, c: commodity.id, name: commodity.name, code: commodity.code, group: commodity.group, gameId: commodity.gameId,
            boxes: commodity.game?.boxes || null, illegal: commodity.game ? commodity.game.illegal || {} : null, uexIllegal: commodity.uexIllegal,
            buys, sells, settings: s,
        };
    }

    /** 한 터미널: 시설(보고된 것), 게임 위치, 살 수 있는 것·팔 수 있는 것. */
    function terminalSheet(model, settingsInput, terminalId) {
        const s = settings(settingsInput);
        const terminal = model.terminals.get(Number(terminalId));
        if (!terminal) return { ok: false, problem: 'unknown-terminal', settings: s };
        const named = (row, side) => ({ ...rowView(row, s, side), name: row.commodity.name, legal: legality(model, row.commodity, terminal, null).legal, illegal: lawCode(model, row.commodity.game, terminal.law) });
        return {
            ok: true, terminal: publicTerminal(terminal),
            buys: terminal.buys.map((row) => named(row, 'buy')).sort((a, b) => a.price - b.price || a.c - b.c),
            sells: terminal.sells.map((row) => named(row, 'sell')).sort((a, b) => b.price - a.price || a.c - b.c),
            settings: s,
        };
    }

    function publicTerminal(terminal) {
        return {
            id: terminal.id, code: terminal.code, name: terminal.name, uexName: terminal.uexName, live: terminal.live, system: terminal.system,
            place: terminal.place, planet: terminal.planet, moon: terminal.moon, faction: terminal.faction, flags: { ...terminal.flags }, maxBox: terminal.maxBox,
            locationId: terminal.locationId, amenities: terminal.amenities ? terminal.amenities.slice() : null, pad: terminal.pad, hangar: terminal.hangar,
            law: terminal.law, surface: terminal.surface, isStation: terminal.isStation, bodyId: terminal.bodyId, hasPosition: Boolean(terminal.position),
            buyCount: terminal.buys.length, sellCount: terminal.sells.length,
        };
    }

    /** 터미널 목록 (화면의 선택 상자·거래소 목록용). */
    function listTerminals(model, filters) {
        const f = cleanFilters(filters);
        return [...model.terminals.values()].filter((terminal) => (terminal.live || f.includeNotLive)
            && (!f.system || (terminal.system && f.system.has(terminal.system.toLowerCase()))) && (!f.stationsOnly || terminal.isStation === true)).map(publicTerminal);
    }

    /** 화물칸 값이 있는 함선 목록: [{ id, scu, ground, hasDrive }] (scu 0 포함, 모르는 함선은 scu:null). */
    function listShips(model) {
        return [...model.ships.values()].map((ship) => ({ id: ship.id, scu: isNum(ship.scu) ? ship.scu : null, ground: ship.k === 'g', hasDrive: Boolean(ship.qd && model.drives[ship.qd]), deck: ship.deck === 1 }));
    }

    // ── 내 돈에 맞는 화물선 ──────────────────────────────────────────────────
    /**
     * options: money(가진 돈, 없으면 settings.budget) · mode('buy'|'rent'|'both', 기본 'both') · ships(id 목록, 나눠서 계산할 때) ·
     *          limit(기본 20) · maxShips(한 번에 계산할 구매·대여 건수 상한, 기본 40 — 넘으면 skipped 로 알리고, 화면은 ships 로 나눠 다시 부르면 된다) + rankRoutes 필터.
     * 함선마다 가장 싼 구매가(또는 대여가)를 내고 남는 돈으로 지금 시세에서 가장 좋은 경로를 찾는다.
     *   moneyLeft        함선 값을 내고 남는 돈
     *   bestRoute        남는 돈으로 한 번 돌 때 가장 좋은 경로 (rankRoutes 결과 1개, 없으면 null)
     *   noLimitRoute     돈 걱정이 없을 때 가장 좋은 경로 하나의 { quantity, investment, full } (없으면 null).
     *                    "화물칸을 가득 채우는 값"이 아니다: 그 경로의 재고·상자 때문에 화물칸보다 적게 실릴 수 있다 (full 로 알린다).
     *   canAffordNoLimitRoute  moneyLeft 가 noLimitRoute.investment 이상인지
     *   runsToPayBack    함선 값 ÷ 한 번 이익 (올림)
     *   hoursToPayBack   runsToPayBack × 그 경로 한 번(가는 길만)에 걸리는 시간. 돌아오는 시간은 넣지 않았다 (payback.oneWay).
     *                    한 번 도는 시간보다 짧게 나오지 않는다.
     * 가정: 같은 경로를 같은 가격·재고로 되풀이한다 (payback.repeat). 대여 기간은 자료에 없다 (rent.period).
     * 가격이 없는 함선과 화물칸을 모르는 함선은 noPrice / unknownCargo 로 따로 알린다.
     */
    function shipsForBudget(model, settingsInput, options) {
        const o = options && typeof options === 'object' ? options : {};
        const base = settings(settingsInput);
        const money = isNum(o.money) && o.money >= 0 ? o.money : base.budget;
        const mode = ['buy', 'rent', 'both'].includes(o.mode) ? o.mode : 'both';
        const limit = clampInt(o.limit, 1, 300, 20);
        const maxShips = clampInt(o.maxShips, 1, 400, 40);
        const out = { ok: money !== null, problem: money === null ? 'no-money' : null, rows: [], noPrice: [], unknownCargo: [], tooExpensive: 0, skipped: 0, money, settings: base, assumptions: ['payback.repeat', 'payback.oneWay', 'price.static', 'rent.period'] };
        if (money === null) return out;
        const ids = Array.isArray(o.ships) && o.ships.length ? o.ships : [...model.ships.keys()];
        const f = cleanFilters({ ...o, limit: 1, sort: 'perHour', returnTrip: false });
        const bestFor = (id, budget) => {
            const s = settings({ ...base, ship: id, capacityScu: null, budget });
            const profile = shipProfile(model, s);
            return { profile, route: shipProblem(profile) ? null : bestRoute(model, profile, s, f) };
        };
        const offers = [];
        for (const id of ids) {
            const ship = model.ships.get(id);
            if (!ship) continue;
            if (!isNum(ship.scu)) { out.unknownCargo.push(id); continue; }
            if (!(ship.scu > 0)) continue;
            const prices = model.vehicles.get(id);
            if (!prices) { out.noPrice.push(id); continue; }
            for (const kind of ['buy', 'rent']) {
                if (mode !== 'both' && mode !== kind) continue;
                const cheapest = prices[kind].filter((offer) => offer && isNum(offer.price) && offer.price > 0).sort((a, b) => a.price - b.price || a.t - b.t)[0];
                if (!cheapest) continue;
                if (cheapest.price > money) { out.tooExpensive += 1; continue; }
                offers.push({ id, kind, offer: cheapest, name: prices.name, matchedBy: prices.matchedBy });
            }
        }
        // 화물칸이 큰 함선부터 본다. 상한을 넘는 것은 건너뛰고 skipped 로 알린다.
        offers.sort((a, b) => model.ships.get(b.id).scu - model.ships.get(a.id).scu || (a.id < b.id ? -1 : 1));
        out.skipped = Math.max(0, offers.length - maxShips);
        const free = new Map();
        for (const item of offers.slice(0, maxShips)) {
            const moneyLeft = round6(money - item.offer.price);
            const run = bestFor(item.id, moneyLeft);
            if (!free.has(item.id)) free.set(item.id, bestFor(item.id, null).route);
            const best = run.route;
            const full = free.get(item.id);
            const shop = model.vehicleTerminals[item.offer.t] || null;
            const runs = best && best.profit > 0 ? Math.ceil(item.offer.price / best.profit) : null;
            out.rows.push({
                ship: item.id, uexName: item.name, matchedBy: item.matchedBy, kind: item.kind, price: item.offer.price, priceAt: numOrNull(item.offer.at),
                shop: shop ? { t: item.offer.t, name: shop.name || null, place: shop.place || null, system: shop.system || null } : { t: item.offer.t, name: null, place: null, system: null },
                capacity: run.profile.capacity, moneyLeft,
                bestRoute: best,
                noLimitRoute: full ? { quantity: full.quantity, investment: full.investment, full: full.full } : null,
                canAffordNoLimitRoute: full ? moneyLeft >= full.investment : null,
                profitPerRun: best ? best.profit : null,
                profitPerHour: best ? best.profitPerHour : null,
                runsToPayBack: runs,
                hoursToPayBack: runs !== null && best.time.known && best.seconds > 0 ? runs * best.seconds / 3600 : null,
                rentPeriod: null, // 자료에 없음
            });
        }
        out.rows.sort((a, b) => (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity) || (b.profitPerRun ?? -Infinity) - (a.profitPerRun ?? -Infinity) || (a.ship < b.ship ? -1 : 1));
        out.total = out.rows.length;
        out.rows = out.rows.slice(0, limit);
        return out;
    }

    // ── 여러 화면이 함께 쓰는 선택값 ──────────────────────────────────────────
    // 저장 키는 하나(volt-helper-state-v1), 모양에 v 를 넣어 둔다. 기본값과 뜻은 docs/trade-engine.md, docs/helper-tools.md 5절.
    const DEFAULTS = Object.freeze({
        v: 1,
        ship: null,       // 내 함선: data/trade/cargo.json 의 ships[].id, 없으면 null
        budget: null,     // 쓸 수 있는 돈(aUEC), 정하지 않았으면 null (0 이 아니다)
        system: null,     // 지금 있는 항성계 이름(예: 'Stanton'), 정하지 않았으면 null
        maxAgeDays: 3,    // 가격 보고를 며칠 전 것까지 쓸지 (소유자 결정 2026-11-19: 기본 3일)
        time: Object.freeze({}), // 플레이어가 바꾼 시간 값만 (TIME_DEFAULTS 의 키). 비어 있으면 전부 기본값
        boxes: null,      // 쓸 상자 크기 목록(예: [8,16,24,32]), null = 전부
    });

    const listeners = new Set();
    let current = null;

    function storage() {
        try {
            return root && root.localStorage ? root.localStorage : null;
        } catch (_error) {
            return null; // 저장소를 막아 둔 브라우저
        }
    }

    function clean(raw) {
        const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const next = { ...DEFAULTS, ...source, v: 1 };
        next.ship = typeof next.ship === 'string' && next.ship ? next.ship : null;
        next.budget = Number.isFinite(next.budget) && next.budget >= 0 ? next.budget : null;
        next.system = typeof next.system === 'string' && next.system ? next.system : null;
        next.maxAgeDays = Number.isFinite(next.maxAgeDays) && next.maxAgeDays > 0 ? next.maxAgeDays : DEFAULTS.maxAgeDays;
        next.time = cleanTime(next.time);
        next.boxes = cleanBoxes(next.boxes);
        return next;
    }

    function read() {
        try {
            const store = storage();
            return clean(store ? JSON.parse(store.getItem(STATE_KEY) || 'null') : null);
        } catch (_error) {
            return clean(null); // 저장소를 못 쓰는 브라우저에서는 이번 방문 동안만 기억한다.
        }
    }

    function get() {
        if (!current) current = read();
        return { ...current, time: { ...current.time }, boxes: current.boxes ? current.boxes.slice() : null };
    }

    function notify() {
        const snapshot = get();
        listeners.forEach((listener) => {
            try {
                listener(snapshot);
            } catch (error) {
                console.error('[trade-engine] state listener failed', error);
            }
        });
    }

    function set(patch) {
        current = clean({ ...get(), ...(patch && typeof patch === 'object' ? patch : {}) });
        try {
            const store = storage();
            if (store) store.setItem(STATE_KEY, JSON.stringify(current));
        } catch (_error) { /* 저장 실패는 화면을 막지 않는다 */ }
        notify();
        return get();
    }

    function reset() {
        current = clean(null);
        try {
            const store = storage();
            if (store) store.removeItem(STATE_KEY);
        } catch (_error) { /* 위와 같음 */ }
        notify();
        return get();
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    // 다른 탭에서 바꾼 값도 따라간다 (브라우저에서만).
    if (root && typeof root.addEventListener === 'function') {
        root.addEventListener('storage', (event) => {
            if (event.key !== STATE_KEY) return;
            current = read();
            notify();
        });
    }

    return {
        VERSION, STATE_KEY, STANDARD_BOXES: STANDARD_BOXES.slice(), TIME_DEFAULTS, ASSUMPTIONS,
        state: { get, set, reset, subscribe, defaults: DEFAULTS },
        settings, timeSettings, ageSeconds, ageLevel,
        travel: { STATUS: TRAVEL_MODEL_STATUS, trapezoidSeconds, quantumTravel, distanceMeters },
        buildModel, shipProfile: (model, settingsInput) => publicProfile(shipProfile(model, settingsInput)),
        splitBoxes: (model, settingsInput, scu, sizes) => splitBoxes(shipProfile(model, settingsInput), scu, sizes),
        travelBetween, legality: (model, commodityId, fromId, toId) => {
            const commodity = model.commodities.get(Number(commodityId));
            return commodity ? legality(model, commodity, model.terminals.get(Number(fromId)) || null, model.terminals.get(Number(toId)) || null) : { legal: null, from: null, to: null, source: null };
        },
        rankRoutes, evaluateRoute, compareShips, nextLegs, findChains, planMixedLoad, whereToSell,
        commoditySummary, commodityDetail, terminalSheet, listTerminals, listShips, shipsForBudget,
    };
});
