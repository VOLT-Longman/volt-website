// 조사: 장소별로 무엇이 캐지는지(게임 원본의 HarvestableProviderPreset)를 간추린다.
//   node scripts/loadout-research/mining-survey.mjs --cache-dir <폴더> [--write]
// 확률은 원본의 상대 가중치를 묶음 안에서 백분율로 바꾼 값이다. 실제 게임 안 출현율로 검증한 값이 아니다.
import { args, requireDir, loadGame, writeData, manifestBase } from './lib.mjs';

const a = args();
const game = loadGame(requireDir(a['cache-dir'], 'cache-dir'));
const { df } = game;
const short = (name) => String(name || '').split('.').slice(1).join('.');
const round = (value, digits = 1) => Number(Number(value).toFixed(digits));

const locations = [];
for (const record of df.recordsOfType('HarvestableProviderPreset')) {
    const data = df.readRecord(record, 5);
    const groups = (data.harvestableGroups || []).map((group) => {
        const rows = (group.harvestables || []).filter((row) => row?.harvestable?.name || row?.harvestableEntityClass?.name);
        const total = rows.reduce((sum, row) => sum + (Number(row.relativeProbability) || 0), 0);
        return {
            group: group.groupName, weight: round(group.groupProbability, 2),
            items: rows.map((row) => ({
                name: short(row.harvestable?.name || row.harvestableEntityClass?.name),
                share: total ? round((Number(row.relativeProbability) || 0) / total * 100) : null,
                cluster: short(row.clustering?.name) || undefined,
            })).sort((x, y) => (y.share || 0) - (x.share || 0)),
        };
    });
    locations.push({ id: short(record.name), file: record.file.split('/').slice(-3).join('/'), groups });
}
locations.sort((x, y) => x.id.localeCompare(y.id));

const elements = df.recordsOfType('MineableElement').map((record) => {
    const e = df.readRecord(record, 3);
    return { id: short(record.name), resource: short(e.resourceType?.name), instability: round(e.elementInstability, 2), resistance: round(e.elementResistance, 2), windowMid: round(e.elementOptimalWindowMidpoint, 2), windowThin: round(e.elementOptimalWindowThinness, 2), explosion: round(e.elementExplosionMultiplier, 2) };
});
const compositions = df.recordsOfType('MineableComposition').map((record) => {
    const c = df.readRecord(record, 4);
    return { id: short(record.name), nameKey: c.depositName, minElements: c.minimumDistinctElements,
        parts: (c.compositionArray || []).map((part) => ({ element: short(part.mineableElement?.name), min: round(part.minPercentage), max: round(part.maxPercentage), chance: round(part.probability, 3) })) };
});

if (a.write) {
    writeData('mining-profiles.json', { ...manifestBase(game), note: '확률은 원본 가중치 기준. 게임 안 실측으로 검증하지 않음.', locations, elements, compositions });
} else {
    console.log(`장소 ${locations.length}곳, 광물 ${elements.length}종, 암석 구성 ${compositions.length}종`);
    const groupNames = new Map();
    for (const l of locations) for (const g of l.groups) groupNames.set(g.group, (groupNames.get(g.group) || 0) + 1);
    console.log('묶음 종류:', [...groupNames].map(([k, v]) => `${k}(${v})`).join(', '));
    for (const id of String(a.show || 'HPP_Stanton2a,HPP_Pyro1,HPP_Lagrange_A').split(',')) {
        const l = locations.find((x) => x.id === id); if (!l) continue;
        console.log(`\n== ${l.id}`);
        for (const g of l.groups) console.log(`  [${g.group} · 가중치 ${g.weight}] ` + g.items.map((i) => `${i.name} ${i.share}%`).join(', '));
    }
}
