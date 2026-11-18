import calc from '../../js/loadout-calc.js';

// Context contains choices, never authoritative performance or model instructions.
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const cache = new WeakMap();
const map = (value, accept) => {
  if (value === undefined) return {};
  if (!object(value) || Object.keys(value).length > 512) throw new Error('Invalid loadout map');
  for (const [key, entry] of Object.entries(value)) {
    if (!key || key.length > 512 || !/^[a-zA-Z0-9_/-]+$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key) || !accept(entry)) throw new Error('Invalid loadout entry');
  }
  return Object.fromEntries(Object.entries(value));
};
function setup(input = {}) {
  if (!object(input)) throw new Error('Invalid loadout');
  const operation = input.operation ?? {};
  if (!object(operation)) throw new Error('Invalid operation');
  return {
    overrides: map(input.overrides, value => typeof value === 'string' && (value === '' || /^[a-zA-Z0-9_-]{1,100}$/.test(value))),
    off: map(input.off, value => typeof value === 'boolean'),
    operation: { power: map(operation.power, value => Number.isFinite(value) && value >= 0 && value <= 100000), activeModules: map(operation.activeModules, value => typeof value === 'boolean') },
  };
}
export function validateAiContext(input) {
  if (input == null) return null;
  if (!object(input) || JSON.stringify(input).length > 96000) throw new Error('Invalid context');
  if (input.kind === 'loadout') {
    if (typeof input.ship !== 'string' || !/^[a-z0-9_]{1,100}$/.test(input.ship)) throw new Error('Invalid ship');
    return { kind: 'loadout', ship: input.ship, slot: input.slot === 'B' ? 'B' : 'A', ...setup(input), ...(input.comparison ? { comparison: setup(input.comparison) } : {}) };
  }
  if (!['ship', 'trade'].includes(input.kind) || typeof input.shipId !== 'string' || !/^[a-z0-9-]{1,100}$/.test(input.shipId)) throw new Error('Invalid ship context');
  if (input.kind === 'trade' && (!Number.isFinite(input.cargoScu) || input.cargoScu < 0 || input.cargoScu > 100000)) throw new Error('Invalid cargo input');
  return { kind: input.kind, shipId: input.shipId, ...(input.kind === 'trade' ? { cargoScu: input.cargoScu } : {}) };
}
export const wantsLoadoutReview = message => /검토|구성|로드아웃|전력|캐패시터|실드|장단점|운송\s*준비|이\s*함선|현재|비교|\b(review|loadout|power|shields?|capacitor|builds?|current|this ship|compare)\b/i.test(message);

async function asset(env, path) {
  const response = await env.ASSETS.fetch(`https://assets.local/data/loadout/${path}.json`);
  if (!response.ok) throw new Error('Loadout asset unavailable');
  return response.json();
}
async function catalog(env) {
  const known = cache.get(env.ASSETS);
  if (known && Date.now() - known.at < 600000) return known.value;
  const [meta, index, raw, comparison, availability, ko] = await Promise.all(['meta', 'index', 'items', 'comparison', 'availability', 'ko'].map(path => asset(env, path)));
  if (!meta.gameVersion || comparison.gameVersion !== meta.gameVersion) throw new Error('Inconsistent game builds');
  const items = raw.items;
  for (const [id, values] of Object.entries(comparison.items)) if (items[id]) Object.assign(items[id], values);
  const value = { meta, index: index.ships.filter(ship => availability.released.includes(ship.cls)), items, comparison, ko };
  cache.set(env.ASSETS, { at: Date.now(), value });
  return value;
}
function evaluate(ship, items, input) {
  const overrides = calc.sanitizeOverrides(ship, items, input.overrides || {});
  const nodes = [];
  calc.walkLoadout(ship, items, overrides, node => nodes.push(node));
  const paths = new Set(nodes.filter(node => node.item).map(node => node.path));
  const off = Object.fromEntries(Object.entries(input.off || {}).filter(([path, value]) => value === true && paths.has(path)));
  const operation = calc.sanitizeOperation(ship, items, overrides, input.operation, { off });
  const totals = calc.summarize(ship, items, overrides, { off });
  const power = calc.powerPlan(ship, items, overrides, { off, operation });
  const mining = calc.miningHeads(ship, items, overrides, { off, operation });
  return { totals, power, mining, nodes, off, overrides, ignored: Object.keys(input.overrides || {}).filter(path => input.overrides[path] !== (overrides[path] ?? undefined)).length };
}

