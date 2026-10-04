export const ADMIN_COLLECTIONS = {
  notices: { table: 'notices', search: ['title', 'content', 'tag', 'title_en', 'content_en'], order: "date(replace(date, '.', '-')) DESC, updated_at DESC, created_at DESC, id ASC" },
  events: { table: 'events', search: ['title', 'description', 'type', 'status'], order: 'COALESCE(event_date, created_at) DESC, id ASC' },
  gallery: { table: 'gallery_items', search: ['title', 'description', 'category'], order: 'sort_order ASC, date DESC, created_at DESC, id ASC' },
  'partner-fleets': { table: 'partner_fleets', search: ['name', 'region', 'game', 'focus'], order: 'sort_order ASC, created_at DESC, id ASC' },
  leadership: { table: 'leadership_members', search: ['name', 'role', 'description'], order: 'sort_order ASC, created_at ASC, id ASC' },
  timeline: { table: 'timeline_entries', search: ['title', 'description', 'date_label'], order: 'sort_order ASC, created_at ASC, id ASC' },
  ships: { table: 'ship_overrides', key: 'ship_id' }
};

// Pagination is opt-in: existing complete-list clients keep their contract.
export async function adminList(db, request, collection, mapper) {
  const config = ADMIN_COLLECTIONS[collection];
  const params = new URL(request.url).searchParams;
  if (!params.has('page')) {
    const rows = await db.prepare(`SELECT * FROM ${config.table} ORDER BY ${config.order}`).all();
    return { items: (rows.results || []).map(mapper) };
  }
  const query = (params.get('q') || '').trim().slice(0, 200);
  const requestedPage = Math.max(1, Math.min(1000000, Number.parseInt(params.get('page'), 10) || 1));
  const pageSize = 20;
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  const where = query ? ` WHERE (${config.search.map((field) => `${field} LIKE ? ESCAPE '\\'`).join(' OR ')})` : '';
  const bindings = query ? config.search.map(() => pattern) : [];
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM ${config.table}${where}`).bind(...bindings).first();
  const total = Number(count?.total || 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);
  const rows = await db.prepare(`SELECT * FROM ${config.table}${where} ORDER BY ${config.order} LIMIT ? OFFSET ?`).bind(...bindings, pageSize, (page - 1) * pageSize).all();
  return { items: (rows.results || []).map(mapper), pagination: { page, pageSize, total, pages } };
}
