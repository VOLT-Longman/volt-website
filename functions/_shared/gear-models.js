import { gearModelVersion } from './gear-model-version.js';
import { privateResponse } from './community-access.js';

const TYPES = { glb: 'model/gltf-binary', json: 'application/json', webp: 'image/webp', png: 'image/png' };

// Never fall through to Pages static assets, even if a local export was deployed
// by mistake. Only the private bucket may serve game models.
export async function serveGearModel({ request, env }, path) {
  const reply = (text, status) => privateResponse(new Response(request.method === 'HEAD' ? null : text, { status }));
  if (!['GET', 'HEAD'].includes(request.method)) return reply('Method not allowed', 405);
  const relative = path.slice('/assets/models/gear/'.length);
  const version = new URL(request.url).searchParams.get('v');
  if (!/^(?:weapons\/[\w~.-]+\/(?:manifest\.json|body_lod\d+\.glb)|parts\/[\w~.-]+\.glb|tex\/[\w~.-]+\.(?:png|webp))$/.test(relative)
      || relative.includes('..') || (version && version !== gearModelVersion)) return reply('Not found', 404);
  if (!env.FLEET_GEAR_MODELS) return reply('Models are not available', 503);
  try {
    const key = `${gearModelVersion}/${relative}`;
    const object = await env.FLEET_GEAR_MODELS[request.method === 'HEAD' ? 'head' : 'get'](key);
    if (!object || object.customMetadata?.assetversion !== gearModelVersion) return reply('Not found', 404);
    const headers = new Headers({ 'Content-Type': TYPES[relative.split('.').pop()], 'Content-Length': String(object.size) });
    if (object.httpEtag) headers.set('ETag', object.httpEtag);
    // No browser copy survives logout; the active viewer reuses its in-memory models.
    return privateResponse(new Response(request.method === 'HEAD' ? null : object.body, { headers }));
  } catch (_error) { return reply('Models are temporarily unavailable', 503); }
}
