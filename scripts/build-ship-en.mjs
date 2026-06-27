// 함선DB 영어 데이터 생성기.
//   - focus/size/role/tags: 도메인 사전(KO→EN)으로 매핑(유한값, 누락 시 빌드 실패)
//   - crew: 정규화 규칙(명 제거, 범위·미구현·변경예정 처리)
//   - description: RSI 공식 영어 설명(rsi-ship-matrix-index.json)을 erkulName/name으로 매칭
// 출력: data/ship-en.js  (window.VOLT_SHIP_EN = { [id]: { role,focus,size,crew,description,tags } })
//
// 사용법: node scripts/build-ship-en.mjs   (volt-data 변경 시 재생성)

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FOCUS_EN = {
  '기함': 'Flagship', '다목적': 'Multi-role', '레이싱': 'Racing', '방송': 'Broadcast',
  '수송': 'Transport', '연구': 'Research', '의료': 'Medical', '인양': 'Salvage',
  '입문': 'Starter', '전투': 'Combat', '정제': 'Refinery', '주유': 'Refuel',
  '지원': 'Support', '채굴': 'Mining', '탐사': 'Exploration', '화물': 'Cargo',
};

const SIZE_EN = {
  '대형': 'Large', '소형': 'Small', '중형': 'Medium', '지상': 'Ground', '초소형': 'Snub', '캐피탈': 'Capital',
};

const TAG_EN = {
  '다목적': 'Multi-role', '레이싱': 'Racing', '수송': 'Transport', '지원': 'Support',
  '기함': 'Flagship', '모듈형': 'Modular', '미구현': 'Unimplemented', '의료': 'Medical',
  '인양': 'Salvage', '입문': 'Starter', '전투': 'Combat', '정제': 'Refinery',
  '주유': 'Refuel', '지상': 'Ground', '채굴': 'Mining', '탐사': 'Exploration', '화물': 'Cargo',
};

const ROLE_EN = {
  '건쉽': 'Gunship', '경 전투기': 'Light Fighter', '경 화물선': 'Light Freight',
  '경찰/바운티 헌터': 'Police / Bounty Hunter', '구난·인양': 'Rescue & Salvage',
  '다목적': 'Multi-role', '다목적함': 'Multi-role', '대형 건쉽': 'Heavy Gunship',
  '대형 과학선': 'Large Science', '대형 채굴': 'Large Mining', '대형 화물': 'Large Cargo',
  '대형 화물선': 'Large Freight', '럭셔리 투어링': 'Luxury Touring', '레이싱': 'Racing',
  '방송/중계': 'Broadcast / Relay', '소형 과학/연구': 'Small Science / Research',
  '소형 인양': 'Small Salvage', '소형 인양/입문': 'Small Salvage / Starter',
  '소형 정제': 'Small Refinery', '소형 화물': 'Small Cargo', '수송선': 'Transport',
  '의료선': 'Medical', '인양선': 'Salvage', '입문/경 전투기': 'Starter / Light Fighter',
  '입문/소형 화물': 'Starter / Small Cargo', '입문/탐사선': 'Starter / Pathfinder',
  '입문선': 'Starter', '전투함': 'Combat Ship', '주유선': 'Refuel',
  '중 전투기': 'Heavy Fighter', '중 전투기/EMP/퀀텀 댐퍼': 'Heavy Fighter / EMP / Quantum Damper',
  '중형 전투기': 'Medium Fighter', '중형 주유': 'Medium Refuel', '중형 화물': 'Medium Cargo',
  '중형 화물/건쉽': 'Medium Cargo / Gunship', '중형 화물/모듈함': 'Medium Cargo / Modular',
  '지상 의료차량': 'Ground Medical Vehicle', '지상 탐사': 'Ground Exploration',
  '지원선': 'Support', '채굴': 'Mining', '채굴/정제': 'Mining / Refinery', '채굴선': 'Mining',
  '초대형 화물': 'Super-large Cargo', '코르벳': 'Corvette', '퀀텀 차단': 'Quantum Interdiction',
  '탐사': 'Exploration', '탐사선': 'Pathfinder', '투어링': 'Touring', '항모': 'Carrier', '화물선': 'Freight',
};

