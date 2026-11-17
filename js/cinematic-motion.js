/** Optional, self-hosted GSAP enhancement. Static content is the fallback. */
(function () {
    'use strict';
    const { gsap, ScrollTrigger } = window;
    const home = document.getElementById('home');
    if (!gsap || !ScrollTrigger || !home) return;

    gsap.registerPlugin(ScrollTrigger);
    let ready = false;
    let media;
    let active = home.style.display !== 'none';
    let entered = false;

    function dispose() {
        media?.revert();
        media = null;
        home.classList.remove('cinematic-ready');
    }

    function mount() {
        dispose();
        if (!ready || !active || document.hidden) return;
        media = gsap.matchMedia();
        media.add({ desktop: '(min-width: 641px)', mobile: '(max-width: 640px)', reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
            if (context.conditions.reduce) {
                entered = true;
                return;
            }
            const mobile = context.conditions.mobile;
            home.classList.add('cinematic-ready');
            const select = gsap.utils.selector(home);
            // The image and its picture have separate owners: scroll / entrance.
            // Text is never faded with scroll, so links remain legible and usable.
            if (!entered && window.scrollY < 80) {
                entered = true;
                const intro = gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity,clipPath' } });
                intro.from(select('.hero-cine-media'), { scale: 1.22, opacity: .25, duration: 2 }, 0)
                    .from(select('.hero-identity'), { y: 20, opacity: 0, duration: .7 }, .1)
                    .from(select('.hero-title-line'), {
                        y: mobile ? 42 : 80, opacity: 0, clipPath: 'inset(0 0 100% 0)',
                        duration: 1.25, stagger: .16
                    }, .16)
                    .from(select('.subtitle, .description'), { y: 28, opacity: 0, duration: .85, stagger: .12 }, .5)
                    .from(select('.hero-action'), { y: 22, opacity: 0, duration: .65, stagger: .08 }, .7)
                    .from(select('.hero-news, .hero-proof'), { y: 18, opacity: 0, duration: .7, stagger: .1 }, .85);
            }

            const image = home.querySelector('.hero-cine-image');
            gsap.fromTo(image, { yPercent: mobile ? -2 : 0, scale: mobile ? 1.06 : 1 }, {
                yPercent: mobile ? 2 : 10, scale: mobile ? 1.06 : 1.2, ease: 'none',
                scrollTrigger: {
                    trigger: home.querySelector('.hero-cine'), start: mobile ? 'top bottom' : 'top top',
                    end: 'bottom top', scrub: .65, invalidateOnRefresh: true
                }
            });

            // Existing card observers own the outer reveal. Animate only photos,
            // preserving hit targets, card layout and the third photo's CSS offset.
            for (const card of select('.landing-card')) {
                const photo = card.querySelector('.landing-card-photo');
                if (!photo) continue;
                gsap.from(photo, {
                    scale: 1.14, opacity: .5, duration: 1.35, ease: 'power3.out', clearProps: 'transform,opacity',
                    scrollTrigger: { trigger: card, start: 'top 90%', once: true }
                });
            }
            const cta = home.querySelector('.landing-cta');
            if (cta) gsap.fromTo(cta.querySelector('.landing-cta-photo'), { scale: 1.14, yPercent: -4 }, {
                scale: 1.02, yPercent: 0, ease: 'none',
                scrollTrigger: { trigger: cta, start: 'top bottom', end: 'bottom top', scrub: .8 }
            });
            return () => home.classList.remove('cinematic-ready');
        }, home);
    }

    function start() { ready = true; mount(); }
    function onSectionChange(id) {
        const next = id === 'home';
        if (next === active) return;
        active = next;
        mount();
    }
    // Revert on leaving a route/tab, including inline styles. No orphaned scroll
    // triggers or catch-up entrance when returning from a background tab.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { entered = true; dispose(); } else mount();
    });
    window.addEventListener('pagehide', dispose);
    window.addEventListener('pageshow', (event) => { if (event.persisted) mount(); });
    window.VOLT_I18N?.onChange?.(() => { if (media) requestAnimationFrame(() => ScrollTrigger.refresh()); });
    window.VOLT_CINEMATIC = { start, onSectionChange };
})();
