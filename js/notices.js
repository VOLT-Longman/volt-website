/**
 * VOLT 공지 UI 계층 — main.js에서 분리.
 *
 * 공지 필터 칩/카드 목록/더보기/상세 모달/링크 복사 렌더와 컨트롤을 담당한다.
 * 데이터 접근(getAnnouncements)과 공용 유틸은 main.js에서 init(deps)로 주입한다.
 * 로드 순서: navigation.js 다음, main.js 이전.
 */
(function () {
    'use strict';

    // main.js가 주입하는 의존성 (이름 동일 → 이동 코드 무수정)
    let getAnnouncements, escapeHtml, i18nT, currentLang, formatMultilineText,
        observeNewReveals, openModal, showToast;

    function init(deps) {
        ({
            getAnnouncements, escapeHtml, i18nT, currentLang, formatMultilineText,
            observeNewReveals, openModal, showToast,
        } = deps || {});
    }

    const PAGE_SIZE = 4;
    const noticeState = { tag: 'all', visibleCount: PAGE_SIZE };
    const NOTICE_TAG_COLORS = { '공지': 'var(--volt-orange)', '중요': '#e53e3e', '업데이트': '#3182ce', '이벤트': '#805ad5', '작전': '#38a169', '시스템': '#319795', '모집': '#d69e2e', '정책': '#e53e3e' };

    // 공지 CMS 다국어: EN 모드이고 `${field}En` 값이 있으면 사용, 없으면 KO fallback.
    function noticeField(announcement, field) {
        if (!announcement) return '';
        const en = announcement[`${field}En`];
        return currentLang() === 'en' && en ? en : (announcement[field] || '');
    }

    function getNoticeTags() {
        const announcements = getAnnouncements();
        if (!Array.isArray(announcements)) return [];
        return [...new Set(announcements.map((announcement) => announcement.tag))];
    }

    function renderNoticeFilters() {
        const container = document.getElementById('notice-filters');
        if (!container) return;
        const buttons = ['all', ...getNoticeTags()].map((tag) => {
            const label = tag === 'all' ? i18nT('notices.filterAll', '전체') : tag;
            const active = tag === noticeState.tag ? ' active' : '';
            return `<button class="notice-filter-btn${active}" type="button" data-tag="${escapeHtml(tag)}">${escapeHtml(label)}</button>`;
        });
        container.innerHTML = buttons.join('');
    }

    function getFilteredAnnouncements() {
        const announcements = getAnnouncements();
        if (!Array.isArray(announcements)) return [];
        return [...announcements]
            .filter((announcement) => noticeState.tag === 'all' || announcement.tag === noticeState.tag)
            .sort(compareAnnouncements);
    }

    function compareAnnouncements(left, right) {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
        const leftTime = getDateSortTime(left.date);
        const rightTime = getDateSortTime(right.date);
        if (leftTime !== rightTime) return rightTime - leftTime;
        return String(right.date || '').localeCompare(String(left.date || ''));
    }

    function getDateSortTime(value) {
        const raw = String(value || '').trim().replace(/\./g, '-');
        const time = Date.parse(raw);
        return Number.isNaN(time) ? 0 : time;
    }

    function formatDisplayDate(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, '.');
        const time = Date.parse(raw);
        if (!Number.isNaN(time) && raw.includes('T')) {
            return new Date(time).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).replace(/\.\s/g, '.').replace(/\.$/, '');
        }
        return raw;
    }

    function renderAnnouncements() {
        const container = document.getElementById('notices-list');
        const loadMore = document.getElementById('notice-load-more');
        if (!container || !loadMore) return;
        const items = getFilteredAnnouncements();
        const visibleItems = items.slice(0, noticeState.visibleCount);
        // 강조(featured)는 최신 고정 공지 1개만. 나머지 고정은 배지만 유지.
        const featuredId = (visibleItems.find((item) => item.pinned) || {}).id || null;
        container.innerHTML = visibleItems.map((announcement) => `
            <button class="notice-card${announcement.id === featuredId ? ' is-featured' : ''} reveal" type="button" data-notice-id="${escapeHtml(announcement.id)}" aria-label="${escapeHtml(noticeField(announcement, 'title'))} ${escapeHtml(i18nT('notices.detailAria', '상세 보기'))}">
                <div class="notice-meta">
                    ${announcement.pinned ? `<span class="notice-pin">${escapeHtml(i18nT('notices.pinned', '고정'))}</span>` : ''}
                    <span class="notice-tag" data-style-bg="${NOTICE_TAG_COLORS[announcement.tag] || 'var(--volt-orange)'}20" data-style-color="${NOTICE_TAG_COLORS[announcement.tag] || 'var(--volt-orange)'}">${escapeHtml(noticeField(announcement, 'tag'))}</span>
                    <span class="notice-date">${escapeHtml(formatDisplayDate(announcement.date))}</span>
                </div>
                <h3 class="notice-title">${escapeHtml(noticeField(announcement, 'title'))}</h3>
                <p class="notice-content notice-excerpt">${formatMultilineText(noticeField(announcement, 'content'))}</p>
                <span class="notice-more" aria-hidden="true">${escapeHtml(i18nT('notices.readMore', '자세히 보기 →'))}</span>
            </button>`).join('');
        loadMore.hidden = visibleItems.length >= items.length;
        observeNewReveals(container);
    }

    function openNoticeFromQuery() {
        const noticeId = new URLSearchParams(window.location.search).get('notice');
        const notice = noticeId ? findAnnouncement(noticeId) : null;
        if (notice) openNoticeModal(notice);
    }

    function setupNoticeControls() {
        const filters = document.getElementById('notice-filters');
        const loadMore = document.getElementById('notice-load-more');
        const list = document.getElementById('notices-list');
        if (!filters || !loadMore || !list) return;
        filters.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tag]');
            if (!button) return;
            noticeState.tag = button.getAttribute('data-tag');
            noticeState.visibleCount = PAGE_SIZE;
            renderNoticeFilters();
            renderAnnouncements();
        });
        loadMore.addEventListener('click', () => {
            noticeState.visibleCount += PAGE_SIZE;
            renderAnnouncements();
        });
        list.addEventListener('click', (event) => {
            const card = event.target.closest('[data-notice-id]');
            if (!card) return;
            const notice = findAnnouncement(card.getAttribute('data-notice-id'));
            if (notice) openNoticeModal(notice);
        });
    }

    function findAnnouncement(id) {
        return (getAnnouncements() || []).find((announcement) => announcement.id === id);
    }

    function openNoticeModal(announcement) {
        openModal(`<div class="modal-header">
                <div>
                    ${announcement.pinned ? `<span class="notice-pin">${escapeHtml(i18nT('notices.pinned', '고정'))}</span>` : ''}
                    <h2 class="modal-title">${escapeHtml(noticeField(announcement, 'title'))}</h2>
                </div>
                <button class="modal-close" type="button" aria-label="${escapeHtml(i18nT('notices.modalClose', '모달 닫기'))}">×</button>
            </div>
            <div class="modal-body notice-modal-body">
                <div class="notice-meta">
                    <span class="notice-tag">${escapeHtml(noticeField(announcement, 'tag'))}</span>
                    <span class="notice-date">${escapeHtml(formatDisplayDate(announcement.date))}</span>
                </div>
                <p>${formatMultilineText(noticeField(announcement, 'content'))}</p>
                <button class="btn btn-secondary notice-copy-link" type="button" data-copy-notice-id="${escapeHtml(announcement.id)}">${escapeHtml(i18nT('notices.copyLink', '공지 링크 복사'))}</button>
            </div>`);
    }

    async function copyNoticeLink(id) {
        const url = new URL(window.location.href);
        url.searchParams.set('notice', id);
        url.hash = 'notices';
        try {
            await navigator.clipboard.writeText(url.toString());
            showToast(i18nT('notices.copyOk', '공지 링크를 복사했습니다.'));
        } catch (_error) {
            showToast(i18nT('notices.copyFail', '공지 링크 복사에 실패했습니다.'));
        }
    }

    window.VOLT_NOTICES = {
        init,
        renderNoticeFilters,
        renderAnnouncements,
        setupNoticeControls,
        openNoticeFromQuery,
        findAnnouncement,
        openNoticeModal,
        copyNoticeLink,
    };
})();
