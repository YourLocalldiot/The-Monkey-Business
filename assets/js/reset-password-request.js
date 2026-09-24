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
      showMessage('Could not reach the service. Check your connection and try again.', true);
      return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    var { error } = await window.sb.auth.resetPasswordForEmail(form.email.value.trim(), {
      redirectTo: window.location.origin + '/reset-password.html'
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Send reset link';

    // Same message either way — confirming or denying an email exists
    // would let someone probe which emails have accounts.
    if (error) {
      showMessage(error.message, true);
      return;
    }
    showMessage("If an account exists for that email, we've sent a reset link.", false);
    form.reset();
  });
});
