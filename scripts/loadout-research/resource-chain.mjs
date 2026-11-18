// 조사: 광물을 "어디서 캐나 → 무엇으로 정제되나 → 시세 → 어떤 설계도에 쓰이나" 한 줄로 잇는다.
//   node scripts/loadout-research/resource-chain.mjs --cache-dir <게임 캐시>
// 입력: 게임 원본 + 앞서 만든 mining-profiles.json, blueprints.json, uex-world-links.json
// 출력: data/loadout-research/resource-chain.json
// 장소 비중은 원본 가중치를 환산한 값이고, 시세는 UEX 평균값이다. 게임 안 실측으로 검증하지 않았다.
import { args, requireDir, loadGame, writeData, manifestBase, repoJson } from './lib.mjs';

const a = args();
const game = loadGame(requireDir(a['cache-dir'], 'cache-dir'));
const { df } = game;
const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);
const round = (value, digits = 1) => Number(Number(value).toFixed(digits));

const mining = repoJson('data/loadout-research/mining-profiles.json');
const blueprints = repoJson('data/loadout-research/blueprints.json').blueprints;
const links = repoJson('data/loadout-research/uex-world-links.json');
const uexOf = new Map(links.commodities.map((c) => [c.id, c]));
const placeOf = new Map(links.miningLocations.map((m) => [m.id, m]));

// 광물 → 원광 상품 → 정제 상품
const resourceTypes = new Map(df.recordsOfType('ResourceType').map((record) => [record.name.split('.').slice(1).join('.'), df.readRecord(record, 3)]));
const elementResource = new Map(df.recordsOfType('MineableElement').map((record) => [record.name.split('.').slice(1).join('.'), short(df.readRecord(record, 3).resourceType)]));
const refinedOf = (id) => short(resourceTypes.get(id)?.refinedVersion);

// 채집 목록 항목(HarvestablePreset) → 암석 → 구성
const compositions = new Map(mining.compositions.map((c) => [c.id, c]));
const presetComposition = new Map();
for (const record of df.recordsOfType('HarvestablePreset')) {
    const entityRef = df.readRecord(record, 3).entityClass;
    const entityRecord = entityRef?.name ? game.byClass.get(short(entityRef).toLowerCase()) : null;
    if (!entityRecord) continue;
    const composition = short(game.component(game.entity(entityRecord, 5), 'MineableParams')?.composition);
    if (composition) presetComposition.set(record.name.split('.').slice(1).join('.'), composition);
}

const MODES = { SpaceShip_Mineables: 'ship', GroundVehicle_Mineables: 'groundVehicle', FPS_Mineables: 'hand' };
const sources = new Map(); // 원광 상품 id → 장소 목록
for (const location of mining.locations) {
    for (const group of location.groups) {
        const mode = MODES[group.group]; if (!mode) continue;
        for (const item of group.items) {
            const composition = compositions.get(presetComposition.get(item.name));
            for (const part of composition?.parts || []) {
                const ore = elementResource.get(part.element); if (!ore) continue;
                const place = placeOf.get(location.id);
                const list = sources.get(ore) || [];
                list.push({ location: location.id, place: place?.name, system: place?.uex?.system, mode, rock: item.name, rockShare: item.share, content: [part.min, part.max], chance: part.chance });
                sources.set(ore, list);
            }
        }
    }
}

// 설계도에서 쓰는 상품
const usedBy = new Map();
for (const blueprint of blueprints) {
    for (const material of blueprint.materials || []) {
        const entry = usedBy.get(material.resource) || { count: 0, totalScu: 0, byCategory: {} };
        entry.count += 1; entry.totalScu += material.scu || 0; entry.byCategory[blueprint.category] = (entry.byCategory[blueprint.category] || 0) + 1;
        usedBy.set(material.resource, entry);
    }
}

const price = (id) => { const uex = uexOf.get(id)?.uex; return uex ? { uexId: uex.id, name: uex.name, sell: uex.priceSell, buy: uex.priceBuy, link: uexOf.get(id).link } : undefined; };
const chain = [...sources].map(([ore, list]) => {
    const refined = refinedOf(ore);
    const used = usedBy.get(refined) || usedBy.get(ore);
    // 같은 장소·방식은 가장 비중이 큰 암석 하나만 남겨 표를 짧게 한다. 전체는 mining-profiles.json 에 있다.
    const best = new Map();
    for (const row of list) { const key = `${row.location}|${row.mode}`; const score = (row.rockShare || 0) * (row.chance || 0) * (row.content[1] || 0); if (!best.has(key) || score > best.get(key).score) best.set(key, { ...row, score: round(score, 0) }); }
    return {
        ore, refined, uexOre: price(ore), uexRefined: refined ? price(refined) : undefined,
        blueprints: used ? { count: used.count, totalScu: round(used.totalScu, 3), byCategory: used.byCategory } : undefined,
        modes: [...new Set(list.map((row) => row.mode))],
        places: [...best.values()].sort((x, y) => y.score - x.score),
    };
}).sort((x, y) => (y.uexRefined?.sell || y.uexOre?.sell || 0) - (x.uexRefined?.sell || x.uexOre?.sell || 0));

const craftOnly = [...usedBy].filter(([id]) => !chain.some((row) => row.refined === id || row.ore === id)).map(([id, used]) => ({ resource: id, blueprints: used.count, uex: price(id) })).sort((x, y) => y.blueprints - x.blueprints);

writeData('resource-chain.json', {
    ...manifestBase(game),
    note: 'places.score = 암석 비중 × 포함 확률 × 최대 함량. 장소끼리 견주는 참고값일 뿐 실제 수율이 아니다. 시세는 UEX 평균값.',
    summary: { ores: chain.length, withRefined: chain.filter((c) => c.refined).length, withUexPrice: chain.filter((c) => c.uexRefined?.sell || c.uexOre?.sell).length, usedInBlueprints: chain.filter((c) => c.blueprints).length, craftMaterialsNotMined: craftOnly.length },
    chain, craftMaterialsNotMined: craftOnly,
});
