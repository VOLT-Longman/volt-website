-- 로그아웃한 관리자 세션 쿠키의 폐기 목록. Idempotent.
-- 쿠키는 서명만으로 검증되므로, 로그아웃 후 재사용을 막으려면 서버 기록이 필요하다.
CREATE TABLE IF NOT EXISTS security_revoked_sessions (signature TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0018', datetime('now'));
