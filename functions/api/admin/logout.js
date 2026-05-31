import { clearSessionCookie } from '../../_shared/auth.js';
import { json } from '../../_shared/http.js';

export function onRequestPost() {
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
