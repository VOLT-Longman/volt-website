import { createId, limitText, nowIso, sanitizeText, toBooleanInt } from './http.js';

export function mapNotice(row) {
  return { id: row.id, title: row.title, content: row.content, tag: row.tag || '공지', pinned: Boolean(row.pinned), published: Boolean(row.published), date: row.date || row.created_at || '' };
}

export function noticeInput(body, existing = {}) {
  const timestamp = nowIso();
  return {
    id: existing.id || sanitizeText(body.id) || createId('notice'),
    title: limitText(body.title, 200),
    content: limitText(body.content, 20000),
    tag: limitText(body.tag, 20, '공지'),
    pinned: toBooleanInt(body.pinned),
    published: body.published === undefined ? 1 : toBooleanInt(body.published),
    date: limitText(body.date, 40, timestamp.slice(0, 10)),
    created_at: existing.created_at || timestamp,
    updated_at: timestamp
  };
}

export function mapEvent(row) {
  return { id: row.id, title: row.title, description: row.description || '', type: row.type || '작전', status: row.status || '예정', dateLabel: row.date_label || row.event_date || '', eventDate: row.event_date || '', published: Boolean(row.published) };
}

export function eventInput(body, existing = {}) {
  const timestamp = nowIso();
  const eventDate = limitText(body.eventDate || body.event_date, 40);
  return {
    id: existing.id || sanitizeText(body.id) || createId('event'),
    title: limitText(body.title, 200),
    description: limitText(body.description, 20000),
    type: limitText(body.type, 20, '작전'),
    status: limitText(body.status, 20, '예정'),
    date_label: limitText(body.dateLabel || body.date_label || body.date, 80),
    event_date: eventDate || null,
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
    title: limitText(body.title, 200),
    description: limitText(body.description, 20000),
    category: limitText(body.category, 40, '기타'),
    image_url: nullableHttpUrl(body.imageUrl || body.image_url || body.src),
    thumb_url: nullableHttpUrl(body.thumbUrl || body.thumb_url || body.thumb || body.imageUrl || body.image_url || body.src),
    date: limitText(body.date, 40, timestamp.slice(0, 10)),
    sort_order: Number(body.sortOrder ?? body.sort_order ?? 0),
    published: body.published === undefined ? 1 : toBooleanInt(body.published),
    created_at: existing.created_at || timestamp,
    updated_at: timestamp
  };
}



