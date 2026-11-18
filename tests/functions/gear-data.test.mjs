import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(new URL(`../../data/gear/${name}.json`, import.meta.url)));
const weapons = read('weapons');
const armor = read('armor');

test('gear source build and UUIDs remain traceable, without placeholder/mannequin entries', () => {
    for (const data of [weapons, armor, read('body')]) {
        assert.equal(data.gameVersion, '4.10.200.58746');
        assert.equal(data.sourceSha256, '005984f5507314a0d5dc3a8d7457bffc03578eeabb1e5da6e6c2d010e81649f4');
        assert.equal(data.koSource, 'korean-patch');
    }
    const ids = new Set();
    for (const group of [...weapons.groups, ...armor.groups]) {
        assert.doesNotMatch(group.id, /^mannequin_/);
        assert.doesNotMatch(group.name.en, /^(PH|TBD|PLACEHOLDER)$/);
        for (const [uuid] of group.variants) { assert.ok(!ids.has(uuid)); ids.add(uuid); }
    }
});

test('ADP-mk4 temperature variants remain distinct with complete patch names', () => {
    const standard = armor.groups.find(g => g.id === 'cds_armor_heavy_core_01');
    const modified = armor.groups.find(g => g.id === 'cds_armor_heavy_core_02');
    assert.deepEqual(standard.temp, [-70, 100]);
    assert.deepEqual(modified.temp, [-80, 105]);
    assert.notEqual(standard.name.en, modified.name.en);
    for (const g of [standard, modified]) assert.ok(g.variants.some(v => v[1] === g.name.en && v[2] === g.name.ko));
    assert.match(armor.groups.find(g => g.id === 'cds_armor_heavy_helmet_02').name.en, /Helmet/);
});

test('sampled firing definitions preserve automatic, upper-bound and individual sequence semantics', () => {
    assert.equal(weapons.groups.find(g => g.id === 'behr_rifle_ballistic_01').modes[0].rpm, 810);
    assert.equal(weapons.groups.find(g => g.id === 'ksar_pistol_ballistic_01').modes[0].basis, 'upperBound');
    const modes = weapons.groups.find(g => g.id === 'ksar_sniper_ballistic_01').modes;
    assert.deepEqual(modes.map(m => m.rpm), [100, 40]);
    assert.equal(modes[0].pulls, 50);
    assert.equal(modes[1].sequenceMode, 'Individually');
    assert.equal(modes[1].pulls, undefined);
    assert.equal(modes[1].cycleSeconds, 3);
});

test('tool placeholder combat and special-mode weapons are identified', () => {
    assert.ok(weapons.groups.filter(g => g.kind === 'tool').every(g => g.combatVerified === false));
    assert.equal(weapons.groups.find(g => g.ammo?.dmg?.physical === 1200).specialMode, 'elimination');
    assert.deepEqual(armor.groups.find(g => g.id === 'rsi_deckcrew_undersuit_01').covers, ['leftArm', 'leftLeg', 'rightArm', 'rightLeg', 'torso']);
});

test('gear images have local files and attribution links; CC licences link to their terms', () => {
    const data = read('images');
    const ids = new Set([...weapons.groups, ...armor.groups].map(g => g.id));
    assert.equal(data.width, 320);
    for (const [id, image] of Object.entries(data.images)) {
        assert.ok(ids.has(id), id);
        assert.match(image.file, /^assets\/images\/gear\/wiki\/[a-z0-9_-]+\.webp$/i);
        assert.ok(existsSync(new URL(`../../${image.file}`, import.meta.url)), image.file);
        assert.match(image.source, /^https:\/\/starcitizen\.tools\/File:/);
        assert.ok(image.author);
        if (/^CC/.test(image.license)) assert.match(image.licenseUrl, /^https:\/\/creativecommons\.org\//);
    }
    assert.match(data.images.cds_armor_heavy_helmet_02.page, /Helmet/);
});
