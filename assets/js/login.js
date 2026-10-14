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
    message.classList.toggle('is-ok', !isError);
  }

  // Sent here by signup.js after creating an account: ?registered=1 (go ahead
  // and log in) or ?registered=confirm (confirm the email first). The address
  // they signed up with is filled in for them.
  var registered = new URLSearchParams(window.location.search).get('registered');
  if (registered === '1' || registered === 'confirm') {
    var welcome = I18N.t(registered === 'confirm' ? 'login.registeredConfirm' : 'login.registered');
    showMessage(welcome, false);
    if (window.UI) window.UI.toast(welcome, { kind: 'success', title: I18N.t('login.registeredTitle'), duration: 9000 });
    try {
      var signedUpAs = sessionStorage.getItem('signupEmail');
      sessionStorage.removeItem('signupEmail');
      if (signedUpAs) {
        form.email.value = signedUpAs;
        form.password.focus();
      }
    } catch (ignored) {}
    // so a refresh doesn't show the welcome again
    try { window.history.replaceState(null, '', window.location.pathname); } catch (ignored) {}
    if (registered === 'confirm' && resendBtn) resendBtn.hidden = false;
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

    var result;
    try {
      result = await window.sb.auth.signInWithPassword({
        email: email,
        password: form.password.value
      });
    } catch (thrown) {
      result = { error: thrown };
    }
    var error = result.error;

    submitBtn.disabled = false;
    submitBtn.textContent = I18N.t('auth.login');

    if (error) {
      showMessage(window.AuthErrors.text(error), true);
      if (window.AuthErrors.kind(error) === 'unconfirmed' && resendBtn) resendBtn.hidden = false;
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
        showMessage(window.AuthErrors.text(error), true);
        return;
      }
      resendBtn.hidden = true;
      showMessage(I18N.t('login.sent'), false);
    });
  }
});
