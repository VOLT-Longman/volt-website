#!/usr/bin/env node
/**
 * 개인 무기 3D 모형 내보내기 — 설치된 게임 파일에서 직접 읽어 웹용(.glb + 텍스처)으로 바꾼다.
 *
 * 사용: node scripts/gear/export-models.mjs --cache-dir <Game2.dcb·build.json 폴더> --p4k <Data.p4k>
 *        [--only <묶음id,...>]            일부 총만 다시 내보낸다(기존 models.json 에 합친다)
 *        [--attach-model <attach-model.json>]  data/gear/attachments.json 이 없을 때 쓸 호환 목록
 *        [--node-modules-from <다른 체크아웃>]   WebP 인코딩용 Playwright 를 찾을 곳(이 저장소에 없을 때)
 *        [--tex 1024] [--part-tex 512] [--no-textures] [--png] [--budget 40000]
 * 입력: data/gear/weapons.json (62 묶음), data/gear/attachments.json (포트·호환 부착물)
 * 출력: assets/models/gear/weapons/<묶음id>/{manifest.json, body_lod<N>.glb}
 *       assets/models/gear/parts/<클래스>.glb, assets/models/gear/tex/*.{webp,png}
 *       data/gear/models.json (화면이 읽는 목록), data/gear/models.check.json (자동 검사 결과, 배포 대상 아님)
 *
 * 원칙: 위치는 전부 게임 파일(뼈대·노드)에서 읽는다. 손으로 맞춘 보정값은 없다. 읽을 수 없는 총·부품은
 *   ok:false 와 이유를 남기고 내보내지 않는다. 색·광택은 게임 재질 수치를 우리 방식으로 옮긴 근사치다.
 * 외부 서비스에 접근하지 않는다. 형식 지식의 출처는 models/ivo.mjs, models/skeleton.mjs 머리말 참고.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataForge } from '../gamedata/dataforge.mjs';
import { Archive } from './models/archive.mjs';
import { parseMesh, parseStructure } from './models/ivo.mjs';
import { GlbBuilder, readGlbBack, toYUp, quatToYUp } from './models/glb.mjs';
import { materialToPbr, paletteFromRecord, useArchive } from './models/materials.mjs';
import { TextureBaker } from './models/textures.mjs';
import { WebpEncoder } from './models/webp.mjs';
import { Rig } from './models/rig.mjs';
import { checkWeapon } from './models/check.mjs';
import { syncModelVersion } from './sync-model-version.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..').split('\\').join('/');
const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
const flag = (name) => process.argv.includes(name);
const CACHE = arg('--cache-dir'); const P4K = arg('--p4k');
if (!CACHE || !existsSync(resolve(CACHE, 'Game2.dcb')) || !P4K || !existsSync(P4K)) { console.error('필요: --cache-dir <Game2.dcb 가 있는 폴더> --p4k <Data.p4k 경로>'); process.exit(2); }
const ONLY = arg('--only') ? new Set(arg('--only').split(',').map((s) => s.trim()).filter(Boolean)) : null;
const USE_TEXTURES = !flag('--no-textures');
const TEX_SIZE = Number(arg('--tex') || 1024); const PART_TEX_SIZE = Number(arg('--part-tex') || 512);
const BUDGET = Number(arg('--budget') || 40000);      // triangles of an assembled gun (body + one part per port)
const PART_BUDGET = 9000;                             // a single attachment above this uses its next lower-detail model when it has one
const VERSION = 1;

const OUT = `${ROOT}/assets/models/gear`;
const REL = 'assets/models/gear';
if (!ONLY && existsSync(OUT)) rmSync(OUT, { recursive: true });      // a full run starts clean, so nothing stale is left behind
for (const dir of ['weapons', 'parts', 'tex']) mkdirSync(`${OUT}/${dir}`, { recursive: true });

// ------------------------------------------------------------------ inputs
const site = JSON.parse(readFileSync(`${ROOT}/data/gear/weapons.json`, 'utf8'));
const build = (() => { try { const m = JSON.parse(readFileSync(resolve(CACHE, 'build.json'), 'utf8')); return m.Data || m; } catch { return {}; } })();
const KIND_OF_TYPE = { 'WeaponAttachment/IronSight': 'optics', 'WeaponAttachment/Barrel': 'barrel', 'WeaponAttachment/BottomAttachment': 'underbarrel', 'WeaponAttachment/Magazine': 'magazine' };
const KIND_LABEL = { optics: { en: 'Optics Attachment', ko: '조준경 부착물' }, barrel: { en: 'Barrel Attachment', ko: '총열 부착물' }, underbarrel: { en: 'Underbarrel Attachment', ko: '총열하부 부착물' }, magazine: { en: 'Weapon Magazine', ko: '무기 탄창' } };
/** group id -> [{ name, kind, label, minSize, maxSize, default, compatible[] }] and class -> { name{en,ko}, mfr, sub, size } */
function loadCompatibility() {
    const file = `${ROOT}/data/gear/attachments.json`;
    if (existsSync(file)) {
        const data = JSON.parse(readFileSync(file, 'utf8'));
        const info = new Map(Object.entries(data.attachments).map(([cls, a]) => [cls, { name: a.name, mfr: a.mfr || null, sub: a.sub || null, size: a.size ?? null }]));
        return { source: 'data/gear/attachments.json', ports: new Map(Object.entries(data.weapons).map(([id, w]) => [id, w.ports || []])), info };
    }
    const fallback = arg('--attach-model');
    if (!fallback || !existsSync(fallback)) { console.error('data/gear/attachments.json 이 없습니다. --attach-model <attach-model.json> 을 주세요.'); process.exit(2); }
    const data = JSON.parse(readFileSync(fallback, 'utf8'));
    const info = new Map(data.attachments.map((a) => [a.cls, { name: { en: a.name || a.cls, ko: a.nameKo || a.name || a.cls }, mfr: a.manufacturer?.name || null, sub: a.sub || null, size: a.size ?? null }]));
    const ports = new Map(data.siteGroups.map((g) => [g.id, (g.ports || []).filter((p) => p.types.some((t) => KIND_OF_TYPE[t])).map((p) => {
        const kind = KIND_OF_TYPE[p.types.find((t) => KIND_OF_TYPE[t])];
        // magazine ports: the default-loadout magazine only (correction from the independent check of the compatibility study)
        return { name: p.name, kind, label: KIND_LABEL[kind], minSize: p.minSize, maxSize: p.maxSize, default: p.default || null, compatible: kind === 'magazine' ? (p.default ? [p.default] : []) : p.compatible || [] };
    })]));
    return { source: fallback, ports, info };
}
const compat = loadCompatibility();

