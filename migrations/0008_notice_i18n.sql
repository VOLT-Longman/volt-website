-- P1-3: 공지 다국어(EN) 필드.
-- 기존 KO 컬럼(title/content/tag)과 데이터는 그대로 유지한다.
-- 새 컬럼은 nullable, backfill/자동 번역 없음(관리자가 직접 입력).
ALTER TABLE notices ADD COLUMN title_en TEXT;
ALTER TABLE notices ADD COLUMN content_en TEXT;
ALTER TABLE notices ADD COLUMN tag_en TEXT;
