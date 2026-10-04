import { requireDb } from './http.js';

// Only objects created by the admin upload endpoint are eligible for cleanup.
// External/static assets and old URLs with an unknown origin remain untouched.
const OWNED_KEY = /^gallery\/\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

export function isOwnedUploadKey(key) {
  return typeof key === 'string' && OWNED_KEY.test(key);
}

export function ownedUploadKeyFromUrl(url, env) {
  if (typeof url !== 'string') return null;
  const baseUrl = String(env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const prefix = baseUrl ? `${baseUrl}/` : '/';
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return isOwnedUploadKey(key) ? key : null;
}

// Image URLs can be reused by another CMS entry. Scan the image-bearing fields
// before deleting an object; if a legacy schema/query is unavailable, fail closed.
async function isReferenced(db, key) {
  const suffix = `%/${key}`;
  const checks = [
    ['SELECT 1 FROM gallery_items WHERE image_url LIKE ? OR thumb_url LIKE ? LIMIT 1', [suffix, suffix]],
    ['SELECT 1 FROM partner_fleets WHERE logo_url LIKE ? LIMIT 1', [suffix]],
    ['SELECT 1 FROM leadership_members WHERE avatar_url LIKE ? LIMIT 1', [suffix]],
    ['SELECT 1 FROM partner_fleets WHERE photo_url LIKE ? LIMIT 1', [suffix]]
  ];
  for (const [sql, bindings] of checks) {
    if (await db.prepare(sql).bind(...bindings).first()) return true;
  }
  return false;
}

export async function deleteUnreferencedUpload(env, key) {
  if (!isOwnedUploadKey(key) || !env.GALLERY_BUCKET) return false;
  if (await isReferenced(requireDb(env), key)) return false;
  await env.GALLERY_BUCKET.delete(key);
  return true;
}

export async function cleanupReplacedUploadUrls(env, urls) {
  const keys = [...new Set(urls.map((url) => ownedUploadKeyFromUrl(url, env)).filter(Boolean))];
  for (const key of keys) {
    try {
      await deleteUnreferencedUpload(env, key);
    } catch (caught) {
      // The DB change already committed. Cleanup is deliberately best-effort so
      // transient R2/legacy schema trouble cannot turn a successful save into 500.
      console.warn('Could not clean up unreferenced upload', key, caught);
    }
  }
}
