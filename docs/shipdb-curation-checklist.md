# 함선DB 큐레이션 체크리스트 (B안 실행용)

관리자 CMS(`/admin/` → 함선DB 탭)에서 아래 항목을 처리한다. 모든 변경은 D1 `ship_overrides`에
저장되며 정적 `data/volt-data.js`는 건드리지 않는다. 되돌리기는 "원본으로 되돌리기" 또는
숨김 해제로 언제든 가능.

- **시장 데이터 기준**: Erkul `ship-market.js`의 구매처(buy)/렌탈(rent) 행 수. 2026-07-06 기준.
- **적용 방법**:
  - 한글명 추가 → 함선 선택 후 **한글 함선명 (KO)** 칸에 입력 → 저장.
  - 숨김 → 함선 선택 후 **삭제(사이트에서 숨김)** 버튼(또는 숨김 체크박스) → 저장.
- 참고: 상세필터의 **"인게임 구매/렌탈 가능"** 토글을 켜면 숨김과 무관하게 시장 있는 함선만 볼 수 있다.
  (숨김은 영구 큐레이션, 필터는 사용자 옵션 — 목적이 다름.)

---

## 그룹 1 — 한글명 추가 (인게임 획득 가능 + 한글명 없음)

시장이 있어 실제로 구매/렌탈 가능한데 한글명이 비어 KO 모드에서 영문으로 노출되는 함선.
**한글명 제안은 기존 표기 규약(제조사 + 음역) 기반이며 반드시 검토 후 확정한다.**

| # | ship_id | 영문명 | 시장 | 한글명 제안(검토 필요) |
|---|---------|--------|------|------------------------|
| ☐ | `600i-explorer` | 600i Explorer | 구매1·렌탈1 | 오리진 600i 익스플로러 |
| ☐ | `ares-inferno` | Ares Inferno | 구매1 | 크루세이더 아레스 인페르노 |
| ☐ | `ares-ion` | Ares Ion | 구매1 | 크루세이더 아레스 이온 |
| ☐ | `c8r-pisces` | C8R Pisces | 구매1·렌탈2 | 앤빌 C8R 파이시스 |
| ☐ | `dragonfly-black` | Dragonfly Black | 구매4·렌탈3 | 드레이크 드래곤플라이 블랙 |
| ☐ | `mercury` | Mercury | 구매1 | 크루세이더 머큐리 스타러너 |

---

## 그룹 2 — 숨김 권장 (스킨 / 에디션 / 번들 / 중복)

base 선체의 페인트 스킨·리미티드 에디션·스토어 번들로, 인게임 구매·렌탈이 모두 0.
목록을 어지럽히고 사용자가 실제로 획득할 수 없어 **숨김 권장**.

| # | ship_id | 영문명 | 성격 | 현재 한글명 |
|---|---------|--------|------|-------------|
| ☐ | `anvil-ballista-dunestalker` | Anvil Ballista Dunestalker | 발리스타 스킨 | 앤빌 발리스타 듄스토커 |
| ☐ | `anvil-ballista-snowblind` | Anvil Ballista Snowblind | 발리스타 스킨 | 앤빌 발리스타 스노우블라인드 |
| ☐ | `dragonfly-yellowjacket` | Dragonfly Yellowjacket | 드래곤플라이 스킨 | 드레이크 드래곤플라이 옐로우재킷 |
| ☐ | `argo-mole-carbon-edition` | Argo Mole Carbon Edition | 몰 에디션 | (없음) |
| ☐ | `argo-mole-talus-edition` | Argo Mole Talus Edition | 몰 에디션 | (없음) |
| ☐ | `valkyrie-liberator-edition` | Valkyrie Liberator Edition | 발키리 에디션 | (없음) |
| ☐ | `nautilus-solstice-edition` | Nautilus Solstice Edition | 노틸러스 에디션 | (없음) |
| ☐ | `mustang-alpha-vindicator` | Mustang Alpha Vindicator | 머스탱 변형 | (없음) |
| ☐ | `carrack-w-c8x` | Carrack w/C8X | 번들(C8X 포함) | (없음) |
| ☐ | `carrack-expedition-w-c8x` | Carrack Expedition w/C8X | 번들(C8X 포함) | (없음) |

---

## 그룹 3 — 숨김 여부 판단 필요 (콘셉트 / 미출시 / 특수 변형)

스킨은 아니지만 인게임 구매·렌탈이 0인 함선. 콘셉트/미출시라 "못 구하는 것"에 해당하나,
카탈로그 열람 가치가 있어 **숨길지 남길지는 운영 판단**. (남긴다면 그룹 1처럼 한글명만 보강 권장.)

| # | ship_id | 영문명 | 비고 |
|---|---------|--------|------|
| ☐ | `aurora-mk1-se` | Aurora Mk1 SE | 오로라 스타터 변형 |
| ☐ | `f7c-m-super-hornet-heartseeker-mk-i` | F7C-M Super Hornet Heartseeker Mk I | 슈퍼호넷 변형 |
| ☐ | `gladius-pirate-edition` | Gladius Pirate Edition | 글레디우스 에디션 |
| ☐ | `genesis` | Genesis | 콘셉트(스타라이너) |
| ☐ | `orion` | Orion | 콘셉트(채굴) |
| ☐ | `ranger-cv` | Ranger CV | 미출시 변형 |
| ☐ | `ranger-rc` | Ranger RC | 미출시 변형 |
| ☐ | `zeus-mk2-mr` | Zeus MK2 MR | 미출시 변형(ES·CL은 한글명 보유) |

---

### 요약
- 한글명 추가: **6척**(그룹 1).
- 숨김 권장: **10척**(그룹 2).
- 판단 필요: **8척**(그룹 3).
- 그룹 2를 모두 숨기면 공개 함선 수 247 → 237. 그룹 3까지 숨기면 229.
