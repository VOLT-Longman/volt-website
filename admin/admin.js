const state = {
  dirty: false,
  tab: 'notices',
  items: [],
  editing: null,
  galleryImageUrls: [],
  galleryFiles: [],
  shipOverrides: new Map(),
  shipOverridesLoaded: false,
  shipSourceError: '',
  shipQuery: '',
  listQuery: '',
  listPage: 1,
  pagination: null,
  saving: false,
  pendingUploads: 0,
  formRevision: 0,
  unsavedUploads: new Map()
};
const CANONICAL_SHIP_OVERRIDE_KEYS = new Set(['name', 'nameKo', 'hidden']);

const NOTICE_TAGS = ['\uacf5\uc9c0', '\uc911\uc694', '\uc5c5\ub370\uc774\ud2b8', '\uc774\ubca4\ud2b8', '\uc791\uc804', '\uc2dc\uc2a4\ud15c', '\ubaa8\uc9d1'];
const EVENT_TYPES = ['\uc815\uae30\uc791\uc804', '\ud569\ub3d9\uc791\uc804', '\uc774\ubca4\ud2b8', '\ud68c\uc758', '\ud6c8\ub828', '\uc810\uac80', '\uae30\ud0c0'];
const EVENT_STATUSES = ['\uc608\uc815', '\uc9c4\ud589\uc911', '\uc644\ub8cc', '\ucde8\uc18c', '\uc5f0\uae30'];
const GALLERY_CATEGORIES = ['\uc791\uc804', '\ud568\uc120', '\ud48d\uacbd', '\uc774\ubca4\ud2b8', '\uae30\ud0c0'];
const PARTNER_REGIONS = ['한국', '아시아', '글로벌', '북미', '유럽', '기타'];
const PARTNER_GAMES = ['Star Citizen', '기타'];
const GALLERY_MAX_SIZE = 10 * 1024 * 1024;
const SHIP_SEARCH_DELAY_MS = 200;

let shipSearchTimer = null;
let loadItemsRevision = 0;
let shipBaseCache = null;
let galleryFileNumbers = new WeakMap();
let galleryBatchSize = 0;
let shipScriptsPromise = null;
const adminAssetVersion = new URL(document.currentScript?.src || location.href).searchParams.get('v');

const CONFIG = {
  notices: { title: '\uacf5\uc9c0', endpoint: '/api/admin/notices', fields: ['title', 'content', 'tag', 'titleEn', 'contentEn', 'tagEn', 'date', 'pinned', 'published'] },
  events: { title: '\uc77c\uc815', endpoint: '/api/admin/events', fields: ['title', 'description', 'type', 'status', 'dateLabel', 'eventDate', 'published', 'titleEn', 'descriptionEn', 'typeEn', 'statusEn', 'dateLabelEn'] },
  gallery: { title: '\uac24\ub7ec\ub9ac', endpoint: '/api/admin/gallery', fields: ['title', 'description', 'category', 'date', 'published', 'titleEn', 'descriptionEn', 'categoryEn'] },
  'partner-fleets': { title: '협력함대', endpoint: '/api/admin/partner-fleets', fields: ['name', 'region', 'game', 'focus', 'description', 'memberCount', 'discordUrl', 'websiteUrl', 'photoUrl', 'logoUrl', 'established', 'sortOrder', 'published', 'nameEn', 'regionEn', 'gameEn', 'focusEn', 'descriptionEn', 'establishedEn'] },
  leadership: { title: '\uc784\uc6d0\uc9c4', endpoint: '/api/admin/leadership', fields: ['name', 'role', 'discord', 'description', 'duties', 'avatarUrl', 'avatar', 'avatarGradient', 'sortOrder', 'published', 'nameEn', 'roleEn', 'descriptionEn', 'dutiesEn', 'detailsEn', 'competenciesEn'] },
  timeline: { title: '\uc5f0\ud601', endpoint: '/api/admin/timeline', fields: ['dateLabel', 'title', 'description', 'sortOrder', 'published', 'titleEn', 'descriptionEn', 'dateLabelEn'] },
  ships: { title: '\ud568\uc120DB', endpoint: '/api/admin/ships', fields: [] }
};

const FIELD_OPTIONS = {
  notices: { tag: NOTICE_TAGS },
  events: { type: EVENT_TYPES, status: EVENT_STATUSES },
  gallery: { category: GALLERY_CATEGORIES },
  'partner-fleets': { region: PARTNER_REGIONS, game: PARTNER_GAMES }
};

// 업로드 위젯으로 그릴 이미지 URL 필드. 업로드와 URL 직접 입력을 모두 지원한다.
const IMAGE_FIELDS = {
  'partner-fleets': ['photoUrl', 'logoUrl'],
  leadership: ['avatarUrl']
};

const LABELS = {
  nameEn: "영어 이름",
  descriptionEn: "영어 설명",
  typeEn: "영어 유형",
  statusEn: "영어 상태",
  dateLabelEn: "영어 표시 날짜",
  categoryEn: "영어 분류",
  regionEn: "영어 지역",
  gameEn: "영어 게임",
  focusEn: "영어 주 역할",
  establishedEn: "영어 창설",
  roleEn: "영어 역할",
  dutiesEn: "영어 주요 업무",
  detailsEn: "영어 상세 항목 (JSON)",
  competenciesEn: "영어 핵심 역량 (JSON)",
  title: '\uc81c\ubaa9',
  content: '\ub0b4\uc6a9',
  tag: '\ud0dc\uadf8',
  titleEn: '\uc601\uc5b4 \uc81c\ubaa9 (EN)',
  contentEn: '\uc601\uc5b4 \ubcf8\ubb38 (EN)',
  tagEn: '\uc601\uc5b4 \ud0dc\uadf8 (EN)',
  date: '\ub0a0\uc9dc',
  pinned: '\uace0\uc815',
  published: '\uac8c\uc2dc',
  description: '\uc124\uba85',
  type: '\uc720\ud615',
  status: '\uc0c1\ud0dc',
  dateLabel: '\ud45c\uc2dc \ub0a0\uc9dc',
  eventDate: '\uc2e4\uc81c \ub0a0\uc9dc',
  category: '\uce74\ud14c\uace0\ub9ac',
  memberCount: '멤버 수',
  discordUrl: 'Discord URL',
  websiteUrl: '웹사이트 URL',
  photoUrl: '\uc0ac\uc9c4 URL',
  logoUrl: '로고 URL',
  established: '창설',
  sortOrder: '정렬 순서',
  manufacturer: '\uc81c\uc870\uc0ac',
  role: '\uc5ed\ud560',
  focus: '\uc8fc \uc5ed\ud560',
  size: '\ud06c\uae30',
  crew: '\uc2b9\ubb34\uc6d0',
  cargo: '\ud654\ubb3c\ub7c9',
  priceUsd: '\uac00\uaca9(USD)',
  implemented: '\uad6c\ud604 \uc5ec\ubd80',
  plannerEligible: '\ubb34\uc5ed\ud50c\ub798\ub108 \ub178\ucd9c',
  tags: '\ud0dc\uadf8',
  name: '\uc774\ub984',
  shipNameEn: '\uc601\ubb38 \ud568\uc120\uba85 (EN)',
  shipNameKo: '\ud55c\uae00 \ud568\uc120\uba85 (KO)',
  region: '\uc9c0\uc5ed',
  game: '\uac8c\uc784',
  discord: 'Discord',
  duties: '\uc8fc\uc694 \uc5c5\ubb34',
  avatarUrl: '\ud504\ub85c\ud544 \uc0ac\uc9c4 URL',
  avatar: '\uc544\ubc14\ud0c0 \uc774\ub2c8\uc15c',
  avatarGradient: '\uc544\ubc14\ud0c0 \uadf8\ub77c\ub370\uc774\uc158(CSS)'
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = path === '/api/admin/ships/erkul-sync/preview' ? 60000 : 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('요청 시간이 초과됐습니다. 다시 시도해 주세요.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || (response.status >= 500 ? '서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.' : '요청에 실패했습니다.'));
    err.status = response.status;
    throw err;
  }
  return data;
}

async function checkSession() {
  const session = await api('/api/admin/session');
  $('#preview-environment').hidden = session.environment !== 'preview';
  $('#login-panel').hidden = session.authenticated;
  $('#dashboard').hidden = !session.authenticated;
  $('#discord-login-button').hidden = !session.discordLoginEnabled;
  $('#discord-login-note').hidden = !session.discordLoginEnabled;
  $('#discord-switch-button').hidden = !session.authenticated || !session.discordLoginEnabled || session.identity?.method === 'discord';
  $('#admin-identity').textContent = session.identity?.method === 'discord'
    ? `${session.identity.displayName} · ${session.identity.roles.join(', ')} · Discord 로그인`
    : session.authenticated ? '공통 관리자 비밀번호 로그인' : '';
  if (session.authenticated) await loadItems();
}

