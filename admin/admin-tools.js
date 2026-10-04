/* global state, $, el, api, CONFIG, confirmDiscard, loadItems, renderList,
 renderForm, setSaveBusy, showFormError, updateListPagination, makeGalleryThumbnail,
 uploadAsset, cleanupUploadedAssets, LABELS, setFormMessage */

function switchWorkspace(tools) {
  if (state.saving || state.pendingUploads) return;
  $('#content-workspace').hidden = tools;
  $('#tools-workspace').hidden = !tools;
  $('#workspace-content').setAttribute('aria-pressed', String(!tools));
  $('#workspace-tools').setAttribute('aria-pressed', String(tools));
}
$('#workspace-content').addEventListener('click', () => switchWorkspace(false));
$('#workspace-tools').addEventListener('click', () => switchWorkspace(true));

let cmsSearchTimer;
let historyRevision = 0;
let historyCursor = null;
let maintenanceCursor = null;

$('#cms-search').addEventListener('input', (event) => {
  clearTimeout(cmsSearchTimer);
  state.listQuery = event.target.value.trim();
  state.listPage = 1;
  cmsSearchTimer = setTimeout(() => loadItems(false).catch(showFormError), 200);
});
for (const [id, delta] of [['list-prev', -1], ['list-next', 1]]) {
  $( '#' + id).addEventListener('click', () => {
    if (state.saving) return;
    state.listPage += delta;
    if (state.tab === 'ships') renderList();
    else loadItems(false).catch(showFormError);
  });
}

document.addEventListener('cms-tab-change', () => {
  clearTimeout(cmsSearchTimer);
  historyRevision += 1;
  historyCursor = null;
  $('#history-result').replaceChildren();
  $('#history-more').hidden = true;
});

async function loadHistory(more = false) {
  const revision = ++historyRevision;
  const collection = state.tab;
  const params = new URLSearchParams({ collection });
  if (more && historyCursor) params.set('before', historyCursor);
  if (!more) $('#history-result').replaceChildren(el('p', '', '이력을 불러오는 중…'));
  try {
    const data = await api('/api/admin/history?' + params);
    if (revision !== historyRevision || collection !== state.tab) return;
    if (!more) $('#history-result').replaceChildren();
    historyCursor = data.next;
    $('#history-more').hidden = !historyCursor;
    const labels = { baseline: '시작 시점', create: '작성', update: '수정', delete: '삭제' };
    if (!data.items.length && !more) $('#history-result').append(el('p', '', '기록된 이력이 없습니다.'));
    for (const item of data.items) {
      let actor = "기록 없음";
      try { actor = JSON.parse(item.actor).name || actor; } catch { /* Historical records have no actor. */ }
      const card = el('details', 'history-entry');
      const snapshot = item.after || item.before || {};
      card.append(el('summary', '', `${snapshot.title || snapshot.name || item.itemId} · ${labels[item.action] || item.action} · ${new Date(item.createdAt).toLocaleString('ko-KR')} · ${actor}`));
      for (const version of ['before', 'after']) {
        if (!item[version]) continue;
        const title = version === 'before' ? '변경 전' : '변경 후';
        card.append(el('h3', '', title), historyPreview(item[version]));
        const button = el('button', 'secondary', `${title} 내용으로 복구`);
        button.type = 'button';
        button.addEventListener('click', () => restoreHistory(collection, item, version));
        card.append(button);
      }
      $('#history-result').append(card);
    }
  } catch (caught) {
    if (revision === historyRevision) $('#history-result').replaceChildren(el('p', '', caught.message));
  }
}

function historyPreview(snapshot) {
  const preview = el('dl', 'history-preview');
  const fields = { image_url: '원본 이미지', thumb_url: '썸네일', title_en: '영어 제목', content_en: '영어 내용', tag_en: '영어 태그', name_ko: '한글 이름', hidden: '숨김', event_date: '실제 날짜', date_label: '표시 날짜', member_count: '멤버 수', photo_url: '사진', logo_url: '로고', avatar_url: '프로필 사진', discord_url: 'Discord 링크', website_url: '웹사이트', sort_order: '정렬 순서', avatar_gradient: '아바타 색상', avatar_style: '아바타 모양', extras: '상세 정보' };
  for (const [field, value] of Object.entries(snapshot)) {
    const label = fields[field] || LABELS[field];
    if (!label) continue;
    const text = ['published', 'pinned', 'hidden'].includes(field) ? (value ? '예' : '아니요') : String(value ?? '');
    preview.append(el('dt', '', label), el('dd', '', text));
  }
  return preview;
}

async function restoreHistory(collection, item, version) {
  if (state.saving || state.pendingUploads || !confirmDiscard()) return;
  if (!confirm('선택한 내용으로 복구할까요? 현재 내용은 새 이력으로 보존됩니다. 삭제된 일정의 참가 기록은 복구되지 않습니다.')) return;
  setSaveBusy(true);
  try {
    await api('/api/admin/history', { method: 'POST', body: JSON.stringify({ collection, historyId: item.id, version, expectedUpdatedAt: item.currentUpdatedAt }) });
    renderForm(null);
    await loadItems(false);
    await loadHistory();
    setFormMessage('선택한 내용으로 복구했습니다.');
  } catch (caught) { showFormError(caught); }
  finally { setSaveBusy(false); }
}

