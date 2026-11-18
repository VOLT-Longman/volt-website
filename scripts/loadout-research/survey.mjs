// 조사 보조: 게임 원본에 어떤 자료 묶음이 있는지 훑는다.
//   node scripts/loadout-research/survey.mjs --cache-dir <폴더> --folders <경로 정규식> [--depth 6]   폴더별 레코드 수
//   node scripts/loadout-research/survey.mjs --cache-dir <폴더> --types <구조체 이름 정규식>            구조체별 레코드 수
//   node scripts/loadout-research/survey.mjs --cache-dir <폴더> --attach <경로 정규식>                 부품 종류(Type/SubType)별 수
import { args, requireDir, loadGame } from './lib.mjs';

const a = args();
const game = loadGame(requireDir(a['cache-dir'], 'cache-dir'));
const count = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const print = (map, limit = 80) => { for (const [key, n] of [...map].sort((x, y) => y[1] - x[1]).slice(0, limit)) console.log(String(n).padStart(6), key); };

if (a.folders) {
    const re = new RegExp(a.folders, 'i'); const depth = Number(a.depth) || 6; const out = new Map();
    for (const r of game.df.records) if (re.test(r.file)) count(out, r.file.split('/').slice(0, depth).join('/'));
    print(out, Number(a.limit) || 80);
} else if (a.types) {
    const re = new RegExp(a.types, 'i'); const out = new Map();
    for (const r of game.df.records) { const type = r.name.split('.')[0]; if (re.test(type)) count(out, type); }
    print(out, Number(a.limit) || 80);
} else if (a.attach) {
    const re = new RegExp(a.attach, 'i'); const out = new Map();
    for (const r of game.records) {
        if (!re.test(r.file)) continue;
        const def = game.attach(game.entity(r, 4));
        if (def) count(out, `${def.Type} / ${def.SubType}`);
    }
    print(out, Number(a.limit) || 80);
}