async function loginWithDiscord({ redirect = true } = {}) {
  if (state.saving || state.pendingUploads || !confirmDiscard()) return;
  $('#discord-login-button').disabled = true;
  $('#discord-switch-button').disabled = true;
  try {
    await api('/api/admin/discord-login', { method: 'POST' });
    $('#login-message').textContent = '';
    await checkSession();
  } catch (error) {
    if (error.status === 401 && redirect) {
      await cleanupAbandonedUploads();
      window.location.assign('/auth/discord/login?returnTo=%2Fadmin%2F');
      return;
    }
    $('#login-message').textContent = error.message;
    if (!$('#dashboard').hidden) setFormMessage(error.message, 'error');
  } finally {
    $('#discord-login-button').disabled = false;
    $('#discord-switch-button').disabled = false;
  }
}

async function login(event) {
  event.preventDefault();
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: $('#login-password').value })
    });
    $('#login-password').value = '';
    $('#login-message').textContent = '';
    await checkSession();
  } catch (error) {
    $('#login-message').textContent = error.message;
  }
}

async function logout() {
  if (state.saving || state.pendingUploads || !confirmDiscard()) return;
  await cleanupAbandonedUploads();
  await api('/api/admin/logout', { method: 'POST' });
  state.items = [];
  state.editing = null;
  await checkSession();
}

function confirmDiscard() {
  if (!state.dirty) return true;
  return confirm('저장하지 않은 변경 사항이 있습니다. 이동하면 사라집니다. 계속할까요?');
}

function setTab(tab) {
  if (state.saving || state.pendingUploads) return;
  if (!confirmDiscard()) return;
  clearTimeout(shipSearchTimer);
  loadItemsRevision += 1;
  state.tab = tab;
  state.listQuery = '';
  state.listPage = 1;
  state.pagination = null;
  $('#cms-search').value = '';
  $('#cms-search-label').hidden = tab === 'ships';
  document.dispatchEvent(new Event('cms-tab-change'));
  state.items = [];
  state.editing = null;
  state.galleryImageUrls = [];
  state.galleryFiles = [];
  if (tab === 'ships') state.shipOverridesLoaded = false;
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  // Erkul 동기화 미리보기는 함선DB 탭 전용
  const syncCard = $('#erkul-sync-card');
  if (syncCard) syncCard.hidden = tab !== 'ships';
  if (tab === 'ships') loadErkulSyncStatus();
  renderForm(null);
  // The empty form was rendered above. A late list response must not replace
  // an image input while the administrator is selecting a file.
  loadItems(false).catch(showFormError);
}

// ===== Erkul Live 동기화 미리보기 (A-7, 읽기 전용 — apply는 A-8) =====
// innerHTML 래칫 준수: 렌더는 전부 createElement/textContent로만 한다.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ===== 동기화 상태 패널 (E-1, 읽기 전용) =====
// 현재 배포된 데이터 레이어(정적 파일)를 텍스트로 읽어 syncedAt/규모/anomaly만 파싱한다.
// 파일 쓰기·API 변경 없음 — 운영자가 preview 실행 전에 "지금 동기화가 필요한가"를 판단하는 용도.
const SYNC_CADENCE_DAYS = 14; // 런북 7-1절: 격주 + 게임 패치 직후

let erkulStatusCache = null;

function syncBadge(text, tone) {
  return el('span', `sync-badge sync-badge-${tone}`, text);
}

function syncedAtAgeDays(iso) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((Date.now() - time) / 86400000);
}

function formatSyncedAt(iso) {
  if (!iso) return '알 수 없음';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const kst = date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
  const days = syncedAtAgeDays(iso);
  return `${kst} KST${days === null ? '' : ` (${days === 0 ? '오늘' : `${days}일 전`})`}`;
}

function renderErkulSyncStatus(container, status) {
  container.replaceChildren();
  const line = el('p', 'sync-status-line');
  line.append(el('span', null, '마지막 동기화: '), el('strong', null, formatSyncedAt(status.statsSyncedAt)));
  container.append(line);
  const badges = el('div', 'sync-badges');
  badges.append(syncBadge(`레이어 ${status.shipCount}척`, 'info'));
  // anomaly는 성격이 둘로 갈린다 — 실제 가격 충돌(운영 판단 필요)과
  // 렌탈가 미제공 기록(Erkul 원천이 렌탈가를 0으로 보냄 — A-3 정책상 기록만, 무해).
  badges.append(status.conflictShips > 0
    ? syncBadge(`가격 충돌 anomaly ${status.conflictShips}척 — 확인 필요`, 'warn')
    : syncBadge('가격 충돌 없음', 'ok'));
  if (status.rentalGapShips > 0) {
    badges.append(syncBadge(`렌탈가 미제공 기록 ${status.rentalGapShips}척 (Erkul 원천, 무해)`, 'info'));
  }
  const days = syncedAtAgeDays(status.statsSyncedAt);
  if (status.sourceVersion) badges.append(syncBadge(`Erkul ${status.sourceVersion}`, 'info'));
  if (status.historicalShips) badges.append(syncBadge(`원본에 없는 ${status.historicalShips}척은 과거 자료 유지`, 'warn'));
  if (days !== null && days >= SYNC_CADENCE_DAYS) {
    badges.append(syncBadge(`${days}일 경과 — 격주 주기 초과, 동기화 권장`, 'warn'));
  }
  if (status.marketSyncedAt && status.statsSyncedAt && status.marketSyncedAt !== status.statsSyncedAt) {
    badges.append(syncBadge('stats/market 동기화 시점 불일치 — 재적용 필요', 'danger'));
  }
  container.append(badges);
}

// market 레이어의 anomaly를 성격별로 분류한다 (E-1 배지 세분화).
// - rentalGapShips: 모든 anomaly가 'price=0:'(렌탈가 미제공 기록)뿐인 함선 — 무해
// - conflictShips: 그 외 기록(매핑 가격 충돌 등)이 하나라도 있는 함선 — 운영 확인 대상
// 파싱 실패 시 0으로 두고 조용히 넘어간다 — 상태 패널은 보조 정보다.
function classifyMarketAnomalies(marketText) {
  const result = { rentalGapShips: 0, conflictShips: 0 };
  try {
    const jsonText = marketText.match(/=\s*(\{[\s\S]*\});?\s*$/)?.[1];
    if (!jsonText) return result;
    const market = JSON.parse(jsonText);
    for (const entry of Object.values(market)) {
      const anomalies = Array.isArray(entry?.anomalies) ? entry.anomalies : [];
      if (!anomalies.length) continue;
      if (anomalies.some((item) => !String(item).startsWith('price=0:'))) result.conflictShips += 1;
      else result.rentalGapShips += 1;
    }
  } catch (_error) {
    /* JSON 파싱 실패 — 분류 없이 0 유지 */
  }
  return result;
}

async function loadErkulSyncStatus() {
  const container = $('#erkul-sync-status');
  if (!container) return;
  if (erkulStatusCache) {
    renderErkulSyncStatus(container, erkulStatusCache);
    return;
  }
  container.replaceChildren(el('p', 'sync-meta', '데이터 레이어 상태 확인 중…'));
  try {
    const fetchText = async (path) => {
      const response = await fetch(path, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
      return response.text();
    };
    const [statsText, marketText] = await Promise.all([
      fetchText('/data/ship-live-stats.js'),
      fetchText('/data/ship-market.js')
    ]);
    erkulStatusCache = {
      statsSyncedAt: statsText.match(/"syncedAt":"([^"]+)"/)?.[1] ?? null,
      marketSyncedAt: marketText.match(/"syncedAt":"([^"]+)"/)?.[1] ?? null,
      // 엔트리 수 = erkulLocalName 필드 수 (레이어 스키마상 함선당 1회)
      shipCount: (statsText.match(/"erkulLocalName"/g) || []).length,
      sourceVersion: statsText.match(/"sourceVersion":"([^"]+)"/)?.[1] ?? null,
      historicalShips: (statsText.match(/"sourceVersion":"live"/g) || []).length,
      ...classifyMarketAnomalies(marketText)
    };
    renderErkulSyncStatus(container, erkulStatusCache);
  } catch (error) {
    container.replaceChildren(el('p', 'sync-error', `레이어 상태 확인 실패: ${error.message}`));
  }
}

