const fs = require('fs');

const DEFAULT_GLOBAL_INI = 'D:/Roberts Space Industries/StarCitizen/LIVE/data/Localization/korean_(south_korea)/global.ini';
const inputPath = process.argv[2] || DEFAULT_GLOBAL_INI;

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

function isLikelyDisplayName(value) {
    return Boolean(value)
        && value.length <= 40
        && !/[.!?。]$/.test(value);
}

function extractCommodityTranslations(source) {
    const translations = [];
    const seen = new Set();
    source.split(/\r?\n/).forEach((line) => {
        const separatorIndex = line.indexOf('=');
        if (separatorIndex < 0) return;

        const rawKey = line.slice(0, separatorIndex).replace(/,.*/, '');
        const value = line.slice(separatorIndex + 1).trim();
        if (!isCommodityNameKey(rawKey) || !isLikelyDisplayName(value)) return;

        const key = rawKey.slice('items_commodities_'.length);
        const normalized = normalizeKey(key);
        if (seen.has(normalized)) return;

        seen.add(normalized);
        translations.push([key, value]);
    });
    return translations.sort((left, right) => left[0].localeCompare(right[0], 'en'));
}

const source = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');
const translations = extractCommodityTranslations(source);

console.log(`// Extracted from ${inputPath}`);
console.log(`// Count: ${translations.length}`);
console.log('const UEX_COMMODITY_TRANSLATIONS = {');
translations.forEach(([key, value], index) => {
    const comma = index === translations.length - 1 ? '' : ',';
    console.log(`    ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
});
console.log('};');
