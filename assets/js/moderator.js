// Panel (moderator.html): the access gate, the tab bar, and the small
// toolkit the section scripts (moderator-playlists.js, ...) share.
//
// The gate here is UX only. The real security boundary is Row Level
// Security on the database (see docs/supabase-sql.md): a non-moderator's
// write is rejected by Postgres no matter what this page does.
(function () {
  var Panel = window.Panel = {};
  var sections = {};   // tab name -> function(pane) that builds it, via Panel.register
  var started = {};    // tab name -> true once that tab has been built
  var currentTab = null;
  var dirty = false;
  var onDiscard = null;

  Panel.register = function (name, build) {
    sections[name] = build;
  };

  // ---------- DOM helpers ----------

  // Properties are set directly (so a value never gets parsed as markup);
  // everything else becomes an attribute. Children can be nodes, strings,
  // arrays of either, or null.
  var PROPERTIES = { value: 1, checked: 1, disabled: 1, hidden: 1, selected: 1, required: 1 };

  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(parent, c); });
      return;
    }
    parent.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }

  Panel.el = function (tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === undefined || value === null) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), value);
        else if (PROPERTIES[key]) node[key] = value;
        else if (value !== false) node.setAttribute(key, value === true ? '' : value);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  };

  Panel.clear = function (node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  };

  // Static, hard-coded markup only.
  var ICONS = {
    up:    '<path d="M6 15l6-6 6 6"/>',
    down:  '<path d="M6 9l6 6 6-6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus:  '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'
  };

  Panel.icon = function (name, size) {
    var holder = document.createElement('span');
    holder.innerHTML =
      '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[name] + '</svg>';
    return holder.firstChild;
  };

  Panel.iconButton = function (label, icon, onClick, extraClass) {
    return Panel.el('button', {
      type: 'button',
      class: 'cms-icon-btn' + (extraClass ? ' ' + extraClass : ''),
      'aria-label': label,
      title: label,
      onclick: onClick
    }, Panel.icon(icon));
  };

  // A labelled form field; the control sits inside the <label>, so
  // clicking the text focuses it.
  Panel.field = function (labelText, control, hint, extraClass) {
    return Panel.el('label', { class: 'field' + (extraClass ? ' ' + extraClass : '') },
      Panel.el('span', { text: labelText }),
      control,
      hint ? Panel.el('span', { class: 'field-hint', text: hint }) : null);
  };

  // Shows (or hides, when text is empty) a status line. kind: 'error' | 'ok'.
  Panel.status = function (node, text, kind) {
    node.textContent = text || '';
    node.hidden = !text;
    node.classList.toggle('is-error', kind === 'error');
    node.classList.toggle('is-ok', kind === 'ok');
  };

  Panel.debounce = function (fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  };

  // Lowercase with accents stripped, so "kinh te" finds "Kinh tế".
  Panel.fold = function (text) {
    return String(text === null || text === undefined ? '' : text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd');
  };

  // Disables the given buttons while work() runs; returns work()'s result.
  Panel.withBusy = async function (buttons, work) {
    var live = buttons.filter(Boolean);
    live.forEach(function (b) { b.disabled = true; });
    try {
      return await work();
    } finally {
      live.forEach(function (b) { b.disabled = false; });
    }
  };

  // ---------- Errors ----------

  // PostgREST / Postgres codes that mean "the CMS SQL has not been run".
  var SETUP_CODES = { PGRST200: 1, PGRST202: 1, PGRST205: 1, '42P01': 1, '42883': 1, '42703': 1 };

  Panel.errorText = function (error, overrides) {
    if (!error) return '';
    if (overrides && overrides[error.code]) return overrides[error.code];
    if (SETUP_CODES[error.code]) {
      return 'The database is missing the CMS tables or functions. Run the CMS queries in docs/supabase-sql.md, then reload this page.';
    }
    if (error.code === '42501') return "You don't have permission to do that.";
    return error.message || 'Something went wrong.';
  };

  // ---------- Unsaved changes ----------

  // An editor calls setDirty(true, fn) when the user changes something;
  // fn runs if they later agree to throw those changes away (it should
  // put the editor back to its empty state).
  Panel.setDirty = function (value, discardHandler) {
    dirty = !!value;
    onDiscard = dirty ? (discardHandler || null) : null;
  };

  Panel.confirmDiscard = function () {
    if (!dirty) return true;
    if (!window.confirm('You have unsaved changes. Discard them?')) return false;
    var handler = onDiscard;
    dirty = false;
    onDiscard = null;
    if (handler) handler();
    return true;
  };

  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ---------- Shared data helpers ----------

  // Names of the playlists a video or quiz is used in. column is
  // 'video_id' or 'quiz_id'. Returns null if the lookup failed.
  Panel.playlistsUsing = async function (column, id) {
    var result = await window.sb
      .from('playlist_items')
      .select('playlist_id, playlists(display_name_en)')
      .eq(column, id);
    if (result.error) return null;
    var seen = {};
    var names = [];
    (result.data || []).forEach(function (row) {
      if (seen[row.playlist_id]) return;
      seen[row.playlist_id] = true;
      names.push(row.playlists && row.playlists.display_name_en ? row.playlists.display_name_en : '(untitled)');
    });
    return names;
  };

  // The list-on-the-left / editor-on-the-right layout every content tab
  // uses. Options: searchPlaceholder (+ optional longer searchLabel), newLabel,
  // onSearch(text), onNew(), onSelect(id). Returns { search, editor, setItems, setNote }.
  Panel.masterDetail = function (pane, options) {
    var el = Panel.el;

    var search = el('input', {
      type: 'search',
      class: 'cms-search',
      placeholder: options.searchPlaceholder,
      'aria-label': options.searchLabel || options.searchPlaceholder,
      title: options.searchLabel || null,
      autocomplete: 'off'
    });
    var newButton = el('button', {
      type: 'button',
      class: 'btn-primary cms-new-btn',
      onclick: function () { if (Panel.confirmDiscard()) options.onNew(); }
    }, Panel.icon('plus', 14), options.newLabel);
    var note = el('p', { class: 'cms-list-note', hidden: true });
    var list = el('ul', { class: 'cms-list' });
    var editor = el('section', { class: 'card cms-editor' });

    pane.appendChild(el('div', { class: 'cms-split' },
      el('section', { class: 'card cms-list-card' },
        el('div', { class: 'cms-list-head' }, search, newButton),
        note,
        list),
      editor));

    search.addEventListener('input', Panel.debounce(function () {
      options.onSearch(search.value);
    }, 200));

    return {
      search: search,
      editor: editor,

      // text '' hides the note.
      setNote: function (text, isError) {
        note.textContent = text || '';
        note.hidden = !text;
        note.classList.toggle('is-error', !!isError);
      },

      // items: [{ id, title, meta }]
      setItems: function (items, selectedId) {
        Panel.clear(list);
        items.forEach(function (item) {
          var button = el('button', {
            type: 'button',
            class: 'cms-list-item',
            'aria-current': item.id === selectedId ? 'true' : 'false',
            onclick: function () {
              if (item.id === selectedId) return;
              if (Panel.confirmDiscard()) options.onSelect(item.id);
            }
          },
            el('span', { class: 'cms-list-title', text: item.title }),
            item.meta ? el('span', { class: 'cms-list-meta', text: item.meta }) : null);
          list.appendChild(el('li', null, button));
        });
      }
    };
  };

  // ---------- Tabs + access gate ----------

  function showTab(name) {
    if (!sections[name] || name === currentTab) return;
    if (!Panel.confirmDiscard()) return;
    currentTab = name;

    document.querySelectorAll('.cms-tab').forEach(function (tab) {
      var on = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      document.getElementById('pane-' + tab.dataset.tab).hidden = !on;
    });

    if (!started[name]) {
      started[name] = true;
      sections[name](document.getElementById('pane-' + name));
    }
    try { history.replaceState(null, '', '#' + name); } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var message = document.getElementById('panelMessage');
    var app = document.getElementById('panelApp');

    function fail(text) {
      message.textContent = text;
      message.hidden = false;
      message.classList.add('is-error');
    }

    if (!window.sb) {
      fail('Could not reach the service. Check your connection and try again.');
      return;
    }

    var sessionResult = await window.sb.auth.getSession();
    var session = sessionResult.data.session;
    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    var meResult = await window.sb
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (meResult.error || !meResult.data || meResult.data.role !== 'moderator') {
      fail("You don't have access to this page.");
      return;
    }

    app.hidden = false;

    var tabs = Array.prototype.slice.call(document.querySelectorAll('.cms-tab'));
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { showTab(tab.dataset.tab); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (!next) return;
        e.preventDefault();
        next.focus();
        showTab(next.dataset.tab);
      });
    });

    var wanted = window.location.hash.replace('#', '');
    showTab(sections[wanted] ? wanted : 'playlists');
  });
})();
