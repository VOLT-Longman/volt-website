const fs = require('fs');

const DEFAULT_GLOBAL_INI = 'D:/Roberts Space Industries/StarCitizen/LIVE/data/Localization/korean_(south_korea)/global.ini';
const inputPath = process.argv[2] || DEFAULT_GLOBAL_INI;

function parseIni(source) {
    const entries = new Map();
    const duplicates = [];
    source.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) return;
        const separatorIndex = line.indexOf('=');
        if (separatorIndex < 0) return;
        const key = line.slice(0, separatorIndex).replace(/,.*/, '').trim();
        const value = line.slice(separatorIndex + 1).trim();
        if (!key || !value) return;
        if (entries.has(key)) duplicates.push(key);
        entries.set(key, value);
    });
    return { entries, duplicates };
}

function normalizeKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isCommodityNameKey(key) {
    const lower = key.toLowerCase();
    return lower.startsWith('items_commodities_')
        && !lower.endsWith('_desc')
        && !lower.endsWith('_des')
        && !lower.endsWith('desc');
}

function isShortDisplayName(value) {
    return value.length <= 40 && !/[.!?。]$/.test(value);
}

function extractCommodities(entries) {
    const seen = new Set();
    const commodities = {};
    Array.from(entries.entries()).forEach(([key, value]) => {
        if (!isCommodityNameKey(key) || !isShortDisplayName(value)) return;
        const commodityKey = key.slice('items_commodities_'.length);
        const normalized = normalizeKey(commodityKey);
        if (seen.has(normalized)) return;
        seen.add(normalized);
        commodities[commodityKey] = { ko: value };
    });
    return commodities;
}

function extractLikelyLocations(entries) {
    const keywords = /^(Stanton|Pyro|RR_|ATC_|Lorville_|Orison_|ArcCorp|microTech|Hurston|Crusader|Area18|NewBabbage)/i;
    const locations = {};
    Array.from(entries.entries()).forEach(([key, value]) => {
        if (!keywords.test(key) || !isShortDisplayName(value)) return;
        const raw = value.match(/\[(.+?)\]/)?.[1] || key.replace(/_/g, ' ');
        if (raw.length > 2) locations[raw] = value.replace(/\s*\[.+?\]\s*/g, '').trim();
    });
    return locations;
}

const source = fs.readFileSync(inputPath, 'utf8');
const { entries, duplicates } = parseIni(source);
const output = {
    commodities: extractCommodities(entries),
    locations: extractLikelyLocations(entries)
};

if (duplicates.length) {
    console.warn(`Duplicate keys detected: ${duplicates.length}`);
}

console.log(JSON.stringify(output, null, 2));
