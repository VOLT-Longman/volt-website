import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const DATA_PATH = new URL('../data/volt-data.js', import.meta.url);
const SOURCE_PATH = new URL('../data/rsi-ship-matrix-index.json', import.meta.url);
const SECTION_START = '    ships: [';
const SECTION_END = '\n\n    // ===== FAQ =====';

const ALIASES = {
    'Zeus Mk II CL': 'Zeus MK2 CL',
    'Zeus Mk II ES': 'Zeus MK2 ES',
    'Zeus Mk II MR': 'Zeus MK2 MR',
    'Aurora Mk I CL': 'Aurora CL',
    'Aurora Mk I ES': 'Aurora ES',
    'Aurora Mk I LN': 'Aurora LN',
    'Aurora Mk I LX': 'Aurora LX',
    'Aurora Mk I SE': 'Aurora Mk1 SE',
    'Aurora Mk II': 'Aurora MK2',
    'Aurora Mk I MR': 'Aurora MR'
};

const MANUFACTURERS = {
    AEGS: 'Aegis', ANVL: 'Anvil', ARGO: 'ARGO', BANU: 'Banu', CNOU: 'CNOU',
    CRUS: 'Crusader', DRAK: 'Drake', ESPR: 'Esperia', GAMA: 'Gatac',
    GREY: 'Greycat', GRIN: 'Greycat Industrial', KRIG: 'Kruger', MISC: 'MISC',
    MRAI: 'Mirai', ORIG: 'Origin', RSI: 'RSI', TMBL: 'Tumbril',
    VNCL: 'Vanduul', XNAA: 'Aopoa'
};

const SIZES = {
    snub: '초소형',
    vehicle: '지상',
    small: '소형',
    medium: '중형',
    large: '대형',
    capital: '캐피탈'
};

function loadVoltData(source) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source};this.VOLT_DATA=VOLT_DATA;`, context);
    return context.VOLT_DATA;
}

function getCategory(focus = '') {
    const value = focus.toLowerCase();
    if (/salvage|recovery/.test(value)) return ['인양선', '인양'];
    if (/mining|prospecting/.test(value)) return ['채굴선', '채굴'];
    if (/refinery|refining/.test(value)) return ['정제선', '정제'];
    if (/refuelling|refuel/.test(value)) return ['주유선', '주유'];
    if (/medical|ambulance/.test(value)) return ['의료선', '의료'];
    if (/science/.test(value)) return ['연구선', '연구'];
    if (/exploration|expedition|pathfinder|recon/.test(value)) return ['탐사선', '탐사'];
    if (/freight|cargo|hauler|loader/.test(value)) return ['화물선', '화물'];
    if (/fighter|combat|gun ?ship|bomber|interdict|assault|patrol|corvette|frigate|destroyer|anti-air|minelayer|stealth/.test(value)) return ['전투함', '전투'];
    if (/dropship|transport|passenger|boarding/.test(value)) return ['수송선', '수송'];
    if (/reporting/.test(value)) return ['방송선', '방송'];
    if (/racing/.test(value)) return ['레이싱', '레이싱'];
    if (/repair|construction/.test(value)) return ['지원선', '지원'];
    if (/luxury|touring/.test(value)) return ['투어링', '수송'];
    if (/starter/.test(value)) return ['입문선', '입문'];
    if (/carrier/.test(value)) return ['항모', '기함'];
    return ['다목적함', '다목적'];
}

function buildGeneratedShip(ship) {
    const [role, focus] = getCategory(ship.focus);
    const size = SIZES[ship.size] || '정보 없음';
    return {
        id: slugify(ship.name),
        name: ship.name,
        manufacturer: MANUFACTURERS[ship.manufacturer?.code] || ship.manufacturer?.code || 'Unknown',
        rsiUrl: `https://robertsspaceindustries.com${ship.url}`,
        role,
        focus,
        size,
        crew: getCrew(ship.min_crew, ship.max_crew),
        cargo: `${ship.cargocapacity || 0} SCU`,
        description: getDescription(ship, role, focus, size),
        tags: getTags(ship, focus)
    };
}

function getTags(ship, focus) {
    const tags = new Set([focus]);
    const value = ship.focus.toLowerCase();
    if (/starter/.test(value)) tags.add('입문');
    if (ship.production_status === 'in-concept') tags.add('미구현');
    if (/carrier|corvette|frigate|destroyer/.test(value) || ship.size === 'capital') tags.add('기함');
    return [...tags];
}

function getCrew(min, max) {
    if (!min && !max) return '정보 없음';
    return min === max ? `${min}명` : `${min}-${max}명`;
}

function getDescription(ship, role, focus, size) {
    const prefix = ship.production_status === 'in-concept' ? '미구현, ' : '';
    const noun = ship.size === 'vehicle' ? '차량' : '함선';
    const detail = {
        '화물': '화물 운송 임무에 특화된',
        '탐사': '장거리 탐사와 정보 수집 임무에 적합한',
        '인양': '난파선 회수와 자원 수집 임무에 특화된',
        '채굴': '자원 채굴 임무에 특화된',
        '정제': '원광 정제 임무에 특화된',
        '주유': '연료 보급 임무를 담당하는',
        '의료': '치료와 구조 임무에 특화된',
        '연구': '과학·연구 임무에 특화된',
        '전투': '전투 임무에 특화된',
        '수송': '인원 또는 물자 수송 임무에 적합한',
        '방송': '방송·중계 임무용',
        '레이싱': '속도 경쟁에 특화된',
        '지원': '함대 지원 임무에 특화된',
        '입문': '입문자가 다루기 쉬운',
        '기함': '대규모 함대 운용을 전제로 한',
        '다목적': '여러 임무에 유연하게 대응할 수 있는'
    }[focus] || '운용 목적이 분명한';
    return `${prefix}${size} ${role}. ${detail} ${noun}.`;
}

function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stringifyShips(ships) {
    return `${SECTION_START}\n${ships.map((ship) => `        ${JSON.stringify(ship)},`).join('\n')}\n    ],`;
}

async function main() {
    const source = await readFile(DATA_PATH, 'utf8');
    const officialSource = (await readFile(SOURCE_PATH, 'utf8')).replace(/^\uFEFF/, '');
    const official = JSON.parse(officialSource).data;
    const voltData = loadVoltData(source);
    const existing = new Map(voltData.ships.map((ship) => [ship.name, ship]));
    const ships = official.map((ship) => {
        const override = existing.get(ALIASES[ship.name] || ship.name);
        return override ? { ...override, rsiUrl: `https://robertsspaceindustries.com${ship.url}` } : buildGeneratedShip(ship);
    });
    const start = source.indexOf(SECTION_START);
    const end = source.indexOf(SECTION_END, start);
    if (start < 0 || end < 0) throw new Error('Ships section markers were not found.');
    await writeFile(DATA_PATH, `${source.slice(0, start)}${stringifyShips(ships)}${source.slice(end)}`, 'utf8');
    console.log(`Built ${ships.length} ships.`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
