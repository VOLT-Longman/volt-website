# ShipDB 2.0 함선 설명 한국어 번역 (A-9)

KO 모드의 함선 설명을 기존 VOLT 큐레이션 설명 대신 **Erkul live 영어 설명의 한국어 번역본**으로 교체했다.
`volt-data.js`의 기존 설명은 삭제하지 않고 legacy fallback으로 유지된다.

## 설명 표시 우선순위 (A-9 이후)

| 모드 | 1순위 | 2순위 (fallback) |
|---|---|---|
| KO | `liveStats.descriptions.ko` (Erkul EN 번역본) | 기존 `ship.description` (volt-data) |
| EN | `liveStats.descriptions.en` (Erkul 정제 영어) | 기존 `ship.description_en` (ship-en.js) |

- live 레이어에 없는 함선(미출시 30척, 에디션 변형 7척)은 자동으로 기존 설명이 표시된다.
- 함선 카드의 짧은 설명은 기존 volt-data 설명을 그대로 사용한다 (모달만 변경).

## 번역 정책

- 자연스러운 한국어, 공식 소개문 톤(존댓말 서술형). 과도한 의역 금지.
- 원문에 없는 정보/수치 추가 금지. 제조사명·함선명·고유명사는 영문 유지.
- 원문이 고유명사뿐인 경우(예: `gladius-pirate-edition`의 "Aegis Gladius Pirate")는 그대로 둔다.
- Erkul 영어 설명이 없는 함선은 임의 생성하지 않고 리포트에 기록 후 legacy fallback (현재 0척 — 210척 전부 EN 보유).
- **KO 자동 번역기 사용 금지** — 번역본은 검수 가능한 정적 테이블로 관리한다.

## 데이터 구조

- 번역 테이블: [data/external/erkul/ship-descriptions-ko.json](../data/external/erkul/ship-descriptions-ko.json)
  ```json
  { "translations": { "<voltId>": { "ko": "...", "sourceEnHash": "sha256 앞 16자" } } }
  ```
- 적용 결과: `data/ship-live-stats.js`의 `descriptions`가 확장된다.
  ```js
  descriptions: { source, enRaw, en, ko, koSource: "translated-from-erkul-en", translatedAt }
  ```
- 적용 리포트: [data/external/erkul/description-translation-report.json](../data/external/erkul/description-translation-report.json)

## 향후 Erkul sync 시 번역 갱신 절차

1. Safe Apply(`npm run shipdb:erkul:apply`)로 레이어를 갱신하면 `descriptions.en`이 최신화되고
   `ko`/`koSource`는 apply가 다시 만든 entry에는 없으므로, apply 직후 반드시 재적용한다:
   ```bash
   npm run shipdb:erkul:translate-descriptions
   ```
2. 이 스크립트는 `sourceEnHash`를 현재 `en`과 비교해서:
   - 일치 → 기존 번역 재적용
   - 불일치(Erkul 원문 변경) → **stale로 분류하고 적용하지 않음** → 리포트의 `staleTranslation` 확인 후
     해당 함선만 번역을 갱신하고 테이블의 `sourceEnHash`를 새 hash로 교체한다.
3. stale/누락 함선은 KO 모드에서 기존 VOLT 설명으로 자동 폴백되므로 사이트가 깨지지 않는다.

## 남은 과제

- 번역 품질 커뮤니티 검수 (특히 무기/군사 용어 표현)
- 신규 함선 추가 트랙(별도 마일스톤)에서 번역 테이블 확장
