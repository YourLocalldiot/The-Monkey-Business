// Two-language support (English / Vietnamese).
//
// Loaded in every page's <head> right after assets/js/i18n-strings.js, so it
// runs before anything is drawn. Three jobs:
//
//   1. Work out the language: the saved choice (localStorage 'lang', set from
//      the Profile page or from the signed-in user's profile), else the
//      browser's language, else English.
//   2. Translate static text. Elements carry data-i18n="key" (their own text
//      is replaced) and/or data-i18n-<attr>="key" for placeholder, aria-label,
//      title, alt and content. Each page calls I18N.apply() as the last thing
//      in <body>. English is what's already written in the HTML, so nothing
//      is touched for English.
//   3. Avoid a flash of English: for any other language the page is hidden
//      (see .i18n-pending in styles.css) until apply() has run. A timeout
//      reveals it anyway if something goes wrong.
//
// Scripts that build text themselves call I18N.t('key', { name: value }).
// Text that lives in the database uses I18N.pick(vietnamese, english).
// Keys live in assets/js/i18n-strings.js; scripts/check-i18n.py checks them.
(function () {
  var STRINGS = window.TMB_STRINGS || { en: {}, vi: {} };
  var SUPPORTED = ['en', 'vi'];
  var STORAGE_KEY = 'lang';
  var ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt', 'content'];
  var root = document.documentElement;

  function stored() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED.indexOf(value) !== -1 ? value : null;
    } catch (e) {
      return null;
    }
  }

  function detect() {
    var saved = stored();
    if (saved) return saved;
    var browser = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    return /^vi\b/i.test(browser) ? 'vi' : 'en';
  }

  var lang = detect();
  root.lang = lang;
  if (lang !== 'en') root.classList.add('i18n-pending');

  function reveal() {
    root.classList.remove('i18n-pending');
  }
  setTimeout(reveal, 1500);   // safety net: never leave a page hidden

  function t(key, vars) {
    var text = STRINGS[lang] && STRINGS[lang][key];
    if (text === undefined || text === null) text = STRINGS.en[key];
    if (text === undefined || text === null) text = key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (whole, name) {
      return vars[name] === undefined ? whole : vars[name];
    });
  }

  // Replaces an element's own text (its first non-blank text node) and
  // leaves child elements such as icons alone.
  function setOwnText(el, text) {
    for (var node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3 && node.nodeValue.trim() !== '') {
        node.nodeValue = node.nodeValue.match(/^\s*/)[0] + text + node.nodeValue.match(/\s*$/)[0];
        return;
      }
    }
    el.insertBefore(document.createTextNode(text), el.firstChild);
  }

  function apply(scope) {
    scope = scope || document;
    if (lang !== 'en') {
      scope.querySelectorAll('[data-i18n]').forEach(function (el) {
        setOwnText(el, t(el.getAttribute('data-i18n')));
      });
      ATTRIBUTES.forEach(function (attribute) {
        var marker = 'data-i18n-' + attribute;
        scope.querySelectorAll('[' + marker + ']').forEach(function (el) {
          el.setAttribute(attribute, t(el.getAttribute(marker)));
        });
      });
    }
    reveal();
  }

  // Saves a language without reloading. Returns true if it was stored.
  function store(next) {
    if (SUPPORTED.indexOf(next) === -1) return false;
    try {
      localStorage.setItem(STORAGE_KEY, next);
      return localStorage.getItem(STORAGE_KEY) === next;
    } catch (e) {
      return false;
    }
  }

  // Switches language: saves it and reloads so every page string, including
  // the ones built by scripts, is redone in the new language.
  function setLang(next) {
    if (next === lang) return;
    if (store(next)) window.location.reload();
  }

  // A signed-in user's saved language (profiles.language) wins over this
  // device's. Reloads once if it differs; store() failing (private mode)
  // means no reload, so it can't loop.
  function adopt(profileLang) {
    if (!profileLang || profileLang === lang) return;
    if (store(profileLang)) window.location.reload();
  }

  // The name to show for something that exists in both languages in the
  // database: the Vietnamese text when the page is in Vietnamese and there is
  // some, otherwise the English.
  function pick(vietnamese, english) {
    if (lang === 'vi' && vietnamese && String(vietnamese).trim() !== '') return vietnamese;
    return english;
  }

  function number(value, options) {
    return Number(value).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', options);
  }

  window.I18N = {
    lang: lang,
    t: t,
    apply: apply,
    pick: pick,
    number: number,
    setLang: setLang,
    store: store,
    adopt: adopt
  };
})();
