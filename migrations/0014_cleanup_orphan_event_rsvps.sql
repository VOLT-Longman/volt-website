-- Events deleted before the CMS cleanup fix could leave RSVPs behind. Remove
-- only rows whose event no longer exists; active event participation is kept.
DELETE FROM event_rsvps
WHERE NOT EXISTS (SELECT 1 FROM events WHERE events.id = event_rsvps.event_id);

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0014', datetime('now'));