// preview summary를 운영자 판단용 배지로 요약한다 (E-1). 런북 규칙: 변경 0이면 종료.
function renderErkulPreviewBadges(container, data) {
  const summary = data.summary;
  const badges = el('div', 'sync-badges');
  const changed = summary.statsChanged + summary.marketChanged + (summary.descriptionsChanged || 0);
  if (changed === 0) {
    badges.append(syncBadge('변경 없음 — 적용 불필요 (런북: 변경 0이면 종료)', 'ok'));
  } else {
    if (summary.statsChanged) badges.append(syncBadge(`스펙 변경 ${summary.statsChanged}척`, 'info'));
    if (summary.marketChanged) badges.append(syncBadge(`시장 변경 ${summary.marketChanged}척`, 'info'));
    if (summary.descriptionsChanged) badges.append(syncBadge(`설명(EN) 변경 ${summary.descriptionsChanged}척 — 적용 후 번역 갱신 필수`, 'warn'));
  }
  if (summary.newErkulCandidates > 0) badges.append(syncBadge(`신규 후보 ${summary.newErkulCandidates}척 (자동 추가 안 함)`, 'warn'));
  if (data.warnings?.length) badges.append(syncBadge(`경고 ${data.warnings.length}건`, 'danger'));
  container.append(badges);
}

function renderErkulSyncSummary(container, summary) {
  const cards = [
    ['변경 항목', summary.statsChanged + summary.marketChanged + (summary.descriptionsChanged || 0)],
    ['신규 후보', summary.newErkulCandidates],
    ['미매칭', summary.unmatchedVolt ?? '-'],
    ['가격 변경', summary.priceChanges],
    ['구매처 변경', summary.purchaseLocationChanges]
  ];
  const grid = el('div', 'sync-summary-grid');
  for (const [label, value] of cards) {
    const card = el('div', 'sync-summary-item');
    card.append(el('span', null, label), el('strong', null, String(value)));
    grid.append(card);
  }
  container.append(grid);
  container.append(el('p', 'sync-meta', `Erkul ships ${summary.erkulShips} · shops ${summary.erkulShops} · 매칭 ${summary.matched} · 렌탈 변경 ${summary.rentalChanges}`));
}

function renderErkulSyncRows(container, title, rows, formatRow, cap = 20) {
  if (!rows.length) return;
  const section = el('section', 'sync-rows');
  section.append(el('h3', null, `${title} (${rows.length}건)`));
  const list = el('ul');
  for (const row of rows.slice(0, cap)) list.append(el('li', null, formatRow(row)));
  if (rows.length > cap) list.append(el('li', 'sync-more', `... 외 ${rows.length - cap}건`));
  section.append(list);
  container.append(section);
}

function renderErkulSyncResult(data) {
  const container = $('#erkul-sync-result');
  container.replaceChildren();
  renderErkulPreviewBadges(container, data);
  renderErkulSyncSummary(container, data.summary);
  renderErkulSyncRows(container, '스펙 변경', data.changes.stats,
    (row) => `${row.voltId} · ${row.field}: ${row.current ?? '없음'} → ${row.incoming ?? '없음'}`);
  renderErkulSyncRows(container, '가격/구매처 변경', data.changes.market,
    (row) => `${row.voltId} · ${row.type} · ${row.shop ?? ''}${row.location ? ` @ ${row.location}` : ''}: ${row.current ?? '없음'} → ${row.incoming ?? '없음'}`);
  renderErkulSyncRows(container, '설명(EN) 변경', data.changes.descriptions,
    (row) => `${row.voltId} · descriptions.en 변경됨`);
  renderErkulSyncRows(container, '신규 후보 (자동 추가 안 함)', data.changes.newCandidates,
    (row) => `${row.localName} · ${row.name ?? '?'} (${row.manufacturer ?? '?'})`);
  renderErkulSyncRows(container, 'shop 전용 미매칭 선체', data.changes.marketOnly,
    (row) => row.localName);
  if (data.warnings.length) {
    renderErkulSyncRows(container, '경고', data.warnings, (w) => String(w), 10);
  }
  if (!data.changes.stats.length && !data.changes.market.length && !data.changes.descriptions.length) {
    container.append(el('p', 'sync-meta', '현재 데이터 레이어와 Erkul live가 일치합니다. 변경 사항이 없습니다.'));
  }
  renderErkulApplyGuide(container, data);
}

// Safe Apply(A-8): 운영 API는 파일을 쓰지 않는다 — 로컬 스크립트 명령을 hash와 함께 안내만 한다.
// [바로 적용] 버튼은 만들지 않는다 (정적 파일 레이어 + Git 커밋/배포 이력 유지 원칙).
function renderErkulApplyGuide(container, data) {
  if (!data.previewHash) return;
  const section = el('section', 'sync-apply-guide');
  section.append(el('h3', null, 'Safe Apply'));
  section.append(el('p', 'sync-meta', 'Safe Apply는 로컬 스크립트로 실행됩니다. 적용 후 git 커밋/배포로 반영하세요.'));
  const hashLine = el('p', 'sync-hash');
  hashLine.append(el('span', null, '현재 previewHash: '), el('code', null, data.previewHash));
  section.append(hashLine);
  const command = data.apply?.command || `npm run shipdb:erkul:apply -- --confirm-preview-hash ${data.previewHash}`;
  section.append(el('code', 'sync-command', command));
  const copyButton = el('button', 'secondary sync-copy-button', '적용 명령 복사');
  copyButton.type = 'button';
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(command);
      copyButton.textContent = '복사됨';
    } catch (_error) {
      copyButton.textContent = '복사 실패 — 직접 선택해 복사하세요';
    }
    setTimeout(() => { copyButton.textContent = '적용 명령 복사'; }, 2000);
  });
  section.append(copyButton);
  container.append(section);
}

async function runErkulSyncPreview() {
  const button = $('#erkul-sync-preview-button');
  const container = $('#erkul-sync-result');
  button.disabled = true;
  button.textContent = '불러오는 중…';
  container.replaceChildren(el('p', 'sync-meta', 'Erkul live 데이터를 가져와 비교하는 중입니다…'));
  try {
    const data = await api('/api/admin/ships/erkul-sync/preview');
    renderErkulSyncResult(data);
  } catch (error) {
    container.replaceChildren(el('p', 'sync-error', `미리보기 실패: ${error.message}`));
  } finally {
    button.disabled = false;
    button.textContent = '미리보기 실행';
  }
}

async function loadItems(clearForm = true) {
  const tab = state.tab;
  const requestRevision = ++loadItemsRevision;
  const formRevision = state.formRevision;
  const config = CONFIG[tab];
  $('#list-title').textContent = `${config.title} \ubaa9\ub85d${tab === 'notices' ? ' · \ucd5c\uc2e0\uc21c' : ''}`;
  let items;
  try {
    if (tab === 'ships') {
      items = await loadShipItems(requestRevision);
    } else {
      const data = await api(config.endpoint + '?' + new URLSearchParams({ page: state.listPage, q: state.listQuery }));
      if (requestRevision !== loadItemsRevision || tab !== state.tab) return;
      items = data.items || [];
      state.pagination = data.pagination || { page: 1, pages: 1, total: items.length };
      state.listPage = state.pagination.page;
    }
  } catch (error) {
    if (requestRevision !== loadItemsRevision || tab !== state.tab) return;
    state.items = [];
    if (tab === 'ships') {
      state.shipSourceError = error.message;
      renderList();
    } else {
      $('#item-list').replaceChildren(el('p', 'admin-message', `목록을 불러오지 못했습니다: ${error.message}`));
    }
    throw error;
  }
  if (requestRevision !== loadItemsRevision || tab !== state.tab) return;
  state.items = sortItemsForTab(items);
  renderList();
  if (clearForm && formRevision === state.formRevision) renderForm(null);
}

function sortItemsForTab(items) {
  if (state.tab !== 'notices') return items;
  return [...items].sort(compareNoticesByLatest);
}

function compareNoticesByLatest(left, right) {
  for (const field of ['date', 'updatedAt']) {
    const difference = getNoticeSortTime(right[field]) - getNoticeSortTime(left[field]);
    if (difference !== 0) return difference;
  }
  return String(right.id || '').localeCompare(String(left.id || ''));
}

function getNoticeSortTime(value) {
  const normalized = String(value || '').trim().replace(/\./g, '-');
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? 0 : time;
}

