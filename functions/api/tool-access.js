import { communityToolsRequireMembership } from '../_shared/community-access.js';
import { publicHelperTools } from '../_shared/fleet-access.js';
import { json } from '../_shared/http.js';

export function onRequestGet({ env }) {
  return json({ community: !communityToolsRequireMembership(env), helpers: publicHelperTools(env) }, { cacheControl: 'no-store' });
}
