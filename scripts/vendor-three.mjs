// three.js 를 node_modules 에서 assets/vendor/three-<version>/ 으로 복사한다 (gsap 과 같은 방식: 고정 버전 npm 패키지 → 자체 호스팅).
//
// 왜 그대로 복사하지 않고 한 줄씩 고치는가:
//   사이트 CSP 는 script-src 'self' 라서 import map(인라인 스크립트)을 쓸 수 없고, 브라우저는 import map 없이
//   'three' 라는 맨이름을 풀지 못한다. 그래서 애드온 파일의 `from 'three'` 만 상대 경로로 바꾼다. 그 밖의 내용은 원본 그대로다.
// 왜 폴더 이름에 버전이 들어가는가:
//   /assets/* 는 1년 immutable 캐시이고 three.module.js 는 ./three.core.js 를 캐시 키 없이 불러온다.
//   버전을 올리면 폴더가 바뀌어 주소가 통째로 바뀐다.
//
// 사용법:
//   node scripts/vendor-three.mjs            복사 (이전 버전 폴더는 지운다)
//   node scripts/vendor-three.mjs --verify   복사본이 node_modules 와 일치하는지, CSP 를 깨는 코드가 없는지,
//                                            js/gear-viewer.js 가 지금 버전 폴더를 가리키는지 검사 (npm run check 에 포함)

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const verify = process.argv.includes('--verify');
const source = path.join(root, 'node_modules/three');
const vendorRoot = path.join(root, 'assets/vendor');

// js/gear-viewer.js 가 실제로 불러오는 파일과, 그 파일들이 불러오는 파일 전부.
const FILES = [
    'build/three.module.js',
    'build/three.core.js',
    'examples/jsm/loaders/GLTFLoader.js',
    'examples/jsm/utils/BufferGeometryUtils.js',
    'examples/jsm/utils/SkeletonUtils.js',
    'examples/jsm/controls/OrbitControls.js',
    'examples/jsm/environments/RoomEnvironment.js',
];
const VIEWER = 'js/gear-viewer.js';

