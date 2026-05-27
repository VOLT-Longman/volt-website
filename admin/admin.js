const state = {
  tab: 'notices',
  items: [],
  editing: null,
  galleryImageUrls: [],
  galleryFiles: [],
  shipOverrides: new Map(),
  shipOverridesLoaded: false,
  shipQuery: ''
};

const NOTICE_TAGS = ['\uacf5\uc9c0', '\uc911\uc694', '\uc5c5\ub370\uc774\ud2b8', '\uc774\ubca4\ud2b8', '\uc791\uc804', '\uc2dc\uc2a4\ud15c', '\ubaa8\uc9d1'];
const EVENT_TYPES = ['\uc815\uae30\uc791\uc804', '\ud569\ub3d9\uc791\uc804', '\uc774\ubca4\ud2b8', '\ud68c\uc758', '\ud6c8\ub828', '\uc810\uac80', '\uae30\ud0c0'];
const EVENT_STATUSES = ['\uc608\uc815', '\uc9c4\ud589\uc911', '\uc644\ub8cc', '\ucde8\uc18c', '\uc5f0\uae30'];
const GALLERY_CATEGORIES = ['\uc791\uc804', '\ud568\uc120', '\ud48d\uacbd', '\uc774\ubca4\ud2b8', '\uae30\ud0c0'];
const GALLERY_MAX_SIZE = 10 * 1024 * 1024;
const SHIP_EDIT_FIELDS = ['manufacturer', 'role', 'focus', 'size', 'crew', 'cargo', 'priceUsd', 'implemented', 'plannerEligible', 'tags', 'description'];
const SHIP_SEARCH_DELAY_MS = 200;

let shipSearchTimer = null;

const CONFIG = {
  notices: { title: '\uacf5\uc9c0', endpoint: '/api/admin/notices', fields: ['title', 'content', 'tag', 'date', 'pinned', 'published'] },
  events: { title: '\uc77c\uc815', endpoint: '/api/admin/events', fields: ['title', 'description', 'type', 'status', 'dateLabel', 'eventDate', 'published'] },
  gallery: { title: '\uac24\ub7ec\ub9ac', endpoint: '/api/admin/gallery', fields: ['title', 'description', 'category', 'date', 'published'] },
  ships: { title: '\ud568\uc120DB', endpoint: '/api/admin/ships', fields: SHIP_EDIT_FIELDS }
};

const FIELD_OPTIONS = {
  notices: { tag: NOTICE_TAGS },
  events: { type: EVENT_TYPES, status: EVENT_STATUSES },
  gallery: { category: GALLERY_CATEGORIES }
};

const LABELS = {
  title: '\uc81c\ubaa9',
  content: '\ub0b4\uc6a9',
  tag: '\ud0dc\uadf8',
  date: '\ub0a0\uc9dc',
  pinned: '\uace0\uc815',
  published: '\uac8c\uc2dc',
  description: '\uc124\uba85',
  type: '\uc720\ud615',
  status: '\uc0c1\ud0dc',
  dateLabel: '\ud45c\uc2dc \ub0a0\uc9dc',
  eventDate: '\uc2e4\uc81c \ub0a0\uc9dc',
  category: '\uce74\ud14c\uace0\ub9ac',
  manufacturer: '\uc81c\uc870\uc0ac',
  role: '\uc5ed\ud560',
  focus: '\uc8fc \uc5ed\ud560',
  size: '\ud06c\uae30',
  crew: '\uc2b9\ubb34\uc6d0',
  cargo: '\ud654\ubb3c\ub7c9',
  priceUsd: '\uac00\uaca9(USD)',
  implemented: '\uad6c\ud604 \uc5ec\ubd80',
  plannerEligible: '\ubb34\uc5ed\ud50c\ub798\ub108 \ub178\ucd9c',
  tags: '\ud0dc\uadf8'
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
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '\uc694\uccad\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.');
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
  if (tab === 'ships') state.shipOverridesLoaded = false;
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  loadItems().catch(showFormError);
}

