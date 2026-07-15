// VOLT AI (M1) — 도구 기반 어시스턴트 프런트.
// 모델·키에 직접 접근하지 않는다: 모든 요청은 /api/ai/chat 단일 관문.
// 대화는 저장하지 않으며(새로고침 시 초기화), 렌더는 전부 DOM API(textContent)로만 한다.
(function () {
    'use strict';

    const state = { enabled: false, loggedIn: false, sending: false };

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function messagesContainer() { return document.getElementById('volt-ai-messages'); }

    function appendMessage(who, text) {
        const container = messagesContainer();
        if (!container) return null;
        const article = el('article', `volt-ai-message${who === 'user' ? ' is-user' : ''}`);
        article.append(el('span', 'volt-ai-message-meta', who === 'user' ? '나' : 'VOLT AI'));
        article.append(el('div', 'volt-ai-message-bubble', text));
        container.append(article);
        container.scrollTop = container.scrollHeight;
        return article;
    }

    // 출처 카드 — 수치의 근거(도구 데이터)와 조회 시각을 항상 함께 보여준다 (M1 원칙).
    function appendSources(article, sources, freshness) {
        if (!article || (!sources?.length && !freshness)) return;
        const footer = el('div', 'volt-ai-sources');
        for (const source of sources || []) {
            const card = el('a', 'volt-ai-source-card');
            if (source.url) card.href = source.url;
            card.append(el('span', 'volt-ai-source-label', source.label));
            if (source.detail) card.append(el('span', 'volt-ai-source-detail', source.detail));
            footer.append(card);
        }
        if (freshness) {
            const status = freshness.status === 'unavailable' ? '데이터 연결 불가' : (freshness.at ? `기준 ${formatTime(freshness.at)}` : '');
            if (status) footer.append(el('span', `volt-ai-freshness${freshness.status === 'unavailable' ? ' is-unavailable' : ''}`, `${freshness.label} · ${status}`));
        }
        article.append(footer);
    }

    function formatTime(iso) {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return iso;
        return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function clearLog(introText) {
        const container = messagesContainer();
        if (!container) return;
        container.replaceChildren();
        appendMessage('ai', introText);
    }

    const INTRO_MEMBER = 'VOLT AI입니다. 함선 추천(역할·화물량·인원), 함선 비교, UEX 시세, 일정·공지 안내를 도와드립니다. '
        + '모든 수치는 VOLT 데이터와 UEX 조회 결과만 사용하며, 답변에 출처와 기준 시각이 함께 표시됩니다.';

    function setControlsEnabled(enabled) {
        const input = document.getElementById('volt-ai-input');
        const send = document.getElementById('volt-ai-send');
        const newChat = document.getElementById('volt-ai-new-chat');
        [input, send, newChat].forEach((control) => {
            if (!control) return;
            control.disabled = !enabled;
            if (enabled) control.removeAttribute('title');
        });
        if (input && enabled) input.placeholder = '예: 화물 96 SCU 이상 2인 함선 추천';
    }

    function setBadges(text) {
        document.querySelectorAll('.volt-ai-status-badge, .volt-ai-chat-badge').forEach((badge) => { badge.textContent = text; });
    }

    function setSubtitle(text) {
        const subtitle = document.querySelector('.volt-ai-chat-subtitle');
        if (subtitle) subtitle.textContent = text;
    }

    async function fetchJson(url, options) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        return { status: response.status, ok: response.ok, data };
    }

    const ERROR_MESSAGES = {
        401: 'Discord 로그인 후 이용할 수 있습니다. 상단 메뉴에서 로그인해 주세요.',
        429: '요청 한도에 도달했습니다. 잠시 후(또는 내일) 다시 시도해 주세요.',
        503: 'VOLT AI가 현재 비활성화되어 있습니다. 공지를 확인해 주세요.'
    };

    async function sendMessage(message) {
        if (state.sending) return;
        state.sending = true;
        const send = document.getElementById('volt-ai-send');
        if (send) send.disabled = true;
        appendMessage('user', message);
        const pending = appendMessage('ai', '확인 중…');
        try {
            const result = await fetchJson('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ message })
            });
            const bubble = pending?.querySelector('.volt-ai-message-bubble');
            if (!result.ok) {
                if (bubble) bubble.textContent = ERROR_MESSAGES[result.status] || result.data.error || '요청에 실패했습니다. 잠시 후 다시 시도해 주세요.';
                return;
            }
            if (bubble) bubble.textContent = result.data.answer || '';
            appendSources(pending, result.data.sources, result.data.freshness);
        } catch (_error) {
            const bubble = pending?.querySelector('.volt-ai-message-bubble');
            if (bubble) bubble.textContent = '네트워크 오류가 발생했습니다. 연결을 확인해 주세요.';
        } finally {
            state.sending = false;
            if (send) send.disabled = false;
        }
    }

    function setupForm() {
        const form = document.getElementById('volt-ai-form');
        const input = document.getElementById('volt-ai-input');
        if (!form || !input) return;
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!state.enabled || !state.loggedIn) return;
            const message = input.value.trim();
            if (!message) return;
            input.value = '';
            sendMessage(message);
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                form.requestSubmit();
            }
        });
        const newChat = document.getElementById('volt-ai-new-chat');
        if (newChat) newChat.addEventListener('click', () => clearLog(INTRO_MEMBER));
    }

    async function init() {
        // 범위 외 컨트롤(이미지/음성/기록/설정)은 MVP에서 비활성 유지
        ['volt-ai-image-button', 'volt-ai-voice-button', 'volt-ai-file', 'volt-ai-history-button', 'volt-ai-settings-button']
            .forEach((id) => { const control = document.getElementById(id); if (control) control.disabled = true; });

        const config = await fetchJson('/api/ai/chat').catch(() => null);
        if (!config || !config.ok || !config.data.enabled) {
            // 비활성 — 기존 '준비 중' 마크업 그대로 유지 (2차 방어: 제출 차단)
            document.getElementById('volt-ai-form')?.addEventListener('submit', (event) => event.preventDefault());
            return;
        }
        state.enabled = true;

        const auth = await fetchJson('/auth/me').catch(() => null);
        state.loggedIn = Boolean(auth?.data?.logged_in);

        setupForm();
        if (!state.loggedIn) {
            setBadges('MEMBERS');
            setSubtitle('Discord 멤버 전용 어시스턴트입니다. 로그인 후 이용해 주세요.');
            clearLog('VOLT AI는 Discord 멤버 전용입니다. 상단 메뉴에서 Discord 로그인 후 함선 추천·비교, 시세, 일정 안내를 이용할 수 있습니다.');
            const container = messagesContainer();
            if (container) {
                const login = el('a', 'volt-ai-login-link', 'Discord 로그인 →');
                login.href = '/auth/discord/login';
                container.lastElementChild?.querySelector('.volt-ai-message-bubble')?.append(document.createElement('br'), login);
            }
            return;
        }

        setBadges('BETA');
        setSubtitle('함선·무역 데이터 기반 안내 — 수치에는 항상 출처와 기준 시각이 붙습니다.');
        setControlsEnabled(true);
        clearLog(INTRO_MEMBER);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
