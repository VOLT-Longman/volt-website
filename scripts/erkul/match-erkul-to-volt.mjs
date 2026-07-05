import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const VOLT_DATA_PATH = resolve(ROOT, 'data/volt-data.js');
const SHIPS_NORMALIZED_PATH = resolve(ROOT, 'data/external/erkul/ships-normalized.json');
const MARKET_PATH = resolve(ROOT, 'data/external/erkul/ship-market-normalized.json');
const MARKET_REPORT_PATH = resolve(ROOT, 'data/external/erkul/market-report.json');
const MANUAL_MAP_PATH = resolve(ROOT, 'data/external/erkul/manual-ship-map.json');
const REPORT_JSON_PATH = resolve(ROOT, 'data/external/erkul/ship-match-report.json');
const REPORT_MD_PATH = resolve(ROOT, 'docs/shipdb-erkul-matching.md');

// VOLT manufacturer 표기 → Erkul manufacturerData.nameSmall 코드 (명시적 사전 — fuzzy 금지)
const MANUFACTURER_CODES = {
    RSI: ['RSI'],
    Origin: ['ORIG'],
    Anvil: ['ANVL'],
    MISC: ['MISC'],
    Drake: ['DRAK'],
    Aegis: ['AEGS'],
    Vanduul: ['VNCL'],
    Kruger: ['KRIG'],
    CNOU: ['CNOU'],
    Aopoa: ['XIAN', 'XNAA'],
    Banu: ['BANU'],
    Crusader: ['CRUS'],
    Esperia: ['ESPR'],
    ARGO: ['ARGO'],
    Mirai: ['MRAI'],
    Tumbril: ['TMBL'],
    'Greycat Industrial': ['GRIN'],
    Gatac: ['GAMA'],
    "Grey's Market": ['GREY']
};