async function loadItems(clearForm = true) {
  const config = CONFIG[state.tab];
  $('#list-title').textContent = `${config.title} \ubaa9\ub85d`;
  $('#form-title').textContent = `${config.title} \uc791\uc131`;
  state.items = state.tab === 'ships' ? await loadShipItems() : (await api(config.endpoint)).items || [];
  renderList();
  if (clearForm) renderForm(null);
}

async function loadShipItems() {
  const ships = (window.VOLT_DATA?.ships || []).map((ship) => ({
    base: ship,
    override: null,
    merged: { ...ship }
  }));

  if (!state.shipOverridesLoaded) {
    const payload = await api(CONFIG.ships.endpoint).catch(() => ({ items: [] }));
    state.shipOverrides = new Map((payload.items || []).map((item) => [item.shipId, item]));
    state.shipOverridesLoaded = true;
  }

  return ships
    .map((item) => mergeShipItem(item.base, state.shipOverrides.get(item.base.id)))
    .filter(matchShipQuery);
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
  return [ship.name, ship.manufacturer, ship.role, ship.focus, tags]
    .join(' ')
    .toLowerCase()
    .includes(state.shipQuery);
}

function renderList() {
  const list = $('#item-list');
  if (state.tab === 'ships') {
    list.innerHTML = renderShipSearch() + renderShipList();
    return;
  }
  list.innerHTML = state.items.length
    ? state.items.map(renderStandardListItem).join('')
    : '<p class="admin-message">\ub4f1\ub85d\ub41c \ud56d\ubaa9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</p>';
}

function renderStandardListItem(item) {
  if (state.tab === 'gallery') return renderGalleryListItem(item);
  const meta = [item.date || item.dateLabel || item.type || '', item.published === false ? '\ucd08\uc548' : '\uac8c\uc2dc']
    .filter(Boolean)
    .join(' - ');
  return `<button class="item-button${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(meta)}</span></button>`;
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
  return `<label class="admin-search-label">\ud568\uc120 \uac80\uc0c9<input id="ship-admin-search" type="search" value="${escapeHtml(state.shipQuery)}" placeholder="\ud568\uc120\uba85, \uc81c\uc870\uc0ac, \uc5ed\ud560, \ud0dc\uadf8 \uac80\uc0c9"></label>`;
}

function renderShipList() {
  if (!state.items.length) return '<p class="admin-message">\uac80\uc0c9 \uacb0\uacfc\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.</p>';
  return state.items.map((item) => {
    const ship = item.merged;
    return `<button class="item-button ship-admin-item${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(ship.name)}</strong><span>${escapeHtml(ship.manufacturer || '')} - ${escapeHtml(ship.focus || ship.role || '')} - ${escapeHtml(ship.cargo || '0 SCU')}</span><small>${item.override ? '\uc218\uc815\uac12 \uc801\uc6a9\ub428' : '\uc6d0\ubcf8'}</small></button>`;
  }).join('');
}

function renderForm(item) {
  state.editing = item;
  if (state.tab === 'gallery' && !item) {
    state.galleryImageUrls = [];
    state.galleryFiles = [];
  }
  const config = CONFIG[state.tab];
  $('#form-title').textContent = `${config.title} ${item ? '\uc218\uc815' : '\uc791\uc131'}`;
  $('#delete-button').hidden = !item || state.tab === 'ships';
  $('#delete-button').textContent = '\uc0ad\uc81c';
  $('#cms-form').innerHTML = state.tab === 'ships'
    ? renderShipForm(item)
    : renderCollectionForm(config, item);
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
  if (field === 'content' || field === 'description') {
    return `<label>${LABELS[field]}<textarea name="${field}">${escapeHtml(value)}</textarea></label>`;
  }
  const type = field === 'eventDate' || field === 'date' ? 'date' : 'text';
  return `<label>${LABELS[field]}<input type="${type}" name="${field}" value="${escapeHtml(value)}"></label>`;
}

