#!/usr/bin/env node
/**
 * CSS 중복 selector 탐지기 (완전한 파서가 아니라 유지보수용 힌트 도구).
 *
 * css/styles.css를 브레이스 깊이 기준으로 훑어, 같은 컨텍스트(top-level 또는
 * 동일 @media 조건) 안에서 동일 selector가 2번 이상 정의되면 리포트한다.
 * @media 별 재정의는 정상이므로 컨텍스트를 키에 포함해 오탐을 줄인다.
 *
 * 사용:  node scripts/check-css-duplicates.mjs [--fail]
 *   --fail: 중복이 있으면 exit 1 (CI 게이트로 쓰고 싶을 때)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(root, 'css', 'styles.css');
const raw = fs.readFileSync(cssPath, 'utf8');

// 주석 제거(라인 번호 보존을 위해 개행은 유지).
const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

// 간단 토크나이저: 브레이스 깊이를 추적하며 selector 블록을 수집한다.
const selectors = new Map(); // key: `${context} :: ${selector}` → [lineNumbers]
let depth = 0;
let contextStack = []; // @media 등 at-rule 조건
let buffer = '';
let line = 1;
let bufferStartLine = 1;

function normalizeSelector(sel) {
    return sel.replace(/\s+/g, ' ').trim();
}

for (let i = 0; i < noComments.length; i += 1) {
    const ch = noComments[i];
    if (ch === '\n') line += 1;
    if (ch === '{') {
        const head = normalizeSelector(buffer);
        buffer = '';
        if (/^@/.test(head)) {
            // at-rule(@media, @supports, @keyframes 등) 진입 → 컨텍스트로 push
            contextStack.push(head);
        } else {
            const context = contextStack.join(' > ') || '(top-level)';
            // selector 리스트를 콤마로 분리해 각각 카운트
            head.split(',').map(normalizeSelector).filter(Boolean).forEach((sel) => {
                const key = `${context} :: ${sel}`;
                if (!selectors.has(key)) selectors.set(key, []);
                selectors.get(key).push(bufferStartLine);
            });
            contextStack.push('__rule__');
        }
        depth += 1;
        bufferStartLine = line;
    } else if (ch === '}') {
        depth = Math.max(0, depth - 1);
        contextStack.pop();
        buffer = '';
        bufferStartLine = line;
    } else {
        if (buffer === '' || /\S/.test(ch)) {
            if (buffer === '') bufferStartLine = line;
        }
        buffer += ch;
    }
}

const dupes = [...selectors.entries()]
    .filter(([, lines]) => lines.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

if (dupes.length === 0) {
    console.log('CSS 중복 selector 없음 ✔');
    process.exit(0);
}

console.log(`CSS 중복 selector ${dupes.length}건 (같은 컨텍스트에서 2회+ 정의):\n`);
for (const [key, lines] of dupes) {
    console.log(`  ${lines.length}회  ${key}`);
    console.log(`        lines: ${lines.join(', ')}`);
}

if (process.argv.includes('--fail')) process.exit(1);
