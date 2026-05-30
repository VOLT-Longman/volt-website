(function initVoltTheme() {
  try {
    var storedTheme = localStorage.getItem('volt-theme');
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    var theme = storedTheme || (prefersLight ? 'light' : 'dark');
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  } catch (error) {
    document.documentElement.removeAttribute('data-theme');
  }
})();