function getFieldOptions(field) {
  return FIELD_OPTIONS[state.tab]?.[field] || null;
}

function renderSelectField(field, value) {
  const options = getFieldOptions(field);
  const normalized = options.includes(value) ? value : options[0];
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
  if (!item) return '<p class="admin-message">\uc67c\ucabd \ubaa9\ub85d\uc5d0\uc11c \uc218\uc815\ud560 \ud568\uc120\uc744 \uc120\ud0dd\ud558\uc138\uc694.</p>';
  const ship = item.merged;
  return `<div class="ship-readonly"><strong>${escapeHtml(ship.name)}</strong><span>ID: ${escapeHtml(ship.id)}</span></div>${SHIP_EDIT_FIELDS.map((field) => renderShipField(field, item)).join('')}<button type="button" class="secondary" id="reset-ship-button">\uc6d0\ubcf8\uc73c\ub85c \ub418\ub3cc\ub9ac\uae30</button>`;
}

function renderShipField(field, item) {
  const override = item.override || {};
  const base = item.base || {};
  const value = field === 'tags' ? normalizeTags(override.tags).join(', ') : override[field] ?? '';
  const placeholder = field === 'tags' ? normalizeTags(base.tags).join(', ') : base[field] ?? '';
  if (field === 'tags') return renderShipTagSelector(item);
  if (field === 'description') {
    return `<label>${LABELS[field]}<textarea name="${field}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea></label>`;
  }
  if (field === 'implemented' || field === 'plannerEligible') return renderShipTriState(field, value);
  return `<label>${LABELS[field]}<input name="${field}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"></label>`;
}

function renderShipTriState(field, value) {
  return `<label>${LABELS[field]}<select name="${field}"><option value="" ${value === '' || value === null || value === undefined ? 'selected' : ''}>\uc6d0\ubcf8 \uc720\uc9c0</option><option value="true" ${value === true ? 'selected' : ''}>true</option><option value="false" ${value === false ? 'selected' : ''}>false</option></select></label>`;
}

function renderShipTagSelector(item) {
  const selectedTags = getSelectedShipTags(item);
  const options = getShipTagOptions(selectedTags);
  const checkboxes = options.map((tag) => renderShipTagOption(tag, selectedTags)).join('');
  return `<fieldset class="ship-tag-selector"><legend>${LABELS.tags}</legend><p>\uae30\uc874 \ud568\uc120DB \ud0dc\uadf8 \uc911\uc5d0\uc11c \uc120\ud0dd\ud569\ub2c8\ub2e4. \uc0c8 \ud0dc\uadf8\uac00 \ud544\uc694\ud558\uba74 \uba3c\uc800 \ub370\uc774\ud130 \uae30\uc900\uc744 \uc815\ub9ac\ud574 \uc8fc\uc138\uc694.</p><div class="ship-tag-options">${checkboxes}</div></fieldset>`;
}

function renderShipTagOption(tag, selectedTags) {
  const checked = selectedTags.includes(tag) ? 'checked' : '';
  return `<label class="ship-tag-option"><input type="checkbox" name="tags" value="${escapeHtml(tag)}" ${checked}> <span>${escapeHtml(tag)}</span></label>`;
}

function getSelectedShipTags(item) {
  const overrideTags = normalizeTags(item?.override?.tags);
  if (item?.override && Array.isArray(item.override.tags)) return overrideTags;
  return overrideTags.length ? overrideTags : normalizeTags(item?.base?.tags);
}

