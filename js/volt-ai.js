// VOLT AI (M1) — 도구 기반 어시스턴트 프런트.
// 모델·키에 직접 접근하지 않는다: 모든 요청은 /api/ai/chat 단일 관문.
// 대화는 저장하지 않으며(새로고침 시 초기화), 렌더는 전부 DOM API(textContent)로만 한다.
(function () {
    'use strict';

    const state = { enabled: false, loggedIn: false, sending: false, history: [] };

    const english = () => window.VOLT_I18N?.getLang() === 'en';
    const tr = (ko, en) => english() ? en : ko;
    const intro = () => tr(INTRO_MEMBER + ' 데이터 기반 베타이며 자유 대화나 생성형 답변은 지원하지 않습니다. 대화는 새로고침하면 초기화됩니다.', 'VOLT AI is a data-based beta for ship recommendations, comparisons, UEX prices, events and notices. Answers include sources and timestamps. Generative chat is not connected. Conversations reset on refresh.');

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
        article.append(el('span', 'volt-ai-message-meta', who === 'user' ? tr('나', 'You') : 'VOLT AI'));
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
            if (typeof source.url === 'string' && /^#[a-z-]+$/.test(source.url)) card.href = source.url;
            card.append(el('span', 'volt-ai-source-label', source.label));
            if (source.detail) card.append(el('span', 'volt-ai-source-detail', source.detail));
            footer.append(card);
        }
        if (freshness) {
            const status = freshness.status === 'unavailable' ? tr('데이터 연결 불가', 'Data unavailable') : (freshness.at ? `${tr('기준', 'As of')} ${formatTime(freshness.at)}` : tr('기준 시각 없음', 'Timestamp unavailable'));
            if (status) footer.append(el('span', `volt-ai-freshness${freshness.status === 'unavailable' ? ' is-unavailable' : ''}`, `${freshness.label} · ${status}`));
        }
        article.append(footer);
    }

    function formatTime(iso) {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return iso;
        return date.toLocaleString(english() ? 'en-GB' : 'ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
        if (input && enabled) input.placeholder = tr('예: 화물 96 SCU 이상 함선 추천', 'Try: recommend cargo ships with 96 SCU');
    }

    function setBadges(text) {
        document.querySelectorAll('.volt-ai-status-badge, .volt-ai-chat-badge').forEach((badge) => { badge.textContent = text; });
    }

    function setSubtitle(text) {
        const subtitle = document.querySelector('.volt-ai-chat-subtitle');
        if (subtitle) subtitle.textContent = text;
    }

    async function fetchJson(url, options) {
        const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
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
        document.getElementById('volt-ai-new-chat').disabled = true;
        appendMessage('user', message);
        const pending = appendMessage('ai', tr('확인 중…', 'Checking…'));
        try {
            const result = await fetchJson('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ message, lang: english() ? 'en' : 'ko', history: state.history })
            });
            const bubble = pending?.querySelector('.volt-ai-message-bubble');
            if (!result.ok) {
                if (bubble) bubble.textContent = english() ? ({ 401: 'Please sign in with Discord.', 403: 'Discord membership is required.', 429: 'Request limit reached. Please try again later.', 503: 'VOLT AI is currently unavailable.' }[result.status] || 'Request failed. Please try again later.') : (ERROR_MESSAGES[result.status] || result.data.error || '요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
                return;
            }
            state.history = [...state.history, message].slice(-3);
            if (bubble) bubble.textContent = result.data.answer || '';
            // 모델 보조 설명(M1.1) — 확정 답변과 시각적으로 분리, 참고용임을 명시
            if (result.data.aiNote && bubble) {
                const note = el('div', 'volt-ai-note');
                note.append(el('span', 'volt-ai-note-label', tr('AI 해설 · 참고용', 'AI commentary · reference only')));
                note.append(el('p', 'volt-ai-note-text', result.data.aiNote));
                bubble.append(note);
            }
            appendSources(pending, result.data.sources, result.data.freshness);
        } catch (_error) {
            const bubble = pending?.querySelector('.volt-ai-message-bubble');
            if (bubble) bubble.textContent = tr('연결이 지연되거나 끊겼습니다. 잠시 후 다시 시도해 주세요.', 'The connection timed out or failed. Please try again.');
        } finally {
            state.sending = false;
            setControlsEnabled(state.loggedIn);
        }
    }

    function setupForm() {
        const form = document.getElementById('volt-ai-form');
        const input = document.getElementById('volt-ai-input');
        if (!form || !input) return;
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!state.enabled || !state.loggedIn || state.sending) return;
            const message = input.value.trim();
            if (!message) return;
            input.value = '';
            sendMessage(message);
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                form.requestSubmit();
            }
        });
        const newChat = document.getElementById('volt-ai-new-chat');
        if (newChat) newChat.addEventListener('click', () => { state.history = []; clearLog(intro()); });
    }

    async function init() {
        // 범위 외 컨트롤(이미지/음성/기록/설정)은 MVP에서 비활성 유지
        ['volt-ai-image-button', 'volt-ai-voice-button', 'volt-ai-file', 'volt-ai-history-button', 'volt-ai-settings-button']
            .forEach((id) => { const control = document.getElementById(id); if (control) { control.disabled = true; control.hidden = true; } });

        const config = await fetchJson('/api/ai/chat').catch(() => null);
        if (!config || !config.ok || !config.data.enabled) {
            // 비활성 — 기존 '준비 중' 마크업 그대로 유지 (2차 방어: 제출 차단)
            document.getElementById('volt-ai-form')?.addEventListener('submit', (event) => event.preventDefault());
            return;
        }
        state.enabled = true;

        const auth = await fetchJson('/auth/me').catch(() => null);
        state.loggedIn = Boolean(auth?.data?.logged_in && auth.data.user?.roles?.length);

        setupForm();
        renderState();
        window.VOLT_I18N?.onChange(() => {
            renderState(false);
            if (state.loggedIn && !state.history.length && !state.sending) clearLog(intro());
        });
    }

    function renderState(reset = true) {
        const subtitle = tr('데이터 기반 베타 · 함선, 시세, 일정과 공지를 출처와 함께 확인하세요.', 'Data-based beta · Ships, prices, events and notices, with sources.');
        const heading = document.querySelector('#ai .section-header p');
        if (heading) heading.textContent = subtitle;
        setSubtitle(subtitle);
        setBadges(state.loggedIn ? 'BETA' : 'MEMBERS');
        document.querySelectorAll('a[href="#ai"] .nav-soon-tag').forEach((badge) => { badge.textContent = 'BETA'; });
        const input = document.getElementById('volt-ai-input');
        if (input) input.maxLength = 500;
        const sidebar = document.querySelector('.volt-ai-sidebar');
        sidebar?.querySelectorAll('.volt-ai-example').forEach((node) => { node.remove(); });
        const examples = english() ? ['Recommend cargo ships', 'Gold prices', 'Upcoming events', 'Recent notices'] : ['화물 함선 추천', '금 시세', '다가오는 일정', '최근 공지'];
        for (const question of examples) {
            const button = el('button', 'volt-ai-tool-button volt-ai-example', question);
            button.type = 'button';
            button.disabled = !state.loggedIn;
            button.addEventListener('click', () => {
                if (state.sending || !input) return;
                input.value = question;
                input.focus();
            });
            sidebar?.append(button);
        }
        setControlsEnabled(state.loggedIn && !state.sending);
        if (!state.loggedIn) {
            if (input) input.placeholder = tr('Discord 멤버 로그인 후 이용할 수 있습니다.', 'Sign in as a Discord member to continue.');
            clearLog(tr('VOLT AI는 Discord 멤버 전용입니다. 로그인 후 이용해 주세요.', 'VOLT AI is for Discord members. Please sign in to continue.'));
            const login = el('a', 'volt-ai-login-link', tr('Discord 로그인 →', 'Sign in with Discord →'));
            login.href = '/auth/discord/login';
            messagesContainer()?.lastElementChild?.querySelector('.volt-ai-message-bubble')?.append(document.createElement('br'), login);
            return;
        }
        if (reset) clearLog(intro());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
