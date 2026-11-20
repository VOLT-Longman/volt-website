/* Shared controls for result tables. Paged lists supply the full filtered data before slicing. */
(() => {
    'use strict';
    const choices = new Map();
    const models = new Map();
    const installed = new WeakSet();
    const lang = () => document.documentElement.lang === 'en' ? 'en' : 'ko';
    const collators = { ko: new Intl.Collator('ko', { numeric: true }), en: new Intl.Collator('en', { numeric: true }) };
    const choice = (id) => choices.get(id);
    function select(id, column, desc) {
        const previous = choice(id);
        if (column == null && !previous || previous?.column === column && previous.desc === desc) return;
        if (column == null) choices.delete(id);
        else choices.set(id, { column, desc });
        if (models.has(id)) {
            const table = document.querySelector('table[data-sort-source="' + CSS.escape(id) + '"]');
            if (table?.tHead) showChoice(table, choice(id));
        }
    }
    function ordered(rows, value, desc) {
        const collator = collators[lang()];
        return rows.map(row => ({ row, key: value(row) })).sort((a, b) => {
            if (a.key == null || b.key == null) return Number(a.key == null) - Number(b.key == null);
            const by = typeof a.key === 'number' && typeof b.key === 'number' ? a.key - b.key : collator.compare(String(a.key), String(b.key));
            return desc ? -by : by;
        }).map(entry => entry.row);
    }
    function register(id, columns, redraw) { models.set(id, { columns, redraw }); }
    function rows(id, items, columns, redraw) {
        register(id, columns, redraw);
        const active = choice(id);
        return active && columns[active.column] ? ordered(items, columns[active.column], active.desc) : items;
    }
    window.VOLT_TABLE_SORT = { choice, select, rows, register, ordered, enhance: scan };

    function cellValue(cell, numeric) {
        if (!cell) return null;
        const content = cell.querySelector(':scope > .market-cell') || cell;
        const explicit = cell.dataset.sortValue ?? content.firstElementChild?.dataset.sortValue;
        if (explicit !== undefined) return explicit === '' ? null : Number.isFinite(Number(explicit)) ? Number(explicit) : explicit;
        const raw = (cell.dataset.csv ?? cell.querySelector('input[type="number"]')?.value ?? cell.textContent).trim();
        if (!raw || /^(?:[—–-]$|자료 없음|계산할 수 없음|cannot be calculated|게임 자료에 없음|보고 없음|미확인|unknown\b|not (?:reported|in the game)|no (?:report|data))/i.test(raw)) return null;
        if (!numeric) return raw;
        const number = raw.replace(/[,\u00a0]/g, '').replace(/−/g, '-').match(/^[≤≈+% ]*([+-]?\d+(?:\.\d+)?)(?=$|\s|[~–%°×])/);
        return number ? Number(number[1]) : raw;
    }
    function keyFor(table, headers) {
        if (table.matches('.mining-matrix')) return 'mining-matrix/' + [...table.querySelectorAll('thead [data-mining-location]')].map(button => button.dataset.miningLocation).join('|');
        const area = table.closest('section[id], [role="dialog"], main');
        return table.dataset.sortSource || [area?.id, table.id || table.className, table.dataset.miningCsv || table.caption?.textContent, headers.map(h => h.dataset.csv || h.textContent.trim()).join('|')].join('/');
    }
    const mobilePickers = new WeakMap();
    function showChoice(table, active) {
        const picker = mobilePickers.get(table);
        if (picker) picker.value = active ? active.column + '/' + Number(active.desc) : '';
        for (const button of table.tHead.querySelectorAll('.volt-sort-head')) {
            const selected = Number(button.dataset.column) === active?.column;
            const th = button.closest('th');
            if (selected) th.setAttribute('aria-sort', active.desc ? 'descending' : 'ascending');
            else th.removeAttribute('aria-sort');
            button.lastElementChild.dataset.indicator = selected ? (active.desc ? '↓' : '↑') : '↕';
        }
    }
    // A detail row with colspan (for example, a market price history) travels with its owner.
    function orderBody(table, active) {
        for (const body of table.tBodies) {
            const groups = [];
            for (const row of body.rows) {
                if (row.cells.length === 1 && row.cells[0].colSpan > 1 && groups.length) groups[groups.length - 1].push(row);
                else groups.push([row]);
            }
            const numeric = table.tHead.rows[0].cells[active.column]?.matches('.is-num,.ledger-num,[data-numeric]');
            const sorted = ordered(groups, group => cellValue(group[0].cells[active.column], numeric), active.desc);
            const fragment = document.createDocumentFragment();
            for (const group of sorted) fragment.append(...group);
            body.append(fragment);
        }
    }
    function mobilePicker(table, apply) {
        if (!table.matches('.market-table,.routes-table,.ledger-table,.mining-ref-table,[data-mining-csv="minerals"]')) return;
        const target = table.matches('.ledger-table') ? table.parentElement : table;
        const label = document.createElement('label');
        label.className = 'volt-sort-mobile ' + (table.matches('.ledger-table') ? 'for-ledger' : table.matches('.routes-table') ? 'for-routes' : table.matches('.mining-table') ? 'for-mining' : table.closest('.market-budget') ? 'for-budget' : 'for-market');
        label.textContent = lang() === 'ko' ? '정렬' : 'Sort';
        const selectBox = document.createElement('select');
        const placeholder = new Option(lang() === 'ko' ? '기본 순서' : 'Default order', '');
        placeholder.disabled = true;
        selectBox.add(placeholder);
        for (const button of table.tHead.querySelectorAll('.volt-sort-head')) {
            const name = button.closest('th').dataset.csv || button.textContent.replace(/[↑↓↕]/g, '').trim();
            for (const desc of [false, true]) selectBox.add(new Option(name + (desc ? ' ↓' : ' ↑'), button.dataset.column + '/' + Number(desc)));
        }
        if (selectBox.options.length === 1) return;
        const oldLabel = mobilePickers.get(table)?.parentElement;
        oldLabel?.remove();
        label.append(selectBox);
        target.before(label);
        mobilePickers.set(table, selectBox);
        selectBox.addEventListener('change', () => {
            const [column, direction] = selectBox.value.split('/');
            const next = apply(Number(column), direction === '1');
            mobilePickers.get(next)?.focus({ preventScroll: true });
        });
    }
    function attach(table) {
        const head = table?.tHead;
        if (!head || !head.rows.length || installed.has(head.rows[0]) || head.rows.length !== 1 || head.querySelector('[data-ms-sort],[data-loadout-sort]')) return;
        if (table.matches('.ship-compare-table,.loadout-comparetable')) return; // sides of a comparison, not result lists
        const headers = [...head.rows[0].cells];
        const id = keyFor(table, headers);
        const model = models.get(id);
        installed.add(head.rows[0]);
        function apply(column, desc) {
            select(id, column, desc);
            const owner = models.get(id);
            if (owner) {
                owner.redraw(column, desc);
                const next = [...document.querySelectorAll('table[data-sort-source]')].find(t => t.dataset.sortSource === id);
                if (next?.tHead) { attach(next); showChoice(next, choice(id)); return next; }
            } else {
                orderBody(table, choice(id));
                showChoice(table, choice(id));
            }
            return table;
        }
        headers.forEach((th, column) => {
            const placeButton = th.querySelector('.mining-matrix-col');
            if (model && !model.columns[column] || !th.textContent.trim() || th.colSpan !== 1 || th.matches('.mining-csv-only,[data-no-sort]') || !placeButton && th.querySelector('button,a,input,select,.visually-hidden:only-child')) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'volt-sort-head';
            button.dataset.column = column;
            if (table.dataset.miningCsv && !th.hasAttribute('data-csv')) th.dataset.csv = th.textContent.trim();
            const name = th.dataset.csv || th.textContent.trim();
            button.setAttribute('aria-label', lang() === 'ko' ? name + ' 정렬' : 'Sort by ' + name);
            if (!placeButton) while (th.firstChild) button.append(th.firstChild);
            const icon = document.createElement('span');
            icon.className = 'volt-sort-arrow';
            icon.setAttribute('aria-hidden', 'true');
            button.append(icon);
            th.append(button);
            button.addEventListener('click', () => {
                const old = choice(id);
                const desc = old?.column === column ? !old.desc : (placeButton != null || th.matches('.is-num,.ledger-num,[data-desc-first]')) && !th.hasAttribute('data-asc-first');
                const next = apply(column, desc);
                next.tHead?.querySelector('[data-column="' + column + '"]')?.focus({ preventScroll: true });
            });
        });
        const active = choice(id);
        mobilePicker(table, apply);
        if (active && !model) orderBody(table, active);
        showChoice(table, active);
    }
    function scan(node) {
        if (node.nodeType !== 1 || !node.isConnected) return;
        if (node.matches('table,thead,thead > tr')) attach(node.closest('table'));
        else if (!node.matches('tr,td,th,button,span,small,li,svg,path,option')) node.querySelectorAll('table').forEach(attach);
    }
    const observer = new MutationObserver(changes => {
        for (const change of changes) for (const node of change.addedNodes) scan(node);
    });
    for (const root of document.querySelectorAll('#mining,#gear,#missions,#hauling,#fabricator,#routes,#market,#trade-planner,#loadout,#ships')) {
        observer.observe(root, { childList: true, subtree: true });
        scan(root);
    }
})();
