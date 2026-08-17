(function () {
  function resolveTheme() {
    var stored = null;
    try { stored = localStorage.getItem('theme'); } catch (e) {}
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
      try { localStorage.setItem('theme', theme); } catch (e) {}
    }
    document.querySelectorAll('.theme-switch button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.themeChoice === theme ? 'true' : 'false');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(resolveTheme(), false);

    document.querySelectorAll('.theme-switch button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(btn.dataset.themeChoice, true);
      });
    });
  });
})();
