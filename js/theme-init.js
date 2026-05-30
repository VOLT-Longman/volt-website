(function initVoltTheme() {
  try {
    var theme = localStorage.getItem('volt-theme');
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (error) {
    document.documentElement.removeAttribute('data-theme');
  }
})();
