import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function loadRegistry() {
  const source = await readFile(join(ROOT, 'js/shipdb-manufacturers.js'), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.VOLT_SHIPDB_MANUFACTURERS;
}

test('manufacturer registry: RSI official and Erkul labels resolve to one filter identity', async () => {
  const registry = await loadRegistry();
  const rsi = registry.resolve('RSI');
  const full = registry.resolve('Roberts Space Industries');
  assert.equal(rsi.key, full.key);
  assert.equal(rsi.label, full.label);
  assert.equal(rsi.key, 'roberts-space-industries');
  assert.equal(rsi.label, 'RSI');
});

test('manufacturer registry: MISC and Tumbril source variants resolve to existing labels', async () => {
  const registry = await loadRegistry();
  assert.equal(registry.resolve('MISC').key, registry.resolve('Musashi Industrial & Starflight Concern').key);
  assert.equal(registry.resolve('Tumbril').key, registry.resolve('Tumbril Land Systems').key);
});
