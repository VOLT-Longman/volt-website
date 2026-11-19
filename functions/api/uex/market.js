import { proxyUexDerived } from '../../_shared/uex-proxy.js';

// 전체 시장 가격 스냅샷 (출처: UEX commodities_prices_all, 한 번 호출).
// 원본은 약 1 MB라 화면에 필요한 필드만 남긴다. 필드 뜻과 근거는 docs/uex-endpoints.md.
const CACHE_TTL_SECONDS = 30 * 60;

const isNumeric = (value) => (typeof value === 'number' || (typeof value === 'string' && value !== '')) && Number.isFinite(Number(value));
const positive = (value) => (isNumeric(value) && Number(value) > 0 ? Number(value) : null);
const zeroOrMore = (value) => (isNumeric(value) && Number(value) >= 0 ? Number(value) : null);
const statusCode = (value) => (isNumeric(value) && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 7 ? Number(value) : null);

// 가격 한 줄에서 거래에 쓰는 값만 뽑는다. commodities_prices_all과 commodities_prices_history가 같이 쓴다.
// 모르는 값은 0으로 채우지 않고 필드를 뺀다.
export function trimTradeFields(row) {
  const out = {};
  const buy = positive(row.price_buy);
  const sell = positive(row.price_sell);
  if (buy) {
    out.buy = buy;
    // scu_buy = 플레이어가 살 수 있는 재고(SCU). 0은 품절 보고.
    const stock = zeroOrMore(row.scu_buy);
    if (stock !== null) out.stock = stock;
    const status = statusCode(row.status_buy);
    if (status) out.sb = status;
  }
  if (sell) {
    out.sell = sell;
    // inv = scu_sell_stock (상점이 지금 들고 있다고 보고된 SCU), ss = status_sell (상점이 찬 정도 1~7).
    // 둘 다 "수량이 적힌 보고"(scu_sell > 0)일 때만 싣는다.
    //  - scu_sell 자체는 싣지 않는다: UEX가 scu_sell_stock × 7 ÷ status_sell을 반올림해 만든 값이라
    //    inv·ss 말고 새 정보가 없고, 거기서 뺀 "남은 수요"는 ss 1에서 항상 6 × inv가 되어
    //    빈 상점일수록 작게 나온다 (방향이 거꾸로). 그래서 demand 필드는 만들지 않는다.
    //  - scu_sell이 0인 보고는 전부 status_sell 1, 수량 0으로 온다. "정말 비었다"인지 "수량을 안 적었다"인지
    //    UEX 응답만으로는 가릴 수 없으므로 inv·ss를 둘 다 뺀다 (모름). 전체 스냅샷에서는 이때
    //    scu_sell_stock에 예전 보고의 숫자가 남아 있기도 한데 그것도 쓰지 않는다.
    const reported = positive(row.scu_sell);
    const inventory = positive(row.scu_sell_stock);
    const status = statusCode(row.status_sell);
    if (reported && inventory) {
      out.inv = inventory;
      if (status) out.ss = status;
    }
  }
  return buy || sell ? out : null;
}

export function parseBoxSizes(value) {
  if (typeof value !== 'string' || !value) return null;
  const sizes = value.split(',').map(Number).filter((size) => Number.isInteger(size) && size > 0);
  return sizes.length ? sizes : null;
}

export function buildMarket(rows) {
  const data = [];
  for (const row of rows) {
    if (!row) continue;
    const terminal = positive(row.id_terminal);
    const commodity = positive(row.id_commodity);
    const trade = terminal && commodity ? trimTradeFields(row) : null;
    if (!trade) continue;
    const box = parseBoxSizes(row.container_sizes);
    const at = positive(row.date_modified);
    data.push({ t: terminal, c: commodity, ...trade, ...(box ? { box } : {}), ...(at ? { at } : {}) });
  }
  return data;
}

// price-history.js가 허용 쌍 확인에 같은 캐시를 쓴다.
export const MARKET_SOURCE = { cacheName: 'market/v2', upstreamPaths: ['commodities_prices_all'], ttlSeconds: CACHE_TTL_SECONDS, build: buildMarket, isUsable: (data) => data.length > 0 };

export async function onRequestGet(context) {
  return proxyUexDerived(context, { ...MARKET_SOURCE, allowRefresh: true });
}
