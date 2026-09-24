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
    sub.textContent = 'Could not reach the service. Check your connection and try again.';
    return;
  }

  // Supabase's reset-password email link establishes a temporary
  // "recovery" session on this page automatically from the URL. No
  // session here means the link is missing, already used, or expired.
  var sessionResult = await window.sb.auth.getSession();
  if (!sessionResult.data.session) {
    sub.textContent = 'This reset link is invalid or has expired.';
    requestNewLink.hidden = false;
    return;
  }

  sub.textContent = 'Enter a new password for your account.';
  form.hidden = false;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (form.password.value !== form.password_confirm.value) {
      showMessage("Those passwords don't match.", true);
      return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating…';

    var { error } = await window.sb.auth.updateUser({ password: form.password.value });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Update password';

    if (error) {
      showMessage(error.message, true);
      return;
    }

    window.location.href = 'index.html';
  });
});
