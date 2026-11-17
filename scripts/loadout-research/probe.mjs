// 조사 보조: 클래스명(또는 UUID)의 원본 레코드를 경로=값 줄로 보여준다.
//   node scripts/loadout-research/probe.mjs --cache-dir <폴더> --cls <클래스명> [--grep 정규식] [--depth 12]
//   node scripts/loadout-research/probe.mjs --cache-dir <폴더> --find <이름 정규식>      (레코드 찾기)
//   node scripts/loadout-research/probe.mjs --cache-dir <폴더> --type <구조체명> [--limit 5]   (다른 종류의 레코드)
import { args, requireDir, loadGame, flatten } from './lib.mjs';

const a = args();
const game = loadGame(requireDir(a['cache-dir'], 'cache-dir'));
const depth = Number(a.depth) || 12;
const grep = a.grep && a.grep !== true ? new RegExp(a.grep, 'i') : null;
const show = (value) => {
    for (const [path, v] of flatten(value)) if (!grep || grep.test(path) || grep.test(String(v))) console.log(`${path} = ${v}`);
};
if (a.find) {
    const re = new RegExp(a.find, 'i');
    for (const r of game.df.records) if (re.test(r.name) || re.test(r.file)) console.log(r.id, r.name, r.file);
} else if (a.type) {
    const list = game.df.recordsOfType(a.type);
    console.log(`${a.type}: ${list.length} records`);
    const nameRe = a.name && a.name !== true ? new RegExp(a.name, 'i') : null;
    let n = 0;
    for (const r of list) {
        if (nameRe && !nameRe.test(r.name)) continue;
        n += 1;
        if (n > (Number(a.limit) || 3)) break;
        console.log(`== ${r.name} (${r.id}) ${r.file}`);
        show(game.df.readRecord(r, depth));
    }
} else {
    for (const name of String(a.cls || '').split(',').filter(Boolean)) {
        const record = game.byClass.get(name.toLowerCase()) || game.byId.get(name.toLowerCase());
        if (!record) { console.log(`missing ${name}`); continue; }
        console.log(`== ${record.name} (${record.id}) ${record.file}`);
        show(game.entity(record, depth));
    }
}
