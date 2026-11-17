/** 첫 화면 항로 영상. 선택 사항이며, 조건이 맞지 않으면 원래 사진만 보인다. */
(function () {
    'use strict';
    const home = document.getElementById('home');
    const video = document.getElementById('hero-film');
    if (!home || !video || typeof video.canPlayType !== 'function' || !('IntersectionObserver' in window)) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = navigator.connection;
    // 데이터 절약 모드이거나 느린 연결이면 영상을 받지 않는다.
    const slow = () => Boolean(connection && (connection.saveData || /^(slow-2g|2g|3g)$/.test(connection.effectiveType || '')));
    const source = video.canPlayType('video/webm; codecs="vp9"') ? video.dataset.srcWebm : video.dataset.srcMp4;
    let loaded = false;
    let failed = false;
    let visible = false;

    function off() {
        video.pause();
        home.classList.remove('hero-film-on');
    }

    function sync() {
        if (failed || !source || reduce.matches || slow()) { off(); return; }
        if (!visible || document.hidden) { video.pause(); return; }
        if (!loaded) {
            loaded = true;
            video.src = source;
            video.load();
        }
        video.play().catch(() => {});
    }

    video.addEventListener('playing', () => { if (!failed && !reduce.matches) home.classList.add('hero-film-on'); });
    video.addEventListener('error', () => { failed = true; off(); });

    function start() {
        new IntersectionObserver((entries) => {
            visible = entries[entries.length - 1].isIntersecting;
            sync();
        }).observe(video);
        document.addEventListener('visibilitychange', sync);
        reduce.addEventListener?.('change', sync);
        connection?.addEventListener?.('change', sync);
    }

    // 사진과 글자가 먼저 뜬 뒤에 영상을 받기 시작한다.
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
})();
