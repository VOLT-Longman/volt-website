CREATE TABLE IF NOT EXISTS partner_fleets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT,
  game TEXT,
  focus TEXT,
  description TEXT,
  member_count INTEGER,
  discord_url TEXT,
  website_url TEXT,
  logo_url TEXT,
  established TEXT,
  sort_order INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_partner_fleets_public ON partner_fleets (published, sort_order);

INSERT OR IGNORE INTO partner_fleets (id, name, region, game, focus, description, member_count, discord_url, website_url, logo_url, established, sort_order, published, created_at, updated_at) VALUES
('mjo', 'MJO', '한국', 'Star Citizen', '합동 작전', 'VOLT와 합동 작전 및 교류를 진행하는 협력 함대입니다.', NULL, '', '', '', '', 1, 1, datetime('now'), datetime('now'));
