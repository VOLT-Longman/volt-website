-- 공지 날짜 저장 포맷 단일화(YYYY-MM-DD).
--
-- 문제: 시드 공지 6건은 '2026.05.15'(점), 관리자 UI(<input type="date">)와 cms.js 기본값은
--   '2026-08-02'(대시)를 만들어 두 포맷이 D1에 섞였다. 원문 문자열 정렬은 '.'(0x2E) > '-'(0x2D)라
--   ORDER BY date DESC에서 점 포맷이 무조건 위로 올라가 실제 날짜 순서가 뒤집힌다.
--   영향: 공개 공지 API, VOLT AI "최근 공지" 5건, 랜딩 "최신 공지 3건" 티저.
--   (공지 섹션만 클라이언트가 재정렬해 증상이 가려져 있었다.)
--
-- 처리: 'YYYY.MM.DD' 형태인 행만 대시로 바꾼다. '미정' 같은 자유 텍스트는 건드리지 않는다.
--   표시 계층이 대시→점으로 변환해 렌더하므로 화면 표기는 바뀌지 않는다.
--   코드 쪽은 cms.js noticeInput()이 저장 시점에 같은 규칙으로 정규화한다.
--
-- 멱등: 이미 대시인 행은 GLOB 조건에 걸리지 않아 재실행해도 안전하다.
UPDATE notices
   SET date = replace(date, '.', '-')
 WHERE date GLOB '[0-9][0-9][0-9][0-9].[0-9][0-9].[0-9][0-9]';

-- 자기등록 규약(0009 이후): 이 마이그레이션 id를 기록한다.
INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0012', datetime('now'));
