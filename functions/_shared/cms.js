import { createId, limitText, nowIso, sanitizeText, toBooleanInt } from './http.js';

// 낙관적 잠금: 클라이언트가 수정 시작 시점의 updatedAt(expectedUpdatedAt)을 보내면
// 현재 행의 updated_at과 비교한다. 다르면 다른 관리자가 먼저 저장한 것 → 409.
// expectedUpdatedAt 미제공(구버전 클라이언트/스크립트)은 기존 동작(last-write-wins) 유지.
export const CONFLICT_MESSAGE = '다른 관리자가 먼저 저장했습니다. 목록을 새로고침해 최신 내용을 확인한 뒤 다시 수정해 주세요.';

export function hasUpdateConflict(body, existing) {
  const expected = body?.expectedUpdatedAt;
  if (expected === undefined || expected === null) return false;
  return String(expected) !== String(existing?.updated_at ?? '');
}

export function mapNotice(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tag: row.tag || '공지',
    // EN 다국어 필드(비어 있으면 프론트가 KO로 fallback). 없으면 빈 문자열.
    titleEn: row.title_en || '',
    contentEn: row.content_en || '',
    tagEn: row.tag_en || '',
    pinned: Boolean(row.pinned),
    published: Boolean(row.published),
    date: row.date || row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function noticeInput(body, existing = {}) {
  const timestamp = nowIso();
  return {
    id: existing.id || sanitizeText(body.id) || createId('notice'),
    title: limitText(body.title, 200),
    content: limitText(body.content, 20000),
    tag: limitText(body.tag, 20, '공지'),
    // EN 필드는 optional. 빈 값/미제공은 null로 통일, 문자열 아니면 명확히 거부.
    title_en: localizedTextInput(body.titleEn ?? body.title_en, 200),
    content_en: localizedTextInput(body.contentEn ?? body.content_en, 20000),
    tag_en: localizedTextInput(body.tagEn ?? body.tag_en, 20),
    pinned: toBooleanInt(body.pinned),
    published: body.published === undefined ? 1 : toBooleanInt(body.published),
    date: normalizeNoticeDate(limitText(blankAsUnset(body.date), 40, timestamp.slice(0, 10))),
    created_at: existing.created_at || timestamp,
    updated_at: timestamp
  };
}

// limitText는 빈 문자열을 "값 있음"으로 보고 기본값을 건너뛴다. 관리자 화면에서 날짜를 지우고
// 저장하면 빈 날짜가 그대로 들어가고(운영 ann-006이 그 사례), 그 공지는 정렬에서 맨 아래로 밀린다.
// 빈 문자열·공백은 미입력으로 되돌려 기본값(오늘)이 적용되게 한다.
function blankAsUnset(value) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

// 공지 날짜 저장 포맷은 YYYY-MM-DD 하나로 고정한다.
// 시드는 점 포맷, 관리자 UI(<input type="date">)와 기본값은 대시라 두 포맷이 섞이면
// 원문 문자열 정렬이 뒤집힌다('.'(0x2E) > '-'(0x2D) → DESC에서 점이 무조건 위).
// 표시 계층이 대시→점으로 변환해 렌더하므로 화면 표기는 바뀌지 않는다.
// 날짜로 해석되지 않는 값(예: '미정')은 사실을 바꾸지 않기 위해 그대로 둔다.
function normalizeNoticeDate(value) {
  const text = String(value ?? '').trim();
  return /^\d{4}\.\d{2}\.\d{2}$/.test(text) ? text.replace(/\./g, '-') : text;
}

// optional 다국어 텍스트: 미제공/빈 값 → null, 문자열 아니면 throw(잘못된 타입), 길이 초과 throw.
function localizedTextInput(value, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('Invalid localized field type');
  const text = limitText(value, maxLength);
  return text ? text : null;
}

export function mapEvent(row) {
  return { id: row.id, title: row.title, description: row.description || '', type: row.type || '작전', status: row.status || '예정', dateLabel: row.date_label || row.event_date || '', eventDate: row.event_date || '', published: Boolean(row.published), updatedAt: row.updated_at || '' };
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
  return { id: row.id, title: row.title, description: row.description || '', category: row.category || '기타', src: row.image_url, thumb: row.thumb_url || row.image_url, date: row.date || '', sortOrder: Number(row.sort_order || 0), published: Boolean(row.published), updatedAt: row.updated_at || '' };
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
    sort_order: finiteNumberOr(body.sortOrder ?? body.sort_order, 0),
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
    sort_order: finiteNumberOr(body.sortOrder ?? body.sort_order, 0),
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
    published: row.published === null || row.published === undefined ? true : Boolean(row.published),
    updatedAt: row.updated_at || ''
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
    sort_order: finiteNumberOr(body.sortOrder ?? body.sort_order, 0),
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
    published: Boolean(row.published),
    updatedAt: row.updated_at || ''
  };
}

export function timelineInput(body, existing = {}) {
  const timestamp = nowIso();
  return {
    id: existing.id || sanitizeText(body.id) || createId('tl'),
    date_label: limitText(body.dateLabel || body.date_label || body.date, 40),
    title: limitText(body.title, 200),
    description: limitText(body.description, 4000),
    sort_order: finiteNumberOr(body.sortOrder ?? body.sort_order, 0),
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

const CANONICAL_OVERRIDE_FIELDS = ['manufacturer', 'role', 'focus', 'size', 'crew', 'cargo', 'priceUsd', 'implemented', 'plannerEligible', 'tags', 'description'];

// override는 표시 이름과 숨김만 담는다. 사양·분류·설명은 canonical/localization/operational
// 계층이 유일 사실원이므로, D1에 남아 있는 레거시 컬럼 값은 공개 출력에 싣지 않는다
// (오래된 API 캐시나 정지 데이터가 사실값을 덮지 못하게 하는 장치).
export function mapShipOverride(row) {
  return {
    id: row.ship_id,
    shipId: row.ship_id,
    name: row.name,
    nameKo: row.name_ko,
    hidden: row.hidden === null || row.hidden === undefined ? null : Boolean(row.hidden),
    updatedAt: row.updated_at
  };
}

export function shipOverrideInput(shipId, body) {
  const unsupported = CANONICAL_OVERRIDE_FIELDS.filter((field) => Object.hasOwn(body || {}, field));
  if (unsupported.length) throw new Error(`Canonical ShipDB does not accept source overrides: ${unsupported.join(', ')}`);
  return {
    ship_id: limitText(shipId, 120),
    name: nullableText(body.name, 200),
    name_ko: nullableText(body.nameKo ?? body.name_ko, 200),
    hidden: nullableBooleanInt(body.hidden),
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


function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Invalid number');
  return number;
}

// D-6: sort_order는 bare Number()라 비수치 입력이 NaN으로 조용히 D1에 바인딩될 수 있었다.
// 값이 있으면 finite 검증 후 사용, 없으면 fallback(기존 관례상 0).
function finiteNumberOr(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
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
