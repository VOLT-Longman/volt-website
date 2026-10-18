# 함선DB 영구 제외 정책

2026-10-18 소유자 요청: 공식 이미지 검토에서 보류된 다음 8개 항목을 활성 함선DB에서 제거한다. 단순 CMS 숨김이 아니라 canonical·표시·번역·구매/렌탈·실시간 스펙 데이터에서 제외한다.

| 영구 제외 ID | 표시명 |
| --- | --- |
| 600i-executive-edition | 600i Executive Edition |
| caterpillar-pirate | Caterpillar Pirate |
| constellation-phoenix-emerald | Constellation Phoenix Emerald |
| dragonfly-star-kitten | Dragonfly Star Kitten |
| f7c-m-hornet-heartseeker-mk-ii | F7C-M Hornet Heartseeker Mk II |
| f8a-lightning | F8A Lightning |
| gladius-dunlevy | Gladius Dunlevy |
| nautilus-solstice-edition | Nautilus Solstice Edition |

## 다음 패치에서도 복원 금지

- 권위 목록은 `functions/_shared/ship-catalog-policy.js`다. canonical ID·정확한 이름·Erkul localName·원본 ref UUID를 대조한다. 기본형이나 유사 이름에 부분 일치시키지 않는다.
- Erkul live 생성, Safe Apply 미리 보기/반영, 검토된 카탈로그 재조정, RSI 공식 카탈로그 생성, 신규 후보 분류에 동일한 정책을 적용한다. 이름이나 내부 ID가 바뀌어도 알려진 원본 식별자가 일치하면 제외한다.
- 이전 승인 목록·원본 스냅샷에 남아 있어도 재추가하지 않는다. 신규 후보 보고서에는 영구 제외로 명시한다. 복원에는 소유자의 새로운 명시적 승인이 필요하다.
- 자동 검사에서 활성 데이터에 8개 항목이 없고, 현재 유지된 246개 항목의 검증된 이미지가 정확히 연결되는지 확인한다. 과거 제외 항목을 재주입하는 Safe Apply·재조정 테스트도 유지한다.
- 이후 처음 등장하는 함선을 사진이 없다는 이유만으로 자동 삭제하지 않는다. 이번 정책의 대상은 위 8개 항목으로 한정한다.

## 보존 범위

원본 수집 자료·과거 승인 및 감사 기록은 증거로 보존한다. 개인 격납고 등 사용자 데이터는 삭제하지 않는다. 제외 항목은 선택·비교·플래너에 사용하는 활성 카탈로그에서 제거되며, 나머지 함선의 기존 CMS 숨김 설정도 유지한다.

활성 데이터는 Erkul 217개 + RSI 공식 29개 = 246개다. 실제 공개 목록 수는 별도 CMS 숨김 설정에 따라 더 적을 수 있다.