async function loadShipItems(requestRevision) {
  const source = await loadCanonicalShipSource();
  if (requestRevision !== loadItemsRevision || state.tab !== 'ships') return [];
  state.shipSourceError = '';
  if (shipBaseCache?.source !== source) {
    const legacyById = new Map((window.VOLT_DATA?.ships || []).map((ship) => [ship.id, ship]));
    const operationalById = new Map((source.operational.records || []).map((record) => [record.id, record]));
    shipBaseCache = {
      source,
      items: source.canonical.ships.map((canonical) => {
        const legacy = legacyById.get(canonical.id) || { id: canonical.id, name: canonical.id };
        return adminShipBase(legacy, canonical, operationalById.get(canonical.id));
      })
    };
  }

  if (!state.shipOverridesLoaded) {
    const payload = await api(CONFIG.ships.endpoint);
    if (requestRevision !== loadItemsRevision || state.tab !== 'ships') return [];
    state.shipOverrides = new Map((payload.items || []).map((item) => [item.shipId, item]));
    state.shipOverridesLoaded = true;
  }

  return shipBaseCache.items
    .map((base) => mergeShipItem(base, state.shipOverrides.get(base.id)))
    .filter(matchShipQuery);
}

async function loadCanonicalShipSource() {
  await ensureShipScripts();
  const source = window.VOLT_SHIPDB_CANONICAL;
  if (!source) {
    throw new Error('canonical 함선 데이터 로더를 사용할 수 없습니다.');
  }
  await source.load();
  const data = source.data;
  if (!Array.isArray(data.canonical?.ships) || !Array.isArray(data.operational?.records)) {
    throw new Error('canonical 데이터 구조가 올바르지 않습니다.');
  }
  return data;
}

function ensureShipScripts() {
  if (shipScriptsPromise) return shipScriptsPromise;
  shipScriptsPromise = (async () => {
    for (const src of [
      '../data/volt-data.js',
      '../data/volt-localization.js',
      '../js/shipdb-canonical.js'
    ]) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${src}${adminAssetVersion ? `?v=${encodeURIComponent(adminAssetVersion)}` : ''}`;
        script.onload = resolve;
        script.onerror = () => reject(new Error('함선DB 스크립트를 불러오지 못했습니다. 다시 시도해 주세요.'));
        document.head.append(script);
      });
    }
  })().catch((error) => {
    shipScriptsPromise = null;
    throw error;
  });
  return shipScriptsPromise;
}

function adminShipBase(legacy, canonical, operational) {
  return {
    id: canonical.id,
    name: legacy?.name || canonical.id,
    manufacturer: canonical.manufacturer || '',
    role: canonical.role || '',
    size: canonical.size || '',
    cargo: canonical.cargoScu === null || canonical.cargoScu === undefined ? '' : `${canonical.cargoScu.toLocaleString('en-US')} SCU`,
    implemented: operational?.implemented ?? null
  };
}

function mergeShipItem(base, override) {
  const merged = { ...base };
  if (override) {
    Object.entries(override).forEach(([key, value]) => {
      if (['id', 'shipId', 'updatedAt'].includes(key)) return;
      if (!CANONICAL_SHIP_OVERRIDE_KEYS.has(key)) return;
      if (value !== null && value !== undefined && value !== '') merged[key] = value;
    });
  }
  return { id: base.id, title: base.name, base, override: override || null, merged };
}

function matchShipQuery(item) {
  if (!state.shipQuery) return true;
  const ship = item.merged;
  return [ship.name, ship.manufacturer, ship.role, ship.size]
    .join(' ')
    .toLowerCase()
    .includes(state.shipQuery);
}

function renderList() {
  const list = $('#item-list');
  if (state.tab === 'ships') {
    const pages = Math.max(1, Math.ceil(state.items.length / 20));
    state.listPage = Math.min(state.listPage, pages);
    state.pagination = { page: state.listPage, pages, total: state.items.length };
  }
  updateListPagination();
  if (state.tab === 'ships') {
    // 검색 input을 다시 그리면 타이핑 중 포커스·한글 IME 조합이 끊긴다(커서 풀림 버그).
    // input이 이미 있으면 결과 영역만 교체해 포커스를 보존한다.
    const results = document.getElementById('ship-admin-results');
    if (results && document.getElementById('ship-admin-search')) {
      results.innerHTML = renderShipList();
      return;
    }
    list.innerHTML = `${renderShipSearch()}<div id="ship-admin-results">${renderShipList()}</div>`;
    return;
  }
  list.innerHTML = state.items.length
    ? state.items.map(renderStandardListItem).join('')
    : '<p class="admin-message">\ub4f1\ub85d\ub41c \ud56d\ubaa9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</p>';
}

function updateListPagination() {
  const pagination = state.pagination || { page: 1, pages: 1, total: 0 };
  $('#list-prev').disabled = state.saving || pagination.page <= 1;
  $('#list-next').disabled = state.saving || pagination.page >= pagination.pages;
  $('#list-page').textContent = `${pagination.page} / ${pagination.pages} 페이지 · ${pagination.total}건`;
}

function renderStandardListItem(item) {
  if (state.tab === 'gallery') return renderGalleryListItem(item);
  if (state.tab === 'partner-fleets') return renderPartnerFleetListItem(item);
  if (state.tab === 'leadership') return renderLeaderListItem(item);
  const pin = state.tab === 'notices' && item.pinned ? '\uace0\uc815' : '';
  const meta = [item.date || item.dateLabel || item.type || '', pin, item.published === false ? '\ucd08\uc548' : '\uac8c\uc2dc']
    .filter(Boolean)
    .join(' - ');
  return `<button class="item-button${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(meta)}</span></button>`;
}


function renderLeaderListItem(item) {
  const meta = [item.role || '', item.published === false ? '초안' : '게시'].filter(Boolean).join(' - ');
  return `<button class="item-button${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name || '임원')}</strong><span>${escapeHtml(meta)}</span></button>`;
}

function renderPartnerFleetListItem(item) {
  const meta = [item.region || '', item.game || '', item.focus || '', item.published === false ? '초안' : '게시']
    .filter(Boolean)
    .join(' - ');
  return `<button class="item-button${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name || '협력함대')}</strong><span>${escapeHtml(meta)}</span></button>`;
}

function renderGalleryListItem(item) {
  const thumb = item.thumb || item.src || item.imageUrl || '';
  const image = thumb ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy">` : '<span>\uc774\ubbf8\uc9c0 \uc5c6\uc74c</span>';
  const meta = [item.category || '\uae30\ud0c0', item.date || '', item.published === false ? '\ucd08\uc548' : '\uac8c\uc2dc']
    .filter(Boolean)
    .join(' - ');
  return `<button class="item-button gallery-admin-item${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><span class="gallery-admin-thumb">${image}</span><span class="gallery-admin-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(meta)}</small></span></button>`;
}

function renderShipSearch() {
  return `<label class="admin-search-label">\ud568\uc120 \uac80\uc0c9<input id="ship-admin-search" type="search" value="${escapeHtml(state.shipQuery)}" placeholder="\ud568\uc120\uba85, \uc81c\uc870\uc0ac, \uc5ed\ud560, \ud06c\uae30 \uac80\uc0c9"></label>`;
}

function renderShipList() {
  if (state.shipSourceError) return `<p class="admin-message">\ud568\uc120DB\ub97c \uc5f4 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4: ${escapeHtml(state.shipSourceError)}</p>`;
  if (!state.items.length) return '<p class="admin-message">\uac80\uc0c9 \uacb0\uacfc\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.</p>';
  return state.items.slice((state.listPage - 1) * 20, state.listPage * 20).map((item) => {
    const ship = item.merged;
    return `<button class="item-button ship-admin-item${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(ship.name)}</strong><span>${escapeHtml(ship.manufacturer || '')} - ${escapeHtml(ship.role || '')} - ${escapeHtml(ship.cargo || '0 SCU')}</span><small>${item.override ? '\ud45c\uc2dc \uc124\uc815 \uc801\uc6a9\ub428' : 'Erkul canonical'}</small>${item.override?.hidden === true ? '<span class="ship-hidden-badge">숨김</span>' : ''}</button>`;
  }).join('');
}

function renderForm(item) {
  void cleanupAbandonedUploads();
  revokeLocalPreviews();
  state.formRevision += 1;
  state.editing = item;
  state.dirty = false;
  if (state.tab === 'gallery') {
    state.galleryImageUrls = item ? [item.src || item.imageUrl || ''].filter(Boolean) : [];
    state.galleryFiles = [];
  }
  const config = CONFIG[state.tab];
  $('#form-title').textContent = `${config.title} ${item ? '\uc218\uc815' : '\uc791\uc131'}`;
  $('#editing-item-title').textContent = item ? (item.merged?.name || item.title || item.name || item.id) : '새 콘텐츠를 작성합니다.';
  $('#delete-button').hidden = !item || state.tab === 'ships';
  $('#delete-button').textContent = '\uc0ad\uc81c';
  $('#cms-form').innerHTML = state.tab === 'ships'
    ? renderShipForm(item)
    : renderCollectionForm(config, item);
  setFormMessage('');
  if (state.tab === 'notices') updateNoticePreview();
  renderList();
}

function renderCollectionForm(config, item) {
  if (state.tab === 'notices') return renderNoticeForm(item);
  const fields = config.fields.filter((field) => !field.endsWith('En')).map((field) => renderField(field, item)).join('')
    + '<details class="admin-disclosure"><summary>영어 콘텐츠 (EN)</summary><p class="admin-field-hint">영문은 영어 화면에서 표시됩니다. 비워두면 한국어 원문을 표시합니다. 상세 항목은 제목·내용 객체의 JSON 배열, 핵심 역량은 문자열 JSON 배열로 입력하세요.</p>'
    + config.fields.filter((field) => field.endsWith('En')).map((field) => renderField(field, item)).join('') + '</details>';
  return state.tab === 'gallery' ? renderGalleryUpload(item) + fields : fields;
}

// 공지 폼: 기본 정보 / 한국어(필수) / 영어(선택) 그룹으로 나누고 저장 전 미리보기를 제공한다.
// 입력 name은 기존과 동일(getFormPayload/서버 계약 무변경). EN 필드는 명시적 label·aria로 연결한다.
const NOTICE_EN_HINT_ID = 'notice-en-hint';
function renderNoticeForm(item) {
  const group = (legend, fields, hint, className = '') => `<fieldset class="admin-fieldset ${className}">
      <legend>${escapeHtml(legend)}</legend>
      ${hint || ''}
      ${fields.map((field) => renderField(field, item)).join('')}
    </fieldset>`;
  const enHint = `<p class="admin-field-hint" id="${NOTICE_EN_HINT_ID}">비워두면 한국어 공지가 그대로 표시됩니다. (선택 입력)</p>`;
  return [
    group('기본 정보', ['date', 'pinned', 'published'], '', 'notice-settings'),
    group('한국어 공지 (필수)', ['title', 'content', 'tag']),
    `<details class="admin-disclosure" id="notice-en-section"${item && (item.titleEn || item.contentEn || item.tagEn) ? ' open' : ''}>
      <summary>영어 공지 <span>선택 입력</span></summary>
      <fieldset class="admin-fieldset">
      <legend>영어 공지 (선택 입력)</legend>
      ${enHint}
      ${renderNoticeEnFields(item)}
      </fieldset>
    </details>`,
    renderNoticePreview(),
  ].join('');
}

// EN 입력 필드: 명시적 id·label·aria-describedby로 안내 문구와 연결(접근성).
function renderNoticeEnFields(item) {
  const val = (field) => escapeHtml(getItemValue(item, field) || '');
  const desc = `aria-describedby="${NOTICE_EN_HINT_ID}"`;
  return `<label for="notice-title-en">${LABELS.titleEn}
      <input type="text" id="notice-title-en" name="titleEn" value="${val('titleEn')}" ${desc}></label>
    <label for="notice-content-en">${LABELS.contentEn}
      <textarea id="notice-content-en" name="contentEn" ${desc}>${val('contentEn')}</textarea></label>
    <label for="notice-tag-en">${LABELS.tagEn}
      <input type="text" id="notice-tag-en" name="tagEn" value="${val('tagEn')}" ${desc}></label>`;
}

function renderNoticePreview() {
  return `<details class="admin-disclosure" id="notice-preview-section">
    <summary>미리보기 <span>저장 전 확인</span></summary>
    <fieldset class="admin-fieldset notice-preview-group">
      <legend>미리보기</legend>
      <p class="admin-field-hint">저장 전 공지 카드가 어떻게 보일지 확인합니다.</p>
      <div class="notice-preview-grid">
        <div class="notice-preview-col">
          <span class="notice-preview-lang">한국어</span>
          <div class="notice-preview-card" id="notice-preview-ko" aria-live="polite"></div>
        </div>
        <div class="notice-preview-col">
          <span class="notice-preview-lang">English <span class="notice-preview-fallback" id="notice-preview-en-fallback" hidden>한국어 fallback</span></span>
          <div class="notice-preview-card" id="notice-preview-en" aria-live="polite"></div>
        </div>
      </div>
    </fieldset></details>`;
}

// 폼 입력값으로 KO/EN 미리보기 카드를 즉시 갱신한다. EN이 비면 KO fallback + 상태 배지.
function updateNoticePreview() {
  if (state.tab !== 'notices') return;
  const form = $('#cms-form');
  const koCard = $('#notice-preview-ko');
  const enCard = $('#notice-preview-en');
  if (!form || !koCard || !enCard) return;
  const val = (name) => (form.elements[name]?.value || '').trim();
  const pinned = Boolean(form.elements.pinned?.checked);
  const date = val('date');
  const title = val('title');
  const content = val('content');
  const tag = val('tag') || '공지';
  const titleEn = val('titleEn');
  const contentEn = val('contentEn');
  const tagEn = val('tagEn');
  koCard.innerHTML = noticePreviewCard({ title, content, tag, date, pinned });
  enCard.innerHTML = noticePreviewCard({
    title: titleEn || title, content: contentEn || content, tag: tagEn || tag, date, pinned
  });
  const fallback = $('#notice-preview-en-fallback');
  // 세 EN 필드가 모두 채워졌을 때만 fallback 배지를 숨긴다(하나라도 비면 KO fallback 사용).
  if (fallback) fallback.hidden = Boolean(titleEn && contentEn && tagEn);
}

function noticePreviewCard({ title, content, tag, date, pinned }) {
  const excerpt = content ? content.slice(0, 120) : '(본문을 입력하세요)';
  const dateHtml = date ? `<span class="notice-preview-date">${escapeHtml(formatPreviewDate(date))}</span>` : '';
  return `<div class="notice-preview-meta">
      ${pinned ? '<span class="notice-preview-pin">고정</span>' : ''}
      <span class="notice-preview-tag">${escapeHtml(tag)}</span>
      ${dateHtml}
    </div>
    <strong class="notice-preview-title">${escapeHtml(title || '(제목을 입력하세요)')}</strong>
    <p class="notice-preview-excerpt">${escapeHtml(excerpt)}</p>`;
}

function formatPreviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, '.') : value;
}