export function mapPartnerFleet(row) {
  return {
    id: row.id,
    name: row.name,
    region: row.region || '',
    game: row.game || '',
    focus: row.focus || '',
    description: row.description || '',
    memberCount: row.member_count === null || row.member_count === undefined ? null : Number(row.member_count),
    discordUrl: row.discord_url || '',
    websiteUrl: row.website_url || '',
    photoUrl: row.photo_url || row.logo_url || '',
    imageUrl: row.photo_url || row.logo_url || '',
    logoUrl: row.logo_url || '',
    established: row.established || '',
    sortOrder: Number(row.sort_order || 0),
    published: Boolean(row.published),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function partnerFleetInput(body, existing = {}) {
  const timestamp = nowIso();
  return {
    id: existing.id || sanitizeText(body.id) || createId('partner'),
    name: limitText(body.name, 200),
    region: limitText(body.region, 80),
    game: limitText(body.game, 80),
    focus: limitText(body.focus, 120),
    description: limitText(body.description, 20000),
    member_count: nullableNumber(body.memberCount ?? body.member_count),
    discord_url: nullableHttpUrl(body.discordUrl || body.discord_url),
    website_url: nullableHttpUrl(body.websiteUrl || body.website_url),
    photo_url: nullableHttpUrl(body.photoUrl || body.photo_url || body.imageUrl || body.image_url || body.logoUrl || body.logo_url),
    logo_url: nullableHttpUrl(body.logoUrl || body.logo_url),
    established: limitText(body.established, 80),
    sort_order: Number(body.sortOrder ?? body.sort_order ?? 0),
    published: body.published === undefined ? 1 : toBooleanInt(body.published),
    created_at: existing.created_at || timestamp,
    updated_at: timestamp
  };
}

export function mapLeader(row) {
  const extras = parseJsonObject(row.extras);
  return {
    id: row.id,
    name: row.name,
    role: row.role || '',
    discord: row.discord || '',
    description: row.description || '',
    duties: row.duties || '',
    avatar: row.avatar || (row.name || '?').charAt(0).toUpperCase(),
    avatarUrl: row.avatar_url || '',
    photoUrl: row.avatar_url || '',
    imageUrl: row.avatar_url || '',
    avatarGradient: row.avatar_gradient || '',
    avatarStyle: row.avatar_style || '',
    details: Array.isArray(extras.details) ? extras.details : undefined,
    competencies: Array.isArray(extras.competencies) ? extras.competencies : undefined,
    sortOrder: Number(row.sort_order || 0),
    published: row.published === null || row.published === undefined ? true : Boolean(row.published)
  };
}

export function leaderInput(body, existing = {}) {
  const timestamp = nowIso();
  return {
    id: existing.id || sanitizeText(body.id) || createId('leader'),
    name: limitText(body.name, 80),
    role: limitText(body.role, 160),
    discord: limitText(body.discord, 80),
    description: limitText(body.description, 4000),
    duties: limitText(body.duties, 2000),
    avatar: limitText(body.avatar, 8),
    avatar_url: nullableHttpUrl(body.avatarUrl || body.avatar_url || body.photoUrl || body.photo_url || body.imageUrl || body.image_url),
    avatar_gradient: limitText(body.avatarGradient || body.avatar_gradient, 200),
    avatar_style: limitText(body.avatarStyle || body.avatar_style, 20),
    // 상세 항목(details/competencies)은 관리자 UI 미노출 — 기존 값을 보존한다.
    extras: existing.extras ?? null,
    sort_order: Number(body.sortOrder ?? body.sort_order ?? 0),
    published: publishedInput(body, existing),
    created_at: existing.created_at || timestamp,
    updated_at: timestamp
  };
}

export function mapTimelineEntry(row) {
  return {
    id: row.id,
    date: row.date_label || '',
    dateLabel: row.date_label || '',
    title: row.title,
    description: row.description || '',
    sortOrder: Number(row.sort_order || 0),
    published: Boolean(row.published)
  };
}

export function timelineInput(body, existing = {}) {
  const timestamp = nowIso();
  return {
    id: existing.id || sanitizeText(body.id) || createId('tl'),
    date_label: limitText(body.dateLabel || body.date_label || body.date, 40),
    title: limitText(body.title, 200),
    description: limitText(body.description, 4000),
    sort_order: Number(body.sortOrder ?? body.sort_order ?? 0),
    published: body.published === undefined ? 1 : toBooleanInt(body.published),
    created_at: existing.created_at || timestamp,
    updated_at: timestamp
  };
}

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
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
    ship_id: limitText(shipId, 120),
    name: nullableText(body.name, 200),
    manufacturer: nullableText(body.manufacturer, 120),
    role: nullableText(body.role, 120),
    focus: nullableText(body.focus, 80),
    size: nullableText(body.size, 80),
    crew: nullableText(body.crew, 80),
    cargo: nullableText(body.cargo, 80),
    price_usd: nullableNumber(body.priceUsd ?? body.price_usd),
    implemented: nullableBooleanInt(body.implemented),
    planner_eligible: nullableBooleanInt(body.plannerEligible ?? body.planner_eligible),
    tags: normalizeTagsInput(body.tags),
    description: nullableText(body.description, 20000),
    updated_at: nowIso()
  };
}

function nullableHttpUrl(value, maxLength = 2048) {
  const text = nullableText(value, maxLength);
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch (_error) {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid URL scheme');
  return text;
}

function nullableText(value, maxLength = 2000) {
  const text = limitText(value, maxLength);
  return text ? text : null;
}

function normalizeTagsInput(value) {
  if (value === null || value === undefined) return null;
  const tags = Array.isArray(value) ? value : parseTags(value);
  return JSON.stringify(tags.map((tag) => limitText(tag, 40)).slice(0, 24));
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

function publishedInput(body, existing = {}) {
  if (body.published !== undefined) return toBooleanInt(body.published);
  if (existing.published !== null && existing.published !== undefined) return toBooleanInt(existing.published);
  return 1;
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

