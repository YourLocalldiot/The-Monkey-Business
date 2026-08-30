document.addEventListener('DOMContentLoaded', function () {
  var form = document.querySelector('.auth-form');
  var message = document.querySelector('.auth-message');
  if (!form) return;

  function showMessage(text, isError) {
    if (!message) return;
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('is-error', !!isError);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!window.sb) {
      showMessage('Could not reach the sign-up service. Check your connection and try again.', true);
      return;
    }

    var username = form.username.value.trim();
    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    // The username lands in auth.users' metadata; the handle_new_user()
    // trigger (see docs/supabase-setup.md) copies it onto the new
    // public.profiles row, which is also where coins/streak start at 0.
    var { data, error } = await window.sb.auth.signUp({
      email: form.email.value.trim(),
      password: form.password.value,
      options: { data: { username: username } }
    });

    submitBtn.disabled = false;

    if (error) {
      if (/username/i.test(error.message)) {
        showMessage('That username is already taken.', true);
      } else {
        showMessage(error.message, true);
      }
      return;
    }

    if (data.session) {
      // Email confirmation is off for this project — signUp() already
      // returned a live session, so the user is signed in immediately.
      window.location.href = 'index.html';
    } else {
      // Email confirmation is required before a session exists.
      showMessage('Check your email to confirm your account, then log in.', false);
      form.reset();
    }
  });
});
