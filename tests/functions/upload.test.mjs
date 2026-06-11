import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost } from '../../functions/api/admin/upload.js';
import { TEST_ENV, adminCookie, createMockR2, PNG_BYTES, JPEG_BYTES } from './helpers.mjs';

async function uploadRequest(fileBytes, { type = 'image/png', name = 'photo.png', cookie } = {}) {
    const formData = new FormData();
    formData.append('file', new File([fileBytes], name, { type }));
    return new Request('https://volt.ceo/api/admin/upload', {
        method: 'POST',
        headers: { Cookie: cookie ?? await adminCookie() },
        body: formData
    });
}

test('업로드: 비인증 요청 → 401, R2 호출 없음', async () => {
    const bucket = createMockR2();
    const env = { ...TEST_ENV, GALLERY_BUCKET: bucket };
    const request = await uploadRequest(PNG_BYTES, { cookie: '' });
    const response = await onRequestPost({ request, env });
    assert.equal(response.status, 401);
    assert.equal(bucket.puts.length, 0);
});

test('업로드: 정상 PNG → R2 저장 + 확장자/콘텐츠 타입 일치', async () => {
    const bucket = createMockR2();
    const env = { ...TEST_ENV, GALLERY_BUCKET: bucket, R2_PUBLIC_BASE_URL: 'https://cdn.volt.ceo/' };
    const response = await onRequestPost({ request: await uploadRequest(PNG_BYTES), env });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.key, /^gallery\/\d+-[0-9a-f-]+\.png$/);
    assert.equal(body.imageUrl, `https://cdn.volt.ceo/${body.key}`);
    assert.equal(bucket.puts[0].options.httpMetadata.contentType, 'image/png');
});

test('업로드: 매직넘버 기준 판별 — Content-Type 위조(PNG로 위장한 텍스트) → 415', async () => {
    const bucket = createMockR2();
    const env = { ...TEST_ENV, GALLERY_BUCKET: bucket };
    const fake = new TextEncoder().encode('<script>alert(1)</script>');
    const response = await onRequestPost({ request: await uploadRequest(fake, { type: 'image/png' }), env });
    assert.equal(response.status, 415);
    assert.equal(bucket.puts.length, 0);
});

test('업로드: JPEG 매직넘버는 선언 타입과 무관하게 jpg로 저장', async () => {
    const bucket = createMockR2();
    const env = { ...TEST_ENV, GALLERY_BUCKET: bucket };
    const response = await onRequestPost({
        request: await uploadRequest(JPEG_BYTES, { type: 'application/octet-stream', name: 'raw.bin' }),
        env
    });
    assert.equal(response.status, 200);
    assert.match((await response.json()).key, /\.jpg$/);
});

test('업로드: 10MB 초과 → 413', async () => {
    const bucket = createMockR2();
    const env = { ...TEST_ENV, GALLERY_BUCKET: bucket };
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    oversized.set(PNG_BYTES);
    const response = await onRequestPost({ request: await uploadRequest(oversized), env });
    assert.equal(response.status, 413);
    assert.equal(bucket.puts.length, 0);
});

test('업로드: file 필드 누락 → 422', async () => {
    const env = { ...TEST_ENV, GALLERY_BUCKET: createMockR2() };
    const formData = new FormData();
    formData.append('file', 'just-a-string');
    const request = new Request('https://volt.ceo/api/admin/upload', {
        method: 'POST',
        headers: { Cookie: await adminCookie() },
        body: formData
    });
    const response = await onRequestPost({ request, env });
    assert.equal(response.status, 422);
});
