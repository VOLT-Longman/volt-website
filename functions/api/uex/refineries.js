import { proxyUexDerived, uexId as id } from '../../_shared/uex-proxy.js';

// 정제소별 광물 수율 보너스와 정제 방식 등급 (출처: UEX refineries_yields, refineries_methods).
// 게임 파일에 없는 값이라 UEX 보고를 그대로 쓴다. 정제소 위치는 /api/uex/terminals의 type 'refinery'와 id로 잇는다.
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const rating = (value) => (id(value) >= 1 && id(value) <= 3 ? id(value) : null);
// 수율 보너스는 음수도 있으므로 id()가 아니라 숫자 여부만 본다. null·빈 문자열은 숫자가 아니다.
const number = (value) => ((typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null);

export function buildRefineries(yields, methods) {
  const commodities = {};
  const rows = [];
  for (const row of yields) {
    // value = 그 정제소에서 그 광물의 수율 보너스(%). 음수도 실제 값이다. 숫자가 아니면 줄을 뺀다.
    const value = row ? number(row.value) : null;
    if (value === null || !id(row.id_terminal) || !id(row.id_commodity)) continue;
    if (typeof row.commodity_name === 'string' && row.commodity_name) commodities[id(row.id_commodity)] = row.commodity_name;
    const at = id(row.date_modified) || id(row.date_added);
    rows.push({ t: id(row.id_terminal), c: id(row.id_commodity), v: value, ...(at ? { at } : {}) });
  }
  return {
    // 등급은 UEX 표기 1~3이며 실제 배율이 아니다. 어느 쪽이 좋은지는 UEX 문서에 없다.
    methods: methods.filter((row) => row && id(row.id) && typeof row.name === 'string' && row.name).map((row) => ({
      id: id(row.id), name: row.name, ...(typeof row.code === 'string' && row.code ? { code: row.code } : {}),
      ...(rating(row.rating_yield) ? { yield: rating(row.rating_yield) } : {}),
      ...(rating(row.rating_cost) ? { cost: rating(row.rating_cost) } : {}),
      ...(rating(row.rating_speed) ? { speed: rating(row.rating_speed) } : {}),
    })),
    commodities,
    yields: rows,
  };
}

export async function onRequestGet(context) {
  return proxyUexDerived(context, {
    cacheName: 'refineries/v1', upstreamPaths: ['refineries_yields', 'refineries_methods'], ttlSeconds: CACHE_TTL_SECONDS, build: buildRefineries,
    // 수율이나 방식이 하나도 안 나오면 UEX 형식이 바뀐 것으로 보고 캐시에 넣지 않는다.
    isUsable: (data) => data.yields.length > 0 && data.methods.length > 0,
  });
}
