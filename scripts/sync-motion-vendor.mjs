import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const verify = process.argv.includes('--verify');
const target = path.join(root, 'assets/vendor/gsap');
const files = ['gsap.min.js', 'ScrollTrigger.min.js'];
if (!verify) await mkdir(target, { recursive: true });
for (const file of files) {
    const source = await readFile(path.join(root, 'node_modules/gsap/dist', file));
    const destination = path.join(target, file);
    if (verify) {
        if (!source.equals(await readFile(destination))) throw new Error(`Vendor mismatch: ${file}. Run npm run motion:vendor.`);
    } else await writeFile(destination, source);
}
console.log(`GSAP vendor ${verify ? 'verified' : 'copied'} (${files.length} files; original license headers retained).`);
