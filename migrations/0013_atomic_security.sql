-- Atomic admission and server-side Discord membership sessions. Idempotent.
CREATE TABLE IF NOT EXISTS security_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS security_ai_usage (id INTEGER PRIMARY KEY CHECK (id = 1), day TEXT NOT NULL, month TEXT NOT NULL, day_count INTEGER NOT NULL, day_cost INTEGER NOT NULL, month_cost INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS security_sessions (id TEXT PRIMARY KEY, user_sub TEXT NOT NULL, token TEXT NOT NULL, role_ids TEXT NOT NULL, checked_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0013', datetime('now'));
