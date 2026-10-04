import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createSqliteDb } from './sqlite-d1.mjs';
import { TEST_ENV, adminCookie, jsonRequest } from './helpers.mjs';
import { onRequestGet as historyGet, onRequestPost as restore } from '../../functions/api/admin/history.js';
import { onRequestPost as maintain, onRequestGet as scan } from '../../functions/api/admin/maintenance.js';
import { onRequestGet as imageSource } from '../../functions/api/admin/image-source.js';
import { adminList } from '../../functions/_shared/admin-collections.js';
import { deleteUnreferencedUpload } from '../../functions/_shared/upload-cleanup.js';

const key = 'gallery/1780000000000-12345678-1234-1234-1234-123456789abc.webp';
const src = `https://cdn.volt.ceo/${key}`;
function setup() {
  const DB = createSqliteDb();
  for (const file of readdirSync('migrations').sort()) DB.sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  const GALLERY_BUCKET = { deletes: [], async delete(value) { this.deletes.push(value); }, async list() { return { objects: [{ key, size: 1000, uploaded: new Date(1780000000000) }], truncated: false }; } };
  return { ...TEST_ENV, DB, GALLERY_BUCKET, R2_PUBLIC_BASE_URL: 'https://cdn.volt.ceo' };
}
async function request(body, method = 'POST', path = 'history') {
  return jsonRequest(`https://volt.ceo/api/admin/${path}`, { method, body, cookie: await adminCookie() });
}

test('history and maintenance reject unauthenticated access', async () => {
  for (const handler of [historyGet, restore, maintain, scan, imageSource]) {
    const response = await handler({ request: new Request('https://volt.ceo/api/admin/history'), env: setup() });
    assert.equal(response.status, 401);
  }
});

test('opt-in pagination has stable boundaries, literal search and full-list compatibility', async () => {
  const env = setup();
  env.DB.sqlite.exec('DELETE FROM notices');
  for (let index = 0; index < 43; index++) env.DB.sqlite.prepare('INSERT INTO notices(id,title,content,date,updated_at) VALUES(?,?,?,?,?)').run(`n${String(index).padStart(2, '0')}`, index === 7 ? '100%_literal' : `notice ${index}`, '', '2026-10-01', '2026-10-01');
  const all = await adminList(env.DB, new Request('https://volt.ceo/api/admin/notices'), 'notices', (item) => item);
  assert.equal(all.items.length, 43);
  const second = await adminList(env.DB, new Request('https://volt.ceo/api/admin/notices?page=2'), 'notices', (item) => item);
  assert.equal(second.items.length, 20);
  assert.equal(second.items[0].id, 'n20');
  const last = await adminList(env.DB, new Request('https://volt.ceo/api/admin/notices?page=999'), 'notices', (item) => item);
  assert.equal(last.pagination.page, 3);
  assert.equal(last.items.length, 3);
  const filtered = await adminList(env.DB, new Request('https://volt.ceo/api/admin/notices?page=1&q=%25_'), 'notices', (item) => item);
  assert.equal(filtered.items.length, 1);
});

test('triggers record changes atomically and do not record rolled-back writes', () => {
  const env = setup();
  env.DB.sqlite.exec("INSERT INTO notices(id,title,content,updated_at) VALUES('test','old','body','v1')");
  env.DB.sqlite.exec("UPDATE notices SET title='new',updated_at='v2' WHERE id='test'");
  const history = env.DB.sqlite.prepare("SELECT * FROM cms_history WHERE item_id='test' ORDER BY id DESC").get();
  assert.equal(JSON.parse(history.before_json).title, 'old');
  assert.equal(JSON.parse(history.after_json).title, 'new');
  const count = env.DB.sqlite.prepare('SELECT COUNT(*) AS total FROM cms_history').get().total;
  env.DB.sqlite.exec("BEGIN; UPDATE notices SET title='rolled back' WHERE id='test'; ROLLBACK;");
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS total FROM cms_history').get().total, count);
});

test('restore saves a new version, rejects stale state and preserves intervening content', async () => {
  const env = setup();
  env.DB.sqlite.exec("INSERT INTO notices(id,title,content,updated_at) VALUES('test','old','body','v1'); UPDATE notices SET title='new',updated_at='v2' WHERE id='test'");
  const history = env.DB.sqlite.prepare("SELECT id FROM cms_history WHERE item_id='test' ORDER BY id DESC").get();
  const body = { collection: 'notices', historyId: history.id, version: 'before', expectedUpdatedAt: 'v2' };
  assert.equal((await restore({ env, request: await request(body) })).status, 200);
  assert.equal(env.DB.sqlite.prepare("SELECT title FROM notices WHERE id='test'").get().title, 'old');
  env.DB.sqlite.exec("UPDATE notices SET title='another admin',updated_at='v3' WHERE id='test'");
  assert.equal((await restore({ env, request: await request(body) })).status, 409);
  assert.equal(env.DB.sqlite.prepare("SELECT title FROM notices WHERE id='test'").get().title, 'another admin');
});

