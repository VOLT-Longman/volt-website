import { adminList } from '../../../_shared/admin-collections.js';
import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapTimelineEntry, timelineInput } from '../../../_shared/cms.js';

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return listItems(request, env);
  if (request.method === 'POST') return createItem(request, env);
  return methodNotAllowed();
}

async function listItems(request, env) {
  return json(await adminList(requireDb(env), request, 'timeline', mapTimelineEntry));
}

async function createItem(request, env) {
  let item;
  try {
    item = timelineInput((await readJson(request)) || {});
  } catch (err) {
    return error(err.message || 'Invalid input', 422);
  }
  if (!item.title || !item.date_label) return error('Missing required fields', 422);
  await requireDb(env).prepare(`
    INSERT INTO timeline_entries (id, date_label, title, description, sort_order, published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(item.id, item.date_label, item.title, item.description, item.sort_order, item.published, item.created_at, item.updated_at).run();
  return json({ item: mapTimelineEntry(item) }, { status: 201 });
}
