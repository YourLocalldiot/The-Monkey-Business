// Sign-up page. Every way an account can fail to be created ends in a message
// in the page's language that says what to do, and points at the field to fix:
//
//   - a field left blank, a username in the wrong format, a short password,
//     two passwords that differ (checked here before anything is sent);
//   - a username that is already taken: found out before sending, via the
//     username_available() database function (checked as soon as the field
//     loses focus, and again on submit), and, if it still gets through (two
//     people racing for it), from Supabase's "database error saving new user";
//   - an email that already has an account (Supabase says so with an error,
//     or, when email confirmation is on, with a user that has no identities);
//   - an invalid email, a too-weak password, too many attempts, sign-ups
//     turned off, no connection, anything unexpected.
//
// On success the user is sent to the login page (see login.js) and told to
// log in; if Supabase happened to sign them in already, that is undone first.
document.addEventListener('DOMContentLoaded', async function () {
  var form = document.querySelector('.auth-form');
  var message = document.querySelector('.auth-message');
  if (!form) return;

  // Someone already signed in has no business creating an account.
  if (window.sb) {
    var existing = await window.sb.auth.getSession();
    if (existing.data.session) {
      window.location.href = 'index.html';
      return;
    }
  }

  var USERNAME = /^[A-Za-z0-9_]{3,24}$/;
  var submitting = false;
  var checkedName = null;   // the username last looked up (lower case) ...
  var checkedFree = null;   // ... and the answer: true, false, or null when it couldn't be checked

  function showMessage(text, isError) {
    if (!message) return;
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle('is-error', !!isError);
  }

  // Marks a field as the problem and puts the cursor in it.
  function blame(input) {
    if (!input) return;
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  function fail(text, input) {
    showMessage(text, true);
    blame(input);
  }

  // The hint under the username field says right away when a name is taken.
  var usernameField = form.username.closest('.field');
  var usernameNote = document.createElement('span');
  usernameNote.className = 'field-hint is-error';
  usernameNote.setAttribute('role', 'alert');
  usernameNote.hidden = true;
  usernameField.appendChild(usernameNote);

  function setUsernameNote(text) {
    usernameNote.textContent = text || '';
    usernameNote.hidden = !text;
  }

  // true: free, false: taken, null: couldn't tell (the function isn't in the
  // database yet, or there is no connection). Remembers the last answer.
  async function usernameFree(name) {
    var key = name.toLowerCase();
    if (checkedName === key) return checkedFree;
    var result = await window.sb.rpc('username_available', { p_username: name });
    if (result.error) return null;
    checkedName = key;
    checkedFree = result.data === true;
    return checkedFree;
  }

  form.username.addEventListener('input', function () {
    setUsernameNote('');
    checkedName = null;
  });
  form.username.addEventListener('blur', async function () {
    var name = form.username.value.trim();
    if (!window.sb || !USERNAME.test(name)) return;
    if ((await usernameFree(name)) === false && form.username.value.trim() === name) {
      form.username.classList.add('is-invalid');
      setUsernameNote(I18N.t('signup.taken'));
    }
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (submitting) return;
    showMessage('', false);

    if (!window.sb) {
      showMessage(I18N.t('signup.noService'), true);
      return;
    }

    var username = form.username.value.trim();
    var firstName = form.first_name.value.trim();
    var lastName = form.last_name.value.trim();
    var email = form.email.value.trim();
    var password = form.password.value;

    // ---- checks that need no network ----
    if (!firstName) return fail(I18N.t('signup.firstRequired'), form.first_name);
    if (!lastName) return fail(I18N.t('signup.lastRequired'), form.last_name);
    if (!USERNAME.test(username)) return fail(I18N.t('signup.usernameHint'), form.username);
    if (password.length < 8) return fail(I18N.t('signup.passwordShort'), form.password);
    if (password !== form.password_confirm.value) return fail(I18N.t('signup.mismatch'), form.password_confirm);

    var submitBtn = form.querySelector('button[type="submit"]');
    function busy(on) {
      submitting = on;
      submitBtn.disabled = on;
      submitBtn.textContent = I18N.t(on ? 'signup.submitting' : 'auth.signup');
    }
    busy(true);

    // ---- is the username free? ----
    if ((await usernameFree(username)) === false) {
      busy(false);
      setUsernameNote(I18N.t('signup.taken'));
      return fail(I18N.t('signup.taken'), form.username);
    }

    // These land in auth.users' metadata; the handle_new_user() trigger
    // (see docs/supabase-sql.md) copies them onto the new public.profiles
    // row, which is also where coins/streak start at 0. emailRedirectTo
    // sends the confirmation-email link to the login page instead of
    // Supabase's default; it must also be added to Auth > URL
    // Configuration > Redirect URLs in the dashboard, or Supabase will
    // ignore it and fall back to the Site URL.
    var result;
    try {
      result = await window.sb.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { username: username, first_name: firstName, last_name: lastName },
          emailRedirectTo: window.location.origin + '/login.html'
        }
      });
    } catch (thrown) {
      result = { error: thrown };
    }
    var error = result.error;
    var data = result.data || {};

    if (error) {
      busy(false);
      var kind = window.AuthErrors.kind(error);
      if (kind === 'exists') return fail(I18N.t('signup.exists'), form.email);
      if (kind === 'email') return fail(window.AuthErrors.text(error), form.email);
      if (kind === 'weak') return fail(window.AuthErrors.text(error), form.password);
      if (kind === 'db' || /username/i.test(error.message || '')) {
        // The profile row couldn't be created. Nearly always that is a
        // username someone else took in the meantime: ask the database.
        checkedName = null;
        var free = await usernameFree(username);
        if (free === false) {
          setUsernameNote(I18N.t('signup.taken'));
          return fail(I18N.t('signup.taken'), form.username);
        }
        console.error('signup.js: database error while creating the account', error);
        if (free === null) return fail(I18N.t('signup.dbMaybeTaken'), form.username);
        return fail(I18N.t('signup.dbFail'));
      }
      return fail(window.AuthErrors.text(error));
    }

    // With email confirmation on, Supabase answers a sign-up for an address
    // that already has an account with a user that has no identities (and no
    // error), so as not to reveal which emails are registered.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      busy(false);
      return fail(I18N.t('signup.exists'), form.email);
    }
    if (!data.user) {
      busy(false);
      return fail(I18N.t('auth.err.generic'));
    }

    // A new account starts in Vietnamese: the handle_new_user() trigger sets
    // profiles.language = 'vi' (docs/supabase-sql.md), and this makes the
    // device agree straight away, before there is a session to read it from.
    // Anyone can switch to English on the Profile page.
    I18N.store('vi');

    // Go to the login page and ask them to log in. If email confirmation is
    // off, Supabase has already signed them in; undo that so the login page
    // doesn't send them straight on to Home.
    var confirmFirst = !data.session;
    if (data.session) {
      try { await window.sb.auth.signOut(); } catch (ignored) {}
    }
    try { sessionStorage.setItem('signupEmail', email); } catch (ignored) {}
    window.location.href = 'login.html?registered=' + (confirmFirst ? 'confirm' : '1');
  });
});
