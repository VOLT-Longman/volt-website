/**
 * VOLT 랜딩(홈 하이라이트) 계층 — 인터랙티브 랜딩 요소를 담당한다.
 *
 * D-①: 최신 공지 티저 렌더(DOM API — innerHTML 미사용) + 동적 수치(함선/멤버).
 * 원칙: 기존 깔끔한 톤 유지 — 절제된 모션, prefers-reduced-motion 존중, transform/opacity만.
 * 로드 순서: schedule.js 다음, main.js 이전.
 */
(function () {
    'use strict';

    // main.js가 주입하는 의존성 (랜딩 리빌은 D-⑧부터 전용 관찰자를 쓴다)
    let getAnnouncements, getShipsCount, getMemberLabel, getCalendar, currentLang, i18nT;

    function init(deps) {
        ({
            getAnnouncements, getShipsCount, getMemberLabel, getCalendar, currentLang, i18nT,
        } = deps || {});
    }

    function prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

    // ===== Mission Control 콘솔 (F) =====
    // FLEET OPS 행: 다가오는 작전(상태 '예정' 우선, 없으면 첫 일정) 제목 표시
    function renderConsoleEvent() {
        const target = document.querySelector('[data-console="event"]');
        const events = typeof getCalendar === 'function' ? getCalendar() : null;
        if (!target || !Array.isArray(events) || events.length === 0) return;
        const next = events.find((event) => String(event.status || '') === '예정') || events[0];
        if (!next || !next.title) return;
        target.removeAttribute('data-i18n'); // 실데이터가 채워지면 fallback 번역 대상에서 제외
        target.textContent = next.title;
    }

    // SHIPDB LIVE / LAST SYNC 행: 라이브 레이어 파일 헤더만 Range로 읽어 파싱한다.
    // (전체 파일은 ~250KB — 헤더 주석에 syncedAt과 matched 척수가 기록되어 있다.)
    // 콘솔은 장식 계층 — 실패 시 정적 기본값을 유지하고 조용히 넘어간다.
    async function loadConsoleSyncMeta() {
        const shipsTarget = document.querySelector('[data-console="ships"] strong');
        const syncTarget = document.querySelector('[data-console="sync"]');
        if (!shipsTarget && !syncTarget) return;
        try {
            const response = await fetch('data/ship-live-stats.js', {
                headers: { Range: 'bytes=0-400' },
                cache: 'no-cache'
            });
            if (!response.ok) return; // 206(부분) 또는 200(전체) 모두 ok
            const text = (await response.text()).slice(0, 2000);
            const synced = text.match(/syncedAt: ([0-9TZ:.\-]+)/)?.[1];
            const matched = text.match(/matched (\d+)척/)?.[1];
            if (matched && shipsTarget) shipsTarget.textContent = matched;
            if (synced && syncTarget) syncTarget.textContent = synced.slice(0, 10).replace(/-/g, '.');
        } catch (_error) {
            /* 오프라인/차단 등 — 기본값 유지 */
        }
    }

    function render() {
        renderNoticeTeaser();
        renderCounts();
        renderConsoleEvent();
    }

    // ===== 스타필드 + 스타맵 루트 (D-②, F) =====
    // 히어로 첫 화면(100vh)에만 그리는 캔버스: 별 배경 + 항성계 노드/무역 루트 + 마우스 시차.
    // 가드: reduced-motion=정적 1회, 탭 백그라운드/홈 비활성 시 프레임 스킵, 모바일 별 수 축소.
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

    // 항성계 노드(정규화 좌표)와 무역 루트 — VOLT 물류 정체성의 배경 장치 (F).
    // 히어로 중앙 콘텐츠를 피해 가장자리에 배치한다.
    const STAR_SYSTEMS = [
        { x: 0.10, y: 0.26, label: 'STANTON' },
        { x: 0.30, y: 0.10, label: 'PYRO' },
        { x: 0.88, y: 0.16, label: 'TERRA' },
        { x: 0.16, y: 0.78, label: 'MAGNUS' },
        { x: 0.86, y: 0.72, label: 'NYX' }
    ];
    const TRADE_ROUTES = [[0, 1], [1, 2], [0, 3], [3, 4], [2, 4]];

    // 루트를 살짝 휘게 하는 제어점 (두 노드 중점에서 수직 방향 오프셋)
    function routeControl(a, b, w, h) {
        const mx = ((a.x + b.x) / 2) * w;
        const my = ((a.y + b.y) / 2) * h;
        const dx = (b.x - a.x) * w;
        const dy = (b.y - a.y) * h;
        const len = Math.hypot(dx, dy) || 1;
        const bend = Math.min(60, len * 0.14);
        return { x: mx - (dy / len) * bend, y: my + (dx / len) * bend };
    }

    function drawStarMap(ctx, w, h, t, parallaxX, parallaxY) {
        const px = parallaxX * 0.5;
        const py = parallaxY * 0.5;
        const point = (s) => ({ x: s.x * w - px, y: s.y * h - py });
        // 무역 루트: 느리게 흐르는 대시 + 루트 위를 이동하는 화물 점
        for (let i = 0; i < TRADE_ROUTES.length; i++) {
            const [ai, bi] = TRADE_ROUTES[i];
            const a = point(STAR_SYSTEMS[ai]);
            const b = point(STAR_SYSTEMS[bi]);
            const c = routeControl(STAR_SYSTEMS[ai], STAR_SYSTEMS[bi], w, h);
            ctx.strokeStyle = 'rgba(232, 72, 47, 0.14)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 9]);
            ctx.lineDashOffset = -(t * 0.008 + i * 12);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(c.x - px, c.y - py, b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);
            // 화물 점: 루트마다 위상이 다른 왕복 없는 단방향 이동
            const s = ((t * 0.00003 * (1 + i * 0.35)) + i * 0.21) % 1;
            const inv = 1 - s;
            const dotX = inv * inv * a.x + 2 * inv * s * (c.x - px) + s * s * b.x;
            const dotY = inv * inv * a.y + 2 * inv * s * (c.y - py) + s * s * b.y;
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = '#ff8d70';
            ctx.beginPath();
            ctx.arc(dotX, dotY, 1.6, 0, 6.2832);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        // 항성계 노드 + 라벨
        ctx.font = '600 10px ui-monospace, Consolas, monospace';
        for (let i = 0; i < STAR_SYSTEMS.length; i++) {
            const node = point(STAR_SYSTEMS[i]);
            const pulse = 0.5 + Math.sin(t * 0.0012 + i * 1.7) * 0.2;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#e8482f';
            ctx.beginPath();
            ctx.arc(node.x, node.y, 2.2, 0, 6.2832);
            ctx.fill();
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = '#e8482f';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(node.x, node.y, 6 + pulse * 3, 0, 6.2832);
            ctx.stroke();
            ctx.globalAlpha = 0.34;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(STAR_SYSTEMS[i].label, node.x + 11, node.y + 3);
            ctx.globalAlpha = 1;
        }
    }

    function initStarfield() {
        const canvas = document.getElementById('hero-starfield');
        if (!canvas || typeof canvas.getContext !== 'function') return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const isMobile = window.matchMedia('(max-width: 860px)').matches;
        const COUNT = isMobile ? 55 : 120;
        let stars = [];

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.max(1, canvas.clientWidth * dpr);
            canvas.height = Math.max(1, canvas.clientHeight * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function seed() {
            stars = Array.from({ length: COUNT }, () => ({
                x: Math.random(),
                y: Math.random(),
                depth: 0.35 + Math.random() * 0.65, // 깊이 — 시차·밝기·크기에 공통 적용
                r: 0.4 + Math.random() * 1.1,
                tw: Math.random() * Math.PI * 2
            }));
        }

        function draw(t) {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            if (!w || !h) return;
            ctx.clearRect(0, 0, w, h);
            pointer.x += (pointer.tx - pointer.x) * 0.04;
            pointer.y += (pointer.ty - pointer.y) * 0.04;
            for (const s of stars) {
                const px = (pointer.x - 0.5) * 18 * s.depth;
                const py = (pointer.y - 0.5) * 12 * s.depth;
                const y = (s.y * h + t * 0.004 * s.depth) % h; // 초저속 하강 드리프트
                const alpha = 0.22 + 0.42 * s.depth + Math.sin(t * 0.001 + s.tw) * 0.12;
                ctx.globalAlpha = Math.max(0.08, Math.min(0.75, alpha));
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(s.x * w - px, y - py, s.r * s.depth, 0, 6.2832);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            // 스타맵 루트 레이어 (F) — 별 위에 그린다
            drawStarMap(ctx, w, h, t, (pointer.x - 0.5) * 18, (pointer.y - 0.5) * 12);
        }

        resize();
        seed();
        window.addEventListener('resize', resize, { passive: true });

        if (prefersReducedMotion()) {
            draw(0); // 모션 없이 정적 별만
            return;
        }
        document.addEventListener('pointermove', (event) => {
            pointer.tx = event.clientX / window.innerWidth;
            pointer.ty = event.clientY / window.innerHeight;
        }, { passive: true });
        (function frame(t) {
            window.requestAnimationFrame(frame);
            // 홈 섹션 비활성(display:none → offsetParent null) 또는 백그라운드 탭이면 그리지 않음
            if (document.hidden || !canvas.offsetParent) return;
            draw(t);
        })(0);
    }

    // 히어로 진입 모션 — 스플래시가 걷히는 시점에 main.js가 호출한다.
    function startHeroEntrance() {
        document.getElementById('home')?.classList.add('hero-enter');
    }

    // ===== 마이크로 인터랙션 (D-③) =====
    const fineMotionOk = () => !prefersReducedMotion() && window.matchMedia('(pointer: fine)').matches;

    // 스탯 카운트업: 뷰포트 진입 시 1회, "1,230+" 같은 콤마/접미사 표기 유지
    function setupCountup() {
        const targets = document.querySelectorAll('[data-countup]');
        if (!targets.length || !('IntersectionObserver' in window)) return;
        const animate = (element) => {
            const raw = element.textContent.trim();
            const match = raw.match(/^([\d,]+)(.*)$/);
            if (!match) return;
            const finalValue = Number(match[1].replace(/,/g, ''));
            const suffix = match[2] || '';
            const useComma = match[1].includes(',');
            if (!Number.isFinite(finalValue) || finalValue <= 0) return;
            if (prefersReducedMotion()) return; // 즉시 최종값 유지
            const start = performance.now();
            const DURATION = 900;
            let lastWritten = raw;
            (function tick(now) {
                // 외부 갱신 감지(예: 라이브 멤버 수) → 카운트업 중단하고 외부 값을 존중한다
                if (element.textContent !== lastWritten) return;
                const progress = Math.min(1, (now - start) / DURATION);
                const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
                const value = Math.round(finalValue * eased);
                lastWritten = (useComma ? value.toLocaleString('en-US') : String(value)) + suffix;
                element.textContent = lastWritten;
                if (progress < 1) window.requestAnimationFrame(tick);
            })(start);
        };
        const seen = new WeakSet();
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting || seen.has(entry.target)) continue;
                seen.add(entry.target);
                observer.unobserve(entry.target);
                animate(entry.target);
            }
        }, { threshold: 0.4 });
        targets.forEach((element) => observer.observe(element));
    }

    // 카드 틸트: 커서 위치 따라 미세 기울임(최대 4도). 터치/모션 최소화 환경에선 비활성.
    // 같은 좌표로 스포트라이트 글로우 위치(--spot-*)도 갱신한다 (D-⑦).
    function setupTilt() {
        if (!fineMotionOk()) return;
        document.querySelectorAll('[data-tilt]').forEach((card) => {
            card.addEventListener('pointermove', (event) => {
                const rect = card.getBoundingClientRect();
                const px = (event.clientX - rect.left) / rect.width;
                const py = (event.clientY - rect.top) / rect.height;
                const rx = (py - 0.5) * -4;
                const ry = (px - 0.5) * 4;
                card.classList.add('is-tilting');
                card.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-2px)`;
                card.style.setProperty('--spot-x', `${(px * 100).toFixed(1)}%`);
                card.style.setProperty('--spot-y', `${(py * 100).toFixed(1)}%`);
            });
            card.addEventListener('pointerleave', () => {
                card.classList.remove('is-tilting');
                card.style.transform = '';
            });
        });
    }

    // 마그네틱 CTA: 히어로/랜딩 주요 버튼이 커서 쪽으로 살짝(최대 3px) 끌림
    function setupMagnetic() {
        if (!fineMotionOk()) return;
        document.querySelectorAll('#home .hero-buttons .btn').forEach((button) => {
            button.addEventListener('pointermove', (event) => {
                const rect = button.getBoundingClientRect();
                const dx = ((event.clientX - rect.left) / rect.width - 0.5) * 6;
                const dy = ((event.clientY - rect.top) / rect.height - 0.5) * 4;
                button.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
            });
            button.addEventListener('pointerleave', () => {
                button.style.transform = '';
            });
        });
    }

    // 히어로 스크롤 패럴랙스 (D-⑦): 스크롤에 따라 히어로 콘텐츠가 배경보다 살짝 느리게
    // 밀리며 옅어지고, 스타필드는 더 느리게 흘러 깊이감을 만든다.
    // 가드: reduced-motion 비활성, 홈 섹션 숨김(offsetParent null) 시 생략, y=0이면 인라인 제거.
    function setupHeroParallax() {
        if (prefersReducedMotion()) return;
        // 콘솔 포함 히어로 전체(.hero-layout)를 움직인다 (F에서 대상 변경)
        const content = document.querySelector('#home .hero-layout') || document.querySelector('#home .hero-content');
        const canvas = document.getElementById('hero-starfield');
        if (!content) return;
        let ticking = false;
        function apply() {
            ticking = false;
            if (!content.offsetParent) return;
            const y = Math.min(window.scrollY, window.innerHeight);
            const progress = Math.min(1, y / (window.innerHeight * 0.72));
            content.style.transform = y ? `translateY(${(y * 0.18).toFixed(1)}px)` : '';
            content.style.opacity = y ? (1 - progress * 0.85).toFixed(3) : '';
            if (canvas) canvas.style.transform = y ? `translateY(${(y * 0.3).toFixed(1)}px)` : '';
        }
        window.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(apply);
        }, { passive: true });
    }

    // 랜딩 리빌 전용 관찰자 (D-⑧): 전역 관찰자는 요소가 1픽셀만 걸쳐도 즉시 리빌해
    // 큰 화면에선 로드 직후 하이라이트가 미리 밝혀진다. 여기서는 요소가 뷰포트 하단
    // 20% 위로 올라와야 리빌 — 스크롤/아래 버튼으로 진입해야 등장 모션이 보인다.
    function setupLandingReveals() {
        const highlights = document.getElementById('home-highlights');
        if (!highlights) return;
        const targets = highlights.querySelectorAll('.reveal:not(.revealed)');
        if (!targets.length) return;
        // 관찰자 미지원 환경은 즉시 전부 표시 (영구 숨김 방지)
        if (!('IntersectionObserver' in window)) {
            targets.forEach((target) => { target.classList.add('revealed'); });
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -20% 0px' });
        targets.forEach((target) => { observer.observe(target); });
    }

    function setup() {
        initStarfield();
        setupLandingReveals();
        setupCountup();
        setupTilt();
        setupMagnetic();
        setupHeroParallax();
        loadConsoleSyncMeta();
    }

    window.VOLT_LANDING = {
        init,
        setup,
        render,
        renderNoticeTeaser,
        renderCounts,
        startHeroEntrance,
    };
})();
