import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapEvent, eventInput } from '../../../_shared/cms.js';

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return listItems(env);
  if (request.method === 'POST') return createItem(request, env);
  return methodNotAllowed();
}

async function listItems(env) {
  const result = await requireDb(env).prepare('SELECT * FROM events ORDER BY COALESCE(event_date, created_at) DESC').all();
  return json({ items: (result.results || []).map(mapEvent) });
}

async function createItem(request, env) {
  const item = eventInput((await readJson(request)) || {});
  if (!item.title) return error('Missing required fields', 422);
  await requireDb(env).prepare('INSERT INTO events (id, title, description, type, status, date_label, event_date, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(item.id, item.title, item.description, item.type, item.status, item.date_label, item.event_date, item.published, item.created_at, item.updated_at).run();
  return json({ item: mapEvent(item) }, { status: 201 });
}