export async function toolReviewLoadout(env, context, lang = 'ko') {
  const tr = (ko, en) => lang === 'en' ? en : ko;
  const fmt = value => Number.isFinite(value) ? Number(value.toFixed(1)).toLocaleString(lang === 'en' ? 'en-US' : 'ko-KR') : '—';
  let base;
  try { base = await catalog(env); } catch (_error) {
    return { data: { status: 'unavailable' }, sources: [], freshness: { status: 'unavailable', label: tr('게임 파일', 'Game files') } };
  }
  const matches = base.index.filter(ship => context.kind === 'loadout' ? ship.cls === context.ship : ship.volt === context.shipId);
  if (matches.length !== 1) return { data: { status: 'unavailable' }, sources: [], freshness: { status: 'unavailable', label: tr('출시된 함선 자료', 'Released ship data') } };
  const entry = matches[0];
  const ship = await asset(env, `ships/${entry.cls}`);
  ship.systems = base.comparison.ships[entry.cls];
  const now = evaluate(ship, base.items, context.kind === 'loadout' ? context : {});
  const other = evaluate(ship, base.items, context.comparison || {});
  const title = lang === 'ko' ? base.ko.ships?.[entry.cls] || ship.name : ship.name;
  const comparisonLabel = context.comparison ? tr(`구성 ${context.slot === 'A' ? 'B' : 'A'}`, `Build ${context.slot === 'A' ? 'B' : 'A'}`) : tr('기본 구성', 'Stock build');
  const definitions = [
    ['burst', tr('순간 DPS', 'Burst DPS'), '', row => row.totals.dps.total, 'high'],
    ['sustain', tr('지속 DPS', 'Sustained DPS'), '', row => row.totals.sustain.total, 'high'],
    ['shield', tr('실드', 'Shields'), 'HP', row => row.totals.shield.hp, 'high'],
    ['regen', tr('실드 재생', 'Shield regeneration'), '/s', row => row.totals.shield.regen, 'high'],
    ['power', tr('최대 소비 전력', 'Maximum power draw'), '', row => row.totals.power.use, 'low'],
    ['em', tr('EM 시그니처', 'EM signature'), '', row => row.totals.signature.em, 'low'],
    ['range', tr('퀀텀 항속', 'Quantum range'), 'Gm', row => row.totals.quantum?.range ?? null, 'high'],
  ];
  const metrics = definitions.map(([key, label, unit, get, better]) => ({ key, label, unit, value: get(now), baseline: get(other), better }));
  const checks = [];
  const check = (kind, title, detail) => checks.push({ kind, title, detail });
  const shortage = now.totals.power.use - now.totals.power.gen;
  check(shortage > 0 ? 'warning' : 'info', tr('최대 가동 전력', 'Power at maximum demand'), shortage > 0
    ? tr(`켜진 장비의 정격 최대 소비는 ${fmt(now.totals.power.use)}이며, 출력 ${fmt(now.totals.power.gen)}보다 ${fmt(shortage)} 높습니다. 사용하지 않는 장비를 끄거나 출력을 비교하세요.`, `Enabled devices can demand ${fmt(now.totals.power.use)} against ${fmt(now.totals.power.gen)} output: a maximum-demand shortfall of ${fmt(shortage)}. Switch unused devices off or compare power plants.`)
    : tr(`출력 ${fmt(now.totals.power.gen)}에서 최대 소비를 빼면 ${fmt(-shortage)} 여유가 있습니다.`, `Output ${fmt(now.totals.power.gen)} leaves ${fmt(-shortage)} spare at maximum demand.`));
  const shields = now.power.groups.find(group => group.key === 'shields');
  if (shields?.members.length) {
    const enabled = shields.members.filter(member => !member.off);
    check(enabled.length ? 'info' : 'warning', tr('실드별 전원', 'Individual shields'), tr(
      `${shields.members.length}개 중 ${enabled.length}개 켜짐. 켜진 실드의 최소 전력 합계는 ${shields.min}칸입니다. 전력 분배에서 실드별로 끄고 켤 수 있습니다.`,
      `${enabled.length} of ${shields.members.length} enabled; combined minimum ${shields.min} pips. Switch each shield in Power allocation.`));
  }
  const unfunded = now.power.groups.filter(group => group.min > 0 && group.allocated < group.min);
  if (unfunded.length) check('warning', tr('최소 전력 미배정', 'Minimum allocation missing'), tr(`${unfunded.length}개 계통에 최소 작동 전력이 배정되지 않았습니다. 아래 성능은 켜진 장비의 정격 계산이며 실제 작동을 보장하지 않습니다.`, `${unfunded.length} systems have no minimum allocation. Listed performance is rated for enabled devices; it does not guarantee operation.`));
  if (context.comparison) {
    const gains = metrics.filter(metric => Number.isFinite(metric.value) && Number.isFinite(metric.baseline) && (metric.better === 'high' ? metric.value > metric.baseline : metric.value < metric.baseline));
    const losses = metrics.filter(metric => Number.isFinite(metric.value) && Number.isFinite(metric.baseline) && (metric.better === 'high' ? metric.value < metric.baseline : metric.value > metric.baseline));
    check('info', tr('A/B 선택 기준', 'Choosing A or B'), tr(
      `${comparisonLabel} 대비 개선 항목: ${gains.map(metric => metric.label).join('·') || '없음'}. 불리해진 항목: ${losses.map(metric => metric.label).join('·') || '없음'}. 목적에 맞는 항목을 우선하세요.`,
      `Current build improves ${gains.map(metric => metric.label).join(', ') || 'none of the compared metrics'} over ${comparisonLabel}; trade-offs: ${losses.map(metric => metric.label).join(', ') || 'none'}. Prioritize the metrics that match your task.`));
  }
  if (context.kind === 'trade') check('info', tr('운송 준비', 'Hauling preparation'), tr(`플래너에 입력한 화물은 ${fmt(context.cargoScu)} SCU입니다. 입력값이며 게임 파일의 화물칸 검증값은 아닙니다. 경로 거리와 아래 항속을 확인하고, 매수·매도 재고와 가격은 플래너에서 다시 조회하세요.`, `Planner input is ${fmt(context.cargoScu)} SCU, a user input rather than a game-file capacity check. Compare route distance with range below, then refresh buy/sell prices and stock in the planner.`));
  if (now.ignored) check('warning', tr('제외한 장착 입력', 'Ignored equipment choices'), tr(`현재 자료와 맞지 않는 입력 ${now.ignored}개를 제외하고 계산했습니다.`, `${now.ignored} choices were excluded because they do not match current equipment data.`));
  if (now.mining.some(head => !head.power.verified)) check('warning', tr('채광 합산 미확인', 'Mining stacking unverified'), tr('중첩 모듈의 출력 합산은 확인되지 않아 최종 출력을 추천 근거로 쓰지 않습니다.', 'Stacked module output is unverified and is not used as a basis for recommendations.'));
  check('limit', tr('계산 범위', 'Calculation limits'), tr('부분 전력에 따른 탄창·충전·실드 재생은 미검증입니다. 칸 수에 비례해 성능을 추정하지 않으며, 전원 끄기와 켜기는 기존 계산에 반영합니다. 실전 우열·교전 생존시간은 단정하지 않습니다.', 'Partial-power ammo, recharge and shield regeneration are unverified. Performance is not scaled by allocation; on/off states use the existing calculation. Combat superiority and survival time are not established.'));
  const actions = [{ action: 'loadout', shipId: entry.volt || entry.cls, label: tr('로드아웃으로 돌아가기', 'Open loadout') }];
  if (entry.volt) actions.push({ action: 'ship', shipId: entry.volt, label: tr('함선 DB 보기', 'Open ShipDB') });
  const answer = tr(`${title}의 ${context.kind === 'loadout' ? `구성 ${context.slot}` : '기본 구성'}을 게임 파일로 다시 계산했습니다. 전력 ${now.power.allocated}/${now.power.capacity}칸 배정, 실드 ${fmt(now.totals.shield.hp)} HP입니다. 아래 비교와 확인할 점을 보고 목적에 맞게 선택하세요.`, `${title}: recalculated ${context.kind === 'loadout' ? `build ${context.slot}` : 'the stock build'} from game files. Power ${now.power.allocated}/${now.power.capacity} pips; shields ${fmt(now.totals.shield.hp)} HP. Use the comparisons and checks below to decide for your task.`);
  return { answer, data: { status: 'ok', title, gameVersion: base.meta.gameVersion, metrics, checks, power: { allocated: now.power.allocated, capacity: now.power.capacity }, ...(context.kind === 'trade' ? { userCargoScu: context.cargoScu } : {}) },
    review: { title, comparisonLabel, metrics, checks }, actions,
    sources: [{ label: tr('VOLT 로드아웃 · 게임 파일', 'VOLT loadout · game files'), detail: base.meta.version, url: '#loadout' }],
    freshness: { label: tr('게임 자료 생성', 'Game data built'), at: base.meta.builtAt } };
}
