import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const DATA_PATH = new URL('../data/volt-data.js', import.meta.url);
const SECTION_START = '    ships: [';
const SECTION_END = '\n\n    // ===== FAQ =====';

const LEGACY_TAGS = new Set([
    '무역', '물류', '단종', '호위', '전투기', '장거리', '대형', '지상', '함재기',
    '인원 수송', '정보', '자원', '중계', '과학', '소형', '함대', '퀀텀',
    '차단', '대함', '심우주', '산업', '차량 운송', '모듈형'
]);

function loadVoltData(source) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source};this.VOLT_DATA=VOLT_DATA;`, context);
    return context.VOLT_DATA;
}

function isGeneratedDescription(description) {
    return / 함선\.$| 차량\.$/.test(description)
        && /^(미구현, )?(초소형|지상|소형|중형|대형|캐피탈) /.test(description);
}

function refineDescription(ship) {
    const prefix = ship.tags.includes('미구현') ? '미구현. ' : '';
    const size = ship.size === '지상' ? '지상' : ship.size;
    const templates = {
        '화물': `${prefix}${size}급 화물선. 화물 운송과 보급 임무에 맞춘 ${ship.manufacturer} 함선.`,
        '탐사': `${prefix}${size}급 탐사선. 장거리 항행과 정보 수집 임무에 적합한 ${ship.manufacturer} 함선.`,
        '인양': `${prefix}${size}급 인양선. 난파선 회수와 자원 수집에 특화된 ${ship.manufacturer} 함선.`,
        '채굴': `${prefix}${size}급 채굴선. 자원 채굴 임무를 위해 설계된 ${ship.manufacturer} 함선.`,
        '정제': `${prefix}${size}급 정제선. 채굴 자원을 현장에서 처리하는 ${ship.manufacturer} 함선.`,
        '주유': `${prefix}${size}급 주유선. 연료 보급으로 작전 반경을 넓혀 주는 ${ship.manufacturer} 함선.`,
        '의료': `${prefix}${size}급 의료선. 구조와 치료 임무를 맡는 ${ship.manufacturer} 함선.`,
        '연구': `${prefix}${size}급 연구선. 과학·분석 임무를 지원하는 ${ship.manufacturer} 함선.`,
        '전투': `${prefix}${size}급 전투함. 교전 임무에 맞춰 화력과 생존성을 우선한 ${ship.manufacturer} 함선.`,
        '수송': ship.size === '지상'
            ? `${prefix}지상 수송 차량. 인원 이동과 현장 운용을 지원하는 ${ship.manufacturer} 차량.`
            : `${prefix}${size}급 수송선. 인원 또는 물자 이동을 담당하는 ${ship.manufacturer} 함선.`,
        '방송': `${prefix}${size}급 방송선. 현장 중계와 기록 임무를 위한 ${ship.manufacturer} 함선.`,
        '레이싱': `${prefix}${size}급 레이싱 기체. 속도 경쟁에 초점을 맞춘 ${ship.manufacturer} 함선.`,
        '지원': `${prefix}${size}급 지원선. 수리·건설 등 후방 임무를 보조하는 ${ship.manufacturer} 함선.`,
        '입문': `${prefix}${size}급 입문선. 처음 함선을 다루는 유저가 접근하기 쉬운 ${ship.manufacturer} 기체.`,
        '기함': `${prefix}${size}급 함대 기함. 대규모 작전 운용을 전제로 한 ${ship.manufacturer} 함선.`,
        '다목적': `${prefix}${size}급 다목적함. 한 가지 임무에 묶이지 않고 유연하게 운용할 수 있는 ${ship.manufacturer} 함선.`
    };
    return templates[ship.focus] || ship.description;
}

function getCoreTags(ship) {
    const tags = new Set();
    if (ship.focus) tags.add(ship.focus);
    if (ship.tags.includes('입문')) tags.add('입문');
    if (ship.tags.includes('기함')) tags.add('기함');
    if (ship.tags.includes('미구현')) tags.add('미구현');
    if (ship.name === 'Expanse') tags.add('미구현');
    return [...tags];
}

function refineShip(ship) {
    const preserveLegacy = ship.tags.some((tag) => LEGACY_TAGS.has(tag));
    return {
        ...ship,
        description: isGeneratedDescription(ship.description) ? refineDescription(ship) : ship.description,
        tags: preserveLegacy ? ship.tags : getCoreTags(ship)
    };
}

function stringifyShips(ships) {
    return `${SECTION_START}\n${ships.map((ship) => `        ${JSON.stringify(ship)},`).join('\n')}\n    ],`;
}

async function main() {
    const source = await readFile(DATA_PATH, 'utf8');
    const voltData = loadVoltData(source);
    const ships = voltData.ships.map(refineShip);
    const start = source.indexOf(SECTION_START);
    const end = source.indexOf(SECTION_END, start);
    if (start < 0 || end < 0) throw new Error('Ships section markers were not found.');
    await writeFile(DATA_PATH, `${source.slice(0, start)}${stringifyShips(ships)}${source.slice(end)}`, 'utf8');
    console.log(`Refined ${ships.length} ships.`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
