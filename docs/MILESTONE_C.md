# 마일스톤 C — 운영 정착 & 정합성 (완료)

> **2026-07-08 마감.** C-1 `faeba22` · C-2 `680ff3d` · C-3 `598800c`+`bad5756` · C-4 `3fbecda` · C-5 아래 커밋.
> C-0(운영자 1회 작업)만 운영자 액션 대기. 잔여 부채 현황은 [BACKLOG.md](BACKLOG.md)가 기준.

릴리스 기준점(`fdc591c`) 이후의 개선 계획. 기준 커밋: **`c61cdd5`** (2026-07-06, 캐시 `20260706-04`).
현재 게이트: `npm run check` ✅ · Functions **85/85** · Playwright **172/172** — 기준점 이후 추가된
함선 UX/CMS 4커밋(모달 스펙 중복 제거 → CMS 함선명·숨김 → 구매/렌탈 필터 → 설명 통일)까지 전부 통과 확인됨.

원칙 (릴리스 기준점 유지): **대규모 리팩터 지양.** 각 항목은 독립 커밋 단위로, 게이트 통과 후 반영한다.

---

## C-0. 운영자 1회 작업 (코드 아님 — 최우선, 선행)

배포된 기능이 운영 데이터 입력을 기다리는 상태다.

- [ ] **D1 마이그레이션 정합**: `SELECT id, applied_at FROM schema_migrations ORDER BY id;`로
      0008/0009/**0010** 적용 확인. 0010(name_ko/hidden)은 런타임 ALTER 보강으로 이미 동작하지만
      migrations 대장과 실제 스키마의 정합을 맞춰야 한다 (런북 4절).
- [ ] **큐레이션 체크리스트 실행**: [shipdb-curation-checklist.md](shipdb-curation-checklist.md) —
      한글명 추가 6척 / 숨김 권장 10척 / 판단 필요 8척을 Admin CMS 함선DB 탭에서 처리.
- [ ] **Admin Erkul preview 1회 실행**: 동기화 리허설의 마지막 미검증 조각(preview→hash 복사 흐름).
- [ ] 배포 사이트 표본 확인: Asgard 카드/모달 설명(Erkul 번역), 구매/렌탈 필터, 어두워진 오렌지 CTA 색감.

## C-1. 검색 색인 정합성 (이번 리뷰에서 발견 — 신규 결함성 개선)

**문제**: `c61cdd5`로 카드·모달 설명이 Erkul 번역 설명으로 통일됐지만, 함선DB 검색(`buildShipSearchText`)과
전역 검색(search-modal)은 여전히 **기존 volt-data 설명(`ship.description`)을 색인**한다.
→ 사용자가 화면에 보이는 설명 문구로 검색하면 안 잡히고, 화면에 없는 legacy 문구로는 잡힌다.

**작업**:
1. `buildShipSearchText`에 live 번역 설명(`VOLT_SHIP_LIVE_STATS[id].descriptions.ko/en`)을 색인 추가
   (legacy 설명도 유지 — 둘 다 잡히게).
2. live 레이어는 지연 로드이므로 로드 완료 시 검색 캐시 무효화(`invalidateSearchCache()` 기존 훅 활용).
3. search-modal 함선 색인도 동일하게 보강.

**완료 기준**: 화면 표시 설명 문구로 함선DB 검색·전역 검색 모두 일치 + 스모크 2개(로드 전/후).
권장 커밋명: `ships: index Erkul translated descriptions in search`

## C-2. main.js 일정/RSVP 렌더 분리 (백로그 1순위)

notices 패턴(`window.VOLT_*` + `init(deps)` + 호출부 무변경 shim) 재적용. 대상: 일정 목록/상세 토글/RSVP
버튼·상태 렌더. innerHTML 래칫 베이스라인은 이동분만큼 재배치(총합 불변).
**완료 기준**: main.js 약 1,850줄 이하, 일정/RSVP 스모크 전부 통과.
권장 커밋명: `refactor: extract schedule renderer from main`

## C-3. Erkul sync 첫 정기 운영 + 주기 결정

런북 7-1절 절차로 **실제 데이터 갱신이 있는** 동기화를 1회 수행(리허설은 변경 0 시나리오였음).
Asgard 대표값이 바뀌면 스모크 기대값 동반 갱신을 실전에서 확인한다.
주기 정책 결정: 수동 격주 권장(게임 패치 직후 +1회). 결정 내용을 런북에 추가.

## C-4. 스크린샷 회귀 도입 → CSS 정리 재개 조건 해제

Playwright `toHaveScreenshot`으로 핵심 8화면(홈/함선DB/모달/공지/일정/정책/플래너/모바일) 기준 이미지 고정.
이것이 갖춰지면 백로그의 **CSS 중복 129건** 속성 단위 병합을 소단위로 재개할 수 있다.
주의: 폰트/애니메이션 안정화(reveal 대기, 폰트 로드 대기) 없이는 플레이크 원인이 되므로 마스킹 전략 포함.

## C-5. 대기 / 낮은 우선순위 (트리거 명시)

| 항목 | 트리거/조건 |
|---|---|
| 신규 함선 보류 8척 재검토 | Erkul sync preview에서 해당 함선 구매처 발생 |
| Hammerhead 가격 모순 정리 | 인게임 실가격 확인 |
| heading-order(moderate) 정돈 | C-2와 묶어 처리 가능 |
| 함선 속성 값 EN화 | EN 완성도 추가 요구 시 |
| Stage B(모듈 setup 지연) | 성능 실측에서 필요성 확인 시 |

---

## 검증 기준 (전 항목 공통)

```
npm run check && npm run test:functions && npm test
```

- `data/volt-data.js` diff 0 (CMS 경유 수정만 허용)
- 런타임 asset 변경 시 캐시 버전 bump, 문서만이면 유지
- 커밋은 C-항목당 1개 원칙, 완료 시 BACKLOG.md 갱신
