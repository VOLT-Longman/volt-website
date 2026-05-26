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

const NOTICE_TAGS = ['Notice', 'Important', 'Update', 'Event', 'Operation', 'System', 'Recruiting'];
const EVENT_TYPES = ['Regular Operation', 'Joint Operation', 'Event', 'Meeting', 'Training', 'Maintenance', 'Other'];
const EVENT_STATUSES = ['Scheduled', 'In Progress', 'Done', 'Canceled', 'Postponed'];
const GALLERY_CATEGORIES = ['Operation', 'Ship', 'Scene', 'Event', 'Other'];
const GALLERY_MAX_SIZE = 10 * 1024 * 1024;
const SHIP_EDIT_FIELDS = ['manufacturer', 'role', 'focus', 'size', 'crew', 'cargo', 'priceUsd', 'implemented', 'plannerEligible', 'tags', 'description'];
const SHIP_SEARCH_DELAY_MS = 200;

let shipSearchTimer = null;

const CONFIG = {
  notices: { title: 'Notices', endpoint: '/api/admin/notices', fields: ['title', 'content', 'tag', 'date', 'pinned', 'published'] },
  events: { title: 'Events', endpoint: '/api/admin/events', fields: ['title', 'description', 'type', 'status', 'dateLabel', 'eventDate', 'published'] },
  gallery: { title: 'Gallery', endpoint: '/api/admin/gallery', fields: ['title', 'description', 'category', 'date', 'published'] },
  ships: { title: 'Ship DB', endpoint: '/api/admin/ships', fields: SHIP_EDIT_FIELDS }
};

const FIELD_OPTIONS = {
  notices: { tag: NOTICE_TAGS },
  events: { type: EVENT_TYPES, status: EVENT_STATUSES },
  gallery: { category: GALLERY_CATEGORIES }
};

