import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createSqliteDb } from './sqlite-d1.mjs';
import { TEST_ENV, adminCookie, memberCookie, jsonRequest } from './helpers.mjs';
import { adminDb } from '../../functions/_shared/admin-db.js';
import { requireAdmin } from '../../functions/_shared/auth.js';
import { eventInput, mapLeader } from '../../functions/_shared/cms.js';
import { localizationInput } from '../../functions/_shared/cms-localization.js';
import { onRequest as events } from '../../functions/api/admin/events/index.js';
import { onRequest as eventItem } from '../../functions/api/admin/events/[id].js';
import { onRequestGet as history } from '../../functions/api/admin/history.js';
import { onRequestPost as discordLogin } from '../../functions/api/admin/discord-login.js';

function setup() {
  const DB = createSqliteDb();
  for (const file of readdirSync('migrations').sort()) DB.sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  return { ...TEST_ENV, DB };
}
async function request(body, method = 'POST', path = 'events') {
  return jsonRequest(`https://volt.ceo/api/admin/${path}`, { method, body, cookie: await adminCookie() });
}

test('English survives the CMS save/list/edit contract while Korean and date labels stay intact', async () => {
  const env = setup();
  const response = await events({ env, request: await request({ id: 'en-event', title: '작전', description: '본문', titleEn: 'Mission', descriptionEn: 'English body', dateLabel: '2026.10.05' }) });
  assert.equal(response.status, 201);
  const saved = (await response.json()).item;
  assert.equal(saved.titleEn, 'Mission');
  assert.equal(saved.title_en, 'Mission');
  assert.equal(saved.eventDate, '2026-10-05');
  assert.equal(saved.dateLabel, '2026.10.05');
  const edited = await eventItem({ env, params: { id: saved.id }, request: await request({ title: '수정', description: '본문', expectedUpdatedAt: saved.updatedAt }, 'PUT', `events/${saved.id}`) });
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).item.titleEn, 'Mission');
  const list = await events({ env, request: await request(undefined, 'GET') });
  assert.equal((await list.json()).items.find((item) => item.id === saved.id).descriptionEn, 'English body');
});

test('create, delete and failed transactions attribute history without leaving shared context', async () => {
  const env = setup();
  const created = await events({ env, request: await request({ id: 'actor-event', title: '작전', titleEn: 'Mission' }) });
  const saved = (await created.json()).item;
  await eventItem({ env, params: { id: saved.id }, request: await request({ expectedUpdatedAt: saved.updatedAt }, 'DELETE', `events/${saved.id}`) });
  const list = await history({ env, request: await request(undefined, 'GET', 'history?collection=events&itemId=actor-event') });
  const items = (await list.json()).items;
  assert.deepEqual(items.map((item) => item.action), ['delete', 'create']);
  for (const item of items) assert.deepEqual(JSON.parse(item.actor), { method: 'password', id: null, name: '공통 관리자' });
  const req = await request();
  await requireAdmin(req, env);
  const db = adminDb(req, env);
  await assert.rejects(db.batch([db.prepare("INSERT INTO events(id,title) VALUES('failed','fail')"), db.prepare('INSERT INTO nonexistent VALUES (1)')]), /no such table/);
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM cms_history WHERE item_id='failed'").get().n, 0);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM cms_write_context').get().n, 0);
});

test('parallel writes carry their own verified identity and ignore a client-supplied actor', async () => {
  const env = { ...setup(), ADMIN_DISCORD_ROLES: '["대표이사"]', DISCORD_ROLE_MAP: '{"ceo":"대표이사"}' };
  await Promise.all(['first', 'second'].map(async (id) => {
    const user = await memberCookie({ sub: id, display_name: `관리자 ${id}`, roles: ['ceo'] }, env);
    const login = await discordLogin({ env, request: jsonRequest('https://volt.ceo/api/admin/discord-login', { cookie: user }) });
    const cookie = `${user}; ${login.headers.get('Set-Cookie').split(';')[0]}`;
    const response = await events({ env, request: jsonRequest('https://volt.ceo/api/admin/events', { cookie, body: { id, title: id, actor: 'forged' } }) });
    assert.equal(response.status, 201);
  }));
  const rows = env.DB.sqlite.prepare("SELECT item_id, actor FROM cms_history WHERE item_id IN ('first','second')").all();
  assert.equal(rows.length, 2);
  for (const row of rows) assert.deepEqual(JSON.parse(row.actor), { method: 'discord', id: row.item_id, name: `관리자 ${row.item_id}` });
});

test('published translation backfill skips changed Korean and existing English and is repeatable', () => {
  const env = setup();
  const db = env.DB.sqlite;
  db.prepare('UPDATE notices SET title=?, content=?, updated_at=?, title_en=NULL, content_en=NULL, tag_en=NULL WHERE id=?').run('공식 홈페이지 리뉴얼 오픈', '함대 정체성과 방향성을 명확히 보여주기 위한 공식 홈페이지가 새롭게 개편되었습니다. 임원진 소개, 연혁, 무역허브, 운영정책 등 주요 정보를 확인하실 수 있습니다.', '2026-07-12T02:19:29.323Z', 'ann-006');
  const sql = readFileSync('migrations/0017_published_content_english.sql', 'utf8');
  db.exec(sql);
  assert.equal(db.prepare("SELECT title_en FROM notices WHERE id='ann-006'").get().title_en, 'Official website redesign launched');
  const count = db.prepare('SELECT COUNT(*) AS n FROM cms_history').get().n;
  db.exec(sql);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cms_history').get().n, count);
  db.exec("UPDATE notices SET title='변경된 원문', title_en=NULL, content_en=NULL, tag_en=NULL WHERE id='ann-006'");
  db.exec(sql);
  assert.equal(db.prepare("SELECT title_en FROM notices WHERE id='ann-006'").get().title_en, null);
});

test('leadership English details and competencies map to public fields and validate structured inputs', () => {
  const row = { name: '원문', extras: JSON.stringify({ details: [{ title: '철학', content: '내용' }], competencies: ['역량'] }) };
  row.translations_json = localizationInput('leadership', { nameEn: 'Name', detailsEn: '[{"title":"Philosophy","content":"Body"}]', competenciesEn: '["Skill"]' });
  const item = mapLeader(row);
  assert.equal(item.details[0].content, '내용');
  assert.equal(item.details[0].content_en, 'Body');
  assert.deepEqual(item.competencies_en, ['Skill']);
  assert.throws(() => localizationInput('leadership', { detailsEn: 'invalid' }), /JSON array/);
  assert.throws(() => localizationInput('events', { titleEn: {} }), /Invalid localized/);
});

test('event dates reject impossible or ambiguous structured dates and allow unscheduled labels', () => {
  for (const eventDate of ['2026-02-30', '2026-13-01', '10/05/2026', '2026-10-05T19:00']) assert.throws(() => eventInput({ eventDate }), /date|long/i);
  assert.equal(eventInput({ dateLabel: '미정' }).event_date, null);
  assert.equal(eventInput({ eventDate: '2028-02-29' }).event_date, '2028-02-29');
});
