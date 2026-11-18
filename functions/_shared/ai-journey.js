import calc from '../../js/journey-calc.js';
import { validateAiContext, toolReviewLoadout } from './ai-loadout.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const id = (value, pattern = /^[a-zA-Z0-9_-]{1,120}$/) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !pattern.test(value) || ['constructor', '__proto__', 'prototype'].includes(value)) throw new Error('Invalid selection id');
  return value;
};
const number = (value, max, integer = false) => {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) throw new Error('Invalid selection amount');
  return value;
};
export function validateJourneyContext(input) {
  if (!object(input) || input.kind !== 'journey' || JSON.stringify(input).length > 100000) throw new Error('Invalid journey');
  if (!['ship', 'loadout', 'trade', 'mining', 'craft'].includes(input.origin)) throw new Error('Invalid origin');
  if (!Array.isArray(input.crafts) || input.crafts.length > 30) throw new Error('Invalid recipes');
  const crafts = input.crafts.map(row => {
    if (!object(row)) throw new Error('Invalid recipe');
    const key = id(row.id), count = number(row.count, 100, true);
    if (!key || !count) throw new Error('Invalid recipe');
    return { id: key, count };
  });
  if (new Set(crafts.map(row => row.id)).size !== crafts.length) throw new Error('Duplicate recipe');
  const loadout = input.loadout == null ? null : validateAiContext(input.loadout);
  if (loadout && loadout.kind !== 'loadout') throw new Error('Invalid equipment');
  if (!['buy', 'sell'].includes(input.mode)) throw new Error('Invalid trade mode');
  return { kind: 'journey', origin: input.origin, shipId: id(input.shipId, /^[a-z0-9-]{1,100}$/), loadout,
    transportShipId: id(input.transportShipId, /^[a-z0-9-]{1,100}$/), cargoScu: number(input.cargoScu, 100000), budget: number(input.budget, 10000000000), quantity: number(input.quantity, 100000), mode: input.mode,
    commodityId: number(input.commodityId, 1000000000, true), buyTerminal: number(input.buyTerminal, 1000000000, true), sellTerminal: number(input.sellTerminal, 1000000000, true),
    mineralId: id(input.mineralId), locationId: id(input.locationId), crafts };
}
export const wantsJourneyReview = message => /계획|현재|검토|구성|전력|실드|채광|광물|재료|제작|운송|자금|판매|팔|정제|시세|어디|이\s*함선|\b(current|plan|review|mine|mining|material|craft|haul|trade|sell|refin\w*|where|power|shield)\b/i.test(message);

async function asset(env, path) {
  const response = await env.ASSETS.fetch(`https://assets.local/data/${path}.json`);
  if (!response.ok) throw new Error('Game data unavailable');
  return response.json();
}
async function prices(request, commodityId) {
  const response = await fetch(`${new URL(request.url).origin}/api/uex/commodities/${commodityId}/prices`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) return null;
  const payload = await response.json();
  return Array.isArray(payload.data) ? payload : null;
}
function selectedPrice(rows, terminal, side) {
  if (!terminal) return null;
  return rows.filter(row => Number(row.id_terminal) === terminal && Number(row[`price_${side}`]) > 0)
    .sort((a, b) => Number(b.date_modified || 0) - Number(a.date_modified || 0))[0] || null;
}

