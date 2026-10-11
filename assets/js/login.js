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
      showMessage(I18N.t('login.noService'), true);
      return;
    }

    var email = form.email.value.trim();
    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = I18N.t('login.submitting');

    var { error } = await window.sb.auth.signInWithPassword({
      email: email,
      password: form.password.value
    });

    submitBtn.disabled = false;
    submitBtn.textContent = I18N.t('auth.login');

    if (error) {
      if (/email not confirmed/i.test(error.message)) {
        showMessage(I18N.t('login.notConfirmed'), true);
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
        showMessage(I18N.t('login.enterEmail'), true);
        return;
      }
      resendBtn.disabled = true;
      resendBtn.textContent = I18N.t('common.sending');

      var { error } = await window.sb.auth.resend({ type: 'signup', email: email });

      resendBtn.disabled = false;
      resendBtn.textContent = I18N.t('auth.resend');

      if (error) {
        showMessage(error.message, true);
        return;
      }
      resendBtn.hidden = true;
      showMessage(I18N.t('login.sent'), false);
    });
  }
});