async function scanMaintenance(more = false) {
  if (state.saving || state.pendingUploads) return;
  setSaveBusy(true);
  try {
    const params = new URLSearchParams();
    if (more && maintenanceCursor) params.set('cursor', maintenanceCursor);
    const data = await api('/api/admin/maintenance?' + params);
    maintenanceCursor = data.cursor;
    $('#maintenance-more').hidden = !maintenanceCursor;
    $('#rsvp-cleanup').hidden = !data.orphanRsvps;
    if (!more) $('#upload-candidates').replaceChildren();
    for (const candidate of data.candidates) {
      const label = el('label', 'upload-candidate');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = candidate.key;
      label.append(checkbox, document.createTextNode(`${candidate.key} · ${(candidate.size / 1024).toFixed(1)} KB`));
      $('#upload-candidates').append(label);
    }
    $('#maintenance-delete').hidden = !$('#upload-candidates').children.length;
    $('#maintenance-result').textContent = `삭제된 일정의 참가 기록 ${data.orphanRsvps}건. 미사용 이미지 후보 ${$('#upload-candidates').children.length}건.${data.cursor ? ' 다음 파일도 확인할 수 있습니다.' : ''}${data.storageAvailable ? '' : ' 이미지 저장소가 연결되지 않았습니다.'}`;
  } catch (caught) { $('#maintenance-result').textContent = caught.message; }
  finally { setSaveBusy(false); }
}

async function runMaintenance(action) {
  if (state.saving || state.pendingUploads) return;
  const keys = Array.from(document.querySelectorAll('#upload-candidates input:checked'), (input) => input.value).slice(0, 100);
  if (action === 'delete-uploads' && !keys.length) return;
  if (!confirm(action === 'cleanup-rsvps' ? '삭제된 일정의 참가 기록을 DB에 백업한 뒤 정리할까요?' : `선택한 파일 ${keys.length}개를 영구 삭제할까요? 삭제 직전에 사용 여부를 다시 확인합니다.`)) return;
  setSaveBusy(true);
  try {
    const data = await api('/api/admin/maintenance', { method: 'POST', body: JSON.stringify({ action, keys }) });
    $('#maintenance-result').textContent = action === 'cleanup-rsvps' ? `${data.deleted}건을 백업 후 정리했습니다.` : `파일 ${data.results.filter((item) => item.deleted).length}개를 삭제했습니다. 사용 중이거나 최근 업로드한 파일은 유지했습니다.`;
    if (action === 'cleanup-rsvps') $('#rsvp-cleanup').hidden = true;
    else {
      for (const result of data.results) {
        const input = Array.from(document.querySelectorAll('#upload-candidates input')).find((node) => node.value === result.key);
        if (!input) continue;
        if (result.deleted) input.parentElement.remove();
        else input.checked = false;
      }
      $('#maintenance-delete').hidden = !$('#upload-candidates').children.length;
    }
  } catch (caught) { $('#maintenance-result').textContent = caught.message; }
  finally { setSaveBusy(false); }
}

async function optimizeGallery() {
  if (state.saving || state.pendingUploads || !confirmDiscard()) return;
  if (!confirm('기존 갤러리의 원본은 보존하고, 썸네일이 없는 이미지에 작은 썸네일을 추가할까요?')) return;
  setSaveBusy(true);
  let saved = 0;
  let skipped = 0;
  let bytesSaved = 0;
  const failures = [];
  try {
    const data = await api(CONFIG.gallery.endpoint);
    const candidates = data.items.filter((item) => !item.thumb || item.thumb === item.src);
    for (const [index, item] of candidates.entries()) {
      $('#maintenance-result').textContent = `썸네일 최적화 ${index + 1} / ${candidates.length}`;
      let asset;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        let blob;
        try {
          const response = await fetch('/api/admin/image-source?' + new URLSearchParams({ src: item.src }), { signal: controller.signal });
          if (!response.ok) throw new Error((await response.json()).error || '원본 조회 실패');
          blob = await response.blob();
        } finally { clearTimeout(timeout); }
        const thumbnail = await makeGalleryThumbnail(new File([blob], 'original', { type: blob.type }), { strict: true });
        if (!thumbnail) { skipped += 1; continue; }
        asset = await uploadAsset(thumbnail);
        await api(`${CONFIG.gallery.endpoint}/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify({ ...item, imageUrl: item.src, thumbUrl: asset.imageUrl, expectedUpdatedAt: item.updatedAt }) });
        saved += 1;
        bytesSaved += blob.size - thumbnail.size;
      } catch (caught) {
        if (asset) {
          const errors = await cleanupUploadedAssets([asset]);
          if (errors.length) failures.push(`${item.title}: 업로드 파일 정리 실패`);
        }
        failures.push(`${item.title}: ${caught.message}`);
      }
    }
    if (state.tab === 'gallery') { renderForm(null); await loadItems(false); }
    $('#maintenance-result').textContent = `최적화 ${saved}건, 크기 유지 ${skipped}건, 오류 ${failures.length}건. 썸네일 합계 ${(bytesSaved / 1024 / 1024).toFixed(2)} MB 절감.${failures.length ? ' ' + failures.join(' / ') : ''}`;
  } catch (caught) { $('#maintenance-result').textContent = caught.message; }
  finally { setSaveBusy(false); }
}

$('#history-load').addEventListener('click', () => loadHistory());
$('#history-more').addEventListener('click', () => loadHistory(true));
$('#maintenance-scan').addEventListener('click', () => scanMaintenance());
$('#maintenance-more').addEventListener('click', () => scanMaintenance(true));
$('#rsvp-cleanup').addEventListener('click', () => runMaintenance('cleanup-rsvps'));
$('#maintenance-delete').addEventListener('click', () => runMaintenance('delete-uploads'));
$('#gallery-optimize').addEventListener('click', optimizeGallery);
