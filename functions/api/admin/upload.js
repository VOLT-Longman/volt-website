import { requireAdmin } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);

export async function onRequestPost({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (!env.GALLERY_BUCKET) return error('Missing R2 binding: GALLERY_BUCKET', 500);
  const file = (await request.formData()).get('file');
  if (!file || typeof file === 'string') return error('File is required', 422);
  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension) return error('Unsupported image type', 415);
  if (file.size > MAX_BYTES) return error('File is too large', 413);
  const key = `gallery/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await env.GALLERY_BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const baseUrl = (env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return json({ key, imageUrl: baseUrl ? `${baseUrl}/${key}` : `/${key}` });
}
