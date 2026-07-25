import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    DERIVED_FILE_PATHS,
    SNAPSHOT_FILE_NAMES,
    SNAPSHOT_PREFIX,
    STAGING_PREFIX,
    assertDerivedManifest,
    createR2ObjectUrl,
    createSnapshotManifest,
    createSnapshotObjectKeys,
    getR2Object,
    gunzipText,
    gzipText,
    putImmutableObject,
    sha256
} from '../../scripts/erkul/r2-snapshot.mjs';
import { runNodeScript } from '../../scripts/erkul/run-node-script.mjs';

const PREVIEW_HASH = 'a'.repeat(64);
const SYNCED_AT = '2026-07-25T01:02:03.456Z';
const CONFIG = { endpoint: 'https://account.r2.cloudflarestorage.com', bucket: 'volt-erkul-snapshots' };
const validDerived = () => Object.fromEntries(DERIVED_FILE_PATHS.map((path, index) => [path, String(index).repeat(64)]));

test('R2 snapshot keys use immutable and separately staged prefixes', () => {
    const finalKeys = createSnapshotObjectKeys(SNAPSHOT_PREFIX, SYNCED_AT, PREVIEW_HASH);
    const stagingKeys = createSnapshotObjectKeys(STAGING_PREFIX, SYNCED_AT, PREVIEW_HASH);
    assert.equal(finalKeys.shipsRaw, `erkul/${SYNCED_AT}/${PREVIEW_HASH}/ships.raw.json.gz`);
    assert.equal(stagingKeys.manifest, `staging/${SYNCED_AT}/${PREVIEW_HASH}/manifest.json`);
    assert.throws(() => createSnapshotObjectKeys('unsafe', SYNCED_AT, PREVIEW_HASH), /unsupported snapshot prefix/);
});

test('R2 snapshot manifest requires source and compressed checksums', () => {
    const checksum = 'b'.repeat(64);
    const entry = { rawSha256: checksum, compressedSha256: checksum, rawBytes: 12, compressedBytes: 9 };
    const args = {
        previewHash: PREVIEW_HASH,
        syncedAt: SYNCED_AT,
        sourceCommit: '1234567',
        prefix: SNAPSHOT_PREFIX,
        objects: { shipsRaw: entry, shopRaw: entry, fetchMeta: entry },
        derived: validDerived()
    };
    const manifest = createSnapshotManifest(args);
    assert.equal(manifest.schema, 'erkul-r2-snapshot/v1');
    assert.equal(manifest.snapshot.prefix, `erkul/${SYNCED_AT}/${PREVIEW_HASH}`);
    assert.throws(() => createSnapshotManifest({ ...args, sourceCommit: 'not-a-sha' }), /sourceCommit/);
});

// F3: derived가 비어 있으면 verify가 0회 순회로 통과하던 결함. 생성 단계에서부터 차단한다.
test('R2 snapshot manifest rejects incomplete derived outputs', () => {
    const checksum = 'b'.repeat(64);
    const entry = { rawSha256: checksum, compressedSha256: checksum, rawBytes: 12, compressedBytes: 9 };
    const base = {
        previewHash: PREVIEW_HASH,
        syncedAt: SYNCED_AT,
        sourceCommit: '1234567',
        prefix: SNAPSHOT_PREFIX,
        objects: { shipsRaw: entry, shopRaw: entry, fetchMeta: entry }
    };
    const withDerived = (derived) => () => createSnapshotManifest({ ...base, derived });
    assert.throws(withDerived(undefined), /derived outputs are missing/);
    assert.throws(withDerived({}), /derived outputs are empty/);
    assert.throws(withDerived([]), /derived outputs are missing/);
    // 키 누락: 4개 중 하나만 빠져도 실패
    const missingKey = validDerived();
    delete missingKey[DERIVED_FILE_PATHS[2]];
    assert.throws(withDerived(missingKey), new RegExp(`derived output is missing: ${DERIVED_FILE_PATHS[2]}`));
    // 해시 형식 오류
    assert.throws(withDerived({ ...validDerived(), [DERIVED_FILE_PATHS[0]]: 'not-a-hash' }), /must be SHA-256/);
    // 예상 밖 키(옛 fixture의 inputManifestSha256 같은 임의 키)
    assert.throws(withDerived({ ...validDerived(), inputManifestSha256: checksum }), /unexpected snapshot derived output/);
    // 정상 4종은 통과
    assert.deepEqual(Object.keys(assertDerivedManifest(validDerived())), [...DERIVED_FILE_PATHS]);
});

