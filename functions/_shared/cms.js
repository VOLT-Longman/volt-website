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
  return { id: row.id, title: row.title, description: row.description || '', category: row.category || '기타', src: row.image_url, thumb: row.thumb_url || row.image_url, date: row.date || '', sortOrder: Number(row.sort_order || 0), published: Boolean(row.published) };
}

export function galleryInput(body, existing = {}) {
  const timestamp = nowIso();
  return {
    id: existing.id || sanitizeText(body.id) || createId('gallery'),
    title: sanitizeText(body.title),
    description: sanitizeText(body.description),
    category: sanitizeText(body.category, '기타'),
    image_url: sanitizeText(body.imageUrl || body.image_url || body.src),
    thumb_url: sanitizeText(body.thumbUrl || body.thumb_url || body.thumb || body.imageUrl || body.image_url || body.src),
    date: sanitizeText(body.date, timestamp.slice(0, 10)),
    sort_order: Number(body.sortOrder ?? body.sort_order ?? 0),
    published: body.published === undefined ? 1 : toBooleanInt(body.published),
    created_at: existing.created_at || timestamp,
    updated_at: timestamp
  };
}


export function mapShipOverride(row) {
  return {
    id: row.ship_id,
    shipId: row.ship_id,
    name: row.name,
    manufacturer: row.manufacturer,
    role: row.role,
    focus: row.focus,
    size: row.size,
    crew: row.crew,
    cargo: row.cargo,
    priceUsd: row.price_usd === null || row.price_usd === undefined ? null : Number(row.price_usd),
    implemented: row.implemented === null || row.implemented === undefined ? null : Boolean(row.implemented),
    plannerEligible: row.planner_eligible === null || row.planner_eligible === undefined ? null : Boolean(row.planner_eligible),
    tags: parseTags(row.tags),
    description: row.description,
    updatedAt: row.updated_at
  };
}

export function shipOverrideInput(shipId, body) {
  return {
    ship_id: sanitizeText(shipId),
    name: nullableText(body.name),
    manufacturer: nullableText(body.manufacturer),
    role: nullableText(body.role),
    focus: nullableText(body.focus),
    size: nullableText(body.size),
    crew: nullableText(body.crew),
    cargo: nullableText(body.cargo),
    price_usd: nullableNumber(body.priceUsd ?? body.price_usd),
    implemented: nullableBooleanInt(body.implemented),
    planner_eligible: nullableBooleanInt(body.plannerEligible ?? body.planner_eligible),
    tags: body.tags === null || body.tags === undefined ? null : JSON.stringify(Array.isArray(body.tags) ? body.tags : parseTags(body.tags)),
    description: nullableText(body.description),
    updated_at: nowIso()
  };
}

function nullableText(value) {
  const text = sanitizeText(value);
  return text ? text : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Invalid number');
  return number;
}

function nullableBooleanInt(value) {
  if (value === null || value === undefined || value === '') return null;
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function parseTags(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return String(value).split(',').map((tag) => tag.trim()).filter(Boolean);
  }
}

