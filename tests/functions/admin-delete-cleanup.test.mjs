import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { onRequest as eventItem } from '../../functions/api/admin/events/[id].js';
import { onRequest as galleryItem } from '../../functions/api/admin/gallery/[id].js';
import { onRequest as noticeItem } from '../../functions/api/admin/notices/[id].js';
import { onRequest as partnerItem } from '../../functions/api/admin/partner-fleets/[id].js';
import { onRequest as leaderItem } from '../../functions/api/admin/leadership/[id].js';
import { onRequest as timelineItem } from '../../functions/api/admin/timeline/[id].js';
import { onRequestDelete as deleteUpload } from '../../functions/api/admin/upload.js';
import { createSqliteDb } from './sqlite-d1.mjs';
import { TEST_ENV, adminCookie, createMockR2, jsonRequest } from './helpers.mjs';

const VERSION = '2026-06-20T10:00:00.000Z';
const STALE = '2026-06-19T10:00:00.000Z';
const OWNED_KEY = 'gallery/1780000000000-12345678-1234-1234-1234-123456789abc.webp';
const OWNED_URL = `https://cdn.volt.ceo/${OWNED_KEY}`;

function cmsEnv() {
  const db = createSqliteDb();
  db.sqlite.exec(`
    CREATE TABLE events (id TEXT PRIMARY KEY, title TEXT, updated_at TEXT);
    CREATE TABLE event_rsvps (id TEXT PRIMARY KEY, event_id TEXT, user_sub TEXT);
    CREATE TABLE gallery_items (id TEXT PRIMARY KEY, title TEXT, image_url TEXT, thumb_url TEXT, updated_at TEXT);
    CREATE TABLE notices (id TEXT PRIMARY KEY, updated_at TEXT);
    CREATE TABLE partner_fleets (id TEXT PRIMARY KEY, logo_url TEXT, photo_url TEXT, updated_at TEXT);
    CREATE TABLE leadership_members (id TEXT PRIMARY KEY, avatar_url TEXT, updated_at TEXT);
    CREATE TABLE timeline_entries (id TEXT PRIMARY KEY, updated_at TEXT);
  `);
  const bucket = createMockR2();
  return { db, bucket, env: { ...TEST_ENV, DB: db, GALLERY_BUCKET: bucket, R2_PUBLIC_BASE_URL: 'https://cdn.volt.ceo' } };
}

async function remove(handler, env, collection, id, expectedUpdatedAt = VERSION) {
  const request = jsonRequest(`https://volt.ceo/api/admin/${collection}/${id}`, {
    method: 'DELETE', cookie: await adminCookie(), body: { expectedUpdatedAt }
  });
  return handler({ request, env, params: { id } });
}

test('event DELETE atomically removes its RSVPs and keeps other events', async () => {
  const { db, env } = cmsEnv();
  db.sqlite.exec(`
    INSERT INTO events VALUES ('e1', 'event one', '${VERSION}'), ('e2', 'event two', '${VERSION}');
    INSERT INTO event_rsvps VALUES ('r1', 'e1', 'u1'), ('r2', 'e2', 'u1');
  `);
  const response = await remove(eventItem, env, 'events', 'e1');
  assert.equal(response.status, 200);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM events WHERE id = ?').get('e1').count, 0);
  assert.deepEqual(db.sqlite.prepare('SELECT event_id FROM event_rsvps').all().map((row) => row.event_id), ['e2']);
});

test('event DELETE rejects stale version without deleting event or RSVPs', async () => {
  const { db, env } = cmsEnv();
  db.sqlite.exec(`INSERT INTO events VALUES ('e1', 'event one', '${VERSION}'); INSERT INTO event_rsvps VALUES ('r1', 'e1', 'u1');`);
  const response = await remove(eventItem, env, 'events', 'e1', STALE);
  assert.equal(response.status, 409);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM events').get().count, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM event_rsvps').get().count, 1);
});

test('event DELETE handles an edit between read and transactional delete', async () => {
  const { db, env } = cmsEnv();
  db.sqlite.exec(`INSERT INTO events VALUES ('e1', 'event one', '${VERSION}'); INSERT INTO event_rsvps VALUES ('r1', 'e1', 'u1');`);
  const originalBatch = db.batch.bind(db);
  db.batch = async (statements) => {
    db.sqlite.prepare('UPDATE events SET updated_at = ? WHERE id = ?').run('2026-06-21T00:00:00.000Z', 'e1');
    return originalBatch(statements);
  };
  const response = await remove(eventItem, env, 'events', 'e1');
  assert.equal(response.status, 409);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM events').get().count, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM event_rsvps').get().count, 1);
});

