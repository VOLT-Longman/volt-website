import { createHash } from 'node:crypto';
import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { AwsClient } from 'aws4fetch';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const SNAPSHOT_SCHEMA = 'erkul-r2-snapshot/v1';
export const SNAPSHOT_PREFIX = 'erkul';
export const STAGING_PREFIX = 'staging';
export const SNAPSHOT_FILE_NAMES = Object.freeze({
    shipsRaw: 'ships.raw.json.gz',
    shopRaw: 'shop.raw.json.gz',
    fetchMeta: 'fetch-meta.json.gz',
    manifest: 'manifest.json'
});

const PREVIEW_HASH_PATTERN = /^[a-f0-9]{64}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class R2ObjectAlreadyExistsError extends Error {
    constructor(objectKey) {
        super(`immutable R2 object already exists: ${objectKey}`);
        this.name = 'R2ObjectAlreadyExistsError';
    }
}

export function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

export function normalizeSnapshotTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('snapshot syncedAt must be a valid ISO timestamp');
    return date.toISOString();
}

export function assertPreviewHash(value) {
    if (!PREVIEW_HASH_PATTERN.test(value || '')) throw new Error('snapshot previewHash must be a 64-character lowercase SHA-256 hash');
    return value;
}

export function createSnapshotPrefix(prefix, syncedAt, previewHash) {
    if (![SNAPSHOT_PREFIX, STAGING_PREFIX].includes(prefix)) throw new Error(`unsupported snapshot prefix: ${prefix}`);
    return `${prefix}/${normalizeSnapshotTime(syncedAt)}/${assertPreviewHash(previewHash)}`;
}

export function createSnapshotObjectKeys(prefix, syncedAt, previewHash) {
    const base = createSnapshotPrefix(prefix, syncedAt, previewHash);
    return Object.fromEntries(Object.entries(SNAPSHOT_FILE_NAMES).map(([name, fileName]) => [name, `${base}/${fileName}`]));
}

export async function gzipText(text) {
    return gzipAsync(Buffer.from(text, 'utf8'));
}

export async function gunzipText(bytes) {
    return (await gunzipAsync(bytes)).toString('utf8');
}

function assertObjectEntry(name, entry) {
    if (!entry || typeof entry !== 'object') throw new Error(`snapshot object is missing: ${name}`);
    if (!SHA256_PATTERN.test(entry.rawSha256 || '')) throw new Error(`${name} rawSha256 must be SHA-256`);
    if (!SHA256_PATTERN.test(entry.compressedSha256 || '')) throw new Error(`${name} compressedSha256 must be SHA-256`);
    if (!Number.isInteger(entry.rawBytes) || entry.rawBytes < 0) throw new Error(`${name} rawBytes must be a non-negative integer`);
    if (!Number.isInteger(entry.compressedBytes) || entry.compressedBytes < 0) throw new Error(`${name} compressedBytes must be a non-negative integer`);
}

export function createSnapshotManifest({ previewHash, syncedAt, sourceCommit, prefix, objects, derived }) {
    const snapshotPrefix = createSnapshotPrefix(prefix, syncedAt, previewHash);
    if (!/^[a-f0-9]{7,64}$/.test(sourceCommit || '')) throw new Error('snapshot sourceCommit must be a git SHA');
    for (const name of ['shipsRaw', 'shopRaw', 'fetchMeta']) assertObjectEntry(name, objects?.[name]);
    return {
        schema: SNAPSHOT_SCHEMA,
        source: 'erkul-live',
        snapshot: { previewHash, syncedAt: normalizeSnapshotTime(syncedAt), sourceCommit, prefix: snapshotPrefix },
        objects,
        derived
    };
}

export function readR2Config(env, credentialPrefix) {
    const accountId = env.R2_ACCOUNT_ID;
    const bucket = env.R2_SNAPSHOT_BUCKET;
    const accessKeyId = env[`${credentialPrefix}_ACCESS_KEY_ID`];
    const secretAccessKey = env[`${credentialPrefix}_SECRET_ACCESS_KEY`];
    if (![accountId, bucket, accessKeyId, secretAccessKey].every(Boolean)) {
        throw new Error(`missing R2 snapshot configuration for ${credentialPrefix}`);
    }
    return { accountId, bucket, accessKeyId, secretAccessKey, endpoint: `https://${accountId}.r2.cloudflarestorage.com` };
}

export function createR2Client(config) {
    return new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: 's3', region: 'auto' });
}

export function createR2ObjectUrl(config, objectKey) {
    if (!objectKey || objectKey.includes('..') || objectKey.startsWith('/')) throw new Error('unsafe R2 object key');
    return `${config.endpoint}/${config.bucket}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
}

async function errorMessage(response) {
    const body = await response.text();
    return `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`;
}

export async function putImmutableObject(client, config, objectKey, body, contentType) {
    const response = await client.fetch(createR2ObjectUrl(config, objectKey), {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'If-None-Match': '*' },
        body
    });
    if (response.status === 412) throw new R2ObjectAlreadyExistsError(objectKey);
    if (!response.ok) throw new Error(`R2 upload failed for ${objectKey}: ${await errorMessage(response)}`);
}

export async function getR2Object(client, config, objectKey) {
    const response = await client.fetch(createR2ObjectUrl(config, objectKey));
    if (!response.ok) throw new Error(`R2 download failed for ${objectKey}: ${await errorMessage(response)}`);
    return Buffer.from(await response.arrayBuffer());
}