function renderField(field, item) {
  const original = getItemValue(item, field);
  const value = Array.isArray(original) ? JSON.stringify(original, null, 2) : original;
  const label = LABELS[field] || `${LABELS[field.replace(/En$/, '')] || (field === 'detailsEn' ? '상세 항목' : '핵심 역량')} (EN)`;
  if (field === 'published' || field === 'pinned') return renderCheckbox(field, item);
  if (isImageField(field)) return renderImageField(field, value);
  if (getFieldOptions(field)) return renderSelectField(field, value);
  if (field === 'content' || field === 'contentEn' || field === 'description' || field === 'duties' || ['descriptionEn', 'dutiesEn', 'detailsEn', 'competenciesEn'].includes(field)) {
    return `<label>${label}<textarea name="${field}">${escapeHtml(value)}</textarea></label>`;
  }
  const type = field === 'eventDate' || field === 'date' ? 'date' : field === 'memberCount' || field === 'sortOrder' ? 'number' : 'text';
  return `<label>${label}<input type="${type}" name="${field}" value="${escapeHtml(value)}"></label>`;
}

function isImageField(field) {
  return (IMAGE_FIELDS[state.tab] || []).includes(field);
}

function renderImageField(field, value) {
  const url = String(value ?? '');
  return `<div class="image-field" data-image-field="${field}">
    <span class="image-field-title">${LABELS[field]}</span>
    <div class="image-field-preview" data-image-preview="${field}">${renderImagePreview(url)}</div>
    <div class="image-field-controls">
      <label class="image-upload-button">이미지 업로드<input type="file" accept="image/jpeg,image/png,image/webp" data-image-upload="${field}"></label>
      <input type="url" name="${field}" value="${escapeHtml(url)}" placeholder="업로드하거나 이미지 URL을 붙여넣으세요" data-image-url="${field}">
    </div>
    <span class="image-field-status" data-image-status="${field}" aria-live="polite"></span>
  </div>`;
}

function renderImagePreview(url) {
  return url
    ? `<img src="${escapeHtml(url)}" alt="이미지 미리보기">`
    : '<div class="image-placeholder">이미지 없음</div>';
}

function getFieldOptions(field) {
  return FIELD_OPTIONS[state.tab]?.[field] || null;
}