test('event DELETE rolls back when RSVP cleanup cannot run', async () => {
  const { db, env } = cmsEnv();
  db.sqlite.exec(`INSERT INTO events VALUES ('e1', 'event one', '${VERSION}'); DROP TABLE event_rsvps;`);
  await assert.rejects(remove(eventItem, env, 'events', 'e1'), /no such table: event_rsvps/);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM events').get().count, 1);
});

test('all CMS item DELETE endpoints reject a stale client version', async () => {
  const { db, env } = cmsEnv();
  db.sqlite.exec(`
    INSERT INTO notices VALUES ('n1', '${VERSION}');
    INSERT INTO gallery_items VALUES ('g1', 'photo', '/static/photo.jpg', NULL, '${VERSION}');
    INSERT INTO partner_fleets VALUES ('p1', NULL, NULL, '${VERSION}');
    INSERT INTO leadership_members VALUES ('l1', NULL, '${VERSION}');
    INSERT INTO timeline_entries VALUES ('t1', '${VERSION}');
  `);
  for (const [handler, collection, id, table] of [
    [noticeItem, 'notices', 'n1', 'notices'],
    [galleryItem, 'gallery', 'g1', 'gallery_items'],
    [partnerItem, 'partner-fleets', 'p1', 'partner_fleets'],
    [leaderItem, 'leadership', 'l1', 'leadership_members'],
    [timelineItem, 'timeline', 't1', 'timeline_entries']
  ]) {
    const response = await remove(handler, env, collection, id, STALE);
    assert.equal(response.status, 409, collection);
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id = ?`).get(id).count, 1, collection);
  }
});

test('upload DELETE removes only an unreferenced owned image', async () => {
  const { db, bucket, env } = cmsEnv();
  const request = () => jsonRequest('https://volt.ceo/api/admin/upload', {
    method: 'DELETE', cookie: '', body: { key: OWNED_KEY }
  });
  assert.equal((await deleteUpload({ request: request(), env })).status, 401);
  const authenticated = async (key) => deleteUpload({
    request: jsonRequest('https://volt.ceo/api/admin/upload', { method: 'DELETE', cookie: await adminCookie(), body: { key } }), env
  });
  assert.equal((await authenticated('../gallery/outside.webp')).status, 422);
  db.sqlite.prepare('INSERT INTO gallery_items VALUES (?, ?, ?, ?, ?)').run('g1', 'photo', OWNED_URL, null, VERSION);
  const inUse = await authenticated(OWNED_KEY);
  assert.equal(inUse.status, 200);
  assert.equal((await inUse.json()).deleted, false);
  assert.deepEqual(bucket.deletes, []);
  db.sqlite.prepare('DELETE FROM gallery_items WHERE id = ?').run('g1');
  const removed = await authenticated(OWNED_KEY);
  assert.equal((await removed.json()).deleted, true);
  assert.deepEqual(bucket.deletes, [OWNED_KEY]);
});

test('gallery deletion preserves a shared image until its last reference is removed', async () => {
  const { db, bucket, env } = cmsEnv();
  db.sqlite.prepare('INSERT INTO gallery_items VALUES (?, ?, ?, ?, ?)').run('g1', 'first', OWNED_URL, OWNED_URL, VERSION);
  db.sqlite.prepare('INSERT INTO gallery_items VALUES (?, ?, ?, ?, ?)').run('g2', 'second', OWNED_URL, null, VERSION);
  assert.equal((await remove(galleryItem, env, 'gallery', 'g1')).status, 200);
  assert.deepEqual(bucket.deletes, []);
  assert.equal((await remove(galleryItem, env, 'gallery', 'g2')).status, 200);
  assert.deepEqual(bucket.deletes, [OWNED_KEY]);
});

test('one-time migration removes historical orphan RSVPs only', () => {
  const { db } = cmsEnv();
  db.sqlite.exec(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT); INSERT INTO events VALUES ('live', 'live', '${VERSION}'); INSERT INTO event_rsvps VALUES ('r1', 'live', 'u1'), ('r2', 'gone', 'u2');`);
  db.sqlite.exec(readFileSync(new URL('../../migrations/0014_cleanup_orphan_event_rsvps.sql', import.meta.url), 'utf8'));
  assert.deepEqual(db.sqlite.prepare('SELECT event_id FROM event_rsvps').all().map((row) => row.event_id), ['live']);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id = '0014'").get().count, 1);
});
