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
      btn.setAttribute('aria-label', willShow ? I18N.t('auth.hide') : I18N.t('auth.show'));
      // setAttribute, not the .hidden property: the icons are SVG elements,
      // which have no .hidden property (the styles.css rule hides them).
      if (showIcon) showIcon.toggleAttribute('hidden', willShow);
      if (hideIcon) hideIcon.toggleAttribute('hidden', !willShow);
    });
  });
});
