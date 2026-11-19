import { starmapTextureVersion } from './starmap-texture-version.js';
import { privateResponse } from './community-access.js';

export const STARMAP_TEXTURE_PREFIX = '/assets/models/starmap/';
// Only the two exported sizes of a star-map colour map. Keep in step with scripts/starmap/upload-textures.mjs.
export const STARMAP_TEXTURE_FILE = /^tex\/[a-z0-9_]{1,80}_(?:512|1k)\.webp$/;

// The caller (functions/_middleware.js) has already passed the fleet check.
// Never fall through to Pages static assets, even if a local export was deployed
// by mistake. Only the private bucket may serve game art.
// Same bucket as the gear models (binding FLEET_GEAR_MODELS), separate key prefix "starmap/<version>/".
export async function serveStarmapTexture({ request, env }, path) {
  const reply = (text, status) => privateResponse(new Response(request.method === 'HEAD' ? null : text, { status }));
  if (!['GET', 'HEAD'].includes(request.method)) return reply('Method not allowed', 405);
  const relative = path.startsWith(STARMAP_TEXTURE_PREFIX) ? path.slice(STARMAP_TEXTURE_PREFIX.length) : '';
  const version = new URL(request.url).searchParams.get('v');
  if (!STARMAP_TEXTURE_FILE.test(relative) || (version && version !== starmapTextureVersion)) return reply('Not found', 404);
  if (!env.FLEET_GEAR_MODELS) return reply('Star map textures are not available', 503);
  try {
    const key = `starmap/${starmapTextureVersion}/${relative}`;
    const object = await env.FLEET_GEAR_MODELS[request.method === 'HEAD' ? 'head' : 'get'](key);
    if (!object || object.customMetadata?.assetversion !== starmapTextureVersion) return reply('Not found', 404);
    const headers = new Headers({ 'Content-Type': 'image/webp', 'Content-Length': String(object.size) });
    if (object.httpEtag) headers.set('ETag', object.httpEtag);
    // No browser copy survives logout; the open map reuses its in-memory textures.
    return privateResponse(new Response(request.method === 'HEAD' ? null : object.body, { headers }));
  } catch (_error) { return reply('Star map textures are temporarily unavailable', 503); }
}
