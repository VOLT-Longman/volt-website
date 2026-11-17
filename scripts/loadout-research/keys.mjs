// 조사 보조: 구성 요소의 필드 이름만 깊이 제한을 두고 보여준다 (값은 스칼라일 때만 한 줄에 요약).
//   node scripts/loadout-research/keys.mjs --cache-dir <폴더> --cls <클래스명,...> --comp <정규식> [--levels 2]
import { args, requireDir, loadGame } from './lib.mjs';

const a = args();
const game = loadGame(requireDir(a['cache-dir'], 'cache-dir'));
const levels = Number(a.levels) || 2;
const comp = new RegExp(a.comp && a.comp !== true ? a.comp : '.', 'i');
const brief = (value, level) => {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return typeof value === 'number' ? String(Number(value.toPrecision(6))) : JSON.stringify(value);
    if (Array.isArray(value)) return value.length ? `[${value.length}× ${brief(value[0], level + 1)}]` : '[]';
    if (value.__record) return `→${value.name}`;
    const keys = Object.keys(value).filter((k) => k !== '__type');
    if (level >= levels) return `{${keys.length} keys}`;
    return `{${keys.map((k) => `${k}: ${brief(value[k], level + 1)}`).join(', ')}}`;
};
for (const name of String(a.cls || '').split(',').filter(Boolean)) {
    const record = game.byClass.get(name.toLowerCase());
    if (!record) { console.log(`missing ${name}`); continue; }
    for (const c of game.entity(record, 12).Components || []) {
        if (!c || !comp.test(c.__type)) continue;
        console.log(`== ${name} :: ${c.__type}`);
        for (const k of Object.keys(c)) if (k !== '__type') console.log(`  ${k}: ${brief(c[k], 1).slice(0, Number(a.width) || 400)}`);
    }
}
