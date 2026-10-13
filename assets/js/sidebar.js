// Expand / collapse button for the navigation sidebar (the bottom tab bar on
// a phone). Loaded, not deferred, in the <head> of every page that has a
// sidebar, so the remembered state is on <html> before anything is drawn and
// the sidebar never visibly jumps. The CSS for both states is in
// css/styles.css ("Sidebar: expand / collapse").
(function () {
  var KEY = 'sidebar';
  var root = document.documentElement;

  function saved() {
    try { return localStorage.getItem(KEY) === 'collapsed'; } catch (e) { return false; }
  }

  function remember(collapsed) {
    try { localStorage.setItem(KEY, collapsed ? 'collapsed' : 'expanded'); } catch (e) {}
  }

  function set(collapsed) {
    if (collapsed) root.setAttribute('data-sidebar', 'collapsed');
    else root.removeAttribute('data-sidebar');
  }

  set(saved());

  document.addEventListener('DOMContentLoaded', function () {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // On a laptop the collapsed sidebar is icons only, so give every link a
    // tooltip. Their text is already translated by now (each page calls
    // I18N.apply() at the end of <body>).
    sidebar.querySelectorAll('.nav-item, .login-btn').forEach(function (link) {
      var label = link.textContent.replace(/\s+/g, ' ').trim();
      if (label && !link.hasAttribute('title')) link.setAttribute('title', label);
    });

    var t = window.I18N ? window.I18N.t : function (key) { return key; };
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-toggle';
    button.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

    function refresh() {
      var collapsed = root.getAttribute('data-sidebar') === 'collapsed';
      var label = t(collapsed ? 'nav.expand' : 'nav.collapse');
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    }

    button.addEventListener('click', function () {
      var collapsed = root.getAttribute('data-sidebar') !== 'collapsed';
      set(collapsed);
      remember(collapsed);
      refresh();
    });

    refresh();
    sidebar.appendChild(button);
  });
})();
