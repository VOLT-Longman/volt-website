/**
 * VOLT Fleet - Main Script
 * ========================
 * 1. Renderers  - 데이터를 HTML로 렌더링
 * 2. Navigation - 섹션 전환 / URL 히스토리 / 모바일 메뉴 / 활성 링크
 * 3. Effects    - 스크롤 효과 / Intersection Observer reveal
 * 4. Init       - 페이지 로드 시 실행
 */

(function () {
    'use strict';

    const data = window.VOLT_DATA;
    if (!data) {
        console.error('VOLT_DATA가 로드되지 않았습니다.');
        return;
    }

    // ============================================================
    // 1. RENDERERS
    // ============================================================

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderLeaders() {
        const container = document.getElementById('leadership-grid');
        if (!container) return;

        container.innerHTML = data.leadership.map(leader => {
            const isCeo = leader.avatarStyle === 'ceo';
            const cardClass = isCeo ? 'leader-card ceo-card reveal' : 'leader-card reveal';
            const avatarStyle = leader.avatarGradient
                ? `style="background: ${leader.avatarGradient};"` : '';

            const detailsHtml = leader.details ? `
                <div class="leader-details">
                    ${leader.details.map(d => `
                        <div class="leader-details-item">
                            <strong>${escapeHtml(d.title)}</strong>
                            <p>${escapeHtml(d.content)}</p>
                        </div>`).join('')}
                </div>` : '';

            const competenciesHtml = leader.competencies ? `
                <div class="leader-competencies">
                    <strong>핵심 역량</strong>
                    <ul>${leader.competencies.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
                </div>` : '';

            const dutiesHtml = leader.duties ? `
                <div class="leader-duties">
                    <strong>주요 업무</strong> · ${escapeHtml(leader.duties)}
                </div>` : '';

            return `
                <div class="${cardClass}">
                    <div class="leader-avatar" ${avatarStyle} aria-hidden="true">${escapeHtml(leader.avatar)}</div>
                    <div class="leader-info">
                        <h3>${escapeHtml(leader.name)}</h3>
                        <span class="leader-role">${escapeHtml(leader.role)}</span>
                        <p class="leader-contact">Discord: ${escapeHtml(leader.discord)}</p>
                        <p class="leader-description">${escapeHtml(leader.description)}</p>
                        ${detailsHtml}${competenciesHtml}${dutiesHtml}
                    </div>
                </div>`;
        }).join('');
    }

    function renderStreamers() {
        const container = document.getElementById('streamers-grid');
        if (!container) return;

        container.innerHTML = data.streamers.map(streamer => {
            const iconContent = streamer.image
                ? `<img src="${escapeHtml(streamer.image)}" alt="${escapeHtml(streamer.name)} 프로필"
                       onerror="this.parentElement.innerHTML='<div class=&quot;streamer-icon-fallback&quot;>👤</div>'">`
                : `<div class="streamer-icon-fallback">👤</div>`;

            const sectionsHtml = streamer.sections.map(s => `
                <div class="streamer-sub-section">
                    <h4>${escapeHtml(s.title)}</h4>
                    <p>${s.content}</p>
                </div>`).join('');

            return `
                <div class="streamer-card reveal">
                    <div class="streamer-icon" aria-hidden="true">${iconContent}</div>
                    <h3>${escapeHtml(streamer.name)}</h3>
                    <span class="streamer-platform">${escapeHtml(streamer.platform)}</span>
                    <p class="streamer-description">${escapeHtml(streamer.description)}</p>
                    <div class="streamer-details">${sectionsHtml}</div>
                    <a href="${escapeHtml(streamer.channelUrl)}" target="_blank" rel="noopener noreferrer" class="streamer-link">방송 보기</a>
                </div>`;
        }).join('');
    }

    function renderTimeline() {
        const container = document.getElementById('timeline-list');
        if (!container) return;

        container.innerHTML = data.timeline.map(item => `
            <div class="timeline-item reveal">
                <div class="timeline-date">${escapeHtml(item.date)}</div>
                <div class="timeline-title">${escapeHtml(item.title)}</div>
                <div class="timeline-desc">${escapeHtml(item.description)}</div>
            </div>`).join('');
    }

    function renderDepartments() {
        const container = document.getElementById('about-grid');
        if (!container) return;

        container.innerHTML = data.departments.map(dept => `
            <div class="card about-card reveal">
                <h3>${escapeHtml(dept.icon)} ${escapeHtml(dept.name)}</h3>
                <p>${escapeHtml(dept.description)}</p>
            </div>`).join('');
    }

    function renderCoreValues() {
        const container = document.getElementById('culture-grid');
        if (!container) return;

        container.innerHTML = data.coreValues.map(value => `
            <div class="culture-item reveal">
                <h4>${escapeHtml(value.title)}</h4>
                <p>${escapeHtml(value.description)}</p>
            </div>`).join('');
    }

    function renderHubFeatures() {
        const container = document.getElementById('hub-features');
        if (!container) return;

        container.innerHTML = data.hub.features.map(feature => `
            <div class="hub-feature reveal">
                <h4>${escapeHtml(feature.icon)} ${escapeHtml(feature.title)}</h4>
                <ul>${feature.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </div>`).join('');
    }

    function renderJoinSteps() {
        const container = document.getElementById('join-steps');
        if (!container) return;

        container.innerHTML = data.joinSteps.map(step => `
            <div class="join-step reveal">
                <div class="step-number" aria-hidden="true">${step.number}</div>
                <h4>${escapeHtml(step.title)}</h4>
                <p>${escapeHtml(step.description)}</p>
            </div>`).join('');
    }

    /**
     * 푸터 스트리머 링크 동적 렌더링
     * volt-data.js streamers 배열과 자동 동기화
     */
    function renderFooterStreamers() {
        const container = document.getElementById('footer-streamers-list');
        if (!container) return;

        container.innerHTML = data.streamers.map(streamer => `
            <li>
                <a href="${escapeHtml(streamer.channelUrl)}" target="_blank" rel="noopener noreferrer">
                    ${escapeHtml(streamer.name)}
                </a>
            </li>`).join('');
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
    }

    // ============================================================
    // 2. NAVIGATION
    // ============================================================

    let currentSection = null;
    let revealObserver;

    /** 활성 nav 링크 업데이트 */
    function updateActiveNav(sectionId) {
        document.querySelectorAll('.nav-links [data-section]').forEach(link => {
            link.classList.toggle('nav-active', link.getAttribute('data-section') === sectionId);
        });
    }

    /** 섹션 전환 + URL 히스토리 관리 */
    function showSection(sectionId, pushHistory = true) {
        if (sectionId === currentSection) return;
        currentSection = sectionId;

        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

        const home = document.getElementById('home');

        if (sectionId === 'home') {
            home.style.display = 'flex';
        } else {
            home.style.display = 'none';
            const target = document.getElementById(sectionId);
            if (target) {
                target.classList.add('active');
                // 해당 섹션의 reveal 요소 Observer 등록
                if (revealObserver) {
                    target.querySelectorAll('.reveal:not(.revealed)').forEach(el => {
                        revealObserver.observe(el);
                    });
                }
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        updateActiveNav(sectionId);

        if (pushHistory) {
            const hash = sectionId === 'home' ? '' : `#${sectionId}`;
            history.pushState({ section: sectionId }, '', hash || window.location.pathname);
        }
    }

    /** 뒤로가기/앞으로가기 대응 */
    function setupHistoryListener() {
        window.addEventListener('popstate', (e) => {
            const sectionId = e.state?.section || 'home';
            showSection(sectionId, false);
        });
    }

    /** 초기 URL 해시로 섹션 결정 */
    function getInitialSection() {
        const hash = window.location.hash.replace('#', '');
        const valid = ['about', 'timeline', 'leadership', 'hub', 'streamers', 'gallery', 'join'];
        return valid.includes(hash) ? hash : 'home';
    }

    function setupNavigationLinks() {
        document.querySelectorAll('[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                showSection(link.getAttribute('data-section'));
            });
        });
    }

    function setupMobileMenu() {
        const hamburger = document.getElementById('hamburger');
        const mobileMenu = document.getElementById('mobileMenu');
        const mobileMenuClose = document.getElementById('mobileMenuClose');
        if (!hamburger || !mobileMenu || !mobileMenuClose) return;

        const open = () => {
            mobileMenu.classList.add('active');
            hamburger.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
        };

        const close = () => {
            mobileMenu.classList.remove('active');
            hamburger.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        };

        hamburger.addEventListener('click', open);
        mobileMenuClose.addEventListener('click', close);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileMenu.classList.contains('active')) close();
        });

        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (mobileMenu.classList.contains('active')) close();
            });
        });
    }

    // ============================================================
    // 3. EFFECTS
    // ============================================================

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

    /** Intersection Observer - 스크롤 진입 시 reveal */
    function setupRevealObserver() {
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });
    }

    // ============================================================
    // 4. INIT
    // ============================================================

    function init() {
        renderAll();
        setupRevealObserver();
        setupNavigationLinks();
        setupMobileMenu();
        setupScrollEffect();
        setupHistoryListener();

        const initialSection = getInitialSection();
        history.replaceState({ section: initialSection }, '', window.location.href);
        showSection(initialSection, false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.VOLT_APP = {
        showSection,
        renderAll,
        renderLeaders,
        renderStreamers,
        renderTimeline,
        renderFooterStreamers,
    };
})();
