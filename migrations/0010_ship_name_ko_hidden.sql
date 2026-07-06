-- 함선 CMS 확장: 한글 함선명 오버라이드 + 사이트 숨김(삭제) 플래그.
-- name(영문명)/name_ko(한글명)은 nullable — 비우면 기존 정적 표기(volt-data + localization)로 폴백.
-- hidden=1이면 공개 사이트 목록에서 제외(정적 함선의 소프트 삭제/큐레이션).
ALTER TABLE ship_overrides ADD COLUMN name_ko TEXT;
ALTER TABLE ship_overrides ADD COLUMN hidden INTEGER;

-- 자기등록 규약(0009 이후): 이 마이그레이션 id를 기록한다.
INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0010', datetime('now'));
