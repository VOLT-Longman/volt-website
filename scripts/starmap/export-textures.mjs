#!/usr/bin/env node
/**
 * 성계지도 행성·위성 표면 그림 내보내기 — 설치된 게임 파일에서 직접 읽어 웹용 WebP 로 바꾼다.
 *
 * 사용: node scripts/starmap/export-textures.mjs [--p4k <Data.p4k>] [--cache-dir <build.json 폴더>]
 *        [--node-modules-from <다른 체크아웃>]   WebP 인코딩용 Playwright 를 찾을 곳(이 저장소에 없을 때)
 *        [--quality 0.85]
 * 입력: Data.p4k 의 Data/UI/starmap/textures/<항성계>/ui_sm_*.dds (게임 성계지도가 쓰는 색 지도 30장)
 *       Data/Materials/UI/Starmap/PlanetsMoons/<항성계>/*.mtl (재질 -> 그림 연결, TexSlot4)
 * 출력: assets/models/starmap/tex/<key>_512.webp, <key>_1k.webp  (Git 에 넣지 않는다. 비공개 R2 로만 올린다)
 *       data/starmap/textures.json                               (화면·자료 빌드가 읽는 목록)
 *       functions/_shared/starmap-texture-version.js             (서버가 쓰는 버전 한 줄)
 *
 * key 규칙(docs/starmap-assets.md): 천체의 starMapMaterialPath 재질 파일에서 Map="TexSlot4" 인 Texture 의 File
 *   경로 -> 마지막 이름 -> 확장자 제거 -> 소문자. 예: ui/starmap/textures/Nyx/ui_sm_nyx_2.tif -> ui_sm_nyx_2
 * 원칙: 그림은 게임 파일의 밉맵을 그대로 쓴다(자르거나 뒤집지 않는다). 알파는 전부 불투명(255)으로 만든다.
 *   읽지 못한 그림은 지어내지 않고 failed 에 이유와 함께 남긴다. 2k/4k 는 내보내지 않는다.
 * 외부 서비스에 접근하지 않는다. 디코더는 scripts/gear/models/ 의 것을 그대로 쓴다.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { P4k, parseCryXml } from '../gamedata/p4k.mjs';
import { decodeToRgba, readMip } from '../gear/models/dds.mjs';
import { WebpEncoder } from '../gear/models/webp.mjs';
import { syncTextureVersion } from './sync-texture-version.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..').split('\\').join('/');
const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
const P4K = arg('--p4k') || 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';
const CACHE = arg('--cache-dir');
const QUALITY = Number(arg('--quality') || 0.85);


const VERSION = 1;
const TEXTURE_DIR = 'data/ui/starmap/textures/';
const MATERIAL_DIR = 'data/materials/ui/starmap/planetsmoons/';
// 화면 이름 -> 가장 긴 변의 픽셀 수. 2k/4k 는 휴대폰 그래픽 메모리 때문에 내보내지 않는다.
const SIZES = { 512: 512, '1k': 1024 };
const OUT = `${ROOT}/assets/models/starmap`;
const REL = 'assets/models/starmap';

/** docs/starmap-assets.md 의 key 규칙. 자료 빌드도 같은 함수를 쓴다. */
export function textureKey(file) {
    return String(file || '').split('\\').join('/').split('/').pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

/** 재질(.mtl, CryXmlB) 안에서 TexSlot4 그림 경로를 찾는다. 없으면 null. */
export function colourMapOf(material) {
    const stack = [material];
    while (stack.length) {
        const node = stack.pop();
        if (node.tag === 'Texture' && node.attrs?.Map === 'TexSlot4' && node.attrs.File) return node.attrs.File;
        for (const child of node.children || []) stack.push(child);
    }
    return null;
}

async function main() {
    if (!existsSync(P4K)) { console.error(`Data.p4k 를 찾을 수 없습니다: ${P4K} (--p4k 로 지정)`); process.exit(2); }
    const build = (() => { try { const m = JSON.parse(readFileSync(resolve(CACHE, 'build.json'), 'utf8')); return m.Data || m; } catch { return {}; } })();
    const norm = (name) => name.split('\\').join('/');
    const p4k = new P4k(P4K);
    const found = p4k.find((name) => { const l = norm(name).toLowerCase(); return l.startsWith(TEXTURE_DIR) || (l.startsWith(MATERIAL_DIR) && l.endsWith('.mtl')); });
    const byName = new Map(found.map((entry) => [norm(entry.name).toLowerCase(), entry]));
    const original = new Map(found.map((entry) => [norm(entry.name).toLowerCase(), norm(entry.name)]));

    // 행성·위성 색 지도만(ui_sm_*). 같은 폴더의 128px UI 아이콘 2장은 천체 그림이 아니다.
    const heads = [...byName.keys()].filter((name) => name.startsWith(TEXTURE_DIR) && /\/ui_sm_[a-z0-9_]+\.dds$/.test(name)).sort();
    const partsOf = (head) => {
        const parts = new Map([['', () => p4k.extract(byName.get(head))]]);
        for (let i = 1; byName.has(`${head}.${i}`); i += 1) { const entry = byName.get(`${head}.${i}`); parts.set(String(i), () => p4k.extract(entry)); }
        return parts;
    };

    if (existsSync(OUT)) rmSync(OUT, { recursive: true });       // 전체를 새로 만든다. 낡은 파일을 남기지 않는다.
    mkdirSync(`${OUT}/tex`, { recursive: true });
    mkdirSync(`${ROOT}/data/starmap`, { recursive: true });

    const encoder = new WebpEncoder([ROOT, ...(arg('--node-modules-from') ? [arg('--node-modules-from').split('\\').join('/')] : [])]);
    const textures = {}; const failed = []; const totals = Object.fromEntries(Object.keys(SIZES).map((size) => [size, 0])); const hashes = [];
    try {
        for (const head of heads) {
            const key = textureKey(head);
            const entry = { source: original.get(head), system: head.slice(TEXTURE_DIR.length).split('/')[0], format: null, native: null, alphaForced: 0, files: {} };
            try {
                if (!/^[a-z0-9_]+$/.test(key) || textures[key]) throw new Error(`key 가 겹치거나 형식에 맞지 않음: ${key}`);
                for (const [label, size] of Object.entries(SIZES)) {
                    const mip = readMip(partsOf(head), { size });
                    if (Math.max(mip.width, mip.height) !== size) throw new Error(`${label}: 게임 파일에 ${size}px 밉맵이 없음 (${mip.width}x${mip.height})`);
                    const rgba = decodeToRgba(mip.header.format, mip.data, mip.width, mip.height);
                    let forced = 0;
                    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { forced += 1; rgba[i] = 255; }
                    const result = await encoder.encode({ rgba, width: mip.width, height: mip.height }, QUALITY);
                    const file = `tex/${key}_${label}.webp`;
                    writeFileSync(`${OUT}/${file}`, result.bytes);
                    const sha256 = createHash('sha256').update(result.bytes).digest('hex');
                    entry.format = mip.header.format.name; entry.native = [mip.header.width, mip.header.height];
                    if (label === '1k') entry.alphaForced = forced;       // 불투명이 아니던 픽셀 수(1k 기준, 참고용)
                    entry.files[label] = { file: `${REL}/${file}`, width: mip.width, height: mip.height, bytes: result.bytes.length, sha256, webpMaxError: result.maxError, webpMeanError: +result.meanError.toFixed(3) };
                }
                textures[key] = entry;
                for (const label of Object.keys(SIZES)) { totals[label] += entry.files[label].bytes; hashes.push(`${entry.files[label].file}:${entry.files[label].sha256}`); }
                console.log(`${key}  ${entry.format} ${entry.native.join('x')}  512=${entry.files[512].bytes}  1k=${entry.files['1k'].bytes}${entry.alphaForced ? `  alpha->255: ${entry.alphaForced}px` : ''}`);
            } catch (error) {
                for (const label of Object.keys(SIZES)) rmSync(`${OUT}/tex/${key}_${label}.webp`, { force: true });
                failed.push({ key, source: original.get(head), reason: error.message });
                console.log(`${key}  FAILED: ${error.message}`);
            }
        }
    } finally { await encoder.close(); }

    // 재질 -> key. 자료 빌드가 재질 파일을 다시 열지 않아도 같은 key 를 얻도록 함께 적는다.
    const materials = {}; const materialsWithoutTexture = [];
    for (const name of [...byName.keys()].filter((n) => n.startsWith(MATERIAL_DIR)).sort()) {
        const path = original.get(name).replace(/^data\//i, '');
        let file = null;
        try { const buffer = p4k.extract(byName.get(name)); if (buffer.toString('latin1', 0, 7) === 'CryXmlB') file = colourMapOf(parseCryXml(buffer)); } catch { file = null; }
        const key = file ? textureKey(file) : null;
        if (key && textures[key]) materials[path.toLowerCase()] = key; else materialsWithoutTexture.push({ material: path, texture: file, key });
    }
    p4k.close?.();

    // 같은 그림이면 같은 버전. 그림이 한 장이라도 달라지면 새 버전(= 새 R2 폴더)이 된다.
    const digest = createHash('sha256').update(hashes.sort().join('\n')).digest('hex').slice(0, 10);
    const assetVersion = `${String(build.Version || 'build').replace(/[^\w.-]/g, '')}-${digest}`;
    const index = {
        version: VERSION, gameBuild: build.Version || null, assetVersion,
        base: `${REL}/tex`, sizes: Object.keys(SIZES), webpQuality: QUALITY,
        keyRule: 'starMapMaterialPath -> .mtl Texture[Map=TexSlot4].File -> basename without extension, lower-case',
        // 구에 입히는 방법. 근거와 확인 화면은 docs/starmap-assets.md (게임 구 모형의 UV 를 읽어 확인함).
        projection: {
            type: 'equirectangular', topRow: 'north (+Z in game, +Y in three.js)', uIncreases: 'east (not mirrored)', storedSquare: 'most maps are 2:1 pictures squeezed into a square; sample with plain 0..1 UVs',
            three: { geometry: 'SphereGeometry', flipY: true, colorSpace: 'srgb', wrapS: 'RepeatWrapping', wrapT: 'ClampToEdgeWrapping', meshRotationYDegrees: -90, textureOffsetX: 0 },
        },
        totals: { textures: Object.keys(textures).length, bytes: totals, failed: failed.length },
        textures, materials, materialsWithoutTexture, failed,
    };
    writeFileSync(`${ROOT}/data/starmap/textures.json`, `${JSON.stringify(index, null, 1)}\n`);
    syncTextureVersion(assetVersion);
    console.log(`\n${Object.keys(textures).length} textures, failed ${failed.length}. 512: ${totals[512]} bytes, 1k: ${totals['1k']} bytes. assetVersion ${assetVersion}`);
    console.log(`materials -> key: ${Object.keys(materials).length}, without a usable colour map: ${materialsWithoutTexture.length}`);
    if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
