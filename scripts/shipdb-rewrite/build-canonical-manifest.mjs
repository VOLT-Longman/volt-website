import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST_PATH = 'data/canonical/shipdb-manifest.json';
const DATA_FILES = {
  canonical: { path: 'data/canonical/ships-canonical.json', group: 'core' },
  localization: { path: 'data/canonical/localization-ships.json', group: 'core' },
  operational: { path: 'data/canonical/operational-ships.json', group: 'core' },
  editionAliases: { path: 'data/canonical/edition-aliases.json', group: 'core' },
  roleLocalization: { path: 'data/canonical/localization-roles.json', group: 'core' },
  filterTaxonomy: { path: 'data/canonical/ship-filter-taxonomy.json', group: 'core' },
  rsiOfficial: { path: 'data/canonical/ships-rsi-official.json', group: 'core' },
  rsiLocalization: { path: 'data/canonical/localization-rsi-official.json', group: 'core' },
  presentation: { path: 'data/canonical/presentation-ships.json', group: 'core' }
};

function normalizeHashInput(text) {
  return text.replace(/\r\n/g, '\n');
}

function sha256(text) {
  return createHash('sha256').update(normalizeHashInput(text)).digest('hex');
}

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

const files = Object.fromEntries(Object.entries(DATA_FILES).map(([key, file]) => [key, {
  ...file,
  sha256: sha256(read(file.path))
}]));
const version = sha256(JSON.stringify(files)).slice(0, 16);
const manifest = {
  schema: 'shipdb-client-manifest/v1',
  version,
  files
};

writeFileSync(join(ROOT, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`ShipDB client manifest: ${version} (${Object.keys(files).length} files)`);
