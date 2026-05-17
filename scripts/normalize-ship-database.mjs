import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const DATA_PATH = new URL('../data/volt-data.js', import.meta.url);
const RSI_PATH = new URL('../data/rsi-ship-matrix-index.json', import.meta.url);
const PRICE_PATH = new URL('../data/ship-prices-usd.json', import.meta.url);
const SECTION_START = '    ships: [';
const SECTION_END = '\n\n    // ===== FAQ =====';

const PRICE_ALIASES = {
    'auroraes': 'auroramkies',
    'auroralx': 'auroramilx',
    'auroramr': 'auroramikmr',
    'auroracl': 'auroramikcl',
    'auroraln': 'auroramikln',
    'auroramk1se': 'auroramikse',
    'auroramk2': 'auroramkii',
    'c8rpisces': 'c8rpiscesrescue',
    'c2hercules': 'c2herculesstarlifter',
    'm2hercules': 'm2herculesstarlifter',
    'a2hercules': 'a2herculesstarlifter',
    'aresinferno': 'aresstarfighterinferno',
    'aresion': 'aresstarfighterion',
    'zeusmk2cl': 'zeusmkiicl',
    'zeusmk2es': 'zeusmkiies',
    'zeusmk2mr': 'zeusmkiimr'
};

const CATEGORY_RULES = [
    ['인양', /salvage|recovery/],
    ['채굴', /mining|prospecting/],
    ['정제', /refinery|refining/],
    ['주유', /refuelling|refuel/],
    ['의료', /medical|ambulance/],
    ['연구', /science/],
    ['탐사', /exploration|expedition|pathfinder|recon/],
    ['화물', /freight|cargo|hauler|loader/],
    ['전투', /fighter|combat|gun ?ship|bomber|interdict|assault|patrol|corvette|frigate|destroyer|anti-air|minelayer|stealth/],
    ['수송', /dropship|transport|passenger|boarding|luxury|touring/],
    ['방송', /reporting/],
    ['레이싱', /racing/],
    ['지원', /repair|construction/],
    ['기함', /carrier/],
    ['입문', /starter/],
    ['다목적', /modular|generalist|multi-role|industrial|military/]
];

function loadVoltData(source) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source};this.VOLT_DATA=VOLT_DATA;`, context);
    return context.VOLT_DATA;
}

function normalize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getOfficialByUrl(ships) {
    return new Map(ships.map((ship) => [`https://robertsspaceindustries.com${ship.url}`, ship]));
}

function getPriceMap(priceData) {
    const prices = new Map();
    for (const [name, price] of Object.entries(priceData.prices || {})) {
        const key = normalize(name);
        if (price != null && !prices.has(key)) prices.set(key, price);
    }
    return prices;
}

function getCategories(officialShip, fallbackFocus) {
    const focus = String(officialShip?.focus || fallbackFocus || '').toLowerCase();
    const matches = CATEGORY_RULES
        .map(([category, pattern]) => ({ category, index: focus.search(pattern) }))
        .filter((item) => item.index >= 0)
        .sort((left, right) => left.index - right.index)
        .map((item) => item.category);
    return [...new Set(matches.length ? matches : ['다목적'])];
}

function getTags(ship, officialShip, categories) {
    const [primary, ...secondary] = categories;
    const tags = new Set(secondary);
    if (officialShip?.production_status === 'in-concept') tags.add('미구현');
    if (officialShip?.size === 'vehicle' || officialShip?.type === 'ground') tags.add('지상');
    if (officialShip?.size === 'capital' && primary !== '기함') tags.add('기함');
    if (/modular/i.test(officialShip?.focus || '')) tags.add('모듈형');
    return [...tags];
}

function getPriceUsd(ship, priceMap) {
    const ownKey = normalize(ship.name);
    return priceMap.get(ownKey) ?? priceMap.get(PRICE_ALIASES[ownKey]) ?? null;
}

function tidyDescription(description) {
    return String(description || '')
        .replace(/미구현,\s*/g, '미구현. ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeShip(ship, officialShip, priceMap) {
    const categories = getCategories(officialShip, ship.focus);
    return {
        ...ship,
        focus: categories[0],
        description: tidyDescription(ship.description),
        tags: getTags(ship, officialShip, categories),
        priceUsd: getPriceUsd(ship, priceMap)
    };
}

function stringifyShips(ships) {
    return `${SECTION_START}\n${ships.map((ship) => `        ${JSON.stringify(ship)},`).join('\n')}\n    ],`;
}

async function main() {
    const source = await readFile(DATA_PATH, 'utf8');
    const voltData = loadVoltData(source);
    const official = JSON.parse((await readFile(RSI_PATH, 'utf8')).replace(/^\uFEFF/, '')).data;
    const priceData = JSON.parse((await readFile(PRICE_PATH, 'utf8')).replace(/^\uFEFF/, ''));
    const officialByUrl = getOfficialByUrl(official);
    const priceMap = getPriceMap(priceData);
    const ships = voltData.ships.map((ship) => normalizeShip(ship, officialByUrl.get(ship.rsiUrl), priceMap));
    const start = source.indexOf(SECTION_START);
    const end = source.indexOf(SECTION_END, start);
    if (start < 0 || end < 0) throw new Error('Ships section markers were not found.');
    await writeFile(DATA_PATH, `${source.slice(0, start)}${stringifyShips(ships)}${source.slice(end)}`, 'utf8');
    console.log(`Normalized ${ships.length} ships.`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
