/**
 * VOLT 마이페이지 렌더 계층.
 *
 * main.js의 인증/선호도 fetch 흐름에서 조립한 state를 받아 마이페이지 카드
 * (프로필·격납고·무역플래너·참가 일정)를 렌더한다. 인증 세션 검증·상태 저장은
 * main.js에 남기고, 이 모듈은 렌더/상태 문구/격납고/RSVP 표시 책임만 갖는다.
 * 공용 유틸(i18n·escapeHtml·토스트·트래킹)과 격납고 제거/함선 상세 콜백은
 * main.js에서 init(deps)로 주입한다. 전역을 직접 뒤지지 않는다.
 *
 * 로드 순서: main.js보다 먼저 로드되어야 한다(window.VOLT_MYPAGE 노출).
 */
(function () {
    'use strict';

    let i18nT, escapeHtml, trackEvent, openShipById, removeFromHangar;
    let lastState = null;
    let boundContainer = null;

    // RSVP 원본 상태(백엔드 저장값, 한국어) → i18n 키 매핑. 미지의 값은 원문 유지.
    const RSVP_STATUS_KEYS = {
        참가: 'mypage.rsvpStatusGoing',
        대기: 'mypage.rsvpStatusMaybe',
        불참: 'mypage.rsvpStatusNo',
    };

    function init(options) {
        const deps = options || {};
        i18nT = deps.i18nT;
        escapeHtml = deps.escapeHtml;
        trackEvent = deps.trackEvent;
        openShipById = deps.openShipById;
        removeFromHangar = deps.removeFromHangar;
    }

    function t(key, fallback) {
        return i18nT ? i18nT(key, fallback) : fallback || key;
    }

    function statusLabel(status) {
        const key = RSVP_STATUS_KEYS[String(status || '').trim()];
        return key ? t(key) : String(status || '');
    }

    // main.js에서 조립한 state(loggedIn/profile/hangarShips/planner)를 받아 렌더한다.
    function renderMyPage(state) {
        const container = document.getElementById('mypage-content');
        if (!container) return;
        lastState = state || { loggedIn: false };
        bindContainer(container);

        if (!lastState.loggedIn) {
            container.innerHTML = renderLoginRequired();
            return;
        }
        container.innerHTML = `<div class="mypage-grid">
            ${renderProfileCard(lastState.profile || {})}
            <article class="mypage-card"><h3>${escapeHtml(t('mypage.hangarTitle'))}</h3>${renderHangar(lastState.hangarShips || [])}</article>
            <article class="mypage-card"><h3>${escapeHtml(t('mypage.plannerTitle'))}</h3>${renderPlanner(lastState.planner)}</article>
            <article class="mypage-card"><h3>${escapeHtml(t('mypage.rsvpTitle'))}</h3><ul class="mypage-list" id="mypage-rsvp-list"><li>${escapeHtml(t('mypage.loading'))}</li></ul></article>
        </div>`;
        loadMyRsvps();
    }

    function renderLoginRequired() {
        return `<div class="mypage-card">
            <h3>${escapeHtml(t('mypage.loginRequiredTitle'))}</h3>
            <p>${escapeHtml(t('mypage.loginRequiredBody'))}</p>
            <a class="btn btn-primary" href="/auth/discord/login">${escapeHtml(t('mypage.loginButton'))}</a>
        </div>`;
    }

    function renderProfileCard(profile) {
        const statusValue = profile.isMember ? t('mypage.statusMember') : t('mypage.statusGuest');
        return `<article class="mypage-card"><h3>${escapeHtml(t('mypage.profileTitle'))}</h3>
            <dl class="mypage-profile">
                <dt>${escapeHtml(t('mypage.discordLabel'))}</dt><dd>${escapeHtml(profile.displayName || '')}</dd>
                <dt>${escapeHtml(t('mypage.roleLabel'))}</dt><dd>${escapeHtml(profile.roleLabel || '')}</dd>
                <dt>${escapeHtml(t('mypage.memberStatusLabel'))}</dt><dd>${escapeHtml(statusValue)}</dd>
            </dl>
        </article>`;
    }

    function renderHangar(ships) {
        if (!ships.length) {
            return `<div class="mypage-empty">
                <strong>${escapeHtml(t('mypage.hangarEmptyTitle'))}</strong>
                <p>${escapeHtml(t('mypage.hangarEmptyBody'))}</p>
            </div>`;
        }
        const removeLabel = t('mypage.hangarRemove');
        return `<ul class="mypage-list">${ships.slice(0, 12).map((ship) => `<li>
            <button type="button" class="mypage-ship-name" data-mypage-ship-id="${escapeHtml(ship.id)}">${escapeHtml(ship.name)}</button>
            <span>${escapeHtml(ship.cargo || '0 SCU')}</span>
            <button type="button" class="mypage-ship-remove" data-mypage-hangar-remove="${escapeHtml(ship.id)}" aria-label="${escapeHtml(`${ship.name} · ${removeLabel}`)}" title="${escapeHtml(removeLabel)}">×</button>
        </li>`).join('')}</ul>`;
    }

    function renderPlanner(planner) {
        if (!planner || !planner.hasValue) return `<p class="mypage-empty-note">${escapeHtml(t('mypage.plannerEmpty'))}</p>`;
        return `<dl class="mypage-planner">
            <dt>${escapeHtml(t('mypage.plannerShip'))}</dt><dd>${escapeHtml(planner.shipName || t('mypage.plannerShipNone'))}</dd>
            <dt>${escapeHtml(t('mypage.plannerCargo'))}</dt><dd>${escapeHtml(planner.cargo || '0')} SCU</dd>
            <dt>${escapeHtml(t('mypage.plannerCrew'))}</dt><dd>${escapeHtml(planner.crew || '1')}</dd>
        </dl>`;
    }

    async function loadMyRsvps() {
        const list = document.getElementById('mypage-rsvp-list');
        if (!list || !lastState || !lastState.loggedIn) return;
        try {
            const response = await fetch('/api/me/rsvps', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`MYRSVP ${response.status}`);
            const payload = await response.json();
            const items = payload.items || [];
            list.innerHTML = items.length
                ? items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(statusLabel(item.status))} · ${escapeHtml(item.dateLabel || t('mypage.rsvpNoDate'))}</span></li>`).join('')
                : `<li class="mypage-empty"><strong>${escapeHtml(t('mypage.rsvpEmptyTitle'))}</strong><p>${escapeHtml(t('mypage.rsvpEmptyBody'))}</p></li>`;
        } catch (error) {
            console.warn('My RSVP load failed', error);
            list.innerHTML = `<li class="mypage-error"><span>${escapeHtml(t('mypage.error'))}</span><button type="button" class="mypage-retry" data-mypage-rsvp-retry>${escapeHtml(t('mypage.retry'))}</button></li>`;
        }
    }

    function bindContainer(container) {
        if (boundContainer === container) return;
        boundContainer = container;
        container.addEventListener('click', handleClick);
    }

    function handleClick(event) {
        const removeBtn = event.target.closest('[data-mypage-hangar-remove]');
        if (removeBtn) {
            event.preventDefault();
            const shipId = removeBtn.getAttribute('data-mypage-hangar-remove');
            if (shipId && typeof removeFromHangar === 'function') {
                removeFromHangar(shipId);
                if (typeof trackEvent === 'function') trackEvent('mypage_hangar_remove', { shipId });
            }
            return;
        }
        const shipBtn = event.target.closest('[data-mypage-ship-id]');
        if (shipBtn) {
            event.preventDefault();
            const shipId = shipBtn.getAttribute('data-mypage-ship-id');
            if (shipId && typeof openShipById === 'function') openShipById(shipId);
            return;
        }
        const retryBtn = event.target.closest('[data-mypage-rsvp-retry]');
        if (retryBtn) {
            event.preventDefault();
            const list = document.getElementById('mypage-rsvp-list');
            if (list) list.innerHTML = `<li>${escapeHtml(t('mypage.loading'))}</li>`;
            loadMyRsvps();
        }
    }

    // 언어 변경 시 마지막 state 기준으로 재렌더(동적 영역 즉시 EN/KO 전환).
    function onLanguageChange() {
        if (lastState) renderMyPage(lastState);
    }

    window.VOLT_MYPAGE = {
        init,
        renderMyPage,
        onLanguageChange,
    };
})();
