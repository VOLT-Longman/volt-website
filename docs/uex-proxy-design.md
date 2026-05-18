# UEX API 프록시 설계 초안

## 목표

현재 프론트 직접 호출 MVP를 다음 단계에서 아래 구조로 안정화한다.

```text
브라우저
  → /api/uex/*
  → Cloudflare Pages Function 또는 Worker
  → UEX API
```

## 왜 프록시가 필요한가

1. CORS 정책 변경 리스크를 줄인다.
2. 호출량이 늘어날 때 서버 측 캐싱을 통제할 수 있다.
3. UEX 원본 응답을 VOLT에 필요한 구조로 정규화할 수 있다.
4. 장애 시 fallback 응답을 일관되게 만들 수 있다.
5. 향후 API 키가 필요한 엔드포인트를 써도 프론트에 비밀을 노출하지 않는다.

## 권장 엔드포인트

```text
GET /api/uex/commodities
GET /api/uex/commodities/:id/prices
```

## 프록시 응답 예시

```json
{
  "ok": true,
  "data": [],
  "meta": {
    "source": "uex",
    "cached": true,
    "ttlSeconds": 1800,
    "fetchedAt": "2026-05-18T00:00:00.000Z"
  }
}
```

## 캐시 정책

| 데이터 | TTL |
| --- | --- |
| 상품 목록 | 1시간 |
| 가격 후보 | 30분 |

## 장애 처리

```text
UEX 정상
  → 정규화된 JSON 반환

UEX 실패 + 캐시 존재
  → stale 캐시 반환 + meta.stale = true

UEX 실패 + 캐시 없음
  → 503 + 사용자 친화적 메시지
```

## 환경변수

```text
UEX_API_BASE_URL
UEX_API_TOKEN
```

`UEX_API_TOKEN`은 필요한 시점에만 추가한다. 프론트 코드에는 절대 포함하지 않는다.

## 전환 기준

다음 중 하나라도 충족하면 직접 호출에서 프록시로 전환한다.

1. API 키가 필요한 기능을 붙인다.
2. 분당 호출량이 제한의 50%를 꾸준히 넘는다.
3. 원본 응답 구조 변경 대응이 잦아진다.
4. 가격 데이터 정규화나 서버 측 계산이 필요해진다.
5. CORS 정책이 변경된다.

## 1차 구현 순서

1. Pages Function에 `/api/uex/commodities` 추가
2. `/api/uex/commodities/:id/prices` 추가
3. Cache API 적용
4. 프론트의 `UEX_API_BASE_URL`을 `/api/uex`로 교체
5. 장애/캐시 상태를 UI에 표시
