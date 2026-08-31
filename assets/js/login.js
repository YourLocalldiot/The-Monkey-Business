document.addEventListener('DOMContentLoaded', async function () {
  var form = document.querySelector('.auth-form');
  var message = document.querySelector('.auth-message');
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
