/**
 * VOLT Fleet - Main Script (v2)
 * ==============================
 * 1. Renderers  - 데이터 → HTML
 * 2. Navigation - 섹션 전환 / URL / 모바일 / 활성 링크
 * 3. Features   - 스플래시 / 테마 / 스크롤 상단 / reveal
 * 4. Init
 */

(function () {
    'use strict';

    const data = window.VOLT_DATA;
    if (!data) { console.error('VOLT_DATA 미로드'); return; }

    // ============================================================
    // UTIL
    // ============================================================
    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ============================================================
    // 1. RENDERERS
    // ============================================================

    function renderLeaders() {
        const c = document.getElementById('leadership-grid');
        if (!c) return;
        c.innerHTML = data.leadership.map(l => {
            const isCeo = l.avatarStyle === 'ceo';
            const avatarStyle = l.avatarGradient ? `style="background:${l.avatarGradient};"` : '';
            const detailsHtml = l.details ? `<div class="leader-details">${l.details.map(d=>`
                <div class="leader-details-item"><strong>${escapeHtml(d.title)}</strong><p>${escapeHtml(d.content)}</p></div>`).join('')}</div>` : '';
            const compHtml = l.competencies ? `<div class="leader-competencies"><strong>핵심 역량</strong><ul>${l.competencies.map(c=>`<li>${escapeHtml(c)}</li>`).join('')}</ul></div>` : '';
            const dutiesHtml = l.duties ? `<div class="leader-duties"><strong>주요 업무</strong> · ${escapeHtml(l.duties)}</div>` : '';
            return `<div class="${isCeo?'leader-card ceo-card':'leader-card'} reveal">
                <div class="leader-avatar" ${avatarStyle} aria-hidden="true">${escapeHtml(l.avatar)}</div>
                <div class="leader-info">
                    <h3>${escapeHtml(l.name)}</h3>
                    <span class="leader-role">${escapeHtml(l.role)}</span>
                    <p class="leader-contact">Discord: ${escapeHtml(l.discord)}</p>
                    <p class="leader-description">${escapeHtml(l.description)}</p>
                    ${detailsHtml}${compHtml}${dutiesHtml}
                </div></div>`;
        }).join('');
    }

    function renderStreamers() {
        const c = document.getElementById('streamers-grid');
        if (!c) return;
        c.innerHTML = data.streamers.map(s => {
            const icon = s.image
                ? `<img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.name)}" onerror="this.parentElement.innerHTML='<div class=&quot;streamer-icon-fallback&quot;>👤</div>'">`
                : `<div class="streamer-icon-fallback">👤</div>`;
            const secs = s.sections.map(sec=>`<div class="streamer-sub-section"><h4>${escapeHtml(sec.title)}</h4><p>${sec.content}</p></div>`).join('');
            return `<div class="streamer-card reveal">
                <div class="streamer-icon">${icon}</div>
                <h3>${escapeHtml(s.name)}</h3>
                <span class="streamer-platform">${escapeHtml(s.platform)}</span>
                <p class="streamer-description">${escapeHtml(s.description)}</p>
                <div class="streamer-details">${secs}</div>
                <a href="${escapeHtml(s.channelUrl)}" target="_blank" rel="noopener noreferrer" class="streamer-link">방송 보기</a>
            </div>`;
        }).join('');
    }

    function renderTimeline() {
        const c = document.getElementById('timeline-list');
        if (!c) return;
        c.innerHTML = data.timeline.map(t=>`
            <div class="timeline-item reveal">
                <div class="timeline-date">${escapeHtml(t.date)}</div>
                <div class="timeline-title">${escapeHtml(t.title)}</div>
                <div class="timeline-desc">${escapeHtml(t.description)}</div>
            </div>`).join('');
    }

    function renderDepartments() {
        const c = document.getElementById('about-grid');
        if (!c) return;
        c.innerHTML = data.departments.map(d=>`
            <div class="card about-card reveal">
                <h3>${escapeHtml(d.icon)} ${escapeHtml(d.name)}</h3>
                <p>${escapeHtml(d.description)}</p>
            </div>`).join('');
    }

    function renderCoreValues() {
        const c = document.getElementById('culture-grid');
        if (!c) return;
        c.innerHTML = data.coreValues.map(v=>`
            <div class="culture-item reveal">
                <h4>${escapeHtml(v.title)}</h4>
                <p>${escapeHtml(v.description)}</p>
            </div>`).join('');
    }

    function renderHubFeatures() {
        const c = document.getElementById('hub-features');
        if (!c) return;
        c.innerHTML = data.hub.features.map(f=>`
            <div class="hub-feature reveal">
                <h4>${escapeHtml(f.icon)} ${escapeHtml(f.title)}</h4>
                <ul>${f.items.map(i=>`<li>${escapeHtml(i)}</li>`).join('')}</ul>
            </div>`).join('');
    }

    function renderJoinSteps() {
        const c = document.getElementById('join-steps');
        if (!c) return;
        c.innerHTML = data.joinSteps.map(s=>`
            <div class="join-step reveal">
                <div class="step-number">${s.number}</div>
                <h4>${escapeHtml(s.title)}</h4>
                <p>${escapeHtml(s.description)}</p>
            </div>`).join('');
    }

    function renderFooterStreamers() {
        const c = document.getElementById('footer-streamers-list');
        if (!c) return;
        c.innerHTML = data.streamers.map(s=>`
            <li><a href="${escapeHtml(s.channelUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a></li>`).join('');
    }

    // ── 공지사항 ──
    function renderAnnouncements() {
        const c = document.getElementById('notices-list');
        if (!c || !data.announcements) return;
        const tagColors = { orange:'var(--volt-orange)', red:'#e53e3e', blue:'#3182ce', green:'#38a169' };
        c.innerHTML = data.announcements.map(a=>`
            <div class="notice-card reveal">
                <div class="notice-meta">
                    <span class="notice-tag" style="background:${tagColors[a.tagColor]||'var(--volt-orange)'}20;color:${tagColors[a.tagColor]||'var(--volt-orange)'};">${escapeHtml(a.tag)}</span>
                    <span class="notice-date">${escapeHtml(a.date)}</span>
                </div>
                <h3 class="notice-title">${escapeHtml(a.title)}</h3>
                <p class="notice-content">${escapeHtml(a.content)}</p>
            </div>`).join('');
    }

    // ── 함선 데이터베이스 ──
    let allShips = [];

    function renderShips(filter = 'all', query = '') {
        const c = document.getElementById('ships-grid');
        if (!c || !data.ships) return;

        const filtered = data.ships.filter(s => {
            const matchFilter = filter === 'all' || s.tags.includes(filter);
            const q = query.toLowerCase();
            const matchQuery = !q || s.name.toLowerCase().includes(q) || s.manufacturer.toLowerCase().includes(q) || s.role.toLowerCase().includes(q);
            return matchFilter && matchQuery;
        });

        if (filtered.length === 0) {
            c.innerHTML = '<div class="ships-empty">검색 결과가 없습니다.</div>';
            return;
        }

        const focusColors = { 물류:'#f6ad55', 전투:'#fc8181', 탐사:'#68d391', 채굴:'#76e4f7' };
        c.innerHTML = filtered.map(s=>`
            <div class="ship-card reveal">
                <div class="ship-card-header">
                    <div>
                        <h3 class="ship-name">${escapeHtml(s.name)}</h3>
                        <span class="ship-mfr">${escapeHtml(s.manufacturer)}</span>
                    </div>
                    <span class="ship-focus-badge" style="background:${focusColors[s.focus]||'#a0aec0'}22;color:${focusColors[s.focus]||'#a0aec0'};">${escapeHtml(s.focus)}</span>
                </div>
                <p class="ship-desc">${escapeHtml(s.description)}</p>
                <div class="ship-stats">
                    <div class="ship-stat"><span class="ship-stat-label">역할</span><span class="ship-stat-value">${escapeHtml(s.role)}</span></div>
                    <div class="ship-stat"><span class="ship-stat-label">크기</span><span class="ship-stat-value">${escapeHtml(s.size)}</span></div>
                    <div class="ship-stat"><span class="ship-stat-label">승무원</span><span class="ship-stat-value">${escapeHtml(s.crew)}</span></div>
                    <div class="ship-stat"><span class="ship-stat-label">화물</span><span class="ship-stat-value">${escapeHtml(s.cargo)}</span></div>
                </div>
                <div class="ship-tags">${s.tags.map(t=>`<span class="ship-tag">${escapeHtml(t)}</span>`).join('')}</div>
            </div>`).join('');

        // 새로 렌더링된 reveal 요소 Observer 등록
        if (revealObserver) {
            c.querySelectorAll('.reveal:not(.revealed)').forEach(el => revealObserver.observe(el));
        }
    }

    function setupShipFilters() {
        const btns = document.querySelectorAll('.ship-filter-btn');
        const search = document.getElementById('ship-search');
        let currentFilter = 'all';
        let currentQuery = '';

        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.getAttribute('data-filter');
                renderShips(currentFilter, currentQuery);
            });
        });

        if (search) {
            search.addEventListener('input', () => {
                currentQuery = search.value;
                renderShips(currentFilter, currentQuery);
            });
        }
    }

    // ── 작전 일정 ──
    function renderSchedule() {
        const c = document.getElementById('schedule-list');
        if (!c || !data.calendar) return;
        const statusColors = { 예정:'var(--volt-orange)', 대기:'#a0aec0', 계획:'#63b3ed' };
        c.innerHTML = data.calendar.map(e=>`
            <div class="schedule-item reveal">
                <div class="schedule-date-col">
                    <span class="schedule-date">${escapeHtml(e.dateLabel)}</span>
                    <span class="schedule-status" style="color:${statusColors[e.status]||'#a0aec0'};">${escapeHtml(e.status)}</span>
                </div>
                <div class="schedule-body">
                    <div class="schedule-type-badge">${escapeHtml(e.type)}</div>
                    <h3>${escapeHtml(e.title)}</h3>
                    <p>${escapeHtml(e.description)}</p>
                </div>
            </div>`).join('');
    }

    // ── 운영정책 ──
    function renderPolicy() {
        const c = document.getElementById('policy-list');
        if (!c || !data.policy) return;
        const noticeHtml = (notice) => notice ? `<div class="policy-notice">${escapeHtml(notice)}</div>` : '';
        c.innerHTML = `
            <div class="policy-updated">최종 업데이트: ${escapeHtml(data.policy.lastUpdated)}</div>
            ${data.policy.sections.map(sec=>`
                <div class="policy-section reveal">
                    <h3 class="policy-section-title">${escapeHtml(sec.title)}</h3>
                    ${noticeHtml(sec.notice)}
                    <div class="policy-items">
                        ${sec.items.map(item=>`
                            <div class="policy-item">
                                <span class="policy-num">${escapeHtml(item.num)}</span>
                                <span class="policy-text">${escapeHtml(item.text)}</span>
                            </div>`).join('')}
                    </div>
                </div>`).join('')}`;
    }

    // ── FAQ 아코디언 ──
    function renderFaq() {
        const c = document.getElementById('faq-list');
        if (!c || !data.faq) return;
        c.innerHTML = `<div class="faq-accordion">${data.faq.map((f, i)=>`
            <div class="faq-item reveal" id="faq-item-${i}">
                <button class="faq-question" aria-expanded="false" aria-controls="faq-ans-${i}">
                    <span>${escapeHtml(f.q)}</span>
                    <span class="faq-icon">+</span>
                </button>
                <div class="faq-answer" id="faq-ans-${i}" role="region">
                    <p>${escapeHtml(f.a)}</p>
                </div>
            </div>`).join('')}</div>`;

        c.querySelectorAll('.faq-question').forEach(btn => {
            btn.addEventListener('click', () => {
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                // 다른 항목 닫기
                c.querySelectorAll('.faq-question').forEach(b => {
                    b.setAttribute('aria-expanded', 'false');
                    b.querySelector('.faq-icon').textContent = '+';
                    b.nextElementSibling.style.maxHeight = null;
                });
                if (!expanded) {
                    btn.setAttribute('aria-expanded', 'true');
                    btn.querySelector('.faq-icon').textContent = '−';
                    const ans = btn.nextElementSibling;
                    ans.style.maxHeight = ans.scrollHeight + 'px';
                }
            });
        });
    }

    // ── 무역 가이드 ──
    function renderTradeGuide() {
        const c = document.getElementById('guide-list');
        if (!c || !data.tradeGuide) return;
        c.innerHTML = data.tradeGuide.map(g=>`
            <div class="guide-card reveal">
                <div class="guide-step-num">${g.step}</div>
                <div class="guide-icon">${escapeHtml(g.icon)}</div>
                <h3>${escapeHtml(g.title)}</h3>
                <p>${escapeHtml(g.content)}</p>
            </div>`).join('');
    }

    function renderAll() {
        renderDepartments();
        renderCoreValues();
        renderTimeline();
        renderLeaders();
        renderHubFeatures();
        renderStreamers();
        renderJoinSteps();
        renderFooterStreamers();
        renderAnnouncements();
        renderShips('all', '');
        renderSchedule();
        renderPolicy();
        renderFaq();
        renderTradeGuide();
        setupShipFilters();
    }

    // ============================================================
    // 2. NAVIGATION
    // ============================================================

    let currentSection = null;
    let revealObserver;

    const VALID_SECTIONS = ['about','timeline','leadership','hub','streamers','gallery','join','notices','ships','schedule','policy','faq','guide'];

    function updateActiveNav(id) {
        document.querySelectorAll('.nav-links [data-section]').forEach(l => {
            l.classList.toggle('nav-active', l.getAttribute('data-section') === id);
        });
    }

    function showSection(id, push = true) {
        if (id === currentSection) return;
        currentSection = id;

        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const home = document.getElementById('home');

        if (id === 'home') {
            home.style.display = 'flex';
        } else {
            home.style.display = 'none';
            const target = document.getElementById(id);
            if (target) {
                target.classList.add('active');
                if (revealObserver) {
                    target.querySelectorAll('.reveal:not(.revealed)').forEach(el => revealObserver.observe(el));
                }
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        updateActiveNav(id);

        if (push) {
            const hash = id === 'home' ? '' : `#${id}`;
            history.pushState({ section: id }, '', hash || window.location.pathname);
        }
    }

    function getInitialSection() {
        const hash = window.location.hash.replace('#', '');
        return VALID_SECTIONS.includes(hash) ? hash : 'home';
    }

    function setupNavLinks() {
        document.querySelectorAll('[data-section]').forEach(l => {
            l.addEventListener('click', e => {
                e.preventDefault();
                showSection(l.getAttribute('data-section'));
            });
        });
    }

    function setupMobileMenu() {
        const ham = document.getElementById('hamburger');
        const menu = document.getElementById('mobileMenu');
        const close = document.getElementById('mobileMenuClose');
        if (!ham || !menu || !close) return;

        const open = () => { menu.classList.add('active'); ham.setAttribute('aria-expanded','true'); document.body.style.overflow='hidden'; };
        const shut = () => { menu.classList.remove('active'); ham.setAttribute('aria-expanded','false'); document.body.style.overflow=''; };

        ham.addEventListener('click', open);
        close.addEventListener('click', shut);
        document.addEventListener('keydown', e => { if (e.key==='Escape' && menu.classList.contains('active')) shut(); });
        menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { if(menu.classList.contains('active')) shut(); }));
    }

    // ============================================================
    // 3. FEATURES
    // ============================================================

    // ── 로딩 스플래시 ──
    function setupSplash() {
        const splash = document.getElementById('loading-splash');
        if (!splash) return;
        // 페이지 로드 후 1.2초 뒤 페이드 아웃
        setTimeout(() => {
            splash.classList.add('splash-hide');
            setTimeout(() => { splash.style.display = 'none'; }, 600);
        }, 1200);
    }

    // ── 테마 토글 (다크/라이트) ──
    function setupTheme() {
        const btn = document.getElementById('theme-toggle');
        if (!btn) return;

        const saved = localStorage.getItem('volt-theme') || 'dark';
        applyTheme(saved);

        btn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
            const next = current === 'light' ? 'dark' : 'light';
            applyTheme(next);
            localStorage.setItem('volt-theme', next);
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
    }

    // ── 스크롤 상단 이동 버튼 ──
    function setupScrollTop() {
        const btn = document.getElementById('scroll-to-top');
        if (!btn) return;
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    btn.classList.toggle('visible', window.scrollY > 300);
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    // ── 네비게이션 스크롤 효과 ──
    function setupScrollEffect() {
        const nav = document.getElementById('nav');
        if (!nav) return;
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    nav.classList.toggle('scrolled', window.scrollY > 50);
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    // ── Intersection Observer reveal ──
    function setupRevealObserver() {
        revealObserver = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('revealed');
                    revealObserver.unobserve(e.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    }

    // ============================================================
    // 4. INIT
    // ============================================================

    function init() {
        setupSplash();
        setupRevealObserver();
        renderAll();
        setupNavLinks();
        setupMobileMenu();
        setupScrollEffect();
        setupScrollTop();
        setupTheme();

        window.addEventListener('popstate', e => showSection(e.state?.section || 'home', false));

        const initial = getInitialSection();
        history.replaceState({ section: initial }, '', window.location.href);
        showSection(initial, false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.VOLT_APP = { showSection, renderAll };
})();