export async function toolReviewJourney(env, request, context, lang = 'ko') {
  const tr = (ko, en) => lang === 'en' ? en : ko;
  const name = value => value?.[lang] || value?.en || '';
  const fmt = value => Number.isFinite(value) ? value.toLocaleString(lang === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 3 }) : '—';
  const checks = [], metrics = [], sources = [], actions = [], data = { status: 'ok', origin: context.origin };
  const check = (title, detail, kind = 'info') => checks.push({ title, detail, kind });
  const metric = (key, label, value, unit) => metrics.push({ key, label, value, unit, digits: 3 });
  const titles = { trade: tr('현재 운송 계획', 'Current trade plan'), mining: tr('현재 채광 계획', 'Current mining plan'), craft: tr('현재 제작 계획', 'Current craft plan'), ship: tr('선택한 함선', 'Selected ship'), loadout: tr('현재 구성과 계획', 'Current build and plan') };
  let game, comparisonLabel;
  try {
    const [mining, crafting, index, meta] = await Promise.all(['mining/mining', 'loadout/crafting', 'loadout/index', 'loadout/meta'].map(path => asset(env, path)));
    if (mining.source !== 'game-files' || crafting.source !== 'game-files' || mining.gameVersion !== crafting.gameVersion || crafting.gameVersion !== meta.gameVersion) throw new Error('Mismatched data');
    game = { mining, crafting, index, meta };
  } catch (_error) {
    check(tr('게임 자료 확인 실패', 'Game data unavailable'), tr('서로 같은 버전의 게임 자료를 확인하지 못했습니다. 채광·제작·장착 수치를 계산하지 않습니다.', 'Could not verify matching game data versions. Mining, crafting and equipment calculations are withheld.'), 'warning');
    data.status = 'unavailable';
  }
  if (game) {
    const entries = game.index.ships.filter(row => row.volt === context.shipId);
    if (context.shipId && entries.length === 1) {
      const selected = entries[0];
      if (context.loadout && context.loadout.ship !== selected.cls) check(tr('장착 구성 불일치', 'Equipment selection mismatch'), tr('선택한 함선과 장착 구성이 달라 합쳐서 계산하지 않았습니다. 로드아웃에서 다시 가져오세요.', 'Ship and equipment choices differ; they were not combined. Bring the selection from Loadout again.'), 'warning');
      else {
        const review = await toolReviewLoadout(env, context.loadout || { kind: 'ship', shipId: context.shipId }, lang);
        if (review.review) {
          data.loadout = review.data;
          const shipChecks = context.origin === 'loadout' ? review.review.checks : review.review.checks.filter(row => row.kind === 'warning').slice(0, 2);
          check(tr('함선과 장착 구성', 'Ship and equipment'), review.answer);
          checks.push(...shipChecks); sources.push(...review.sources);
          if (context.origin === 'loadout') { metrics.push(...review.review.metrics); comparisonLabel = review.review.comparisonLabel; }
        } else check(tr('장착 자료 없음', 'Equipment unavailable'), tr('출시된 함선의 장착 자료를 확인하지 못했습니다.', 'Released equipment data could not be verified.'), 'warning');
      }
      actions.push({ action: 'loadout', shipId: context.shipId, label: tr('로드아웃으로 돌아가기', 'Return to Loadout') });
    } else if (context.shipId) check(tr('함선 확인 필요', 'Check the ship'), tr('함선을 현재 게임 자료와 정확하게 연결하지 못했습니다.', 'The ship could not be matched uniquely to current game data.'), 'warning');
    if (context.origin === 'mining' || context.origin === 'craft') {
      const mineral = game.mining.minerals.find(row => row.id === context.mineralId);
      const selectedLocation = game.mining.locations.find(row => row.id === context.locationId);
      if (mineral) {
        const locations = calc.mineralLocations(game.mining, mineral.id);
        data.mineral = { id: mineral.id, name: name(mineral.name), refined: mineral.refined ? name(mineral.refined.name) : null, locations: locations.map(row => ({ id: row.id, name: name(row.name), named: !!row.named })) };
        check(tr('선택한 광물과 장소', 'Selected mineral and locations'), `${name(mineral.name)} · ${locations.slice(0, 6).map(row => `${name(row.name)}${row.named ? '' : tr(' (임시 구분명)', ' (descriptive label)')}`).join(', ') || tr('확인된 장소 없음', 'No verified location')}${locations.length > 6 ? tr(` 외 ${locations.length - 6}곳`, ` and ${locations.length - 6} more`) : ''}`);
        if (selectedLocation) check(tr('선택한 채광 장소', 'Selected mining location'), `${name(selectedLocation.name)} · ${locations.some(row => row.id === selectedLocation.id) ? tr('이 광물이 포함된 암석 자료가 있습니다.', 'Game data includes rocks containing this mineral.') : tr('이 광물이 나오는 장소로 확인되지 않습니다.', 'Not verified as a source for this mineral.')}`);
        check(tr('채집 이후', 'After gathering'), mineral.refined ? tr(`정제 후 상품은 ${name(mineral.refined.name)}입니다. 정제 수율·시간·정제소별 보너스 자료는 없어 계산하지 않습니다. 실제 정제된 SCU를 무역 화면에 입력해 판매처를 확인하세요.`, `The refined commodity is ${name(mineral.refined.name)}. Refining yield, time and refinery bonuses are unavailable. Enter the actual refined SCU in Trade to check buyers.`) : tr('정제하지 않는 상품입니다. 한 개와 1 SCU를 같은 양으로 계산하지 않습니다.', 'This commodity is not refined. One piece is not treated as one SCU.'));
      } else if (selectedLocation) check(tr('선택한 장소', 'Selected location'), `${name(selectedLocation.name)} · ${selectedLocation.system}`);
      else check(tr('광물 선택 필요', 'Select a mineral'), tr('채광 화면에서 광물 또는 장소를 선택하면 해당 자료로 검토합니다.', 'Select a mineral or location in Mining to review its records.'));
      check(tr('채광 자료의 범위', 'Mining evidence'), tr('게임 파일의 구성 자료이며 실측 수익이나 채광 성공률이 아닙니다. 모듈 중첩·암석 파쇄 가능 여부는 추정하지 않습니다.', 'Game-file composition data is not measured profit or mining success probability. Module stacking and rock breakability are not estimated.'));
      sources.push({ label: tr('채광 · 게임 파일', 'Mining · game files'), detail: game.meta.version, url: '#mining' });
    }
    if (context.crafts.length) {
      const result = calc.materials(game.crafting, context.crafts); data.crafting = result;
      const labels = result.materials.map(row => `${name(game.crafting.resources[row.id]) || row.id} ${fmt(row.amount)} ${row.unit === 'SCU' ? 'SCU' : tr('개', 'pieces')}`);
      check(tr('제작 재료 합계', 'Required materials'), labels.join(' · ') || tr('계산할 수 있는 설계도 없음', 'No verified recipes'));
      check(tr('제작과 채집 수량', 'Crafting versus gathering quantities'), tr('설계도 첫 단계에 필요한 수량만 합산했습니다. 원광 채집량과 완성품 품질은 계산하지 않습니다. 제작 계획에서 재료별 캐는 곳과 판매처를 확인하세요.', 'Only first-tier recipe requirements are totaled. Raw ore yield and crafted quality are not calculated. Open the craft plan for gathering locations and market links.'));
      if (result.missing.length) check(tr('일부 설계도 확인 불가', 'Some recipes unavailable'), tr('자료가 없는 부품은 합계에서 제외했습니다. 제작 계획에서 다시 선택하세요.', 'Unavailable recipes were excluded. Reselect those components in the craft plan.'), 'warning');
      sources.push({ label: tr('제작 · 게임 파일', 'Crafting · game files'), detail: game.crafting.version, url: '#mining' });
      actions.push({ action: 'craft', label: tr('제작 계획으로 돌아가기', 'Return to craft plan') });
    }
  }
  if (context.origin === 'trade') {
    const transport = game?.index.ships.find(row => row.volt === context.transportShipId);
    if (transport && context.transportShipId !== context.shipId) check(tr('운송 함선은 별도 선택', 'Separate transport ship'), tr(`운송에는 ${transport.name || context.transportShipId}을 선택했습니다. 채광선의 원광 공간과 일반 화물 공간을 합치지 않습니다.`, `${transport.name || context.transportShipId} is selected for transport. Ore storage and general cargo space are not combined.`));
    check(tr('사용자가 입력한 조건', 'Your inputs'), tr(`플래너에 입력한 화물은 ${fmt(context.cargoScu)} SCU입니다. 운송할 양 ${fmt(context.quantity)} SCU · 자금 ${fmt(context.budget)} aUEC. 실제 보유량과 지갑 잔액을 확인한 값은 아닙니다.`, `Planner input is ${fmt(context.cargoScu)} SCU. Requested ${fmt(context.quantity)} SCU · budget ${fmt(context.budget)} aUEC. These are user inputs, not verified inventory or wallet balances.`));
    let payload = null;
    if (context.commodityId) { try { payload = await prices(request, context.commodityId); } catch (_error) { /* Report a missing source, never reuse client prices. */ } }
    const rows = (payload?.data || []).filter(row => Number(row.id_commodity) === context.commodityId);
    const buy = selectedPrice(rows, context.buyTerminal, 'buy'), sell = selectedPrice(rows, context.sellTerminal, 'sell');
    const result = calc.trade(buy, sell, { ...context, capacity: context.cargoScu }); data.trade = result;
    if (result.status === 'ok') {
      metric('quantity', tr('계산 수량', 'Planned quantity'), result.quantity, 'SCU');
      if (result.cost !== null) metric('cost', tr('구매 금액', 'Purchase cost'), result.cost, 'aUEC');
      metric('revenue', tr('판매 금액', 'Sale value'), result.revenue, 'aUEC');
      if (result.profit !== null) metric('profit', tr('매매 차익', 'Trade margin'), result.profit, 'aUEC');
      check(tr('구매 → 적재 → 판매', 'Buy → load → sell'), `${sell.commodity_name || buy?.commodity_name || tr('선택 상품', 'Selected commodity')} · ${context.mode === 'sell' ? tr('보유 상품', 'Cargo held') : buy.terminal_name || tr('선택한 구매처', 'Selected seller')} → ${sell.terminal_name || tr('선택한 판매처', 'Selected buyer')}`);
      if (result.limited) check(tr('수량을 줄인 이유', 'Why quantity was reduced'), tr('입력한 자금·화물량과 UEX에 보고된 재고·수요 중 가장 작은 한도를 적용했습니다.', 'The smallest limit among budget, capacity and reported stock/demand was applied.'));
    } else check(tr('금액 계산 보류', 'Price calculation withheld'), result.status === 'stale' ? tr('선택한 장소에 60분 이내 갱신된 시세가 없습니다. 무역 화면에서 다시 조회하세요.', 'Selected locations have no price report within 60 minutes. Refresh in Trade.') : tr('상품·구매처·판매처·운송량·자금 입력 또는 시세 자료가 부족합니다. 무역 화면에서 확인하세요.', 'A commodity, location, quantity, budget or price source is missing. Check the Trade screen.'), 'warning');
    check(tr('UEX 제보와 계산 한계', 'Reported data and limits'), tr(`재고 ${fmt(result.stock)} / 수요 ${fmt(result.demand)} SCU. —는 자료 없음이며 실제 거래 가능량을 보장하지 않습니다. 연료비·적재 시간·시간당 수익은 계산하지 않습니다.`, `Stock ${fmt(result.stock)} / demand ${fmt(result.demand)} SCU. — means unknown; availability is not guaranteed. Fuel, loading time and hourly profit are not calculated.`));
    if (context.mode === 'sell') check(tr('판매액과 이익 구분', 'Sale value versus profit'), tr('보유 상품의 구매 원가가 없으므로 판매 금액만 계산합니다.', 'Only sale value is calculated because acquisition cost is unknown.'));
    check(tr('다음 운송', 'Next trip'), tr('무역 화면에서 ‘판매한 곳에서 다음 운송 찾기’를 누르면 같은 판매처를 다음 출발지로 이어갑니다. 자동으로 거래하거나 자금을 차감하지 않습니다.', 'Use “Find next cargo at destination” in Trade to keep the destination as your next departure. No transaction is performed or budget deducted.'));
    sources.push({ label: tr('UEX · 가격·재고 제보', 'UEX · price and stock reports'), detail: tr('선택한 장소의 60분 이내 보고만 계산', 'Only reports within 60 minutes at selected locations are calculated'), url: '#trade-planner' });
    actions.push({ action: 'trade', label: tr('무역 계획으로 돌아가기', 'Return to trade plan') });
  }
  if (context.origin === 'mining') actions.push({ action: 'mining', label: tr('채광 안내로 돌아가기', 'Return to Mining') });
  const title = titles[context.origin];
  return { answer: tr(`${title}을 선택 정보와 서버 자료로 확인했습니다. 계산 가능한 값과 확인하지 못한 내용을 구분했습니다.`, `${title}: reviewed your selection against server-side sources. Calculated values and unavailable evidence are separated.`), data,
    review: { title, metrics, checks, ...(comparisonLabel ? { comparisonLabel } : {}) }, actions, sources,
    freshness: { label: tr('이번 조회', 'This review'), at: new Date().toISOString() } };
}
