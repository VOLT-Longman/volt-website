import { requireUser } from '../../_shared/rbac.js';
import { json, requireDb } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  const session = await requireUser(request, env);
  if (session instanceof Response) return session;
  const result = await requireDb(env).prepare(`
    SELECT r.*, e.title, e.date_label, e.event_date, e.status AS event_status
    FROM event_rsvps r
    LEFT JOIN events e ON e.id = r.event_id
    WHERE r.user_sub = ?
    ORDER BY r.updated_at DESC
  `).bind(session.sub).all();
  return json({ items: (result.results || []).map(mapMyRsvp) });
}

function mapMyRsvp(row) {
  return { eventId: row.event_id, title: row.title || row.event_id, dateLabel: row.date_label || row.event_date || '', eventStatus: row.event_status || '', status: row.status, updatedAt: row.updated_at || '' };
}
