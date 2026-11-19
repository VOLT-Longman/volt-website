// Extracted game art for the star map must never be committed. Part of `npm run check`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
const tracked = git('ls-files');
// anything under the private folder, or a star-map colour map (ui_sm_*) saved anywhere else as an image
const artName = /(?:^|\/)ui_sm_[a-z0-9_]+\.(?:webp|png|jpe?g|dds|tif|ktx2?|basis|avif)$/im;
const history = git('log', '--format=', '--name-only', 'HEAD', '--', 'assets/models/starmap');
if (/^assets\/models\/starmap\//m.test(tracked) || artName.test(tracked) || history.trim()) {
  throw new Error('Private star-map textures appear in tracked files or reachable branch history. Do not push.');
}
if (!/^\/assets\/models\/starmap\/$/m.test(readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8').replace(/\r\n/g, '\n'))) {
  throw new Error('.gitignore no longer ignores /assets/models/starmap/. Restore the rule before exporting textures.');
}
// A staged-but-ignored file would show up in ls-files; an unignored local export would show up here.
const untracked = git('status', '--porcelain', '--untracked-files=all', '--', 'assets/models/starmap');
if (untracked.trim()) throw new Error('assets/models/starmap/ is visible to Git (not ignored). Do not add it.');
// Check visible files of matching byte size even if the copy was renamed or its extension changed.
// by content, with the exported files listed in data/starmap/textures.json. (A re-encoded or cropped copy is NOT caught by this.)
const indexFile = new URL('../../data/starmap/textures.json', import.meta.url);
if (existsSync(indexFile)) {
  const files = Object.values(JSON.parse(readFileSync(indexFile, 'utf8')).textures || {}).flatMap((entry) => Object.values(entry.files || {}));
  const sizes = new Set(files.map((file) => file.bytes));
  const exported = new Set(files.map((file) => file.sha256));
  const visible = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean);
  const copies = [];
  for (const name of new Set(visible)) {
    const file = new URL(`../../${name.split('/').map(encodeURIComponent).join('/')}`, import.meta.url);
    if (existsSync(file) && sizes.has(statSync(file).size) && exported.has(createHash('sha256').update(readFileSync(file)).digest('hex'))) copies.push(name);
  }
  if (copies.length) throw new Error(`These files are copies of private star-map textures: ${copies.join(', ')}. Remove them before committing.`);
}
console.log('No private star-map textures in tracked files, reachable branch history or the Git work list.');
