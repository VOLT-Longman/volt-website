/**
 * VOLT 헤더 인증 UI 렌더 계층 — main.js에서 분리.
 *
 * 로그인 전/후·에러·로딩 상태의 데스크톱/모바일 auth 슬롯 렌더만 담당한다.
 * 세션 검증·`/auth/me` 호출·상태 계산은 main.js가 소유하고, 여기에는 렌더용
 * state(status + 표시값)만 넘긴다. UI 문자열은 전부 주입된 t()로 처리한다.
 *
 * 로드 순서: main.js보다 먼저 로드되어야 한다(window.VOLT_AUTH_UI 노출).
 */
(function () {
    'use strict';

    const DESKTOP_SLOT_ID = 'volt-auth-desktop';
    const MOBILE_SLOT_ID = 'volt-auth-mobile';
    const LOGIN_URL = '/auth/discord/login';
    const LOGOUT_URL = '/auth/logout';

    let t, escapeHtml;
    // 마지막 렌더 state를 보관해 언어 변경 시 동일 state로 재렌더한다.
    let lastState = { status: 'loading' };

    function init(options) {
        const deps = options || {};
        t = deps.t;
        escapeHtml = deps.escapeHtml || ((value) => String(value == null ? '' : value));
    }

    // 간단한 {name} 치환 지원 번역 헬퍼.
    function tr(key, fallback, vars) {
        const template = t ? t(key, fallback) : fallback;
        return String(template || '').replace(/\{(\w+)\}/g, (_, name) => (
            vars && Object.hasOwn(vars, name) ? String(vars[name]) : ''
        ));
    }

    function slots() {
        return [document.getElementById(DESKTOP_SLOT_ID), document.getElementById(MOBILE_SLOT_ID)];
    }

    function render(state) {
        lastState = state || { status: 'loading' };
        const [desktop, mobile] = slots();
        if (!desktop && !mobile) return;
        if (desktop) desktop.innerHTML = htmlFor(lastState, 'desktop');
        if (mobile) mobile.innerHTML = htmlFor(lastState, 'mobile');
    }

    function htmlFor(state, variant) {
        switch (state.status) {
            case 'loggedIn':
                return variant === 'desktop' ? loggedInDesktopHtml(state) : loggedInMobileHtml(state);
            case 'error':
                return errorHtml();
            case 'loggedOut':
                return loggedOutHtml();
            default:
                return loadingHtml();
        }
    }

    function loadingHtml() {
        return `<span class="volt-auth-loading" aria-live="polite">${escapeHtml(tr('auth.loadingProfile', '인증 확인 중'))}</span>`;
    }

    function loggedOutHtml() {
        const label = tr('auth.loginWithDiscord', 'Discord 로그인');
        return `<a class="volt-auth-login" href="${LOGIN_URL}" aria-label="${escapeHtml(tr('auth.login', '로그인'))}">${escapeHtml(label)}</a>`;
    }

    function errorHtml() {
        const label = tr('auth.retry', '인증 재시도');
        return `<a class="volt-auth-login volt-auth-warning" href="${LOGIN_URL}" aria-live="polite" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</a>`;
    }

    function avatarHtml(state) {
        return state.avatarUrl
            ? `<img class="volt-auth-avatar" src="${escapeHtml(state.avatarUrl)}" alt="" loading="lazy" decoding="async">`
            : `<span class="volt-auth-avatar volt-auth-avatar-fallback">${escapeHtml(initial(state.displayName))}</span>`;
    }

    function logoutLinkHtml() {
        const label = tr('auth.logout', '로그아웃');
        return `<a class="volt-auth-logout" href="${LOGOUT_URL}" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</a>`;
    }

    function loggedInDesktopHtml(state) {
        const account = tr('auth.loggedInAs', '{name}님으로 로그인됨', { name: state.displayName || '' });
        return `<div class="volt-auth-user" aria-label="${escapeHtml(account)}">
            ${avatarHtml(state)}
            <span class="volt-auth-user-text">
                <strong>${escapeHtml(state.displayName || '')}</strong>
                <small>${escapeHtml(state.roleLabel || '')}</small>
            </span>
            ${logoutLinkHtml()}
        </div>`;
    }

    function loggedInMobileHtml(state) {
        return `<div class="volt-auth-mobile-card" aria-label="${escapeHtml(tr('auth.account', '계정'))}">
            <div class="volt-auth-mobile-user">
                ${avatarHtml(state)}
                <span>
                    <strong>${escapeHtml(state.displayName || '')}</strong>
                    <small>${escapeHtml(state.roleLabel || '')}</small>
                </span>
            </div>
            ${logoutLinkHtml()}
        </div>`;
    }

    function initial(value) {
        const text = String(value || '').trim();
        return text ? text.charAt(0).toUpperCase() : 'V';
    }

    function clear() {
        const [desktop, mobile] = slots();
        if (desktop) desktop.innerHTML = '';
        if (mobile) mobile.innerHTML = '';
        lastState = { status: 'loading' };
    }

    // 언어 변경 시 마지막 state 기준 재렌더(칩·버튼 문구 즉시 전환).
    function onLanguageChange() {
        render(lastState);
    }

    window.VOLT_AUTH_UI = { init, render, clear, onLanguageChange };
})();
