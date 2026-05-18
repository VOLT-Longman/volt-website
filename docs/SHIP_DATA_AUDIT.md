# 함선 데이터 감사 기준

VOLT 함선DB는 Erkul live calculator와 RSI 표기를 수동 대조해 관리합니다. 자동 크롤링 없이, 삭제보다 검토 상태를 먼저 남기는 보수적 정리 방식을 따릅니다.

## 선택 필드

각 `ships` 항목은 필요할 때 아래 보조 필드를 가질 수 있습니다. 필드가 없어도 기존 렌더링은 그대로 동작해야 합니다.

- `implemented: boolean` — 실제 라이브 운용 가능 여부
- `plannerEligible: boolean` — 무역플래너 후보 노출 여부
- `erkulName: string` — Erkul에서 확인한 표기명
- `erkulStatus: "matched" | "missing" | "duplicate" | "review"` — 대조 상태
- `canonicalId: string | null` — 중복 통합 시 대표 함선 id

## 정리 원칙

1. Erkul calculator와 VOLT DB에 모두 있는 함선은 유지합니다.
2. Erkul에는 있고 VOLT DB에는 없는 함선은 추가 후보로 기록합니다.
3. VOLT DB에는 있지만 Erkul에서 확인되지 않은 함선은 즉시 삭제하지 않고 `review` 상태로 남깁니다.
4. 미구현·컨셉 함선은 함선DB에는 유지할 수 있지만 무역플래너에서는 제외합니다.
5. 중복은 `canonicalId` 기준으로 대표 항목에 통합합니다.
6. 같은 시리즈라도 역할, 화물량, 승무원이 다르면 별도 항목으로 유지합니다.

## 무역플래너 노출 규칙

무역플래너는 아래 조건을 모두 만족하는 함선만 후보로 보여줍니다.

- `implemented !== false`
- `plannerEligible !== false`
- `tags`에 `"미구현"` 없음
- 파싱 가능한 `cargo` 값이 0보다 큼
- 실제 화물·물류·보급·산업 운용에 쓸 수 있음

즉, 함선DB는 비교와 기록 목적까지 넓게 품고, 무역플래너는 실제 운용 후보만 엄격하게 보여줍니다.

## 수동 점검 체크리스트

- [ ] Erkul 표기명 확인
- [ ] RSI 공식명 확인
- [ ] cargo 값 확인
- [ ] crew 값 확인
- [ ] 실제 구현 여부 확인
- [ ] 미구현/컨셉 여부 확인
- [ ] 중복 후보 여부 확인
- [ ] 무역플래너 노출 여부 판단

## `erkulStatus` 사용 기준

- `matched` — Erkul 기준 확인 완료
- `missing` — Erkul에는 있으나 VOLT DB에는 없는 추가 후보
- `duplicate` — 중복 의심 또는 대표 항목 통합 필요
- `review` — 아직 수동 확인 필요

## `plannerEligible` 판단 기준

`true` 권장:

- 실제 라이브 운용 가능
- cargo 값이 있음
- 물류·화물·보급·산업 운용에 직접 활용 가능

`false` 권장:

- cargo 0
- 전투·레이싱·비물류 전용
- 미구현
- 중복 후보
- 데이터 검증 전 불확실한 함선

## 삭제 정책

1. 즉시 삭제하지 않습니다.
2. 먼저 `plannerEligible: false` 또는 `erkulStatus: "review"`로 격리합니다.
3. 중복은 `canonicalId`로 대표 항목을 지정합니다.
4. 최종 삭제는 별도 리뷰 후 진행합니다.

## 다음 감사 순서

1. Erkul 표기명 확인
2. `erkulName`, `erkulStatus` 채우기
3. 중복 의심 항목에 `canonicalId` 부여
4. 라이브 운용 가능 여부를 `implemented`로 검증
5. 무역플래너 제외 대상은 `plannerEligible: false`로 명시
