// 저장소의 모든 JavaScript 파일을 검증한다.
// - 브라우저용 클래식 스크립트(js/, data/, admin/, sw.js, scripts/*.js): node --check 문법 검사
// - 브라우저용 ES 모듈(BROWSER_MODULES): .mjs 임시 사본으로 node --check (문법만; 브라우저 경로 임포트는 해석하지 않는다)
// - Cloudflare Functions ESM(functions/**): dynamic import로 문법 + 상대 임포트 해석까지 검증
// 사용법: node scripts/check-syntax.mjs

import { copyFileSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
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

// 브라우저에서 import()로 불러오는 ES 모듈. 저장소 package.json에 "type"이 없어 .js는 클래식으로 취급되므로
// Node 버전에 따라 node --check가 import 문을 문법 오류로 볼 수 있다 → .mjs 임시 사본으로 검사한다.
const BROWSER_MODULES = new Set([path.join(root, 'js', 'gear-viewer.js'), path.join(root, 'js', 'starmap-viewer.js')]);
const moduleScratch = mkdtempSync(path.join(os.tmpdir(), 'volt-check-syntax-'));

for (const file of classicTargets) {
    try {
        let target = file;
        if (BROWSER_MODULES.has(file)) {
            target = path.join(moduleScratch, `${path.basename(file, '.js')}.mjs`);
            copyFileSync(file, target);
        }
        execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });
    } catch (error) {
        problems.push(`${path.relative(root, file)}\n${error.stderr}`);
    }
}
rmSync(moduleScratch, { recursive: true, force: true });

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

console.log(`OK: 클래식 스크립트 ${classicTargets.length - BROWSER_MODULES.size}개, 브라우저 모듈 ${BROWSER_MODULES.size}개, Functions 모듈 ${functionTargets.length}개 검증 통과`);
