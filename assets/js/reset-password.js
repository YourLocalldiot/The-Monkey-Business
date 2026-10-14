document.addEventListener('DOMContentLoaded', async function () {
  var form = document.getElementById('resetForm');
  var message = document.querySelector('.auth-message');
  var sub = document.getElementById('resetSub');
  var requestNewLink = document.getElementById('requestNewLink');

  function showMessage(text, isError) {
    if (!message) return;
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('is-error', !!isError);
  }

  if (!window.sb) {
    sub.textContent = I18N.t('err.noService');
    return;
  }

  // Supabase's reset-password email link establishes a temporary
  // "recovery" session on this page automatically from the URL. No
  // session here means the link is missing, already used, or expired.
  var sessionResult = await window.sb.auth.getSession();
  if (!sessionResult.data.session) {
    sub.textContent = I18N.t('reset.invalid');
    requestNewLink.hidden = false;
    return;
  }

  sub.textContent = I18N.t('reset.enter');
  form.hidden = false;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (form.password.value !== form.password_confirm.value) {
      showMessage(I18N.t('signup.mismatch'), true);
      return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = I18N.t('reset.updating');

    var { error } = await window.sb.auth.updateUser({ password: form.password.value });

    submitBtn.disabled = false;
    submitBtn.textContent = I18N.t('reset.update');

    if (error) {
      showMessage(window.AuthErrors.text(error), true);
      return;
    }

    window.location.href = 'index.html';
  });
});
