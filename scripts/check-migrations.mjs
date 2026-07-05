#!/usr/bin/env node
/**
 * D1 마이그레이션 규약 검사 (라이브 DB 없이 로컬에서 검증).
 *
 * 검사 항목:
 *   1) 파일명 규약: `NNNN_*.sql` (4자리), 0001부터 빈 번호 없이 연속.
 *   2) 추적 테이블 존재: 0009가 schema_migrations를 만들고 0001~0009를 백필.
 *   3) 자기등록 규약: 0009 이후(>= 0009)의 모든 마이그레이션은 SQL 안에서
 *      자신의 id를 schema_migrations에 기록해야 한다.
 *
 * 위반 시 exit 1. `npm run check`에 물려 CI 게이트로 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'migrations');
const TRACKING_START = 9; // 0009부터 자기등록 규약 적용

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const problems = [];

const ids = [];
for (const file of files) {
  const match = /^(\d{4})_[\w-]+\.sql$/.exec(file);
  if (!match) {
    problems.push(`파일명 규약 위반: ${file} (형식: NNNN_이름.sql)`);
    continue;
  }
  ids.push({ num: Number(match[1]), id: match[1], file });
}

// 1) 연속성(1..N, 중복/누락 없음)
ids.sort((a, b) => a.num - b.num);
ids.forEach((entry, index) => {
  const expected = index + 1;
  if (entry.num !== expected) {
    problems.push(`마이그레이션 번호 불연속: ${entry.file} (기대 ${String(expected).padStart(4, '0')})`);
  }
});

function readSql(id) {
  const entry = ids.find((e) => e.id === id);
  return entry ? fs.readFileSync(path.join(dir, entry.file), 'utf8') : '';
}

// 2) 추적 테이블 + 백필 (0009)
const tracking = ids.find((e) => e.num === TRACKING_START);
if (!tracking) {
  problems.push(`추적 테이블 마이그레이션(0009_*.sql)이 없습니다.`);
} else {
  const sql = readSql('0009');
  if (!/CREATE TABLE IF NOT EXISTS\s+schema_migrations/i.test(sql)) {
    problems.push(`0009는 schema_migrations 테이블을 CREATE TABLE IF NOT EXISTS로 만들어야 합니다.`);
  }
  // 0001~0009 백필 확인
  for (const entry of ids.filter((e) => e.num <= TRACKING_START)) {
    if (!new RegExp(`'${entry.id}'`).test(sql)) {
      problems.push(`0009 백필 누락: '${entry.id}'가 schema_migrations INSERT에 없습니다.`);
    }
  }
}

// 3) 자기등록 규약 (>= 0009)
for (const entry of ids.filter((e) => e.num >= TRACKING_START)) {
  const sql = readSql(entry.id);
  const registersSelf = /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+schema_migrations/i.test(sql)
    && new RegExp(`'${entry.id}'`).test(sql);
  if (!registersSelf) {
    problems.push(`${entry.file}: 자신의 id('${entry.id}')를 schema_migrations에 기록해야 합니다(자기등록 규약).`);
  }
}

if (problems.length > 0) {
  console.error('마이그레이션 규약 위반:');
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}

console.log(`OK: 마이그레이션 ${ids.length}개 규약 검증 통과 (추적 테이블 + 자기등록 규약)`);