function renderSelectField(field, value) {
  const options = getFieldOptions(field);
  const normalized = value || options[0];
  const extra = value && !options.includes(value)
    ? `<option value="${escapeHtml(value)}" selected>\uae30\uc874\uac12: ${escapeHtml(value)}</option>`
    : '';
  return `<label>${LABELS[field]}<select name="${field}">${extra}${options.map((option) => `<option value="${escapeHtml(option)}" ${option === normalized ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>`;
}

function getItemValue(item, field) {
  if (item?.[field] !== undefined) return item[field];
  if (state.tab === 'gallery' && field === 'date') return todayDate();
  if (state.tab === 'gallery' && field === 'category') return '\uae30\ud0c0';
  if (state.tab === 'notices' && field === 'tag') return '\uacf5\uc9c0';
  if (state.tab === 'events' && field === 'type') return '\uc815\uae30\uc791\uc804';
  if (state.tab === 'events' && field === 'status') return '\uc608\uc815';
  if (state.tab === 'partner-fleets' && field === 'region') return '한국';
  if (state.tab === 'partner-fleets' && field === 'game') return 'Star Citizen';
  if (state.tab === 'partner-fleets' && field === 'sortOrder') return '0';
  if ((state.tab === 'leadership' || state.tab === 'timeline') && field === 'sortOrder') return '0';
  return '';
}

function renderCheckbox(field, item) {
  const checked = item ? item[field] !== false && item[field] !== 0 : field === 'published';
  return `<label class="check-row"><input type="checkbox" name="${field}" ${checked ? 'checked' : ''}> ${LABELS[field]}</label>`;
}

function renderGalleryUpload(item) {
  if (!state.galleryImageUrls.length && item) {
    state.galleryImageUrls = [item.src || item.imageUrl || ''].filter(Boolean);
  }
  const previews = state.galleryImageUrls.length
    ? state.galleryImageUrls.map((url) => `<img src="${escapeHtml(url)}" alt="\uac24\ub7ec\ub9ac \uc774\ubbf8\uc9c0 \ubbf8\ub9ac\ubcf4\uae30">`).join('')
    : '<div class="image-placeholder">\uc774\ubbf8\uc9c0 \uc5c6\uc74c</div>';
  const fileNames = state.galleryFiles.length
    ? state.galleryFiles.map((file) => escapeHtml(file.name)).join(', ')
    : '\uc120\ud0dd\ud55c \ud30c\uc77c \uc5c6\uc74c';
  return `<section class="gallery-upload-panel"><h3>\uc774\ubbf8\uc9c0 \uc5c5\ub85c\ub4dc</h3><p>JPG, PNG, WEBP \u00b7 \uad8c\uc7a5 \ube44\uc728 16:9 \u00b7 \uad8c\uc7a5 \ud574\uc0c1\ub3c4 1920\u00d71080 \uc774\uc0c1 \u00b7 \ud30c\uc77c\ub2f9 10MB \uc774\ud558</p><p class="upload-multi-hint" hidden>\uc5ec\ub7ec \ud30c\uc77c\uc744 \uc120\ud0dd\ud558\uba74 \uc81c\ubaa9\uc5d0 \ubc88\ud638\uac00 \uc790\ub3d9\uc73c\ub85c \ubd99\uc2b5\ub2c8\ub2e4. (\uc608: \uc81c\ubaa9 1, \uc81c\ubaa9 2)</p><div class="gallery-preview" id="gallery-preview">${previews}</div><label>\uc774\ubbf8\uc9c0 \uc120\ud0dd<input id="upload-file" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div class="upload-actions"><span id="upload-file-name">${fileNames}</span></div><div class="upload-progress" id="upload-progress" aria-live="polite"></div></section>`;
}

function renderShipForm(item) {
  if (!item) return renderShipFormEmpty();
  const ship = item.merged;
  const override = item.override || {};
  const base = item.base || {};
  const baseKo = getBaseShipKoreanName(base);
  const hidden = override.hidden === true;
  const nameFields = `<label>${LABELS.shipNameKo}<input name="nameKo" value="${escapeHtml(override.nameKo ?? '')}" placeholder="${escapeHtml(baseKo)}"></label>`
    + `<label>${LABELS.shipNameEn}<input name="name" value="${escapeHtml(override.name ?? '')}" placeholder="${escapeHtml(base.name ?? '')}"></label>`;
  const hiddenToggle = `<label class="ship-hidden-toggle"><input type="checkbox" name="hidden" ${hidden ? 'checked' : ''}> 사이트에서 숨김(삭제 상태)</label>`;
  const buttons = '<div class="ship-form-buttons">'
    + '<button type="button" class="secondary" id="reset-ship-button">원본으로 되돌리기</button>'
    + `<button type="button" class="danger" id="hide-ship-button">${hidden ? '숨김 해제' : '삭제(사이트에서 숨김)'}</button>`
    + '</div>';
  const source = `<div class="ship-canonical-note"><strong>Erkul canonical 기준</strong><span>${escapeHtml(ship.manufacturer || '-')} · ${escapeHtml(ship.role || '-')} · ${escapeHtml(ship.cargo || '-')}</span><p>사양·역할·태그·설명은 동기화 데이터에서만 갱신됩니다. 이 화면에서는 표시 이름과 공개 여부만 변경할 수 있습니다.</p></div>`;
  return `<div class="ship-readonly"><strong>${escapeHtml(ship.name)}</strong><span>ID: ${escapeHtml(ship.id)}</span></div>`
    + source + nameFields + hiddenToggle + buttons;
}

function renderShipFormEmpty() {
  return '<p class="admin-message">왼쪽 목록에서 수정할 함선을 선택하세요.</p>';
}

// 정적 volt-localization 별칭에서 현재 한글명(placeholder용)을 찾는다.
function getBaseShipKoreanName(base) {
  const aliases = window.VOLT_LOCALIZATION?.ships?.[base?.name];
  if (!Array.isArray(aliases)) return '';
  return aliases.find((alias) => /[가-힣]/.test(alias)) || '';
}

// 낙관적 잠금: 수정 시작 시점의 updatedAt을 서버에 에코해 동시 저장 충돌(409)을 감지한다.
function getExpectedUpdatedAt() {
  if (!state.editing) return undefined;
  if (state.tab === 'ships') return state.editing.override?.updatedAt ?? '';
  return state.editing.updatedAt ?? '';
}

function getFormPayload() {
  if (state.tab === 'ships') return getShipPayload();
  const payload = {};
  CONFIG[state.tab].fields.forEach((field) => {
    const input = $('#cms-form').elements[field];
    if (input) payload[field] = input.type === 'checkbox' ? input.checked : input.value.trim();
  });
  if (state.tab === 'gallery') applyGalleryPayloadDefaults(payload);
  if (state.tab === 'partner-fleets') normalizePartnerFleetPayload(payload);
  if (state.tab === 'leadership' || state.tab === 'timeline') {
    payload.sortOrder = payload.sortOrder === '' ? 0 : Number(payload.sortOrder);
  }
  return payload;
}

function normalizePartnerFleetPayload(payload) {
  payload.memberCount = payload.memberCount === '' ? '' : Number(payload.memberCount);
  payload.sortOrder = payload.sortOrder === '' ? 0 : Number(payload.sortOrder);
}

function applyGalleryPayloadDefaults(payload) {
  payload.category = payload.category || '\uae30\ud0c0';
  payload.date = payload.date || todayDate();
  payload.imageUrl = state.galleryImageUrls[0] || state.editing?.src || state.editing?.imageUrl || '';
  payload.thumbUrl = state.editing?.thumb || payload.imageUrl;
  payload.sortOrder = state.editing?.sortOrder ?? 0;
}

function getShipPayload() {
  const form = $('#cms-form');
  return {
    name: (form.elements.name?.value || '').trim() || null,
    nameKo: (form.elements.nameKo?.value || '').trim() || null,
    hidden: Boolean(form.elements.hidden?.checked)
  };
}

function validatePayload(payload) {
  // 공지 KO 필수(서버 정책과 동일). EN은 선택 — 여기서 필수화하지 않는다.
  if (state.tab === 'notices' && !payload.title) throw new Error('한국어 제목은 필수입니다.');
  if (state.tab === 'notices' && !payload.content) throw new Error('한국어 본문은 필수입니다.');
  if (state.tab === 'leadership' && !payload.name) throw new Error('이름은 필수입니다.');
  if (state.tab === 'timeline' && !payload.title) throw new Error('제목은 필수입니다.');
  if (state.tab === 'timeline' && !payload.dateLabel) throw new Error('표시 날짜는 필수입니다.');
  if (state.tab === 'gallery' && !payload.title) throw new Error('\uac24\ub7ec\ub9ac \uc81c\ubaa9\uc740 \ud544\uc218\uc785\ub2c8\ub2e4.');
  if (state.tab === 'gallery' && !payload.imageUrl) throw new Error('\uac24\ub7ec\ub9ac \uc774\ubbf8\uc9c0\ub97c \uc5c5\ub85c\ub4dc\ud558\uac70\ub098 \uae30\uc874 \uc774\ubbf8\uc9c0\ub97c \uc120\ud0dd\ud574\uc57c \ud569\ub2c8\ub2e4.');
}

function setSaveBusy(busy) {
  state.saving = busy;
  updateEditorStatus();
  const button = document.querySelector('button[type="submit"][form="cms-form"]');
  if (button) {
    button.disabled = busy;
    button.textContent = busy ? '저장 중…' : '저장';
  }
  document.querySelectorAll('#cms-form input, #cms-form textarea, #cms-form select, #cms-form button, [data-tab], #new-button, #cancel-button, #delete-button, #logout-button, #cms-search, #list-prev, #list-next, .admin-tools button, .workspace-switch button').forEach((control) => {
    control.disabled = busy;
  });
  $('#item-list').inert = busy;
  if (!busy) updateListPagination();
}

async function saveItem(event) {
  event.preventDefault();
  if (state.saving) return;
  if (state.pendingUploads) {
    setFormMessage('이미지 업로드가 끝난 뒤 저장해 주세요.', 'error');
    return;
  }
  setSaveBusy(true);
  try {
    if (state.tab === 'gallery' && state.galleryFiles.length) {
      await saveGalleryWithUploads();
      return;
    }
    const payload = getFormPayload();
    validatePayload(payload);
    const expectedUpdatedAt = getExpectedUpdatedAt();
    if (expectedUpdatedAt !== undefined) payload.expectedUpdatedAt = expectedUpdatedAt;
    const previousEditingId = state.editing?.id;
    const result = await savePayload(payload);
    releaseSavedUploads(payload);
    if (state.tab === 'ships') state.shipOverridesLoaded = false;
    await loadItems(false);
    const savedId = result?.item?.id || result?.item?.shipId || previousEditingId;
    if (savedId) {
      const saved = state.items.find((item) => item.id === savedId || item.shipId === savedId);
      if (saved) renderForm(saved);
    }
    setFormMessage('\uc800\uc7a5\ud588\uc2b5\ub2c8\ub2e4.');
    state.dirty = false;
  } catch (error) {
    if (error.status === 409) {
      // 동시 저장 충돌: 작성 내용은 폼에 그대로 유지된다. 안내만 표시.
      setFormMessage(error.message, 'error');
    } else {
      showFormError(error);
    }
  } finally {
    setSaveBusy(false);
  }
}

async function savePayload(payload, tab = state.tab, editing = state.editing) {
  const config = CONFIG[tab];
  const method = editing ? 'PUT' : 'POST';
  const url = editing ? `${config.endpoint}/${encodeURIComponent(editing.id)}` : config.endpoint;
  return await api(url, { method, body: JSON.stringify(payload) });
}

async function saveGalleryWithUploads() {
  const basePayload = getFormPayload();
  if (!basePayload.title) throw new Error('\uac24\ub7ec\ub9ac \uc81c\ubaa9\uc740 \ud544\uc218\uc785\ub2c8\ub2e4.');
  const editing = state.editing;
  const files = [...state.galleryFiles];
  if (editing && files.length > 1) throw new Error('기존 갤러리 항목을 수정할 때는 이미지 한 장만 선택해 주세요.');
  const progress = $('#upload-progress');
  const results = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const uploaded = [];
    try {
      progress.textContent = `${index + 1}/${files.length} 업로드 중: ${file.name}`;
      const original = await uploadAsset(file);
      uploaded.push(original);
      let thumbnail = original;
      const thumbnailFile = await makeGalleryThumbnail(file);
      if (thumbnailFile) {
        thumbnail = await uploadAsset(thumbnailFile);
        uploaded.push(thumbnail);
      }
      const payload = buildGalleryPayloadForFile(basePayload, original.imageUrl, thumbnail.imageUrl, file, editing);
      if (editing) payload.expectedUpdatedAt = editing.updatedAt ?? '';
      const saved = await savePayload(payload, 'gallery', editing);
      results.push({ file, ok: true, item: saved.item });
    } catch (error) {
      const cleanupErrors = await cleanupUploadedAssets(uploaded);
      results.push({ file, ok: false, error: error.message, cleanupErrors });
    }
  }
  const success = results.filter((item) => item.ok).length;
  const failures = results.filter((item) => !item.ok);
  setGalleryFiles(failures.map((item) => item.file));
  if (success) {
    await loadItems(false);
    if (!failures.length) {
      const saved = editing && state.items.find((item) => item.id === editing.id);
      renderForm(saved || null);
    }
  }
  state.dirty = failures.length > 0;
  const failureDetails = failures.map((item) => `${item.file.name}: ${item.error}`).join(' / ');
  const cleanupFailed = failures.some((item) => item.cleanupErrors.length);
  setFormMessage(`업로드 결과: 성공 ${success}건, 실패 ${failures.length}건.${failures.length ? ` 실패한 파일은 선택 상태로 남아 있습니다. ${failureDetails}` : ''}${cleanupFailed ? ' 실패한 항목의 이미지 정리에도 실패했습니다. 관리자에게 문의해 주세요.' : ''}`, failures.length ? 'error' : 'success');
  if (progress) progress.textContent = '';
}

function buildGalleryPayloadForFile(basePayload, imageUrl, thumbUrl, file, editing) {
  const title = !editing && galleryBatchSize > 1 ? `${basePayload.title} ${galleryFileNumbers.get(file)}` : basePayload.title;
  return { ...basePayload, title, imageUrl, thumbUrl, sortOrder: editing?.sortOrder ?? 0 };
}

async function cleanupUploadedAssets(assets) {
  const failures = [];
  for (const asset of assets) {
    try {
      await api('/api/admin/upload', { method: 'DELETE', body: JSON.stringify({ key: asset.key }) });
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

function releaseSavedUploads(payload) {
  const savedUrls = new Set(Object.values(payload));
  for (const [key, url] of state.unsavedUploads) {
    if (savedUrls.has(url)) state.unsavedUploads.delete(key);
  }
}

async function cleanupAbandonedUploads() {
  const pending = [...state.unsavedUploads.keys()];
  for (const key of pending) {
    try {
      await api('/api/admin/upload', { method: 'DELETE', body: JSON.stringify({ key }) });
      state.unsavedUploads.delete(key);
    } catch {
      // 연결 오류가 나면 키를 보존해 다음 이동·로그아웃 시 다시 정리한다.
    }
  }
}

async function makeGalleryThumbnail(file, { strict = false } = {}) {
  let image;
  try {
    // Decode the file directly: blob: image URLs are blocked by our CSP.
    image = await createImageBitmap(file);
    const scale = Math.min(1, 640 / image.width, 640 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
    if (!blob || blob.type !== 'image/webp') throw new Error('WebP conversion failed');
    if (blob.size >= file.size) return null;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-thumb.webp`, { type: 'image/webp' });
  } catch {
    if (strict) throw new Error('이미지를 썸네일로 변환하지 못했습니다. 원본은 그대로 보존했습니다.');
    return null;
  } finally {
    image?.close();
  }
}

