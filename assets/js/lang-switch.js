// The language switch, on every page. It shows the language the page is in now
// ("English" or "Tiếng Việt"); pressing it changes to the other one and reloads
// the page (assets/js/i18n.js). A signed-in player's choice is also saved on
// their account (profiles.language), so it follows them to other devices.
//
// Loaded, deferred, by every page. Where it appears is decided here:
//   - the top bar of the quiz and video pages: a pill at the end of the bar
//   - the login, sign-up and password pages: a pill above the logo, at the right
//   - pages with the navigation sidebar: the first item of its lower group (on
//     a phone, a tab in the bottom bar; with the sidebar collapsed, a small
//     badge with the language's code)
//
// A page can ask to be told before the language changes:
//   LangSwitch.beforeChange = async function (nextLang) { return true; }   // false = stay
// (the quiz page uses it to warn that changing language restarts a run).
// The look is in css/styles.css ("Language switch").
(function () {
  var NAMES = { en: 'English', vi: 'Tiếng Việt' };
  var CODES = { en: 'EN', vi: 'VI' };
  // static markup: a globe
  var GLOBE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5c2.6 2.6 4 5.9 4 9.5s-1.4 6.9-4 9.5c-2.6-2.6-4-5.9-4-9.5s1.4-6.9 4-9.5z"/></svg>';

  var api = { beforeChange: null };
  var busy = false;

  function otherLang() { return window.I18N.lang === 'vi' ? 'en' : 'vi'; }

  // Signed in: keep the choice on the account too. Never holds the switch up for long.
  async function remember(next) {
    if (!window.sb) return;
    var save = (async function () {
      var session = (await window.sb.auth.getSession()).data.session;
      if (!session) return;
      var saved = await window.sb.from('profiles').update({ language: next }).eq('id', session.user.id);
      if (saved.error) console.warn('lang-switch.js: could not save the language on the account', saved.error);
    })();
    await Promise.race([save.catch(function () {}), new Promise(function (resolve) { setTimeout(resolve, 1500); })]);
  }

  async function change() {
    if (busy) return;
    busy = true;
    try {
      var next = otherLang();
      if (typeof api.beforeChange === 'function' && !(await api.beforeChange(next))) return;
      await remember(next);
      window.I18N.setLang(next);
    } finally {
      busy = false;
    }
  }

  function span(className, text) {
    var node = document.createElement('span');
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // variant: 'pill' (top bars, auth pages) or 'nav' (the sidebar)
  function build(variant) {
    var now = window.I18N.lang;
    var next = otherLang();
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'lang-switch lang-switch--' + variant + (variant === 'nav' ? ' nav-item' : '');
    var label = window.I18N.t('lang.switchTo', { current: NAMES[now], language: NAMES[next] });
    button.setAttribute('aria-label', label);
    button.title = label;

    var globe = span('lang-switch-globe');
    globe.innerHTML = GLOBE;
    button.appendChild(globe);
    button.appendChild(span('lang-switch-name', NAMES[now]));
    button.appendChild(span('lang-switch-code', CODES[now]));
    button.addEventListener('click', change);
    return button;
  }

  function mount() {
    if (document.querySelector('.lang-switch')) return;

    var bar = document.querySelector('.video-bar');
    if (bar) {
      bar.appendChild(build('pill'));
      return;
    }
    var shell = document.querySelector('.auth-shell');
    if (shell) {
      var row = document.createElement('div');
      row.className = 'lang-row';
      row.appendChild(build('pill'));
      shell.insertBefore(row, shell.firstChild);
      return;
    }
    var account = document.querySelector('.sidebar-account');
    if (account) account.insertBefore(build('nav'), account.firstChild);
  }

  document.addEventListener('DOMContentLoaded', mount);
  window.LangSwitch = api;
})();
