-- D-6: event_rsvps.user_sub 단독 조회(내 RSVP 목록, functions/api/me/rsvps.js)에
-- 쓸 인덱스가 없었다. 기존 idx_rsvp_event(event_id, status)는 event_id가 선두 컬럼이라
-- user_sub만으로 하는 조회에는 쓰이지 않아 전체 스캔이 발생한다.
CREATE INDEX IF NOT EXISTS idx_rsvp_user ON event_rsvps (user_sub);

-- 자기등록 규약(0009 이후): 이 마이그레이션 id를 기록한다.
INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0011', datetime('now'));
