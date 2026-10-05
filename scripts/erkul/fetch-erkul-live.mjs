import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fetchErkulCatalog, ERKUL_CATALOG_URL, ERKUL_PRICES_URL } from '../../functions/_shared/erkul-catalog.js';
const OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/external/erkul');
async function main() {
    await mkdir(OUTPUT_DIR, { recursive: true });
    let detailCache = {};
    try { detailCache = JSON.parse(await readFile(resolve(OUTPUT_DIR, 'catalog-details.json'), 'utf8')); } catch { /* first sync */ }
    const snapshot = await fetchErkulCatalog({ detailCache });
    const ships = `${JSON.stringify(snapshot.ships, null, 2)}\n`;
    const shops = `${JSON.stringify(snapshot.shops, null, 2)}\n`;
    await writeFile(resolve(OUTPUT_DIR, 'ships.raw.json'), ships);
    await writeFile(resolve(OUTPUT_DIR, 'shop.raw.json'), shops);
    await writeFile(resolve(OUTPUT_DIR, 'catalog-details.json'), `${JSON.stringify(snapshot.details)}\n`);
    await writeFile(resolve(OUTPUT_DIR, 'catalog-meta.json'), `${JSON.stringify(snapshot.metadata, null, 2)}\n`);
    await writeFile(resolve(OUTPUT_DIR, 'fetch-meta.json'), `${JSON.stringify({ source: 'erkul-live', endpoints: { ships: ERKUL_CATALOG_URL, shop: ERKUL_PRICES_URL }, fetchedAt: snapshot.metadata.fetchedAt, catalog: snapshot.metadata, shipCount: snapshot.ships.length, shopCount: snapshot.shops.length, shipsBytes: Buffer.byteLength(ships), shopBytes: Buffer.byteLength(shops), rawSha256: { ships: createHash('sha256').update(ships).digest('hex'), shops: createHash('sha256').update(shops).digest('hex') } }, null, 2)}\n`);
    console.log(`Erkul ${snapshot.metadata.version}: ${snapshot.ships.length} ships, ${snapshot.shops.length} ship terminals`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
