# VOLT 함선DB 데이터 감사 기준

VOLT 함선DB는 **Erkul/DPS Calculator의 live ship list**를 라이브 구현 여부 판단 기준으로 사용합니다.  
RSI 공식 페이지와 Erkul 표기가 다를 수 있으므로, 데이터는 즉시 삭제하지 않고 상태 필드로 보존·격리합니다.

## 기준 데이터

- 기준 소스: Erkul live calculator / DPS Calculator
- 기준 버전: `4.8.0-LIVE.11825000`
- 기준 API: `https://server.erkul.games/live/ships`
- 적용일: 2026-05-19

## 보조 필드

각 `ships` 항목은 아래 필드를 선택적으로 가질 수 있습니다. 필드가 없어도 기존 렌더링은 깨지지 않아야 합니다.

- `implemented: boolean` — Erkul live 기준 실제 운용 가능 여부
- `plannerEligible: boolean` — VOLT 무역플래너 노출 여부
- `erkulName: string | null` — Erkul에서 확인한 표기명
- `erkulStatus: "matched" | "unreleased" | "duplicate" | "review"` — 대조 상태
- `canonicalId: string | null` — 중복 또는 스킨형 항목의 대표 함선 id

## 상태값 사용 기준

- `matched`: Erkul live list에서 매칭 완료
- `unreleased`: VOLT DB에는 있으나 Erkul live list에서 확인되지 않음
- `duplicate`: 독립 함선이 아니라 대표 항목으로 통합 검토할 후보
- `review`: 명칭·변형 모델 차이 때문에 수동 확인 필요

## 정리 원칙

1. Erkul/DPS Calculator에 있는 함선은 `implemented: true`로 처리합니다.
2. Erkul/DPS Calculator에 없는 함선은 `implemented: false`, `plannerEligible: false`, `erkulStatus: "unreleased"`로 처리합니다.
3. 미구현 함선은 함선DB에는 유지할 수 있지만, 무역플래너에서는 제외합니다.
4. 미구현 함선에는 `tags`에 `"미구현"`을 유지합니다.
5. 중복 후보는 즉시 삭제하지 않고 `canonicalId`로 대표 항목에 연결합니다.
6. 같은 시리즈라도 역할, 화물량, 승무원, 운용 목적이 다르면 별도 항목으로 유지합니다.
7. Erkul은 기술 스펙 기준이고, VOLT DB는 사용자 안내와 작전 판단 기준입니다. 한국어 설명과 VOLT식 태그는 보존합니다.

## 무역플래너 노출 기준

무역플래너에는 실제 운송 작전에 사용할 수 있는 후보만 노출합니다.

`plannerEligible: true` 권장:

- `implemented: true`
- cargo 값이 0보다 큼
- 실제 라이브 운용 가능
- 화물, 물류, 운송, 보급, 산업, 인양, 채굴, 주유 등 작전 운용에 사용할 수 있음

`plannerEligible: false` 권장:

- `implemented: false`
- `tags`에 `"미구현"` 포함
- cargo 0 또는 파싱 불가
- 전투 전용, 레이싱 전용, 스누브, 지상 차량 등 단일 화물 운송 플래너에 부적합
- 중복 후보
- 데이터 검증 전 불확실한 함선

## 핵심 스펙 검증 우선순위

1. `cargo` — 무역플래너 계산에 직접 사용되므로 Erkul 기준으로 우선 보정
2. `crew` — 역할 배분 참고값. Erkul의 일부 대형함 crew 값은 보수적으로 검토 후 반영
3. `size` — 사이트의 한국어 분류를 유지하되 명백한 오류만 수정
4. `role` / `focus` — VOLT 사용 맥락에 맞춘 한국어 분류 유지
5. `priceUsd` — 확실한 경우만 유지·반영. 불확실하면 `null` 또는 기존 값 유지

## 수동 점검 체크리스트

- [ ] Erkul 표기명 확인
- [ ] RSI 공식명 확인
- [ ] cargo 값 확인
- [ ] crew 값 확인
- [ ] size 값 확인
- [ ] 구현 여부 확인
- [ ] 미구현/컨셉 여부 확인
- [ ] 중복 후보 여부 확인
- [ ] 무역플래너 노출 여부 판단
- [ ] VOLT식 설명과 태그가 유지되는지 확인

## 삭제 정책

1. 즉시 삭제하지 않습니다.
2. 먼저 `implemented: false`, `plannerEligible: false`, `erkulStatus: "unreleased"` 또는 `"review"`로 격리합니다.
3. 중복은 `canonicalId`로 대표 항목을 지정합니다.
4. 최종 삭제는 별도 리뷰 후 진행합니다.
