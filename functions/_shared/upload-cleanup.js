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
  let legacyBases = [];
  try {
    const configured = JSON.parse(env.R2_PUBLIC_LEGACY_BASE_URLS || '[]');
    if (Array.isArray(configured)) legacyBases = configured.filter((base) => {
      if (typeof base !== 'string') return false;
      try {
        const parsed = new URL(base);
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
      } catch (_error) { return false; }
    }).slice(0, 8);
  } catch (_error) { /* Invalid aliases never expand the upload allowlist. */ }
  for (const base of [baseUrl, ...legacyBases]) {
    const prefix = base ? `${base.replace(/\/+$/, '')}/` : '/';
    if (!url.startsWith(prefix)) continue;
    const key = url.slice(prefix.length);
    if (isOwnedUploadKey(key)) return key;
  }
  return null;
}

// Image URLs can be reused by another CMS entry. Scan the image-bearing fields
// before deleting an object; if a legacy schema/query is unavailable, fail closed.
export async function isUploadReferenced(db, key) {
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
  // Keep images needed to restore an older version. Legacy databases without
  // history retain the previous cleanup behavior until migration 0015 is applied.
  try {
    if (await db.prepare('SELECT 1 FROM cms_history WHERE instr(before_json, ?) > 0 OR instr(after_json, ?) > 0 LIMIT 1').bind(key, key).first()) return true;
  } catch (caught) {
    if (!/no such table: cms_history/i.test(caught.message)) throw caught;
  }
  return false;
}

export async function deleteUnreferencedUpload(env, key) {
  if (!isOwnedUploadKey(key) || !env.GALLERY_BUCKET) return false;
  if (await isUploadReferenced(requireDb(env), key)) return false;
  await env.GALLERY_BUCKET.delete(key);
  return true;
}

export async function findUnreferencedUploadKeys(db, keys) {
  if (!keys.length) return [];
  const hasHistory = await db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'cms_history'").first();
  const history = hasHistory ? 'AND NOT EXISTS (SELECT 1 FROM cms_history WHERE instr(before_json, c.key) > 0 OR instr(after_json, c.key) > 0)' : '';
  const result = await db.prepare(`WITH candidates(key) AS (VALUES ${keys.map(() => '(?)').join(', ')})
    SELECT c.key FROM candidates c WHERE NOT EXISTS (
      SELECT 1 FROM gallery_items WHERE image_url LIKE '%/' || c.key OR thumb_url LIKE '%/' || c.key
      UNION ALL SELECT 1 FROM partner_fleets WHERE logo_url LIKE '%/' || c.key OR photo_url LIKE '%/' || c.key
      UNION ALL SELECT 1 FROM leadership_members WHERE avatar_url LIKE '%/' || c.key
    ) ${history}`).bind(...keys).all();
  return (result.results || []).map((row) => row.key);
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
