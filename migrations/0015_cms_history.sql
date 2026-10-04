-- Transactional CMS snapshots. Apply after 0014; history starts when applied.
CREATE TABLE IF NOT EXISTS cms_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT, collection TEXT NOT NULL, item_id TEXT NOT NULL,
 action TEXT NOT NULL, before_json TEXT, after_json TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 actor TEXT NOT NULL DEFAULT 'unattributed'
);
CREATE INDEX IF NOT EXISTS idx_cms_history_item ON cms_history(collection, item_id, id DESC);

CREATE TRIGGER IF NOT EXISTS cms_history_notices_create AFTER INSERT ON notices
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('notices', NEW.id, 'create', NULL, json_object('id', NEW.id, 'title', NEW.title, 'content', NEW.content, 'tag', NEW.tag, 'pinned', NEW.pinned, 'published', NEW.published, 'date', NEW.date, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'title_en', NEW.title_en, 'content_en', NEW.content_en, 'tag_en', NEW.tag_en));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_notices_update AFTER UPDATE ON notices
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('notices', NEW.id, 'update', json_object('id', OLD.id, 'title', OLD.title, 'content', OLD.content, 'tag', OLD.tag, 'pinned', OLD.pinned, 'published', OLD.published, 'date', OLD.date, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'title_en', OLD.title_en, 'content_en', OLD.content_en, 'tag_en', OLD.tag_en), json_object('id', NEW.id, 'title', NEW.title, 'content', NEW.content, 'tag', NEW.tag, 'pinned', NEW.pinned, 'published', NEW.published, 'date', NEW.date, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'title_en', NEW.title_en, 'content_en', NEW.content_en, 'tag_en', NEW.tag_en));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_notices_delete AFTER DELETE ON notices
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('notices', OLD.id, 'delete', json_object('id', OLD.id, 'title', OLD.title, 'content', OLD.content, 'tag', OLD.tag, 'pinned', OLD.pinned, 'published', OLD.published, 'date', OLD.date, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'title_en', OLD.title_en, 'content_en', OLD.content_en, 'tag_en', OLD.tag_en), NULL);
END;

INSERT INTO cms_history(collection,item_id,action,after_json) SELECT 'notices', id, 'baseline', json_object('id', notices.id, 'title', notices.title, 'content', notices.content, 'tag', notices.tag, 'pinned', notices.pinned, 'published', notices.published, 'date', notices.date, 'created_at', notices.created_at, 'updated_at', notices.updated_at, 'title_en', notices.title_en, 'content_en', notices.content_en, 'tag_en', notices.tag_en) FROM notices WHERE NOT EXISTS(SELECT 1 FROM cms_history WHERE collection='notices' AND item_id=notices.id);