// F3: 재현성 판정 대상은 PM이 고정한 4개 산출물이어야 한다(목록이 줄면 검증이 형식화된다).
test('R2 snapshot derived outputs cover the tracked ShipDB artifacts', () => {
    assert.deepEqual([...DERIVED_FILE_PATHS], [
        'data/external/erkul/live-data-input-manifest.json',
        'data/ship-live-stats.js',
        'data/ship-market.js',
        'data/canonical/shipdb-manifest.json'
    ]);
});

test('R2 transfer preserves gzip content and refuses overwrites', async () => {
    const stored = new Map();
    const client = {
        async fetch(url, options = {}) {
            if (!options.method || options.method === 'GET') {
                return stored.has(url) ? new Response(stored.get(url)) : new Response('missing', { status: 404 });
            }
            if (options.headers['If-None-Match'] === '*' && stored.has(url)) return new Response(null, { status: 412 });
            stored.set(url, options.body);
            return new Response(null, { status: 200 });
        }
    };
    const key = createSnapshotObjectKeys(SNAPSHOT_PREFIX, SYNCED_AT, PREVIEW_HASH).shipsRaw;
    const compressed = await gzipText('{"ship":"Railen"}\n');
    await putImmutableObject(client, CONFIG, key, compressed, 'application/gzip');
    assert.equal(await gunzipText(await getR2Object(client, CONFIG, key)), '{"ship":"Railen"}\n');
    await assert.rejects(() => putImmutableObject(client, CONFIG, key, compressed, 'application/gzip'), /already exists/);
    assert.equal(sha256(compressed).length, 64);
    assert.match(createR2ObjectUrl(CONFIG, key), /volt-erkul-snapshots\/erkul\//);
});

test('R2 publisher requires a verified staging receipt before immutable publish', async () => {
    const publisher = await readFile(new URL('../../scripts/erkul/publish-r2-snapshot.mjs', import.meta.url), 'utf8');
    const transport = await readFile(new URL('../../scripts/erkul/r2-snapshot.mjs', import.meta.url), 'utf8');
    assert.match(publisher, /requireLocalStageVerification\(stagedManifest\)/);
    assert.match(publisher, /requireValidatedStage\(client, config, stagedManifest\)/);
    assert.match(transport, /If-None-Match/);
});

// 덮어쓰기 거부 시 운영자가 다음 행동을 알 수 있어야 한다. staging은 삭제 후 재stage, erkul/은 영구 불변이라 새 Safe Apply.
test('R2 overwrite refusal explains the prefix-specific recovery path', async () => {
    const stored = new Map();
    const client = {
        async fetch(url, options = {}) {
            if (options.headers?.['If-None-Match'] === '*' && stored.has(url)) return new Response(null, { status: 412 });
            stored.set(url, options.body);
            return new Response(null, { status: 200 });
        }
    };
    const body = await gzipText('{}\n');
    for (const [prefix, pattern] of [[STAGING_PREFIX, /delete this staging object/], [SNAPSHOT_PREFIX, /new Safe Apply/]]) {
        const key = createSnapshotObjectKeys(prefix, SYNCED_AT, PREVIEW_HASH).shipsRaw;
        await putImmutableObject(client, CONFIG, key, body, 'application/gzip');
        await assert.rejects(() => putImmutableObject(client, CONFIG, key, body, 'application/gzip'), pattern);
    }
});

// F1: execFile은 출력을 캡처해 대형 로그가 maxBuffer(기본 1MB)를 넘으면 ENOBUFS로 실패했다.
// spawn 스트리밍에는 그 경로가 없어야 하고, 종료 코드·시그널은 원인과 함께 실패해야 한다.
test('rebuild runner streams large output and reports exit failures', async () => {
    // 1.6MB 출력: execFile(maxBuffer 기본 1MB)이었다면 ENOBUFS로 실패한다. 스트리밍이면 정상 종료.
    await runNodeScript('-e', ["process.stdout.write('x'.repeat(1600000))"], { stdio: 'ignore' });
    // 비정상 종료는 exit code를 포함해 실패
    await assert.rejects(() => runNodeScript('-e', ['process.exit(3)'], { stdio: 'ignore' }), /exited with code 3/);
    // spawn 실패(존재하지 않는 cwd)는 원인을 포함해 실패
    await assert.rejects(
        () => runNodeScript('-e', ['0'], { cwd: new URL('./no-such-dir-for-spawn/', import.meta.url).pathname, stdio: 'ignore' }),
        /failed to start/
    );
});

// F2: 복원 파일명이 하드코딩되면 상수 변경 시 업로드·다운로드가 조용히 어긋난다.
test('snapshot file names stay the single source of truth', async () => {
    const verifySource = await readFile(new URL('../../scripts/erkul/verify-r2-snapshot.mjs', import.meta.url), 'utf8');
    assert.match(verifySource, /SNAPSHOT_FILE_NAMES\[name\]/, '복원 키는 SNAPSHOT_FILE_NAMES에서 나와야 함');
    for (const fileName of Object.values(SNAPSHOT_FILE_NAMES)) {
        assert.ok(!verifySource.includes(`'${fileName}'`), `파일명 하드코딩 금지: ${fileName}`);
    }
    // 업로드 키(createSnapshotObjectKeys)와 복원 키가 같은 상수에서 파생되는지 확인
    const keys = createSnapshotObjectKeys(SNAPSHOT_PREFIX, SYNCED_AT, PREVIEW_HASH);
    for (const [name, fileName] of Object.entries(SNAPSHOT_FILE_NAMES)) {
        assert.equal(keys[name], `erkul/${SYNCED_AT}/${PREVIEW_HASH}/${fileName}`);
    }
});

// PM 리뷰 항목: raw 원본·writer 자격이 Git에 유입되면 안 되고, 최종 manifest는 반드시 추적되어야 한다.
test('Erkul raw sources and writer credentials stay out of Git', async () => {
    const ignore = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8');
    for (const pattern of [
        'data/external/erkul/ships.raw.json',
        'data/external/erkul/shop.raw.json',
        'data/external/erkul/r2-snapshot-stage-manifest.json',
        '.env'
    ]) {
        assert.ok(ignore.split(/\r?\n/).includes(pattern), `.gitignore가 ${pattern}를 무시해야 함`);
    }
    // 최종 스냅샷 manifest는 CI 검증 기준이라 추적 대상이어야 한다(무시 목록에 있으면 안 됨).
    assert.ok(!ignore.includes('r2-snapshot-manifest.json\n'), '최종 r2-snapshot-manifest.json은 커밋되어야 함');
});

// PM 리뷰 항목: CI 러너는 read-only 키만 사용하고 writer 자격을 절대 참조하지 않는다.
test('Erkul Snapshot Verify workflow only receives read-only R2 credentials', async () => {
    const workflow = await readFile(new URL('../../.github/workflows/erkul-snapshot-verify.yml', import.meta.url), 'utf8');
    assert.match(workflow, /R2_SNAPSHOT_CI_ACCESS_KEY_ID/);
    assert.match(workflow, /R2_SNAPSHOT_CI_SECRET_ACCESS_KEY/);
    assert.ok(!/WRITER/.test(workflow), 'CI 워크플로가 writer 자격을 참조하면 안 됨');
    assert.match(workflow, /ERKUL_SNAPSHOT_VERIFY_ENABLED == 'true'/, '활성 변수 게이트 필요');
    assert.match(workflow, /permissions:\s*\n\s*contents: read/, '워크플로 권한은 contents: read로 제한');
});
