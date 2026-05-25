import { createId, nowIso, sanitizeText, toBooleanInt } from './http.js';

export function mapNotice(row) {
  return { id: row.id, title: row.title, content: row.content, tag: row.tag || '공지', pinned: Boolean(row.pinned), published: Boolean(row.published), date: row.date || row.created_at || '' };
}

export function noticeInput(body, existing = {}) {
  const timestamp = nowIso();
  return {
    id: existing.id || sanitizeText(body.id) || createId('notice'),
    title: sanitizeText(body.title),
    content: sanitizeText(body.content),
    tag: sanitizeText(body.tag, '공지'),
    pinned: toBooleanInt(body.pinned),
    published: body.published === undefined ? 1 : toBooleanInt(body.published),
    date: sanitizeText(body.date, timestamp.slice(0, 10)),
    created_at: existing.created_at || timestamp,
    updated_at: timestamp
  };
}

export function mapEvent(row) {
  return { id: row.id, title: row.title, description: row.description || '', type: row.type || '작전', status: row.status || '예정', dateLabel: row.date_label || row.event_date || '', eventDate: row.event_date || '', published: Boolean(row.published) };
}

export function eventInput(body, existing = {}) {
  const timestamp = nowIso();
  return {
    id: existing.id || sanitizeText(body.id) || createId('event'),
    title: sanitizeText(body.title),
    description: sanitizeText(body.description),
    type: sanitizeText(body.type, '작전'),
    status: sanitizeText(body.status, '예정'),
    date_label: sanitizeText(body.dateLabel || body.date_label || body.date),
    event_date: sanitizeText(body.eventDate || body.event_date),
    published: body.published === undefined ? 1 : toBooleanInt(body.published),
    created_at: existing.created_at || timestamp,
    updated_at: timestamp
  };
}

export function mapGallery(row) {
  return { id: row.id, title: row.title, description: row.description || '', category: row.category || '활동', src: row.image_url, thumb: row.thumb_url || row.image_url, date: row.date || '', sortOrder: Number(row.sort_order || 0), published: Boolean(row.published) };
}

export function galleryInput(body, existing = {}) {
  const timestamp = nowIso();
  return {
    id: existing.id || sanitizeText(body.id) || createId('gallery'),
    title: sanitizeText(body.title),
    description: sanitizeText(body.description),
    category: sanitizeText(body.category, '활동'),
    image_url: sanitizeText(body.imageUrl || body.image_url || body.src),
    thumb_url: sanitizeText(body.thumbUrl || body.thumb_url || body.thumb || body.imageUrl || body.image_url || body.src),
    date: sanitizeText(body.date, timestamp.slice(0, 10)),
    sort_order: Number(body.sortOrder ?? body.sort_order ?? 0),
    published: body.published === undefined ? 1 : toBooleanInt(body.published),
    created_at: existing.created_at || timestamp,
    updated_at: timestamp
  };
}
