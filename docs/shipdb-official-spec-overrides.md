# ShipDB 공식 사양 보정 정책

Erkul live 데이터는 ShipDB의 기본 사실원이다. 다만 최신 Erkul 값이 RSI가 직접 공개한 기술 사양과 충돌할 때에는, 이 문서의 절차를 통과한 필드 단위 예외만 적용한다.

## 현재 승인 예외

| 함선 | 필드 | Erkul live | 적용값 | 공식 근거 | 확인일 |
| --- | --- | ---: | ---: | --- | --- |
| Crusader Intrepid | cargoScu | 0 SCU | 8 SCU | [RSI Intrepid 소개](https://robertsspaceindustries.com/en/comm-link/transmission/20175-Crusader-Intrepid), [RSI 기술 사양 PDF](https://media.robertsspaceindustries.com/ynrkfgcqcb999/source.pdf) | 2026-07-19 |

실제 보정값과 기계 검증 가능한 출처 메타데이터는 [official-spec-overrides.json](../data/canonical/official-spec-overrides.json)에 있다.

## 추가 절차

1. RSI 공식 도메인의 공개 사양을 확보한다.
2. 충돌하는 필드와 확인일을 기록한다.
3. 허용 필드 목록에 없는 값은 별도의 계약·테스트 승인 없이는 넣지 않는다.
4. canonical 재생성 후, Erkul 기본값과 승인 예외 외의 차이가 없는지 CI로 검증한다.