const archive = new Archive(P4K, CACHE); useArchive(archive);
const df = new DataForge(readFileSync(resolve(CACHE, 'Game2.dcb')));
const rig = new Rig(archive, df);
const paletteRecords = new Map(df.recordsOfType('TintPaletteTree').map((r) => [r.name, r]));
const paletteCache = new Map();
function palette(name) {
    if (!name) return null;
    if (!paletteCache.has(name)) { const rec = paletteRecords.get(name); paletteCache.set(name, rec ? paletteFromRecord(name, df.readRecord(rec, 10)) : null); }
    return paletteCache.get(name);
}

const encoder = USE_TEXTURES && !flag('--png') ? new WebpEncoder([ROOT, ...(arg('--node-modules-from') ? [arg('--node-modules-from').split('\\').join('/')] : [])]) : null;
const baker = new TextureBaker({ outDir: `${OUT}/tex`, size: TEX_SIZE, enabled: USE_TEXTURES, encoder });

// ------------------------------------------------------------------ geometry
const structureCache = new Map();
/** levels of detail a geometry file has: [0, 1, 2, ...] (0 = the file's own mesh companion) */
function lodsOf(path) {
    const out = [];
    if (archive.lookup(`${path}m`)) out.push(0);
    for (let n = 1; n <= 6; n += 1) if (archive.lookup(path.replace(/\.(\w+)$/, `_lod${n}.$1m`))) out.push(n);
    return out;
}
/** decoded geometry at the wanted level, or at the nearest more detailed level the file has */
function loadGeometry(path, lod = 0) {
    const entry = archive.lookup(path); if (!entry) throw new Error(`geometry file not in the game archive: ${path}`);
    if (!structureCache.has(entry.n)) structureCache.set(entry.n, parseStructure(archive.extract(entry)));
    const have = lodsOf(path);
    if (!have.length) throw new Error(`no mesh companion in the game archive for ${path}`);
    const use = have.filter((n) => n <= lod).pop() ?? have[0];
    const companion = archive.lookup(use ? path.replace(/\.(\w+)$/, `_lod${use}.$1m`) : `${path}m`);
    const mesh = parseMesh(archive.extract(companion));
    if (mesh.warnings.length) throw new Error(`${companion.n}: ${mesh.warnings.join('; ')}`);
    return { path: entry.n, structure: structureCache.get(entry.n), mesh, lod: use };
}
/** .mtl path for a geometry file: explicit path (.cdf / game database) wins, else the name stored in the geometry file */
function materialPath(geometryPath, explicit, structure) {
    if (explicit) return explicit;
    const name = structure.material?.name; if (!name) return null;
    const clean = name.replace(/\\/g, '/').replace(/\.mtl$/i, '');
    return /\//.test(clean) ? `${clean}.mtl` : `${geometryPath.split('/').slice(0, -1).join('/')}/${clean}.mtl`;
}

