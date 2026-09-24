// Wires up every .password-toggle button on the page — used on login,
// signup, and the reset-password form. Each button must sit right after
// the password <input> it controls, inside a shared .password-field wrapper.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.password-toggle').forEach(function (btn) {
    var input = btn.previousElementSibling;
    var showIcon = btn.querySelector('.icon-show');
    var hideIcon = btn.querySelector('.icon-hide');
    if (!input) return;

    btn.addEventListener('click', function () {
      var willShow = input.type === 'password';
      input.type = willShow ? 'text' : 'password';
      btn.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
      if (showIcon) showIcon.hidden = willShow;
      if (hideIcon) hideIcon.hidden = !willShow;
    });
  });
});
