// Profile page: the signed-in user's stats, their username and display name
// (each can be changed once every 7 days), the theme / language switches and
// Log out.
//
// The week is enforced in the database (change_username / change_display_name,
// docs/supabase-sql.md, "Profile: change username and display name"); this
// page only explains it: the boxes are locked, with the date they open again,
// while the week is running.
document.addEventListener('DOMContentLoaded', async function () {
  var message = document.getElementById('profileMessage');

  function showMessage(text, isError) {
    if (!message) return;
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('is-error', !!isError);
  }

  if (!window.sb) {
    showMessage(I18N.t('err.noService'), true);
    return;
  }

  var sessionResult = await window.sb.auth.getSession();
  var session = sessionResult.data.session;
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  // profiles.exp and the two name-change times come from SQL in
  // docs/supabase-sql.md; without it, load everything else as before.
  var columns = 'username, first_name, last_name, coins, streak_days';
  var attempts = [columns + ', exp, username_changed_at, name_changed_at', columns + ', exp', columns];
  var result;
  for (var attempt = 0; attempt < attempts.length; attempt++) {
    result = await window.sb.from('profiles').select(attempts[attempt]).eq('id', session.user.id).single();
    if (!result.error || result.error.code !== '42703') break;
  }

  var WEEK = 7 * 24 * 3600 * 1000;
  var USERNAME = /^[A-Za-z0-9_]{3,24}$/;
  var MISSING = ['42883', 'PGRST202', '42703'];   // the database doesn't have the SQL yet

  function showNames(p) {
    var fullName = ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
    document.getElementById('profileName').textContent = fullName || I18N.t('profile.yourProfile');
    document.getElementById('profileUsername').textContent = '@' + p.username;
  }

  function formatWhen(ms) {
    return new Date(ms).toLocaleString(I18N.lang === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  // One of the two name forms. opts: form, check() -> { text, input } | null,
  // save() -> the database call, saved(data) shows the new value, and the
  // texts for the reasons the database can give.
  function setupNameForm(opts) {
    var form = opts.form;
    var button = form.querySelector('button[type="submit"]');
    var status = form.querySelector('.name-status');
    var inputs = Array.prototype.slice.call(form.querySelectorAll('input'));
    var busy = false;
    var until = 0;   // ms: changing is allowed again from then on (0 = whenever)

    function say(text, kind) {
      status.textContent = text;
      status.hidden = !text;
      status.classList.toggle('is-error', kind === 'error');
      status.classList.toggle('is-ok', kind === 'ok');
    }

    function refresh() {
      var waiting = until > Date.now();
      inputs.forEach(function (input) { input.disabled = waiting; });
      button.disabled = waiting;
      if (waiting) say(I18N.t('profile.name.wait', { date: formatWhen(until) }), '');
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || until > Date.now()) return;
      var problem = opts.check();
      if (problem) {
        say(problem.text, 'error');
        problem.input.focus();
        return;
      }
      say('', '');
      busy = true;
      button.disabled = true;
      var saved = await opts.save();
      busy = false;
      button.disabled = false;

      if (saved.error) {
        if (MISSING.indexOf(saved.error.code) !== -1) {
          say(I18N.t('profile.name.setup'), 'error');
        } else {
          console.error('profile.js: could not change the name', saved.error);
          say(I18N.t('profile.name.fail'), 'error');
        }
        return;
      }
      var data = saved.data || {};
      if (data.ok) {
        opts.saved(data);
        until = Date.parse(data.next_change_at) || 0;
        refresh();
        window.UI.toast(opts.doneText, { kind: 'success' });
        return;
      }
      if (data.reason === 'cooldown') {
        until = Date.parse(data.next_change_at) || 0;
        refresh();
      } else if (data.reason === 'taken') {
        say(I18N.t('signup.taken'), 'error');
        if (opts.takenInput) opts.takenInput.focus();
      } else if (data.reason === 'same') {
        say(opts.sameText, 'error');
      } else {
        say(opts.invalidText, 'error');
      }
    });

    return {
      // changedAt: when this was last changed (an ISO time, or empty)
      start: function (changedAt) {
        until = changedAt ? (Date.parse(changedAt) || 0) + WEEK : 0;
        refresh();
      }
    };
  }

  if (result.error || !result.data) {
    // The exact reason (RLS blocking the row, no row existing, a
    // network error, etc.) matters for debugging, so it goes to the
    // console instead of being swallowed by a generic message.
    console.error('profile.js: failed to load profile row', result.error);
    if (result.error && result.error.code === 'PGRST116') {
      showMessage(I18N.t('profile.noProfile'), true);
    } else if (result.error) {
      showMessage(I18N.t('profile.loadFail', { message: result.error.message }), true);
    } else {
      showMessage(I18N.t('profile.loadFail2'), true);
    }
  } else {
    var p = result.data;
    showNames(p);
    document.getElementById('profileStreak').textContent = p.streak_days;
    document.getElementById('profileCoins').textContent = I18N.number(p.coins);
    if (typeof p.exp === 'number') {
      document.getElementById('profileExp').textContent = I18N.number(p.exp);
      document.getElementById('profileExpChip').hidden = false;
    }
    document.getElementById('profileCard').hidden = false;

    // The names card only appears once the database can change names.
    if ('username_changed_at' in p) {
      var usernameForm = document.getElementById('usernameForm');
      var displayForm = document.getElementById('displayForm');
      usernameForm.username.value = p.username;
      displayForm.first_name.value = p.first_name || '';
      displayForm.last_name.value = p.last_name || '';

      var usernameBox = setupNameForm({
        form: usernameForm,
        takenInput: usernameForm.username,
        doneText: I18N.t('profile.username.done'),
        sameText: I18N.t('profile.username.same'),
        invalidText: I18N.t('signup.usernameHint'),
        check: function () {
          var wanted = usernameForm.username.value.trim();
          if (!USERNAME.test(wanted)) return { text: I18N.t('signup.usernameHint'), input: usernameForm.username };
          if (wanted === p.username) return { text: I18N.t('profile.username.same'), input: usernameForm.username };
          return null;
        },
        save: function () {
          return window.sb.rpc('change_username', { p_username: usernameForm.username.value.trim() });
        },
        saved: function (data) {
          p.username = data.username;
          usernameForm.username.value = data.username;
          showNames(p);
        }
      });
      usernameBox.start(p.username_changed_at);

      var displayBox = setupNameForm({
        form: displayForm,
        doneText: I18N.t('profile.display.done'),
        sameText: I18N.t('profile.display.same'),
        invalidText: I18N.t('profile.display.required'),
        check: function () {
          var first = displayForm.first_name.value.trim();
          var last = displayForm.last_name.value.trim();
          if (!first) return { text: I18N.t('signup.firstRequired'), input: displayForm.first_name };
          if (!last) return { text: I18N.t('signup.lastRequired'), input: displayForm.last_name };
          if (first === p.first_name && last === p.last_name) return { text: I18N.t('profile.display.same'), input: displayForm.first_name };
          return null;
        },
        save: function () {
          return window.sb.rpc('change_display_name', {
            p_first_name: displayForm.first_name.value.trim(),
            p_last_name: displayForm.last_name.value.trim()
          });
        },
        saved: function (data) {
          p.first_name = data.first_name;
          p.last_name = data.last_name;
          displayForm.first_name.value = data.first_name;
          displayForm.last_name.value = data.last_name;
          showNames(p);
        }
      });
      displayBox.start(p.name_changed_at);

      document.getElementById('namesCard').hidden = false;
    }
  }

  document.getElementById('logoutBtn').addEventListener('click', async function () {
    await window.sb.auth.signOut();
    window.location.href = 'index.html';
  });

  // Language switch. The choice is saved on the account (so it follows the
  // user to other devices; needs profiles.language, see docs/supabase-sql.md)
  // and on this device, then the page reloads in that language.
  document.querySelectorAll('[data-lang-choice]').forEach(function (button) {
    button.setAttribute('aria-pressed', button.dataset.langChoice === I18N.lang ? 'true' : 'false');
    button.addEventListener('click', async function () {
      var next = button.dataset.langChoice;
      if (next === I18N.lang) return;
      var saved = await window.sb.from('profiles').update({ language: next }).eq('id', session.user.id);
      if (saved.error) console.warn('profile.js: could not save the language on the account', saved.error);
      I18N.setLang(next);
    });
  });
});
