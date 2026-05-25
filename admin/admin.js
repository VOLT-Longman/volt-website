const state = {
  tab: 'notices',
  items: [],
  editing: null,
  galleryImageUrls: [],
  galleryFiles: [],
  shipOverrides: new Map(),
  shipQuery: ''
};

const NOTICE_TAGS = ['공지', '중요', '업데이트', '이벤트', '작전', '시스템', '모집'];
const EVENT_TYPES = ['정기작전', '합동작전', '이벤트', '회의', '훈련', '점검', '기타'];
const EVENT_STATUSES = ['예정', '진행중', '완료', '취소', '연기'];
const GALLERY_CATEGORIES = ['작전', '함선', '풍경', '이벤트', '기타'];
const GALLERY_MAX_SIZE = 10 * 1024 * 1024;
const SHIP_EDIT_FIELDS = ['manufacturer', 'role', 'focus', 'size', 'crew', 'cargo', 'priceUsd', 'implemented', 'plannerEligible', 'tags', 'description'];

const CONFIG = {
  notices: { title: '공지', endpoint: '/api/admin/notices', fields: ['title', 'content', 'tag', 'date', 'pinned', 'published'] },
  events: { title: '일정', endpoint: '/api/admin/events', fields: ['title', 'description', 'type', 'status', 'dateLabel', 'eventDate', 'published'] },
  gallery: { title: '갤러리', endpoint: '/api/admin/gallery', fields: ['title', 'description', 'category', 'date', 'published'] },
  ships: { title: '함선DB', endpoint: '/api/admin/ships', fields: SHIP_EDIT_FIELDS }
};

const FIELD_OPTIONS = {
  notices: { tag: NOTICE_TAGS },
  events: { type: EVENT_TYPES, status: EVENT_STATUSES },
  gallery: { category: GALLERY_CATEGORIES }
};

const LABELS = {
  title: '제목', content: '내용', tag: '태그', date: '날짜', pinned: '고정', published: '게시',
  description: '설명', type: '유형', status: '상태', dateLabel: '표시 날짜', eventDate: '실제 날짜',
  category: '카테고리', manufacturer: '제조사', role: '역할', focus: '주 역할', size: '크기',
  crew: '승무원', cargo: '화물량', priceUsd: '가격(USD)', implemented: '구현 여부',
  plannerEligible: '무역플래너 노출', tags: '태그'
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data;
}

async function checkSession() {
  const session = await api('/api/admin/session');
  $('#login-panel').hidden = session.authenticated;
  $('#dashboard').hidden = !session.authenticated;
  if (session.authenticated) await loadItems();
}

async function login(event) {
  event.preventDefault();
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#login-password').value }) });
    $('#login-password').value = '';
    $('#login-message').textContent = '';
    await checkSession();
  } catch (error) {
    $('#login-message').textContent = error.message;
  }
}

async function logout() {
  await api('/api/admin/logout', { method: 'POST' });
  state.items = [];
  state.editing = null;
  await checkSession();
}

function setTab(tab) {
  state.tab = tab;
  state.editing = null;
  state.galleryImageUrls = [];
  state.galleryFiles = [];
  document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  loadItems().catch(showFormError);
}

async function loadItems() {
  const config = CONFIG[state.tab];
  $('#list-title').textContent = `${config.title} 목록`;
  $('#form-title').textContent = `${config.title} 작성`;
  state.items = state.tab === 'ships' ? await loadShipItems() : (await api(config.endpoint)).items || [];
  renderList();
  renderForm(null);
}

async function loadShipItems() {
  const ships = (window.VOLT_DATA?.ships || []).map((ship) => ({ base: ship, override: null, merged: { ...ship } }));
  const payload = await api('/api/ship-overrides').catch(() => ({ items: [] }));
  state.shipOverrides = new Map((payload.items || []).map((item) => [item.shipId, item]));
  return ships.map((item) => mergeShipItem(item.base, state.shipOverrides.get(item.base.id))).filter(matchShipQuery);
}

