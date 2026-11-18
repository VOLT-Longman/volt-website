// 조사 보조: 구조체별로 표본 레코드의 의미 있는 값만 짧게 보여 준다.
//   node scripts/loadout-research/sample.mjs --cache-dir <폴더> --types A,B,C [--name 정규식] [--lines 18] [--depth 6] [--grep 정규식]
import { args, requireDir, loadGame, flatten } from './lib.mjs';

const a = args();
const game = loadGame(requireDir(a['cache-dir'], 'cache-dir'));
const lines = Number(a.lines) || 18; const depth = Number(a.depth) || 6;
const nameRe = a.name && a.name !== true ? new RegExp(a.name, 'i') : null;
const grep = a.grep && a.grep !== true ? new RegExp(a.grep, 'i') : null;
const dull = /__type|\.type$|__record|Geometry|geometry|[Aa]udio|[Aa]nim|[Pp]article|[Ii]con|[Mm]aterial|\.(x|y|z|w)$|[Cc]olor/;
for (const type of String(a.types || '').split(',').filter(Boolean)) {
    const list = game.df.recordsOfType(type);
    const pick = (nameRe ? list.find((r) => nameRe.test(r.name)) : null) || list[Math.floor(list.length / 2)];
    console.log(`\n### ${type} (${list.length}) — ${pick?.name.split('.').slice(1).join('.')}  [${pick?.file.replace('libs/foundry/records/', '')}]`);
    if (!pick) continue;
    const rows = [...flatten(game.df.readRecord(pick, depth))].filter(([p, v]) => !dull.test(p) && v !== '' && v !== null && v !== 0 && v !== false && (!grep || grep.test(p) || grep.test(String(v))));
    for (const [p, v] of rows.slice(0, lines)) console.log(`  ${p} = ${String(v).slice(0, 90)}`);
    if (rows.length > lines) console.log(`  … (+${rows.length - lines}줄)`);
}