/** glTF material for each sub-material of one model; returns -1 when the sub-mesh is not drawn */
function makeMaterialOf(builder, pbr, itemKey, bake) {
    const memo = new Map();
    const resolveOne = (subset) => {
        const info = pbr.subMaterials[subset.materialId];
        if (!info) return builder.material(`${itemKey}#${subset.materialId}`, { name: `submaterial_${subset.materialId}`, pbrMetallicRoughness: { baseColorFactor: [0.4, 0.4, 0.4, 1], metallicFactor: 0, roughnessFactor: 0.6 }, extras: { kind: 'unresolved' } });
        const extras = { kind: info.kind, sub: info.id, shader: info.shader };
        const key = `${itemKey}#${info.id}`;
        if (info.kind === 'skip' || info.kind === 'screen') return -1;
        if (info.kind === 'surface') {
            // Standard glTF part: constants (+ the mask as occlusion texture, its R channel).
            // The viewer additionally reads extras.wear and the mask's G (gloss) and B (wear) channels.
            const mask = bake.mask(info);
            const json = { name: info.name, pbrMetallicRoughness: { baseColorFactor: [...info.color, info.opacity ?? 1], metallicFactor: info.metalness, roughnessFactor: info.roughness }, extras };
            if (mask) {
                json.occlusionTexture = { index: builder.texture(mask.file, { repeat: true }) };
                extras.mask = mask.has;
                if (info.wear && mask.has.wear) extras.wear = { color: info.wear.color, metalness: info.wear.metalness, roughness: info.wear.roughness };
            }
            // Multi-layer surface: the viewer mixes up to four layers with the blend map, which rides in the (otherwise
            // unused, factor 0) emissive texture slot so that the file stays plain glTF. The plain constants become those of
            // layer 4, the body layer under the paint, so that a generic glTF viewer shows the main colour.
            const blendImage = info.blend ? bake.blend(info) : null;
            if (blendImage) {
                const lay = (l) => (l ? { color: l.color, metalness: l.metalness, roughness: l.roughness } : null);
                json.emissiveTexture = { index: builder.texture(blendImage.file, { repeat: true }) };
                extras.blend = info.blend.layers.map((l) => (l ? { ...lay(l), wear: mask?.has.wear ? lay(l.wear) : null } : null));
                const body = info.blend.layers[3];
                if (body) Object.assign(json.pbrMetallicRoughness, { baseColorFactor: [...body.color, info.opacity ?? 1], metallicFactor: body.metalness, roughnessFactor: body.roughness });
            }
            if ((info.opacity ?? 1) < 1) json.alphaMode = 'BLEND';
            return builder.material(key, json);
        }
        if (info.kind === 'glow') return builder.material(key, { name: info.name, pbrMetallicRoughness: { baseColorFactor: [...info.color.map((v) => Math.min(1, v)), 1], metallicFactor: 0, roughnessFactor: info.roughness }, emissiveFactor: info.color.map((v) => Math.min(1, v)), extras });
        if (info.kind === 'lens') return builder.material(key, { name: info.name, pbrMetallicRoughness: { baseColorFactor: [0.015, 0.02, 0.03, 1], metallicFactor: 0, roughnessFactor: 0.05 }, extras });
        if (info.kind === 'glass') return builder.material(key, { name: info.name, pbrMetallicRoughness: { baseColorFactor: [...info.color.map((v) => Math.min(1, v * 0.6)), 0.3], metallicFactor: 0, roughnessFactor: 0.05 }, alphaMode: 'BLEND', extras });
        if (info.kind === 'decal' || info.kind === 'stencil') {
            const image = bake.decal(info);
            if (!image) return -1;
            // the viewer draws 'multiply' sheets with multiply blending (extras.overlay); a generic glTF viewer would show a white sheet
            if (image.mode === 'multiply') return builder.material(key, { name: info.name, pbrMetallicRoughness: { baseColorTexture: { index: builder.texture(image.file, { repeat: true }) }, metallicFactor: 0, roughnessFactor: 1 }, extras: { ...extras, overlay: 'multiply' } });
            const tint = info.kind === 'decal' ? (info.color || [1, 1, 1]).map((v) => Math.min(1, v)) : [1, 1, 1];
            return builder.material(key, { name: info.name, pbrMetallicRoughness: { baseColorFactor: [...tint, 1], baseColorTexture: { index: builder.texture(image.file, { repeat: true }) }, metallicFactor: 0, roughnessFactor: 0.6 }, alphaMode: 'BLEND', extras: { ...extras, overlay: 'alpha' } });
        }
        return -1;
    };
    return (subset) => { if (!memo.has(subset.materialId)) memo.set(subset.materialId, resolveOne(subset)); return memo.get(subset.materialId); };
}

