(function initVoltTheme() {
  'use strict';

  // VOLT는 다크 전용이다 (F-2). 과거 사용자의 volt-theme=light 저장값은
  // 라이트 CSS가 제거되어 의미가 없으므로 흔적을 지운다.
  try {
    localStorage.removeItem('volt-theme');
  } catch (_error) {
    // localStorage 접근 실패(프라이빗 모드 등)는 테마 고정에 영향 없음
  }

  document.documentElement.setAttribute('data-theme', 'dark');
})();
