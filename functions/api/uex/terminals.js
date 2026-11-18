import { proxyUexDerived, uexId as id, uexIsOne, uexIsZero } from '../../_shared/uex-proxy.js';

// 상품 거래 터미널과 정제소 터미널 목록 (출처: UEX terminals).
// 원본 826줄·56필드(약 1 MB) 중 두 종류만, 위치·시설 표시에 필요한 필드만 남긴다.
const CACHE_TTL_SECONDS = 12 * 60 * 60;
const TYPES = new Set(['commodity', 'refinery']);
// [우리 이름, UEX 필드]. 1로 보고된 것만 싣는다 — 빠져 있다고 "없음"이 확인된 것은 아니다.
const FLAGS = [
  ['autoLoad', 'is_auto_load'], ['freightElevator', 'has_freight_elevator'], ['loadingDock', 'has_loading_dock'],
  ['dockingPort', 'has_docking_port'], ['cargoCenter', 'is_cargo_center'], ['refinery', 'is_refinery'],
  ['refuel', 'is_refuel'], ['repair', 'is_repair'], ['nqa', 'is_nqa'], ['playerOwned', 'is_player_owned'],
];
// [id 필드, 이름 필드, 우리 이름]. id가 0이거나 이름이 비면 그 필드를 뺀다.
const PLACES = [
  ['id_star_system', 'star_system_name', 'system'], ['id_planet', 'planet_name', 'planet'], ['id_orbit', 'orbit_name', 'orbit'],
  ['id_moon', 'moon_name', 'moon'], ['id_space_station', 'space_station_name', 'station'], ['id_city', 'city_name', 'city'],
  ['id_outpost', 'outpost_name', 'outpost'],
];
const text = (value) => (typeof value === 'string' ? value.trim() : '');

export function buildTerminals(rows) {
  const data = [];
  for (const row of rows) {
    if (!row || !TYPES.has(row.type) || !id(row.id)) continue;
    const out = { id: id(row.id), type: row.type, name: text(row.name) };
    if (text(row.nickname)) out.nick = text(row.nickname);
    if (text(row.code)) out.code = text(row.code);
    // 현재 라이브 서버에 없는 터미널(is_available 또는 is_available_live가 0)은 live:false.
    out.live = !uexIsZero(row.is_available) && !uexIsZero(row.is_available_live);
    for (const [idField, nameField, key] of PLACES) {
      if (id(row[idField])) out[key + 'Id'] = id(row[idField]);
      if (text(row[nameField])) out[key] = text(row[nameField]);
    }
    if (text(row.faction_name)) out.faction = text(row.faction_name);
    const flags = FLAGS.filter(([, field]) => uexIsOne(row[field])).map(([key]) => key);
    if (flags.length) out.flags = flags;
    // max_container_size 0은 "보고 없음"이지 "상자 불가"가 아니다 (docs/uex-endpoints.md). 모르면 뺀다.
    if (id(row.max_container_size)) out.maxBox = id(row.max_container_size);
    data.push(out);
  }
  return data;
}

export async function onRequestGet(context) {
  return proxyUexDerived(context, { cacheName: 'terminals/v1', upstreamPaths: ['terminals'], ttlSeconds: CACHE_TTL_SECONDS, build: buildTerminals, isUsable: (data) => data.length > 0 });
}
