/**
 * VOLT 랜딩(홈 하이라이트) 계층 — 인터랙티브 랜딩 요소를 담당한다.
 *
 * D-①: 최신 공지 티저 렌더(DOM API — innerHTML 미사용) + 동적 수치(함선/멤버).
 * 원칙: 기존 깔끔한 톤 유지 — 절제된 모션, prefers-reduced-motion 존중, transform/opacity만.
 * 로드 순서: schedule.js 다음, main.js 이전.
 */
(function () {
    'use strict';

    // main.js가 주입하는 의존성
    let getAnnouncements, getShipsCount, getMemberLabel, currentLang, i18nT;

    function init(deps) {
        ({
            getAnnouncements, getShipsCount, getMemberLabel, currentLang, i18nT,
        } = deps || {});
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // 공지 KO/EN 필드 선택 (notices.js와 동일 규약 — `${field}En` 우선)
    function noticeField(announcement, field) {
        if (!announcement) return '';
        const en = announcement[`${field}En`];
        return currentLang() === 'en' && en ? en : (announcement[field] || '');
    }

    function formatTeaserDate(value) {
        const raw = String(value || '').trim();
        return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10).replace(/-/g, '.') : raw;
    }

    // 최신 공지 3건 티저 (고정 공지 우선, 날짜 내림차순)
    function renderNoticeTeaser() {
        const container = document.getElementById('landing-notices-list');
        const announcements = getAnnouncements();
        if (!container) return;
        container.replaceChildren();
        if (!Array.isArray(announcements) || announcements.length === 0) return;
        const items = [...announcements]
            .sort((a, b) => (Boolean(b.pinned) - Boolean(a.pinned)) || String(b.date || '').localeCompare(String(a.date || '')))
            .slice(0, 3);
        for (const item of items) {
            const row = el('a', 'landing-notice-row');
            row.href = '#notices';
            const meta = el('div', 'landing-notice-meta');
            meta.append(el('span', 'landing-notice-tag', noticeField(item, 'tag')));
            meta.append(el('span', 'landing-notice-date', formatTeaserDate(item.date)));
            row.append(meta, el('span', 'landing-notice-title', noticeField(item, 'title')));
            container.append(row);
        }
    }

    // 하이라이트 카드의 동적 수치 채움
    function renderCounts() {
        const ships = document.querySelector('[data-landing-count="ships"]');
        if (ships && typeof getShipsCount() === 'number') ships.textContent = String(getShipsCount());
        const members = document.querySelector('[data-landing-count="members"]');
        if (members && getMemberLabel()) members.textContent = getMemberLabel();
    }

    function render() {
        renderNoticeTeaser();
        renderCounts();
    }

    window.VOLT_LANDING = {
        init,
        render,
        renderNoticeTeaser,
        renderCounts,
    };
})();