async function deleteItem() {
  if (state.saving || state.pendingUploads) return;
  if (!state.editing || !confirm('\uc774 \ud56d\ubaa9\uc744 \uc0ad\uc81c\ud560\uae4c\uc694?')) return;
  const editing = state.editing;
  setSaveBusy(true);
  try {
    await api(`${CONFIG[state.tab].endpoint}/${encodeURIComponent(editing.id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ expectedUpdatedAt: editing.updatedAt ?? '' })
    });
    state.editing = null;
    await loadItems();
    setFormMessage('삭제했습니다.');
  } catch (error) {
    showFormError(error);
  } finally {
    setSaveBusy(false);
  }
}

async function resetShipOverride() {
  if (state.saving || state.pendingUploads) return;
  if (!state.editing || !confirm('\uc774 \ud568\uc120\uc758 \uc218\uc815\uac12\uc744 \uc0ad\uc81c\ud558\uace0 \uc6d0\ubcf8\uc73c\ub85c \ub418\ub3cc\ub9b4\uae4c\uc694?')) return;
  setSaveBusy(true);
  try {
    await api(`${CONFIG.ships.endpoint}/${encodeURIComponent(state.editing.id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ expectedUpdatedAt: state.editing.override?.updatedAt ?? '' })
    });
    state.shipOverridesLoaded = false;
    await loadItems();
    setFormMessage('원본으로 되돌렸습니다.');
  } catch (error) {
    showFormError(error);
  } finally {
    setSaveBusy(false);
  }
}