function mergeShipItem(base, override) {
  const merged = { ...base };
  if (override) {
    Object.entries(override).forEach(([key, value]) => {
      if (['id', 'shipId', 'updatedAt'].includes(key)) return;
      if (value !== null && value !== undefined && value !== '') merged[key] = value;
    });
  }
  return { id: base.id, title: base.name, base, override: override || null, merged };
}

function matchShipQuery(item) {
  if (!state.shipQuery) return true;
  const ship = item.merged;
  const tags = Array.isArray(ship.tags) ? ship.tags.join(' ') : '';
  return [ship.name, ship.manufacturer, ship.role, ship.focus, tags].join(' ').toLowerCase().includes(state.shipQuery);
}

function renderList() {
  const list = $('#item-list');
  if (state.tab === 'ships') {
    list.innerHTML = renderShipSearch() + renderShipList();
    return;
  }
  list.innerHTML = state.items.length ? state.items.map(renderStandardListItem).join('') : '<p class="admin-message">등록된 항목이 없습니다.</p>';
}

function renderStandardListItem(item) {
  if (state.tab === 'gallery') return renderGalleryListItem(item);
  const meta = [item.date || item.dateLabel || item.type || '', item.published === false ? '비공개' : '게시'].filter(Boolean).join(' · ');
  return `<button class="item-button${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(meta)}</span></button>`;
}

function renderGalleryListItem(item) {
  const thumb = item.thumb || item.src || item.imageUrl || '';
  const image = thumb ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy">` : '<span>이미지 없음</span>';
  const meta = [item.category || '기타', item.date || '', item.published === false ? '비공개' : '게시'].filter(Boolean).join(' · ');
  return `<button class="item-button gallery-admin-item${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><span class="gallery-admin-thumb">${image}</span><span class="gallery-admin-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(meta)}</small></span></button>`;
}

function renderShipSearch() {
  return `<label class="admin-search-label">함선 검색<input id="ship-admin-search" type="search" value="${escapeHtml(state.shipQuery)}" placeholder="함선명, 제조사, 역할, 태그 검색"></label>`;
}

function renderShipList() {
  if (!state.items.length) return '<p class="admin-message">검색 결과가 없습니다.</p>';
  return state.items.map((item) => {
    const ship = item.merged;
    return `<button class="item-button ship-admin-item${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(ship.name)}</strong><span>${escapeHtml(ship.manufacturer || '')} · ${escapeHtml(ship.focus || ship.role || '')} · ${escapeHtml(ship.cargo || '0 SCU')}</span><small>${item.override ? '수정값 적용됨' : '원본'}</small></button>`;
  }).join('');
}

function renderForm(item) {
  state.editing = item;
  if (state.tab === 'gallery' && !item) {
    state.galleryImageUrls = [];
    state.galleryFiles = [];
  }
  const config = CONFIG[state.tab];
  $('#form-title').textContent = `${config.title} ${item ? '수정' : '작성'}`;
  $('#delete-button').hidden = !item || state.tab === 'ships';
  $('#delete-button').textContent = '삭제';
  $('#cms-form').innerHTML = state.tab === 'ships' ? renderShipForm(item) : renderCollectionForm(config, item);
  $('#form-message').textContent = '';
  renderList();
}

function renderCollectionForm(config, item) {
  const fields = config.fields.map((field) => renderField(field, item)).join('');
  return state.tab === 'gallery' ? renderGalleryUpload(item) + fields : fields;
}

function renderField(field, item) {
  const value = getItemValue(item, field);
  if (field === 'published' || field === 'pinned') return renderCheckbox(field, item);
  if (getFieldOptions(field)) return renderSelectField(field, value);
  if (field === 'content' || field === 'description') return `<label>${LABELS[field]}<textarea name="${field}">${escapeHtml(value)}</textarea></label>`;
  const type = field === 'eventDate' || field === 'date' ? 'date' : 'text';
  return `<label>${LABELS[field]}<input type="${type}" name="${field}" value="${escapeHtml(value)}"></label>`;
}

