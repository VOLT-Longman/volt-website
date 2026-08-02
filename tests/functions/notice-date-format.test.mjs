// 공지 날짜 포맷 단일화 계약.
//
// 배경: 시드 공지는 '2026.05.15'(점), 관리자 UI(<input type="date">)와 cms.js 기본값은
// '2026-08-02'(대시)를 만들어 두 포맷이 D1에 섞였다. 원문 문자열 정렬은 '.'(0x2E) > '-'(0x2D)라
// DESC에서 점 포맷이 무조건 위로 올라가 실제 날짜 순서가 뒤집힌다.
//   실측: ['2026.05.15', '2026-08-02', '2026-01-10', '2025.11.24']  ← 5월이 8월보다 위
//
// 계약: 저장 포맷은 YYYY-MM-DD 하나로 고정하고, 읽기 정렬도 포맷에 의존하지 않는다.
// (표시 계층이 대시→점으로 변환해 렌더하므로 화면 표기는 바뀌지 않는다.)

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { noticeInput } from '../../functions/_shared/cms.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test('noticeInput: 점 포맷 입력을 대시로 정규화해 저장한다', () => {
  assert.equal(noticeInput({ title: 't', date: '2026.05.15' }).date, '2026-05-15');
  assert.equal(noticeInput({ title: 't', date: ' 2025.11.24 ' }).date, '2025-11-24');
  // 이미 대시면 그대로
  assert.equal(noticeInput({ title: 't', date: '2026-08-02' }).date, '2026-08-02');
  // 미입력 기본값도 대시
  assert.match(noticeInput({ title: 't' }).date, ISO_DATE);
});

test('noticeInput: 빈 날짜는 미입력으로 보고 기본값(오늘)을 채운다', () => {
  // limitText가 ''를 "값 있음"으로 취급해 기본값을 건너뛰던 결함.
  // 관리자 화면에서 날짜를 지우고 저장하면 빈 날짜가 저장돼 그 공지가 목록 최하단으로 밀렸다.
  for (const blank of ['', '   ', '\t']) {
    assert.match(noticeInput({ title: 't', date: blank }).date, ISO_DATE, `빈 입력 ${JSON.stringify(blank)}`);
  }
  // 기존 동작(미제공)도 그대로
  assert.match(noticeInput({ title: 't' }).date, ISO_DATE);
  assert.match(noticeInput({ title: 't', date: null }).date, ISO_DATE);
});

test('noticeInput: 날짜로 해석 불가능한 값은 임의 변형 없이 보존한다', () => {
  // 사실을 바꾸지 않는다 — 포맷 정규화는 YYYY.MM.DD 형태에만 적용한다.
  assert.equal(noticeInput({ title: 't', date: '미정' }).date, '미정');
  assert.equal(noticeInput({ title: 't', date: '2026년 5월' }).date, '2026년 5월');
});

test('0012가 시드의 점 포맷 공지를 전부 덮는다 (신선한 DB도 최종 상태 동일)', async () => {
  // 0002는 이미 적용된 마이그레이션이라 수정하지 않는다(0009 규약).
  // 신선한 DB는 0002가 점 포맷을 넣은 뒤 0012가 정규화해 같은 최종 상태에 도달해야 한다.
  const seed = await read('migrations/0002_seed_content.sql');
  const dotted = [...new Set((seed.match(/'(\d{4}\.\d{2}\.\d{2})'/g) || []).map((s) => s.slice(1, -1)))];
  assert.ok(dotted.length > 0, '시드에 점 포맷 공지가 있어야 이 계약이 의미가 있다');
  // 0012의 GLOB 패턴과 같은 판정을 적용했을 때 남는 점 포맷이 없어야 한다.
  const uncovered = dotted.filter((d) => !/^\d{4}\.\d{2}\.\d{2}$/.test(d));
  assert.deepEqual(uncovered, [], `0012 패턴이 덮지 못하는 시드 날짜: ${uncovered.join(', ')}`);
});

test('0012 마이그레이션: 기존 행을 정규화하고 자기 id를 기록한다', async () => {
  const sql = await read('migrations/0012_notice_date_format.sql');
  assert.match(sql, /UPDATE\s+notices/i, 'notices 기존 행을 갱신해야');
  assert.match(sql, /replace\(date,\s*'\.',\s*'-'\)/i, '점을 대시로 치환해야');
  assert.match(sql, /INSERT OR IGNORE INTO schema_migrations .*'0012'/s, '자기등록 규약(0009 이후)');
});

test('읽기 정렬: 공개 API와 AI 도구가 포맷에 의존하지 않는다', async () => {
  for (const file of ['functions/api/notices.js', 'functions/_shared/ai-tools.js']) {
    const src = await read(file);
    const orderBy = src.match(/ORDER BY[^'"`]*date[^'"`]*/gi) || [];
    const naive = orderBy.filter((clause) => /\bdate DESC/i.test(clause) && !/replace\(/i.test(clause));
    assert.deepEqual(naive, [], `${file}: 원문 date 정렬 잔존 — ${naive.join(' | ')}`);
  }
});

test('랜딩 티저: 원문 문자열 비교로 정렬하지 않는다', async () => {
  const src = await read('js/landing.js');
  const teaser = src.slice(src.indexOf('function renderNoticeTeaser'), src.indexOf('function renderNoticeTeaser') + 900);
  assert.ok(!/String\(b\.date[^)]*\)\.localeCompare/.test(teaser),
    '랜딩 티저가 date 원문 localeCompare로 정렬하면 포맷 혼재 시 순서가 뒤집힌다');
});
