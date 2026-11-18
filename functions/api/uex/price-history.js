import { error } from '../../_shared/http.js';
import { loadUexDerived, proxyUexDerived, uexId } from '../../_shared/uex-proxy.js';
import { MARKET_SOURCE, trimTradeFields } from './market.js';

// 터미널 + 상품 한 쌍의 가격 보고 이력 (출처: UEX commodities_prices_history, 현재 게임 버전분만).
// 판매 보고에 수량이 0으로 적힌 줄은 inv·ss 없이 가격만 싣는다 (market.js trimTradeFields 설명 참고).
// 빈 목록은 정상이다 (현재 게임 버전에 보고가 없는 쌍).
const CACHE_TTL_SECONDS = 12 * 60 * 60;

export function buildPriceHistory(rows) {
  const data = [];
  for (const row of rows) {
    const at = uexId(row?.date_added);
    const trade = at ? trimTradeFields(row) : null;
    if (!trade) continue;
    data.push({ at, ...trade, ...(typeof row.game_version === 'string' && row.game_version ? { v: row.game_version } : {}) });
  }
  return data.sort((a, b) => a.at - b.at);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const terminal = url.searchParams.get('terminal') || '';
  const commodity = url.searchParams.get('commodity') || '';
  // 숫자 id만 허용 (location-prices.js와 같은 규약).
  if (!/^[1-9]\d{0,6}$/.test(terminal)) return error('Invalid terminal id', 400);
  if (!/^[1-9]\d{0,6}$/.test(commodity)) return error('Invalid commodity id', 400);
  // 시장 스냅샷에 실제로 있는 쌍만 허용한다. 임의 숫자 조합으로 캐시 키를 계속 만들어
  // UEX를 반복 호출시키는 남용을 막는다. 스냅샷은 /api/uex/market과 같은 캐시를 쓴다.
  const market = await loadUexDerived(context, MARKET_SOURCE);
  if (market.error) return error(market.error, market.status);
  const known = market.payload.data.some((row) => row.t === Number(terminal) && row.c === Number(commodity));
  if (!known) return error('Unknown terminal and commodity pair', 404);
  return proxyUexDerived(context, {
    cacheName: `price-history/v2/${terminal}/${commodity}`, ttlSeconds: CACHE_TTL_SECONDS, build: buildPriceHistory,
    upstreamPaths: [`commodities_prices_history?id_terminal=${terminal}&id_commodity=${commodity}`],
  });
}