function getFieldOptions(field) {
  return FIELD_OPTIONS[state.tab]?.[field] || null;
}

function renderSelectField(field, value) {
  const options = getFieldOptions(field);
  const normalized = options.includes(value) ? value : options[0];
  const extra = value && !options.includes(value) ? `<option value="${escapeHtml(value)}" selected>기존값: ${escapeHtml(value)}</option>` : '';
  return `<label>${LABELS[field]}<select name="${field}">${extra}${options.map((option) => `<option value="${escapeHtml(option)}" ${option === normalized ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>`;
}

function getItemValue(item, field) {
  if (item?.[field] !== undefined) return item[field];
  if (state.tab === 'gallery' && field === 'date') return todayDate();
  if (state.tab === 'gallery' && field === 'category') return '기타';
  if (state.tab === 'notices' && field === 'tag') return '공지';
  if (state.tab === 'events' && field === 'type') return '정기작전';
  if (state.tab === 'events' && field === 'status') return '예정';
  return '';
}

function renderCheckbox(field, item) {
  const checked = item ? item[field] !== false && item[field] !== 0 : field === 'published';
  return `<label class="check-row"><input type="checkbox" name="${field}" ${checked ? 'checked' : ''}> ${LABELS[field]}</label>`;
}

function renderGalleryUpload(item) {
  if (!state.galleryImageUrls.length && item) state.galleryImageUrls = [item.src || item.imageUrl || ''].filter(Boolean);
  const previews = state.galleryImageUrls.length ? state.galleryImageUrls.map((url) => `<img src="${escapeHtml(url)}" alt="갤러리 이미지 미리보기">`).join('') : '<div class="image-placeholder">이미지 없음</div>';
  const fileNames = state.galleryFiles.length ? state.galleryFiles.map((file) => escapeHtml(file.name)).join(', ') : '선택된 파일 없음';
  return `<section class="gallery-upload-panel"><h3>이미지 업로드</h3><p>JPG, PNG, WEBP · 권장 비율 16:9 · 권장 해상도 1920×1080 이상 · 파일당 10MB 이하 권장</p><div class="gallery-preview" id="gallery-preview">${previews}</div><label>이미지 선택<input id="upload-file" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div class="upload-actions"><span id="upload-file-name">${fileNames}</span></div><div class="upload-progress" id="upload-progress" aria-live="polite"></div></section>`;
}

function renderShipForm(item) {
  if (!item) return '<p class="admin-message">왼쪽 목록에서 수정할 함선을 선택하세요.</p>';
  const ship = item.merged;
  return `<div class="ship-readonly"><strong>${escapeHtml(ship.name)}</strong><span>ID: ${escapeHtml(ship.id)}</span></div>${SHIP_EDIT_FIELDS.map((field) => renderShipField(field, item)).join('')}<button type="button" class="secondary" id="reset-ship-button">원본으로 되돌리기</button>`;
}

function renderShipField(field, item) {
  const override = item.override || {};
  const base = item.base || {};
  const value = field === 'tags' ? normalizeTags(override.tags).join(', ') : override[field] ?? '';
  const placeholder = field === 'tags' ? normalizeTags(base.tags).join(', ') : base[field] ?? '';
  if (field === 'description') return `<label>${LABELS[field]}<textarea name="${field}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea></label>`;
  if (field === 'implemented' || field === 'plannerEligible') return renderShipTriState(field, value);
  return `<label>${LABELS[field]}<input name="${field}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"></label>`;
}

function renderShipTriState(field, value) {
  return `<label>${LABELS[field]}<select name="${field}"><option value="" ${value === '' || value === null || value === undefined ? 'selected' : ''}>원본 유지</option><option value="true" ${value === true ? 'selected' : ''}>true</option><option value="false" ${value === false ? 'selected' : ''}>false</option></select></label>`;
}

function getFormPayload() {
  if (state.tab === 'ships') return getShipPayload();
  const payload = {};
  CONFIG[state.tab].fields.forEach((field) => {
    const input = $('#cms-form').elements[field];
    if (input) payload[field] = input.type === 'checkbox' ? input.checked : input.value.trim();
  });
  if (state.tab === 'gallery') applyGalleryPayloadDefaults(payload);
  return payload;
}

function applyGalleryPayloadDefaults(payload) {
  payload.category = payload.category || '기타';
  payload.date = payload.date || todayDate();
  payload.imageUrl = state.galleryImageUrls[0] || state.editing?.src || state.editing?.imageUrl || '';
  payload.thumbUrl = payload.imageUrl;
  payload.sortOrder = state.editing?.sortOrder ?? 0;
}

function getShipPayload() {
  const form = $('#cms-form');
  const payload = {};
  SHIP_EDIT_FIELDS.forEach((field) => {
    const input = form.elements[field];
    if (!input) return;
    const value = input.value.trim();
    if (field === 'tags') payload[field] = value ? value.split(',').map((tag) => tag.trim()).filter(Boolean) : null;
    else if (field === 'priceUsd') payload[field] = value ? Number(value) : null;
    else if (field === 'implemented' || field === 'plannerEligible') payload[field] = value === '' ? null : value === 'true';
    else payload[field] = value || null;
  });
  return payload;
}

function validatePayload(payload) {
  if (state.tab === 'gallery' && !payload.title) throw new Error('갤러리 제목은 필수입니다.');
  if (state.tab === 'gallery' && !payload.imageUrl) throw new Error('갤러리 이미지를 업로드하거나 기존 이미지를 유지해야 합니다.');
  if (state.tab === 'ships' && payload.priceUsd !== null && !Number.isFinite(payload.priceUsd)) throw new Error('가격은 숫자만 입력할 수 있습니다.');
}

async function saveItem(event) {
  event.preventDefault();
  try {
    if (state.tab === 'gallery' && state.galleryFiles.length) {
      await saveGalleryWithUploads();
      return;
    }
    const payload = getFormPayload();
    validatePayload(payload);
    await savePayload(payload);
    $('#form-message').textContent = '저장했습니다.';
    await loadItems();
  } catch (error) {
    showFormError(error);
  }
}

async function savePayload(payload) {
  const config = CONFIG[state.tab];
  const method = state.editing ? 'PUT' : 'POST';
  const url = state.tab === 'ships' ? `${config.endpoint}/${encodeURIComponent(state.editing.id)}` : state.editing ? `${config.endpoint}/${encodeURIComponent(state.editing.id)}` : config.endpoint;
  await api(url, { method, body: JSON.stringify(payload) });
}

async function saveGalleryWithUploads() {
  const basePayload = getFormPayload();
  if (!basePayload.title) throw new Error('갤러리 제목은 필수입니다.');
  const progress = $('#upload-progress');
  const results = [];
  for (let index = 0; index < state.galleryFiles.length; index += 1) {
    const file = state.galleryFiles[index];
    try {
      progress.textContent = `${index + 1}/${state.galleryFiles.length} 업로드 중: ${file.name}`;
      const imageUrl = await uploadFile(file);
      const payload = buildGalleryPayloadForFile(basePayload, imageUrl, index);
      await api(CONFIG.gallery.endpoint, { method: 'POST', body: JSON.stringify(payload) });
      results.push({ file: file.name, ok: true });
    } catch (error) {
      results.push({ file: file.name, ok: false, error: error.message });
    }
  }
  const success = results.filter((item) => item.ok).length;
  const failed = results.length - success;
  $('#form-message').textContent = `업로드 완료: 성공 ${success}건${failed ? `, 실패 ${failed}건` : ''}`;
  state.galleryFiles = [];
  state.galleryImageUrls = [];
  await loadItems();
}

function buildGalleryPayloadForFile(basePayload, imageUrl, index) {
  const total = state.galleryFiles.length;
  const title = total > 1 ? `${basePayload.title} ${index + 1}` : basePayload.title;
  return { ...basePayload, title, imageUrl, thumbUrl: imageUrl, sortOrder: 0 };
}

async function deleteItem() {
  if (!state.editing || !confirm('정말 삭제할까요?')) return;
  await api(`${CONFIG[state.tab].endpoint}/${encodeURIComponent(state.editing.id)}`, { method: 'DELETE' });
  state.editing = null;
  await loadItems();
}

async function resetShipOverride() {
  if (!state.editing || !confirm('이 함선의 관리자 수정값을 삭제하고 원본으로 되돌릴까요?')) return;
  await api(`${CONFIG.ships.endpoint}/${encodeURIComponent(state.editing.id)}`, { method: 'DELETE' });
  await loadItems();
}

async function uploadFile(file) {
  validateImageFile(file);
  const body = new FormData();
  body.append('file', file);
  const response = await fetch('/api/admin/upload', { method: 'POST', body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '업로드에 실패했습니다.');
  return result.imageUrl;
}

function validateImageFile(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error(`${file.name}: JPG, PNG, WEBP 파일만 업로드할 수 있습니다.`);
  if (file.size > GALLERY_MAX_SIZE) throw new Error(`${file.name}: 10MB 이하 이미지를 권장합니다.`);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try { const parsed = JSON.parse(tags); return Array.isArray(parsed) ? parsed : []; } catch (_error) { return tags.split(',').map((tag) => tag.trim()).filter(Boolean); }
  }
  return [];
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function showFormError(error) {
  $('#form-message').textContent = error.message || '처리 중 오류가 발생했습니다.';
}

function bindEvents() {
  $('#login-form').addEventListener('submit', login);
  $('#logout-button').addEventListener('click', logout);
  $('#new-button').addEventListener('click', () => renderForm(null));
  $('#cancel-button').addEventListener('click', () => renderForm(null));
  $('#delete-button').addEventListener('click', deleteItem);
  $('#cms-form').addEventListener('submit', saveItem);
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));
  $('#item-list').addEventListener('input', handleListInput);
  $('#item-list').addEventListener('click', handleListClick);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('change', handleDocumentChange);
}