CREATE TRIGGER IF NOT EXISTS cms_history_events_create AFTER INSERT ON events
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('events', NEW.id, 'create', NULL, json_object('id', NEW.id, 'title', NEW.title, 'description', NEW.description, 'type', NEW.type, 'status', NEW.status, 'date_label', NEW.date_label, 'event_date', NEW.event_date, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_events_update AFTER UPDATE ON events
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('events', NEW.id, 'update', json_object('id', OLD.id, 'title', OLD.title, 'description', OLD.description, 'type', OLD.type, 'status', OLD.status, 'date_label', OLD.date_label, 'event_date', OLD.event_date, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at), json_object('id', NEW.id, 'title', NEW.title, 'description', NEW.description, 'type', NEW.type, 'status', NEW.status, 'date_label', NEW.date_label, 'event_date', NEW.event_date, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_events_delete AFTER DELETE ON events
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('events', OLD.id, 'delete', json_object('id', OLD.id, 'title', OLD.title, 'description', OLD.description, 'type', OLD.type, 'status', OLD.status, 'date_label', OLD.date_label, 'event_date', OLD.event_date, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at), NULL);
END;

INSERT INTO cms_history(collection,item_id,action,after_json) SELECT 'events', id, 'baseline', json_object('id', events.id, 'title', events.title, 'description', events.description, 'type', events.type, 'status', events.status, 'date_label', events.date_label, 'event_date', events.event_date, 'published', events.published, 'created_at', events.created_at, 'updated_at', events.updated_at) FROM events WHERE NOT EXISTS(SELECT 1 FROM cms_history WHERE collection='events' AND item_id=events.id);

CREATE TRIGGER IF NOT EXISTS cms_history_gallery_items_create AFTER INSERT ON gallery_items
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('gallery', NEW.id, 'create', NULL, json_object('id', NEW.id, 'title', NEW.title, 'description', NEW.description, 'category', NEW.category, 'image_url', NEW.image_url, 'thumb_url', NEW.thumb_url, 'date', NEW.date, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_gallery_items_update AFTER UPDATE ON gallery_items
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('gallery', NEW.id, 'update', json_object('id', OLD.id, 'title', OLD.title, 'description', OLD.description, 'category', OLD.category, 'image_url', OLD.image_url, 'thumb_url', OLD.thumb_url, 'date', OLD.date, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at), json_object('id', NEW.id, 'title', NEW.title, 'description', NEW.description, 'category', NEW.category, 'image_url', NEW.image_url, 'thumb_url', NEW.thumb_url, 'date', NEW.date, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_gallery_items_delete AFTER DELETE ON gallery_items
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('gallery', OLD.id, 'delete', json_object('id', OLD.id, 'title', OLD.title, 'description', OLD.description, 'category', OLD.category, 'image_url', OLD.image_url, 'thumb_url', OLD.thumb_url, 'date', OLD.date, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at), NULL);
END;

INSERT INTO cms_history(collection,item_id,action,after_json) SELECT 'gallery', id, 'baseline', json_object('id', gallery_items.id, 'title', gallery_items.title, 'description', gallery_items.description, 'category', gallery_items.category, 'image_url', gallery_items.image_url, 'thumb_url', gallery_items.thumb_url, 'date', gallery_items.date, 'sort_order', gallery_items.sort_order, 'published', gallery_items.published, 'created_at', gallery_items.created_at, 'updated_at', gallery_items.updated_at) FROM gallery_items WHERE NOT EXISTS(SELECT 1 FROM cms_history WHERE collection='gallery' AND item_id=gallery_items.id);

CREATE TRIGGER IF NOT EXISTS cms_history_partner_fleets_create AFTER INSERT ON partner_fleets
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('partner-fleets', NEW.id, 'create', NULL, json_object('id', NEW.id, 'name', NEW.name, 'region', NEW.region, 'game', NEW.game, 'focus', NEW.focus, 'description', NEW.description, 'member_count', NEW.member_count, 'discord_url', NEW.discord_url, 'website_url', NEW.website_url, 'logo_url', NEW.logo_url, 'established', NEW.established, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'photo_url', NEW.photo_url));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_partner_fleets_update AFTER UPDATE ON partner_fleets
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('partner-fleets', NEW.id, 'update', json_object('id', OLD.id, 'name', OLD.name, 'region', OLD.region, 'game', OLD.game, 'focus', OLD.focus, 'description', OLD.description, 'member_count', OLD.member_count, 'discord_url', OLD.discord_url, 'website_url', OLD.website_url, 'logo_url', OLD.logo_url, 'established', OLD.established, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'photo_url', OLD.photo_url), json_object('id', NEW.id, 'name', NEW.name, 'region', NEW.region, 'game', NEW.game, 'focus', NEW.focus, 'description', NEW.description, 'member_count', NEW.member_count, 'discord_url', NEW.discord_url, 'website_url', NEW.website_url, 'logo_url', NEW.logo_url, 'established', NEW.established, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'photo_url', NEW.photo_url));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_partner_fleets_delete AFTER DELETE ON partner_fleets
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('partner-fleets', OLD.id, 'delete', json_object('id', OLD.id, 'name', OLD.name, 'region', OLD.region, 'game', OLD.game, 'focus', OLD.focus, 'description', OLD.description, 'member_count', OLD.member_count, 'discord_url', OLD.discord_url, 'website_url', OLD.website_url, 'logo_url', OLD.logo_url, 'established', OLD.established, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'photo_url', OLD.photo_url), NULL);
END;

INSERT INTO cms_history(collection,item_id,action,after_json) SELECT 'partner-fleets', id, 'baseline', json_object('id', partner_fleets.id, 'name', partner_fleets.name, 'region', partner_fleets.region, 'game', partner_fleets.game, 'focus', partner_fleets.focus, 'description', partner_fleets.description, 'member_count', partner_fleets.member_count, 'discord_url', partner_fleets.discord_url, 'website_url', partner_fleets.website_url, 'logo_url', partner_fleets.logo_url, 'established', partner_fleets.established, 'sort_order', partner_fleets.sort_order, 'published', partner_fleets.published, 'created_at', partner_fleets.created_at, 'updated_at', partner_fleets.updated_at, 'photo_url', partner_fleets.photo_url) FROM partner_fleets WHERE NOT EXISTS(SELECT 1 FROM cms_history WHERE collection='partner-fleets' AND item_id=partner_fleets.id);

CREATE TRIGGER IF NOT EXISTS cms_history_leadership_members_create AFTER INSERT ON leadership_members
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('leadership', NEW.id, 'create', NULL, json_object('id', NEW.id, 'name', NEW.name, 'role', NEW.role, 'discord', NEW.discord, 'description', NEW.description, 'duties', NEW.duties, 'avatar', NEW.avatar, 'avatar_gradient', NEW.avatar_gradient, 'avatar_style', NEW.avatar_style, 'extras', NEW.extras, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'avatar_url', NEW.avatar_url));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_leadership_members_update AFTER UPDATE ON leadership_members
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('leadership', NEW.id, 'update', json_object('id', OLD.id, 'name', OLD.name, 'role', OLD.role, 'discord', OLD.discord, 'description', OLD.description, 'duties', OLD.duties, 'avatar', OLD.avatar, 'avatar_gradient', OLD.avatar_gradient, 'avatar_style', OLD.avatar_style, 'extras', OLD.extras, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'avatar_url', OLD.avatar_url), json_object('id', NEW.id, 'name', NEW.name, 'role', NEW.role, 'discord', NEW.discord, 'description', NEW.description, 'duties', NEW.duties, 'avatar', NEW.avatar, 'avatar_gradient', NEW.avatar_gradient, 'avatar_style', NEW.avatar_style, 'extras', NEW.extras, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'avatar_url', NEW.avatar_url));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_leadership_members_delete AFTER DELETE ON leadership_members
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('leadership', OLD.id, 'delete', json_object('id', OLD.id, 'name', OLD.name, 'role', OLD.role, 'discord', OLD.discord, 'description', OLD.description, 'duties', OLD.duties, 'avatar', OLD.avatar, 'avatar_gradient', OLD.avatar_gradient, 'avatar_style', OLD.avatar_style, 'extras', OLD.extras, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'avatar_url', OLD.avatar_url), NULL);
END;

INSERT INTO cms_history(collection,item_id,action,after_json) SELECT 'leadership', id, 'baseline', json_object('id', leadership_members.id, 'name', leadership_members.name, 'role', leadership_members.role, 'discord', leadership_members.discord, 'description', leadership_members.description, 'duties', leadership_members.duties, 'avatar', leadership_members.avatar, 'avatar_gradient', leadership_members.avatar_gradient, 'avatar_style', leadership_members.avatar_style, 'extras', leadership_members.extras, 'sort_order', leadership_members.sort_order, 'published', leadership_members.published, 'created_at', leadership_members.created_at, 'updated_at', leadership_members.updated_at, 'avatar_url', leadership_members.avatar_url) FROM leadership_members WHERE NOT EXISTS(SELECT 1 FROM cms_history WHERE collection='leadership' AND item_id=leadership_members.id);

CREATE TRIGGER IF NOT EXISTS cms_history_timeline_entries_create AFTER INSERT ON timeline_entries
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('timeline', NEW.id, 'create', NULL, json_object('id', NEW.id, 'date_label', NEW.date_label, 'title', NEW.title, 'description', NEW.description, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_timeline_entries_update AFTER UPDATE ON timeline_entries
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('timeline', NEW.id, 'update', json_object('id', OLD.id, 'date_label', OLD.date_label, 'title', OLD.title, 'description', OLD.description, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at), json_object('id', NEW.id, 'date_label', NEW.date_label, 'title', NEW.title, 'description', NEW.description, 'sort_order', NEW.sort_order, 'published', NEW.published, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_timeline_entries_delete AFTER DELETE ON timeline_entries
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('timeline', OLD.id, 'delete', json_object('id', OLD.id, 'date_label', OLD.date_label, 'title', OLD.title, 'description', OLD.description, 'sort_order', OLD.sort_order, 'published', OLD.published, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at), NULL);
END;

INSERT INTO cms_history(collection,item_id,action,after_json) SELECT 'timeline', id, 'baseline', json_object('id', timeline_entries.id, 'date_label', timeline_entries.date_label, 'title', timeline_entries.title, 'description', timeline_entries.description, 'sort_order', timeline_entries.sort_order, 'published', timeline_entries.published, 'created_at', timeline_entries.created_at, 'updated_at', timeline_entries.updated_at) FROM timeline_entries WHERE NOT EXISTS(SELECT 1 FROM cms_history WHERE collection='timeline' AND item_id=timeline_entries.id);

CREATE TRIGGER IF NOT EXISTS cms_history_ship_overrides_create AFTER INSERT ON ship_overrides
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('ships', NEW.ship_id, 'create', NULL, json_object('id', NEW.id, 'ship_id', NEW.ship_id, 'name', NEW.name, 'name_ko', NEW.name_ko, 'hidden', NEW.hidden, 'updated_at', NEW.updated_at));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_ship_overrides_update AFTER UPDATE ON ship_overrides
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('ships', NEW.ship_id, 'update', json_object('id', OLD.id, 'ship_id', OLD.ship_id, 'name', OLD.name, 'name_ko', OLD.name_ko, 'hidden', OLD.hidden, 'updated_at', OLD.updated_at), json_object('id', NEW.id, 'ship_id', NEW.ship_id, 'name', NEW.name, 'name_ko', NEW.name_ko, 'hidden', NEW.hidden, 'updated_at', NEW.updated_at));
END;

CREATE TRIGGER IF NOT EXISTS cms_history_ship_overrides_delete AFTER DELETE ON ship_overrides
BEGIN
 INSERT INTO cms_history(collection,item_id,action,before_json,after_json)
 VALUES ('ships', OLD.ship_id, 'delete', json_object('id', OLD.id, 'ship_id', OLD.ship_id, 'name', OLD.name, 'name_ko', OLD.name_ko, 'hidden', OLD.hidden, 'updated_at', OLD.updated_at), NULL);
END;

INSERT INTO cms_history(collection,item_id,action,after_json) SELECT 'ships', ship_id, 'baseline', json_object('id', ship_overrides.id, 'ship_id', ship_overrides.ship_id, 'name', ship_overrides.name, 'name_ko', ship_overrides.name_ko, 'hidden', ship_overrides.hidden, 'updated_at', ship_overrides.updated_at) FROM ship_overrides WHERE NOT EXISTS(SELECT 1 FROM cms_history WHERE collection='ships' AND item_id=ship_overrides.ship_id);

INSERT OR IGNORE INTO schema_migrations(id,applied_at) VALUES ('0015',datetime('now'));