function getShipTagOptions(extraTags = []) {
  const tags = new Set(extraTags.filter(Boolean));
  (window.VOLT_DATA?.ships || []).forEach((ship) => normalizeTags(ship.tags).forEach((tag) => tags.add(tag)));
  state.shipOverrides.forEach((override) => normalizeTags(override.tags).forEach((tag) => tags.add(tag)));
  return [...tags].sort((left, right) => left.localeCompare(right, 'ko'));
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
  payload.category = payload.category || '\uae30\ud0c0';
  payload.date = payload.date || todayDate();
  payload.imageUrl = state.galleryImageUrls[0] || state.editing?.src || state.editing?.imageUrl || '';
  payload.thumbUrl = payload.imageUrl;
  payload.sortOrder = state.editing?.sortOrder ?? 0;
}

function getShipPayload() {
  const form = $('#cms-form');
  const payload = {};
  SHIP_EDIT_FIELDS.forEach((field) => {
    if (field === 'tags') {
      payload[field] = [...form.querySelectorAll('input[name="tags"]:checked')].map((input) => input.value);
      return;
    }
    const input = form.elements[field];
    if (!input) return;
    const value = input.value.trim();
    if (field === 'priceUsd') payload[field] = value ? Number(value) : null;
    else if (field === 'implemented' || field === 'plannerEligible') payload[field] = value === '' ? null : value === 'true';
    else payload[field] = value || null;
  });
  return payload;
}

function validatePayload(payload) {
  if (state.tab === 'gallery' && !payload.title) throw new Error('\uac24\ub7ec\ub9ac \uc81c\ubaa9\uc740 \ud544\uc218\uc785\ub2c8\ub2e4.');
  if (state.tab === 'gallery' && !payload.imageUrl) throw new Error('\uac24\ub7ec\ub9ac \uc774\ubbf8\uc9c0\ub97c \uc5c5\ub85c\ub4dc\ud558\uac70\ub098 \uae30\uc874 \uc774\ubbf8\uc9c0\ub97c \uc120\ud0dd\ud574\uc57c \ud569\ub2c8\ub2e4.');
  if (state.tab === 'ships' && payload.priceUsd !== null && !Number.isFinite(payload.priceUsd)) {
    throw new Error('\uac00\uaca9\uc740 \uc22b\uc790\ub9cc \uc785\ub825\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.');
  }
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
    const previousEditingId = state.editing?.id;
    const result = await savePayload(payload);
    if (state.tab === 'ships') state.shipOverridesLoaded = false;
    await loadItems(false);
    const savedId = result?.item?.id || result?.item?.shipId || previousEditingId;
    if (savedId) {
      const saved = state.items.find((item) => item.id === savedId || item.shipId === savedId);
      if (saved) renderForm(saved);
    }
    $('#form-message').textContent = '\uc800\uc7a5\ud588\uc2b5\ub2c8\ub2e4.';
  } catch (error) {
    showFormError(error);
  }
}

async function savePayload(payload) {
  const config = CONFIG[state.tab];
  const method = state.editing ? 'PUT' : 'POST';
  const url = state.tab === 'ships'
    ? `${config.endpoint}/${encodeURIComponent(state.editing.id)}`
    : state.editing
      ? `${config.endpoint}/${encodeURIComponent(state.editing.id)}`
      : config.endpoint;
  return await api(url, { method, body: JSON.stringify(payload) });
}