/**
 * One .glb from a list of placed parts (a gun body, or one attachment).
 * parts: [{ name, type, file, material, position, rotation, bone, boneFound, exists, bad }]
 * Throws when a part cannot be read or placed — nothing is left out silently.
 */
function buildGlb({ key, parts, paletteName, lod, texturePrefix, texSize, portOfBone = null }) {
    const builder = new GlbBuilder(key, { quantize: true, texturePrefix });
    const pal = palette(paletteName); baker.size = texSize;
    const lodsUsed = []; const portBound = [];
    for (const part of parts) {
        if (part.bad) throw new Error(`body part "${part.name}": ${part.bad}`);
        if (part.type !== 'CA_SKIN' && part.type !== 'Model' && part.boneFound === false) throw new Error(`body part "${part.name}" hangs on bone "${part.bone}", which the skeleton does not have`);
        const model = loadGeometry(part.file, lod);
        const pbr = materialToPbr(materialPath(part.file, part.material, model.structure), pal);
        const itemKey = parts.length === 1 || part.type === 'CA_SKIN' || part.type === 'Model' ? key : `${key}_${part.name}`;
        const materialOf = makeMaterialOf(builder, pbr, itemKey, baker.prepare(itemKey));
        const placed = part.type !== 'CA_SKIN' && part.type !== 'Model';
        const port = placed && portOfBone ? portOfBone.get(String(part.bone || '').toLowerCase()) : null;
        const nodeName = port ? `portpart__${port}__${part.name}` : part.name;   // no ':' or '.': three.js strips those from node names
        if (port) portBound.push({ port, node: nodeName, part: part.name, bone: part.bone });
        builder.addModel({ name: nodeName, mesh: model.mesh, structure: model.structure, materialOf, placement: placed ? { position: part.position, rotation: part.rotation } : null, extras: port ? { portBound: port } : null });
        lodsUsed.push(model.lod);
    }
    const { glb, stats } = builder.finish({ item: key, lod });
    const back = readGlbBack(glb, { collect: true });
    if (back.triangles !== stats.triangles) throw new Error(`${key}: read-back triangle count ${back.triangles} differs from ${stats.triangles}`);
    if (!stats.triangles) throw new Error(`${key}: nothing to draw (every sub-mesh is a proxy, screen or missing its texture)`);
    if (![...back.min, ...back.max].every(Number.isFinite)) throw new Error(`${key}: non-finite vertex positions`);
    return { glb, triangles: stats.triangles, vertices: stats.vertices, drawCalls: stats.primitives, min: back.min, max: back.max, positions: Float32Array.from(back.positions), textures: builder.images.map((i) => i.uri.split('/').pop()), lodsUsed, portBound };
}

