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

    if (form.password.value !== form.password_confirm.value) {
      showMessage("Those passwords don't match.", true);
      return;
    }

    var username = form.username.value.trim();
    var firstName = form.first_name.value.trim();
    var lastName = form.last_name.value.trim();
    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing up…';

    // These land in auth.users' metadata; the handle_new_user() trigger
    // (see docs/supabase-sql.md) copies them onto the new public.profiles
    // row, which is also where coins/streak start at 0. emailRedirectTo
    // sends the confirmation-email link to the login page instead of
    // Supabase's default — it must also be added to Auth > URL
    // Configuration > Redirect URLs in the dashboard, or Supabase will
    // ignore it and fall back to the Site URL.
    var { error } = await window.sb.auth.signUp({
      email: form.email.value.trim(),
      password: form.password.value,
      options: {
        data: { username: username, first_name: firstName, last_name: lastName },
        emailRedirectTo: window.location.origin + '/login.html'
      }
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign up';

    if (error) {
      if (/username/i.test(error.message)) {
        showMessage('That username is already taken.', true);
      } else if (/already registered/i.test(error.message)) {
        showMessage('You already have an account with that email — use the link below to log in instead.', true);
      } else {
        showMessage(error.message, true);
      }
      return;
    }

    // Always go to Home on a successful signup. Note: if "Confirm email"
    // is on in Supabase Auth settings, signUp() doesn't grant a session
    // yet, so this lands on Home in the logged-out state until they
    // confirm — Home just won't show Profile until then. Turn "Confirm
    // email" off (Auth settings) if you want signup to log people in
    // immediately instead.
    window.location.href = 'index.html';
  });
});
