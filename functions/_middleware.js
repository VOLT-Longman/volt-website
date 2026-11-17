import { communityToolsRequireMembership, isCommunityResource, privateResponse } from './_shared/community-access.js';
import { requireCommunityMember } from './_shared/rbac.js';

export async function onRequest(context) {
  let path;
  try {
    const decoded = decodeURIComponent(new URL(context.request.url).pathname);
    // Do not let a later decoder interpret nested escapes differently from the
    // access check. Query strings are not part of this path validation.
    const controlCharacter = [...decoded].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
    if (/%[0-9a-f]{2}/i.test(decoded) || /[?#]/.test(decoded) || controlCharacter) throw new Error('Ambiguous path');
    const segments = [];
    for (const segment of decoded.replace(/\\/g, '/').split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') segments.pop();
      else segments.push(segment);
    }
    path = '/' + segments.join('/');
  }
  catch (_error) { return privateResponse(new Response('Invalid path', { status: 400 })); }
  if (!isCommunityResource(path)) return context.next();
  if (communityToolsRequireMembership(context.env)) {
    const member = await requireCommunityMember(context.request, context.env);
    // Authorization runs before either an upstream cache hit or a static asset.
    if (member instanceof Response) return privateResponse(member);
  }
  // Keep temporary public responses out of browser/CDN caches so restoring the
  // gate does not leave newly cached public copies behind.
  return privateResponse(await context.next());
}
