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
    let getAnnouncements, getShipsCount, getMemberLabel, currentLang, i18nT, observeNewReveals;

    function init(deps) {
        ({
            getAnnouncements, getShipsCount, getMemberLabel, currentLang, i18nT, observeNewReveals,
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

    function render() {
        renderNoticeTeaser();
        renderCounts();
    }

    // ===== 스타필드 (D-②) =====
    // 히어로 첫 화면(100vh)에만 그리는 캔버스 별 배경 + 마우스 시차.
    // 가드: reduced-motion=정적 1회, 탭 백그라운드/홈 비활성 시 프레임 스킵, 모바일 별 수 축소.
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
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
    function setupTilt() {
        if (!fineMotionOk()) return;
        document.querySelectorAll('[data-tilt]').forEach((card) => {
            card.addEventListener('pointermove', (event) => {
                const rect = card.getBoundingClientRect();
                const rx = ((event.clientY - rect.top) / rect.height - 0.5) * -4;
                const ry = ((event.clientX - rect.left) / rect.width - 0.5) * 4;
                card.classList.add('is-tilting');
                card.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-2px)`;
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

    function setup() {
        initStarfield();
        // 랜딩 정적 블록에 기존 스크롤 리빌 적용
        const highlights = document.getElementById('home-highlights');
        if (highlights && observeNewReveals) observeNewReveals(highlights);
        setupCountup();
        setupTilt();
        setupMagnetic();
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
