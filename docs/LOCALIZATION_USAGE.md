# Star Citizen 한국어 로컬라이징 활용 기준

VOLT 사이트의 UEX 상품 한글 표기는 Star Citizen LIVE 클라이언트의 한국어 로컬라이징 파일을 기준으로 관리합니다.

## 기준 파일

```text
D:/Roberts Space Industries/StarCitizen/LIVE/data/Localization/korean_(south_korea)/global.ini
```

이 파일은 UTF-8 BOM 형식의 `key=value` 로컬라이징 사전입니다. 상품명은 주로 `items_commodities_*` 키에 들어 있습니다.

예:

```ini
items_commodities_gold=금
items_commodities_medicalSupplies=의약용품
items_commodities_distilledSpirits=증류주
```

## 사이트 반영 방식

- `js/main.js`의 `UEX_COMMODITY_TRANSLATIONS`에 상품명 번역을 정적 사전으로 포함합니다.
- UEX API 응답은 수정하지 않습니다.
- UEX 상품명은 영문명을 기준으로 유지하고, 한국어 패치 표기는 `Gold / 금` 형식으로 병기합니다.
- 검색은 영문명, 한국어명, 코드, 카테고리를 모두 대상으로 합니다.

## 갱신 방법

Star Citizen 패치 후 `global.ini`가 바뀌면 아래 스크립트로 상품명 사전을 다시 추출할 수 있습니다.

```powershell
node scripts/extract-sc-commodity-translations.js "D:/Roberts Space Industries/StarCitizen/LIVE/data/Localization/korean_(south_korea)/global.ini"
```

출력된 `UEX_COMMODITY_TRANSLATIONS` 객체를 `js/main.js`의 기존 객체와 비교 후 교체합니다.

## 주의사항

- `%s`, `%ls`, `{0}` 같은 치환 변수가 있는 문자열은 상품명 사전에 사용하지 않습니다.
- `_desc`, `_des`, `Desc`로 끝나는 설명문 키는 제외합니다.
- 너무 긴 문장형 값은 상품명이 아니므로 제외합니다.
- 한국어 패치 파일은 런처 업데이트로 변경될 수 있으므로, 사이트에는 필요한 결과만 정적으로 반영합니다.
