-- Events deleted before the CMS cleanup fix could leave RSVPs behind. Remove
-- only rows whose event no longer exists; active event participation is kept.
CREATE TABLE IF NOT EXISTS event_rsvps_orphan_backup AS
SELECT *, strftime('%Y-%m-%dT%H:%M:%fZ','now') AS backed_up_at FROM event_rsvps WHERE 0;

INSERT INTO event_rsvps_orphan_backup
SELECT *, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM event_rsvps
WHERE NOT EXISTS (SELECT 1 FROM events WHERE events.id = event_rsvps.event_id)
AND NOT EXISTS (SELECT 1 FROM event_rsvps_orphan_backup b WHERE b.id = event_rsvps.id);

DELETE FROM event_rsvps
WHERE NOT EXISTS (SELECT 1 FROM events WHERE events.id = event_rsvps.event_id);

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0014', datetime('now'));
