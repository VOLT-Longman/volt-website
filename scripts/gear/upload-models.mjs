// Dry-run by default. Credentials are read only from environment variables.
// Uses a PRIVATE bucket; never creates a public URL, domain or bucket policy.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const root = fileURLToPath(new URL('../../', import.meta.url));
const folder = resolve(root, 'assets/models/gear');
const indexBytes = await readFile(resolve(root, 'data/gear/models.json'));
const index = JSON.parse(indexBytes);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mode = process.argv.includes('--upload') ? 'upload' : process.argv.includes('--verify') ? 'verify' : 'dry-run';
const version = index.assetVersion;
if (!/^[\w.-]{1,40}$/.test(version)) throw new Error('Invalid assetVersion');
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed');
    if (entry.isDirectory()) { await walk(path); continue; }
    const name = relative(folder, path).split(sep).join('/');
    if (!/^(?:weapons\/[\w~.-]+\/(?:manifest\.json|body_lod\d+\.glb)|parts\/[\w~.-]+\.glb|tex\/[\w~.-]+\.(?:png|webp))$/.test(name) || name.includes('..')) throw new Error(`Unexpected model file: ${name}`);
    const bytes = await readFile(path);
    files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
  }
}
await walk(folder);
files.sort((a, b) => a.path.localeCompare(b.path));
const names = new Set(files.map((file) => `assets/models/gear/${file.path}`));
for (const entry of [...Object.values(index.weapons), ...Object.values(index.parts)]) {
  if (entry.ok && !names.has(entry.manifest || entry.file)) throw new Error(`Missing indexed model: ${entry.manifest || entry.file}`);
}
const release = { assetVersion: version, indexSha256: hash(indexBytes), files };
console.log(`${mode}: ${version}, ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes`);
if (mode === 'dry-run') {
  console.log('No upload. Use --upload after the operator creates and binds the private bucket; --verify checks every remote file.');
} else {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.FLEET_GEAR_BUCKET || 'volt-fleet-gear';
  if (!/^[a-f0-9]{32}$/i.test(account || '') || !/^[a-z0-9-]{3,63}$/.test(bucket)) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and FLEET_GEAR_BUCKET');
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) throw new Error('Set bucket-scoped R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY');
  const client = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const key = (path) => `${version}/${path}`;
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
        ContentType: ({ glb: 'model/gltf-binary', json: 'application/json', png: 'image/png', webp: 'image/webp' })[file.path.split('.').pop()],
        CacheControl: 'private, no-store', Metadata: { assetversion: version, sha256: file.sha256 }, IfNoneMatch: '*' }));
    }
    await verify(file);
    if (++completed % 25 === 0) console.log(`Verified ${completed}/${files.length}`);
  }
  if (mode === 'upload') await client.send(new PutObjectCommand({ Bucket: bucket, Key: key('_release.json'), Body: JSON.stringify(release),
    ContentType: 'application/json', CacheControl: 'private, no-store', Metadata: { assetversion: version } }));
  const published = JSON.parse(await (await get('_release.json')).Body.transformToString());
  if (JSON.stringify(published) !== JSON.stringify(release)) throw new Error('Uploaded release does not match models.json and local files');
  console.log(`Verified release ${version}: index and every object match.`);
  client.destroy();
}
