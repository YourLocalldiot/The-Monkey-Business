// Loading screen. Loaded (not deferred) in the <head> of every page.
//
// If the page hasn't finished loading (its images, scripts, styles) after a
// moment, a full-screen loading screen with a looping animation covers it, and
// it fades away once everything has loaded and the fonts are ready. A page
// that loads quickly never shows it, so it doesn't flash. The look is in
// css/styles.css ("Loading screen"); the text is in assets/js/i18n-strings.js.
(function () {
  var SHOW_AFTER = 150;     // ms: only show it if loading takes longer than this
  var MIN_VISIBLE = 600;    // ms: once shown, stay long enough to be read, not flicker
  var GIVE_UP_AFTER = 12000; // ms: never leave a page covered for ever

  var root = document.documentElement;
  var overlay = null;
  var shownAt = 0;
  var finished = false;

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function show() {
    if (finished || overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'loader';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');

    var stage = document.createElement('div');
    stage.className = 'loader-stage';
    var ring = document.createElement('span');
    ring.className = 'loader-ring';
    var mark = document.createElement('img');
    mark.className = 'loader-mark';
    mark.src = 'assets/images/logo-mark.png';
    mark.alt = '';
    stage.appendChild(ring);
    stage.appendChild(mark);

    var title = document.createElement('p');
    title.className = 'loader-title';
    title.textContent = t('loader.title');
    var sub = document.createElement('p');
    sub.className = 'loader-sub';
    sub.textContent = t('loader.sub');

    overlay.appendChild(stage);
    overlay.appendChild(title);
    overlay.appendChild(sub);
    root.appendChild(overlay);
    root.classList.add('is-loading');
    shownAt = Date.now();
  }

  function hide() {
    if (finished) return;
    finished = true;
    if (!overlay) return;
    var wait = Math.max(0, MIN_VISIBLE - (Date.now() - shownAt));
    setTimeout(function () {
      overlay.classList.add('is-hiding');
      root.classList.remove('is-loading');
      setTimeout(function () {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 400);
    }, wait);
  }

  function done() {
    // everything has loaded; the fonts too, so the text doesn't jump afterwards
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fonts.then(hide, hide);
  }

  if (document.readyState === 'complete') {
    done();
    return;
  }
  setTimeout(show, SHOW_AFTER);
  window.addEventListener('load', done);
  setTimeout(hide, GIVE_UP_AFTER);
})();
