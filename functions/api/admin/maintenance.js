import { requireAdmin } from '../../_shared/auth.js';
import { error, json, readJson, requireDb } from '../../_shared/http.js';
import { deleteUnreferencedUpload, isOwnedUploadKey, findUnreferencedUploadKeys } from '../../_shared/upload-cleanup.js';

const GRACE_MS = 24 * 60 * 60 * 1000;
export async function onRequestGet({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  const db = requireDb(env);
  const count = await db.prepare('SELECT COUNT(*) AS total FROM event_rsvps WHERE NOT EXISTS (SELECT 1 FROM events WHERE events.id = event_rsvps.event_id)').first();
  if (!env.GALLERY_BUCKET) return json({ orphanRsvps: count?.total || 0, candidates: [], storageAvailable: false });
  const cursor = new URL(request.url).searchParams.get('cursor') || undefined;
  const listed = await env.GALLERY_BUCKET.list({ prefix: 'gallery/', limit: 100, cursor });
  const eligible = listed.objects.filter((object) => isOwnedUploadKey(object.key) && Date.now() - Number(object.key.split('/')[1].slice(0, 13)) >= GRACE_MS);
  const unreferenced = new Set(await findUnreferencedUploadKeys(db, eligible.map((object) => object.key)));
  const candidates = eligible.filter((object) => unreferenced.has(object.key)).map((object) => ({ key: object.key, size: object.size, uploaded: object.uploaded }));
  return json({ orphanRsvps: count?.total || 0, candidates, storageAvailable: true, cursor: listed.truncated ? listed.cursor : null });
}

export async function onRequestPost({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  const body = (await readJson(request)) || {};
  const db = requireDb(env);
  if (body.action === 'cleanup-rsvps') {
    // Preserve every column before deletion. D1 batch rolls the entire operation
    // back if either the backup or delete fails. Repeat runs do not duplicate it.
    const orphan = 'NOT EXISTS (SELECT 1 FROM events WHERE events.id = event_rsvps.event_id)';
    const results = await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS event_rsvps_orphan_backup AS SELECT *, strftime('%Y-%m-%dT%H:%M:%fZ','now') AS backed_up_at FROM event_rsvps WHERE 0"),
      db.prepare(`INSERT INTO event_rsvps_orphan_backup SELECT *, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM event_rsvps WHERE ${orphan} AND NOT EXISTS (SELECT 1 FROM event_rsvps_orphan_backup b WHERE b.id = event_rsvps.id)`),
      db.prepare(`DELETE FROM event_rsvps WHERE ${orphan}`)
    ]);
    return json({ ok: true, deleted: results[2].meta.changes });
  }
  if (body.action === 'delete-uploads') {
    if (!env.GALLERY_BUCKET) return error('Missing R2 binding', 503);
    if (!Array.isArray(body.keys) || body.keys.length > 100 || body.keys.some((key) => !isOwnedUploadKey(key))) return error('Invalid upload keys', 422);
    const results = [];
    for (const key of new Set(body.keys)) {
      if (Date.now() - Number(key.split('/')[1].slice(0, 13)) < GRACE_MS) { results.push({ key, deleted: false }); continue; }
      // Check references again after the operator has reviewed the candidate list.
      results.push({ key, deleted: await deleteUnreferencedUpload(env, key) });
    }
    return json({ ok: true, results });
  }
  return error('Invalid maintenance action', 422);
}