async function saveGalleryWithUploads() {
  const basePayload = getFormPayload();
  if (!basePayload.title) throw new Error('\uac24\ub7ec\ub9ac \uc81c\ubaa9\uc740 \ud544\uc218\uc785\ub2c8\ub2e4.');
  const progress = $('#upload-progress');
  const results = [];
  for (let index = 0; index < state.galleryFiles.length; index += 1) {
    const file = state.galleryFiles[index];
    try {
      progress.textContent = `${index + 1}/${state.galleryFiles.length} \uc5c5\ub85c\ub4dc \uc911: ${file.name}`;
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
  $('#form-message').textContent = `\uc5c5\ub85c\ub4dc \uc644\ub8cc: \uc131\uacf5 ${success}\uac74${failed ? `, \uc2e4\ud328 ${failed}\uac74` : ''}`;
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
  if (!state.editing || !confirm('\uc774 \ud56d\ubaa9\uc744 \uc0ad\uc81c\ud560\uae4c\uc694?')) return;
  await api(`${CONFIG[state.tab].endpoint}/${encodeURIComponent(state.editing.id)}`, { method: 'DELETE' });
  state.editing = null;
  await loadItems();
}

async function resetShipOverride() {
  if (!state.editing || !confirm('\uc774 \ud568\uc120\uc758 \uc218\uc815\uac12\uc744 \uc0ad\uc81c\ud558\uace0 \uc6d0\ubcf8\uc73c\ub85c \ub418\ub3cc\ub9b4\uae4c\uc694?')) return;
  await api(`${CONFIG.ships.endpoint}/${encodeURIComponent(state.editing.id)}`, { method: 'DELETE' });
  state.shipOverridesLoaded = false;
  await loadItems();
}

async function uploadFile(file) {
  validateImageFile(file);
  const body = new FormData();
  body.append('file', file);
  const response = await fetch('/api/admin/upload', { method: 'POST', body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '\uc5c5\ub85c\ub4dc\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.');
  return result.imageUrl;
}

function validateImageFile(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error(`${file.name}: JPG, PNG, WEBP \ud30c\uc77c\ub9cc \uc5c5\ub85c\ub4dc\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.`);
  if (file.size > GALLERY_MAX_SIZE) throw new Error(`${file.name}: 10MB \uc774\ud558 \uc774\ubbf8\uc9c0\ub97c \uad8c\uc7a5\ud569\ub2c8\ub2e4.`);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    }
  }
  return [];
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function showFormError(error) {
  $('#form-message').textContent = error.message || '\ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.';
}

function bindEvents() {
  $('#login-form').addEventListener('submit', login);
  $('#logout-button').addEventListener('click', logout);
  $('#new-button').addEventListener('click', () => renderForm(null));
  $('#cancel-button').addEventListener('click', () => renderForm(null));
  $('#delete-button').addEventListener('click', deleteItem);
  $('#cms-form').addEventListener('submit', saveItem);
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });
  $('#item-list').addEventListener('input', handleListInput);
  $('#item-list').addEventListener('click', handleListClick);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('change', handleDocumentChange);
}

function handleListInput(event) {
  if (event.target?.id !== 'ship-admin-search') return;
  state.shipQuery = event.target.value.trim().toLowerCase();
  clearTimeout(shipSearchTimer);
  shipSearchTimer = setTimeout(() => {
    loadItems().catch(showFormError);
  }, SHIP_SEARCH_DELAY_MS);
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
  if (name) {
    name.textContent = state.galleryFiles.length
      ? state.galleryFiles.map((file) => file.name).join(', ')
      : '\uc120\ud0dd\ud55c \ud30c\uc77c \uc5c6\uc74c';
  }
  const hint = document.querySelector('.upload-multi-hint');
  if (hint) hint.hidden = state.galleryFiles.length < 2;
  renderLocalPreviews(state.galleryFiles);
}

function renderLocalPreviews(files) {
  const preview = $('#gallery-preview');
  if (!preview) return;
  preview.querySelectorAll('img[data-object-url]').forEach((img) => {
    URL.revokeObjectURL(img.src);
  });
  if (!files.length) {
    preview.innerHTML = '<div class="image-placeholder">\uc774\ubbf8\uc9c0 \uc5c6\uc74c</div>';
    return;
  }
  preview.innerHTML = files.map((file) => {
    const url = URL.createObjectURL(file);
    return `<img src="${url}" data-object-url="true" alt="${escapeHtml(file.name)}" title="${escapeHtml(file.name)}">`;
  }).join('');
}

bindEvents();
checkSession().catch((error) => {
  $('#login-message').textContent = error.message;
});