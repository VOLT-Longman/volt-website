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
    let getAnnouncements, getShipsCount, getMemberLabel, currentLang;

    function init(deps) {
        ({
            getAnnouncements, getShipsCount, getMemberLabel, currentLang,
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
        const memberLabel = getMemberLabel();
        if (members && memberLabel) members.textContent = memberLabel;
    }

    function render() {
        renderNoticeTeaser();
        renderCounts();
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
                const eased = 1 - (1 - progress) ** 3; // easeOutCubic
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
        targets.forEach((element) => { observer.observe(element); });
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
        setupLandingReveals();
        setupCountup();
        setupTilt();
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
