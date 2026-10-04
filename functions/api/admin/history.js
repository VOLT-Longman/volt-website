import { requireAdmin } from '../../_shared/auth.js';
import { error, json, readJson, requireDb } from '../../_shared/http.js';
import { ADMIN_COLLECTIONS } from '../../_shared/admin-collections.js';
import { CONFLICT_MESSAGE, nextUpdatedAt } from '../../_shared/cms.js';

export async function onRequestGet({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const collection = params.get('collection');
  if (!Object.hasOwn(ADMIN_COLLECTIONS, collection)) return error('Invalid collection', 422);
  const config = ADMIN_COLLECTIONS[collection];
  const itemId = params.get('itemId');
  const before = Math.max(0, Number.parseInt(params.get('before'), 10) || 0);
  const clauses = ['collection = ?'];
  const bindings = [collection];
  if (itemId) { clauses.push('item_id = ?'); bindings.push(itemId); }
  if (before) { clauses.push('id < ?'); bindings.push(before); }
  try {
    const result = await requireDb(env).prepare(`SELECT *, (SELECT updated_at FROM ${config.table} WHERE ${config.key || 'id'} = cms_history.item_id) AS current_updated_at FROM cms_history WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT 21`).bind(...bindings).all();
    const rows = result.results || [];
    const items = rows.slice(0, 20).map((row) => ({ id: row.id, itemId: row.item_id, action: row.action, createdAt: row.created_at, actor: row.actor, currentUpdatedAt: row.current_updated_at ?? null, before: row.before_json ? JSON.parse(row.before_json) : null, after: row.after_json ? JSON.parse(row.after_json) : null }));
    return json({ items, next: rows.length > 20 ? items.at(-1).id : null });
  } catch (caught) {
    if (/no such table: cms_history/i.test(caught.message)) return error('변경 이력 기능은 운영 DB에 0015 마이그레이션을 적용한 뒤 사용할 수 있습니다.', 503);
    throw caught;
  }
}

export async function onRequestPost({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  const body = (await readJson(request)) || {};
  const config = Object.hasOwn(ADMIN_COLLECTIONS, body.collection) ? ADMIN_COLLECTIONS[body.collection] : null;
  if (!config || !Number.isSafeInteger(body.historyId) || !['before', 'after'].includes(body.version)) return error('Invalid restore request', 422);
  if (body.expectedUpdatedAt !== null && typeof body.expectedUpdatedAt !== 'string') return error('Current version is required', 422);
  const db = requireDb(env);
  const history = await db.prepare('SELECT * FROM cms_history WHERE id = ? AND collection = ?').bind(body.historyId, body.collection).first();
  if (!history) return error('History not found', 404);
  const encoded = history[`${body.version}_json`];
  if (!encoded) return error('복구할 내용이 없습니다.', 422);
  const snapshot = JSON.parse(encoded);
  const key = config.key || 'id';
  const current = await db.prepare(`SELECT * FROM ${config.table} WHERE ${key} = ?`).bind(history.item_id).first();
  if ((current?.updated_at ?? null) !== body.expectedUpdatedAt) return error(CONFLICT_MESSAGE, 409);
  const schema = await db.prepare(`PRAGMA table_info(${config.table})`).all();
  const allowed = new Set((schema.results || []).map((column) => column.name));
  const values = Object.fromEntries(Object.entries(snapshot).filter(([column]) => allowed.has(column)));
  values[key] = history.item_id;
  values.updated_at = nextUpdatedAt(current || {});
  if (current) {
    const columns = Object.keys(values).filter((column) => column !== key && column !== 'id');
    const result = await db.prepare(`UPDATE ${config.table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ${key} = ? AND updated_at IS ?`).bind(...columns.map((column) => values[column]), history.item_id, current.updated_at ?? null).run();
    if (!result.meta.changes) return error(CONFLICT_MESSAGE, 409);
  } else {
    const columns = Object.keys(values);
    const result = await db.prepare(`INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT(${key}) DO NOTHING`).bind(...columns.map((column) => values[column])).run();
    if (!result.meta.changes) return error(CONFLICT_MESSAGE, 409);
  }
  // DB triggers record the restore as a new version in the same transaction.
  return json({ ok: true, itemId: history.item_id });
}
