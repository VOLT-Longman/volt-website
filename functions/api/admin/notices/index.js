import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapNotice, noticeInput } from '../../../_shared/cms.js';
import { ensureNoticesEnColumns } from '../../../_shared/notices.js';

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return listItems(env);
  if (request.method === 'POST') return createItem(request, env);
  return methodNotAllowed();
}

async function listItems(env) {
  const result = await requireDb(env).prepare('SELECT * FROM notices ORDER BY pinned DESC, date DESC, created_at DESC').all();
  return json({ items: (result.results || []).map(mapNotice) });
}

async function createItem(request, env) {
  let item; try { item = noticeInput((await readJson(request)) || {}); } catch (err) { return error(err.message || 'Invalid input', 422); }
  if (!item.title) return error('Missing required fields', 422);
  const db = requireDb(env);
  await ensureNoticesEnColumns(db);
  await db.prepare('INSERT INTO notices (id, title, content, tag, title_en, content_en, tag_en, pinned, published, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(item.id, item.title, item.content, item.tag, item.title_en, item.content_en, item.tag_en, item.pinned, item.published, item.date, item.created_at, item.updated_at).run();
  return json({ item: mapNotice(item) }, { status: 201 });
}
