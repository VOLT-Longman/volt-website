// 저장소의 모든 JavaScript 파일을 검증한다.
// - 브라우저용 클래식 스크립트(js/, data/, admin/, sw.js, scripts/*.js): node --check 문법 검사
// - Cloudflare Functions ESM(functions/**): dynamic import로 문법 + 상대 임포트 해석까지 검증
// 사용법: node scripts/check-syntax.mjs

import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectJsFiles(dir) {
    const results = [];
    for (const entry of readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        if (statSync(fullPath).isDirectory()) {
            results.push(...collectJsFiles(fullPath));
        } else if (entry.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

const problems = [];

const classicTargets = [
    ...collectJsFiles(path.join(root, 'js')),
    ...collectJsFiles(path.join(root, 'data')),
    ...collectJsFiles(path.join(root, 'admin')),
    ...collectJsFiles(path.join(root, 'scripts')),
    path.join(root, 'sw.js'),
];

for (const file of classicTargets) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
        problems.push(`${path.relative(root, file)}\n${error.stderr}`);
    }
}

const functionTargets = collectJsFiles(path.join(root, 'functions'));

for (const file of functionTargets) {
    try {
        await import(pathToFileURL(file).href);
    } catch (error) {
        problems.push(`${path.relative(root, file)}\n${error.message}`);
    }
}

if (problems.length > 0) {
    console.error(`문법/임포트 오류 ${problems.length}건:`);
    for (const problem of problems) console.error(`\n - ${problem}`);
    process.exit(1);
}

console.log(`OK: 클래식 스크립트 ${classicTargets.length}개, Functions 모듈 ${functionTargets.length}개 검증 통과`);
