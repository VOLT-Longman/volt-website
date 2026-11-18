#!/usr/bin/env node
/**
 * 개인 무기 아이콘 — 설치된 게임 파일(Data.p4k)의 UI 아이콘을 PNG 로 꺼낸다.
 *
 * 게임 파일에는 장비 사진이 없다(게임 안 보관함 그림은 3D 모형을 그때그때 그린 것이다).
 * 들어 있는 것은 일부 무기의 윤곽 아이콘(Data/UI/Textures/EA/LoadoutIcons, 64px)뿐이라 그것만 쓴다.
 * 무기와 아이콘의 연결은 무기 정의의 displayIcon 경로를 따른다. 다만 게임은 아이콘이 없는 무기에 다른 무기의
 * 아이콘을 임시로 걸어 두었으므로(예: 견인 도구에 소총 그림), 아이콘 파일 이름에 그 무기의 모델명이 들어 있을 때만 쓴다.
 *
 * 입력: --p4k <Data.p4k> (기본: 설치 경로), --cache-dir <Game2.dcb 가 있는 폴더>
 * 출력: assets/images/gear/<기본형>.png, data/gear/icons.json
 * 이미지 © Cloud Imperium Games. 팬 콘텐츠 정책에 따라 출처를 표시해 쓴다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { DataForge } from '../gamedata/dataforge.mjs';
import { P4k } from '../gamedata/p4k.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : fallback; };
const CACHE = arg('--cache-dir', null);
const P4K_PATH = arg('--p4k', 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k');
if (!CACHE || !existsSync(resolve(CACHE, 'Game2.dcb'))) { console.error('--cache-dir <Game2.dcb 가 있는 폴더> 가 필요합니다.'); process.exit(2); }

// 압축되지 않은 32비트 DDS → PNG. 압축 형식이면 건너뛴다.
function crc32(buffer) { let c = ~0; for (const byte of buffer) { c ^= byte; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; }
function ddsToPng(dds) {
    if (dds.subarray(0, 4).toString('latin1') !== 'DDS ') return null;
    const height = dds.readUInt32LE(12); const width = dds.readUInt32LE(16);
    const flags = dds.readUInt32LE(80); const bits = dds.readUInt32LE(88); const fourcc = dds.subarray(84, 88).toString('latin1');
    const stride = width * 4 + 1;
    const raw = Buffer.alloc(stride * height);
    const put = (x, y, r, g, b, alpha) => { if (x >= width || y >= height) return; const at = y * stride + 1 + x * 4; raw[at] = r; raw[at + 1] = g; raw[at + 2] = b; raw[at + 3] = alpha; };
    if (flags & 0x4) {
        // DXT5(BC3): 4×4 칸마다 16바이트 — 투명도 8바이트 + 색 8바이트. 가장 큰 그림(첫 mip)만 푼다.
        if (fourcc !== 'DXT5' || dds.length < 128 + Math.ceil(width / 4) * Math.ceil(height / 4) * 16) return null;
        let offset = 128;
        const rgb565 = (value) => [((value >> 11) & 31) * 255 / 31, ((value >> 5) & 63) * 255 / 63, (value & 31) * 255 / 31].map(Math.round);
        for (let by = 0; by < height; by += 4) for (let bx = 0; bx < width; bx += 4) {
            const a0 = dds[offset]; const a1 = dds[offset + 1];
            const alphas = [a0, a1];
            for (let i = 1; i <= 6; i += 1) alphas.push(a0 > a1 ? Math.round(((7 - i) * a0 + i * a1) / 7) : (i <= 4 ? Math.round(((5 - i) * a0 + i * a1) / 5) : (i === 5 ? 0 : 255)));
            let alphaBits = 0n; for (let i = 0; i < 6; i += 1) alphaBits |= BigInt(dds[offset + 2 + i]) << BigInt(8 * i);
            const c0 = dds.readUInt16LE(offset + 8); const c1 = dds.readUInt16LE(offset + 10);
            const p0 = rgb565(c0); const p1 = rgb565(c1);
            const palette = [p0, p1, p0.map((v, i) => Math.round((2 * v + p1[i]) / 3)), p0.map((v, i) => Math.round((v + 2 * p1[i]) / 3))];
            const colorBits = dds.readUInt32LE(offset + 12);
            for (let i = 0; i < 16; i += 1) {
                const color = palette[(colorBits >>> (2 * i)) & 3]; const alpha = alphas[Number((alphaBits >> BigInt(3 * i)) & 7n)];
                put(bx + (i % 4), by + Math.floor(i / 4), color[0], color[1], color[2], alpha);
            }
            offset += 16;
        }
    } else {
        if (bits !== 32 || dds.length < 128 + width * height * 4) return null;
        const masks = [92, 96, 100, 104].map((offset) => dds.readUInt32LE(offset));
        const shift = masks.map((mask) => (mask ? Math.log2(mask & -mask) : -1));
        for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
            const pixel = dds.readUInt32LE(128 + (y * width + x) * 4);
            const channel = (c) => (shift[c] < 0 ? (c === 3 ? 255 : 0) : (pixel >>> shift[c]) & 0xFF);
            put(x, y, channel(0), channel(1), channel(2), channel(3));
        }
    }
    const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
    return { width, height, png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]) };
}

const df = new DataForge(readFileSync(resolve(CACHE, 'Game2.dcb')));
const weapons = JSON.parse(readFileSync(resolve(ROOT, 'data/gear/weapons.json'), 'utf8')).groups;
const records = new Map(df.recordsOfType('EntityClassDefinition').map((record) => [record.name.split('.').slice(1).join('.').toLowerCase(), record]));
const p4k = new P4k(P4K_PATH);
const nameOf = (entry) => (typeof entry === 'string' ? entry : entry.name);
const files = new Map(p4k.find((name) => /UI.Textures.EA.LoadoutIcons/i.test(name) && /\.dds$/i.test(name)).map((entry) => [nameOf(entry).split(String.fromCharCode(92)).pop().toLowerCase(), entry]));

mkdirSync(resolve(ROOT, 'assets/images/gear'), { recursive: true });
const icons = {}; const skipped = []; const borrowed = [];
for (const old of readdirSync(resolve(ROOT, 'assets/images/gear'))) if (/.png$/.test(old)) rmSync(resolve(ROOT, 'assets/images/gear', old));
for (const group of weapons) {
    const cls = group.id.replace(/~\d+$/, ''); const record = records.get(cls); if (!record) continue;
    const entity = df.readRecord(record, 6);
    const path = (entity.StaticEntityClassData || []).map((entry) => entry?.displayIcon).find(Boolean);
    if (!path) continue;
    const file = String(path).split('/').pop().toLowerCase().replace(/\.tif$/, '.dds');
    // 모델명(이름의 첫 낱말, 예: P4-AR → p4ar)이 파일 이름에 없으면 남의 아이콘을 빌린 것이라 쓰지 않는다.
    const model = String(group.name.en).split(' ')[0].toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (model.length < 2 || !file.replace(/[^a-z0-9]+/g, '').includes(model)) { borrowed.push(cls); continue; }
    const entry = files.get(file);
    const image = entry ? ddsToPng(p4k.extract(entry)) : null;
    if (!image) { skipped.push(`${cls} (${file}${entry ? ': 압축 형식' : ': 파일 없음'})`); continue; }
    writeFileSync(resolve(ROOT, `assets/images/gear/${cls}.png`), image.png);
    icons[cls] = { file: `assets/images/gear/${cls}.png`, width: image.width, height: image.height, source: file };
}
writeFileSync(resolve(ROOT, 'data/gear/icons.json'), `${JSON.stringify({ note: '게임 파일의 무기 윤곽 아이콘(UI/Textures/EA/LoadoutIcons). © Cloud Imperium Games.', icons })}\n`);
console.log(`무기 아이콘: ${Object.keys(icons).length}개 / 묶음 ${weapons.length}개. 남의 아이콘이라 뺀 것 ${borrowed.length}, 풀지 못한 것 ${skipped.length}`);
