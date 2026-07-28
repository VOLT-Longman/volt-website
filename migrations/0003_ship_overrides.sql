CREATE TABLE IF NOT EXISTS ship_overrides (
  id TEXT PRIMARY KEY,
  ship_id TEXT NOT NULL UNIQUE,
  name TEXT,
  manufacturer TEXT,
  role TEXT,
  focus TEXT,
  size TEXT,
  crew TEXT,
  cargo TEXT,
  price_usd INTEGER,
  implemented INTEGER,
  planner_eligible INTEGER,
  tags TEXT,
  description TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ship_overrides_ship_id ON ship_overrides (ship_id);
