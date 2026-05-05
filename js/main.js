/**
 * VOLT Fleet - Main Script
 * ========================
 *
 * 구조:
 * 1. Renderers - 데이터를 HTML로 렌더링하는 함수들
 * 2. Navigation - 섹션 전환 및 모바일 메뉴
 * 3. Effects - 스크롤 효과 등
 * 4. Initialization - 페이지 로드 시 실행
 *
 * 향후 확장 시:
 * - 각 Renderer를 React/Vue 컴포넌트로 변환 쉬움
 * - 데이터 소스를 fetch()로 변경하면 API 연동
 * - showSection()을 React Router로 교체 가능
 */

(function() {
    'use strict';

    // ===== 데이터 가져오기 =====
    const data = window.VOLT_DATA;

    if (!data) {
        console.error('VOLT_DATA가 로드되지 않았습니다. data/volt-data.js 파일이 먼저 로드되어야 합니다.');
        return;
    }

    // ============================================================
    // 1. RENDERERS - 데이터 → HTML 변환
    // ============================================================

    /**
     * HTML 문자열의 특수문자를 이스케이프 (XSS 방지)
     * 향후 사용자 입력 콘텐츠 표시 시 필수
     */
    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 임원진 카드 렌더링
     */
    function renderLeaders() {
        const container = document.getElementById('leadership-grid');
        if (!container) return;

        container.innerHTML = data.leadership.map(leader => {
            const isCeo = leader.avatarStyle === 'ceo';
            const cardClass = isCeo ? 'leader-card ceo-card' : 'leader-card';
            const avatarStyle = leader.avatarGradient
                ? `style="background: ${leader.avatarGradient};"`
                : '';

            // 상세 정보 (CEO만 사용)
            const detailsHtml = leader.details ? `
                <div class="leader-details">
                    ${leader.details.map(d => `
                        <div class="leader-details-item">
                            <strong>${escapeHtml(d.title)}</strong>
                            <p>${escapeHtml(d.content)}</p>
                        </div>
                    `).join('')}
                </div>
            ` : '';

            // 핵심 역량 (CEO만 사용)
            const competenciesHtml = leader.competencies ? `
                <div class="leader-competencies">
                    <strong>핵심 역량</strong>
                    <ul>
                        ${leader.competencies.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
                    </ul>
                </div>
            ` : '';

            // 일반 임원진 업무
            const dutiesHtml = leader.duties ? `
                <div class="leader-duties">
                    <strong>주요 업무</strong> · ${escapeHtml(leader.duties)}
                </div>
            ` : '';

            return `
                <div class="${cardClass}">
                    <div class="leader-avatar" ${avatarStyle} aria-hidden="true">${escapeHtml(leader.avatar)}</div>
                    <div class="leader-info">
                        <h3>${escapeHtml(leader.name)}</h3>
                        <span class="leader-role">${escapeHtml(leader.role)}</span>
                        <p class="leader-contact">Discord: ${escapeHtml(leader.discord)}</p>
                        <p class="leader-description">${escapeHtml(leader.description)}</p>
                        ${detailsHtml}
                        ${competenciesHtml}
                        ${dutiesHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 스트리머 카드 렌더링 (프로필 이미지 포함)
     */
    function renderStreamers() {
        const container = document.getElementById('streamers-grid');
        if (!container) return;

        container.innerHTML = data.streamers.map(streamer => {
            // 이미지가 있으면 img 태그, 없으면 그라디언트 배경
            const iconContent = streamer.image
                ? `<img src="${escapeHtml(streamer.image)}" alt="${escapeHtml(streamer.name)} 프로필"
                       onerror="this.parentElement.innerHTML='<div class=&quot;streamer-icon-fallback&quot;>👤</div>'">`
                : `<div class="streamer-icon-fallback">👤</div>`;

            const sectionsHtml = streamer.sections.map(s => `
                <div class="streamer-sub-section">
                    <h4>${escapeHtml(s.title)}</h4>
                    <p>${s.content}</p>
                </div>
            `).join('');

            return `
                <div class="streamer-card">
                    <div class="streamer-icon" aria-hidden="true">
                        ${iconContent}
                    </div>
                    <h3>${escapeHtml(streamer.name)}</h3>
                    <span class="streamer-platform">${escapeHtml(streamer.platform)}</span>
                    <p class="streamer-description">${escapeHtml(streamer.description)}</p>
                    <div class="streamer-details">
                        ${sectionsHtml}
                    </div>
                    <a href="${escapeHtml(streamer.channelUrl)}" target="_blank" rel="noopener noreferrer" class="streamer-link">방송 보기</a>
                </div>
            `;
        }).join('');
    }

    /**
     * 연혁 타임라인 렌더링
     */
    function renderTimeline() {
        const container = document.getElementById('timeline-list');
        if (!container) return;

        container.innerHTML = data.timeline.map(item => `
            <div class="timeline-item">
                <div class="timeline-date">${escapeHtml(item.date)}</div>
                <div class="timeline-title">${escapeHtml(item.title)}</div>
                <div class="timeline-desc">${escapeHtml(item.description)}</div>
            </div>
        `).join('');
    }

    /**
     * 부서 카드 렌더링
     */
    function renderDepartments() {
        const container = document.getElementById('about-grid');
        if (!container) return;

        container.innerHTML = data.departments.map(dept => `
            <div class="card about-card">
                <h3>${escapeHtml(dept.icon)} ${escapeHtml(dept.name)}</h3>
                <p>${escapeHtml(dept.description)}</p>
            </div>
        `).join('');
    }

    /**
     * 핵심 가치 렌더링
     */
    function renderCoreValues() {
        const container = document.getElementById('culture-grid');
        if (!container) return;

        container.innerHTML = data.coreValues.map(value => `
            <div class="culture-item">
                <h4>${escapeHtml(value.title)}</h4>
                <p>${escapeHtml(value.description)}</p>
            </div>
        `).join('');
    }

    /**
     * 무역허브 기능 렌더링
     */
    function renderHubFeatures() {
        const container = document.getElementById('hub-features');
        if (!container) return;

        container.innerHTML = data.hub.features.map(feature => `
            <div class="hub-feature">
                <h4>${escapeHtml(feature.icon)} ${escapeHtml(feature.title)}</h4>
                <ul>
                    ${feature.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                </ul>
            </div>
        `).join('');
    }

    /**
     * 가입 절차 렌더링
     */
    function renderJoinSteps() {
        const container = document.getElementById('join-steps');
        if (!container) return;

        container.innerHTML = data.joinSteps.map(step => `
            <div class="join-step">
                <div class="step-number" aria-hidden="true">${step.number}</div>
                <h4>${escapeHtml(step.title)}</h4>
                <p>${escapeHtml(step.description)}</p>
            </div>
        `).join('');
    }

    /**
     * 모든 동적 콘텐츠 렌더링
     */
    function renderAll() {
        renderDepartments();
        renderCoreValues();
        renderTimeline();
        renderLeaders();
        renderHubFeatures();
        renderStreamers();
        renderJoinSteps();
    }

    // ============================================================
    // 2. NAVIGATION - 섹션 전환 시스템
    // ============================================================

    /**
     * 섹션 전환 (SPA 스타일)
     * 향후 React Router로 교체 시 이 함수만 변경
     */
    function showSection(sectionId) {
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });

        const home = document.getElementById('home');

        if (sectionId === 'home') {
            home.style.display = 'flex';
        } else {
            home.style.display = 'none';
            const targetSection = document.getElementById(sectionId);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });

        // 향후 확장: URL 업데이트로 브라우저 히스토리 관리
        // history.pushState({}, '', `#${sectionId}`);
    }

    /**
     * 모든 [data-section] 링크에 클릭 핸들러 부여
     */
    function setupNavigationLinks() {
        document.querySelectorAll('[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const sectionId = link.getAttribute('data-section');
                showSection(sectionId);
            });
        });
    }

    /**
     * 모바일 메뉴 시스템
     */
    function setupMobileMenu() {
        const hamburger = document.getElementById('hamburger');
        const mobileMenu = document.getElementById('mobileMenu');
        const mobileMenuClose = document.getElementById('mobileMenuClose');

        if (!hamburger || !mobileMenu || !mobileMenuClose) return;

        function open() {
            mobileMenu.classList.add('active');
            hamburger.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
        }

        function close() {
            mobileMenu.classList.remove('active');
            hamburger.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        }

        hamburger.addEventListener('click', open);
        mobileMenuClose.addEventListener('click', close);

        // ESC 키로 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
                close();
            }
        });

        // 메뉴 내 링크 클릭 시 자동 닫기
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (mobileMenu.classList.contains('active')) {
                    close();
                }
            });
        });
    }

    // ============================================================
    // 3. EFFECTS - 스크롤, 애니메이션
    // ============================================================

    /**
     * 네비게이션 스크롤 효과
     */
    function setupScrollEffect() {
        const nav = document.getElementById('nav');
        if (!nav) return;

        let scrollTicking = false;

        window.addEventListener('scroll', () => {
            if (!scrollTicking) {
                window.requestAnimationFrame(() => {
                    if (window.scrollY > 50) {
                        nav.classList.add('scrolled');
                    } else {
                        nav.classList.remove('scrolled');
                    }
                    scrollTicking = false;
                });
                scrollTicking = true;
            }
        }, { passive: true });
    }

    // ============================================================
    // 4. INITIALIZATION
    // ============================================================

    function init() {
        // 데이터 기반 콘텐츠 렌더링
        renderAll();

        // 인터랙션 설정
        setupNavigationLinks();
        setupMobileMenu();
        setupScrollEffect();

        // 초기 화면 표시
        showSection('home');
    }

    // DOM 준비되면 실행
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================================
    // 향후 확장을 위한 글로벌 API 노출
    // ============================================================
    window.VOLT_APP = {
        showSection,
        renderAll,
        renderLeaders,
        renderStreamers,
        renderTimeline,
        // 향후 추가될 메서드들:
        // - login(provider) : Discord OAuth
        // - uploadGalleryImage(file) : 갤러리 업로드
        // - updateContent(section, data) : 관리자 편집
    };
})();
