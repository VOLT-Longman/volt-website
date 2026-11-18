import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(new URL(`../../data/gear/${name}.json`, import.meta.url)));
const weapons = read('weapons');
const data = read('attachments');
const KINDS = ['optics', 'barrel', 'underbarrel', 'magazine'];
const ports = Object.entries(data.weapons).flatMap(([id, weapon]) => weapon.ports.map((port) => ({ id, ...port })));

test('attachment data comes from the same game build as the weapon data', () => {
    assert.equal(data.gameVersion, weapons.gameVersion);
    assert.equal(data.sourceSha256, weapons.sourceSha256);
    assert.equal(data.version, weapons.version);
    assert.equal(data.koSource, 'korean-patch');
});

test('every weapon group has an entry and every port follows the shared contract', () => {
    assert.deepEqual(Object.keys(data.weapons).sort(), weapons.groups.map((g) => g.id).sort());
    for (const port of ports) {
        const where = `${port.id}.${port.name}`;
        assert.ok(KINDS.includes(port.kind), where);
        assert.ok(port.label?.en && port.label?.ko, where);
        assert.ok(Number.isInteger(port.minSize) && Number.isInteger(port.maxSize) && port.minSize <= port.maxSize, where);
        assert.equal(typeof port.editable, 'boolean', where);
        assert.ok(port.default === null || typeof port.default === 'string', where);
        assert.ok(Array.isArray(port.compatible), where);
        assert.equal(new Set(port.compatible).size, port.compatible.length, where);
        for (const cls of port.compatible) {
            const item = data.attachments[cls];
            assert.ok(item, `${where} -> ${cls}`);
            assert.equal(item.kind, port.kind, `${where} -> ${cls}`);
        }
        if (port.default) assert.ok(port.compatible.includes(port.default), `${where} default`);
    }
    // 한 무기에 같은 이름의 자리가 둘 있으면 안 된다(3D 화면이 자리 이름으로 부품을 바꾼다).
    for (const [id, weapon] of Object.entries(data.weapons)) assert.equal(new Set(weapon.ports.map((p) => p.name)).size, weapon.ports.length, id);
});

test('compatible parts respect the port size range and ammunition family', () => {
    for (const port of ports.filter((p) => p.kind !== 'magazine')) {
        for (const cls of port.compatible) {
            const item = data.attachments[cls];
            assert.ok(item.size >= port.minSize && item.size <= port.maxSize, `${port.id}.${port.name} -> ${cls}`);
            if (port.family && item.family) assert.equal(item.family, port.family, `${port.id}.${port.name} -> ${cls}`);
        }
    }
});

test('magazine slots offer only the default magazine and are not editable', () => {
    for (const port of ports.filter((p) => p.kind === 'magazine')) {
        assert.equal(port.editable, false, port.id);
        assert.deepEqual(port.compatible, port.default ? [port.default] : [], port.id);
    }
    const p4ar = data.weapons.behr_rifle_ballistic_01.ports.find((p) => p.kind === 'magazine');
    assert.deepEqual(p4ar.compatible, ['behr_rifle_ballistic_01_mag']);
    assert.equal(data.attachments.behr_rifle_ballistic_01_mag.stats.capacity, 40);
});