// RSI 설명이 비어 있거나 매칭되지 않는 함선의 수동 보정.
// (변종 함선은 RSI 매트릭스에서 설명이 비어 있어 베이스 설명/간결 작성으로 채운다.)
const DESCRIPTION_OVERRIDES = {
  'zeus-mk2-mr': 'The Zeus Mk II MR is a medium rescue and recovery vessel built for search-and-rescue operations, equipped to locate, stabilize, and recover downed crews.',
  'gladius-pirate-edition': 'A pirate-customized variant of the Gladius — a fast, light fighter with a laser focus on dogfighting, making it an ideal interceptor or escort ship.',
  'cyclone-mt': 'A weaponized variant of the Cyclone ground vehicle, the Cyclone MT mounts a missile turret for mobile anti-air and fire support across the surface.',
  'ballista': 'A mobile ground-based anti-aircraft platform built on the Tumbril chassis, the Ballista delivers long-range surface-to-air firepower.',
  'anvil-ballista-snowblind': 'A cold-weather variant of the Ballista mobile anti-air platform, the Snowblind adds EMP capability for electronic warfare on the battlefield.',
  'anvil-ballista-dunestalker': 'A desert-pattern variant of the Ballista mobile anti-air platform, the Dunestalker is tuned for long-range engagement across arid terrain.',
  'expanse': 'A mining-focused vessel built for prospecting and resource extraction, designed to operate across remote sites with onboard ore processing.',
};

function normalizeCrew(crew) {
  if (!crew || crew === '정보 없음') return 'Unknown';
  let s = crew.replace('(미구현)', ' (WIP)').replace('(변경 예정)', ' (TBD)');
  s = s.replace('명', '').replace(/~/g, '-');
  s = s.replace(/^null-/, 'up to ').replace(/null/g, '?');
  return s.trim();
}

function mapOrThrow(dict, value, label, shipId) {
  if (Object.prototype.hasOwnProperty.call(dict, value)) return dict[value];
  throw new Error(`[${shipId}] ${label} 사전 누락: ${JSON.stringify(value)} — build-ship-en.mjs 사전에 추가 필요`);
}

function normName(name) {
  return (name || '').replace(/\s+/g, ' ').trim();
}

function main() {
  const dataText = readFileSync(path.join(root, 'data', 'volt-data.js'), 'utf8');
  const start = dataText.indexOf('ships: [');
  const arrStart = dataText.indexOf('[', start);
  // 배열 끝(다음 "\n    ]," )의 닫는 대괄호까지 포함한다.
  const closeIdx = dataText.indexOf('\n    ],', arrStart);
  const arrText = `${dataText.slice(arrStart, closeIdx)}]`;
  const ships = JSON.parse(arrText);

  const rsi = JSON.parse(readFileSync(path.join(root, 'data', 'rsi-ship-matrix-index.json'), 'utf8').replace(/^﻿/, '')).data;
  const rsiByName = new Map();
  for (const r of rsi) rsiByName.set(normName(r.name), r.description || '');

  const out = {};
  const missingDesc = [];
  for (const ship of ships) {
    const desc = DESCRIPTION_OVERRIDES[ship.id]
      || rsiByName.get(normName(ship.erkulName))
      || rsiByName.get(normName(ship.name))
      || '';
    if (!desc) missingDesc.push(`${ship.id} (${ship.name})`);
    out[ship.id] = {
      role: mapOrThrow(ROLE_EN, ship.role, 'role', ship.id),
      focus: mapOrThrow(FOCUS_EN, ship.focus, 'focus', ship.id),
      size: mapOrThrow(SIZE_EN, ship.size, 'size', ship.id),
      crew: normalizeCrew(ship.crew),
      description: desc,
      tags: (Array.isArray(ship.tags) ? ship.tags : []).map((t) => mapOrThrow(TAG_EN, t, 'tag', ship.id)),
    };
  }

  if (missingDesc.length) {
    throw new Error(`RSI 영어 설명 매칭 실패(${missingDesc.length}): ${missingDesc.join(', ')} — DESCRIPTION_OVERRIDES에 추가 필요`);
  }

  const header = '// 자동 생성 파일 — 직접 수정하지 마세요. `node scripts/build-ship-en.mjs`로 재생성.\n'
    + '// 함선DB 영어 데이터(역할/포커스/크기/승무원/설명/태그). description은 RSI 공식 영어.\n';
  const body = `window.VOLT_SHIP_EN = ${JSON.stringify(out, null, 0)};\n`;
  writeFileSync(path.join(root, 'data', 'ship-en.js'), header + body, 'utf8');
  console.log(`생성 완료: data/ship-en.js (${Object.keys(out).length}척)`);
}

main();
