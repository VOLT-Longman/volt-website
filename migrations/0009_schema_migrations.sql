-- P3-3: 마이그레이션 적용 상태 추적 테이블.
--
-- 목적: 어떤 마이그레이션까지 적용됐는지 D1 안에서 직접 추적한다.
--   0007/0008처럼 ALTER ADD COLUMN(재실행 시 실패)인 파일을 실수로 다시 실행하는 사고를
--   막고, "마지막 적용 = 000N"을 대시보드에서 조회할 수 있게 한다.
--
-- 규약: 이 파일(0009) 이후의 모든 마이그레이션은 SQL 끝에 자신의 id를 기록한다.
--   예)  INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0010', datetime('now'));
--   (scripts/check-migrations.mjs가 이 규약을 CI에서 강제한다.)
--
-- 이 파일 자체는 멱등하다(CREATE IF NOT EXISTS + INSERT OR IGNORE). 재실행해도 안전하다.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- 0009를 적용하는 시점엔 0001~0008이 이미 적용돼 있으므로 백필한다.
-- (기존 마이그레이션 파일은 수정하지 않는다 — 상태만 여기서 기록.)
INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES
  ('0001', datetime('now')),
  ('0002', datetime('now')),
  ('0003', datetime('now')),
  ('0004', datetime('now')),
  ('0005', datetime('now')),
  ('0006', datetime('now')),
  ('0007', datetime('now')),
  ('0008', datetime('now')),
  ('0009', datetime('now'));