// script-src 'self' 아래에서 막히거나(문자열 실행), 우리 CSP 가 허용하지 않는 주소를 만드는 코드.
// createObjectURL 은 GLTFLoader 가 .glb 안에 넣은 그림을 읽을 때만 쓰는 경로라 허용 목록에 둔다
// (우리 모형은 그림을 별도 파일로 두므로 그 경로를 타지 않는다).
const FORBIDDEN = [
    [/\beval\s*\(/, 'eval('],
    [/\bnew\s+Function\b/, 'new Function'],
    [/\bset(?:Timeout|Interval)\s*\(\s*['"`]/, '문자열 setTimeout/setInterval'],
    [/\bimportScripts\s*\(/, 'importScripts('],
    [/\bnew\s+Worker\s*\(/, 'new Worker('],
    [/\bWebAssembly\s*\.\s*(?:instantiate|compile|Module)/, 'WebAssembly 실행'],
    [/\bdocument\s*\.\s*write\s*\(/, 'document.write('],
];

const pkg = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
const folder = `three-${pkg.version}`;
const target = path.join(vendorRoot, folder);
const problems = [];

function stripComments(text) {
    // 주석 속 예시 코드(예: "@three_import import ... from 'three/addons/...'")를 검사에서 뺀다.
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function transform(file) {
    const original = readFileSync(path.join(source, file), 'utf8');
    const depth = file.split('/').length - 1;
    const core = `${'../'.repeat(depth)}build/three.module.js`;
    let rewritten = 0;
    const text = original.replace(/^(\s*(?:import\b[^'"\n]*|\}\s*)from\s+)'three'/gm, (_all, head) => {
        rewritten += 1;
        return `${head}'${core}'`;
    });
    const code = stripComments(text);
    for (const match of code.matchAll(/(?:^|[\s;}])(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)) {
        const specifier = match[1] || match[2];
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) problems.push(`${file}: 풀리지 않은 맨이름 import '${specifier}'`);
        else {
            const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
            if (!FILES.includes(resolved)) problems.push(`${file}: '${specifier}' (${resolved}) 가 복사 목록에 없습니다`);
        }
    }
    for (const [pattern, label] of FORBIDDEN) if (pattern.test(code)) problems.push(`${file}: CSP 를 깨는 코드 발견 — ${label}`);
    return { text, rewritten };
}

const outputs = FILES.map((file) => ({ file, ...transform(file) }));
const license = readFileSync(path.join(source, 'LICENSE'), 'utf8');
const readme = [
    `# three.js ${pkg.version}`,
    '',
    `Self-hosted three.js ${pkg.version} (${pkg.license}), copied from the pinned npm package by \`scripts/vendor-three.mjs\`.`,
    'Only the files the weapon viewer (`js/gear-viewer.js`) imports are here.',
    '',
    "The only change to the upstream files: the bare module specifier `'three'` in the addon files is rewritten to a",
    "relative path (`../../../build/three.module.js`), because the site CSP (`script-src 'self'`) rules out an import map.",
    'Copyright and license: see `LICENSE` in this folder.',
    '',
    `- Source: https://www.npmjs.com/package/three/v/${pkg.version}`,
    '- Refresh: `npm ci && npm run three:vendor` (then update the import paths at the top of `js/gear-viewer.js` if the version changed)',
    '- Verify: `node scripts/vendor-three.mjs --verify` (included in `npm run check`)',
    '',
    '| file | bytes | rewritten imports |',
    '|---|---:|---:|',
    ...outputs.map((entry) => `| ${entry.file} | ${Buffer.byteLength(entry.text)} | ${entry.rewritten} |`),
    '',
].join('\n');

if (problems.length === 0) {
    if (verify) {
        const expected = [...outputs.map((entry) => [entry.file, entry.text]), ['LICENSE', license], ['README.md', readme]];
        for (const [file, text] of expected) {
            const destination = path.join(target, file);
            if (!existsSync(destination)) problems.push(`${folder}/${file} 이 없습니다. npm run three:vendor 를 실행하세요.`);
            else if (readFileSync(destination, 'utf8') !== text) problems.push(`${folder}/${file} 이 node_modules 와 다릅니다. npm run three:vendor 를 실행하세요.`);
        }
        const stale = existsSync(vendorRoot) ? readdirSync(vendorRoot).filter((name) => /^three-/.test(name) && name !== folder) : [];
        for (const name of stale) problems.push(`assets/vendor/${name} 은 이전 버전 폴더입니다. npm run three:vendor 로 정리하세요.`);
    } else {
        if (existsSync(vendorRoot)) {
            for (const name of readdirSync(vendorRoot)) if (/^three-/.test(name)) rmSync(path.join(vendorRoot, name), { recursive: true });
        }
        for (const entry of outputs) {
            const destination = path.join(target, entry.file);
            mkdirSync(path.dirname(destination), { recursive: true });
            writeFileSync(destination, entry.text);
        }
        writeFileSync(path.join(target, 'LICENSE'), license);
        writeFileSync(path.join(target, 'README.md'), readme);
    }
    // 뷰어가 지금 버전 폴더를 가리키는지 (파일이 아직 없으면 건너뛴다).
    const viewerPath = path.join(root, VIEWER);
    if (existsSync(viewerPath)) {
        const viewer = stripComments(readFileSync(viewerPath, 'utf8'));
        const imports = [...viewer.matchAll(/\bfrom\s*['"]([^'"]*assets\/vendor\/three-[^'"]+)['"]/g)].map((match) => match[1]);
        if (imports.length === 0) problems.push(`${VIEWER}: three.js import 를 찾지 못했습니다.`);
        for (const specifier of imports) {
            const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(VIEWER), specifier));
            const prefix = `assets/vendor/${folder}/`;
            if (!resolved.startsWith(prefix)) problems.push(`${VIEWER}: '${specifier}' 가 지금 버전 폴더(${prefix})를 가리키지 않습니다.`);
            else if (!FILES.includes(resolved.slice(prefix.length))) problems.push(`${VIEWER}: '${specifier}' 가 복사 목록에 없습니다.`);
        }
    }
}

if (problems.length > 0) {
    console.error(`three.js vendor 문제 ${problems.length}건:`);
    for (const problem of problems) console.error(` - ${problem}`);
    process.exit(1);
}

const total = outputs.reduce((sum, entry) => sum + Buffer.byteLength(entry.text), 0);
console.log(`three.js ${pkg.version} vendor ${verify ? 'verified' : 'copied'} (${outputs.length} files, ${total} bytes, ${pkg.license} LICENSE kept) -> assets/vendor/${folder}`);
