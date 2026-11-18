import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST_PATH = 'data/canonical/shipdb-manifest.json';
const expected = {
  canonical: ['data/canonical/ships-canonical.json', 'core'],
  localization: ['data/canonical/localization-ships.json', 'core'],
  operational: ['data/canonical/operational-ships.json', 'core'],
  editionAliases: ['data/canonical/edition-aliases.json', 'core'],
  roleLocalization: ['data/canonical/localization-roles.json', 'core'],
  filterTaxonomy: ['data/canonical/ship-filter-taxonomy.json', 'core'],
  rsiOfficial: ['data/canonical/ships-rsi-official.json', 'core'],
  rsiLocalization: ['data/canonical/localization-rsi-official.json', 'core'],
  presentation: ['data/canonical/presentation-ships.json', 'core']
};

function normalizeHashInput(text) {
  return text.replace(/\r\n/g, '\n');
}

function hash(text) {
  return createHash('sha256').update(normalizeHashInput(text)).digest('hex');
}

test('ShipDB client manifest pins every canonical asset to its exact source hash', async () => {
  const manifest = JSON.parse(await readFile(join(ROOT, MANIFEST_PATH), 'utf8'));
  assert.equal(manifest.schema, 'shipdb-client-manifest/v1');
  assert.match(manifest.version, /^[a-f0-9]{16}$/);
  assert.deepEqual(Object.keys(manifest.files).sort(), Object.keys(expected).sort());

  for (const [key, [path, group]] of Object.entries(expected)) {
    const entry = manifest.files[key];
    assert.equal(entry.path, path, `${key} path`);
    assert.equal(entry.group, group, `${key} group`);
    assert.equal(entry.sha256, hash(await readFile(join(ROOT, path), 'utf8')), `${key} hash`);
  }
});

test('retired Safe Apply cannot overwrite the game-file catalog; new build refreshes the manifest', async () => {
  const applySource = await readFile(join(ROOT, 'scripts/erkul/apply-erkul-live-data.mjs'), 'utf8');
  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  assert.match(applySource, /process.exitCode = 1/);
  assert.doesNotMatch(applySource, /writeFile|fetch\(/);
  const buildSource = await readFile(join(ROOT, 'scripts/shipdb-rewrite/build-canonical.mjs'), 'utf8');
  assert.match(buildSource, /build-game-ships/);
  assert.match(buildSource, /build-canonical-manifest/);
  assert.equal(packageJson.scripts['shipdb:erkul:post-apply'], undefined);
  assert.match(packageJson.scripts['shipdb:canonical:build'], /build-canonical/);
});
