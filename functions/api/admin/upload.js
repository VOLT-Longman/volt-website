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
  if (file.size > MAX_BYTES) return error('File is too large', 413);
  const bytes = await file.arrayBuffer();
  const detectedType = detectImageType(new Uint8Array(bytes));
  const extension = ALLOWED_TYPES.get(detectedType);
  if (!extension) return error('Unsupported or invalid image type', 415);
  const key = `gallery/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await env.GALLERY_BUCKET.put(key, bytes, { httpMetadata: { contentType: detectedType } });
  const baseUrl = (env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return json({ key, imageUrl: baseUrl ? `${baseUrl}/${key}` : `/${key}` });
}


function detectImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return '';
}
