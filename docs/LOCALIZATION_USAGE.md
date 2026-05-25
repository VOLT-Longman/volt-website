# Star Citizen 한국어 패치 데이터 활용 기준

VOLT 사이트는 Star Citizen 한국어 패치 데이터를 원문 대체 데이터로 사용하지 않습니다. RSI/UEX 원문명을 기준값으로 유지하며, 한국어 패치 표기는 한국 유저의 이해를 돕기 위한 표시/검색 보조 레이어로만 사용합니다.

## 원천 파일

```text
D:/Roberts Space Industries/StarCitizen/LIVE/data/Localization/korean_(south_korea)/global.ini
```

`global.ini` 전체는 약 9만 줄 규모이므로 사이트에 직접 포함하지 않습니다. 필요한 키만 추출해 `data/volt-localization.js`에 경량 매핑으로 반영합니다.

## 사이트 반영 파일

- `data/volt-localization.js`: 런타임 표시/검색 보조 사전
- `tools/extract-localization.js`: `global.ini`에서 후보 키를 추출하는 검토용 스크립트

## 사용 범위

1. UEX 위치/터미널 한글 병기
   - 예: `Area18 / 에어리어 18 · TDD / 무역개발부`
   - 번역값이 없으면 기존 영문만 표시합니다.

2. 함선DB 및 무역플래너 검색 alias
   - 함선 표시명은 영어 원문을 유지합니다.
   - 한국어 패치 표기나 커뮤니티 별칭은 검색 보조어로만 사용합니다.

3. UEX 상품명 병기와 추천 무역품 설명
   - 상품명은 `Gold / 금`처럼 병기합니다.
   - 설명은 추천 후보 상품 위주로 짧게 유지합니다.

4. 무역가이드 용어집
   - `Commodity / 무역품`, `TDD / 무역개발부`처럼 신규 유저가 자주 보는 용어만 제공합니다.

5. 전체검색 보강
   - 한국어 패치 표기와 alias를 검색 인덱스에만 포함합니다.
   - 검색 결과 제목은 기존 사이트의 원문/섹션명을 유지합니다.

## 추출 기준

- `items_commodities_*`: 상품명 후보
- `items_commodities_*_desc`: 설명문 후보. 전수 반영하지 않고 추천 상품만 검토합니다.
- 위치/터미널/함선명은 자동 추출 후보를 만든 뒤 수동 검수합니다.
- 치환 변수(`%s`, `%ls`, `{0}`)가 포함된 문장은 사전에 넣지 않습니다.
- 긴 문장형 값은 표시명 사전에서 제외합니다.

## 갱신 절차

1. Star Citizen 패치 후 새 `global.ini`를 확인합니다.
2. 아래 명령으로 후보 사전을 추출합니다.

```powershell
node tools/extract-localization.js "D:/Roberts Space Industries/StarCitizen/LIVE/data/Localization/korean_(south_korea)/global.ini"
```

3. 출력 결과를 검토해 `data/volt-localization.js`에 필요한 항목만 반영합니다.
4. 원문명, 한글명, 검색 alias가 기존 UI를 깨지 않는지 QA합니다.
5. 캐시 버전을 갱신합니다.

## fallback 정책

- `window.VOLT_LOCALIZATION`이 없어도 사이트는 기존 영문 표시로 동작해야 합니다.
- 특정 항목의 번역값이 없으면 기존 RSI/UEX 원문명을 그대로 표시합니다.
- 한국어 패치 표기는 편의 레이어이며, 계산·매칭 기준값으로 사용하지 않습니다.
