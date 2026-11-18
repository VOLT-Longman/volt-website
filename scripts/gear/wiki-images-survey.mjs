#!/usr/bin/env node
/**
 * 조사: Star Citizen Wiki(starcitizen.tools)에 개인 장비의 대표 이미지가 얼마나 있고, 이용 조건이 무엇인지 센다.
 * 위키의 공개 API(MediaWiki)만 쓴다. 이미지를 내려받지 않고, 사이트에 반영하지도 않는다.
 *
 * 사용: node scripts/gear/wiki-images-survey.mjs [--write]
 *   --write: 결과를 data/gear/wiki-images.survey.json 에 남긴다(검토용. 화면은 이 파일을 읽지 않는다).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const API = 'https://starcitizen.tools/api.php';
const AGENT = 'fleet-site-image-survey/1.0 (one-off coverage check)';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function api(params) {
    const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
    const response = await fetch(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`wiki ${response.status}`);
    return response.json();
}
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

const groups = [
    ...JSON.parse(readFileSync(resolve(ROOT, 'data/gear/weapons.json'), 'utf8')).groups.map((group) => ({ kind: 'weapon', id: group.id, name: group.name.en })),
    ...JSON.parse(readFileSync(resolve(ROOT, 'data/gear/armor.json'), 'utf8')).groups.map((group) => ({ kind: group.slot, id: group.id, name: group.name.en })),
];

// 1) 장비 이름과 같은 제목의 문서에서 대표 이미지를 찾는다.
const pageImage = new Map(); // 이름 → 파일 제목
for (const batch of chunk([...new Set(groups.map((group) => group.name))], 50)) {
    const data = await api({ action: 'query', redirects: '1', titles: batch.join('|'), prop: 'pageimages', piprop: 'name|original' });
    const alias = new Map([...(data.query.normalized || []), ...(data.query.redirects || [])].map((entry) => [entry.to, entry.from]));
    for (const page of data.query.pages || []) {
        if (page.missing || !page.pageimage) continue;
        // 넘겨주기를 거친 경우 원래 요청한 이름으로 되돌린다.
        let name = page.title; for (let i = 0; i < 3 && alias.has(name); i += 1) name = alias.get(name);
        pageImage.set(name, { file: `File:${page.pageimage}`, url: page.original?.source, width: page.original?.width, height: page.original?.height, page: page.title });
        pageImage.set(page.title, pageImage.get(name));
    }
    await sleep(400);
}

// 2) 그 이미지 파일의 이용 조건.
const license = new Map();
for (const batch of chunk([...new Set([...pageImage.values()].map((entry) => entry.file))], 50)) {
    const data = await api({ action: 'query', titles: batch.join('|'), prop: 'imageinfo', iiprop: 'extmetadata|user' });
    for (const page of data.query.pages || []) {
        const meta = page.imageinfo?.[0]?.extmetadata || {};
        license.set(page.title, { license: meta.LicenseShortName?.value || 'unknown', author: String(meta.Artist?.value || page.imageinfo?.[0]?.user || '').replace(/<[^>]+>/g, '').trim().slice(0, 80) });
    }
    await sleep(400);
}

// 파일 제목은 밑줄과 빈칸이 섞여 온다. 빈칸으로 맞춰 찾는다.
const licenseOf = (file) => license.get(file) || license.get(file.replace(/_/g, ' ')) || {};
const rows = groups.map((group) => { const image = pageImage.get(group.name); return image ? { ...group, ...image, ...licenseOf(image.file) } : { ...group }; });
const count = (list, key) => list.reduce((out, row) => { const k = key(row); out[k] = (out[k] || 0) + 1; return out; }, {});
const withImage = rows.filter((row) => row.file);
const summary = {
    groups: rows.length, withImage: withImage.length,
    byKind: Object.fromEntries(Object.entries(count(rows, (row) => row.kind)).map(([kind, total]) => [kind, `${withImage.filter((row) => row.kind === kind).length}/${total}`])),
    byLicense: count(withImage, (row) => row.license),
};
console.log(JSON.stringify(summary, null, 1));
console.log('예:', withImage.slice(0, 5).map((row) => `${row.name} ← ${row.file} [${row.license}, ${row.author}]`).join('\n    '));
if (process.argv.includes('--write')) writeFileSync(resolve(ROOT, 'data/gear/wiki-images.survey.json'), `${JSON.stringify({ source: 'https://starcitizen.tools (MediaWiki API)', checkedAt: new Date().toISOString(), note: '검토용 조사 결과. 화면은 이 파일을 읽지 않는다.', summary, rows }, null, 1)}\n`);