const r5 = (v) => +(+v).toFixed(5); const r6 = (v) => +(+v).toFixed(6);
/** engine-space box -> the Y-up box of the .glb: (x, y, z) -> (x, z, -y) */
const gltfBox = (b) => ({ min: [b.min[0], b.min[2], -b.max[1]].map(r5), max: [b.max[0], b.max[2], -b.min[1]].map(r5) });
const texEntry = (name) => { const f = baker.files.get(name); return { file: `${REL}/tex/${name}`, width: f.width, height: f.height, bytes: f.bytes }; };

// ------------------------------------------------------------------ 1. which guns, which parts
const groups = site.groups.filter((g) => !ONLY || ONLY.has(g.id));
if (ONLY) for (const id of ONLY) if (!site.groups.some((g) => g.id === id)) { console.error(`--only: 모르는 묶음 ${id}`); process.exit(2); }
const described = new Map();
for (const group of groups) {
    const baseClass = group.id.split('~')[0];
    const variantRecords = (group.variants || []).map((v) => rig.byId.get(v[0])).filter(Boolean);
    // The model is the group's representative, variants[0] — the item the screen names in its title and whose ports
    // attachments.json lists. (For most groups that is the base class; for a few it is a named skin, e.g. Ripper "Sunblock".)
    const record = variantRecords[0] || rig.byClass.get(baseClass.toLowerCase());
    described.set(group.id, record ? rig.describeWeapon(record) : null);
}
const neededParts = new Set();
for (const group of groups) for (const port of compat.ports.get(group.id) || []) { for (const cls of port.compatible || []) neededParts.add(cls); if (port.default) neededParts.add(port.default); }

// ------------------------------------------------------------------ 2. attachments (shared by every gun)
const partData = new Map();      // cls -> { ok, reason } | { ok, file, triangles, bytes, min, max, positions, textures, lod }
function exportPart(cls) {
    const info = rig.describeAttachment(cls);
    if (!info) return { ok: false, reason: 'class is not in the game database' };
    if (!info.geometry) return { ok: false, reason: 'no geometry path in the game database' };
    const model = rig.loadModel(info.geometry);
    if (model.errors.length) return { ok: false, reason: model.errors.join('; ') };
    const parts = model.kind === 'cdf' ? rig.withEntityMaterial(model.parts, info.dcb) : [{ name: cls, type: 'Model', file: model.path, material: info.material, position: [0, 0, 0], rotation: [0, 0, 0, 1] }];
    if (!parts.length) return { ok: false, reason: 'the model has no drawable part' };
    try {
        let built = null;
        for (const lod of [0, 1, 2, 3]) {
            const candidate = buildGlb({ key: cls, parts, paletteName: info.palette, lod, texturePrefix: '../tex/', texSize: PART_TEX_SIZE });
            if (built && candidate.triangles >= built.triangles) break;          // no lower-detail model
            built = candidate; built.lod = lod;
            if (built.triangles <= PART_BUDGET) break;
        }
        writeFileSync(`${OUT}/parts/${cls}.glb`, built.glb);
        return { ok: true, file: `${REL}/parts/${cls}.glb`, triangles: built.triangles, bytes: built.glb.length, min: built.min, max: built.max, positions: built.positions, textures: built.textures, lod: built.lod, sourceGeometry: model.path };
    } catch (error) { return { ok: false, reason: error.message }; }
}
let done = 0;
for (const cls of [...neededParts].sort()) {
    partData.set(cls, exportPart(cls)); done += 1;
    const p = partData.get(cls);
    console.log(`part ${String(done).padStart(3)}/${neededParts.size} ${cls.padEnd(44)} ${p.ok ? `${String(p.triangles).padStart(6)} tris ${String(p.bytes).padStart(8)} B lod${p.lod}` : `FAILED: ${p.reason}`}`);
    if (done % 12 === 0) await baker.flush();
}
await baker.flush();

