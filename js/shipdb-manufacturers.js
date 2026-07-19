/*
 * Erkul and RSI Ship Matrix use different manufacturer spellings. Source data
 * stays untouched; the UI receives one stable filter key and display label.
 */
(function () {
    'use strict';

    const DEFINITIONS = [
        ['aegis-dynamics', 'Aegis', 'Aegis', 'Aegis Dynamics'],
        ['anvil-aerospace', 'Anvil', 'Anvil', 'Anvil Aerospace'],
        ['argo-astronautics', 'ARGO', 'ARGO', 'Argo Astronautics'],
        ['consolidated-outland', 'CNOU', 'CNOU', 'Consolidated Outland'],
        ['crusader-industries', 'Crusader', 'Crusader', 'Crusader Industries'],
        ['drake-interplanetary', 'Drake', 'Drake', 'Drake Interplanetary'],
        ['gatac-manufacture', 'Gatac', 'Gatac', 'Gatac Manufacture'],
        ['kruger-intergalactic', 'Kruger', 'Kruger', 'Kruger Intergalactic'],
        ['misc', 'MISC', 'MISC', 'Musashi Industrial & Starflight Concern'],
        ['origin-jumpworks', 'Origin', 'Origin', 'Origin Jumpworks'],
        ['roberts-space-industries', 'RSI', 'RSI', 'Roberts Space Industries'],
        ['tumbril-land-systems', 'Tumbril', 'Tumbril', 'Tumbril Land Systems'],
    ];
    const aliases = Object.create(null);

    function normalize(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function registerAliases() {
        DEFINITIONS.forEach(function ([key, label, ...names]) {
            names.forEach(function (name) { aliases[normalize(name)] = { key, label }; });
        });
    }

    function resolve(value) {
        const raw = String(value || '').trim();
        return aliases[normalize(raw)] || { key: normalize(raw), label: raw };
    }

    registerAliases();
    window.VOLT_SHIPDB_MANUFACTURERS = Object.freeze({ resolve });
}());
