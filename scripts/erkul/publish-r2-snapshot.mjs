import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
    SNAPSHOT_PREFIX,
    STAGING_PREFIX,
    R2ObjectAlreadyExistsError,
    createR2Client,
    createSnapshotManifest,
    createSnapshotObjectKeys,
    getR2Object,
    gzipText,
    gunzipText,
    putImmutableObject,
    readR2Config,
    sha256
} from './r2-snapshot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ERKUL_DIR = resolve(ROOT, 'data/external/erkul');
const SNAPSHOT_MANIFEST_PATH = resolve(ERKUL_DIR, 'r2-snapshot-manifest.json');
const STAGE_MANIFEST_PATH = resolve(ERKUL_DIR, 'r2-snapshot-stage-manifest.json');
const BUILD_REPORT_PATH = resolve(ERKUL_DIR, 'live-data-build-report.json');
const execFileAsync = promisify(execFile);
const SOURCE_FILES = Object.freeze({
    shipsRaw: resolve(ERKUL_DIR, 'ships.raw.json'),
    shopRaw: resolve(ERKUL_DIR, 'shop.raw.json'),
    fetchMeta: resolve(ERKUL_DIR, 'fetch-meta.json')
});
const DERIVED_FILES = Object.freeze([
    'data/external/erkul/live-data-input-manifest.json',
    'data/ship-live-stats.js',
    'data/ship-market.js',
    'data/canonical/shipdb-manifest.json'
]);

function parseArgs(argv) {
    const mode = argv.includes('--publish') ? SNAPSHOT_PREFIX : STAGING_PREFIX;
    if (argv.includes('--stage') && argv.includes('--publish')) throw new Error('choose only one of --stage or --publish');
    return { mode };
}

async function getGitCommit() {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
    return stdout.trim();
}

async function readJson(path, label) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
        throw new Error(`${label} could not be read: ${error.message}`);
    }
}

async function createObjectEntry(path) {
    const raw = await readFile(path);
    const compressed = await gzipText(raw);
    return {
        raw,
        compressed,
        metadata: {
            rawSha256: sha256(raw),
            compressedSha256: sha256(compressed),
            rawBytes: raw.byteLength,
            compressedBytes: compressed.byteLength
        }
    };
}

async function readSnapshotInputs() {
    const entries = await Promise.all(Object.entries(SOURCE_FILES).map(async ([name, path]) => [name, await createObjectEntry(path)]));
    return Object.fromEntries(entries);
}

async function hashDerivedFiles() {
    const entries = await Promise.all(DERIVED_FILES.map(async (path) => [path, sha256(await readFile(resolve(ROOT, path)))]));
    return Object.fromEntries(entries);
}

function assertApplyContext(meta, report) {
    if (meta.source !== 'erkul-live' || !meta.fetchedAt) throw new Error('fetch-meta.json is not a Safe Apply Erkul snapshot');
    if (!/^[a-f0-9]{64}$/.test(report.previewHash || '')) throw new Error('live-data-build-report.json has no valid Safe Apply previewHash');
    if (!report.appliedAt || !report.appliedBy) throw new Error('live-data-build-report.json does not prove a confirmed Safe Apply');
}

function objectEntries(inputs) {
    return Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.metadata]));
}

async function assertRemoteObject(client, config, objectKey, expected) {
    const compressed = await getR2Object(client, config, objectKey);
    if (sha256(compressed) !== expected.compressedSha256) throw new Error(`R2 compressed checksum mismatch: ${objectKey}`);
    const raw = await gunzipText(compressed);
    if (sha256(raw) !== expected.rawSha256) throw new Error(`R2 source checksum mismatch: ${objectKey}`);
}

async function uploadInputs(client, config, objectKeys, inputs) {
    for (const [name, input] of Object.entries(inputs)) {
        try {
            await putImmutableObject(client, config, objectKeys[name], input.compressed, 'application/gzip');
        } catch (error) {
            if (!(error instanceof R2ObjectAlreadyExistsError)) throw error;
        }
        await assertRemoteObject(client, config, objectKeys[name], input.metadata);
    }
}

