import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteDb } from './sqlite-d1.mjs';
import { toolUpcomingEvents, toolRecentNotices } from '../../functions/_shared/ai-tools.js';

function calendarDb(t) {
  const DB = createSqliteDb();
  t.after(() => DB.sqlite.close());
  DB.sqlite.exec(`CREATE TABLE events (title TEXT, date_label TEXT, event_date TEXT, status TEXT, translations_json TEXT, published INTEGER);
    CREATE TABLE notices (title TEXT, title_en TEXT, date TEXT, tag TEXT, tag_en TEXT, published INTEGER, pinned INTEGER);`);
  return DB;
}

test('Upcoming events follow Seoul midnight, including month and year boundaries', async (t) => {
  const DB = calendarDb(t);
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-17T14:59:59Z') });
  const insert = DB.sqlite.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, 1)');
  for (const date of ['2026-10-17', '2026-10-18', '2026-12-31', '2027-01-01']) {
    insert.run(date, '', date, '예정', '{}');
  }
  assert.equal((await toolUpcomingEvents({ DB })).data.events[0].title, '2026-10-17');
  t.mock.timers.setTime(Date.parse('2026-10-17T15:00:00Z'));
  assert.equal((await toolUpcomingEvents({ DB })).data.events[0].title, '2026-10-18');
  t.mock.timers.setTime(Date.parse('2026-12-31T15:00:00Z'));
  const result = await toolUpcomingEvents({ DB });
  assert.deepEqual(result.data.events.map((e) => e.title), ['2027-01-01']);
  assert.equal(result.freshness.at, '2026-12-31T15:00:00.000Z');
});

test('Cancelled, completed, past and unpublished rows cannot crowd active upcoming events out of the SQL limit', async (t) => {
  const DB = calendarDb(t);
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-17T15:30:00Z') });
  const insert = DB.sqlite.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 25; i++) {
    for (const status of ['취소', '완료', ' CANCELLED ', 'Canceled', 'Completed']) {
      insert.run('excluded', '', '2026-10-18', status, '{}', 1);
    }
    insert.run('past', '', '2026-10-17', '예정', '{}', 1);
    insert.run('private', '', '2026-10-18', '예정', '{}', 0);
  }
  insert.run('far', '', '2026-10-25', '예정', '{}', 1);
  insert.run('today', '', '2026-10-18', '예정', '{}', 1);
  insert.run('undated', '날짜 미정', '', '계획', '{}', 1);
  const result = await toolUpcomingEvents({ DB });
  assert.equal(result.data.status, 'ok');
  assert.deepEqual(result.data.events.map((e) => e.title), ['today', 'far', 'undated']);
});

test('Recent notices prefer saved English tags and preserve Korean fallback and visibility', async (t) => {
  const DB = calendarDb(t);
  const insert = DB.sqlite.prepare('INSERT INTO notices VALUES (?, ?, ?, ?, ?, ?, 0)');
  insert.run('번역 공지', 'Translated notice', '2026-10-18', '시스템', 'System', 1);
  insert.run('원문 공지', '', '2026-10-17', '공지', '', 1);
  insert.run('비공개', 'Private', '2026-10-19', '시스템', 'System', 0);
  const english = (await toolRecentNotices({ DB }, 'en')).data.notices;
  assert.deepEqual(english.map((n) => [n.title, n.tag]), [['Translated notice', 'System'], ['원문 공지', '공지']]);
  const korean = (await toolRecentNotices({ DB }, 'ko')).data.notices;
  assert.deepEqual(korean.map((n) => [n.title, n.tag]), [['번역 공지', '시스템'], ['원문 공지', '공지']]);
});
