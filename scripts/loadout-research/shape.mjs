// 조사 보조: 한 레코드의 특정 구성 요소(Components[].__type)를 짧게 보여준다.
// 스칼라 값만 찍고, --skip 정규식에 걸리는 경로와 음향·연출 계열은 건너뛴다.
//   node scripts/loadout-research/shape.mjs --cache-dir <폴더> --cls <클래스명> --comp <구성 요소 정규식> [--skip 정규식] [--max 120] [--follow]
import { args, requireDir, loadGame, flatten } from './lib.mjs';

const a = args();
const game = loadGame(requireDir(a['cache-dir'], 'cache-dir'));
const NOISE = /audio|sound|rtpc|effect|vfx|anim|camera|shake|geometry|material|particle|helper|light|vibration|hud|\bui|tint|icon|thumbnail|interaction|__type$|Localization|decal|recoilModifier|aimModifier|aimRecoil/i;
const skip = a.skip && a.skip !== true ? new RegExp(a.skip, 'i') : null;
const max = Number(a.max) || 120;
const comp = new RegExp(a.comp && a.comp !== true ? a.comp : '.', 'i');
for (const name of String(a.cls || '').split(',').filter(Boolean)) {
    const record = game.byClass.get(name.toLowerCase()) || game.byId.get(name.toLowerCase());
    if (!record) { console.log(`missing ${name}`); continue; }
    const entity = game.entity(record, Number(a.depth) || 12);
    if (a.list) { console.log(`== ${name}: ${(entity.Components || []).map((c) => c?.__type).join(', ')}`); continue; }
    for (const c of entity.Components || []) {
        if (!c || !comp.test(c.__type)) continue;
        console.log(`== ${name} :: ${c.__type}`);
        let n = 0;
        for (const [path, value] of flatten(c)) {
            if (NOISE.test(path) || (skip && skip.test(path))) continue;
            if (value === null || value === '' || value === undefined) continue;
            n += 1;
            if (n > max) { console.log('  …'); break; }
            console.log(`  ${path} = ${typeof value === 'number' ? Number(value.toPrecision(7)) : value}`);
        }
    }
}
