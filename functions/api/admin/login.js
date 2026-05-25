import { createSessionCookie, validateLoginToken } from '../../_shared/auth.js';
import { error, json, readJson } from '../../_shared/http.js';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!validateLoginToken(body?.password || body?.token, env)) return error('Invalid credentials', 401);
  return json({ ok: true }, { headers: { 'Set-Cookie': await createSessionCookie(env) } });
}
