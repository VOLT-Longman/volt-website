(function initVoltTheme() {
  try {
    // 저장된 선택이 없으면 시스템 설정과 무관하게 다크 모드가 기본.
    var storedTheme = localStorage.getItem('volt-theme');
    if (storedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  } catch (error) {
    document.documentElement.removeAttribute('data-theme');
  }
})();