async function uploadAsset(file) {
  validateImageFile(file);
  const body = new FormData();
  body.append('file', file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch('/api/admin/upload', { method: 'POST', body, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('업로드 시간이 초과됐습니다. 다시 시도해 주세요.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '\uc5c5\ub85c\ub4dc\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.');
  if (!result.imageUrl || !result.key) throw new Error('업로드 응답에 이미지 주소가 없습니다.');
  return result;
}

function validateImageFile(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error(`${file.name}: JPG, PNG, WEBP \ud30c\uc77c\ub9cc \uc5c5\ub85c\ub4dc\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.`);
  if (file.size > GALLERY_MAX_SIZE) throw new Error(`${file.name}: 10MB \uc774\ud558 \uc774\ubbf8\uc9c0\ub97c \uad8c\uc7a5\ud569\ub2c8\ub2e4.`);
}

function todayDate() {
  // 대한민국은 연중 UTC+9이므로 UTC 자정 근처에서도 현지 날짜를 고른다.
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function showFormError(error) {
  setFormMessage(error.message || '\ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.', 'error');
}

function setFormMessage(message, tone = 'success') {
  const node = $('#form-message');
  node.textContent = message;
  node.dataset.tone = message ? tone : '';
  updateEditorStatus();
}

function updateEditorStatus() {
  const badge = $('#editor-status');
  if (!badge) return;
  const message = $('#form-message');
  const tone = state.saving ? 'busy' : state.pendingUploads ? 'busy' : message?.dataset.tone === 'error' ? 'error' : state.dirty ? 'dirty' : message?.textContent ? 'success' : 'idle';
  badge.dataset.tone = tone;
  badge.textContent = ({ busy: state.pendingUploads ? '이미지 업로드 중' : '처리 중', error: '확인 필요', dirty: '저장하지 않은 변경', success: '작업 완료', idle: state.editing ? '저장된 콘텐츠' : '새 콘텐츠' })[tone];
}

function bindEvents() {
  $('#login-form').addEventListener('submit', login);
  $('#discord-login-button').addEventListener('click', () => loginWithDiscord());
  $('#discord-switch-button').addEventListener('click', () => loginWithDiscord());
  $('#logout-button').addEventListener('click', logout);
  $('#erkul-sync-preview-button')?.addEventListener('click', runErkulSyncPreview);
  $('#new-button').addEventListener('click', () => { if (!state.saving && !state.pendingUploads && confirmDiscard()) renderForm(null); });
  $('#cancel-button').addEventListener('click', () => { if (!state.saving && !state.pendingUploads && confirmDiscard()) renderForm(null); });
  $('#cms-form').addEventListener('input', () => { state.dirty = true; state.formRevision += 1; setFormMessage(''); updateEditorStatus(); updateNoticePreview(); });
  $('#delete-button').addEventListener('click', deleteItem);
  $('#cms-form').addEventListener('submit', saveItem);
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });
  $('#item-list').addEventListener('input', handleListInput);
  $('#item-list').addEventListener('click', handleListClick);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('change', handleDocumentChange);
  document.addEventListener('input', handleDocumentInput);
  // 저장하지 않은 변경이 있으면 새로고침/창 닫기 시 브라우저 기본 경고를 띄운다.
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function handleDocumentInput(event) {
  const urlField = event.target?.dataset?.imageUrl;
  if (!urlField) return;
  updateImagePreview(urlField, event.target.value.trim());
}

async function handleImageFieldUpload(input) {
  const field = input.dataset.imageUpload;
  const file = input.files?.[0];
  if (!file) return;
  const status = document.querySelector(`[data-image-status="${field}"]`);
  const urlInput = document.querySelector(`[data-image-url="${field}"]`);
  state.pendingUploads += 1;
  updateEditorStatus();
  state.dirty = true;
  updateEditorStatus();
  state.formRevision += 1;
  try {
    if (status) status.textContent = '업로드 중…';
    const asset = await uploadAsset(file);
    const imageUrl = asset.imageUrl;
    if (urlInput?.isConnected && input.isConnected) {
      state.unsavedUploads.set(asset.key, imageUrl);
      urlInput.value = imageUrl;
      updateImagePreview(field, imageUrl);
      state.formRevision += 1;
    } else {
      await cleanupUploadedAssets([asset]);
    }
    if (status) status.textContent = '업로드 완료';
  } catch (error) {
    if (status) status.textContent = error.message || '업로드에 실패했습니다.';
  } finally {
    state.pendingUploads -= 1;
    updateEditorStatus();
    input.value = '';
  }
}

function updateImagePreview(field, url) {
  const preview = document.querySelector(`[data-image-preview="${field}"]`);
  if (preview) preview.innerHTML = renderImagePreview(url);
}

function handleListInput(event) {
  if (event.target?.id !== 'ship-admin-search') return;
  state.shipQuery = event.target.value.trim().toLowerCase();
  state.listPage = 1;
  clearTimeout(shipSearchTimer);
  shipSearchTimer = setTimeout(() => {
    // 검색 중에는 편집 중인 폼을 유지한다(clearForm=false).
    loadItems(false).catch(showFormError);
  }, SHIP_SEARCH_DELAY_MS);
}

function handleListClick(event) {
  if (state.saving || state.pendingUploads) return;
  const button = event.target.closest('[data-id]');
  if (!button) return;
  if (!confirmDiscard()) return;
  renderForm(state.items.find((item) => item.id === button.dataset.id));
  if (window.innerWidth <= 860) $('.admin-form-card').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

async function handleDocumentClick(event) {
  if (event.target?.id === 'reset-ship-button') resetShipOverride().catch(showFormError);
  if (event.target?.id === 'hide-ship-button') toggleShipHidden().catch(showFormError);
}

// 함선 숨김/해제: hidden 체크박스를 뒤집고 저장을 트리거한다(단일 소스 = 체크박스).
async function toggleShipHidden() {
  const box = $('#cms-form')?.elements?.hidden;
  if (!box) return;
  const willHide = !box.checked;
  const message = willHide
    ? '이 함선을 사이트에서 숨길까요? 목록·검색·무역플래너에서 제외됩니다.'
    : '이 함선의 숨김을 해제할까요?';
  if (!confirm(message)) return;
  box.checked = willHide;
  document.querySelector('button[type="submit"][form="cms-form"]')?.click();
}

function handleDocumentChange(event) {
  if (event.target?.dataset?.imageUpload) {
    handleImageFieldUpload(event.target);
    return;
  }
  if (event.target?.id !== 'upload-file') return;
  const files = Array.from(event.target.files || []);
  galleryFileNumbers = new WeakMap();
  galleryBatchSize = files.length;
  files.forEach((file, index) => { galleryFileNumbers.set(file, index + 1); });
  setGalleryFiles(files);
  state.galleryImageUrls = [];
  state.dirty = true;
  state.formRevision += 1;
}

function setGalleryFiles(files) {
  state.galleryFiles = files;
  const input = $('#upload-file');
  if (input) input.value = '';
  const name = $('#upload-file-name');
  if (name) {
    name.textContent = state.galleryFiles.length
      ? state.galleryFiles.map((file) => file.name).join(', ')
      : '\uc120\ud0dd\ud55c \ud30c\uc77c \uc5c6\uc74c';
  }
  const hint = document.querySelector('.upload-multi-hint');
  if (hint) hint.hidden = state.galleryFiles.length < 2;
  renderLocalPreviews(state.galleryFiles);
}

let galleryPreviewGeneration = 0;
function revokeLocalPreviews() {
  galleryPreviewGeneration += 1;
  document.querySelectorAll('#gallery-preview img[data-object-url]').forEach((img) => {
    URL.revokeObjectURL(img.src);
  });
}

async function renderLocalPreviews(files) {
  const preview = $('#gallery-preview');
  if (!preview) return;
  revokeLocalPreviews();
  const generation = galleryPreviewGeneration;
  if (!files.length) {
    preview.innerHTML = '<div class="image-placeholder">\uc774\ubbf8\uc9c0 \uc5c6\uc74c</div>';
    return;
  }
  preview.replaceChildren();
  for (const file of files) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      if (generation !== galleryPreviewGeneration) return;
      const scale = Math.min(1, 640 / bitmap.width, 640 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = document.createElement('img');
      image.src = canvas.toDataURL('image/webp', 0.78);
      image.alt = file.name;
      image.title = file.name;
      preview.append(image);
    } catch {
      if (generation !== galleryPreviewGeneration) return;
      const unavailable = document.createElement('div');
      unavailable.className = 'image-placeholder';
      unavailable.textContent = `${file.name}: 미리보기를 만들 수 없습니다.`;
      preview.append(unavailable);
    } finally { bitmap?.close(); }
  }
}

bindEvents();
async function initializeAdminSession() {
  const url = new URL(window.location.href);
  if (url.searchParams.get('discord') === '1') {
    url.searchParams.delete('discord');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    await checkSession();
    await loginWithDiscord({ redirect: false });
  } else await checkSession();
}

initializeAdminSession().catch((error) => {
  $('#login-message').textContent = error.message;
});
