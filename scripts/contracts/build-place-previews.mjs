import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Keep contract order identical to the full place filter. Nearby sites are not exact matches.
export function buildPlacePreviews(data, links) {
    const flat = ['places', 'guess'].flatMap(group => links.systems.flatMap(system => links[group]?.[system] || []));
    const places = Object.create(null);
    const items = Object.create(null);
    const scopes = Object.create(null);
    for (const contract of data.contracts) {
        const ids = new Set();
        function add(id) {
            if (!id) return;
            ids.add(id);
            ids.add(id.replace(/SolarSystem$/, 'Star'));
        }
        for (const id of [...(contract.at || []), ...(contract.loc || [])]) {
            add(id);
            for (const member of data.localities[id]?.members || []) add(member);
        }
        for (const site of contract.sites || []) {
            for (const index of site.at || []) {
                for (const position of links.sites[data.locations[index]?.id]?.at || []) add(flat[position]);
            }
        }
        for (const id of ids) {
            const entry = places[id] ||= { count: 0, ids: [] };
            entry.count++;
            if (entry.ids.length === 5) continue;
            entry.ids.push(contract.id);
            const { t, scope, min, max, pay } = contract;
            items[contract.id] ||= { title: data.texts[t], scope, min, max, pay };
            if (scope) scopes[scope] = data.scopes[scope];
        }
    }
    return { places, items, scopes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const data = new URL('../../data/', import.meta.url);
    const read = file => JSON.parse(readFileSync(new URL(file, data)));
    const result = buildPlacePreviews(read('contracts/mission-list.json'), read('starmap/links.json'));
    writeFileSync(new URL('contracts/place-previews.json', data), JSON.stringify(result) + '\n');
}
