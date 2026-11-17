/** VOLT motion: optional enhancement; final content never depends on animation. */
(function () {
    'use strict';
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const running = new Set();
    const snapshots = new WeakMap();
    const toggledByUser = new WeakSet();
    const ease = 'cubic-bezier(.22, 1, .36, 1)';

    function animate(element, frames, options = {}) {
        if (!element || !element.isConnected || preference.matches || document.hidden || !element.animate) return;
        const animation = element.animate(frames, { duration: 240, easing: ease, ...options });
        running.add(animation);
        const clean = () => running.delete(animation);
        animation.addEventListener('finish', clean, { once: true });
        animation.addEventListener('cancel', clean, { once: true });
    }
    function stop() { for (const animation of running) animation.cancel(); running.clear(); }
    preference.addEventListener('change', () => { if (preference.matches) stop(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    window.addEventListener('pagehide', stop);

    function prepare(element) {
        element.classList.add('motion-ready');
    }
    function reveal(element, index = 0) {
        element.style.setProperty('--motion-delay', `${Math.min(index, 5) * 40}ms`);
        element.classList.add('revealed');
    }
    // A component may rebuild its DOM while typing. Animate logical changes only,
    // not every render. Never tween live numeric values through invented numbers.
    function update(scope, { view = '', dialog = '', panel = '', identity = '' } = {}) {
        const previous = snapshots.get(scope);
        const values = new Map();
        const metrics = [...scope.querySelectorAll('.loadout-kpi')];
        for (const metric of metrics) values.set(metric.querySelector('span')?.textContent, metric.querySelector('strong')?.textContent);
        snapshots.set(scope, { view, dialog, panel, identity, values });
        if (dialog && previous?.dialog !== dialog) {
            animate(scope.querySelector('.loadout-picker'), [{ opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' }], { duration: 260 });
        } else if (panel && previous?.panel !== panel) {
            animate(scope.querySelector('.loadout-detail-content'), [{ opacity: 0.35 }, { opacity: 1 }], { duration: 180 });
        }
        if (previous && view !== previous.view && !dialog) {
            animate(scope.querySelector('.loadout-slots'), [{ opacity: 0.4 }, { opacity: 1 }], { duration: 180 });
        }
        if (!previous || previous.identity !== identity) return;
        for (const metric of metrics) {
            const label = metric.querySelector('span')?.textContent;
            if (previous.values.has(label) && previous.values.get(label) !== values.get(label)) {
                animate(metric.querySelector('strong'), [{ color: 'var(--volt-orange-light)', scale: '1.045' }, { color: 'var(--color-text-primary)', scale: '1' }], { duration: 480 });
            }
        }
    }
    // Native details keep their instant semantic state; opening content gets a
    // brief fade. No delayed clicks, height measurements or focus changes.
    document.addEventListener('click', (event) => {
        const summary = event.target instanceof Element ? event.target.closest('summary') : null;
        if (summary?.parentElement instanceof HTMLDetailsElement) toggledByUser.add(summary.parentElement);
    }, true);
    document.addEventListener('toggle', (event) => {
        const details = event.target;
        // Inserting an already-open details also emits toggle. Only an explicit
        // summary activation should animate, never a loadout search/redraw.
        if (!(details instanceof HTMLDetailsElement) || !toggledByUser.has(details)) return;
        toggledByUser.delete(details);
        if (!details.open || details.closest('.loadout-detail')) return;
        [...details.children].filter((child) => child.tagName !== 'SUMMARY').slice(0, 8).forEach((child) => {
            animate(child, [{ opacity: 0.25, translate: '0 -3px' }, { opacity: 1, translate: '0 0' }], { duration: 180 });
        });
    }, true);
    window.VOLT_MOTION = { prepare, reveal, update };
})();