async function uploadManifest(client, config, objectKey, manifest) {
    const body = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    try {
        await putImmutableObject(client, config, objectKey, body, 'application/json');
    } catch (error) {
        if (!(error instanceof R2ObjectAlreadyExistsError)) throw error;
    }
    const remote = await getR2Object(client, config, objectKey);
    if (sha256(remote) !== sha256(body)) throw new Error('R2 manifest checksum mismatch');
}

async function readRemoteManifest(client, config, objectKey) {
    const body = await getR2Object(client, config, objectKey);
    try {
        return JSON.parse(body.toString('utf8'));
    } catch (error) {
        throw new Error(`staged R2 manifest is invalid JSON: ${error.message}`);
    }
}

function assertStagedManifest(staged, expected) {
    if (staged.schema !== expected.schema || staged.snapshot?.prefix !== expected.snapshot.prefix) throw new Error('staged R2 manifest does not match this Safe Apply');
    for (const name of Object.keys(expected.objects)) {
        const actual = staged.objects?.[name];
        const source = expected.objects[name];
        if (actual?.rawSha256 !== source.rawSha256 || actual?.compressedSha256 !== source.compressedSha256) {
            throw new Error(`staged R2 object differs from current Safe Apply: ${name}`);
        }
    }
}

async function requireValidatedStage(client, config, stagedManifest) {
    const keys = createSnapshotObjectKeys(STAGING_PREFIX, stagedManifest.snapshot.syncedAt, stagedManifest.snapshot.previewHash);
    const remoteManifest = await readRemoteManifest(client, config, keys.manifest);
    assertStagedManifest(remoteManifest, stagedManifest);
    for (const [name, expected] of Object.entries(stagedManifest.objects)) await assertRemoteObject(client, config, keys[name], expected);
}

async function requireLocalStageVerification(expected) {
    const stage = await readJson(STAGE_MANIFEST_PATH, 'r2-snapshot-stage-manifest.json');
    assertStagedManifest(stage, expected);
    if (!stage.stagingVerification?.verifiedAt) throw new Error('run shipdb:erkul:snapshot:verify -- --stage before publishing immutable objects');
}

async function main() {
    const { mode } = parseArgs(process.argv.slice(2));
    const config = readR2Config(process.env, 'R2_SNAPSHOT_WRITER');
    const [meta, report, sourceCommit, inputs, derived] = await Promise.all([
        readJson(SOURCE_FILES.fetchMeta, 'fetch-meta.json'),
        readJson(BUILD_REPORT_PATH, 'live-data-build-report.json'),
        getGitCommit(),
        readSnapshotInputs(),
        hashDerivedFiles()
    ]);
    assertApplyContext(meta, report);
    const objectKeys = createSnapshotObjectKeys(mode, meta.fetchedAt, report.previewHash);
    const snapshotArgs = {
        previewHash: report.previewHash,
        syncedAt: meta.fetchedAt,
        sourceCommit,
        prefix: mode,
        objects: objectEntries(inputs),
        derived
    };
    const manifest = createSnapshotManifest(snapshotArgs);
    const client = createR2Client(config);
    if (mode === SNAPSHOT_PREFIX) {
        const stagedManifest = createSnapshotManifest({ ...snapshotArgs, prefix: STAGING_PREFIX });
        await requireLocalStageVerification(stagedManifest);
        await requireValidatedStage(client, config, stagedManifest);
    }
    await uploadInputs(client, config, objectKeys, inputs);
    await uploadManifest(client, config, objectKeys.manifest, manifest);
    if (mode === SNAPSHOT_PREFIX) {
        await writeFile(SNAPSHOT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    } else {
        await writeFile(STAGE_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
    console.log(`R2 ${mode} snapshot verified: ${manifest.snapshot.prefix}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
