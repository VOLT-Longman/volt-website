// Panel arrangement belongs to this browser, independently of ship builds and A/B.
(() => {
    'use strict';
    const defaults = [['weapon', 'mining', 'utility'], ['missile', 'quantum', 'shield', 'power', 'cooler', 'radar', 'other']];
    const keys = defaults.flat();
    const storage = 'volt.loadout.panels.v1';
    const fresh = () => defaults.map((column) => [...column]);
    function read() {
        let saved;
        try { saved = JSON.parse(localStorage.getItem(storage)); } catch { /* optional */ }
        if (!Array.isArray(saved) || saved.length !== 2 || !saved.every(Array.isArray)) return fresh();
        const seen = new Set();
        const columns = saved.map((column) => column.filter((key) => {
            if (!keys.includes(key) || seen.has(key)) return false;
            seen.add(key);
            return true;
        }));
        defaults.forEach((column, i) => { columns[i].push(...column.filter((key) => !seen.has(key))); });
        return columns;
    }
    let columns = read();
    let drag = null;
    let frame = 0;
    let suppressClick = false;
    const root = () => document.getElementById('loadout-app');
    const panel = (key) => root()?.querySelector('[data-panel-key="' + key + '"]');
    const lane = (el) => el?.closest('[data-panel-column]');
    const visible = (i) => columns[i].filter((key) => panel(key)?.getClientRects().length);
    function save(focus) {
        try { localStorage.setItem(storage, JSON.stringify(columns)); } catch { /* session only */ }
        window.VOLT_LOADOUT_LAYOUT.redraw();
        const handle = panel(focus)?.querySelector('[data-panel-handle]');
        handle?.focus({ preventScroll: true });
        handle?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    function place(key, i, anchor, after) {
        if (!keys.includes(key) || key === anchor || ![0, 1].includes(i)) return;
        const next = columns.map((col) => col.filter((item) => item !== key));
        const idx = next[i].indexOf(anchor);
        next[i].splice(idx < 0 ? next[i].length : idx + Number(after), 0, key);
        if (JSON.stringify(next) === JSON.stringify(columns)) return;
        columns = next;
        save(key);
    }
    function move(key, action) {
        const i = columns.findIndex((col) => col.includes(key));
        if (i < 0) return;
        if (action === 'other') return place(key, 1 - i, null, false);
        const list = visible(i);
        const offset = action === 'up' ? -1 : 1;
        const neighbor = list[list.indexOf(key) + offset];
        if (neighbor) place(key, i, neighbor, offset > 0);
    }
    function hit() {
        const el = document.elementFromPoint(drag.x, drag.y);
        const target = el?.closest('[data-panel-key]');
        const col = lane(el);
        if (!col) return null;
        const box = target?.getBoundingClientRect();
        return { target, col, after: box ? drag.y >= box.top + box.height / 2 : false };
    }
    function clearMarks() {
        root()?.querySelectorAll('.is-drop-before,.is-drop-after,.is-drop-empty').forEach((el) => { el.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-empty'); });
    }
    function tick() {
        if (!drag?.moving) return;
        if (!drag.panel.isConnected) { end(false); return; }
        const edge = Math.min(72, innerHeight / 6);
        const speed = drag.y < edge ? drag.y - edge : Math.max(0, drag.y - innerHeight + edge);
        if (speed) window.scrollBy(0, Math.sign(speed) * Math.min(19, Math.ceil(Math.abs(speed) / 4)));
        const over = hit();
        const mark = over?.target || over?.col;
        const side = over?.target ? (over.after ? 'is-drop-after' : 'is-drop-before') : 'is-drop-empty';
        if (mark !== drag.mark || side !== drag.side) {
            clearMarks();
            if (mark && mark !== drag.panel) mark.classList.add(side);
            drag.mark = mark;
            drag.side = side;
        }
        frame = requestAnimationFrame(tick);
    }
    function end(commit) {
        if (!drag) return;
        const done = drag;
        const over = commit && done.moving ? hit() : null;
        drag = null;
        cancelAnimationFrame(frame);
        clearMarks();
        root()?.classList.remove('is-arranging');
        done.panel.classList.remove('is-panel-dragging');
        if (done.moving) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
        if (over) place(done.key, Number(over.col.dataset.panelColumn), over.target?.dataset.panelKey, over.after);
    }
    document.addEventListener('pointerdown', (e) => {
        const header = e.target.closest('[data-panel-heading]');
        if (!header || e.button !== 0 || !e.isPrimary || (e.pointerType === 'touch' && !e.target.closest('[data-panel-handle]'))) return;
        const item = header.closest('[data-panel-key]');
        drag = { key: item.dataset.panelKey, panel: item, id: e.pointerId, startX: e.clientX, startY: e.clientY };
    });
    document.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.moving || Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6) return;
        drag.moving = true;
        root().classList.add('is-arranging');
        drag.panel.classList.add('is-panel-dragging');
        tick();
    });
    document.addEventListener('pointerup', (e) => { if (drag?.id === e.pointerId) { drag.x = e.clientX; drag.y = e.clientY; end(true); } });
    document.addEventListener('pointercancel', () => end(false));
    window.addEventListener('blur', () => end(false));
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (drag) { e.preventDefault(); end(false); return; }
        const item = e.target.closest('[data-panel-key]');
        const menu = item?.querySelector('[data-panel-menu]');
        if (menu && !menu.hidden) {
            e.preventDefault();
            menu.hidden = true;
            const handle = item.querySelector('[data-panel-handle]');
            handle.setAttribute('aria-expanded', 'false');
            handle.focus();
        }
    });
    document.addEventListener('click', (e) => {
        if (suppressClick) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (e.target.closest('[data-panel-reset]')) { columns = fresh(); save(); root()?.querySelector('[data-loadout-collapse-all]')?.focus(); return; }
        const item = e.target.closest('[data-panel-key]');
        if (!item) return;
        const handle = e.target.closest('[data-panel-handle]');
        const menu = item.querySelector('[data-panel-menu]');
        if (handle) {
            menu.hidden = !menu.hidden;
            handle.setAttribute('aria-expanded', String(!menu.hidden));
            const list = visible(Number(lane(item).dataset.panelColumn));
            menu.querySelector('[data-panel-move="up"]').disabled = list[0] === item.dataset.panelKey;
            menu.querySelector('[data-panel-move="down"]').disabled = list.at(-1) === item.dataset.panelKey;
        }
        const action = e.target.closest('[data-panel-move]');
        if (action) move(item.dataset.panelKey, action.dataset.panelMove);
    }, true);
    window.VOLT_LOADOUT_LAYOUT = {
        get columns() { return columns; },
        get customized() { return JSON.stringify(columns) !== JSON.stringify(defaults); },
        redraw: () => {},
    };
})();
