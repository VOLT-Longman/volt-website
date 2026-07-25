import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    SNAPSHOT_PREFIX,
    STAGING_PREFIX,
    createR2ObjectUrl,
    createSnapshotManifest,
    createSnapshotObjectKeys,
    getR2Object,
    gunzipText,
    gzipText,
    putImmutableObject,
    sha256
} from '../../scripts/erkul/r2-snapshot.mjs';

const PREVIEW_HASH = 'a'.repeat(64);
const SYNCED_AT = '2026-07-25T01:02:03.456Z';
const CONFIG = { endpoint: 'https://account.r2.cloudflarestorage.com', bucket: 'volt-erkul-snapshots' };

test('R2 snapshot keys use immutable and separately staged prefixes', () => {
    const finalKeys = createSnapshotObjectKeys(SNAPSHOT_PREFIX, SYNCED_AT, PREVIEW_HASH);
    const stagingKeys = createSnapshotObjectKeys(STAGING_PREFIX, SYNCED_AT, PREVIEW_HASH);
    assert.equal(finalKeys.shipsRaw, `erkul/${SYNCED_AT}/${PREVIEW_HASH}/ships.raw.json.gz`);
    assert.equal(stagingKeys.manifest, `staging/${SYNCED_AT}/${PREVIEW_HASH}/manifest.json`);
    assert.throws(() => createSnapshotObjectKeys('unsafe', SYNCED_AT, PREVIEW_HASH), /unsupported snapshot prefix/);
});

test('R2 snapshot manifest requires source and compressed checksums', () => {
    const checksum = 'b'.repeat(64);
    const entry = { rawSha256: checksum, compressedSha256: checksum, rawBytes: 12, compressedBytes: 9 };
    const args = {
        previewHash: PREVIEW_HASH,
        syncedAt: SYNCED_AT,
        sourceCommit: '1234567',
        prefix: SNAPSHOT_PREFIX,
        objects: { shipsRaw: entry, shopRaw: entry, fetchMeta: entry },
        derived: { inputManifestSha256: checksum }
    };
    const manifest = createSnapshotManifest(args);
    assert.equal(manifest.schema, 'erkul-r2-snapshot/v1');
    assert.equal(manifest.snapshot.prefix, `erkul/${SYNCED_AT}/${PREVIEW_HASH}`);
    assert.throws(() => createSnapshotManifest({ ...args, sourceCommit: 'not-a-sha' }), /sourceCommit/);
});

test('R2 transfer preserves gzip content and refuses overwrites', async () => {
    const stored = new Map();
    const client = {
        async fetch(url, options = {}) {
            if (!options.method || options.method === 'GET') {
                return stored.has(url) ? new Response(stored.get(url)) : new Response('missing', { status: 404 });
            }
            if (options.headers['If-None-Match'] === '*' && stored.has(url)) return new Response(null, { status: 412 });
            stored.set(url, options.body);
            return new Response(null, { status: 200 });
        }
    };
    const key = createSnapshotObjectKeys(SNAPSHOT_PREFIX, SYNCED_AT, PREVIEW_HASH).shipsRaw;
    const compressed = await gzipText('{"ship":"Railen"}\n');
    await putImmutableObject(client, CONFIG, key, compressed, 'application/gzip');
    assert.equal(await gunzipText(await getR2Object(client, CONFIG, key)), '{"ship":"Railen"}\n');
    await assert.rejects(() => putImmutableObject(client, CONFIG, key, compressed, 'application/gzip'), /already exists/);
    assert.equal(sha256(compressed).length, 64);
    assert.match(createR2ObjectUrl(CONFIG, key), /volt-erkul-snapshots\/erkul\//);
});

test('R2 publisher requires a verified staging receipt before immutable publish', async () => {
    const publisher = await readFile(new URL('../../scripts/erkul/publish-r2-snapshot.mjs', import.meta.url), 'utf8');
    const transport = await readFile(new URL('../../scripts/erkul/r2-snapshot.mjs', import.meta.url), 'utf8');
    assert.match(publisher, /requireLocalStageVerification\(stagedManifest\)/);
    assert.match(publisher, /requireValidatedStage\(client, config, stagedManifest\)/);
    assert.match(transport, /If-None-Match/);
});
