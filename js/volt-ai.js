// VOLT AI (M1) — 도구 기반 어시스턴트 프런트.
// 모델·키에 직접 접근하지 않는다: 모든 요청은 /api/ai/chat 단일 관문.
// 대화는 저장하지 않으며(새로고침 시 초기화), 렌더는 전부 DOM API(textContent)로만 한다.
(function () {
    'use strict';

    const state = { enabled: false, assisted: false, loggedIn: false, sending: false, history: [], context: null, contextLabel: '', contextVersion: 0 };
    const CONTEXT_KEY = 'volt-ai-selected-context';

    const english = () => window.VOLT_I18N?.getLang() === 'en';
    const tr = (ko, en) => english() ? en : ko;
    const intro = () => state.assisted
        ? tr(INTRO_MEMBER + ' Cloudflare AI가 참고용 해설을 덧붙입니다. 한도·연결 상태에 따라 데이터 답변만 제공할 수 있습니다. 질문과 조회 결과가 Cloudflare AI로 전달되니 개인정보·비밀번호는 입력하지 마세요. 대화는 새로고침하면 초기화됩니다.', 'VOLT AI looks up ships, UEX prices, events and notices with sources. Bring your selection from Loadout, ShipDB or Trade Planner to review equipment, power and A/B differences. Cloudflare AI adds optional commentary; limits or connection issues may leave data-only answers. Questions and retrieved records are sent to Cloudflare AI. Do not enter personal information or passwords. Conversations reset on refresh.')
        : tr(INTRO_MEMBER + ' 데이터 기반 베타이며 자유 대화나 생성형 답변은 지원하지 않습니다. 대화는 새로고침하면 초기화됩니다.', 'VOLT AI is a data-based beta for ship recommendations, comparisons, UEX prices, events and notices. Bring your selection from Loadout, ShipDB or Trade Planner to review equipment, power and A/B differences. Answers include sources and timestamps. Generative chat is not connected. Conversations reset on refresh.');

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function messagesContainer() { return document.getElementById('volt-ai-messages'); }

    function clearContext() {
        state.context = null; state.contextLabel = ''; state.contextVersion += 1; state.history = [];
        try { sessionStorage.removeItem(CONTEXT_KEY); } catch (_error) { /* optional handoff */ }
        renderContext();
    }
    function openContext(context, label) {
        state.context = JSON.parse(JSON.stringify(context));
        state.contextLabel = String(label || '').slice(0, 150);
        state.contextVersion += 1; state.history = [];
        try { sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ context: state.context, label: state.contextLabel })); } catch (_error) { /* optional handoff */ }
        renderContext();
        if (state.loggedIn && !state.sending) clearLog(intro());
        const input = document.getElementById('volt-ai-input');
        if (input && !state.sending) input.value = tr('현재 구성의 장단점과 전력 상태를 검토해 줘', 'Review the current build, its trade-offs and power state');
    }
    function renderContext() {
        let panel = document.getElementById('volt-ai-context');
        if (!panel) {
            panel = el('section', 'volt-ai-context'); panel.id = 'volt-ai-context';
            messagesContainer()?.before(panel);
        }
        panel.replaceChildren(); panel.hidden = !state.context;
        if (!state.context) return;
        const description = state.context.kind === 'loadout' ? tr(`로드아웃 · 구성 ${state.context.slot}`, `Loadout · build ${state.context.slot}`)
            : state.context.kind === 'trade' ? tr(`운송 준비 · 기본 구성 · 입력 ${state.context.cargoScu} SCU`, `Hauling preparation · stock build · input ${state.context.cargoScu} SCU`) : tr('함선 DB · 기본 구성', 'ShipDB · stock build');
        const heading = el('div', 'volt-ai-context-heading');
        heading.append(el('strong', '', state.contextLabel || state.context.shipId || state.context.ship), el('span', '', description));
        const remove = el('button', 'loadout-link', tr('선택 해제', 'Clear selection')); remove.type = 'button'; remove.disabled = state.sending; remove.addEventListener('click', clearContext);
        heading.append(remove); panel.append(heading);
        panel.append(el('p', '', state.context.kind === 'loadout'
            ? tr('이동할 때 선택한 구성입니다. 전송하면 장착·전원·A/B 정보를 서버에서 다시 계산합니다. 편집 후 다시 가져오면 최신 구성이 반영됩니다.', 'This is the selection captured when you came here. Sending recalculates equipment, power and A/B choices on the server. Bring it here again after editing.')
            : tr('선택한 함선의 기본 장비 구성을 검토합니다. 교체한 장비나 A/B 구성은 로드아웃 화면의 AI 버튼으로 가져오세요.', 'Reviews the selected ship’s stock equipment. To review edited equipment or A/B builds, use the AI button in Loadout.')));
        const prompts = el('div', 'volt-ai-context-prompts');
        for (const question of [tr('현재 구성의 장단점 검토', 'Review this build'), tr('현재 전력과 실드 상태 설명', 'Explain current power and shields'), tr('현재 구성과 비교 구성의 차이', 'Compare the current and reference builds')]) {
            const button = el('button', '', question); button.type = 'button'; button.disabled = state.sending || !state.loggedIn;
            button.addEventListener('click', () => { const input = document.getElementById('volt-ai-input'); input.value = question; input.focus(); });
            prompts.append(button);
        }
        panel.append(prompts);
    }

    function appendReview(bubble, review, actions) {
        if (!bubble || !review || !Array.isArray(review.metrics) || !Array.isArray(review.checks)) return;
        const section = el('section', 'volt-ai-review');
        section.append(el('h4', '', review.title));
        const metrics = el('dl', 'volt-ai-review-metrics');
        const number = value => Number.isFinite(value) ? Number(value.toFixed(1)).toLocaleString(english() ? 'en-US' : 'ko-KR') : '—';
        for (const metric of review.metrics.slice(0, 12)) {
            const cell = el('div'); cell.append(el('dt', '', metric.label));
            const value = el('dd', '', `${number(metric.value)} ${metric.unit || ''}`);
            value.append(el('small', '', `${review.comparisonLabel}: ${number(metric.baseline)} ${metric.unit || ''}`));
            if (Number.isFinite(metric.value) && Number.isFinite(metric.baseline) && Math.abs(metric.value - metric.baseline) >= .05) {
                const diff = metric.value - metric.baseline;
                const favorable = metric.better === 'low' ? diff < 0 : diff > 0;
                value.append(el('span', `loadout-change is-${favorable ? 'good' : 'bad'}`, `${diff > 0 ? '+' : '−'}${number(Math.abs(diff))} · ${favorable ? tr('유리', 'favorable') : tr('불리', 'unfavorable')}`));
            }
            cell.append(value);
            metrics.append(cell);
        }
        section.append(metrics, el('h4', '', tr('확인할 점', 'Things to check')));
        const checks = el('ul', 'volt-ai-review-checks');
        for (const check of review.checks.slice(0, 12)) {
            const li = el('li', check.kind === 'warning' ? 'is-warning' : '');
            li.append(el('strong', '', check.title), el('p', '', check.detail)); checks.append(li);
        }
        section.append(checks);
        const links = el('div', 'volt-tool-links');
        for (const action of (actions || []).slice(0, 4)) {
            if (!['loadout', 'ship', 'planner'].includes(action.action) || !/^[a-z0-9_-]{1,100}$/.test(action.shipId || '')) continue;
            const button = el('button', '', action.label); button.type = 'button';
            button.addEventListener('click', () => window.VOLT_TOOLS?.open?.(action.action, action.shipId)); links.append(button);
        }
        section.append(links); bubble.append(section);
    }

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

    const INTRO_MEMBER = 'VOLT AI입니다. 함선 추천(역할·화물량·인원), 함선 비교, UEX 시세, 일정·공지 안내를 도와드립니다. 로드아웃·함선 DB·무역플래너의 AI 버튼으로 선택한 함선을 가져오면 구성과 전력, A/B 차이를 검토할 수 있습니다. '
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
        const contextVersion = state.contextVersion;
        renderContext();
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
                body: JSON.stringify({ message, lang: english() ? 'en' : 'ko', history: state.history, ...(state.context ? { context: state.context } : {}) })
            });
            const bubble = pending?.querySelector('.volt-ai-message-bubble');
            if (!result.ok) {
                if (bubble) bubble.textContent = english() ? ({ 401: 'Please sign in with Discord.', 403: 'Discord membership is required.', 429: 'Request limit reached. Please try again later.', 503: 'VOLT AI is currently unavailable.' }[result.status] || 'Request failed. Please try again later.') : (ERROR_MESSAGES[result.status] || result.data.error || '요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
                return;
            }
            if (state.contextVersion === contextVersion) state.history = [...state.history, message].slice(-3);
            if (bubble) bubble.textContent = result.data.answer || '';
            appendReview(bubble, result.data.review, result.data.actions);
            // 모델 보조 설명(M1.1) — 확정 답변과 시각적으로 분리, 참고용임을 명시
            if (result.data.aiNote && bubble) {
                const note = el('div', 'volt-ai-note');
                note.append(el('span', 'volt-ai-note-label', tr('AI 해설 · 참고용', 'AI commentary · reference only')));
                note.append(el('p', 'volt-ai-note-text', result.data.aiNote));
                bubble.append(note);
            } else if (state.assisted && result.data.sources?.length && bubble) {
                bubble.append(el('div', 'volt-ai-note', tr('이번 답변은 조회 데이터로 안내합니다. AI 해설은 한도·연결·검증 상태에 따라 생략될 수 있습니다.', 'This answer uses retrieved data. AI commentary may be omitted due to limits, connectivity or validation.')));
            }
            appendSources(pending, result.data.sources, result.data.freshness);
        } catch (_error) {
            const bubble = pending?.querySelector('.volt-ai-message-bubble');
            if (bubble) bubble.textContent = tr('연결이 지연되거나 끊겼습니다. 잠시 후 다시 시도해 주세요.', 'The connection timed out or failed. Please try again.');
        } finally {
            state.sending = false;
            setControlsEnabled(state.loggedIn);
            renderContext();
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
        if (newChat) newChat.addEventListener('click', () => { clearContext(); clearLog(intro()); });
    }

    async function init() {
        try {
            const saved = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || 'null');
            if (saved?.context && ['loadout', 'ship', 'trade'].includes(saved.context.kind) && JSON.stringify(saved.context).length <= 96000) { state.context = saved.context; state.contextLabel = String(saved.label || '').slice(0, 150); }
        } catch (_error) { /* optional handoff */ }
        renderContext();
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
        state.assisted = config.data.mode === 'assisted';
        document.getElementById('ai')?.classList.add('is-data-beta');

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
        renderContext();
        const subtitle = state.assisted
            ? tr('AI 해설 베타 · 출처 있는 데이터에 짧은 설명을 더합니다.', 'AI commentary beta · Sourced data with a little more context.')
            : tr('데이터 기반 베타 · 함선, 시세, 일정과 공지를 출처와 함께 확인하세요.', 'Data-based beta · Ships, prices, events and notices, with sources.');
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

    window.VOLT_AI = { openContext };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
