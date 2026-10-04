import { requireAdmin } from '../../_shared/auth.js';
import { error } from '../../_shared/http.js';
import { ownedUploadKeyFromUrl } from '../../_shared/upload-cleanup.js';

// Read an owned R2 original for thumbnail generation, without an arbitrary URL
// proxy or relying on the public CDN's CORS policy.
export async function onRequestGet({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  const key = ownedUploadKeyFromUrl(new URL(request.url).searchParams.get('src'), env);
  if (!key) return error('외부 또는 이전 형식 이미지는 자동 최적화할 수 없습니다.', 422);
  if (!env.GALLERY_BUCKET) return error('Missing R2 binding', 503);
  const object = await env.GALLERY_BUCKET.get(key);
  if (!object) return error('Image not found', 404);
  if (object.size > 10 * 1024 * 1024) return error('Image is too large', 413);
  return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
