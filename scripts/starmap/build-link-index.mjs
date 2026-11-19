#!/usr/bin/env node
/**
 * Star map link index: data/starmap/links.json.
 *
 * The trade, mission and mining screens show a "지도에서 보기" (Show on map) link next to a place only when that
 * place can really be shown on the star map. They must not download the three system files (560 KB) just to
 * decide that, so this small file lists what the map can show. It is derived ONLY from data/starmap/index.json
 * and the three system files — no new facts, nothing typed by hand.
 *
 *   places  { <system>: [object id, …] }  objects with a position (`pos`)
 *   guess   { <system>: [object id, …] }  objects without a position but with a guessed spot (`guess`): the map marks them "추정"
 *   uex     { <UEX terminal id>: object id }  commodity terminals (`uex`) and refinery terminals (`uexRef`) of the objects above
 *   areas   { <mining area id>: [system, …] }  = index.regionSystems
 *   sites   { <mission site id>: { at?: [n, …], near?: [n, …], spots?: count } }
 *           n = position in the flat list places.stanton + places.pyro + places.nyx + guess.stanton + guess.pyro + guess.nyx
 *           at = map objects the site is placed at · near = body named by its tags only (no placement found, 추정) · spots = separately placed points
 *
 * Objects with neither `pos` nor `guess` are left out on purpose: the map cannot point at them, so no screen links to them.
 *
 * Usage:  node scripts/starmap/build-link-index.mjs [--check]
 *         (scripts/starmap/build-starmap-data.mjs calls writeLinkIndex() itself after writing the system files)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const LINKS_PATH = 'data/starmap/links.json';
export const LINK_SYSTEMS = ['stanton', 'pyro', 'nyx'];

export function buildLinkIndex(index, systemFiles) {
    const places = {};
    const guess = {};
    const uex = {};
    for (const system of LINK_SYSTEMS) {
        const objects = systemFiles[system].objects;
        places[system] = objects.filter((object) => Array.isArray(object.pos)).map((object) => object.id);
        guess[system] = objects.filter((object) => !object.pos && object.guess).map((object) => object.id);
    }
    const flat = [...LINK_SYSTEMS.flatMap((system) => places[system]), ...LINK_SYSTEMS.flatMap((system) => guess[system])];
    const at = new Map(flat.map((id, n) => [id, n]));
    for (const system of LINK_SYSTEMS) {
        for (const object of systemFiles[system].objects) {
            if (!at.has(object.id)) continue;
            for (const terminal of [...(object.uex || []), ...(object.uexRef || [])]) if (!(terminal in uex)) uex[terminal] = object.id;
        }
    }
    const sites = {};
    for (const id of Object.keys(index.siteSystems || {}).sort()) {
        const entry = { at: new Set(), near: new Set(), spots: 0 };
        for (const system of index.siteSystems[id]) {
            const site = systemFiles[system].sites?.[id];
            if (!site) continue;
            for (const objectId of site.at || []) if (at.has(objectId)) entry.at.add(at.get(objectId));
            for (const objectId of site.near || []) if (at.has(objectId)) entry.near.add(at.get(objectId));
            entry.spots += (site.spots || []).length;
        }
        const out = {};
        if (entry.at.size) out.at = [...entry.at].sort((a, b) => a - b);
        if (entry.near.size) out.near = [...entry.near].sort((a, b) => a - b);
        if (entry.spots) out.spots = entry.spots;
        if (Object.keys(out).length) sites[id] = out;
    }
    return {
        schema: 1, version: index.version, gameVersion: index.gameVersion, source: 'data/starmap/*.json', sourceHash: index.sourceHash,
        systems: LINK_SYSTEMS, places, guess, uex, areas: index.regionSystems || {}, sites,
    };
}

const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

export function linkIndexFromDisk() {
    const index = readJson('data/starmap/index.json');
    return buildLinkIndex(index, Object.fromEntries(LINK_SYSTEMS.map((system) => [system, readJson(`data/starmap/${system}.json`)])));
}

/** Writes data/starmap/links.json when it differs. Returns 'unchanged' | 'written'. */
export function writeLinkIndex(data) {
    const file = resolve(ROOT, LINKS_PATH);
    const text = `${JSON.stringify(data)}\n`;
    if (existsSync(file) && readFileSync(file, 'utf8') === text) return 'unchanged';
    writeFileSync(file, text);
    return 'written';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const data = linkIndexFromDisk();
    const text = `${JSON.stringify(data)}\n`;
    if (process.argv.includes('--check')) {
        const file = resolve(ROOT, LINKS_PATH);
        const same = existsSync(file) && readFileSync(file, 'utf8') === text;
        console.log(`${same ? 'same' : 'DIFFERENT'}: ${LINKS_PATH}`);
        process.exit(same ? 0 : 1);
    }
    const count = (group) => LINK_SYSTEMS.reduce((sum, system) => sum + group[system].length, 0);
    console.log(`${LINKS_PATH}: ${writeLinkIndex(data)} (${Buffer.byteLength(text)} bytes; ${count(data.places)} places, ${count(data.guess)} guessed, ${Object.keys(data.uex).length} UEX terminals, ${Object.keys(data.areas).length} areas, ${Object.keys(data.sites).length} mission sites)`);
}
