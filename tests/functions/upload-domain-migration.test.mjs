import test from 'node:test';
import assert from 'node:assert/strict';
import { ownedUploadKeyFromUrl } from '../../functions/_shared/upload-cleanup.js';

const key = 'gallery/1780000000000-12345678-1234-1234-1234-123456789abc.webp';
const env = {
  R2_PUBLIC_BASE_URL: 'https://images.volt.ceo',
  R2_PUBLIC_LEGACY_BASE_URLS: '["https://old-bucket.r2.dev/"]'
};

test('image domain migration preserves ownership of old uploads', () => {
  assert.equal(ownedUploadKeyFromUrl(`https://images.volt.ceo/${key}`, env), key);
  assert.equal(ownedUploadKeyFromUrl(`https://old-bucket.r2.dev/${key}`, env), key);
  for (const url of [
    `https://old-bucket.r2.dev.evil.example/${key}`,
    `https://unrelated.r2.dev/${key}`,
    `https://old-bucket.r2.dev/${key}?download=1`,
    'https://old-bucket.r2.dev/gallery/manual.webp'
  ]) assert.equal(ownedUploadKeyFromUrl(url, env), null);
});

test('malformed or unsafe aliases do not authorize external upload URLs', () => {
  for (const aliases of ['broken JSON', '{}', '[null,4]', '["http://old-bucket.r2.dev"]', '["https://user@old-bucket.r2.dev"]', '["https://old-bucket.r2.dev?x=1"]']) {
    assert.equal(ownedUploadKeyFromUrl(`https://old-bucket.r2.dev/${key}`, { ...env, R2_PUBLIC_LEGACY_BASE_URLS: aliases }), null);
    assert.equal(ownedUploadKeyFromUrl(`https://images.volt.ceo/${key}`, { ...env, R2_PUBLIC_LEGACY_BASE_URLS: aliases }), key);
  }
  assert.equal(ownedUploadKeyFromUrl(`/${key}`, {}), key);
});