function handleListInput(event) {
  if (event.target?.id !== 'ship-admin-search') return;
  state.shipQuery = event.target.value.trim().toLowerCase();
  loadItems().catch(showFormError);
}

function handleListClick(event) {
  const button = event.target.closest('[data-id]');
  if (!button) return;
  renderForm(state.items.find((item) => item.id === button.dataset.id));
}

async function handleDocumentClick(event) {
  if (event.target?.id === 'reset-ship-button') resetShipOverride().catch(showFormError);
}

function handleDocumentChange(event) {
  if (event.target?.id !== 'upload-file') return;
  state.galleryFiles = Array.from(event.target.files || []);
  state.galleryImageUrls = [];
  const name = $('#upload-file-name');
  if (name) name.textContent = state.galleryFiles.length ? state.galleryFiles.map((file) => file.name).join(', ') : '선택된 파일 없음';
  renderLocalPreviews(state.galleryFiles);
}

function renderLocalPreviews(files) {
  const preview = $('#gallery-preview');
  if (!preview) return;
  if (!files.length) {
    preview.innerHTML = '<div class="image-placeholder">이미지 없음</div>';
    return;
  }
  preview.innerHTML = files.map((file) => `<div class="local-preview-item"><span>${escapeHtml(file.name)}</span></div>`).join('');
}

bindEvents();
checkSession().catch((error) => { $('#login-message').textContent = error.message; });
