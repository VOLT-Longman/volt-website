# ShipDB Erkul 재작성 v2 — 3.5-A 실전 canonical 전환 (PM 분할 승인)

- **PM 판정**: 3.5를 분할 승인. **3.5-A(지금 착수)** = canonical 플래그를 **실전 ON**으로 전환(클라이언트·CMS·AI). **레거시 데이터·D1 컬럼·삭제 대상 스크립트는 유지**. 즉시 OFF로 되돌릴 수 있어야 함. 레거시 삭제(3.5-B)·D1 물리 컬럼 삭제는 **별도 승인/마이그레이션**.
- **결과**: 클라이언트·서버 canonical 플래그 기본 ON. 삭제 없음. 코드 상수 한 줄로 즉시 되돌림 가능.

## 무엇이 바뀌었나 (플래그 ON)

| 대상 | 전환 | 되돌림 |
|---|---|---|
| 클라이언트 | `js/shipdb-canonical.js` `CANONICAL_ENABLED = true` | `false`로 → 즉시 OFF(레거시 렌더) |
| 서버(CMS) | `functions/_shared/shipdb-canonical-flag.js` `CANONICAL_SERVER_ENABLED = true` | `false`로 → `/api/ship-overrides` 레거시 필드 복원 |
| AI | 2.7-b에서 이미 canonical(플래그 무관) | (해당 없음) |
| 캐시 버전 | `20260719-01` | 배포 반영용 |

**실전 ON에서 라이브가 보이는 것**: 메인 ShipDB **canonical 219**(컨셉 30·별칭 7 제외) · **RSI 공식 카탈로그 30** 탭 · priceUsd·focus·tags 제거 · crew·cargo·**role=Erkul canonical** · 역할 필터 **단일 검색형 콤보박스** · 무역플래너·비교 컨셉/별칭 제외 · CMS 공개 override는 canonical 사실원 필드 생략.

## 되돌림(revert) 보장

- **삭제 없음**: 레거시 데이터(volt-data 사실필드·ship-en·priceUsd·D1 컬럼)·봉인 스크립트 전부 유지. 플래그만 전환.
- **즉시 OFF**: 두 상수를 `false`로 되돌리면(1커밋 revert) OFF 기준선과 완전히 동일하게 복귀. `git revert`로 안전.
- **테스트로 고정**: OFF 되돌림 경로를 `__VOLT_SHIPDB_CANONICAL_TEST__ = false`(클라)·`SHIPDB_CANONICAL_TEST='false'`(서버)로 강제해 상시 검증(레거시 필드·256·focus·priceUsd 복원 확인).

## 테스트 전략(기본 ON 전환)

- **강제 OFF 훅 추가**: 클라 `isEnabled()`·서버 `canonicalServerOn()`에 `=== false`/`'false'` 강제 OFF 분기. `=== true`/`'true'`는 강제 ON. 미설정 → 상수(ON).
- **OFF/되돌림·레거시 스펙**: 기본 ON이므로 OFF를 명시적으로 강제(dual-read OFF 케이스, loader OFF, 비-live 함선 폴백[Javelin], 레거시 모바일 칩 레이아웃).
- **ON/라이브 스펙**: 강제 ON 유지 + 일부 일반 스펙(ships EN·검색)을 라이브(콤보박스·canonical)로 갱신.
- **시각 회귀**: ships 3개 스냅샷(데스크톱·모바일·모달)을 canonical 기준으로 재생성. 권위 기준 `-linux.png`는 **visual-baseline 워크플로(수동 dispatch)**로 갱신(로컬 win32는 참고용).

## 운영 검증 게이트(PM 지정) — 프로덕션 확인 대상

배포(www.volt.ceo) 후 확인:

- [ ] 공개 ShipDB **219척** · RSI 카탈로그 **30척** · 역할 콤보박스 · priceUsd/focus/tags 제거 (담당자 브라우저 확인 가능)
- [ ] 무역플래너·비교의 컨셉/별칭 **제외 규칙** (공개, 확인 가능)
- [ ] **CMS 저장/미리보기** (admin Discord 인증 필요 — 운영자)
- [ ] **AI** 멤버 대화 (멤버 인증 필요 — 운영자)
- [ ] **Erkul Safe Apply preview + 실제 동기화/preview 1회 성공** (admin 인증·Erkul 라이브 — 운영자)

## 미결 (별도 승인)

- **3.5-B**: 위 운영 검증 후 **레거시 코드·정적 데이터 제거**.
- **D1 물리 컬럼 삭제**: **백업/export + 복구 리허설** 확인 후 **별도 마이그레이션**으로만. 코드 revert로는 삭제된 DB 컬럼·값이 복구되지 않기 때문.
