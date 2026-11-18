import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
const tracked = git('ls-files');
const history = git('log', '--format=', '--name-only', 'HEAD', '--', 'assets/models/gear', '*.glb');
if (/^assets\/models\/gear\//m.test(tracked) || /^.+\.glb$/m.test(tracked) || history.trim()) {
  throw new Error('Private models appear in tracked files or reachable branch history. Do not push.');
}
console.log('No private gear models or GLB files in tracked files or reachable branch history.');
