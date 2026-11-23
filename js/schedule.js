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
        isLoggedIn, getAuthSubject, applyRoleGates, renderMyPage;

    function init(deps) {
        ({
            getCalendar, escapeHtml, tx, i18nT, formatMultilineText, showToast,
            isLoggedIn, getAuthSubject, applyRoleGates, renderMyPage,
        } = deps || {});
    }

    // RSVP 원본 상태값(참가/대기/불참)은 API 계약이라 유지하고, 표시만 언어별로 바꾼다.
    const RSVP_STATUSES = ['참가', '대기', '불참'];
    const RSVP_STATUS_KEYS = { 참가: 'mypage.rsvpStatusGoing', 대기: 'mypage.rsvpStatusMaybe', 불참: 'mypage.rsvpStatusNo' };
    const STATUS_COLORS = { '예정': '#ff8a75', '진행중': '#68d391', '완료': '#a1a1a6', '취소': '#fc8181', '연기': '#ecc94b', '대기': '#a0aec0', '계획': '#63b3ed' };
    const RSVP_CACHE_TTL_MS = 20_000;
    const rsvpCache = new Map();
    let renderRevision = 0;

    // The public calendar uses Korean dates and also contains undated plans.
    function isPast(event) {
        const match = /^(20\d{2})[./-](\d{1,2})[./-](\d{1,2})$/.exec(String(event.dateLabel || '').trim());
        if (!match) return false;
        const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
        return [match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0')].join('-') < today;
    }

    function renderSchedule() {
        const container = document.getElementById('schedule-list');
        const calendar = getCalendar();
        if (!container || !Array.isArray(calendar)) return;
        const focusedToggle = container.contains(document.activeElement) && document.activeElement?.matches('.schedule-item-toggle')
            ? document.activeElement.closest('[data-schedule-event-id]')?.getAttribute('data-schedule-event-id')
            : null;
        const expandedIds = new Set(Array.from(container.querySelectorAll('.schedule-item-toggle[aria-expanded="true"]'))
            .map((button) => button.closest('[data-schedule-event-id]')?.getAttribute('data-schedule-event-id')));
        container.innerHTML = !calendar.length ? `<div class="content-empty" role="status">
            <span class="content-empty-mark" aria-hidden="true">—</span>
            <h3>${escapeHtml(i18nT('schedule.emptyTitle', '등록된 일정이 없습니다.'))}</h3>
            <p>${escapeHtml(i18nT('schedule.emptyDesc', '새로운 작전과 이벤트가 등록되면 이곳에서 확인할 수 있습니다.'))}</p>
        </div>` : [...calendar].sort((a, b) => Number(isPast(a)) - Number(isPast(b))).map((event) => {
            const eventId = getEventId(event);
            const detailId = `schedule-detail-${escapeHtml(eventId)}`;
            const expanded = expandedIds.has(eventId);
            return `<div class="schedule-item reveal" data-schedule-event-id="${escapeHtml(eventId)}">
                <div class="schedule-date-col">
                    <span class="schedule-date">${escapeHtml(tx(event, 'dateLabel'))}</span>
                    <span class="schedule-status" data-style-color="${STATUS_COLORS[event.status] || '#a0aec0'}">${escapeHtml(isPast(event) ? i18nT('audit.past', '지난 일정') : tx(event, 'status'))}</span>
                </div>
                <div class="schedule-body">
                    <div class="schedule-type-badge">${escapeHtml(tx(event, 'type'))}</div>
                    <button class="schedule-item-toggle" type="button" aria-expanded="${expanded}" aria-controls="${detailId}">
                        ${escapeHtml(tx(event, 'title'))}
                    </button>
                    <div class="schedule-item-detail" id="${detailId}"${expanded ? '' : ' hidden'}>
                        <p>${formatMultilineText(tx(event, 'description'))}</p>
                    </div>
                    ${isPast(event) ? '' : renderRsvpControls(eventId)}
                </div>
            </div>`;
        }).join('');
        if (calendar.length && calendar.every(isPast)) {
            const note = document.createElement('p');
            note.textContent = i18nT('audit.noUpcoming', '현재 예정된 일정이 없습니다.');
            container.prepend(note);
        }
        if (focusedToggle) {
            container.querySelector(`[data-schedule-event-id="${CSS.escape(focusedToggle)}"] .schedule-item-toggle`)?.focus({ preventScroll: true });
        }
        const revision = ++renderRevision;
        window.requestAnimationFrame(() => { if (revision === renderRevision) loadScheduleRsvps(); });
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
        if (!isLoggedIn()) {
            applyRoleGates();
            return;
        }
        await Promise.all(controls.map(async (control) => {
            const eventId = control.getAttribute('data-rsvp-event-id');
            if (!eventId) return;
            try {
                const key = rsvpCacheKey(eventId);
                const request = getRsvpPayload(eventId);
                const payload = await request;
                if (key && (rsvpCacheKey(eventId) !== key || rsvpCache.get(key)?.promise !== request)) return;
                if (payload && control.isConnected) renderRsvpSummary(control, payload);
            } catch (error) {
                console.warn('RSVP load failed', error);
            }
        }));
        applyRoleGates();
    }

    function rsvpCacheKey(eventId) {
        const subject = getAuthSubject?.();
        return subject ? `${subject}:${eventId}` : null;
    }

    function fetchRsvpPayload(eventId) {
        return fetch(`/api/events/${encodeURIComponent(eventId)}/rsvp`, { headers: { Accept: 'application/json' } })
            .then((response) => {
                if (response.status === 401) return null;
                if (!response.ok) throw new Error(`RSVP ${response.status}`);
                return response.json();
            });
    }

    function getRsvpPayload(eventId) {
        const key = rsvpCacheKey(eventId);
        if (!key) return fetchRsvpPayload(eventId);
        const cached = rsvpCache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.promise;
        const promise = fetchRsvpPayload(eventId);
        const entry = { promise, expiresAt: Date.now() + RSVP_CACHE_TTL_MS };
        rsvpCache.set(key, entry);
        promise.catch(() => { if (rsvpCache.get(key) === entry) rsvpCache.delete(key); });
        return promise;
    }

    function clearRsvpCache() { rsvpCache.clear(); }

    function renderRsvpSummary(control, payload) {
        const summary = control.querySelector('[data-rsvp-summary]');
        const counts = payload?.counts || {};
        const parts = RSVP_STATUSES.map((status) => i18nT('schedule.rsvpCount', '{status} {count}명')
            .replace('{status}', rsvpStatusLabel(status))
            .replace('{count}', String(Number(counts[status] || 0))));
        if (summary) summary.textContent = parts.join(' · ');
        // 내 선택(서버가 알려준 값)을 버튼에 표시한다. 처음 불러올 때와 다시 그릴 때 모두 적용된다.
        if (payload && 'mine' in payload) markOwnRsvp(control, payload.mine);
    }

    function markOwnRsvp(control, status) {
        control.querySelectorAll('[data-rsvp-status]').forEach((button) => {
            const selected = button.getAttribute('data-rsvp-status') === status;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
    }

    const pendingSaves = new Map();
    function saveEventRsvp(eventId, status) {
        const subject = getAuthSubject?.();
        const key = JSON.stringify([subject, eventId]);
        const previous = pendingSaves.get(key) || Promise.resolve();
        const job = previous.catch(() => {}).then(() => {
            if (getAuthSubject?.() === subject) return persistEventRsvp(eventId, status, subject);
        }).finally(() => {
            if (pendingSaves.get(key) === job) pendingSaves.delete(key);
        });
        pendingSaves.set(key, job);
        return job;
    }

    async function persistEventRsvp(eventId, status, subject) {
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
        const payload = await response.json();
        if (getAuthSubject?.() !== subject) return;
        const key = rsvpCacheKey(eventId);
        if (key) rsvpCache.set(key, { promise: Promise.resolve(payload), expiresAt: Date.now() + RSVP_CACHE_TTL_MS });
        const control = document.querySelector(`[data-rsvp-event-id="${CSS.escape(eventId)}"]`);
        if (control) {
            renderRsvpSummary(control, payload);
            markOwnRsvp(control, payload?.mine ?? status);
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
        clearRsvpCache,
    };
})();
