/**
 * ShipDB Erkul 재작성 v2 — RSI 공식 카탈로그 탭/필터/카드 (2단계, 플래그 ON 경로 전용)
 *
 * 원칙(PM):
 *  - 플래그 OFF(기본)에서는 아무 것도 주입/렌더하지 않는다 — 라이브 완전 불변.
 *  - ON(테스트 훅/3.5 승인)에서만 함선DB에 "RSI 공식 카탈로그" 필터 칩과 전용 그리드를 붙인다.
 *  - 카드: RSI 공식 명칭·상태 배지·제조사·역할·크기·승무원·화물·설명(KO)·출처 링크·확인일.
 *  - RSI 비제공 값(HP·속도·DPS·시세·구매처)은 렌더하지 않는다. 빈 필드는 "—".
 *  - 레거시 렌더 함수를 수정하지 않는다(독립 칩+컨테이너, 클릭으로만 전환).
 */
(function () {
    'use strict';

    var BADGE = {
        concept: { ko: '컨셉 · RSI 공식 사양 · 변경 가능', en: 'Concept · Official RSI spec · Subject to change' },
        'flight-ready': { ko: '출시 · RSI 공식 사양', en: 'Flight-ready · Official RSI spec' }
    };
    var TXT = {
        chip: { ko: 'RSI 공식 카탈로그', en: 'Official RSI Catalog' },
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
        return (window.VOLT_I18N && window.VOLT_I18N.getLang && window.VOLT_I18N.getLang()) === 'en' ? 'en' : 'ko';
    }
    function L(map) { return map[lang()] || map.ko; }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }
    function fieldRow(labelMap, value) {
        var div = el('div', 'rsi-catalog-field');
        div.appendChild(el('dt', null, L(labelMap)));
        div.appendChild(el('dd', null, value === null || value === undefined || value === '' ? '—' : String(value)));
        return div;
    }
    function crewText(r) {
        var a = r.rsi.crewMin, b = r.rsi.crewMax;
        if (a == null && b == null) return null;
        if (a != null && b != null) return a === b ? String(a) : a + '~' + b;
        return (a != null ? a + '~' : '~' + b);
    }

    function buildCard(rec, locById) {
        var card = el('article', 'ship-card rsi-catalog-card');
        card.setAttribute('data-catalog-id', rec.id);

        var header = el('div', 'ship-card-header');
        header.appendChild(el('h3', 'ship-name', rec.name || rec.id));
        var badge = el('span', 'rsi-catalog-badge rsi-catalog-badge-' + rec.catalogStatus, L(BADGE[rec.catalogStatus] || BADGE.concept));
        header.appendChild(badge);
        card.appendChild(header);

        // KO 설명 (없으면 미제공 상태)
        var loc = locById[rec.id];
        var desc = el('p', 'rsi-catalog-desc');
        if (loc && loc.status === 'ok' && loc.ko) desc.textContent = loc.ko;
        else { desc.textContent = L(TXT.noDesc); desc.classList.add('rsi-catalog-desc-empty'); }
        card.appendChild(desc);

        // RSI 명시 필드만 (게임플레이 값 없음)
        var dl = el('dl', 'rsi-catalog-fields');
        dl.appendChild(fieldRow(TXT.manufacturer, rec.rsi.manufacturer));
        dl.appendChild(fieldRow(TXT.role, rec.rsi.role));
        dl.appendChild(fieldRow(TXT.size, rec.rsi.size));
        dl.appendChild(fieldRow(TXT.crew, crewText(rec)));
        dl.appendChild(fieldRow(TXT.cargo, rec.rsi.cargo));
        card.appendChild(dl);

        // 출처 링크 + 확인일 (필수)
        var meta = el('div', 'rsi-catalog-meta');
        var link = el('a', 'rsi-catalog-source', L(TXT.source));
        link.href = rec.sourceUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        meta.appendChild(link);
        meta.appendChild(el('span', 'rsi-catalog-retrieved', L(TXT.retrieved) + ' ' + rec.retrievedAt));
        card.appendChild(meta);
        return card;
    }

    function setup(records, locRecords) {
        var filters = document.getElementById('ship-tag-filters');
        var grid = document.getElementById('ships-grid');
        if (!filters || !grid || document.getElementById('rsi-catalog-grid')) return;

        var locById = {};
        (locRecords || []).forEach(function (r) { locById[r.id] = r; });

        // 전용 그리드(숨김)
        var catalogGrid = el('div', 'ships-grid rsi-catalog-grid');
        catalogGrid.id = 'rsi-catalog-grid';
        catalogGrid.hidden = true;
        records.slice().sort(function (a, b) { return (a.name || a.id).localeCompare(b.name || b.id); })
            .forEach(function (rec) { catalogGrid.appendChild(buildCard(rec, locById)); });
        grid.parentNode.insertBefore(catalogGrid, grid.nextSibling);

        // 필터 칩은 레거시 소유 #ship-tag-filters(동적 재렌더)에 넣지 않고,
        // 별도 형제 컨테이너에 둔다 — 레거시 렌더가 칩을 지우지 않도록.
        var toolbar = el('div', 'rsi-catalog-toolbar');
        toolbar.id = 'rsi-catalog-toolbar';
        var chip = el('button', 'ship-filter-btn rsi-catalog-chip', L(TXT.chip));
        chip.type = 'button';
        chip.setAttribute('data-catalog-chip', '1');
        toolbar.appendChild(chip);
        filters.parentNode.insertBefore(toolbar, filters.nextSibling);

        function showCatalog(on) {
            catalogGrid.hidden = !on;
            grid.hidden = on;
            chip.classList.toggle('active', on);
        }
        chip.addEventListener('click', function () { showCatalog(catalogGrid.hidden); });
        // 레거시 칩 클릭 시 카탈로그를 접는다(레거시 코드 미수정 — 클릭만 관찰).
        filters.addEventListener('click', function (e) {
            var t = e.target.closest('.ship-filter-btn');
            if (t && !t.hasAttribute('data-catalog-chip')) showCatalog(false);
        });
        // 언어 전환 시 배지/라벨 재렌더
        if (window.VOLT_I18N && window.VOLT_I18N.onChange) {
            window.VOLT_I18N.onChange(function () {
                chip.textContent = L(TXT.chip);
                var wasOpen = !catalogGrid.hidden;
                catalogGrid.replaceChildren();
                records.slice().sort(function (a, b) { return (a.name || a.id).localeCompare(b.name || b.id); })
                    .forEach(function (rec) { catalogGrid.appendChild(buildCard(rec, locById)); });
                catalogGrid.hidden = !wasOpen;
            });
        }
    }

    function init() {
        var api = window.VOLT_SHIPDB_CANONICAL;
        if (!api || !api.isEnabled()) return; // OFF: 완전 무동작
        if (!document.getElementById('ships')) return;
        api.load().then(function (store) {
            if (!store || !store.rsiOfficial || !store.rsiOfficial.records) return;
            setup(store.rsiOfficial.records, store.rsiLocalization && store.rsiLocalization.records);
        });
    }

    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
})();
