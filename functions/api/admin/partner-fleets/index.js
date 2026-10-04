import { adminDb } from '../../../_shared/admin-db.js';
import { adminList } from '../../../_shared/admin-collections.js';
import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson } from '../../../_shared/http.js';
import { mapPartnerFleet, partnerFleetInput } from '../../../_shared/cms.js';
import { tableHasColumn } from '../../../_shared/schema.js';

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return listItems(request, env);
  if (request.method === 'POST') return createItem(request, env);
  return methodNotAllowed();
}

async function listItems(request, env) {
  return json(await adminList(adminDb(request, env), request, 'partner-fleets', mapPartnerFleet));
}

async function createItem(request, env) {
  let item;
  try {
    item = partnerFleetInput((await readJson(request)) || {});
  } catch (err) {
    return error(err.message || 'Invalid input', 422);
  }
  if (!item.name) return error('Missing required fields', 422);
  const db = adminDb(request, env);
  if (await tableHasColumn(db, 'partner_fleets', 'photo_url')) {
    await createPartnerFleetWithPhoto(db, item);
  } else {
    await createPartnerFleetLegacy(db, item);
  }
  return json({ item: mapPartnerFleet(item) }, { status: 201 });
}

async function createPartnerFleetWithPhoto(db, item) {
  await db.prepare(`
    INSERT INTO partner_fleets (id, name, region, game, focus, description, member_count, discord_url, website_url, photo_url, logo_url, established, sort_order, published, created_at, updated_at, translations_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(item.id, item.name, item.region, item.game, item.focus, item.description, item.member_count, item.discord_url, item.website_url, item.photo_url, item.logo_url, item.established, item.sort_order, item.published, item.created_at, item.updated_at, item.translations_json).run();
}

async function createPartnerFleetLegacy(db, item) {
  const logoUrl = item.logo_url || item.photo_url;
  await db.prepare(`
    INSERT INTO partner_fleets (id, name, region, game, focus, description, member_count, discord_url, website_url, logo_url, established, sort_order, published, created_at, updated_at, translations_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(item.id, item.name, item.region, item.game, item.focus, item.description, item.member_count, item.discord_url, item.website_url, logoUrl, item.established, item.sort_order, item.published, item.created_at, item.updated_at, item.translations_json).run();
}
