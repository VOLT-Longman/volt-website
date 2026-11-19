import { readUserSession } from '../_shared/discord-auth.js';
import { json, error } from '../_shared/http.js';
import { communityAccess, communityToolsRequireMembership } from '../_shared/community-access.js';
import { fleetAccess, publicHelperTools } from '../_shared/fleet-access.js';

function createUserPayload(session) {
  return {
    sub: session.sub,
    username: session.username,
    display_name: session.display_name,
    avatar_url: session.avatar_url,
    roles: Array.isArray(session.roles) ? session.roles : []
  };
}

export async function onRequestGet({ request, env }) {
  const publicTools = !communityToolsRequireMembership(env);
  const publicHelpers = publicHelperTools(env);
  let session;
  // A short floor lets newly assigned roles be checked without making every
  // repeated click call Discord. Normal requests retain the five-minute TTL.
  try { session = await readUserSession(request, env, new URL(request.url).searchParams.get('refresh') === '1' ? { membershipTtlMs: 5000 } : {}); }
  catch (failure) {
    const response = error('인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도하세요.', 503);
    if (failure.retryAfter) response.headers.set('Retry-After', String(failure.retryAfter));
    return response;
  }
  if (!session) {
    let configured = false;
    try { configured = communityAccess([], env).configured; } catch (_error) { /* Malformed configuration never grants access. */ }
    return json({ logged_in: false, features: { communityTools: publicTools, communityConfigured: configured, helperTools: publicHelpers, gunModding: publicHelpers, starmap: false, fleetConfigured: fleetAccess([], env).configured } }, { cacheControl: 'no-store' });
  }
  return json({ logged_in: true, user: createUserPayload(session), features: {
    communityTools: publicTools || session.communityAccess.allowed,
    communityConfigured: session.communityAccess.configured,
    helperTools: publicHelpers || session.fleetAccess.allowed, gunModding: publicHelpers || session.fleetAccess.allowed, starmap: session.fleetAccess.allowed,
    fleetConfigured: session.fleetAccess.configured
  } }, { cacheControl: 'no-store' });
}
