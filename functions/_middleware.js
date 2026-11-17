import { isCommunityResource, privateResponse } from './_shared/community-access.js';
import { requireCommunityMember } from './_shared/rbac.js';

export async function onRequest(context) {
  let path;
  try { path = decodeURIComponent(new URL(context.request.url).pathname); }
  catch (_error) { return new Response('Invalid path', { status: 400 }); }
  if (!isCommunityResource(path)) return context.next();
  const member = await requireCommunityMember(context.request, context.env);
  // Authorization runs before either an upstream cache hit or a static asset.
  if (member instanceof Response) return privateResponse(member);
  return privateResponse(await context.next());
}
