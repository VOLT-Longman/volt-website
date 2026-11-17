// 조사 스크립트 공용 도구. 게임 원본(Game2.dcb)과 UEX 응답은 저장소 밖의 캐시 폴더에서 읽는다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataForge } from '../gamedata/dataforge.mjs';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT_DATA = resolve(REPO, 'data/loadout-research');

export function args() {
    const out = {};
    const list = process.argv.slice(2);
    for (let i = 0; i < list.length; i += 1) {
        if (!list[i].startsWith('--')) continue;
        const key = list[i].slice(2);
        if (list[i + 1] && !list[i + 1].startsWith('--')) { i += 1; out[key] = list[i]; } else out[key] = true;
    }
    return out;
}

export function requireDir(value, flag) {
    if (!value || value === true || !existsSync(value)) { console.error(`--${flag} <폴더> 가 필요합니다.`); process.exit(2); }
    return value;
}

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const repoJson = (path) => readJson(resolve(REPO, path));
export function writeData(file, value) {
    mkdirSync(OUT_DATA, { recursive: true });
    writeFileSync(resolve(OUT_DATA, file), `${JSON.stringify(value, null, 1)}\n`);
    console.log(`wrote data/loadout-research/${file}`);
}

export function loadGame(cacheDir) {
    const df = new DataForge(readFileSync(resolve(cacheDir, 'Game2.dcb')));
    let build = {};
    try { build = readJson(resolve(cacheDir, 'build.json')); } catch (_e) { /* 빌드 표기 없음 */ }
    const records = df.recordsOfType('EntityClassDefinition');
    const clsOf = (record) => record.name.replace(/^EntityClassDefinition\./, '');
    const byClass = new Map(records.map((r) => [clsOf(r).toLowerCase(), r]));
    const byId = new Map(records.map((r) => [r.id, r]));
    const cache = new Map();
    const entity = (record, depth = 12) => {
        const key = `${record.id}:${depth}`;
        if (!cache.has(key)) cache.set(key, df.readRecord(record, depth));
        return cache.get(key);
    };
    const component = (e, type) => (e.Components || []).find((c) => c && c.__type === type);
    const attach = (e) => component(e, 'SAttachableComponentParams')?.AttachDef;
    return { df, build, records, clsOf, byClass, byId, entity, component, attach };
}

// 값이 없으면 null. 0은 실제 0일 때만 남긴다.
export const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
export const round = (value, digits = 4) => (value === null || value === undefined || !Number.isFinite(value) ? null : Number(value.toFixed(digits)));

export function manifestBase(game) {
    return {
        gameBuild: game?.build?.Version || null,
        gameBranch: game?.build?.Branch || null,
        gameChangelist: game?.build?.RequestedP4ChangeNum || null,
        gameBuildDate: game?.build?.BuildDateStamp || null,
        researchedAt: new Date().toISOString(),
    };
}

// 구조를 경로=값 줄로 편다 (원본 필드 경로를 문서에 그대로 옮기기 위한 용도).
export function flatten(value, path = '', out = []) {
    if (value && typeof value === 'object') {
        if (Array.isArray(value)) value.forEach((v, i) => { flatten(v, `${path}[${i}]`, out); });
        else for (const k of Object.keys(value)) flatten(value[k], path ? `${path}.${k}` : k, out);
    } else out.push([path, value]);
    return out;
}

// 열거형 정의(이름 → 선택지 목록). 배열 칸 번호가 어떤 종류를 뜻하는지 확인할 때 쓴다.
export function enumTable(df) {
    const out = new Map();
    const b = df.buffer;
    for (let i = 0; ; i += 1) {
        const o = df.at.enums + i * 8;
        if (o + 8 > df.at.mappings) break;
        const name = df.name(b.readUInt32LE(o));
        const n = b.readUInt16LE(o + 4); const first = b.readUInt16LE(o + 6);
        const options = [];
        for (let j = 0; j < n; j += 1) options.push(df.name(b.readUInt32LE(df.at.enumOption + (first + j) * 4)));
        out.set(name, options);
    }
    return out;
}
