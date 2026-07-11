/**
 * VOLT 임원진 UI 계층 — main.js에서 분리 (G4).
 *
 * 임원 카드 그리드(CEO wide + compact)와 상세 모달 렌더·클릭 컨트롤을 담당한다.
 * 데이터 접근(getLeadership/getStaticLeadership)과 공용 유틸은 main.js에서 init(deps)로 주입한다.
 * 로드 순서: schedule.js 다음, main.js 이전.
 */
(function () {
    'use strict';

    // main.js가 주입하는 의존성 (이름 동일 → 이동 코드 무수정)
    let escapeHtml, tx, txArr, i18nT, observeNewReveals, openModal, trackEvent,
        getLeadership, getStaticLeadership;

    function init(deps) {
        ({
            escapeHtml, tx, txArr, i18nT, observeNewReveals, openModal, trackEvent,
            getLeadership, getStaticLeadership,
        } = deps || {});
    }

    function renderLeaders() {
        const container = document.getElementById('leadership-grid');
        if (!container) return;
        const leaders = getRenderableLeadership();
        container.innerHTML = leaders.map(renderLeaderCard).join('');
        observeNewReveals(container);
    }

    // CEO(is-primary)는 전체 폭 3열(아바타 | 정보 | 핵심역량·CTA) 그리드,
    // 나머지 임원은 compact 카드. 상세는 모달로 분리.
    function renderLeaderCard(leader) {
        const isPrimary = leader.avatarStyle === 'ceo';
        const id = escapeHtml(String(leader.id || leader.name || ''));
        const info = `
                <div class="leader-info">
                    <h3>${escapeHtml(leader.name)}</h3>
                    <span class="leader-role">${escapeHtml(tx(leader, 'role'))}</span>
                    <p class="leader-contact">Discord: ${escapeHtml(leader.discord)}</p>
                    <p class="leader-description leader-summary">${escapeHtml(tx(leader, 'description'))}</p>
                    ${isPrimary ? '' : `${renderLeaderKeyPoints(leader, 2)}<span class="leader-more" aria-hidden="true">${escapeHtml(i18nT('leadership.viewDetail', '자세히 보기 →'))}</span>`}
                </div>`;
        const aside = isPrimary ? `
                <div class="leader-aside">
                    ${renderLeaderKeyPoints(leader, 3)}
                    <span class="leader-more" aria-hidden="true">${escapeHtml(i18nT('leadership.viewDetail', '자세히 보기 →'))}</span>
                </div>` : '';
        return `
            <button class="leader-card${isPrimary ? ' ceo-card is-primary' : ''} reveal" type="button" data-leader-id="${id}" aria-label="${escapeHtml(`${leader.name} ${i18nT('leadership.detailAria', '상세 보기')}`)}">
                ${renderLeaderAvatar(leader)}${info}${aside}
            </button>`;
    }

    // 카드에는 핵심 역량 상위 3개만 요약. 철학·기여·전체 역량 등 상세는 모달로 분리.
    function renderLeaderKeyPoints(leader, limit = 3) {
        const items = txArr(leader, 'competencies').slice(0, limit);
        if (!items.length) return '';
        return `<div class="leader-keypoints"><strong>${escapeHtml(i18nT('leadership.keyCompetencies', '핵심 역량'))}</strong><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
    }

    function getRenderableLeadership() {
        const source = typeof getLeadership === 'function' ? getLeadership() : null;
        const leaders = Array.isArray(source)
            ? source.filter((leader) => leader && leader.published !== false)
            : [];
        if (leaders.length) return leaders;
        const fallback = typeof getStaticLeadership === 'function' ? getStaticLeadership() : [];
        return Array.isArray(fallback) ? fallback : [];
    }

    function renderLeaderAvatar(leader) {
        const avatarUrl = getLeaderAvatarUrl(leader);
        if (avatarUrl) {
            return `<img class="leader-avatar leader-avatar-image" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(leader.name || 'Leader')} profile photo" loading="lazy" decoding="async">`;
        }
        // 아바타 배경은 CSS(charcoal + accent)로 통일한다. (브랜드 톤 정리)
        return `<div class="leader-avatar leader-avatar-fallback" aria-hidden="true">${escapeHtml(getLeaderInitial(leader))}</div>`;
    }

    function getLeaderAvatarUrl(leader) {
        return leader.avatarUrl || leader.photoUrl || leader.imageUrl || '';
    }

    function getLeaderInitial(leader) {
        return leader.avatar || (leader.name || '?').charAt(0).toUpperCase();
    }

    function renderLeaderDetails(leader) {
        const details = Array.isArray(leader.details) ? `<div class="leader-details">${leader.details.map((item) => `
            <div class="leader-details-item"><strong>${escapeHtml(tx(item, 'title'))}</strong><p>${escapeHtml(tx(item, 'content'))}</p></div>`).join('')}</div>` : '';
        const compItems = txArr(leader, 'competencies');
        const competencies = compItems.length ? `<div class="leader-competencies"><strong>${escapeHtml(i18nT('leadership.keyCompetencies', '핵심 역량'))}</strong><ul>${compItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
        const duties = leader.duties ? `<div class="leader-duties"><strong>${escapeHtml(i18nT('leadership.duties', '주요 업무'))}</strong> · ${escapeHtml(tx(leader, 'duties'))}</div>` : '';
        return `${details}${competencies}${duties}`;
    }

    function getLeaderById(id) {
        return getRenderableLeadership().find((leader) => String(leader.id || leader.name || '') === String(id)) || null;
    }

    function openLeaderModal(leader) {
        if (!leader) return;
        trackEvent('leader_modal_open', { leaderId: leader.id || '' });
        openModal(`<div class="modal-header">
                <div>
                    <h2 class="modal-title">${escapeHtml(leader.name)}</h2>
                    <p class="leader-role">${escapeHtml(tx(leader, 'role'))}</p>
                </div>
                <button class="modal-close" type="button" aria-label="${escapeHtml(i18nT('ships.modalClose', '모달 닫기'))}">×</button>
            </div>
            <div class="modal-body leader-modal-body">
                <div class="leader-modal-top">
                    ${renderLeaderAvatar(leader)}
                    <div>
                        <p class="leader-contact">Discord: ${escapeHtml(leader.discord)}</p>
                        <p class="leader-modal-desc">${escapeHtml(tx(leader, 'description'))}</p>
                    </div>
                </div>
                ${renderLeaderDetails(leader)}
            </div>`, true);
    }

    function setupLeadershipControls() {
        const grid = document.getElementById('leadership-grid');
        if (!grid) return;
        grid.addEventListener('click', (event) => {
            const card = event.target.closest('[data-leader-id]');
            if (card) openLeaderModal(getLeaderById(card.getAttribute('data-leader-id')));
        });
    }

    window.VOLT_LEADERSHIP = {
        init,
        renderLeaders,
        setup: setupLeadershipControls,
    };
})();
