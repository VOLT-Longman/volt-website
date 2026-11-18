#!/usr/bin/env node
/**
 * 개인 장비 이미지 — Star Citizen Wiki(starcitizen.tools)의 대표 이미지를 작은 크기로 한 번 받아 사이트에 둔다.
 *
 * 위키의 공개 API(MediaWiki)만 쓴다. 장비 이름과 제목이 같은 문서의 대표 이미지를 고르고,
 * 파일마다 적힌 이용 조건(CC0 / CC BY / CC BY-SA / Cloud Imperium 소유)과 만든 사람, 원본 주소를 함께 남긴다.
 * 이용 조건을 알 수 없는 파일은 받지 않는다. 위키 서버에 부담을 주지 않도록 요청 사이에 쉬고, 이미 받은 파일은 다시 받지 않는다.
 * 화면은 이미지를 위키에 직접 연결하지 않고 이 저장소의 사본을 쓴다.
 *
 * 사용: node scripts/gear/fetch-wiki-images.mjs [--width 400]
 * 출력: assets/images/gear/wiki/<묶음>.webp, data/gear/images.json
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const API = 'https://starcitizen.tools/api.php';
const AGENT = 'fleet-site-gear-images/1.0 (one-time thumbnail copy with attribution)';
const WIDTH = Number(process.argv[process.argv.indexOf('--width') + 1]) || 400;
const ALLOWED = /^(CC0|CC BY 4\.0|CC BY SA 4\.0|CC BY-SA 4\.0|Cloud Imperium IP)$/i;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const headers = { 'User-Agent': AGENT };
async function api(params) {
    const response = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { headers: { ...headers, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`wiki ${response.status}`);
    return response.json();
}
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const flat = (title) => String(title).replace(/_/g, ' ');

const groups = [
    ...JSON.parse(readFileSync(resolve(ROOT, 'data/gear/weapons.json'), 'utf8')).groups,
    ...JSON.parse(readFileSync(resolve(ROOT, 'data/gear/armor.json'), 'utf8')).groups,
].map((group) => ({ id: group.id, name: group.name.en }));

// 1) 이름이 같은 문서의 대표 이미지
const pageImage = new Map();
for (const batch of chunk([...new Set(groups.map((group) => group.name))], 50)) {
    const data = await api({ action: 'query', redirects: '1', titles: batch.join('|'), prop: 'pageimages', piprop: 'name' });
    const alias = new Map([...(data.query.normalized || []), ...(data.query.redirects || [])].map((entry) => [entry.to, entry.from]));
    for (const page of data.query.pages || []) {
        if (page.missing || !page.pageimage) continue;
        let name = page.title; for (let i = 0; i < 3 && alias.has(name); i += 1) name = alias.get(name);
        const entry = { file: flat(`File:${page.pageimage}`), page: page.title };
        pageImage.set(name, entry); pageImage.set(page.title, entry);
    }
    await sleep(400);
}

// 2) 파일의 이용 조건과 작은 그림 주소
const info = new Map();
for (const batch of chunk([...new Set([...pageImage.values()].map((entry) => entry.file))], 40)) {
    const data = await api({ action: 'query', titles: batch.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|user', iiurlwidth: String(WIDTH) });
    for (const page of data.query.pages || []) {
        const image = page.imageinfo?.[0]; if (!image) continue;
        const meta = image.extmetadata || {};
        info.set(flat(page.title), {
            thumb: image.thumburl, width: image.thumbwidth, height: image.thumbheight, source: image.descriptionurl,
            license: meta.LicenseShortName?.value || '', author: String(meta.Artist?.value || image.user || '').replace(/<[^>]+>/g, '').replace(/^User:/, '').trim().slice(0, 60),
        });
    }
    await sleep(400);
}

// 3) 받기
mkdirSync(resolve(ROOT, 'assets/images/gear/wiki'), { recursive: true });
const images = {}; const skipped = { noPage: 0, noLicense: 0, failed: 0 }; let fetched = 0;
for (const group of groups) {
    const page = pageImage.get(group.name); const image = page ? info.get(page.file) : null;
    if (!image?.thumb) { skipped.noPage += 1; continue; }
    if (!ALLOWED.test(image.license)) { skipped.noLicense += 1; continue; }
    const file = `assets/images/gear/wiki/${group.id.replace(/[^a-z0-9_-]+/gi, '-')}.webp`;
    const target = resolve(ROOT, file);
    if (!existsSync(target) || !statSync(target).size) {
        try {
            const response = await fetch(image.thumb, { headers });
            if (!response.ok) throw new Error(String(response.status));
            const bytes = Buffer.from(await response.arrayBuffer());
            // 받은 것이 정말 WebP 인지 확인한다(오류 페이지를 그림으로 저장하지 않게).
            if (bytes.subarray(0, 4).toString('latin1') !== 'RIFF' || bytes.subarray(8, 12).toString('latin1') !== 'WEBP') throw new Error('not webp');
            writeFileSync(target, bytes); fetched += 1;
            await sleep(250);
        } catch (_error) { skipped.failed += 1; continue; }
    }
    images[group.id] = { file, width: image.width, height: image.height, license: image.license.replace('CC BY SA', 'CC BY-SA'), author: image.author || undefined, source: image.source, page: page.page };
}
writeFileSync(resolve(ROOT, 'data/gear/images.json'), `${JSON.stringify({ origin: 'Star Citizen Wiki (https://starcitizen.tools)', fetchedAt: new Date().toISOString(), width: WIDTH, note: '파일마다 만든 사람(author)·이용 조건(license)·원본 주소(source)를 싣는다. 화면에 함께 표시한다.', images })}\n`);
const licenses = Object.values(images).reduce((out, image) => { out[image.license] = (out[image.license] || 0) + 1; return out; }, {});
console.log(`장비 이미지: ${Object.keys(images).length} / ${groups.length} (새로 받음 ${fetched}). 건너뜀 ${JSON.stringify(skipped)}. 이용 조건 ${JSON.stringify(licenses)}`);