// ------------------------------------------------------------------ 3. guns
const weaponsOut = {}; const checksOut = {};
for (const group of groups) {
    const id = group.id; const W = described.get(id); const dir = `${OUT}/weapons/${id}`;
    const failWeapon = (reason, extra = {}) => { weaponsOut[id] = { ok: false, reason, manifest: `${REL}/weapons/${id}/manifest.json`, triangles: 0, bytes: 0, ...extra }; checksOut[id] = { ok: false, skipped: reason }; if (existsSync(dir)) rmSync(dir, { recursive: true }); console.log(`gun  ${id.padEnd(34)} NOT EXPORTED: ${reason}`); };
    if (!W) { failWeapon('no weapon record in the game database for this group'); continue; }
    if (!W.geometry) { failWeapon('the game database gives this weapon no 3D model'); continue; }
    if (!W.geometryExists) {
        // e.g. a variant whose own .cdf is not shipped: we do not guess that it looks like its sibling
        const sibling = site.groups.find((g) => g.id !== id && described.get(g.id)?.geometryExists && W.geometry.startsWith(described.get(g.id).geometry.replace(/\.cdf$/, '')));
        failWeapon(`the model file named in the game database is not in the game archive (${W.geometry})`, sibling ? { looksLikeGroup: sibling.id } : {}); continue;
    }
    if (W.errors.length) { failWeapon(W.errors.join('; ')); continue; }
    if (!W.body.length) { failWeapon('the weapon model has no drawable body part'); continue; }

    // ports the screen offers (four kinds), with the transform read from the model
    const ports = []; const portProblems = [];
    for (const port of compat.ports.get(id) || []) {
        const real = W.ports[port.name];
        if (!real || real.status !== 'ok') { portProblems.push(`${port.name}: ${real ? real.status : 'port is not in the weapon record'}`); continue; }
        ports.push({ ...port, helper: real.helper, bone: real.bone, via: real.via, types: real.types, position: real.position, rotation: real.rotation, gameDefault: real.defaultItem || port.default || null });
    }
    const portOfBone = new Map(ports.map((p) => [String(p.bone).toLowerCase(), p.name]));

    try {
        // example loadout: the game default where there is one, else a part of the gun's own maker, else the first by name
        const maker = id.slice(0, 4);
        const example = {}; const game = {};
        for (const port of ports) {
            const usable = [...new Set([...(port.default ? [port.default] : []), ...(port.compatible || [])])].filter((cls) => partData.get(cls)?.ok);
            port.parts = usable;
            game[port.name] = port.default && usable.includes(port.default) ? port.default : null;
            const sorted = [...usable].sort();
            example[port.name] = game[port.name] || sorted.find((cls) => cls.startsWith(maker)) || sorted[0] || null;
        }
        const extraTriangles = Object.values(example).reduce((sum, cls) => sum + (cls ? partData.get(cls).triangles : 0), 0);

        // body detail level: the most detailed one that keeps the example loadout within the budget (or the lightest there is).
        // Only that level is written: the screen has no detail switch, so a second file would be shipped and never fetched.
        const lods = [...new Set(W.body.flatMap((b) => lodsOf(b.file)))].sort((a, b) => a - b);
        const keep = []; let chosen = null; let last = null;
        for (const lod of lods) {
            const b = buildGlb({ key: id, parts: W.body, paletteName: W.palette, lod, texturePrefix: '../../tex/', texSize: TEX_SIZE, portOfBone });
            if (last && b.triangles >= last.triangles) break;          // this level is not lighter than the one before: stop
            b.lod = lod; last = b;
            if (b.triangles + extraTriangles <= BUDGET) { chosen = b; keep.push(b); break; }
        }
        if (!chosen) { if (!last) throw new Error('no mesh for the weapon body in the game archive'); chosen = last; keep.push(last); }
        if (existsSync(dir)) rmSync(dir, { recursive: true });
        mkdirSync(dir, { recursive: true });
        for (const b of keep) writeFileSync(`${dir}/body_lod${b.lod}.glb`, b.glb);
        await baker.flush();

        const usedParts = [...new Set(ports.flatMap((p) => p.parts))];
        const textureNames = [...new Set([...keep.flatMap((b) => b.textures), ...usedParts.flatMap((cls) => partData.get(cls).textures)])].sort();
        const manifest = {
            meta: {
                version: VERSION, gameBuild: build.Version || null, changelist: build.RequestedP4ChangeNum || null,
                axes: 'glTF Y-up, metres. engine (x right, y forward/muzzle, z up) -> (x, z, -y); muzzle points to -Z.',
                placement: 'attachment model origin = attach point; world = port(position, rotation) applied to the part scene.',
                materials: 'per sub-material constants (base layer + wear layer) from the game layer libraries and tint palette; material.extras.mask / extras.wear + the occlusion texture (R occlusion, G gloss, B wear) drive the layered look; extras.overlay = multiply | alpha marks decal sheets. Heuristic conversion, not a game render.',
                paths: 'file paths are relative to the site root',
            },
            weapon: {
                id, cls: W.cls, skinTag: W.skinTag || null, name: group.name, kind: group.kind,
                bodyParts: W.body.map((b) => ({ name: b.name, type: b.type, bone: b.bone || null, file: b.file })),
                body: keep.map((b) => ({ file: `${REL}/weapons/${id}/body_lod${b.lod}.glb`, lod: b.lod, bytes: b.glb.length, triangles: b.triangles, vertices: b.vertices, drawCalls: b.drawCalls })),
                defaultLod: chosen.lod,
                bbox: gltfBox(chosen),
                bboxEngine: { min: chosen.min.map(r5), max: chosen.max.map(r5) },
                // body parts that the game hangs on the very bone a port uses (e.g. a fixed iron sight on the optic rail).
                // They are separate root nodes of the body .glb, named as below (node.extras.portBound = port name, which three.js
                // exposes as object.userData.portBound). Whether the game hides them when the port is filled is not in the files we read.
                portBoundParts: chosen.portBound,
                helpersEngine: Object.fromEntries(Object.entries(W.helpers).map(([k, v]) => [k, v.map(r5)])),
            },
            ports: ports.map((p) => ({
                name: p.name, kind: p.kind, label: p.label || KIND_LABEL[p.kind], helper: p.helper, types: p.types, minSize: p.minSize, maxSize: p.maxSize, editable: p.editable ?? null,
                position: toYUp(p.position).map(r6), rotation: quatToYUp(p.rotation).map(r6), enginePosition: p.position.map(r6), engineRotation: p.rotation.map(r6),
                gameDefault: p.gameDefault, compatibleCount: (p.compatible || []).length, parts: p.parts, missingParts: [...new Set([...(p.default ? [p.default] : []), ...(p.compatible || [])])].filter((cls) => !p.parts.includes(cls)),
            })),
            parts: Object.fromEntries(usedParts.map((cls) => { const d = partData.get(cls); const i = compat.info.get(cls) || {}; return [cls, { cls, name: i.name || { en: cls, ko: cls }, manufacturer: i.mfr || null, subType: i.sub || null, size: i.size ?? null, file: d.file, bytes: d.bytes, triangles: d.triangles, bbox: gltfBox(d) }]; })),
            loadouts: { game, demo: example },
            textures: textureNames.map(texEntry),
        };
        writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest));

        const result = checkWeapon({ body: chosen, ports: ports.map((p) => ({ name: p.name, kind: p.kind, position: p.position, rotation: p.rotation, parts: p.parts })), partData, helpers: W.helpers });
        for (const problem of portProblems) result.failures.push({ port: problem.split(':')[0], check: 'port-resolved', detail: problem });
        for (const port of manifest.ports) for (const cls of port.missingParts) result.failures.push({ port: port.name, part: cls, check: 'part-model', detail: partData.get(cls)?.reason || 'no model' });
        if (chosen.portBound.length) result.notes.push(`body part(s) on a port bone: ${chosen.portBound.map((b) => `${b.part} on ${b.bone} (${b.port})`).join(', ')}`);
        result.ok = result.failures.length === 0;
        checksOut[id] = result;
        const exampleTriangles = chosen.triangles + extraTriangles;
        weaponsOut[id] = { ok: true, manifest: `${REL}/weapons/${id}/manifest.json`, triangles: chosen.triangles, bytes: chosen.glb.length, lod: chosen.lod, lods: keep.map((b) => b.lod), exampleTriangles, ports: ports.length, ...(portProblems.length ? { portsMissing: portProblems } : {}) };
        console.log(`gun  ${id.padEnd(34)} lod${chosen.lod} ${String(chosen.triangles).padStart(6)} tris ${String(chosen.glb.length).padStart(8)} B; example ${String(exampleTriangles).padStart(6)} tris; ports ${ports.length}; parts ${usedParts.length}; check ${result.ok ? 'ok' : `${result.failures.length} FAILURES`}`);
    } catch (error) { failWeapon(error.message); }
}
await baker.flush();
if (encoder) await encoder.close();
archive.close();

