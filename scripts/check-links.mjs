// 정적 HTML의 링크를 오프라인으로 검증한다.
// - 로컬 에셋(href/src의 css/js/assets 등): 실제 파일 존재 확인
// - 페이지 내 앵커(href="#id"): 같은 문서에 해당 id가 있는지 확인
// 외부 URL(http/https/mailto)과 서버 라우트(/api, /auth)는 동적이므로 건너뛴다.
// 사용법: node scripts/check-links.mjs

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 검사 대상 HTML 문서.
const htmlFiles = ['index.html', 'admin/index.html', '404.html'];

// 동적이라 파일 존재로 검증할 수 없는 접두사(서버 라우트 등).
const dynamicPrefixes = ['/api/', '/auth/'];

// 동적으로 생성되는 앵커 — 정적 문서에 id가 없어도 정상.
// 정책 조항(#policy-section-*) 등은 런타임에 렌더된다.
const dynamicAnchorPattern = /^#(policy-section-|ship-|gallery-|notice-)/;

const problems = [];

function isExternal(ref) {
    return /^(https?:)?\/\//.test(ref) || /^(mailto:|tel:|data:|javascript:)/.test(ref);
}

function extractRefs(html) {
    return [...html.matchAll(/\b(?:href|src)\s*=\s*"([^"]+)"/gi)].map((match) => match[1].trim());
}

function collectIds(html) {
    return new Set([...html.matchAll(/\bid\s*=\s*"([^"]+)"/gi)].map((match) => match[1].trim()));
}

function checkFile(relFile) {
    const absFile = path.join(root, relFile);
    if (!existsSync(absFile)) {
        problems.push(`${relFile}: 문서를 찾을 수 없습니다.`);
        return;
    }
    const html = readFileSync(absFile, 'utf8');
    const ids = collectIds(html);
    const fileDir = path.dirname(absFile);

    for (const ref of extractRefs(html)) {
        if (!ref || ref === '#' || isExternal(ref)) continue;
        if (dynamicPrefixes.some((prefix) => ref.startsWith(prefix))) continue;

        if (ref.startsWith('#')) {
            const anchor = ref.split('?')[0];
            if (dynamicAnchorPattern.test(anchor)) continue;
            const id = anchor.slice(1);
            if (id && !ids.has(id)) {
                problems.push(`${relFile}: 앵커 대상 없음 → ${ref} (id="${id}" 미존재)`);
            }
            continue;
        }

        // 쿼리(?v=)와 해시 제거 후 경로만 검증.
        const cleanPath = ref.split('#')[0].split('?')[0];
        if (!cleanPath) continue;
        const absTarget = cleanPath.startsWith('/')
            ? path.join(root, cleanPath)
            : path.resolve(fileDir, cleanPath);
        if (!existsSync(absTarget)) {
            problems.push(`${relFile}: 로컬 에셋 없음 → ${ref} (${path.relative(root, absTarget)})`);
        }
    }
}

for (const file of htmlFiles) checkFile(file);

if (problems.length > 0) {
    console.error(`링크 오류 ${problems.length}건:`);
    for (const problem of problems) console.error(` - ${problem}`);
    process.exit(1);
}

console.log(`OK: HTML ${htmlFiles.length}개의 로컬 에셋/앵커 링크 검증 통과`);