const LABELS = {
  title: 'Title',
  content: 'Content',
  tag: 'Tag',
  date: 'Date',
  pinned: 'Pinned',
  published: 'Published',
  description: 'Description',
  type: 'Type',
  status: 'Status',
  dateLabel: 'Display date',
  eventDate: 'Event date',
  category: 'Category',
  manufacturer: 'Manufacturer',
  role: 'Role',
  focus: 'Focus',
  size: 'Size',
  crew: 'Crew',
  cargo: 'Cargo',
  priceUsd: 'Price (USD)',
  implemented: 'Implemented',
  plannerEligible: 'Show in trade planner',
  tags: 'Tags'
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
  if (!response.ok) throw new Error(data.error || 'Request failed.');
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

async function loadItems() {
  const config = CONFIG[state.tab];
  $('#list-title').textContent = `${config.title} list`;
  $('#form-title').textContent = `${config.title} editor`;
  state.items = state.tab === 'ships' ? await loadShipItems() : (await api(config.endpoint)).items || [];
  renderList();
  renderForm(null);
}

async function loadShipItems() {
  const ships = (window.VOLT_DATA?.ships || []).map((ship) => ({
    base: ship,
    override: null,
    merged: { ...ship }
  }));

  if (!state.shipOverridesLoaded) {
    const payload = await api('/api/ship-overrides').catch(() => ({ items: [] }));
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
    : '<p class="admin-message">No items.</p>';
}

function renderStandardListItem(item) {
  if (state.tab === 'gallery') return renderGalleryListItem(item);
  const meta = [item.date || item.dateLabel || item.type || '', item.published === false ? 'Draft' : 'Published']
    .filter(Boolean)
    .join(' - ');
  return `<button class="item-button${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(meta)}</span></button>`;
}

function renderGalleryListItem(item) {
  const thumb = item.thumb || item.src || item.imageUrl || '';
  const image = thumb ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy">` : '<span>No image</span>';
  const meta = [item.category || 'Other', item.date || '', item.published === false ? 'Draft' : 'Published']
    .filter(Boolean)
    .join(' - ');
  return `<button class="item-button gallery-admin-item${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><span class="gallery-admin-thumb">${image}</span><span class="gallery-admin-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(meta)}</small></span></button>`;
}

function renderShipSearch() {
  return `<label class="admin-search-label">Ship search<input id="ship-admin-search" type="search" value="${escapeHtml(state.shipQuery)}" placeholder="Search by name, manufacturer, role, or tag"></label>`;
}

function renderShipList() {
  if (!state.items.length) return '<p class="admin-message">No search results.</p>';
  return state.items.map((item) => {
    const ship = item.merged;
    return `<button class="item-button ship-admin-item${state.editing?.id === item.id ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(ship.name)}</strong><span>${escapeHtml(ship.manufacturer || '')} - ${escapeHtml(ship.focus || ship.role || '')} - ${escapeHtml(ship.cargo || '0 SCU')}</span><small>${item.override ? 'Override applied' : 'Base data'}</small></button>`;
  }).join('');
}

function renderForm(item) {
  state.editing = item;
  if (state.tab === 'gallery' && !item) {
    state.galleryImageUrls = [];
    state.galleryFiles = [];
  }
  const config = CONFIG[state.tab];
  $('#form-title').textContent = `${config.title} ${item ? 'edit' : 'new'}`;
  $('#delete-button').hidden = !item || state.tab === 'ships';
  $('#delete-button').textContent = 'Delete';
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
    ? `<option value="${escapeHtml(value)}" selected>Existing: ${escapeHtml(value)}</option>`
    : '';
  return `<label>${LABELS[field]}<select name="${field}">${extra}${options.map((option) => `<option value="${escapeHtml(option)}" ${option === normalized ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>`;
}

function getItemValue(item, field) {
  if (item?.[field] !== undefined) return item[field];
  if (state.tab === 'gallery' && field === 'date') return todayDate();
  if (state.tab === 'gallery' && field === 'category') return 'Other';
  if (state.tab === 'notices' && field === 'tag') return 'Notice';
  if (state.tab === 'events' && field === 'type') return 'Regular Operation';
  if (state.tab === 'events' && field === 'status') return 'Scheduled';
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
    ? state.galleryImageUrls.map((url) => `<img src="${escapeHtml(url)}" alt="Gallery image preview">`).join('')
    : '<div class="image-placeholder">No image</div>';
  const fileNames = state.galleryFiles.length
    ? state.galleryFiles.map((file) => escapeHtml(file.name)).join(', ')
    : 'No file selected';
  return `<section class="gallery-upload-panel"><h3>Image upload</h3><p>JPG, PNG, WEBP - recommended 16:9 - 1920x1080 or larger - max 10MB per file</p><p class="upload-multi-hint" hidden>When multiple files are selected, numbers are appended to the title automatically. Example: Title 1, Title 2</p><div class="gallery-preview" id="gallery-preview">${previews}</div><label>Choose image<input id="upload-file" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div class="upload-actions"><span id="upload-file-name">${fileNames}</span></div><div class="upload-progress" id="upload-progress" aria-live="polite"></div></section>`;
}

function renderShipForm(item) {
  if (!item) return '<p class="admin-message">Select a ship from the list.</p>';
  const ship = item.merged;
  return `<div class="ship-readonly"><strong>${escapeHtml(ship.name)}</strong><span>ID: ${escapeHtml(ship.id)}</span></div>${SHIP_EDIT_FIELDS.map((field) => renderShipField(field, item)).join('')}<button type="button" class="secondary" id="reset-ship-button">Reset override</button>`;
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
  return `<label>${LABELS[field]}<select name="${field}"><option value="" ${value === '' || value === null || value === undefined ? 'selected' : ''}>Keep base value</option><option value="true" ${value === true ? 'selected' : ''}>true</option><option value="false" ${value === false ? 'selected' : ''}>false</option></select></label>`;
}

function renderShipTagSelector(item) {
  const selectedTags = getSelectedShipTags(item);
  const options = getShipTagOptions(selectedTags);
  const checkboxes = options.map((tag) => renderShipTagOption(tag, selectedTags)).join('');
  return `<fieldset class="ship-tag-selector"><legend>${LABELS.tags}</legend><p>Select from existing ship database tags.</p><div class="ship-tag-options">${checkboxes}</div></fieldset>`;
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
  payload.category = payload.category || 'Other';
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
  if (state.tab === 'gallery' && !payload.title) throw new Error('Gallery title is required.');
  if (state.tab === 'gallery' && !payload.imageUrl) throw new Error('Upload or select a gallery image.');
  if (state.tab === 'ships' && payload.priceUsd !== null && !Number.isFinite(payload.priceUsd)) {
    throw new Error('Price must be numeric.');
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
    const result = await savePayload(payload);
    if (state.tab === 'ships') state.shipOverridesLoaded = false;
    await loadItems();
    const savedId = result?.item?.id || result?.item?.shipId || state.editing?.id;
    if (savedId) {
      const saved = state.items.find((item) => item.id === savedId || item.shipId === savedId);
      if (saved) renderForm(saved);
    }
    $('#form-message').textContent = 'Saved.';
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
  if (!basePayload.title) throw new Error('Gallery title is required.');
  const progress = $('#upload-progress');
  const results = [];
  for (let index = 0; index < state.galleryFiles.length; index += 1) {
    const file = state.galleryFiles[index];
    try {
      progress.textContent = `${index + 1}/${state.galleryFiles.length} uploading: ${file.name}`;
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
  $('#form-message').textContent = `Upload complete: ${success} succeeded${failed ? `, ${failed} failed` : ''}`;
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
  if (!state.editing || !confirm('Delete this item?')) return;
  await api(`${CONFIG[state.tab].endpoint}/${encodeURIComponent(state.editing.id)}`, { method: 'DELETE' });
  state.editing = null;
  await loadItems();
}

async function resetShipOverride() {
  if (!state.editing || !confirm('Delete this ship override and restore base data?')) return;
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
  if (!response.ok) throw new Error(result.error || 'Upload failed.');
  return result.imageUrl;
}

function validateImageFile(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error(`${file.name}: only JPG, PNG, and WEBP are allowed.`);
  if (file.size > GALLERY_MAX_SIZE) throw new Error(`${file.name}: images must be 10MB or smaller.`);
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
  $('#form-message').textContent = error.message || 'An error occurred.';
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
      : 'No file selected';
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
    preview.innerHTML = '<div class="image-placeholder">No image</div>';
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