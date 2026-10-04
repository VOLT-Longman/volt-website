import { getAdminIdentity, getAdminDiscordRoles } from '../../_shared/auth.js';
import { json, error } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  try {
    const identity = await getAdminIdentity(request, env);
    return json({ authenticated: Boolean(identity), identity, discordLoginEnabled: getAdminDiscordRoles(env).length > 0, environment: env.VOLT_ENVIRONMENT === 'preview' ? 'preview' : 'production' });
  } catch { return error('관리자 인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도하세요.', 503); }
}
