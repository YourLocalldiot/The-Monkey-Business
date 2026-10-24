// CMS → Users tab: look users up by username and change their banana count
// (profiles.coins) and streak. Type part of a username and every match is
// listed on the left (with nothing typed, the first few); pick one to edit it.
// Moderators can read and change every profile through Row Level Security (see
// docs/supabase-sql.md); anyone else's request is refused by the database no
// matter what this page does. EXP is shown for reference: it is earned by
// finishing quizzes and videos, not edited here.
(function () {
  var P = window.CMS;
  var el = P.el;

  var LIMIT = 50;
  var COINS_MAX = 2000000000;
  var STREAK_MAX = 100000;
  var COLUMNS = 'id, username, first_name, last_name, role, coins, streak_days';

  P.register('users', function (pane) {
    var md = P.masterDetail(pane, {
      searchPlaceholder: 'Search usernames',
      searchLabel: 'Search users by username',
      onSearch: function (text) { loadList(text); },
      onSelect: function (id) {
        var row = users.filter(function (u) { return u.id === id; })[0];
        if (row) {
          selectedId = id;
          renderList();
          openEditor(row);
        }
      }
    });

    var users = [];
    var selectedId = null;
    var searchToken = 0;
    var withExp = true;   // false if the database has no profiles.exp (yet)

    showPlaceholder();
    loadList('');

    function showPlaceholder(text) {
      P.clear(md.editor);
      md.editor.appendChild(el('p', {
        class: 'cms-editor-sub',
        text: text || 'Type part of a username on the left, then pick the user to change their bananas or streak.'
      }));
    }

    async function loadList(text) {
      // usernames are only letters, numbers and underscores
      var q = String(text || '').trim().replace(/[^A-Za-z0-9_]/g, '');
      var token = ++searchToken;
      md.setNote('Loading…');

      async function ask(columns) {
        var query = window.sb.from('profiles').select(columns);
        if (q) query = query.ilike('username', '%' + q.replace(/_/g, '\\_') + '%');
        return query.order('username').limit(LIMIT);
      }

      var result = await ask(COLUMNS + (withExp ? ', exp' : ''));
      if (result.error && result.error.code === '42703' && withExp) {
        withExp = false;
        result = await ask(COLUMNS);
      }
      if (token !== searchToken) return;   // a newer search is under way
      if (result.error) {
        md.setNote(P.errorText(result.error), true);
        return;
      }
      users = result.data || [];
      renderList();
      if (!users.length) md.setNote(q ? 'No user has a username like that.' : 'There are no users yet.');
      else if (users.length === LIMIT) md.setNote('Showing the first ' + LIMIT + '. Type more of the username to narrow it down.');
      else md.setNote('');
    }

    function renderList() {
      md.setItems(users.map(function (u) {
        var fullName = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
        return {
          id: u.id,
          title: '@' + u.username,
          meta: (fullName ? fullName + ' · ' : '') + u.coins + ' bananas · streak ' + u.streak_days + (u.role === 'moderator' ? ' · moderator' : '')
        };
      }), selectedId);
    }

    function openEditor(user, message) {
      P.clear(md.editor);
      P.setDirty(false);

      var state = { coins: user.coins, streak: user.streak_days };
      function changed() { P.setDirty(true, function () { showPlaceholder(); }); }

      var coinsInput = el('input', {
        type: 'number', min: 0, max: COINS_MAX, step: 1, inputmode: 'numeric', value: String(state.coins),
        oninput: function () { state.coins = coinsInput.value === '' ? NaN : Number(coinsInput.value); changed(); }
      });
      var streakInput = el('input', {
        type: 'number', min: 0, max: STREAK_MAX, step: 1, inputmode: 'numeric', value: String(state.streak),
        oninput: function () { state.streak = streakInput.value === '' ? NaN : Number(streakInput.value); changed(); }
      });

      var statusEl = el('span', { class: 'cms-status', role: 'status', hidden: true });
      var saveBtn = el('button', { type: 'submit', class: 'btn-primary', text: 'Save changes' });

      function validate() {
        if (!(Number.isInteger(state.coins) && state.coins >= 0 && state.coins <= COINS_MAX)) {
          coinsInput.focus();
          return 'Bananas must be a whole number from 0 to ' + COINS_MAX + '.';
        }
        if (!(Number.isInteger(state.streak) && state.streak >= 0 && state.streak <= STREAK_MAX)) {
          streakInput.focus();
          return 'The streak must be a whole number of days from 0 to ' + STREAK_MAX + '.';
        }
        return '';
      }

      async function onSubmit(event) {
        event.preventDefault();
        var problem = validate();
        if (problem) {
          P.status(statusEl, problem, 'error');
          return;
        }
        P.status(statusEl, 'Saving…');
        var result = await P.withBusy([saveBtn], function () {
          return window.sb
            .from('profiles')
            .update({ coins: state.coins, streak_days: state.streak })
            .eq('id', user.id)
            .select('id, coins, streak_days');
        });
        if (result.error) {
          P.status(statusEl, P.errorText(result.error), 'error');
          return;
        }
        if (!result.data || !result.data.length) {
          P.status(statusEl, 'Nothing was saved. This user may have been deleted; reload the page.', 'error');
          return;
        }

        P.setDirty(false);
        user.coins = result.data[0].coins;
        user.streak_days = result.data[0].streak_days;
        renderList();
        window.UI.toast('Saved @' + user.username + '.', { kind: 'success' });
        openEditor(user, 'Saved.');
      }

      var fullName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim();
      md.editor.appendChild(el('h2', { class: 'cms-editor-title', text: '@' + user.username }));
      md.editor.appendChild(el('p', {
        class: 'cms-editor-sub',
        text: [fullName, user.role === 'moderator' ? 'Moderator' : null, typeof user.exp === 'number' ? user.exp + ' EXP (earned by finishing quizzes and videos)' : null]
          .filter(Boolean).join(' · ') || 'No name set.'
      }));
      md.editor.appendChild(el('form', { class: 'cms-form', novalidate: true, onsubmit: onSubmit },
        el('div', { class: 'field-row' },
          P.field('Bananas (coins)', coinsInput),
          P.field('Streak (days)', streakInput)),
        el('div', { class: 'cms-actions' }, saveBtn, statusEl)));

      if (message) P.status(statusEl, message, 'ok');
    }
  });
})();
