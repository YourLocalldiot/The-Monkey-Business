document.addEventListener('DOMContentLoaded', async function () {
  var form = document.querySelector('.auth-form');
  var message = document.querySelector('.auth-message');
  var resendBtn = document.getElementById('resendBtn');
  if (!form) return;

  // Covers two cases: someone already logged in who lands on this page
  // by mistake, and — the reason this exists — an email-confirmation
  // link. Supabase's confirmation redirect lands here with the new
  // session already established from the URL, so this sends them
  // straight on to Home instead of showing them a login form for an
  // account they're already signed into.
  if (window.sb) {
    var existing = await window.sb.auth.getSession();
    if (existing.data.session) {
      window.location.href = 'index.html';
      return;
    }
  }

  function showMessage(text, isError) {
    if (!message) return;
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('is-error', !!isError);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (resendBtn) resendBtn.hidden = true;

    if (!window.sb) {
      showMessage('Could not reach the sign-in service. Check your connection and try again.', true);
      return;
    }

    var email = form.email.value.trim();
    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';

    var { error } = await window.sb.auth.signInWithPassword({
      email: email,
      password: form.password.value
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in';

    if (error) {
      if (/email not confirmed/i.test(error.message)) {
        showMessage("You haven't confirmed your email yet.", true);
        if (resendBtn) resendBtn.hidden = false;
      } else {
        showMessage(error.message, true);
      }
      return;
    }

    window.location.href = 'index.html';
  });

  if (resendBtn) {
    resendBtn.addEventListener('click', async function () {
      if (!window.sb) return;
      var email = form.email.value.trim();
      if (!email) {
        showMessage('Enter your email above first, then resend.', true);
        return;
      }
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sending…';

      var { error } = await window.sb.auth.resend({ type: 'signup', email: email });

      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend confirmation email';

      if (error) {
        showMessage(error.message, true);
        return;
      }
      resendBtn.hidden = true;
      showMessage('Confirmation email sent — check your inbox.', false);
    });
  }
});
