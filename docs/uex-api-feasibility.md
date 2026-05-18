# UEX API 프론트 직접 연동 검토

검토일: 2026-05-18

## 결론

VOLT 무역 플래너의 **읽기 전용 MVP 범위**는 백엔드 없이 프론트에서 직접 호출 가능하다.

- `GET /commodities`
- `GET /commodities_prices`

위 두 엔드포인트는 문서상 `Authorization: —`로 표기되어 있고, 실제 무인증 요청도 정상 응답했다.
또한 실제 사전 요청과 GET 응답 모두 `Access-Control-Allow-Origin: *`를 반환해 브라우저 직접 호출이 가능하다.

단, UEX API 전체가 무인증이라는 뜻은 아니다. 문서 홈은 Bearer Token 방식을 기본 정의로 안내한다.
향후 쓰기 엔드포인트, 비공개 엔드포인트, 토큰이 필요한 기능으로 확장하면 프론트 직접 호출은 금지한다.

## 확인 결과

| 항목 | 결과 |
| --- | --- |
| 인증 방식 | API 전체 기본 정의는 Bearer Token |
| API 키 필요 여부 | 이번 MVP에 필요한 공개 GET 엔드포인트는 불필요 |
| 브라우저 직접 호출 | 가능 |
| CORS | 허용 (`Access-Control-Allow-Origin: *`) |
| 호출 제한 | 172,800회/일 또는 120회/분 |
| 응답 구조 | `{ status, http_code, data }` |
| 마지막 업데이트 | 데이터 row에 `date_modified` 제공 |

## MVP 적용 범위

현재 사이트에 추가한 기능:

1. 상품 목록 조회
2. 상품별 최저 매수 후보 / 최고 매도 후보 표시
3. 선택 함선 화물량 기준 예상 수익 계산
4. API 장애 시 fallback 메시지 표시

## 데이터 사용 방식

### `/commodities`

- 상품 목록
- 상품명, 코드, 평균 매수/매도 가격
- `date_modified`
- 캐시 TTL: 1시간

### `/commodities_prices`

- 상품별 터미널 매수/매도 후보
- `price_buy`, `price_sell`
- 위치명
- `date_modified`
- 캐시 TTL: 30분

## 직접 호출을 유지해도 되는 조건

- 공개 GET 엔드포인트만 사용
- 호출 수가 작고, 사용자가 직접 조회할 때만 요청
- 브라우저에서 API 키를 절대 다루지 않음
- API 응답 장애 시 기존 외부 도구 안내로 자연스럽게 fallback

## 프록시가 필요한 시점

다음 중 하나라도 해당하면 Cloudflare Worker 또는 Pages Function으로 전환한다.

1. API 키가 필요한 엔드포인트를 사용한다.
2. 호출량이 늘어 120회/분 제한에 가까워진다.
3. 응답을 더 오래 캐싱하거나 정규화해야 한다.
4. 여러 엔드포인트를 조합해 서버 쪽에서 계산해야 한다.
5. CORS 정책이 변경된다.

## 프록시 설계안

```text
브라우저
  → /api/uex/commodities
  → /api/uex/commodities/:id/prices

Cloudflare Worker / Pages Function
  → UEX API 호출
  → 필요한 필드만 정규화
  → Cache API 또는 KV에 TTL 캐시
  → 프론트에는 정제된 JSON만 반환
```

### 환경변수

```text
UEX_API_TOKEN
```

토큰이 필요한 순간부터는 Worker 환경변수에만 저장하고, 프론트 번들·HTML·JS에는 절대 넣지 않는다.

## 참고

- UEX API 홈: `https://uexcorp.space/api/documentation/id/home`
- 상품 목록: `https://uexcorp.space/api/documentation/id/get_commodities`
- 상품 가격: `https://uexcorp.space/api/documentation/id/get_commodities_prices`
- 상품 경로: `https://uexcorp.space/api/documentation/id/get_commodities_routes`
