import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
    SNAPSHOT_SCHEMA,
    STAGING_PREFIX,
    createR2Client,
    getR2Object,
    gunzipText,
    readR2Config,
    sha256
} from './r2-snapshot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ERKUL_DIR = resolve(ROOT, 'data/external/erkul');
const SNAPSHOT_MANIFEST_PATH = resolve(ERKUL_DIR, 'r2-snapshot-manifest.json');
const STAGE_MANIFEST_PATH = resolve(ERKUL_DIR, 'r2-snapshot-stage-manifest.json');
const TARGET_FILES = Object.freeze({
    shipsRaw: resolve(ERKUL_DIR, 'ships.raw.json'),
    shopRaw: resolve(ERKUL_DIR, 'shop.raw.json'),
    fetchMeta: resolve(ERKUL_DIR, 'fetch-meta.json')
});
const REBUILD_SCRIPTS = Object.freeze([
    'scripts/erkul/normalize-erkul-ships.mjs',
    'scripts/erkul/normalize-erkul-market.mjs',
    'scripts/erkul/match-erkul-to-volt.mjs',
    'scripts/erkul/build-ship-live-data.mjs'
]);
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
    return { stage: argv.includes('--stage') };
}

async function readManifest(useStage) {
    const path = useStage ? STAGE_MANIFEST_PATH : SNAPSHOT_MANIFEST_PATH;
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    if (manifest.schema !== SNAPSHOT_SCHEMA || manifest.source !== 'erkul-live') throw new Error('invalid R2 snapshot manifest');
    if (useStage && !manifest.snapshot.prefix.startsWith(`${STAGING_PREFIX}/`)) throw new Error('stage verification requires a staging snapshot manifest');
    return manifest;
}

async function restoreSourceFile(client, config, manifest, name) {
    const entry = manifest.objects?.[name];
    const key = `${manifest.snapshot.prefix}/${name === 'shopRaw' ? 'shop.raw.json.gz' : name === 'fetchMeta' ? 'fetch-meta.json.gz' : 'ships.raw.json.gz'}`;
    const compressed = await getR2Object(client, config, key);
    if (sha256(compressed) !== entry?.compressedSha256) throw new Error(`${name} compressed checksum mismatch`);
    const raw = await gunzipText(compressed);
    if (sha256(raw) !== entry.rawSha256) throw new Error(`${name} source checksum mismatch`);
    await writeFile(TARGET_FILES[name], raw, 'utf8');
}

async function runNode(script, args = []) {
    await execFileAsync(process.execPath, [resolve(ROOT, script), ...args], { cwd: ROOT, stdio: 'inherit' });
}

async function assertDerivedHashes(manifest) {
    for (const [path, expectedHash] of Object.entries(manifest.derived || {})) {
        const actualHash = sha256(await readFile(resolve(ROOT, path)));
        if (actualHash !== expectedHash) throw new Error(`derived output checksum mismatch: ${path}`);
    }
}

async function recordStageVerification(manifest) {
    const verified = {
        ...manifest,
        stagingVerification: {
            verifiedAt: new Date().toISOString(),
            verifier: 'shipdb:erkul:snapshot:verify --stage'
        }
    };
    await writeFile(STAGE_MANIFEST_PATH, `${JSON.stringify(verified, null, 2)}\n`, 'utf8');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const config = readR2Config(process.env, args.stage ? 'R2_SNAPSHOT_WRITER' : 'R2_SNAPSHOT_CI');
    const manifest = await readManifest(args.stage);
    const client = createR2Client(config);
    for (const name of Object.keys(TARGET_FILES)) await restoreSourceFile(client, config, manifest, name);
    for (const script of REBUILD_SCRIPTS.slice(0, 3)) await runNode(script);
    await runNode(REBUILD_SCRIPTS[3], ['--verify']);
    await assertDerivedHashes(manifest);
    if (args.stage) await recordStageVerification(manifest);
    console.log(`R2 snapshot reproducibility verified: ${manifest.snapshot.prefix}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
