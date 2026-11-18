import { communityToolsRequireMembership, isCommunityResource, privateResponse } from './_shared/community-access.js';
import { requireCommunityMember } from './_shared/rbac.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  // The production Pages hostname must not expose an alternate API/auth origin.
  // Changing only the origin preserves encoded paths and query parameters.
  if (url.hostname === 'volt-ceo.pages.dev') {
    url.protocol = 'https:';
    url.host = 'www.volt.ceo';
    return new Response(null, { status: 308, headers: { Location: url.href } });
  }
  const response = await serveRequest(context);
  if (/^[a-z0-9-]+\.volt-ceo\.pages\.dev$/.test(url.hostname)) {
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
}

async function serveRequest(context) {
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
