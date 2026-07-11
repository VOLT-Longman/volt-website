import { proxyUexJson } from '../../_shared/uex-proxy.js';

const CACHE_TTL_SECONDS = 60 * 60;

export async function onRequestGet(context) {
  return proxyUexJson(context, 'commodities', CACHE_TTL_SECONDS);
}
