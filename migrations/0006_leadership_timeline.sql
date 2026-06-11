-- 임원진 / 연혁 CMS 컬렉션
-- extras: 상세 항목(details)·핵심 역량(competencies) 등 구조화 데이터 JSON (관리자 UI 미노출, 개발자 관리)

CREATE TABLE IF NOT EXISTS leadership_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  discord TEXT,
  description TEXT,
  duties TEXT,
  avatar TEXT,
  avatar_gradient TEXT,
  avatar_style TEXT,
  extras TEXT,
  sort_order INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_leadership_public ON leadership_members (published, sort_order);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id TEXT PRIMARY KEY,
  date_label TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_timeline_public ON timeline_entries (published, sort_order);

INSERT OR IGNORE INTO leadership_members (id, name, role, discord, description, duties, avatar, avatar_gradient, avatar_style, extras, sort_order, published, created_at, updated_at) VALUES
('ceo', '롱만', 'CEO · 대표이사 · 함대 사령관', '@haru801314', 'VOLT의 모든 운영을 총괄하며, 함대의 전략적 방향성과 조직 구조를 설계합니다. 체계적 사고와 구조화 역량을 바탕으로 함대를 기업형 운영 시스템으로 발전시키는 데 핵심적인 역할을 수행합니다.', '', 'L', '', 'ceo', '{"details":[{"title":"리더십 철학","content":"강압적인 접근보다 구조적 리더십을 선호합니다. \"자율적으로 참여하되, 기준은 명확하다\"는 원칙을 통해 구성원들이 예측 가능한 규칙 내에서 안정적으로 협업할 수 있는 시스템을 강조합니다."},{"title":"VOLT 기여","content":"전투, 물류, 전략, 정보, 커뮤니티 영역을 하나의 통합 구조로 설계. 문서화, 절차, 역할 분담 구조를 직접 구축하여 VOLT를 한국에서 가장 체계화된 함대 중 하나로 성장시켰습니다."}],"competencies":["조직 구조 설계 및 체계화","데이터 기반 전략 수립","장기 비전 수립 및 지속가능성 관리","대규모 협력 콘텐츠 기획 및 실행"]}', 1, 1, datetime('now'), datetime('now')),
('coo', '가스펠', 'COO · 운영총괄이사', '@gospel0927', '조직 운영 표준을 수립하고 전체 운영 구조를 관리하며, 인력 배치, 관리, 평가를 포함한 인사 시스템을 감독합니다.', '운영 시스템 개선 및 표준 수립 · 인사 관리 및 종합 역할 시스템 정리 · 내부 운영 표준화 및 안정적인 운영 환경 구축', 'G', 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', '', NULL, 2, 1, datetime('now'), datetime('now')),
('cio', '탄소', 'CIO · 최고정보책임자', '@carbon_tanso', '함대의 운송 자원을 감독하고, 물자와 자원 흐름을 분석하며, 게임 내 핵심 정보를 수집하고 분류합니다.', '함대 운송 관련 지원 및 운영 시스템 연구 · 무역 루트 최적화 및 위험 분석 · 신규 콘텐츠 및 시스템 정보 브리핑', 'T', 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', '', NULL, 3, 1, datetime('now'), datetime('now')),
('cso', '리퍼', 'CSO · 최고전략책임자', '@reapers9999', '전략적 고가 운송 보호 시스템을 감독하고, 함선 무장 구성을 연구 및 표준화하며, 인적 자원 및 전투 부문 지원을 관리합니다.', '함대 전략 자원 배분 및 자산 관리 · 상황별 함선 무장 및 역할 최적화 · 전략적 전투 지원 및 임무 브리핑', 'R', 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', '', NULL, 4, 1, datetime('now'), datetime('now')),
('hr', '아마그란데', '인사·재무 이사', '@amagrande', '함대원 모집 및 관리, 인사 시스템과 함대 재무 운영을 총괄합니다. VOLT AI 봇 개발을 통해 함대원의 게임 정보 활용을 지원하고 있습니다.', '신규 함대원 모집 및 온보딩 · 함대 재무 관리 및 자산 운영 · VOLT AI 시스템 개발 및 운영 · 함대원 데이터베이스 관리', 'A', 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)', '', NULL, 5, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO timeline_entries (id, date_label, title, description, sort_order, published, created_at, updated_at) VALUES
('tl-001', '2953.06.18', 'VOLT 함대 창설', '한국 커뮤니티 기반 Star Citizen 물류·무역 함대 출범.', 1, 1, datetime('now'), datetime('now')),
('tl-002', '2955.02', '운영 체계 정비', '부서 운영 체계를 정비하고 부서별 정기 활동 도입. 분기별 이벤트 시스템 구축.', 2, 1, datetime('now'), datetime('now')),
('tl-003', '2955.02', '전략자원부 신설 · 전리품 장터 개설', '기존 보안부서를 전략자원부로 개편. 함대 내부 경제 시스템인 전리품 장터 운영 시작.', 3, 1, datetime('now'), datetime('now')),
('tl-004', '2955.04', '디스코드 시스템 전면 개편 · 홍보부 신설', '카테고리 및 채널 구조 전면 개편, 역할 체계 재정비. 스트리머 중심의 홍보부 신설.', 4, 1, datetime('now'), datetime('now')),
('tl-005', '2955.06', '디스코드 서버 부스터 레벨 3 달성', '함대원들의 적극적인 참여로 서버 기능 확장.', 5, 1, datetime('now'), datetime('now')),
('tl-006', '2955.08', 'Lazarus Complex 레이드', '하반기 첫 공식 단체 작전. Pyro 시스템 기반 중형 협동 콘텐츠 진행.', 6, 1, datetime('now'), datetime('now')),
('tl-007', '2955.11', 'VOLT-무역허브 공식 개설', '통합 교역 시스템 구축. 인게임 아이템 거래 및 단기 임무 모집을 지원하는 전용 플랫폼.', 7, 1, datetime('now'), datetime('now')),
('tl-008', '2956.01', 'VOLT AI 봇 도입', 'Google Gemini 기반 함선 정보 AI 시스템 오픈. 함대원 전용 정보 분석 도구.', 8, 1, datetime('now'), datetime('now')),
('tl-009', '2956.02', 'VOLT × MJO 합동 교류 작전', '외부 함대와의 친선 협력 강화. 향후 정기 연합 작전의 기반 마련.', 9, 1, datetime('now'), datetime('now')),
('tl-010', '2956.05', '함대 홈페이지 리뉴얼', '함대 정체성과 방향성을 명확히 보여주기 위한 공식 홈페이지 개편.', 10, 1, datetime('now'), datetime('now'));
