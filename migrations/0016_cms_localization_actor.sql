-- Apply once after 0015. English content is independent of the Korean source.
CREATE TABLE IF NOT EXISTS cms_write_context (id INTEGER PRIMARY KEY CHECK(id=1), actor TEXT NOT NULL);
ALTER TABLE events ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE gallery_items ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE partner_fleets ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE leadership_members ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE timeline_entries ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}';

DROP TRIGGER IF EXISTS cms_history_notices_create;
CREATE TRIGGER cms_history_notices_create AFTER INSERT ON notices
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('notices', NEW.id, 'create', NULL, json_object('id', NEW.id, 'title', NEW.title, 'content', NEW.content, 'tag', NEW.tag, 'pinned', NEW.pinned, 'published', NEW.published, 'date', NEW.date, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'title_en', NEW.title_en, 'content_en', NEW.content_en, 'tag_en', NEW.tag_en), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_notices_update;
CREATE TRIGGER cms_history_notices_update AFTER UPDATE ON notices
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('notices', NEW.id, 'update', json_object('id', OLD.id, 'title', OLD.title, 'content', OLD.content, 'tag', OLD.tag, 'pinned', OLD.pinned, 'published', OLD.published, 'date', OLD.date, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'title_en', OLD.title_en, 'content_en', OLD.content_en, 'tag_en', OLD.tag_en), json_object('id', NEW.id, 'title', NEW.title, 'content', NEW.content, 'tag', NEW.tag, 'pinned', NEW.pinned, 'published', NEW.published, 'date', NEW.date, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'title_en', NEW.title_en, 'content_en', NEW.content_en, 'tag_en', NEW.tag_en), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_notices_delete;
CREATE TRIGGER cms_history_notices_delete AFTER DELETE ON notices
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('notices', OLD.id, 'delete', json_object('id', OLD.id, 'title', OLD.title, 'content', OLD.content, 'tag', OLD.tag, 'pinned', OLD.pinned, 'published', OLD.published, 'date', OLD.date, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'title_en', OLD.title_en, 'content_en', OLD.content_en, 'tag_en', OLD.tag_en), NULL, COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_events_create;
CREATE TRIGGER cms_history_events_create AFTER INSERT ON events
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('events', NEW.id, 'create', NULL, json_object('id', NEW.id, 'title', NEW.title, 'description', NEW.description, 'type', NEW.type, 'status', NEW.status, 'date_label', NEW.date_label, 'event_date', NEW.event_date, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'translations_json', NEW.translations_json), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_events_update;
CREATE TRIGGER cms_history_events_update AFTER UPDATE ON events
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('events', NEW.id, 'update', json_object('id', OLD.id, 'title', OLD.title, 'description', OLD.description, 'type', OLD.type, 'status', OLD.status, 'date_label', OLD.date_label, 'event_date', OLD.event_date, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'translations_json', OLD.translations_json), json_object('id', NEW.id, 'title', NEW.title, 'description', NEW.description, 'type', NEW.type, 'status', NEW.status, 'date_label', NEW.date_label, 'event_date', NEW.event_date, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'translations_json', NEW.translations_json), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_events_delete;
CREATE TRIGGER cms_history_events_delete AFTER DELETE ON events
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('events', OLD.id, 'delete', json_object('id', OLD.id, 'title', OLD.title, 'description', OLD.description, 'type', OLD.type, 'status', OLD.status, 'date_label', OLD.date_label, 'event_date', OLD.event_date, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'translations_json', OLD.translations_json), NULL, COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_gallery_items_create;
CREATE TRIGGER cms_history_gallery_items_create AFTER INSERT ON gallery_items
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('gallery', NEW.id, 'create', NULL, json_object('id', NEW.id, 'title', NEW.title, 'description', NEW.description, 'category', NEW.category, 'image_url', NEW.image_url, 'thumb_url', NEW.thumb_url, 'date', NEW.date, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'translations_json', NEW.translations_json), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_gallery_items_update;
CREATE TRIGGER cms_history_gallery_items_update AFTER UPDATE ON gallery_items
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('gallery', NEW.id, 'update', json_object('id', OLD.id, 'title', OLD.title, 'description', OLD.description, 'category', OLD.category, 'image_url', OLD.image_url, 'thumb_url', OLD.thumb_url, 'date', OLD.date, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'translations_json', OLD.translations_json), json_object('id', NEW.id, 'title', NEW.title, 'description', NEW.description, 'category', NEW.category, 'image_url', NEW.image_url, 'thumb_url', NEW.thumb_url, 'date', NEW.date, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'translations_json', NEW.translations_json), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_gallery_items_delete;
CREATE TRIGGER cms_history_gallery_items_delete AFTER DELETE ON gallery_items
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('gallery', OLD.id, 'delete', json_object('id', OLD.id, 'title', OLD.title, 'description', OLD.description, 'category', OLD.category, 'image_url', OLD.image_url, 'thumb_url', OLD.thumb_url, 'date', OLD.date, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'translations_json', OLD.translations_json), NULL, COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_partner_fleets_create;
CREATE TRIGGER cms_history_partner_fleets_create AFTER INSERT ON partner_fleets
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('partner-fleets', NEW.id, 'create', NULL, json_object('id', NEW.id, 'name', NEW.name, 'region', NEW.region, 'game', NEW.game, 'focus', NEW.focus, 'description', NEW.description, 'member_count', NEW.member_count, 'discord_url', NEW.discord_url, 'website_url', NEW.website_url, 'logo_url', NEW.logo_url, 'established', NEW.established, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'photo_url', NEW.photo_url, 'translations_json', NEW.translations_json), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_partner_fleets_update;
CREATE TRIGGER cms_history_partner_fleets_update AFTER UPDATE ON partner_fleets
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('partner-fleets', NEW.id, 'update', json_object('id', OLD.id, 'name', OLD.name, 'region', OLD.region, 'game', OLD.game, 'focus', OLD.focus, 'description', OLD.description, 'member_count', OLD.member_count, 'discord_url', OLD.discord_url, 'website_url', OLD.website_url, 'logo_url', OLD.logo_url, 'established', OLD.established, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'photo_url', OLD.photo_url, 'translations_json', OLD.translations_json), json_object('id', NEW.id, 'name', NEW.name, 'region', NEW.region, 'game', NEW.game, 'focus', NEW.focus, 'description', NEW.description, 'member_count', NEW.member_count, 'discord_url', NEW.discord_url, 'website_url', NEW.website_url, 'logo_url', NEW.logo_url, 'established', NEW.established, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'photo_url', NEW.photo_url, 'translations_json', NEW.translations_json), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_partner_fleets_delete;
CREATE TRIGGER cms_history_partner_fleets_delete AFTER DELETE ON partner_fleets
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('partner-fleets', OLD.id, 'delete', json_object('id', OLD.id, 'name', OLD.name, 'region', OLD.region, 'game', OLD.game, 'focus', OLD.focus, 'description', OLD.description, 'member_count', OLD.member_count, 'discord_url', OLD.discord_url, 'website_url', OLD.website_url, 'logo_url', OLD.logo_url, 'established', OLD.established, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'photo_url', OLD.photo_url, 'translations_json', OLD.translations_json), NULL, COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_leadership_members_create;
CREATE TRIGGER cms_history_leadership_members_create AFTER INSERT ON leadership_members
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('leadership', NEW.id, 'create', NULL, json_object('id', NEW.id, 'name', NEW.name, 'role', NEW.role, 'discord', NEW.discord, 'description', NEW.description, 'duties', NEW.duties, 'avatar', NEW.avatar, 'avatar_gradient', NEW.avatar_gradient, 'avatar_style', NEW.avatar_style, 'extras', NEW.extras, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'avatar_url', NEW.avatar_url, 'translations_json', NEW.translations_json), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_leadership_members_update;
CREATE TRIGGER cms_history_leadership_members_update AFTER UPDATE ON leadership_members
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('leadership', NEW.id, 'update', json_object('id', OLD.id, 'name', OLD.name, 'role', OLD.role, 'discord', OLD.discord, 'description', OLD.description, 'duties', OLD.duties, 'avatar', OLD.avatar, 'avatar_gradient', OLD.avatar_gradient, 'avatar_style', OLD.avatar_style, 'extras', OLD.extras, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'avatar_url', OLD.avatar_url, 'translations_json', OLD.translations_json), json_object('id', NEW.id, 'name', NEW.name, 'role', NEW.role, 'discord', NEW.discord, 'description', NEW.description, 'duties', NEW.duties, 'avatar', NEW.avatar, 'avatar_gradient', NEW.avatar_gradient, 'avatar_style', NEW.avatar_style, 'extras', NEW.extras, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'avatar_url', NEW.avatar_url, 'translations_json', NEW.translations_json), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_leadership_members_delete;
CREATE TRIGGER cms_history_leadership_members_delete AFTER DELETE ON leadership_members
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('leadership', OLD.id, 'delete', json_object('id', OLD.id, 'name', OLD.name, 'role', OLD.role, 'discord', OLD.discord, 'description', OLD.description, 'duties', OLD.duties, 'avatar', OLD.avatar, 'avatar_gradient', OLD.avatar_gradient, 'avatar_style', OLD.avatar_style, 'extras', OLD.extras, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'avatar_url', OLD.avatar_url, 'translations_json', OLD.translations_json), NULL, COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_timeline_entries_create;
CREATE TRIGGER cms_history_timeline_entries_create AFTER INSERT ON timeline_entries
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('timeline', NEW.id, 'create', NULL, json_object('id', NEW.id, 'date_label', NEW.date_label, 'title', NEW.title, 'description', NEW.description, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'translations_json', NEW.translations_json), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_timeline_entries_update;
CREATE TRIGGER cms_history_timeline_entries_update AFTER UPDATE ON timeline_entries
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('timeline', NEW.id, 'update', json_object('id', OLD.id, 'date_label', OLD.date_label, 'title', OLD.title, 'description', OLD.description, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'translations_json', OLD.translations_json), json_object('id', NEW.id, 'date_label', NEW.date_label, 'title', NEW.title, 'description', NEW.description, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'translations_json', NEW.translations_json), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_timeline_entries_delete;
CREATE TRIGGER cms_history_timeline_entries_delete AFTER DELETE ON timeline_entries
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('timeline', OLD.id, 'delete', json_object('id', OLD.id, 'date_label', OLD.date_label, 'title', OLD.title, 'description', OLD.description, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'translations_json', OLD.translations_json), NULL, COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_ship_overrides_create;
CREATE TRIGGER cms_history_ship_overrides_create AFTER INSERT ON ship_overrides
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('ships', NEW.ship_id, 'create', NULL, json_object('id', NEW.id, 'ship_id', NEW.ship_id, 'name', NEW.name, 'manufacturer', NEW.manufacturer, 'role', NEW.role, 'focus', NEW.focus, 'size', NEW.size, 'crew', NEW.crew, 'cargo', NEW.cargo, 'price_usd', NEW.price_usd, 'implemented', NEW.implemented, 'planner_eligible', NEW.planner_eligible, 'tags', NEW.tags, 'description', NEW.description, 'updated_at', NEW.updated_at, 'name_ko', NEW.name_ko, 'hidden', NEW.hidden), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_ship_overrides_update;
CREATE TRIGGER cms_history_ship_overrides_update AFTER UPDATE ON ship_overrides
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('ships', NEW.ship_id, 'update', json_object('id', OLD.id, 'ship_id', OLD.ship_id, 'name', OLD.name, 'manufacturer', OLD.manufacturer, 'role', OLD.role, 'focus', OLD.focus, 'size', OLD.size, 'crew', OLD.crew, 'cargo', OLD.cargo, 'price_usd', OLD.price_usd, 'implemented', OLD.implemented, 'planner_eligible', OLD.planner_eligible, 'tags', OLD.tags, 'description', OLD.description, 'updated_at', OLD.updated_at, 'name_ko', OLD.name_ko, 'hidden', OLD.hidden), json_object('id', NEW.id, 'ship_id', NEW.ship_id, 'name', NEW.name, 'manufacturer', NEW.manufacturer, 'role', NEW.role, 'focus', NEW.focus, 'size', NEW.size, 'crew', NEW.crew, 'cargo', NEW.cargo, 'price_usd', NEW.price_usd, 'implemented', NEW.implemented, 'planner_eligible', NEW.planner_eligible, 'tags', NEW.tags, 'description', NEW.description, 'updated_at', NEW.updated_at, 'name_ko', NEW.name_ko, 'hidden', NEW.hidden), COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

DROP TRIGGER IF EXISTS cms_history_ship_overrides_delete;
CREATE TRIGGER cms_history_ship_overrides_delete AFTER DELETE ON ship_overrides
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json,actor)
 VALUES ('ships', OLD.ship_id, 'delete', json_object('id', OLD.id, 'ship_id', OLD.ship_id, 'name', OLD.name, 'manufacturer', OLD.manufacturer, 'role', OLD.role, 'focus', OLD.focus, 'size', OLD.size, 'crew', OLD.crew, 'cargo', OLD.cargo, 'price_usd', OLD.price_usd, 'implemented', OLD.implemented, 'planner_eligible', OLD.planner_eligible, 'tags', OLD.tags, 'description', OLD.description, 'updated_at', OLD.updated_at, 'name_ko', OLD.name_ko, 'hidden', OLD.hidden), NULL, COALESCE((SELECT actor FROM cms_write_context WHERE id=1),'unattributed'));
END;

-- Repair only unambiguous valid dates; preserve labels, times and RSVP records.
UPDATE events SET event_date=replace(date_label,'.','-'), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE (event_date IS NULL OR event_date='') AND length(date_label)=10
 AND replace(date_label,'.','-') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
 AND date(replace(date_label,'.','-'),'+0 days')=replace(date_label,'.','-');
INSERT OR IGNORE INTO schema_migrations(id,applied_at) VALUES ('0016',datetime('now'));
