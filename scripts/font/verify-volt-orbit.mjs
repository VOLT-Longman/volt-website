#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fontDir = path.join(root, 'assets', 'fonts');
const requiredTags = ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post'];
const requiredCharacters = [...new Set('MOVE THE VERSE.VOYAGERS OF LOGISTICS & TRADE')];

function fail(message) {
    throw new Error(`VOLT Orbit font check failed: ${message}`);
}

function tableDirectory(font) {
    if (font.length < 12 || font.readUInt32BE(0) !== 0x00010000) fail('invalid TrueType sfnt header');
    const count = font.readUInt16BE(4);
    const directoryEnd = 12 + count * 16;
    if (directoryEnd > font.length) fail('truncated sfnt table directory');
    const tables = new Map();
    for (let index = 0; index < count; index += 1) {
        const offset = 12 + index * 16;
        const tag = font.toString('latin1', offset, offset + 4);
        const tableOffset = font.readUInt32BE(offset + 8);
        const length = font.readUInt32BE(offset + 12);
        if (tables.has(tag) || tableOffset < directoryEnd || tableOffset + length > font.length) fail(`invalid ${tag} table bounds`);
        tables.set(tag, font.subarray(tableOffset, tableOffset + length));
    }
    return tables;
}

function requiredTable(tables, tag) {
    const table = tables.get(tag);
    if (!table) fail(`missing ${tag} table`);
    return table;
}

function decodeUtf16Be(value) {
    return Buffer.from(value).swap16().toString('utf16le');
}

function nameRecords(table) {
    if (table.length < 6) fail('truncated name table');
    const count = table.readUInt16BE(2);
    const stringOffset = table.readUInt16BE(4);
    if (6 + count * 12 > table.length || stringOffset > table.length) fail('invalid name table header');
    const names = new Map();
    for (let index = 0; index < count; index += 1) {
        const offset = 6 + index * 12;
        const platform = table.readUInt16BE(offset);
        const encoding = table.readUInt16BE(offset + 2);
        const nameId = table.readUInt16BE(offset + 6);
        const length = table.readUInt16BE(offset + 8);
        const valueOffset = stringOffset + table.readUInt16BE(offset + 10);
        if (platform === 3 && encoding === 1 && valueOffset + length <= table.length) names.set(nameId, decodeUtf16Be(table.subarray(valueOffset, valueOffset + length)));
    }
    return names;
}

function glyphId(cmap, codePoint) {
    if (cmap.length < 12 || cmap.readUInt16BE(2) < 1) fail('invalid cmap header');
    let offset = -1;
    for (let index = 0; index < cmap.readUInt16BE(2); index += 1) {
        const record = 4 + index * 8;
        if (cmap.readUInt16BE(record) === 3 && cmap.readUInt16BE(record + 2) === 1) offset = cmap.readUInt32BE(record + 4);
    }
    if (offset < 0 || offset + 16 > cmap.length || cmap.readUInt16BE(offset) !== 4) fail('missing Windows BMP cmap');
    const segmentCount = cmap.readUInt16BE(offset + 6) / 2;
    const endCodes = offset + 14;
    const startCodes = endCodes + segmentCount * 2 + 2;
    const idDeltas = startCodes + segmentCount * 2;
    const idRanges = idDeltas + segmentCount * 2;
    if (idRanges + segmentCount * 2 > cmap.length) fail('truncated cmap segments');
    for (let index = 0; index < segmentCount; index += 1) {
        const start = cmap.readUInt16BE(startCodes + index * 2);
        const end = cmap.readUInt16BE(endCodes + index * 2);
        if (codePoint >= start && codePoint <= end) {
            if (cmap.readUInt16BE(idRanges + index * 2) !== 0) fail('unsupported cmap glyph array');
            return (codePoint + cmap.readInt16BE(idDeltas + index * 2)) & 0xffff;
        }
    }
    return 0;
}

function verifyTtf(font) {
    const tables = tableDirectory(font);
    for (const tag of requiredTags) requiredTable(tables, tag);
    const head = requiredTable(tables, 'head');
    const os2 = requiredTable(tables, 'OS/2');
    if (head.length < 54 || head.readUInt32BE(4) !== 0x00030042 || head.readUInt32BE(12) !== 0x5F0F3CF5) fail('invalid head table');
    if (os2.length < 90 || os2.readUInt16BE(4) !== 600 || (os2.readUInt16BE(62) & 0x00c0) !== 0x0080) fail('weight metadata must be static SemiBold');
    const names = nameRecords(requiredTable(tables, 'name'));
    if (names.get(1) !== 'VOLT Orbit Display' || names.get(2) !== 'SemiBold' || names.get(5) !== 'Version 3.001' || names.get(6) !== 'VOLTOrbitDisplay-SemiBold') fail('name metadata is out of sync');
    const cmap = requiredTable(tables, 'cmap');
    const missing = requiredCharacters.filter((character) => glyphId(cmap, character.codePointAt(0)) === 0);
    if (missing.length > 0) fail(`missing live glyphs: ${missing.join('')}`);
}

function verifyWoff2(font) {
    if (font.length < 48 || font.toString('latin1', 0, 4) !== 'wOF2') fail('invalid WOFF2 header');
    if (font.readUInt16BE(12) !== requiredTags.length || font.readUInt32BE(8) !== font.length || font.readUInt32BE(16) < 1000) fail('invalid WOFF2 directory');
}

const ttf = readFileSync(path.join(fontDir, 'VOLT-Orbit-Display.ttf'));
const woff2 = readFileSync(path.join(fontDir, 'VOLT-Orbit-Display.woff2'));
verifyTtf(ttf);
verifyWoff2(woff2);
console.log(`OK: VOLT Orbit Display v3.001 — ${ttf.length}B TTF, ${woff2.length}B WOFF2, ${requiredCharacters.length} live glyphs`);
