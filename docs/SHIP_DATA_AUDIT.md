# 함선 데이터 정리 기준

VOLT 함선DB는 Erkul live calculator를 수동 검증 기준으로 삼되, 자동 크롤링 없이 별도 점검 작업으로 관리합니다.

## 선택 필드

각 `ships` 항목은 필요할 때 아래 보조 필드를 가질 수 있습니다. 필드가 없어도 기존 렌더링은 그대로 동작합니다.

- `implemented: boolean` — 실제 라이브 운용 가능 여부
- `plannerEligible: boolean` — 무역플래너 후보 노출 여부
- `erkulName: string` — Erkul에서 사용하는 표기명
- `erkulStatus: "matched" | "missing" | "duplicate" | "review"` — 대조 상태
- `canonicalId: string | null` — 중복 통합 시 대표 항목 id

## 정리 원칙

1. Erkul calculator와 VOLT DB에 모두 있는 함선은 유지합니다.
2. Erkul calculator에는 있지만 VOLT DB에 없는 함선은 추가 후보로 기록합니다.
3. VOLT DB에는 있지만 Erkul calculator에 없는 함선은 즉시 삭제하지 않고 `review` 대상으로 남깁니다.
4. 미구현/컨셉 함선은 함선DB에 유지할 수 있지만, 무역플래너에서는 제외합니다.
5. 중복은 `canonicalId` 기준으로 대표 항목에 통합합니다.
6. 같은 시리즈라도 역할, 화물량, 승무원이 다르면 별도 항목으로 유지합니다.

## 무역플래너 노출 규칙

무역플래너는 아래 조건을 모두 만족하는 함선만 후보로 표시합니다.

- `implemented !== false`
- `plannerEligible !== false`
- `tags`에 `미구현`이 없음
- 파싱 가능한 `cargo` 값이 0보다 큼

즉, 함선DB는 세계관과 비교 목적을 위해 넓게 유지하고, 무역플래너는 실제 운용 가능한 화물 후보만 엄격하게 보여줍니다.

## 다음 점검 순서

1. Erkul에서 표기명 확인
2. `erkulName`, `erkulStatus` 채우기
3. 중복 의심 항목에 `canonicalId` 부여
4. 라이브 운용 가능 여부를 `implemented`로 검토
5. 무역플래너 제외 대상은 `plannerEligible: false`로 명시
