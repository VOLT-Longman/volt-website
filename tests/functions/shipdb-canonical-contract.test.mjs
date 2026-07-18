// ShipDB Erkul 재작성 v2 — 공개 canonical 필드·선정·입력 계약 CI 차단 (0단계 0.4, PM 보강 반영)
// PM 조건 이행: 재생성 스크립트가 Erkul 정규 데이터 외 필드를 공개 canonical에 재주입하면 CI 실패,
// canonical 선정 기준(Erkul live 존재)·입력 출처를 CI로 강제.
// 문서 경고가 아니라 실행되는 테스트. `npm run test:functions`(CI smoke.yml)로 게이트된다.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  CANONICAL_DATASET_PATH,
  CANONICAL_GENERATOR_PATH,
  BASELINE_PATH,
  FORBIDDEN_PUBLIC_FIELDS,
  CANONICAL_SELECTION,
  LEGACY_REGEN_SCRIPTS,
  CANONICAL_FORBIDDEN_INPUTS,
  CONCEPT_DATASET_PATH,
  CONCEPT_RSI_ALLOWED_FIELDS,
  CONCEPT_FORBIDDEN_FIELDS,
} from '../../data/shipdb-rewrite/canonical-contract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readRoot = (rel) => readFile(join(ROOT, rel), 'utf8');

// PM 9개 결정으로 공개 모델에서 제거/격리가 확정된 필드 — 계약이 이걸 전부 덮어야 한다.
const PM_REMOVED_OR_ISOLATED = ['priceUsd', 'focus', 'tags', 'crew', 'plannerEligible', 'erkulName', 'erkulStatus'];

async function loadBaseline() {
  return JSON.parse(await readRoot(BASELINE_PATH));
}

test('계약이 PM 제거/격리 필드를 모두 포함한다 (계약 약화 방지)', () => {
  const covered = new Set(FORBIDDEN_PUBLIC_FIELDS.map((f) => f.field));
  for (const field of PM_REMOVED_OR_ISOLATED) {
    assert.ok(covered.has(field), `계약에서 누락된 금지 필드: ${field} — 누군가 계약을 약화시켰다`);
  }
  for (const entry of FORBIDDEN_PUBLIC_FIELDS) {
    assert.ok(entry.field && entry.decision && entry.reason, `계약 항목에 field/decision/reason 필수: ${JSON.stringify(entry)}`);
  }
});

// PM 보강 2: canonical 선정 기준 = Erkul live 존재(hasLive), erkulStatus='matched' 아님.
test('canonical 선정 기준: 기준선 hasLive:true = 정확히 219척 (railen 포함)', async () => {
  const b = await loadBaseline();
  const hasLive = b.idList.filter((x) => x.hasLive);
  assert.equal(hasLive.length, CANONICAL_SELECTION.expectedCount, `canonical(hasLive) 219 기대, 실제 ${hasLive.length}`);
  const liveIds = new Set(hasLive.map((x) => x.id));
  for (const id of CANONICAL_SELECTION.mustInclude) {
    const rec = b.idList.find((x) => x.id === id);
    assert.ok(liveIds.has(id), `${id}는 canonical에 포함돼야 함(live 존재). 현재 erkulStatus=${rec?.erkulStatus}, implemented=${rec?.implemented}`);
  }
  // railen은 erkulStatus='unreleased'인데도 canonical에 포함됨을 명시적으로 고정
  const railen = b.idList.find((x) => x.id === 'railen');
  assert.ok(railen && railen.hasLive && railen.erkulStatus === 'unreleased', 'railen 회귀 가드: unreleased + hasLive');
});

test('제외 집합: 미출시 30(no-live) + 별칭 7 = 37, 전부 hasLive:false', async () => {
  const b = await loadBaseline();
  const noLive = b.idList.filter((x) => !x.hasLive);
  assert.equal(noLive.length, CANONICAL_SELECTION.excludedNoLiveCount, `제외(no-live) 37 기대, 실제 ${noLive.length}`);
  const alias = noLive.filter((x) => x.canonicalId);
  const unreleased = noLive.filter((x) => !x.canonicalId);
  assert.equal(alias.length, CANONICAL_SELECTION.aliasCount, `별칭(canonicalId) 7 기대, 실제 ${alias.length}`);
  assert.equal(unreleased.length, CANONICAL_SELECTION.unreleasedNoLiveCount, `미출시 30 기대, 실제 ${unreleased.length}`);
  // 별칭 대상은 전부 canonical(hasLive)에 존재해야 함
  const liveIds = new Set(b.idList.filter((x) => x.hasLive).map((x) => x.id));
  const badTargets = alias.filter((x) => !liveIds.has(x.canonicalId));
  assert.equal(badTargets.length, 0, `별칭 대상이 canonical에 없음: ${badTargets.map((x) => `${x.id}→${x.canonicalId}`).join(', ')}`);
});

