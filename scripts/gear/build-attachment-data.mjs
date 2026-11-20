#!/usr/bin/env node
/**
 * 개인 무기 부착물 자료 — 설치된 게임 파일에서 직접 뽑는다. (무기 개조 화면용)
 *
 * 입력(--cache-dir): Game2.dcb, global.ini(영어), build.json
 *      --ko-ini <한국어 패치 global.ini>  (기본: 게임 설치 폴더의 한국어 패치)
 *      --weapons <weapons.json>          (기본: data/gear/weapons.json)
 *      --out <출력 파일>                  (기본: data/gear/attachments.json)
 *      --check                            (파일을 쓰지 않고, 이미 있는 출력과 같은지만 확인)
 * 출력: data/gear/attachments.json
 * 사용: node scripts/gear/build-attachment-data.mjs --cache-dir <폴더>
 * 외부 서비스에 접근하지 않는다.
 *
 * 맞는 부착물을 고르는 규칙(게임 자료가 뜻하는 대로, 네 조건 모두 참):
 *   (1) 자리 Types 중 하나가 물건 Type 과 같고, SubTypes 가 비었거나 물건 SubType 을 담는다
 *   (2) 자리 MinSize ≤ 물건 Size ≤ 자리 MaxSize
 *   (3) 자리 RequiredPortTags 가 모두 물건 Tags 안에 있다   ← "모두"는 자료 정황으로 뒷받침된 추정(게임 안 시험 전)
 *   (4) 물건 RequiredTags 가 모두 자리 PortTags 안에 있다
 * 탄창 자리는 규칙 목록을 쓰지 않는다: 그 무기의 기본 장착 탄창 하나만 싣는다
 *   (규칙만으로는 P4-AR·CQ7 탄창이 서로 맞는 것으로 나오는데 게임 안에서 확인되지 않았다).
 * 묶음의 자리는 묶음 대표(weapons.json variants[0])의 것. 기본 장착이 다른 변종은 variantDefaults 에 따로 싣는다.
 * 수치는 게임 파일 그대로이며 게임 안에서 실측한 값이 아니다. 읽지 못한 값은 0 으로 채우지 않고 칸을 뺀다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DataForge } from '../gamedata/dataforge.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
const CACHE = arg('--cache-dir');
if (!CACHE || !existsSync(resolve(CACHE, 'Game2.dcb'))) { console.error('--cache-dir <Game2.dcb 가 있는 폴더> 가 필요합니다.'); process.exit(2); }
const KO_INI = arg('--ko-ini') || 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/data/Localization/korean_(south_korea)/global.ini';
if (!existsSync(KO_INI)) { console.error(`한국어 패치 global.ini 를 찾지 못했습니다: ${KO_INI}\n--ko-ini <경로> 로 알려 주세요.`); process.exit(2); }
const WEAPONS = resolve(arg('--weapons') || resolve(ROOT, 'data/gear/weapons.json'));
const OUT = resolve(arg('--out') || resolve(ROOT, 'data/gear/attachments.json'));
const CHECK_ONLY = process.argv.includes('--check');

const dcb = readFileSync(resolve(CACHE, 'Game2.dcb'));
const df = new DataForge(dcb);
if (!df.consistent) { console.error('Game2.dcb 구조가 파일 끝과 맞지 않습니다.'); process.exit(2); }
const manifest = JSON.parse(readFileSync(resolve(CACHE, existsSync(resolve(CACHE, 'build.json')) ? 'build.json' : 'build_manifest.id'), 'utf8'));
const build = manifest.Data || manifest;

function loadIni(path) {
    const map = new Map();
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) { const at = line.indexOf('='); if (at > 0) map.set(line.slice(0, at).replace(/^\uFEFF/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim()); }
    return map;
}
const en = loadIni(resolve(CACHE, 'global.ini'));
const ko = loadIni(KO_INI);
const raw = (map, key) => { if (!key || !String(key).startsWith('@')) return undefined; const value = map.get(String(key).slice(1).toLowerCase()); return value && !/^LOC_|PLACEHOLDER/.test(value) ? value : undefined; };
const lookup = (map, key) => raw(map, key)?.replace(/\\n/g, ' ').replace(/<[^>]+>/g, '').trim() || undefined;
const both = (key) => { const e = lookup(en, key); return e ? { en: e, ko: lookup(ko, key) || e } : undefined; };

const round = (value, digits = 4) => (typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : undefined);
const prune = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)));
// 태그는 공백으로 나뉜 낱말. (개인 무기 쪽 태그에는 '$' 머리표가 없어 그대로 비교한다.)
const splitTags = (text) => String(text || '').split(/\s+/).filter(Boolean);
const component = (entity, type) => (entity?.Components || []).find((c) => c && c.__type === type);
const clsOf = (record) => record.name.replace(/^EntityClassDefinition\./, '');
const refCls = (ref) => (ref?.name ? String(ref.name).replace(/^[A-Za-z]+\./, '') : undefined);
const tally = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); m.set(k, (m.get(k) || 0) + 1); } return Object.fromEntries([...m].sort((a, b) => b[1] - a[1])); };

const entities = df.recordsOfType('EntityClassDefinition');
const tagName = new Map(df.recordsOfType('Tag').map((t) => [t.id, df.readRecord(t, 0).tagName]));
const manufacturers = new Map(df.recordsOfType('SCItemManufacturer').map((record) => [record.id, df.readRecord(record, 3)]));
const manufacturerOf = (ref) => { const m = ref?.__record ? manufacturers.get(ref.__record) : null; return m ? both(m.Localization?.Name) : undefined; };

// ───────────── 1. 장착 정의 색인 (전체 엔티티)
const index = [];
for (const record of entities) {
    const def = component(df.readRecord(record, 1), 'SAttachableComponentParams')?.AttachDef;
    if (!def) continue;
    index.push({ record, cls: clsOf(record), file: record.file, type: def.Type, sub: def.SubType, size: def.Size, tags: splitTags(def.Tags), requiredTags: splitTags(def.RequiredTags), nameKey: def.Localization?.Name, descKey: def.Localization?.Description, manufacturer: def.Manufacturer });
}
const byCls = new Map(index.map((x) => [x.cls.toLowerCase(), x]));
const byId = new Map(index.map((x) => [x.record.id, x]));

// ───────────── 2. 부착물 후보: 개인 무기 폴더의 WeaponAttachment 가운데 이름이 있고 플레이어가 얻을 수 있는 것
const INTERNAL = /_ai$|_AI_|_npc|_template|_test|placeholder|_prop$|_dev/i;
const FAKE = /FakeOptic|FakeHologram|^vlk_/i;   // 쌍안경 속 가짜 조준경, 거치 기관총의 가짜 홀로그램, 생물 공격용 "탄창": 다른 물건 이름을 빌려 쓴다
const internalReason = (x) => (!/\/entities\/scitem\/weapons\//.test(x.file) ? 'not a personal-weapon item' : /weapon_mounted\/parts/.test(x.file) ? 'mounted-gun part' : /\/dev\//.test(x.file) || INTERNAL.test(x.cls) ? 'template/test class' : FAKE.test(x.cls) ? 'fake/creature item' : !lookup(en, x.nameKey) ? 'no display name' : null);
const candidates = index.filter((x) => x.type === 'WeaponAttachment' && !internalReason(x));

const KIND = { IronSight: 'optics', Barrel: 'barrel', BottomAttachment: 'underbarrel', Magazine: 'magazine' };
const KIND_LABEL_KEY = { optics: '@itemPort_OpticsSlot', barrel: '@itemPort_BarrelSlot', underbarrel: '@itemPort_UnderbarrelSlot', magazine: '@itemPort_magazine_attach' };
const KIND_ORDER = ['optics', 'barrel', 'underbarrel', 'magazine'];

function fit(port, item) {
    const typeOk = port.types.some((t) => t.type === item.type && (t.subTypes.length === 0 || t.subTypes.includes(item.sub)));
    const sizeOk = port.minSize <= item.size && item.size <= port.maxSize;
    const portReqOk = port.requiredPortTags.every((tag) => item.tags.includes(tag));
    const itemReqOk = item.requiredTags.every((tag) => port.portTags.includes(tag));
    return { typeOk, sizeOk, portReqOk, itemReqOk, fits: typeOk && sizeOk && portReqOk && itemReqOk };
}
const why = (r) => [!r.typeOk && 'type', !r.sizeOk && 'size', !r.portReqOk && 'port-required tag', !r.itemReqOk && 'item-required tag'].filter(Boolean).join('+');

function portsOf(entity) {
    return (component(entity, 'SItemPortContainerComponentParams')?.Ports || []).filter(Boolean).map((p) => ({
        name: p.Name, displayKey: p.DisplayName,
        types: (p.Types || []).map((t) => ({ type: t.Type, subTypes: (t.SubTypes || []).slice() })),
        minSize: p.MinSize, maxSize: p.MaxSize,
        portTags: splitTags(p.PortTags), requiredPortTags: splitTags(p.RequiredPortTags), flags: splitTags(p.Flags),
        tags: (p.Tags || []).map((t) => tagName.get(t?.__record) ?? refCls(t)).filter(Boolean),
    }));
}
function defaultsOf(entity) {
    const loadout = component(entity, 'SEntityComponentDefaultLoadoutParams')?.loadout;
    const out = new Map();
    for (const entry of Array.isArray(loadout?.entries) ? loadout.entries : []) {
        const cls = entry.entityClassName || refCls(entry.entityClassReference) || '';
        if (entry.itemPortName && cls) out.set(entry.itemPortName, cls);
    }
    return out;
}

// ───────────── 3. 묶음별 자리
const site = JSON.parse(readFileSync(WEAPONS, 'utf8'));
const weaponsOut = {}; const used = new Set();
const census = { groups: site.groups.length, groupsWithPorts: 0, ports: 0, portsByKind: {}, editablePorts: 0, pairs: 0, pairsByKind: {}, skippedPorts: [], hiddenPorts: [], magazineRuleWouldOfferMore: [], missingVariants: [], variantPortLayoutDiffers: [] };
const selfCheck = { defaults: 0, pass: 0, exceptions: [] }; const unnamed = new Set();
const noteDefault = (owner, port, cls, scope) => {
    selfCheck.defaults += 1;
    const item = byCls.get(String(cls).toLowerCase());
    if (!item) { selfCheck.exceptions.push({ weapon: owner, port: port.name, item: cls, scope, reason: 'class not found in game database' }); return null; }
    const result = fit(port, item); const internal = internalReason(item);
    if (result.fits && !internal) { selfCheck.pass += 1; return item; }
    // 이름 없는 기본 탄창: 총에 실제로 꽂혀 나오므로 자리에는 남기되 unnamed 표시를 한다.
    if (result.fits && internal === 'no display name' && item.sub === 'Magazine') { unnamed.add(item.cls); selfCheck.exceptions.push({ weapon: owner, port: port.name, item: item.cls, scope, reason: 'passes the rule but has no display name in the game text (kept, marked unnamed)' }); return item; }
    selfCheck.exceptions.push({ weapon: owner, port: port.name, item: item.cls, scope, reason: [!result.fits && `fails rule (${why(result)})`, internal && `not a player item (${internal})`].filter(Boolean).join('; ') });
    return internal ? null : item;
};

for (const group of site.groups) {
    const members = group.variants.map((variant) => byId.get(variant[0]));
    group.variants.forEach((variant, i) => { if (!members[i]) census.missingVariants.push(`${group.id}: ${variant[0]} (${variant[1]})`); });
    const head = members[0];
    if (!head) { weaponsOut[group.id] = { ports: [] }; continue; }
    const headEntity = df.readRecord(head.record, 12);
    const headPorts = portsOf(headEntity); const headDefaults = defaultsOf(headEntity);
    const ports = [];
    for (const port of headPorts) {
        if (!port.types.length) continue;
        const subs = port.types.filter((t) => t.type === 'WeaponAttachment').flatMap((t) => t.subTypes);
        const kind = subs.length === 1 ? KIND[subs[0]] : undefined;
        if (!kind) { census.skippedPorts.push(`${group.id}.${port.name} (${port.types.map((t) => `${t.type}/${t.subTypes.join('|')}`).join(', ')})`); continue; }
        // 도구의 캐니스터·소화기 몸통 자리는 탄창 종류로 적혀 있지만 무기 탄창이 아니다(빈 통/채운 통처럼 고를 것이 여럿이라 "기본 하나"로 단정할 수 없다).
        if (kind === 'magazine' && port.name !== 'magazine_attach') { census.skippedPorts.push(`${group.id}.${port.name} (도구 자리: ${port.types.map((t) => `${t.type}/${t.subTypes.join('|')}`).join(', ')})`); continue; }
        if (port.tags.includes('hideFromPlayer')) { census.hiddenPorts.push(`${group.id}.${port.name}`); continue; }
        const byRule = candidates.filter((item) => fit(port, item).fits).map((item) => item.cls);
        const defaultCls = headDefaults.get(port.name);
        const defaultItem = defaultCls ? noteDefault(head.cls, port, defaultCls, 'group') : null;
        let compatible = byRule;
        if (kind === 'magazine') {
            compatible = defaultItem ? [defaultItem.cls] : [];
            if (byRule.length > 1) census.magazineRuleWouldOfferMore.push(`${group.id}.${port.name}: ${byRule.join(', ')}`);
        } else if (defaultItem && !compatible.includes(defaultItem.cls)) compatible = [defaultItem.cls, ...compatible];   // 기본 장착은 규칙을 벗어나도 실제로 달려 나온다(예외 목록에 적힌다)
        const family = port.requiredPortTags.includes('ballistic_attach') ? 'ballistic' : port.requiredPortTags.includes('energy_attach') ? 'energy' : undefined;
        ports.push(prune({
            name: port.name, kind, label: both(port.displayKey) || both(`@itemPort_${port.name}`) || both(KIND_LABEL_KEY[kind]),
            minSize: port.minSize, maxSize: port.maxSize, family,
        }));
        const last = ports[ports.length - 1];
        // editable: 게임 자리의 'inventory' 표시(= 장비 화면에서 갈아 끼울 수 있는 자리로 보임, 게임 안 확인 전). 탄창은 한 가지뿐이라 고르지 않는다.
        last.editable = kind !== 'magazine' && port.flags.includes('inventory');
        last.default = defaultItem ? defaultItem.cls : null;
        last.compatible = compatible;
        for (const cls of compatible) used.add(cls);
        census.ports += 1; census.portsByKind[kind] = (census.portsByKind[kind] || 0) + 1; if (last.editable) census.editablePorts += 1;
        census.pairs += compatible.length; census.pairsByKind[kind] = (census.pairsByKind[kind] || 0) + compatible.length;
    }
    ports.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    // 변종마다 다른 기본 장착 (예: 보상판은 조준경·보정기가 달려 나온다)
    const variantDefaults = {};
    const layout = (list) => JSON.stringify(list.filter((p) => p.types.length).map((p) => [p.name, p.types, p.minSize, p.maxSize, p.portTags, p.requiredPortTags, p.flags]));
    for (const member of members.slice(1)) {
        if (!member) continue;
        const entity = df.readRecord(member.record, 12); const memberPorts = portsOf(entity); const defaults = defaultsOf(entity);
        if (layout(memberPorts) !== layout(headPorts)) census.variantPortLayoutDiffers.push(`${group.id}: ${member.cls}`);
        const diff = {};
        for (const out of ports) {
            const port = memberPorts.find((p) => p.name === out.name); if (!port) continue;
            const cls = defaults.get(out.name);
            const item = cls ? byCls.get(cls.toLowerCase()) : null;
            const value = item && (!internalReason(item) || unnamed.has(item.cls)) ? item.cls : null;
            if (value === out.default) continue;
            if (cls) { const checked = noteDefault(member.cls, port, cls, 'variant'); if (!checked) continue; used.add(checked.cls); }
            diff[out.name] = value;
        }
        if (Object.keys(diff).length) variantDefaults[member.record.id] = diff;
    }
    if (ports.length) census.groupsWithPorts += 1;
    weaponsOut[group.id] = prune({ ports, variantDefaults });
    if (!weaponsOut[group.id].ports) weaponsOut[group.id].ports = [];
}

// ───────────── 4. 부착물 정의·수치
const descLines = (key) => {
    const parse = (text) => {
        const out = [];
        for (const line of String(text || '').split(/\\n/).map((s) => s.trim())) {
            if (!line) continue;
            const m = line.match(/^([^:：]{1,40})[:：]\s*(.+)$/);
            if (!m) break;                       // 설명 본문이 시작되면 멈춘다
            out.push([m[1].trim(), m[2].trim()]);
        }
        return out;
    };
    const e = parse(raw(en, key)); const k = parse(raw(ko, key));
    return e.map(([label, value], i) => ({ label, value, labelKo: k.length === e.length ? k[i][0] : undefined, valueKo: k.length === e.length ? k[i][1] : undefined }));
};
const HEADER_LINES = new Set(['manufacturer', 'size', 'attachment point', 'type', 'item type', 'class']);
const SUB_BY_TOKEN = { holo: 'holographic', rdot: 'reddot', tsco: 'telescopic', comp: 'compensator', supp: 'suppressor', flhd: 'flashhider', stab: 'stabilizer', lasr: 'laser', flsh: 'flashlight' };
const slug = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || undefined;
const mult = (value) => { const v = round(value); return v === undefined || v === 1 ? undefined : v; };      // 배율: 1 = 변화 없음
const add = (value) => { const v = round(value); return v === undefined || v === 0 ? undefined : v; };       // 더하는 값: 0 = 변화 없음
const triple = (o, keys) => { const list = keys.map((k) => round(o?.[k])); return list.every((v) => v !== undefined) && list.some((v) => v !== 1) ? list : undefined; };

// 내보내지 않은 보정 칸(값이 기준과 다른 것)을 세어 census 에 알린다.
const EXPORTED_PATHS = new Set(['damageMultiplier', 'fireRateMultiplier', 'projectileSpeedMultiplier', 'heatGenerationMultiplier', 'chargeTimeMultiplier', 'ammoCostMultiplier', 'soundRadiusMultiplier', 'pellets', 'burstShots',
    'aimModifier.zoomScale', 'aimModifier.secondZoomScale', 'aimModifier.zoomTimeScale',
    'spreadModifier.minMultiplier', 'spreadModifier.maxMultiplier', 'spreadModifier.firstAttackMultiplier', 'spreadModifier.attackMultiplier', 'spreadModifier.decayMultiplier',
    'recoilModifier.aimRecoilModifier.curveRecoil.yawMaxDegreesModifier', 'recoilModifier.aimRecoilModifier.curveRecoil.pitchMaxDegreesModifier', 'recoilModifier.aimRecoilModifier.curveRecoil.rollMaxDegreesModifier',
    'recoilModifier.curveRecoil.recoilTimeModifier', 'recoilModifier.fireRecoilStrengthMultiplier', 'recoilModifier.randomnessMultiplier', 'recoilModifier.decayMultiplier',
    'recoilModifier.aimRecoilModifier.shotKickMultiplier.x', 'recoilModifier.aimRecoilModifier.shotKickMultiplier.y', 'recoilModifier.headRotationMultiplier.x', 'recoilModifier.headRotationMultiplier.y', 'recoilModifier.headRotationMultiplier.z',
    ...['x', 'y', 'z'].flatMap((a) => [`recoilModifier.curveRecoil.positionModifiers.${a}MaxValueModifier`, `recoilModifier.curveRecoil.rotationModifiers.${a}MaxValueModifier`])]);
const notExported = new Map(); let truncated = 0;
function flatten(value, path, out) {
    if (value && typeof value === 'object') {
        if (value.__ref) { truncated += 1; return out; }
        if (Array.isArray(value)) value.forEach((v, i) => { flatten(v, `${path}[${i}]`, out); });
        else if (!value.__record) for (const k of Object.keys(value)) if (k !== '__type') flatten(value[k], path ? `${path}.${k}` : k, out);
    } else if (typeof value === 'number') out.push([path, round(value, 6)]);
    return out;
}

const attachmentsOut = {}; const descMismatch = []; const axisDiffers = []; const mfrConflict = [];
const gameLabel = new Map();     // 영어 설명 낱말 → 한국어 패치 낱말 (예: Aim Time → 조준 시간)
for (const cls of [...used].sort((a, b) => a.localeCompare(b))) {
    const x = byCls.get(cls.toLowerCase());
    const entity = df.readRecord(x.record, 12);
    const kind = KIND[x.sub];
    const mod = component(entity, 'SWeaponModifierComponentParams');
    const ammo = component(entity, 'SAmmoContainerComponentParams');
    const aux = component(entity, 'SAuxiliaryWeaponActionComponentParams');
    const ws = mod?.modifier?.weaponStats; const aim = ws?.aimModifier; const spread = ws?.spreadModifier; const recoil = ws?.recoilModifier;
    const lines = descLines(x.descKey);
    for (const line of lines) if (line.labelKo && !gameLabel.has(line.label.toLowerCase())) gameLabel.set(line.label.toLowerCase(), { en: line.label, ko: line.labelKo });
    const typeLine = lines.find((line) => /^(type|item type)$/i.test(line.label));
    const stats = {};
    if (ws) {
        if (kind === 'optics') {
            Object.assign(stats, {
                zoom: round(aim?.zoomScale), zoom2: mult(aim?.secondZoomScale),
                scope: mod.scopeAttachmentParams?.scopeType && mod.scopeAttachmentParams.scopeType !== 'None' ? String(mod.scopeAttachmentParams.scopeType).toLowerCase() : undefined,
                zeroMax: add(mod.zeroingParams?.maxRange), zeroStep: add(mod.zeroingParams?.rangeIncrement), zeroDefault: add(mod.zeroingParams?.defaultRange),
            });
        }
        Object.assign(stats, {
            aimTime: mult(aim?.zoomTimeScale),
            damage: mult(ws.damageMultiplier), fireRate: mult(ws.fireRateMultiplier), projectileSpeed: mult(ws.projectileSpeedMultiplier),
            heat: mult(ws.heatGenerationMultiplier), chargeTime: mult(ws.chargeTimeMultiplier), ammoCost: mult(ws.ammoCostMultiplier), soundRadius: mult(ws.soundRadiusMultiplier),
            pellets: add(ws.pellets), burstShots: add(ws.burstShots),
            spreadMin: mult(spread?.minMultiplier), spreadMax: mult(spread?.maxMultiplier), spreadFirst: mult(spread?.firstAttackMultiplier), spreadPerShot: mult(spread?.attackMultiplier), spreadDecay: mult(spread?.decayMultiplier),
            recoilAimYaw: mult(recoil?.aimRecoilModifier?.curveRecoil?.yawMaxDegreesModifier), recoilAimPitch: mult(recoil?.aimRecoilModifier?.curveRecoil?.pitchMaxDegreesModifier), recoilAimRoll: mult(recoil?.aimRecoilModifier?.curveRecoil?.rollMaxDegreesModifier),
            recoilVisualPos: triple(recoil?.curveRecoil?.positionModifiers, ['xMaxValueModifier', 'yMaxValueModifier', 'zMaxValueModifier']),
            recoilVisualRot: triple(recoil?.curveRecoil?.rotationModifiers, ['xMaxValueModifier', 'yMaxValueModifier', 'zMaxValueModifier']),
            recoilTime: mult(recoil?.curveRecoil?.recoilTimeModifier),
            // 아래 다섯 칸은 설명문 낱말과 짝이 확인되지 않은 반동 칸이다(게임이 실제로 쓰는지 미확인). 값은 자료 그대로.
            recoilStrength: mult(recoil?.fireRecoilStrengthMultiplier), recoilRandomness: mult(recoil?.randomnessMultiplier), recoilDecay: mult(recoil?.decayMultiplier),
            recoilAimKick: mult(recoil?.aimRecoilModifier?.shotKickMultiplier?.x), recoilHead: mult(recoil?.headRotationMultiplier?.x),
        });
        const kick = recoil?.aimRecoilModifier?.shotKickMultiplier; const headTurn = recoil?.headRotationMultiplier;
        if (kick && round(kick.x) !== round(kick.y)) axisDiffers.push(`${cls}: aimRecoilModifier.shotKickMultiplier x ${kick.x} / y ${kick.y}`);
        if (headTurn && (round(headTurn.x) !== round(headTurn.y) || round(headTurn.x) !== round(headTurn.z))) axisDiffers.push(`${cls}: headRotationMultiplier ${headTurn.x}, ${headTurn.y}, ${headTurn.z}`);
        for (const [path, value] of flatten(ws, '', [])) {
            if (EXPORTED_PATHS.has(path)) continue;
            const neutral = /additive/i.test(path) ? 0 : /Multiplier|Modifier|Scale/.test(path.split('.').pop()) || /Multiplier\.|Modifier\./.test(path) ? 1 : 0;
            if (value !== neutral) { if (!notExported.has(path)) notExported.set(path, new Set()); notExported.get(path).add(cls); }
        }
    }
    let sub = SUB_BY_TOKEN[cls.toLowerCase().split('_')[2]];
    if (kind === 'underbarrel') {
        const action = aux?.auxiliaryWeaponAction?.__type || '';
        sub = /Flashlight/.test(action) ? 'flashlight' : /Beam/.test(action) ? 'laser' : sub;
        if (sub === 'flashlight') {
            // 손전등 불빛: 부착물에 딸린 첫 조명(좁은 빔)의 색·세기·퍼짐각
            const loadout = component(entity, 'SEntityComponentDefaultLoadoutParams')?.loadout;
            const first = (Array.isArray(loadout?.entries) ? loadout.entries : []).map((entry) => byClsAny(entry.entityClassName || refCls(entry.entityClassReference))).find(Boolean);
            const light = first ? component(df.readRecord(first, 6), 'LightComponentParams') : null;
            const color = light?.defaultState?.color;
            if (light) stats.light = prune({ color: color && [color.r, color.g, color.b].every((v) => typeof v === 'number') ? [round(color.r, 3), round(color.g, 3), round(color.b, 3)] : undefined, intensity: round(light.defaultState?.intensity), fov: round(light.projectorParams?.FOV) });
        }
    }
    if (kind === 'magazine') {
        Object.assign(stats, { capacity: ammo?.maxAmmoCount || undefined, ammo: refCls(ammo?.ammoParamsRecord) });
        sub = slug(typeLine?.value) || 'magazine';
    }
    if (!sub) sub = slug(typeLine?.value) || kind;
    const statLines = lines.filter((line) => !HEADER_LINES.has(line.label.toLowerCase()));
    const koLines = statLines.every((line) => line.labelKo) ? statLines.map((line) => `${line.labelKo}: ${line.valueKo ?? line.value}`) : undefined;
    // 제조사: 게임 설명문의 "제조사" 줄을 먼저 쓰고(게임 화면에 보이는 글), 없으면 기록의 제조사.
    const recordMfr = manufacturerOf(x.manufacturer); const mfrLine = lines.find((line) => line.label.toLowerCase() === 'manufacturer');
    const mfr = mfrLine ? { en: mfrLine.value, ko: mfrLine.valueKo ?? mfrLine.value } : recordMfr;
    if (mfrLine && (recordMfr?.en ?? '') !== mfrLine.value) mfrConflict.push(`${cls}: 설명 ${mfrLine.value} / 기록 ${recordMfr?.en ?? '(이름 없음)'}`);
    const families = ['ballistic', 'energy'].filter((name) => x.tags.includes(`${name}_attach`));
    const family = families.length === 1 ? families[0] : kind === 'barrel' && families.length === 2 ? 'both' : undefined;
    attachmentsOut[cls] = prune({
        name: both(x.nameKey) || both(kind === 'magazine' ? '@item_TypeFPS_Magazine' : KIND_LABEL_KEY[kind]), unnamed: unnamed.has(cls) || undefined, kind, sub, type: typeLine ? { en: typeLine.value, ko: typeLine.valueKo ?? typeLine.value } : undefined,
        size: x.size, mfr: mfr?.en, mfrKo: mfr && mfr.ko !== mfr.en ? mfr.ko : undefined, family,
        stats: prune(stats),
        desc: statLines.length ? prune({ en: statLines.map((line) => `${line.label}: ${line.value}`), ko: koLines }) : undefined,
    });
    if (!attachmentsOut[cls].stats) attachmentsOut[cls].stats = {};
    // 게임 설명문 수치와 자료 값이 다른 곳(둘 다 게임 파일이다. 수치는 자료 칸을, 설명은 설명문 그대로를 싣는다)
    const pct = (label) => { const line = lines.find((l) => l.label.toLowerCase() === label); const m = line?.value.match(/^([+-]?\d+(?:\.\d+)?)\s*%$/); return m ? Number(m[1]) : undefined; };
    for (const [label, key] of [['damage', 'damage'], ['fire rate', 'fireRate'], ['projectile speed', 'projectileSpeed'], ['audible range', 'soundRadius'], ['aim time', 'aimTime'], ['heat', 'heat'], ['charge time', 'chargeTime'], ['recoil time', 'recoilTime']]) {
        const said = pct(label); if (said === undefined) continue;
        const have = Math.round(((stats[key] ?? 1) - 1) * 1000) / 10;
        if (Math.abs(said - have) > 1) { descMismatch.push(`${cls}: ${label} 설명 ${said}% / 자료 ${have}%`); attachmentsOut[cls].descDiffers = [...(attachmentsOut[cls].descDiffers || []), key]; }
    }
}
// 종류 낱말: 한국어 패치가 그 물건의 설명문을 옮기지 않아 영어로 남은 곳은, 같은 영어 낱말을 쓰는 다른 부착물의
// 한국어 패치 낱말을 쓴다 (예: "스코치드" 손전등의 Flashlight -> 다른 손전등의 "조명"). 짝이 없으면 그대로 둔다.
{
    const known = new Map();
    for (const item of Object.values(attachmentsOut)) if (item.type && item.type.ko !== item.type.en && !known.has(item.type.en.toLowerCase())) known.set(item.type.en.toLowerCase(), item.type.ko);
    for (const item of Object.values(attachmentsOut)) if (item.type && item.type.ko === item.type.en && known.has(item.type.en.toLowerCase())) item.type = { en: item.type.en, ko: known.get(item.type.en.toLowerCase()) };
}
function byClsAny(cls) { if (!cls) return null; const lower = String(cls).toLowerCase(); return entities.find((record) => clsOf(record).toLowerCase() === lower) || null; }

// ───────────── 5. 수치 칸 설명 (화면 낱말: 게임 설명문에 있는 낱말은 한국어 패치 그대로)
const FIELD = [
    ['zoom', 'Magnification', 'x', 'Base zoom', '기본 배율'], ['zoom2', null, 'x', 'Second zoom step', '2단 배율'], ['scope', null, 'enum', 'Scope mode', '조준경 기능'],
    ['zeroMax', null, 'm', 'Zeroing up to', '영점 조절 최대 거리'], ['zeroStep', null, 'm', 'Zeroing step', '영점 조절 단위'], ['zeroDefault', null, 'm', 'Default zeroing', '기본 영점 거리'],
    ['aimTime', 'Aim Time', 'mult'], ['damage', 'Damage', 'mult'], ['fireRate', 'Fire Rate', 'mult'], ['projectileSpeed', 'Projectile Speed', 'mult'], ['heat', 'Heat', 'mult'],
    ['chargeTime', 'Charge Time', 'mult'], ['ammoCost', 'Ammo Consumption', 'mult'], ['soundRadius', 'Audible Range', 'mult'], ['pellets', 'Pellets', 'add'], ['burstShots', 'Additional Burst Shots', 'add'],
    ['spreadMin', 'Spread Min', 'mult'], ['spreadMax', 'Spread Max', 'mult'], ['spreadFirst', null, 'mult', 'First-shot spread', '첫 발 탄분산'], ['spreadPerShot', 'Spread Per Shot', 'mult'], ['spreadDecay', null, 'mult', 'Spread recovery', '탄분산 회복'],
    ['recoilAimYaw', 'Horizontal Aim Recoil', 'mult'], ['recoilAimPitch', 'Vertical Aim Recoil', 'mult'], ['recoilAimRoll', null, 'mult', 'Aim recoil (tilt)', '조준 반동 (기울어짐)'],
    ['recoilVisualPos', 'Visual Recoil', 'mult3', 'Visual recoil (shift x, y, z)', '시각 반동 (밀림 x, y, z)'], ['recoilVisualRot', 'Visual Recoil', 'mult3', 'Visual recoil (turn x, y, z)', '시각 반동 (회전 x, y, z)'],
    ['recoilTime', 'Recoil Time', 'mult'],
    ['recoilStrength', null, 'mult', 'Recoil strength', '반동 세기'], ['recoilRandomness', null, 'mult', 'Recoil randomness', '반동 흔들림'], ['recoilDecay', null, 'mult', 'Recoil recovery', '반동 회복'],
    ['recoilAimKick', null, 'mult', 'Kick while aiming', '조준 중 튀는 정도'], ['recoilHead', null, 'mult', 'View shake', '시야 흔들림'], ['capacity', 'Capacity', 'count'], ['ammo', null, 'id', 'Ammunition', '탄약'], ['light', null, 'light', 'Light', '불빛'],
];
const usedKeys = new Set(Object.values(attachmentsOut).flatMap((a) => Object.keys(a.stats)));
const statFields = {};
for (const [key, gameWord, unit, fallbackEn, fallbackKo] of FIELD) {
    if (!usedKeys.has(key)) continue;
    const game = gameWord ? gameLabel.get(gameWord.toLowerCase()) : null;
    statFields[key] = game && !fallbackEn ? { label: { en: game.en, ko: game.ko }, unit, labelSource: 'game' } : { label: { en: fallbackEn || gameWord, ko: fallbackKo || fallbackEn || gameWord }, unit, labelSource: 'site' };
}
const unknownKeys = [...usedKeys].filter((key) => !statFields[key]);

// ───────────── 6. 쓰기
const version = `${String(build.Branch || '').replace(/^sc-alpha-/, '')}.${build.RequestedP4ChangeNum || ''}`;
const sortObject = (object) => Object.fromEntries(Object.keys(object).sort((a, b) => a.localeCompare(b)).map((k) => [k, object[k]]));
const output = {
    version, gameVersion: build.Version, builtAt: new Date().toISOString(), source: 'game-files', sourceSha256: createHash('sha256').update(dcb).digest('hex'), koSource: 'korean-patch',
    note: 'stats: 배율 칸은 1 = 변화 없음(1.15 = +15%), 더하는 칸(pellets, burstShots)은 0 = 변화 없음. 기준값과 같은 칸은 뺐다(칸이 없으면 "변화 없음"). recoilVisualPos/Rot = [x, y, z]. desc = 게임 설명문의 수치 줄 그대로(자료 칸과 다를 수 있다). ports[].editable = 게임 자리의 inventory 표시. 탄창 자리는 기본 탄창 하나만 싣는다. unnamed = 게임 글에 이름이 없는 기본 탄창(종류 이름으로 대신함). statFields[].labelSource: game = 한국어 패치 설명문 낱말, site = 우리가 붙인 낱말. recoilStrength·recoilRandomness·recoilDecay·recoilAimKick·recoilHead 는 게임 설명문과 짝이 확인되지 않은 칸. variantDefaults = 기본 장착이 묶음 대표와 다른 변종 {고유번호: {자리: 부착물|null}}.',
    kinds: Object.fromEntries(KIND_ORDER.map((kind) => [kind, both(KIND_LABEL_KEY[kind])])),
    statFields,
    attachments: sortObject(attachmentsOut),
    weapons: weaponsOut,
};
const stable = (data) => JSON.stringify({ ...data, builtAt: null });
if (CHECK_ONLY) {
    const same = existsSync(OUT) && stable(JSON.parse(readFileSync(OUT, 'utf8'))) === stable(output);
    console.log(same ? '부착물 자료: 저장된 파일과 같습니다.' : '부착물 자료: 저장된 파일과 다릅니다. --check 없이 다시 만들어 주세요.');
    if (!same) process.exitCode = 1;
} else {
    mkdirSync(dirname(OUT), { recursive: true });
    // 내용이 같으면 만든 시각만 바뀐 파일을 다시 쓰지 않는다.
    if (!(existsSync(OUT) && stable(JSON.parse(readFileSync(OUT, 'utf8'))) === stable(output))) writeFileSync(OUT, `${JSON.stringify(output)}\n`);
}

// ───────────── 7. 집계 보고
const list = (title, rows, max = 40) => { console.log(`${title}: ${rows.length}`); for (const row of rows.slice(0, max)) console.log(`   - ${row}`); if (rows.length > max) console.log(`   … 외 ${rows.length - max}`); };
const kinds = tally(Object.values(attachmentsOut), (a) => a.kind);
console.log(`\n=== 부착물 자료 집계 (게임 ${build.Version}, ${version}) ===`);
console.log(`묶음 ${census.groups} (자리 있는 묶음 ${census.groupsWithPorts}), 자리 ${census.ports} ${JSON.stringify(census.portsByKind)}, 그중 갈아 끼울 수 있는 자리 ${census.editablePorts}`);
console.log(`자리-부착물 짝 ${census.pairs} ${JSON.stringify(census.pairsByKind)}`);
console.log(`부착물 ${Object.keys(attachmentsOut).length} ${JSON.stringify(kinds)}  세부 종류 ${JSON.stringify(tally(Object.values(attachmentsOut), (a) => `${a.kind}/${a.sub}`))}`);
console.log(`후보(이름 있는 개인 무기 부착물) ${candidates.length}, 그중 62묶음 어느 자리에도 안 맞아 뺀 것 ${candidates.filter((x) => !used.has(x.cls)).length} ${JSON.stringify(tally(candidates.filter((x) => !used.has(x.cls)), (x) => x.sub))}`);
const dropped = index.filter((x) => x.type === 'WeaponAttachment' && internalReason(x) && /\/entities\/scitem\/weapons\//.test(x.file));
console.log(`플레이어 물건이 아니라 뺀 것 ${dropped.length} ${JSON.stringify(tally(dropped, internalReason))}`);
list('건너뛴 자리(도구·미사일·모듈 등 네 종류가 아닌 것)', census.skippedPorts);
list('숨겨진 자리(hideFromPlayer)라 뺀 것', census.hiddenPorts);
list('탄창: 규칙만 쓰면 둘 이상 나오는 자리(기본 탄창만 실음)', census.magazineRuleWouldOfferMore);
list('weapons.json 변종 가운데 게임 자료에 없는 것', census.missingVariants);
list('자리 구성이 묶음 대표와 다른 변종', census.variantPortLayoutDiffers);
list('내보내지 않은 보정 칸(값이 기준과 다름) — 칸: 부착물 수', [...notExported].sort((a, b) => b[1].size - a[1].size).map(([path, set]) => `${path}: ${set.size}`), 80);
list('게임 설명문 수치와 자료 값이 다른 곳', descMismatch);
list('제조사: 설명문과 기록이 다른 곳(설명문을 실음)', mfrConflict);
list('축마다 값이 달라 한 숫자로 줄이지 못한 곳(x 값만 실림)', axisDiffers);
list('이름 없는 기본 탄창(unnamed 표시, 종류 이름으로 대신함)', [...unnamed]);
if (unknownKeys.length) list('설명 없는 수치 칸', unknownKeys);
if (truncated) console.log(`주의: 읽기 깊이 한계로 잘린 곳 ${truncated} (게임 값이 아니라 우리 해석 한계)`);
console.log(`\n=== 자체 점검: 기본 장착이 자기 자리 규칙을 통과하는가 ===`);
console.log(`기본 장착 ${selfCheck.defaults}건 중 통과 ${selfCheck.pass}, 예외 ${selfCheck.exceptions.length}`);
for (const e of selfCheck.exceptions) console.log(`   - [${e.scope}] ${e.weapon}.${e.port} = ${e.item}: ${e.reason}`);
console.log(`\n${CHECK_ONLY ? '(확인만 함)' : `→ ${OUT} (${Math.round(readFileSync(OUT).length / 1024)}KB)`}`);
