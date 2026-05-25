import { isAuthenticated } from '../../_shared/auth.js';
import { json } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  return json({ authenticated: await isAuthenticated(request, env) });
}