// ------------------------------------------------------------------ 4. lists
const modelsFile = `${ROOT}/data/gear/models.json`; const checkFile = `${ROOT}/data/gear/models.check.json`;
const previous = ONLY && existsSync(modelsFile) ? JSON.parse(readFileSync(modelsFile, 'utf8')) : { weapons: {}, parts: {} };
const previousCheck = ONLY && existsSync(checkFile) ? JSON.parse(readFileSync(checkFile, 'utf8')) : { weapons: {} };
const order = (object, ids) => Object.fromEntries(ids.filter((k) => object[k]).map((k) => [k, object[k]]));
const partsOut = { ...previous.parts };
for (const [cls, d] of partData) partsOut[cls] = d.ok ? { ok: true, file: d.file, triangles: d.triangles, bytes: d.bytes } : { ok: false, reason: d.reason, file: `${REL}/parts/${cls}.glb`, triangles: 0, bytes: 0 };
const allWeapons = order({ ...previous.weapons, ...weaponsOut }, site.groups.map((g) => g.id));
const folderBytes = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? folderBytes(`${dir}/${e.name}`) : statSync(`${dir}/${e.name}`).size), 0) : 0);
const totals = { bytes: folderBytes(OUT), weaponBytes: folderBytes(`${OUT}/weapons`), partBytes: folderBytes(`${OUT}/parts`), textureBytes: folderBytes(`${OUT}/tex`) };
// assetVersion selects the matching private R2 folder and goes into model URLs.
// Each export needs a new stamp so old and new files never share a release.
const stampedAt = new Date();
const models = { version: VERSION, gameBuild: build.Version || null, generatedAt: stampedAt.toISOString(), assetVersion: `${String(build.Version || 'build').replace(/[^\w.-]/g, '')}-${stampedAt.getTime().toString(36)}`, compatibilityFrom: compat.source, totals, weapons: allWeapons, parts: Object.fromEntries(Object.entries(partsOut).sort(([a], [b]) => a.localeCompare(b))) };
writeFileSync(modelsFile, `${JSON.stringify(models, null, 1)}\n`);
syncModelVersion(models.assetVersion);
const allChecks = order({ ...previousCheck.weapons, ...checksOut }, site.groups.map((g) => g.id));
const list = Object.values(allChecks);
const check = { version: VERSION, gameBuild: build.Version || null, generatedAt: models.generatedAt,
    summary: { guns: list.length, exported: list.filter((c) => !c.skipped).length, clean: list.filter((c) => c.ok).length, withFailures: list.filter((c) => !c.skipped && !c.ok).length, notExported: list.filter((c) => c.skipped).length, checks: list.reduce((s, c) => s + (c.checks || 0), 0), failures: list.reduce((s, c) => s + (c.failures?.length || 0), 0) },
    weapons: allChecks };
writeFileSync(checkFile, `${JSON.stringify(check, null, 1)}\n`);

const okGuns = Object.values(allWeapons).filter((w) => w.ok).length;
const byKind = {};
for (const g of site.groups) { if (!byKind[g.kind]) byKind[g.kind] = { ok: 0, all: 0 }; byKind[g.kind].all += 1; if (allWeapons[g.id]?.ok) byKind[g.kind].ok += 1; }
console.log(`\nby class: ${Object.entries(byKind).map(([kind, k]) => `${kind} ${k.ok}/${k.all}`).join(', ')}`);
console.log(`guns ${okGuns}/${Object.keys(allWeapons).length} exported; parts ${Object.values(models.parts).filter((p) => p.ok).length}/${Object.keys(models.parts).length}`);
console.log(`bytes: total ${totals.bytes} (bodies ${totals.weaponBytes}, parts ${totals.partBytes}, textures ${totals.textureBytes})`);
console.log(`checks: ${check.summary.checks} run, ${check.summary.failures} failures in ${check.summary.withFailures} guns`);
for (const note of baker.notes) console.log(`note: ${note}`);
