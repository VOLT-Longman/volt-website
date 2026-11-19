// Star-map planet textures -> the PRIVATE fleet bucket. Dry-run by default.
// Credentials are read only from environment variables. Never creates a public URL, domain or bucket policy.
// Same bucket as the gear models (volt-fleet-gear, Pages binding FLEET_GEAR_MODELS), under its own key prefix:
//   starmap/<assetVersion>/tex/<key>_512.webp | <key>_1k.webp      and      starmap/<assetVersion>/_release.json
//   node scripts/starmap/upload-textures.mjs            local check only (no network)
//   node scripts/starmap/upload-textures.mjs --upload   upload, then re-download and compare every file
//   node scripts/starmap/upload-textures.mjs --verify   compare every remote file, upload nothing
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = 'starmap';
const FILE = /^tex\/[a-z0-9_]{1,80}_(?:512|1k)\.webp$/;       // keep in step with functions/_shared/starmap-textures.js
const root = fileURLToPath(new URL('../../', import.meta.url));
const folder = resolve(root, 'assets/models/starmap');
const indexBytes = await readFile(resolve(root, 'data/starmap/textures.json'));
const index = JSON.parse(indexBytes);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mode = process.argv.includes('--upload') ? 'upload' : process.argv.includes('--verify') ? 'verify' : 'dry-run';
const version = index.assetVersion;
if (!/^[\w.-]{1,40}$/.test(version)) throw new Error('Invalid assetVersion');
const serverVersion = (await readFile(resolve(root, 'functions/_shared/starmap-texture-version.js'), 'utf8')).match(/starmapTextureVersion = '([^']+)'/)?.[1];
if (serverVersion !== version) throw new Error('functions/_shared/starmap-texture-version.js does not match textures.json. Run node scripts/starmap/sync-texture-version.mjs');

const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed');
    if (entry.isDirectory()) { await walk(path); continue; }
    const name = relative(folder, path).split(sep).join('/');
    if (!FILE.test(name)) throw new Error(`Unexpected star-map file: ${name}`);
    const bytes = await readFile(path);
    files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
  }
}
await walk(folder);
files.sort((a, b) => a.path.localeCompare(b.path));
// The local folder must be exactly what textures.json lists: same names, same bytes.
const local = new Map(files.map((file) => [`assets/models/starmap/${file.path}`, file]));
const listed = Object.values(index.textures).flatMap((texture) => Object.values(texture.files));
for (const entry of listed) {
  const file = local.get(entry.file);
  if (!file) throw new Error(`Missing listed texture: ${entry.file}`);
  if (file.sha256 !== entry.sha256 || file.bytes !== entry.bytes) throw new Error(`Local file differs from textures.json (export again): ${entry.file}`);
}
if (listed.length !== files.length) throw new Error(`Local folder has ${files.length} files but textures.json lists ${listed.length}`);

const release = { assetVersion: version, indexSha256: hash(indexBytes), files };
console.log(`${mode}: ${PREFIX}/${version}, ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes`);
if (mode === 'dry-run') {
  console.log('No upload. Use --upload to send to the private bucket; --verify checks every remote file.');
} else {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.FLEET_GEAR_BUCKET || 'volt-fleet-gear';
  if (!/^[a-f0-9]{32}$/i.test(account || '') || !/^[a-z0-9-]{3,63}$/.test(bucket)) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and FLEET_GEAR_BUCKET');
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) throw new Error('Set bucket-scoped R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY');
  const { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const key = (path) => `${PREFIX}/${version}/${path}`;
  const get = (path) => client.send(new GetObjectCommand({ Bucket: bucket, Key: key(path) }));
  const verify = async (file) => {
    const object = await get(file.path);
    if (object.Metadata?.assetversion !== version || object.ContentLength !== file.bytes
        || hash(await object.Body.transformToByteArray()) !== file.sha256) throw new Error(`Remote verification failed: ${file.path}`);
  };
  let completed = 0;
  // Sequential uploads avoid surprising request spikes and are easy to resume.
  for (const file of files) {
    if (mode === 'upload') {
      let existing;
      try { existing = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key(file.path) })); }
      catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }
      if (existing && (existing.Metadata?.sha256 !== file.sha256 || existing.Metadata?.assetversion !== version)) throw new Error(`Version already contains different bytes. Export a new assetVersion: ${file.path}`);
      if (!existing) await client.send(new PutObjectCommand({ Bucket: bucket, Key: key(file.path), Body: await readFile(resolve(folder, file.path)),
        ContentType: 'image/webp', CacheControl: 'private, no-store', Metadata: { assetversion: version, sha256: file.sha256 }, IfNoneMatch: '*' }));
    }
    await verify(file);
    if (++completed % 20 === 0) console.log(`Verified ${completed}/${files.length}`);
  }
  if (mode === 'upload') await client.send(new PutObjectCommand({ Bucket: bucket, Key: key('_release.json'), Body: JSON.stringify(release),
    ContentType: 'application/json', CacheControl: 'private, no-store', Metadata: { assetversion: version } }));
  const published = JSON.parse(await (await get('_release.json')).Body.transformToString());
  if (JSON.stringify(published) !== JSON.stringify(release)) throw new Error('Uploaded release does not match textures.json and local files');
  console.log(`Verified release ${PREFIX}/${version}: index and every object match.`);
  client.destroy();
}
