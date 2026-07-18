# ShipDB Erkul 재작성 v2 — role 원자 이관 리포트

- **목적(PM)**: 공개 ShipDB의 `role`을 Erkul canonical role로 단독 이관한다. 3.5 실전 전환 전 마지막 데이터 필드 이관.
- **PM 계약(7항)**:
  1. ON에서는 canonical의 정확한 `role`만 사용
  2. 기존 VOLT 수기 role·`career` 조합·추론 기반 대체 금지
  3. canonical `role`이 없으면 역할 배지·역할 필터에서 제외
  4. 역할 필터도 canonical role 집합에서만 생성
  5. 한국어는 역할 사실을 바꾸지 않는 UI 번역 계층으로만 처리
  6. 카드·상세·비교·필터 등 모든 role 소비처를 함께 이관
  7. OFF에서는 기존 출력이 완전히 동일
- **결과**: OFF=기준선 완전 불변, ON=canonical role. 전 게이트 통과.

## 사실 소스와 번역 계층

- **사실원**: `data/canonical/ships-canonical.json[].role`(Erkul EN). 219/219 척 전부 role 보유 → 배지·필터 누락 0(계약 3항 방어적).
- **번역 계층**: `data/canonical/localization-roles.json` — Erkul EN role 52종 → KO UI 번역(사실 불변). 생성기 `scripts/shipdb-rewrite/build-role-localization.mjs`가 canonical distinct role을 전부 커버하도록 강제(누락 시 exit 1). KO는 크기 접두(Light=경/Medium=중형/Heavy=대형), Tank=전차(군용 맥락 nova·storm) 등 통제어휘로 표기만 전환.
- **금지 준수**: VOLT 수기 role·career 조합·추론 대체 없음. KO는 per-ship이 아니라 role 문자열(52종) 단위 번역.

## 이관된 소비처 (ON=canonical, OFF=레거시 불변)

| 소비처 | 위치 | OFF | ON |
|---|---|---|---|
| 메인 카드 배지 | `js/ships.js` | focus 배지(VOLT 분류) | canonical role 배지(`.ship-role-badge`) |
| 비교표 역할 행 | `js/ships.js` | `tx(ship,'role')` | `roleDisplay` = canonical KO/EN |
| 상세 모달 역할 | `js/ships.js` | `tx(ship,'role')` | `roleDisplay` |
| 추천 무역 카드 | `js/main.js` | `ship.role` | canonical role(로케일별) |
| 내부 검색 인덱스 | `js/main.js` | `role`·`role_en` | canonical role EN+KO |
| 플래너 스코어 | `js/main.js` | `ship.role`(KO) | canonical role KO(토큰 스코어 동치) |
| 전역 검색 모달 | `js/search-modal.js` | `item.role` | canonical role EN+KO |
| **역할 필터** | `js/ships.js`+`js/main.js` | focus/tags 카테고리 칩 | **canonical role 칩**(키=Erkul EN, 라벨=KO) |
| purpose 프리셋 | `js/ships.js` | VOLT 편집 분류 드롭다운 | **숨김**(focus/tags와 동일 취급) |

- **로더**: `js/shipdb-canonical.js`에 `roleLocalization` 계층(7번째) + `roleKo(en)`·`roleList()` 접근자 추가.
- **필터 매처**: ON은 `canonical role(EN) === 선택 칩`으로 매칭(선택 키=Erkul EN role). canonical role 없으면 제외(계약 3·4항).
- **purpose 숨김 근거**: purpose는 focus/tags 파생 VOLT 편집 분류(마케팅 카피 포함)라 canonical role로 재구성하면 새 VOLT 편집을 낳아 계약 2항 위반. focus/tags(D7)와 동일하게 ON에서 숨긴다.

## 검증 (사실)

- **role KO 완전성**(`tests/functions/shipdb-role-localization.test.mjs`, 2건): canonical distinct role 52종 전부 KO 보유(missing 0), localization-roles↔canonical 1:1(잉여 0), 빈 KO 0.
- **ON 이관 스모크**(`tests/smoke/shipdb-role-migration.spec.js`, 5건): 카드 role 배지=KO·focus 배지 제거, 필터 role 칩(키 EN·라벨 KO)·선택 시 해당 role만, 모달 KO, EN 로케일=Erkul EN, purpose 숨김.
- **비교 하네스 갱신**(`shipdb-3-1-comparison.spec.js`): OFF focus 배지→ON role 배지 이관, 필터=role 칩(Medium Freight 등), 비교 역할 행=canonical KO(freelancer 경 화물선·caterpillar 중형 화물선).
- **OFF 기준선**: 모든 role 소비처가 `canonicalOn()` 게이팅 → OFF 출력 완전 동일(카드 focus 배지·레거시 role·카테고리 필터·purpose 노출). 시각 회귀(기본 OFF) 유지.
- **게이트**: `npm run check` OK · `test:functions` 통과 · `npx playwright test` 통과.

## 3.5 전 잔여

- 서버측(AI·CMS·Safe Apply)의 canonical 전환은 3.5 실전 전환 시 클라이언트와 함께(3.3 리허설로 파이프라인 정합 확인 완료).
- **데이터 삭제·기본 플래그 ON·실사용 전환은 3.5 PM 승인 시점에만.**
