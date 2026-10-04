import { adminDb } from '../../../_shared/admin-db.js';
import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson } from '../../../_shared/http.js';
import { mapPartnerFleet, partnerFleetInput, CONFLICT_MESSAGE, hasUpdateConflict } from '../../../_shared/cms.js';
import { tableHasColumn } from '../../../_shared/schema.js';
import { cleanupReplacedUploadUrls } from '../../../_shared/upload-cleanup.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'PUT') return updateItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(request, env, params.id);
  return methodNotAllowed();
}

async function updateItem(request, env, id) {
  const db = adminDb(request, env);
  const existing = await db.prepare('SELECT * FROM partner_fleets WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const body = (await readJson(request)) || {};
  if (hasUpdateConflict(body, existing)) return error(CONFLICT_MESSAGE, 409);
  let item;
  try {
    item = partnerFleetInput({ ...body, id }, existing);
  } catch (err) {
    return error(err.message || 'Invalid input', 422);
  }
  if (!item.name) return error('Missing required fields', 422);
  let result;
  if (await tableHasColumn(db, 'partner_fleets', 'photo_url')) {
    result = await updatePartnerFleetWithPhoto(db, id, item, existing);
  } else {
    result = await updatePartnerFleetLegacy(db, id, item, existing);
  }
  if (result.meta.changes === 0) return error(CONFLICT_MESSAGE, 409);
  await cleanupReplacedUploadUrls(env, [existing.photo_url, existing.logo_url]);
  return json({ item: mapPartnerFleet(item) });
}

async function updatePartnerFleetWithPhoto(db, id, item, existing) {
  return db.prepare(`
    UPDATE partner_fleets
    SET translations_json = ?, name = ?, region = ?, game = ?, focus = ?, description = ?, member_count = ?, discord_url = ?, website_url = ?, photo_url = ?, logo_url = ?, established = ?, sort_order = ?, published = ?, updated_at = ?
    WHERE id = ? AND updated_at IS ?
  `).bind(item.translations_json, item.name, item.region, item.game, item.focus, item.description, item.member_count, item.discord_url, item.website_url, item.photo_url, item.logo_url, item.established, item.sort_order, item.published, item.updated_at, id, existing.updated_at ?? null).run();
}

async function updatePartnerFleetLegacy(db, id, item, existing) {
  const logoUrl = item.logo_url || item.photo_url;
  return db.prepare(`
    UPDATE partner_fleets
    SET translations_json = ?, name = ?, region = ?, game = ?, focus = ?, description = ?, member_count = ?, discord_url = ?, website_url = ?, logo_url = ?, established = ?, sort_order = ?, published = ?, updated_at = ?
    WHERE id = ? AND updated_at IS ?
  `).bind(item.translations_json, item.name, item.region, item.game, item.focus, item.description, item.member_count, item.discord_url, item.website_url, logoUrl, item.established, item.sort_order, item.published, item.updated_at, id, existing.updated_at ?? null).run();
}

async function deleteItem(request, env, id) {
  const db = adminDb(request, env);
  const existing = await db.prepare('SELECT * FROM partner_fleets WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const body = (await readJson(request)) || {};
  if (hasUpdateConflict(body, existing)) return error(CONFLICT_MESSAGE, 409);
  const result = await db.prepare('DELETE FROM partner_fleets WHERE id = ? AND updated_at IS ?').bind(id, existing.updated_at ?? null).run();
  if (result.meta.changes === 0) return error(CONFLICT_MESSAGE, 409);
  await cleanupReplacedUploadUrls(env, [existing.photo_url, existing.logo_url]);
  return json({ ok: true });
}