test('deleted gallery can be restored and its historical image is protected', async () => {
  const env = setup();
  env.DB.sqlite.prepare('INSERT INTO gallery_items(id,title,image_url,updated_at) VALUES(?,?,?,?)').run('g1', 'photo', src, 'v1');
  env.DB.sqlite.exec("DELETE FROM gallery_items WHERE id='g1'");
  assert.equal(await deleteUnreferencedUpload(env, key), false);
  const history = env.DB.sqlite.prepare("SELECT id FROM cms_history WHERE item_id='g1' ORDER BY id DESC").get();
  assert.equal((await restore({ env, request: await request({ collection: 'gallery', historyId: history.id, version: 'before', expectedUpdatedAt: null }) })).status, 200);
  assert.equal(env.DB.sqlite.prepare("SELECT image_url FROM gallery_items WHERE id='g1'").get().image_url, src);
  assert.deepEqual(env.GALLERY_BUCKET.deletes, []);
});

test('history migration is repeatable and records baseline snapshots', () => {
  const env = setup();
  const count = env.DB.sqlite.prepare('SELECT COUNT(*) AS total FROM cms_history').get().total;
  assert.ok(count > 0);
  env.DB.sqlite.exec(readFileSync('migrations/0015_cms_history.sql', 'utf8'));
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS total FROM cms_history').get().total, count);
});

test('orphan RSVP cleanup backs up all columns and keeps active participation', async () => {
  const env = setup();
  env.DB.sqlite.exec("INSERT INTO event_rsvps(id,event_id,user_sub,status,created_at,updated_at) VALUES('orphan','gone','u','going','v1','v2'),('active','event-001','u','going','v1','v2')");
  // Use an actual seeded event rather than assuming a seed id.
  const event = env.DB.sqlite.prepare('SELECT id FROM events LIMIT 1').get();
  env.DB.sqlite.prepare("UPDATE event_rsvps SET event_id=? WHERE id='active'").run(event.id);
  const response = await maintain({ env, request: await request({ action: 'cleanup-rsvps' }, 'POST', 'maintenance') });
  assert.equal((await response.json()).deleted, 1);
  assert.equal(env.DB.sqlite.prepare("SELECT status FROM event_rsvps_orphan_backup WHERE id='orphan'").get().status, 'going');
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS total FROM event_rsvps').get().total, 1);
  await maintain({ env, request: await request({ action: 'cleanup-rsvps' }, 'POST', 'maintenance') });
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS total FROM event_rsvps_orphan_backup').get().total, 1);
});

test('storage scan protects history and deletion rechecks newly referenced candidates', async () => {
  const env = setup();
  let response = await scan({ env, request: await request(undefined, 'GET', 'maintenance') });
  assert.equal((await response.json()).candidates.length, 1);
  env.DB.sqlite.prepare('INSERT INTO gallery_items(id,title,image_url,updated_at) VALUES(?,?,?,?)').run('g1', 'photo', src, 'v1');
  response = await maintain({ env, request: await request({ action: 'delete-uploads', keys: [key] }, 'POST', 'maintenance') });
  assert.equal((await response.json()).results[0].deleted, false);
  assert.deepEqual(env.GALLERY_BUCKET.deletes, []);
  assert.equal((await imageSource({ env, request: await request(undefined, 'GET', 'image-source?src=https://attacker.invalid/' + key) })).status, 422);
});

test('orphan cleanup rolls back its backup if deletion fails', async () => {
  const env = setup();
  env.DB.sqlite.exec("INSERT INTO event_rsvps(id,event_id,user_sub,status) VALUES('orphan','gone','u','going'); CREATE TRIGGER block_delete BEFORE DELETE ON event_rsvps BEGIN SELECT RAISE(ABORT,'test deletion failure'); END;");
  await assert.rejects(maintain({ env, request: await request({ action: 'cleanup-rsvps' }, 'POST', 'maintenance') }), /test deletion failure/);
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS total FROM event_rsvps WHERE id='orphan'").get().total, 1);
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS total FROM event_rsvps_orphan_backup WHERE id='orphan'").get().total, 0);
});

test('history API exposes current version and rejects collection injection', async () => {
  const env = setup();
  const response = await historyGet({ env, request: await request(undefined, 'GET', 'history?collection=notices') });
  const data = await response.json();
  assert.ok(data.items.length > 0);
  assert.ok(Object.hasOwn(data.items[0], 'currentUpdatedAt'));
  assert.equal((await historyGet({ env, request: await request(undefined, 'GET', 'history?collection=__proto__') })).status, 422);
});
