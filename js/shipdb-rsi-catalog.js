/**
 * RSI official catalog UI. The 30-record catalog is loaded only when a user
 * opens it; regular pages and the live ShipDB do not pay for this payload.
 */
(function () {
    'use strict';

    var BADGE = {
        concept: { ko: '컨셉 · RSI 공식 사양 · 변경 가능', en: 'Concept · Official RSI spec · Subject to change' },
        'flight-ready': { ko: '출시 · RSI 공식 사양', en: 'Flight-ready · Official RSI spec' }
    };
    var TXT = {
        chip: { ko: 'RSI 공식 카탈로그', en: 'Official RSI Catalog' },
        loading: { ko: '카탈로그 불러오는 중', en: 'Loading catalog' },
        loadError: { ko: '카탈로그를 불러오지 못했습니다. 다시 시도하세요.', en: 'Could not load the catalog. Try again.' },
        noDesc: { ko: 'RSI 공식 설명 미제공', en: 'Official RSI description not provided' },
        source: { ko: 'RSI 공식 출처', en: 'Official RSI source' },
        retrieved: { ko: '확인일', en: 'Retrieved' },
        manufacturer: { ko: '제조사', en: 'Manufacturer' },
        role: { ko: '역할', en: 'Role' },
        size: { ko: '크기', en: 'Size' },
        crew: { ko: '승무원', en: 'Crew' },
        cargo: { ko: '화물', en: 'Cargo' }
    };

    function lang() {
        return window.VOLT_I18N?.getLang?.() === 'en' ? 'en' : 'ko';
    }

    function L(map) {
        return map[lang()] || map.ko;
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function fieldRow(label, value) {
        var row = el('div', 'rsi-catalog-field');
        row.append(el('dt', null, L(label)), el('dd', null, value == null || value === '' ? '—' : String(value)));
        return row;
    }

    function crewText(record) {
        var min = record.rsi.crewMin;
        var max = record.rsi.crewMax;
        if (min == null && max == null) return null;
        if (min != null && max != null) return min === max ? String(min) : min + '~' + max;
        return min != null ? min + '~' : '~' + max;
    }

    function buildCard(record, localizationById) {
        var card = el('article', 'ship-card rsi-catalog-card');
        card.dataset.catalogId = record.id;
        var header = el('div', 'ship-card-header');
        header.append(el('h3', 'ship-name', record.name || record.id), el('span', 'rsi-catalog-badge rsi-catalog-badge-' + record.catalogStatus, L(BADGE[record.catalogStatus] || BADGE.concept)));
        card.appendChild(header);

        var localization = localizationById[record.id];
        var description = el('p', 'rsi-catalog-desc', localization?.status === 'ok' && localization.ko ? localization.ko : L(TXT.noDesc));
        if (!(localization?.status === 'ok' && localization.ko)) description.classList.add('rsi-catalog-desc-empty');
        card.appendChild(description);

        var fields = el('dl', 'rsi-catalog-fields');
        fields.append(
            fieldRow(TXT.manufacturer, record.rsi.manufacturer),
            fieldRow(TXT.role, record.rsi.role),
            fieldRow(TXT.size, record.rsi.size),
            fieldRow(TXT.crew, crewText(record)),
            fieldRow(TXT.cargo, record.rsi.cargo)
        );
        card.appendChild(fields);

        var meta = el('div', 'rsi-catalog-meta');
        var source = el('a', 'rsi-catalog-source', L(TXT.source));
        source.href = record.sourceUrl;
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        meta.append(source, el('span', 'rsi-catalog-retrieved', L(TXT.retrieved) + ' ' + record.retrievedAt));
        card.appendChild(meta);
        return card;
    }

    function createChip(filters) {
        var existing = document.getElementById('rsi-catalog-toolbar');
        if (existing) return existing.querySelector('[data-catalog-chip]');
        var toolbar = el('div', 'rsi-catalog-toolbar');
        toolbar.id = 'rsi-catalog-toolbar';
        var chip = el('button', 'ship-filter-btn rsi-catalog-chip', L(TXT.chip));
        chip.type = 'button';
        chip.dataset.catalogChip = '1';
        toolbar.appendChild(chip);
        filters.parentNode.insertBefore(toolbar, filters.nextSibling);
        return chip;
    }

    function setupCatalog(records, localizationRecords, chip) {
        var filters = document.getElementById('ship-tag-filters');
        var liveGrid = document.getElementById('ships-grid');
        if (!filters || !liveGrid || document.getElementById('rsi-catalog-grid')) return null;

        var localizationById = {};
        (localizationRecords || []).forEach(function (record) { localizationById[record.id] = record; });
        var catalogGrid = el('div', 'ships-grid rsi-catalog-grid');
        catalogGrid.id = 'rsi-catalog-grid';
        catalogGrid.hidden = true;
        var sorted = records.slice().sort(function (left, right) { return (left.name || left.id).localeCompare(right.name || right.id); });

        function render() {
            catalogGrid.replaceChildren();
            sorted.forEach(function (record) { catalogGrid.appendChild(buildCard(record, localizationById)); });
        }

        function show(on) {
            catalogGrid.hidden = !on;
            liveGrid.hidden = on;
            chip.classList.toggle('active', on);
        }

        render();
        liveGrid.parentNode.insertBefore(catalogGrid, liveGrid.nextSibling);
        chip.addEventListener('click', function () { show(catalogGrid.hidden); });
        filters.addEventListener('click', function (event) {
            var target = event.target.closest('.ship-filter-btn');
            if (target && !target.dataset.catalogChip) show(false);
        });
        window.VOLT_I18N?.onChange?.(function () {
            chip.textContent = L(TXT.chip);
            var wasOpen = !catalogGrid.hidden;
            render();
            show(wasOpen);
        });
        return { show: show };
    }

    function init() {
        var api = window.VOLT_SHIPDB_CANONICAL;
        var filters = document.getElementById('ship-tag-filters');
        if (!api || !api.isEnabled() || !filters) return;
        var chip = createChip(filters);
        var loading = false;
        chip.addEventListener('click', function loadCatalog() {
            if (loading || document.getElementById('rsi-catalog-grid')) return;
            loading = true;
            chip.disabled = true;
            chip.textContent = L(TXT.loading);
            api.loadRsiCatalog().then(function (store) {
                var controller = setupCatalog(store.rsiOfficial.records, store.rsiLocalization.records, chip);
                chip.disabled = false;
                chip.textContent = L(TXT.chip);
                if (controller) controller.show(true);
            }).catch(function () {
                chip.disabled = false;
                chip.textContent = L(TXT.chip);
                chip.setAttribute('aria-label', L(TXT.loadError));
                chip.title = L(TXT.loadError);
            }).finally(function () {
                loading = false;
            });
        });
    }

    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
})();
