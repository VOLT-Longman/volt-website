CREATE TABLE IF NOT EXISTS event_rsvps (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_sub TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE(event_id, user_sub)
);

CREATE INDEX IF NOT EXISTS idx_rsvp_event ON event_rsvps (event_id, status);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_sub TEXT PRIMARY KEY,
  favorites_json TEXT,
  planner_json TEXT,
  updated_at TEXT
);
