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
        element.style.setProperty('--motion-delay', `${Math.min(index, 4) * 90}ms`);
        element.classList.add('revealed');
    }
    // A component may rebuild its DOM while typing. Animate logical changes only,
    // not every render. Never tween live numeric values through invented numbers.
    function update(scope, { view = '', dialog = '', panel = '', identity = '' } = {}) {
        const previous = snapshots.get(scope);
        const values = new Map();
        const equipment = new Map();
        const metrics = [...scope.querySelectorAll('.loadout-kpi')];
        const slots = [...scope.querySelectorAll('[data-loadout-slot]')];
        for (const metric of metrics) values.set(metric.querySelector('span')?.textContent, metric.querySelector('strong')?.textContent);
        for (const slot of slots) equipment.set(slot.dataset.loadoutSlot, `${slot.querySelector('.loadout-item-name')?.textContent}|${slot.classList.contains('is-off')}`);
        snapshots.set(scope, { view, dialog, panel, identity, values, equipment });
        // Release animations attached to DOM replaced by a redraw immediately.
        for (const animation of running) if (!animation.effect?.target?.isConnected) animation.cancel();
        if (dialog && previous?.dialog !== dialog) {
            const touchLayout = window.matchMedia('(max-width: 720px)').matches;
            animate(scope.querySelector('.loadout-picker'), [
                { opacity: 0, translate: touchLayout ? '0 64px' : '56px 0' },
                { opacity: 1, translate: '0 0' }
            ], { duration: 560 });
        } else if (panel && previous?.panel !== panel) {
            animate(scope.querySelector('.loadout-detail-content'), [{ opacity: 0, translate: '0 18px' }, { opacity: 1, translate: '0 0' }], { duration: 400 });
        }
        if (previous && view !== previous.view && !dialog) {
            animate(scope.querySelector('.loadout-slots'), [{ opacity: 0, translate: '0 24px' }, { opacity: 1, translate: '0 0' }], { duration: 460 });
        }
        if (identity && previous?.identity !== identity) {
            animate(scope.querySelector('.loadout-shiphead'), [{ opacity: 0, translate: '0 28px' }, { opacity: 1, translate: '0 0' }], { duration: 650 });
            metrics.forEach((metric, index) => {
                animate(metric, [{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: 520, delay: index * 45, fill: 'backwards' });
            });
        }
        if (!previous || previous.identity !== identity) return;
        for (const metric of metrics) {
            const label = metric.querySelector('span')?.textContent;
            if (previous.values.has(label) && previous.values.get(label) !== values.get(label)) {
                animate(metric, [{ backgroundColor: 'rgba(232, 72, 47, .28)' }, { backgroundColor: 'transparent' }], { duration: 1000 });
                // Transform only: preserve warning/benefit colors and exact numeric values.
                animate(metric.querySelector('strong'), [{ scale: '1.12', translate: '0 -4px' }, { scale: '1', translate: '0 0' }], { duration: 700 });
            }
        }
        for (const slot of slots) {
            const key = slot.dataset.loadoutSlot;
            if (previous.equipment.has(key) && previous.equipment.get(key) !== equipment.get(key)) {
                animate(slot, [
                    { backgroundColor: 'rgba(232, 72, 47, .24)', boxShadow: 'inset 4px 0 0 #e8482f' },
                    { backgroundColor: 'transparent', boxShadow: 'inset 0 0 0 transparent' }
                ], { duration: 1100 });
                animate(slot.querySelector('.loadout-item-name'), [{ opacity: .25, translate: '12px 0' }, { opacity: 1, translate: '0 0' }], { duration: 520 });
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
            animate(child, [{ opacity: 0, translate: '0 -12px' }, { opacity: 1, translate: '0 0' }], { duration: 360 });
        });
    }, true);
    window.VOLT_MOTION = { prepare, reveal, update };
})();