test('공개 canonical에 금지 필드가 없다 (fail-closed, 1단계에서 활성)', async () => {
  const abs = join(ROOT, CANONICAL_DATASET_PATH);
  if (!existsSync(abs)) {
    assert.ok(true, `canonical 미생성(${CANONICAL_DATASET_PATH}) — 계약 armed, 1단계에서 자동 활성`);
    return;
  }
  const data = JSON.parse(await readFile(abs, 'utf8'));
  const records = Array.isArray(data) ? data : Array.isArray(data.ships) ? data.ships : Object.values(data);
  const forbidden = FORBIDDEN_PUBLIC_FIELDS.map((f) => f.field);
  const violations = [];
  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue;
    for (const field of forbidden) {
      if (Object.hasOwn(rec, field)) violations.push(`${rec.id || '(id?)'}.${field}`);
    }
  }
  assert.equal(violations.length, 0, `공개 canonical에 금지 필드 재주입됨: ${violations.slice(0, 20).join(', ')}${violations.length > 20 ? ` 외 ${violations.length - 20}건` : ''}`);
});

// PM 보강 2: 생성된 canonical의 ID 집합 = 기준선 hasLive 집합과 정확히 일치.
test('공개 canonical ID 집합 = 기준선 hasLive 219 (fail-closed)', async () => {
  const abs = join(ROOT, CANONICAL_DATASET_PATH);
  if (!existsSync(abs)) {
    assert.ok(true, 'canonical 미생성 — 계약 armed');
    return;
  }
  const b = await loadBaseline();
  const expected = new Set(b.idList.filter((x) => x.hasLive).map((x) => x.id));
  const data = JSON.parse(await readFile(abs, 'utf8'));
  const records = Array.isArray(data) ? data : Array.isArray(data.ships) ? data.ships : Object.values(data);
  const actual = new Set(records.map((r) => r.id));
  const missing = [...expected].filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !expected.has(id));
  assert.equal(actual.size, expected.size, `canonical ${actual.size}척, 기대 ${expected.size}`);
  assert.equal(missing.length + extra.length, 0, `canonical ID 불일치 — 누락: ${missing.slice(0, 10).join(',')} / 초과: ${extra.slice(0, 10).join(',')}`);
});

// PM 보강 2: canonical 생성기는 volt-data.js·ship-prices-usd.json·rsi-ship-matrix-index.json을 사실원으로 읽지 않는다.
test('canonical 생성기가 금지 입력을 참조하지 않는다 (fail-closed)', async () => {
  const abs = join(ROOT, CANONICAL_GENERATOR_PATH);
  if (!existsSync(abs)) {
    assert.ok(true, `canonical 생성기 미작성(${CANONICAL_GENERATOR_PATH}) — 계약 armed`);
    return;
  }
  const src = await readRoot(CANONICAL_GENERATOR_PATH);
  const offenders = CANONICAL_FORBIDDEN_INPUTS.filter((p) => src.includes(p));
  assert.equal(offenders.length, 0, `canonical 생성기가 금지 입력을 사실원으로 참조: ${offenders.join(', ')} — Erkul live 레이어만 읽어야 함`);
});

// PM step4: RSI 컨셉 카탈로그는 RSI 비제공 게임플레이 값을 갖지 않고, rsi{}는 허용 필드만 가진다.
test('컨셉 카탈로그: RSI 비제공 게임플레이 값 없음 + rsi 필드 화이트리스트 (fail-closed)', async () => {
  const abs = join(ROOT, CONCEPT_DATASET_PATH);
  if (!existsSync(abs)) {
    assert.ok(true, `컨셉 카탈로그 미생성(${CONCEPT_DATASET_PATH}) — 계약 armed`);
    return;
  }
  const data = JSON.parse(await readFile(abs, 'utf8'));
  const records = Array.isArray(data) ? data : Array.isArray(data.records) ? data.records : Object.values(data);
  const allowed = new Set(CONCEPT_RSI_ALLOWED_FIELDS);
  const violations = [];
  for (const rec of records) {
    if (!rec || typeof rec !== 'object' || !rec.rsi) continue;
    // 게임플레이 금지 필드가 레코드/ rsi 어디에도 없어야 함
    for (const f of CONCEPT_FORBIDDEN_FIELDS) {
      if (Object.hasOwn(rec, f) || Object.hasOwn(rec.rsi, f)) violations.push(`${rec.id}.${f}`);
    }
    // rsi{}는 허용 필드만
    for (const key of Object.keys(rec.rsi)) {
      if (!allowed.has(key)) violations.push(`${rec.id}.rsi.${key}(비허용)`);
    }
    // 출처·상태 필수
    if (rec.source !== 'rsi-official') violations.push(`${rec.id}.source!=rsi-official`);
    if (rec.status !== 'concept') violations.push(`${rec.id}.status!=concept`);
    if (!rec.sourceUrl) violations.push(`${rec.id}.sourceUrl 없음`);
  }
  assert.equal(violations.length, 0, `컨셉 카탈로그 계약 위반: ${violations.slice(0, 20).join(', ')}`);
});

// PM 보강 1: 레거시 재생성 4스크립트가 공개 canonical 경로에 기록하지 않는다.
test('레거시 재생성 스크립트가 공개 canonical 경로에 기록하지 않는다', async () => {
  const offenders = [];
  for (const rel of LEGACY_REGEN_SCRIPTS) {
    if (!existsSync(join(ROOT, rel))) continue;
    const src = await readRoot(rel);
    if (src.includes(CANONICAL_DATASET_PATH)) offenders.push(rel);
  }
  assert.equal(offenders.length, 0, `레거시 재생성 스크립트가 canonical 경로를 참조(무통제 재주입 위험): ${offenders.join(', ')}`);
});
