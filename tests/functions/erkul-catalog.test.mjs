import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fetchErkulCatalog, adaptCatalogShip, adaptCatalogPrices } from '../../functions/_shared/erkul-catalog.js';

const bin = data => deflateRawSync(Buffer.from(JSON.stringify(data)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('catalog adapter preserves exact identity, general cargo, current fuel and insurance', () => {
  const ship = adaptCatalogShip({ ref: 'ref', className: 'ship', category: 'AssembledShip', name: 'Ship', size: 2 },
    { ref: 'ref', className: 'ship', precomputed: { hp: { total: 3050 }, cargo: 0, fuel: { quantumCapacity: 0.6 } }, vehicle: { insurance: { baseWaitTimeMinutes: 10 } } }, '4.10.1', '2026-10-04');
  assert.equal(ship.data.hull.totalHp, 3050);
  assert.equal(ship.data.cargo, 0);
  assert.equal(ship.data.qtFuelCapacity, 0.6);
  assert.equal(ship.data.insurance.baseWaitTimeMinutes, 10);
  assert.throws(() => adaptCatalogShip({ ref: 'other' }, { ref: 'ref', precomputed: {} }), /identity/);
  const shops = adaptCatalogPrices({ terminals: { 1: { name: 'Shop', city: 'City' } }, items: { ref: [{ terminal: 1, buy: 100, rent: 5 }] } }, [ship]);
  assert.equal(shops.length, 2);
  assert.equal(shops[1].data.rental, true);
});

test('unsupported schema, corrupted content and mixed catalog versions fail closed', async () => {
  await assert.rejects(fetchErkulCatalog({ fetchImpl: async () => new Response(bin({ schemaVersion: 9 })) }), /schema/);
  const index = bin({ dataVersion: 'other', ships: [] });
  const manifest = { schemaVersion: 8, branch: 'LIVE', dataVersion: 'current', singles: [{ kind: 'index', path: 'index.bin', sha256: digest(index) }], groups: [] };
  const fetchImpl = async url => new Response(url.endsWith('catalog.bin') ? bin(manifest) : index);
  await assert.rejects(fetchErkulCatalog({ fetchImpl }), /version\/count/);
  manifest.singles[0].sha256 = '0'.repeat(64);
  await assert.rejects(fetchErkulCatalog({ fetchImpl }), /hash mismatch/);
  manifest.singles[0].path = '../other.bin';
  await assert.rejects(fetchErkulCatalog({ fetchImpl }), /path/);
});
