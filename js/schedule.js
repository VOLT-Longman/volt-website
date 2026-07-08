/**
 * VOLT 일정/RSVP UI 계층 — main.js에서 분리.
 *
 * 일정 목록/상세 아코디언/RSVP 버튼·집계 렌더와 저장을 담당한다.
 * 데이터 접근(getCalendar)·인증 상태·공용 유틸은 main.js에서 init(deps)로 주입한다.
 * 로드 순서: notices.js 다음, main.js 이전.
 */
(function () {
    'use strict';

    // main.js가 주입하는 의존성 (이름 동일 → 이동 코드 무수정)
    let getCalendar, escapeHtml, tx, i18nT, formatMultilineText, showToast,
        isLoggedIn, applyRoleGates, renderMyPage;

    function init(deps) {
        ({
            getCalendar, escapeHtml, tx, i18nT, formatMultilineText, showToast,
            isLoggedIn, applyRoleGates, renderMyPage,
        } = deps || {});
    }

    // RSVP 원본 상태값(참가/대기/불참)은 API 계약이라 유지하고, 표시만 언어별로 바꾼다.
    const RSVP_STATUSES = ['참가', '대기', '불참'];
    const RSVP_STATUS_KEYS = { 참가: 'mypage.rsvpStatusGoing', 대기: 'mypage.rsvpStatusMaybe', 불참: 'mypage.rsvpStatusNo' };
    const STATUS_COLORS = { '예정': 'var(--volt-orange)', '진행중': '#38a169', '완료': '#718096', '취소': '#e53e3e', '연기': '#d69e2e', '대기': '#a0aec0', '계획': '#63b3ed' };

    function renderSchedule() {
        const container = document.getElementById('schedule-list');
        const calendar = getCalendar();
        if (!container || !Array.isArray(calendar)) return;
        container.innerHTML = calendar.map((event) => {
            const eventId = getEventId(event);
            const detailId = `schedule-detail-${escapeHtml(eventId)}`;
            return `<div class="schedule-item reveal" data-schedule-event-id="${escapeHtml(eventId)}">
                <div class="schedule-date-col">
                    <span class="schedule-date">${escapeHtml(tx(event, 'dateLabel'))}</span>
                    <span class="schedule-status" data-style-color="${STATUS_COLORS[event.status] || '#a0aec0'}">${escapeHtml(tx(event, 'status'))}</span>
                </div>
                <div class="schedule-body">
                    <div class="schedule-type-badge">${escapeHtml(tx(event, 'type'))}</div>
                    <button class="schedule-item-toggle" type="button" aria-expanded="false" aria-controls="${detailId}">
                        ${escapeHtml(tx(event, 'title'))}
                    </button>
                    <div class="schedule-item-detail" id="${detailId}" hidden>
                        <p>${formatMultilineText(tx(event, 'description'))}</p>
                    </div>
                    ${renderRsvpControls(eventId)}
                </div>
            </div>`;
        }).join('');
        window.requestAnimationFrame(loadScheduleRsvps);
    }

    function getEventId(event) {
        return String(event.id || event.title || '').trim().replace(/\s+/g, '-');
    }

    function rsvpStatusLabel(status) {
        const key = RSVP_STATUS_KEYS[status];
        return key ? i18nT(key, status) : status;
    }

    function renderRsvpControls(eventId) {
        return `<div class="schedule-rsvp" data-rsvp-event-id="${escapeHtml(eventId)}">
            <div class="schedule-rsvp-actions" aria-label="${escapeHtml(i18nT('schedule.rsvpAria', '일정 참가 상태 선택'))}">
                ${RSVP_STATUSES.map((status) => `<button class="schedule-rsvp-btn" type="button" data-requires-auth data-rsvp-status="${escapeHtml(status)}">${escapeHtml(rsvpStatusLabel(status))}</button>`).join('')}
            </div>
            <div class="schedule-rsvp-summary" data-rsvp-summary>${escapeHtml(i18nT('schedule.rsvpLoginHint', '로그인하면 참가 상태를 남길 수 있습니다.'))}</div>
        </div>`;
    }

    async function loadScheduleRsvps() {
        const controls = Array.from(document.querySelectorAll('[data-rsvp-event-id]'));
        await Promise.all(controls.map(async (control) => {
            const eventId = control.getAttribute('data-rsvp-event-id');
            if (!eventId) return;
            try {
                const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/rsvp`, { headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error(`RSVP ${response.status}`);
                renderRsvpSummary(control, await response.json());
            } catch (error) {
                console.warn('RSVP load failed', error);
            }
        }));
        applyRoleGates();
    }

    function renderRsvpSummary(control, payload) {
        const summary = control.querySelector('[data-rsvp-summary]');
        const counts = payload?.counts || {};
        const parts = RSVP_STATUSES.map((status) => i18nT('schedule.rsvpCount', '{status} {count}명')
            .replace('{status}', rsvpStatusLabel(status))
            .replace('{count}', String(Number(counts[status] || 0))));
        if (summary) summary.textContent = parts.join(' · ');
    }

    async function saveEventRsvp(eventId, status) {
        if (!isLoggedIn()) {
            showToast(i18nT('schedule.rsvpLoginToast', 'Discord 로그인 후 참가 상태를 남길 수 있습니다.'));
            return;
        }
        const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/rsvp`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!response.ok) throw new Error(`RSVP ${response.status}`);
        const control = document.querySelector(`[data-rsvp-event-id="${CSS.escape(eventId)}"]`);
        if (control) {
            renderRsvpSummary(control, await response.json());
            control.querySelectorAll('[data-rsvp-status]').forEach((button) => {
                button.classList.toggle('is-selected', button.getAttribute('data-rsvp-status') === status);
            });
        }
        renderMyPage();
    }

    function setupScheduleAccordion() {
        const container = document.getElementById('schedule-list');
        if (!container) return;
        container.addEventListener('click', (event) => {
            const rsvpButton = event.target.closest('[data-rsvp-status]');
            if (rsvpButton) {
                const control = rsvpButton.closest('[data-rsvp-event-id]');
                const eventId = control?.getAttribute('data-rsvp-event-id');
                const status = rsvpButton.getAttribute('data-rsvp-status');
                if (eventId && status) saveEventRsvp(eventId, status).catch((error) => {
                    console.warn('RSVP save failed', error);
                    showToast(i18nT('schedule.rsvpSaveFail', '참가 상태 저장에 실패했습니다.'));
                });
                return;
            }
            const button = event.target.closest('.schedule-item-toggle');
            if (!button) return;
            const detail = document.getElementById(button.getAttribute('aria-controls'));
            if (!detail) return;
            const isExpanded = button.getAttribute('aria-expanded') === 'true';
            button.setAttribute('aria-expanded', String(!isExpanded));
            detail.hidden = isExpanded;
        });
    }

    window.VOLT_SCHEDULE = {
        init,
        renderSchedule,
        setupScheduleAccordion,
        loadScheduleRsvps,
    };
})();
