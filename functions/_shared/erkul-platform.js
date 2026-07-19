// Erkul 원본 calculatorType → canonical platform 변환 규칙 (PM B-2).
// 직접 필드만 사용(추론 금지): 'vehicle'→'ground'(지상) · 'ship'→'space' · 값 없음→'unknown'.
// 원본에 값이 없는 함선(예: basher)은 임의로 space 처리하지 않고 unknown을 유지한다.
export function toPlatform(calculatorType) {
  if (calculatorType === 'vehicle') return 'ground';
  if (calculatorType === 'ship') return 'space';
  return 'unknown';
}