// eval 금지 — 기존 normalize-ship-database.mjs와 동일한 VM sandbox 방식
function loadVoltData(source) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source};this.VOLT_DATA=VOLT_DATA;`, context);
    return context.VOLT_DATA;
}

// 공백 정리 + 소문자 (exact name 비교용 — "Aurora Mk I  LX" 같은 이중 공백 흡수)
const lightNorm = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
// 영숫자만 남기는 보조 정규화 (manufacturerName 단계에서만 사용)
const hardNorm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

async function main() {
    const voltData = loadVoltData(await readFile(VOLT_DATA_PATH, 'utf8'));
    const erkul = JSON.parse(await readFile(SHIPS_NORMALIZED_PATH, 'utf8'));
    const market = JSON.parse(await readFile(MARKET_PATH, 'utf8'));
    const marketReport = JSON.parse(await readFile(MARKET_REPORT_PATH, 'utf8'));
    const manualMap = JSON.parse(await readFile(MANUAL_MAP_PATH, 'utf8'));

    const voltShips = voltData.ships;
    // 에디션/번들 변형(canonicalId 보유)은 원본 함선으로 귀결되므로 매칭 풀에서 제외
    const voltVariants = voltShips.filter((s) => s.erkulStatus === 'duplicate' && s.canonicalId);
    const voltPool = voltShips.filter((s) => !(s.erkulStatus === 'duplicate' && s.canonicalId));

    const erkulByLocal = new Map(erkul.ships.map((s) => [s.localName, s]));
    const erkulByLightName = new Map();
    for (const s of erkul.ships) {
        const key = lightNorm(s.name);
        if (key) erkulByLightName.set(key, s); // A-4 검증: Erkul name 중복 없음(219척 전수)
    }
    const erkulByMfrHardName = new Map();
    for (const s of erkul.ships) {
        const code = s.externalStats?.manufacturer ? null : null;
        void code;
    }
    // manufacturerName 단계용 인덱스: `CODE|hardNorm(name)`
    const rawMfrSmall = new Map(); // localName → nameSmall
    {
        // ships-normalized에는 manufacturer 풀네임만 있으므로 nameSmall은 풀네임 → 코드 역표로 만든다
        const fullToCode = {
            'Roberts Space Industries': 'RSI',
            'Origin Jumpworks': 'ORIG',
            'Anvil Aerospace': 'ANVL',
            'Musashi Industrial & Starflight Concern': 'MISC',
            'Drake Interplanetary': 'DRAK',
            'Aegis Dynamics': 'AEGS',
            Vanduul: 'VNCL',
            'Kruger Intergalactic': 'KRIG',
            'Consolidated Outland': 'CNOU',
            Aopoa: 'XIAN', // XNAA도 Aopoa — 코드 비교는 MANUFACTURER_CODES 배열로 흡수
            Banu: 'BANU',
            'Crusader Industries': 'CRUS',
            Esperia: 'ESPR',
            'Argo Astronautics': 'ARGO',
            Mirai: 'MRAI',
            'Tumbril Land Systems': 'TMBL',
            'Greycat Industrial': 'GRIN',
            'Gatac Manufacture': 'GAMA',
            "Grey's Market": 'GREY'
        };
        for (const s of erkul.ships) {
            const code = fullToCode[s.externalStats?.manufacturer] ?? null;
            rawMfrSmall.set(s.localName, code);
            if (code) {
                const key = `${code}|${hardNorm(s.name)}`;
                if (!erkulByMfrHardName.has(key)) erkulByMfrHardName.set(key, s);
            }
        }
    }

    const claimedErkul = new Map(); // erkulLocalName → voltId
    const matched = [];
    const conflicts = [];

    const marketShip = (localName) => market.ships?.[localName] ?? null;
    const recordMatch = (volt, erkulShip, method) => {
        if (claimedErkul.has(erkulShip.localName)) {
            conflicts.push({
                type: 'erkul-claimed-twice',
                erkulLocalName: erkulShip.localName,
                firstVoltId: claimedErkul.get(erkulShip.localName),
                secondVoltId: volt.id,
                method
            });
            return false;
        }
        const m = marketShip(erkulShip.localName);
        const stats = erkulShip.externalStats ?? {};
        matched.push({
            voltId: volt.id,
            voltName: volt.name,
            erkulLocalName: erkulShip.localName,
            erkulName: erkulShip.name,
            method,
            hasStats: [stats.hp, stats.massKg, stats.cargoScu, stats.speeds?.scm].some((v) => v !== null && v !== undefined),
            hasPurchase: Boolean(m && m.purchase.length > 0),
            hasRentals: Boolean(m && m.rentals.length > 0)
        });
        claimedErkul.set(erkulShip.localName, volt.id);
        return true;
    };

    const unresolved = [];
    for (const volt of voltPool) {
        // 1) manual map (voltId ← erkulLocalName 역방향 조회)
        const manualEntry = Object.entries(manualMap.mappings ?? {}).find(([, voltId]) => voltId === volt.id);
        if (manualEntry) {
            const erkulShip = erkulByLocal.get(manualEntry[0]);
            if (erkulShip) {
                recordMatch(volt, erkulShip, 'manual');
                continue;
            }
            conflicts.push({ type: 'manual-map-target-missing', erkulLocalName: manualEntry[0], voltId: volt.id });
        }
        // 2) exact localName ↔ VOLT id/slug (형식이 달라 기대 매칭 0건 — 향후 VOLT에 localName 필드가 생기면 유효)
        const byLocal = erkulByLocal.get(volt.id) ?? (volt.canonicalId ? erkulByLocal.get(volt.canonicalId) : null);
        if (byLocal) {
            recordMatch(volt, byLocal, 'localName');
            continue;
        }
        // 3) exact English name — VOLT가 보관한 Erkul 원어명(erkulName) 우선, 그다음 VOLT 표기명
        const byErkulName = erkulByLightName.get(lightNorm(volt.erkulName));
        if (byErkulName) {
            recordMatch(volt, byErkulName, 'name');
            continue;
        }
        const byVoltName = erkulByLightName.get(lightNorm(volt.name));
        if (byVoltName) {
            recordMatch(volt, byVoltName, 'name');
            continue;
        }
        // 4) manufacturer 코드 일치 + hard-normalized name 일치
        const codes = MANUFACTURER_CODES[volt.manufacturer] ?? [];
        let found = null;
        for (const code of codes) {
            found = erkulByMfrHardName.get(`${code}|${hardNorm(volt.erkulName || volt.name)}`) ?? erkulByMfrHardName.get(`${code}|${hardNorm(volt.name)}`);
            if (found) break;
        }
        if (found) {
            recordMatch(volt, found, 'manufacturerName');
            continue;
        }
        unresolved.push(volt);
    }

    const unmatchedVolt = unresolved.map((s) => ({
        voltId: s.id,
        voltName: s.name,
        manufacturer: s.manufacturer,
        implemented: s.implemented ?? null,
        erkulStatus: s.erkulStatus ?? null,
        erkulName: s.erkulName ?? null
    }));
    // 이전 파이프라인에서 matched였는데 이번 live 매칭에 실패한 함선 = 수동 확인 필요
    const manualRequired = unmatchedVolt.filter((s) => s.erkulStatus === 'matched');
    const unmatchedErkul = erkul.ships
        .filter((s) => !claimedErkul.has(s.localName))
        .map((s) => ({ localName: s.localName, name: s.name, manufacturer: s.externalStats?.manufacturer ?? null }));

    const marketOnlyUnmatched = (marketReport.unmatchedShipLikeRows ?? []).map((u) => ({
        erkulLocalName: u.localName,
        rows: u.rows,
        sampleShop: u.sampleShop,
        inManualCandidates: (manualMap.candidates ?? []).some((c) => c.erkulLocalName === u.localName)
    }));

    const summary = {
        matchedWithStats: matched.filter((m) => m.hasStats).length,
        matchedWithPurchase: matched.filter((m) => m.hasPurchase).length,
        matchedWithRentals: matched.filter((m) => m.hasRentals).length,
        matchedWithoutMarket: matched.filter((m) => !m.hasPurchase && !m.hasRentals).length
    };
    const methodCounts = {};
    for (const m of matched) methodCounts[m.method] = (methodCounts[m.method] ?? 0) + 1;

    const report = {
        generatedAt: erkul.syncedAt, // 데이터 기준 시각(fetch 시각)으로 고정 — 재실행 시 diff 안정성 유지
        voltShipCount: voltShips.length,
        voltMatchPoolCount: voltPool.length,
        voltVariantCount: voltVariants.length,
        erkulShipCount: erkul.ships.length,
        marketShipCount: Object.keys(market.ships ?? {}).length,
        matchedCount: matched.length,
        matchRate: `${((matched.length / voltPool.length) * 100).toFixed(1)}% (matched/voltMatchPool)`,
        methodCounts,
        matched,
        unmatchedVolt,
        unmatchedErkul,
        manualRequired,
        marketOnlyUnmatched,
        voltVariants: voltVariants.map((s) => ({ voltId: s.id, canonicalId: s.canonicalId })),
        conflicts,
        summary
    };

    await writeFile(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(REPORT_MD_PATH, renderMarkdown(report), 'utf8');

    console.log(`VOLT ships: ${report.voltShipCount} (매칭 풀 ${report.voltMatchPoolCount} + 에디션 변형 ${report.voltVariantCount})`);
    console.log(`Erkul ships: ${report.erkulShipCount} | market ships: ${report.marketShipCount}`);
    console.log(`matched: ${report.matchedCount} (${report.matchRate}) | methods: ${JSON.stringify(methodCounts)}`);
    console.log(`unmatched VOLT: ${unmatchedVolt.length} (manual required: ${manualRequired.length}) | unmatched Erkul: ${unmatchedErkul.length}`);
    console.log(`market-only unmatched: ${marketOnlyUnmatched.length} | conflicts: ${conflicts.length}`);
    console.log(`저장: ${REPORT_JSON_PATH}`);
}

function renderMarkdown(report) {
    const lines = [
        '# ShipDB 2.0 — Erkul ↔ VOLT 함선 매칭 리포트 (A-4)',
        '',
        '재현: `npm run shipdb:erkul:match` (입력: ships-normalized / ship-market-normalized / manual-ship-map / volt-data.js)',
        '',
        '## 요약',
        '',
        `- VOLT ships: **${report.voltShipCount}** (매칭 풀 ${report.voltMatchPoolCount}, 에디션/번들 변형 ${report.voltVariantCount}는 canonicalId로 원본에 귀결)`,
        `- Erkul ships: **${report.erkulShipCount}** / market 보유 함선: ${report.marketShipCount}`,
        `- matched: **${report.matchedCount}** — 매칭률 **${report.matchRate}**`,
        `- unmatched VOLT: ${report.unmatchedVolt.length} / unmatched Erkul: ${report.unmatchedErkul.length} / conflicts: ${report.conflicts.length}`,
        '',
        '## method별 매칭',
        '',
        ...Object.entries(report.methodCounts).map(([m, c]) => `- ${m}: ${c}`),
        '',
        '매칭 우선순위: manual → localName(exact) → name(exact, VOLT 보관 erkulName 우선) → manufacturer+normalized name.',
        'fuzzy/Levenshtein/한글명/variant 추정 매칭은 사용하지 않는다.',
        '',
        '## market 연결',
        '',
        `- 구매처 있는 매칭 함선: **${report.summary.matchedWithPurchase}**`,
        `- 렌탈처 있는 매칭 함선: ${report.summary.matchedWithRentals}`,
        `- 시장 정보 없는 매칭 함선: ${report.summary.matchedWithoutMarket} (인게임 비판매)`,
        `- 스펙 보유 매칭 함선: ${report.summary.matchedWithStats}`,
        '',
        '## VOLT-only (Erkul live에 없음)',
        '',
        `총 ${report.unmatchedVolt.length}척. 이 중 이전 파이프라인에서 matched였던 **manual 확인 필요 ${report.manualRequired.length}척**:`,
        '',
        ...report.manualRequired.map((s) => `- \`${s.voltId}\` (${s.voltName}, ${s.manufacturer}) — 구 erkulName: ${s.erkulName ?? 'null'}`),
        '',
        `나머지 ${report.unmatchedVolt.length - report.manualRequired.length}척은 erkulStatus=unreleased(컨셉/미출시) 계열:`,
        '',
        report.unmatchedVolt.filter((s) => s.erkulStatus !== 'matched').map((s) => `\`${s.voltId}\``).join(', ') || '(없음)',
        '',
        '## Erkul-only (VOLT DB에 없음)',
        '',
        `총 ${report.unmatchedErkul.length}척:`,
        '',
        report.unmatchedErkul.map((s) => `\`${s.localName}\``).join(', ') || '(없음)',
        '',
        '## market-only unmatched (A-3 이월 — 상점에는 있으나 Erkul ships 목록에 없는 선체)',
        '',
        ...report.marketOnlyUnmatched.map((u) => `- \`${u.erkulLocalName}\` (${u.rows}행, 예: ${u.sampleShop}) — manual-ship-map candidates 기록: ${u.inManualCandidates ? '✅' : '❌ 누락'}`),
        '',
        '## conflicts / 애매함',
        '',
        report.conflicts.length
            ? report.conflicts.map((c) => `- ${JSON.stringify(c)}`).join('\n')
            : '- 없음',
        '',
        '## manual map 운영 원칙',
        '',
        '- `manual-ship-map.json`의 `mappings`는 운영자가 확정한 항목만 넣는다 (추정 매핑 금지).',
        '- `candidates`는 자동 매핑하지 않으며, 확정 시 `mappings`로 승격한다.',
        '- 구형 Aurora 5종 + `aegs_hammerhead`는 A-4에서 자동 매칭하지 않았다 (Erkul ships 목록 부재 — 매핑 확정은 운영자 결정).',
        ''
    ];
    return lines.join('\n');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
