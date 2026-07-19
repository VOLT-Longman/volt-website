/**
 * ShipDB canonical data loader.
 *
 * The client never accepts a partial canonical dataset. A versioned manifest
 * pins every JSON file to a SHA-256 hash, so a deploy cannot mix old and new
 * canonical layers in the same page session.
 */
(function () {
    'use strict';

    var CANONICAL_ENABLED = true;
    var MANIFEST_URL = 'data/canonical/shipdb-manifest.json';
    var DATA_FILES = {
        canonical: { path: 'data/canonical/ships-canonical.json', group: 'core' },
        localization: { path: 'data/canonical/localization-ships.json', group: 'core' },
        operational: { path: 'data/canonical/operational-ships.json', group: 'core' },
        editionAliases: { path: 'data/canonical/edition-aliases.json', group: 'core' },
        roleLocalization: { path: 'data/canonical/localization-roles.json', group: 'core' },
        filterTaxonomy: { path: 'data/canonical/ship-filter-taxonomy.json', group: 'core' },
        rsiOfficial: { path: 'data/canonical/ships-rsi-official.json', group: 'core' },
        rsiLocalization: { path: 'data/canonical/localization-rsi-official.json', group: 'core' }
    };

    var state = 'idle';
    var corePromise = null;
    var manifestPromise = null;
    var store = {};
    var lastError = null;
    var idCache = null;
    var shipCache = null;
    var roleListCache = null;

    function isEnabled() {
        if (typeof window !== 'undefined') {
            if (window.__VOLT_SHIPDB_CANONICAL_TEST__ === false) return false;
            if (window.__VOLT_SHIPDB_CANONICAL_TEST__ === true) return true;
        }
        return CANONICAL_ENABLED === true;
    }

    function makeError(message) {
        return new Error('ShipDB 데이터 오류: ' + message);
    }

    function rootUrl(path) {
        return '/' + String(path || '').replace(/^\/+/, '');
    }

    function validateManifest(manifest) {
        var actual;
        var expected;
        var key;
        if (!manifest || manifest.schema !== 'shipdb-client-manifest/v1') throw makeError('manifest 형식이 올바르지 않습니다.');
        if (!/^[a-f0-9]{16}$/.test(manifest.version || '')) throw makeError('manifest 버전이 올바르지 않습니다.');
        for (key in DATA_FILES) {
            expected = DATA_FILES[key];
            actual = manifest.files && manifest.files[key];
            if (!actual || actual.path !== expected.path || actual.group !== expected.group || !/^[a-f0-9]{64}$/.test(actual.sha256 || '')) {
                throw makeError(key + ' manifest 항목이 올바르지 않습니다.');
            }
        }
        return manifest;
    }

    function fetchManifest() {
        if (manifestPromise) return manifestPromise;
        manifestPromise = fetch(rootUrl(MANIFEST_URL), { cache: 'no-store', headers: { Accept: 'application/json' } })
            .then(function (response) {
                if (!response.ok) throw makeError('manifest를 불러오지 못했습니다 (' + response.status + ').');
                return response.json();
            })
            .then(validateManifest)
            .catch(function (error) {
                manifestPromise = null;
                throw error;
            });
        return manifestPromise;
    }

    function digest(text) {
        if (!window.crypto || !window.crypto.subtle) return Promise.reject(makeError('브라우저가 SHA-256 검증을 지원하지 않습니다.'));
        var normalized = String(text).replace(/\r\n/g, '\n');
        return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized)).then(function (buffer) {
            return Array.prototype.map.call(new Uint8Array(buffer), function (value) {
                return value.toString(16).padStart(2, '0');
            }).join('');
        });
    }

    function validatePayload(key, payload) {
        if (key === 'canonical') return payload && Array.isArray(payload.ships) && payload.count === payload.ships.length;
        if (key === 'localization' || key === 'operational' || key === 'rsiLocalization') return payload && Array.isArray(payload.records);
        if (key === 'editionAliases') return payload && Array.isArray(payload.aliases);
        if (key === 'roleLocalization') return payload && payload.roles && typeof payload.roles === 'object';
        if (key === 'filterTaxonomy') return payload && payload.axes && payload.roleTagMap && typeof payload.roleTagMap === 'object';
        if (key === 'rsiOfficial') return payload && Array.isArray(payload.records);
        return false;
    }

    function fetchVerifiedFile(key, manifest) {
        var entry = manifest.files[key];
        var url = rootUrl(entry.path) + '?v=' + encodeURIComponent(manifest.version);
        return fetch(url, { headers: { Accept: 'application/json' } })
            .then(function (response) {
                if (!response.ok) throw makeError(key + ' 데이터를 불러오지 못했습니다 (' + response.status + ').');
                return response.text();
            })
            .then(function (text) {
                return digest(text).then(function (hash) {
                    if (hash !== entry.sha256) throw makeError(key + ' 데이터 버전이 manifest와 일치하지 않습니다.');
                    var payload;
                    try { payload = JSON.parse(text); }
                    catch (_error) { throw makeError(key + ' JSON 형식이 올바르지 않습니다.'); }
                    if (!validatePayload(key, payload)) throw makeError(key + ' 데이터 구조가 올바르지 않습니다.');
                    return { key: key, payload: payload };
                });
            });
    }

    function resetCaches() {
        idCache = null;
        shipCache = null;
        roleListCache = null;
    }

    function loadGroup(group) {
        return fetchManifest().then(function (manifest) {
            var keys = Object.keys(DATA_FILES).filter(function (key) { return DATA_FILES[key].group === group; });
            return Promise.all(keys.map(function (key) { return fetchVerifiedFile(key, manifest); }));
        }).then(function (entries) {
            entries.forEach(function (entry) { store[entry.key] = entry.payload; });
            resetCaches();
            return store;
        });
    }

    function load() {
        if (!isEnabled()) return Promise.resolve(null);
        if (state === 'loaded') return Promise.resolve(store);
        if (state === 'loading') return corePromise;
        state = 'loading';
        lastError = null;
        corePromise = loadGroup('core').then(function (data) {
            state = 'loaded';
            return data;
        }).catch(function (error) {
            state = 'failed';
            lastError = error instanceof Error ? error : makeError('알 수 없는 오류');
            throw lastError;
        });
        return corePromise;
    }

    function retry() {
        if (!isEnabled()) return Promise.resolve(null);
        state = 'idle';
        corePromise = null;
        manifestPromise = null;
        return load();
    }

    function publicShipIds() {
        if (!store.canonical || !store.rsiOfficial) return null;
        if (!idCache) {
            idCache = new Set(store.canonical.ships.map(function (ship) { return ship.id; }));
            store.rsiOfficial.records.forEach(function (ship) { idCache.add(ship.id); });
        }
        return idCache;
    }

    function rsiLocalizationById() {
        var entries = store.rsiLocalization && store.rsiLocalization.records;
        return Object.fromEntries((entries || []).map(function (entry) { return [entry.id, entry]; }));
    }

    function toRsiPublicShip(record, localization) {
        var rsi = record.rsi || {};
        var singleCrew = rsi.crewMin === rsi.crewMax ? rsi.crewMin : null;
        return {
            id: record.id,
            source: 'rsi-official',
            name: record.name,
            manufacturer: rsi.manufacturer,
            role: rsi.role,
            size: rsi.size,
            platform: rsi.size === 'vehicle' ? 'ground' : 'space',
            crewMin: rsi.crewMin,
            crewMax: rsi.crewMax,
            crewSize: singleCrew,
            cargoScu: rsi.cargo,
            descriptions: { en: rsi.descriptionEn || null, ko: localization?.status === 'ok' ? localization.ko : null },
            catalogStatus: record.catalogStatus,
            implemented: record.catalogStatus === 'flight-ready',
            sourceUrl: record.sourceUrl,
            retrievedAt: record.retrievedAt
        };
    }

    function buildShipCache() {
        var localizationById;
        if (!shipCache) {
            shipCache = {};
            store.canonical.ships.forEach(function (ship) { shipCache[ship.id] = ship; });
            localizationById = rsiLocalizationById();
            store.rsiOfficial.records.forEach(function (record) {
                shipCache[record.id] = toRsiPublicShip(record, localizationById[record.id]);
            });
        }
        return shipCache;
    }

    function getShip(id) {
        if (!store.canonical || !store.rsiOfficial) return null;
        return buildShipCache()[id] || null;
    }

    function roleKo(enRole) {
        if (!enRole || !store.roleLocalization || !store.roleLocalization.roles) return null;
        var ko = store.roleLocalization.roles[enRole];
        return typeof ko === 'string' ? ko : null;
    }

    function roleList() {
        var seen;
        if (!store.canonical || !store.rsiOfficial) return null;
        if (!roleListCache) {
            seen = {};
            roleListCache = [];
            Object.values(buildShipCache()).forEach(function (ship) {
                if (ship.role && !seen[ship.role]) {
                    seen[ship.role] = true;
                    roleListCache.push(ship.role);
                }
            });
            roleListCache.sort();
        }
        return roleListCache;
    }

    window.VOLT_SHIPDB_CANONICAL = {
        isEnabled: isEnabled,
        load: load,
        retry: retry,
        publicShipIds: publicShipIds,
        getShip: getShip,
        roleKo: roleKo,
        roleList: roleList,
        taxonomy: function () { return store.filterTaxonomy || null; },
        get data() { return store; },
        get state() { return state; },
        get error() { return lastError ? lastError.message : null; }
    };
})();