test('attachments carry names in both languages and only real, varying stats', () => {
    const referenced = new Set(ports.flatMap((p) => p.compatible));
    for (const weapon of Object.values(data.weapons)) for (const change of Object.values(weapon.variantDefaults || {})) for (const cls of Object.values(change)) if (cls) referenced.add(cls);
    for (const [cls, item] of Object.entries(data.attachments)) {
        assert.ok(referenced.has(cls), `${cls} is not used by any port`);
        assert.ok(item.name?.en && item.name?.ko, cls);
        assert.ok(KINDS.includes(item.kind), cls);
        assert.ok(item.sub, cls);
        assert.ok(Number.isInteger(item.size), cls);
        assert.equal(typeof item.stats, 'object', cls);
        for (const [key, value] of Object.entries(item.stats)) {
            const field = data.statFields[key];
            assert.ok(field?.label?.en && field?.label?.ko, `${cls}.${key} has no field description`);
            // 기준값(배율 1, 더하는 값 0)과 같은 칸은 싣지 않는다.
            if (field.unit === 'mult') assert.ok(typeof value === 'number' && value > 0 && value !== 1, `${cls}.${key}`);
            if (field.unit === 'add') assert.ok(typeof value === 'number' && value !== 0, `${cls}.${key}`);
            if (field.unit === 'mult3') assert.ok(Array.isArray(value) && value.length === 3 && value.some((v) => v !== 1), `${cls}.${key}`);
        }
        if (item.kind === 'optics') assert.ok(item.stats.zoom >= 1, cls);
        // 용량 칸이 0 인 탄창(미사일 발사기: 탄은 미사일 자리에 따로 실린다)은 0 을 싣지 않고 칸을 뺀다.
        if (item.kind === 'magazine') assert.ok(item.stats.capacity === undefined || item.stats.capacity > 0, cls);
    }
    for (const [id, weapon] of Object.entries(data.weapons)) {
        const uuids = new Set(weapons.groups.find((g) => g.id === id).variants.map((v) => v[0]));
        for (const [uuid, change] of Object.entries(weapon.variantDefaults || {})) {
            assert.ok(uuids.has(uuid), `${id} ${uuid}`);
            for (const [name, cls] of Object.entries(change)) { assert.ok(weapon.ports.some((p) => p.name === name), `${id}.${name}`); assert.ok(cls === null || data.attachments[cls], `${id}.${name} -> ${cls}`); }
        }
    }
});

test('slot names follow the Korean patch wording', () => {
    assert.deepEqual(Object.fromEntries(KINDS.map((kind) => [kind, data.kinds[kind].ko])), { optics: '조준경 부착물', barrel: '총열 부착물', underbarrel: '총열하부 부착물', magazine: '무기 탄창' });
    assert.equal(data.statFields.aimTime.label.ko, '조준 시간');
    assert.equal(data.statFields.aimTime.labelSource, 'game');
});

test('sampled game values: P4-AR slots, suppressor, laser pointer, scope', () => {
    const p4ar = Object.fromEntries(data.weapons.behr_rifle_ballistic_01.ports.map((p) => [p.kind, p]));
    assert.deepEqual([p4ar.optics.minSize, p4ar.optics.maxSize, p4ar.barrel.minSize, p4ar.barrel.maxSize, p4ar.underbarrel.minSize, p4ar.underbarrel.maxSize], [1, 2, 2, 2, 1, 2]);
    assert.equal(p4ar.barrel.family, 'ballistic');
    assert.equal(p4ar.optics.compatible.length, 32);
    assert.equal(p4ar.barrel.compatible.length, 10);
    assert.equal(p4ar.underbarrel.compatible.length, 10);
    assert.ok(p4ar.optics.editable && p4ar.barrel.editable && p4ar.underbarrel.editable);
    // 에너지 총열 자리에는 탄도용 보정기가 맞지 않는다.
    const energy = ports.find((p) => p.kind === 'barrel' && p.family === 'energy');
    assert.ok(energy.compatible.every((cls) => data.attachments[cls].family !== 'ballistic'));
    assert.deepEqual(data.attachments.arma_barrel_supp_s2.stats, { damage: 0.92, soundRadius: 0.4 });
    assert.equal(data.attachments.nvtc_ubarrel_lasr_s1.stats.spreadMin, 0.885);
    assert.equal(data.attachments.nvtc_ubarrel_lasr_s1.sub, 'laser');
    assert.equal(data.attachments.nvtc_ubarrel_flsh_s1.sub, 'flashlight');
    const touchstone = data.attachments.klwe_optics_disp_x8_s3.stats;
    assert.deepEqual([touchstone.zoom, touchstone.zeroMax, touchstone.zeroStep], [8, 1000, 250]);
    assert.deepEqual([data.attachments.klwe_optics_holo_x2_s1.stats.zoom, data.attachments.klwe_optics_holo_x2_s1.stats.zoom2], [2, 4]);
});
