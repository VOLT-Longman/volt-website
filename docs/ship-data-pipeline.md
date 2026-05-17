# 함선 데이터 소스 운영 방식

VOLT 함선 DB는 두 층으로 관리합니다.

1. **공식 원본 데이터**
   - 출처: RSI Ship Matrix API
   - 저장 위치: `data/rsi-ship-matrix-index.json`
   - 용도: 제조사, 공식 명칭, 승무원, 화물, 크기, 구현 상태, 공식 상세 URL 같은 기준값

2. **VOLT 편집 데이터**
   - 저장 위치: `data/volt-data.js`
   - 용도: 한국어 역할명, VOLT식 태그, 설명문, 운영상 분류

3. **USD 가격 스냅샷**
   - 저장 위치: `data/ship-prices-usd.json`
   - 용도: RSI Ship Matrix가 제공하지 않는 USD 기준 가격 보강
   - 원칙: 가격이 없는 함선은 억지로 추정하지 않고 `미공개`로 표시

공식 데이터를 그대로 덮어쓰지 않는 이유는, RSI 기준 필드와 VOLT가 실제로 보여주고 싶은 분류가 다르기 때문입니다. 예를 들어 RSI는 `focus`를 영어로 제공하지만, VOLT 사이트에서는 `탐사`, `인양`, `물류`처럼 한국어 중심의 탐색 경험이 더 중요합니다.

## 동기화 방법

```bash
node scripts/sync-rsi-ship-matrix.mjs
node scripts/sync-ship-prices.mjs
node scripts/normalize-ship-database.mjs
```

이 명령은 RSI 공식 Ship Matrix 응답을 다시 받아 `data/rsi-ship-matrix-index.json`에 저장합니다.

## 현재 적용 원칙

- 공식 상세 링크가 있는 함선은 `rsiUrl`에 정확한 공식 URL을 저장합니다.
- 공식 데이터에 없는 함선은 기존처럼 Ship Matrix 메인으로 안전하게 폴백합니다.
- 한국어 설명과 태그는 자동 생성하지 않고, 사이트 운영자가 계속 검수합니다.
- 화면 필터는 `focus`를 주 분류, `tags`를 보조 분류로 사용해 같은 단어가 반복되지 않게 유지합니다.

## 다음 단계

- 공식 원본과 VOLT 편집 데이터를 병합하는 생성 스크립트 추가
- 이름이 다른 함선(`Zeus Mk II`, `Aurora Mk I` 등)을 위한 별칭 테이블 분리
- 공식 수치와 VOLT 수치가 다를 때 변경 내역을 보여주는 검증 리포트 추가
