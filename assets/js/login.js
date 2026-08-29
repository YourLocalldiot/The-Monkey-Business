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
      showMessage('Could not reach the sign-in service. Check your connection and try again.', true);
      return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    var { error } = await window.sb.auth.signInWithPassword({
      email: form.email.value.trim(),
      password: form.password.value
    });

    submitBtn.disabled = false;

    if (error) {
      showMessage(error.message, true);
      return;
    }

    window.location.href = 'index.html';
  });
});
