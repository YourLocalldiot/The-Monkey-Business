// Toggles the sidebar between "Log in" (guest) and "Profile" (signed in).
// Guest is the assumed default — see the CSS default on .profile-link —
// so a slow network shows the safe (logged-out) state rather than
// flashing Profile at someone who isn't actually signed in.
document.addEventListener('DOMContentLoaded', function () {
  if (!window.sb) return;

  var loginBtn = document.querySelector('.login-btn');
  var profileLink = document.querySelector('.profile-link');

  function reflectSession(session) {
    var loggedIn = !!session;
    // Explicit values on both sides — `.profile-link` is hidden via a
    // stylesheet rule (see CSS), and setting style.display = '' only
    // clears the inline override, which falls right back to that rule
    // instead of showing the element.
    if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : 'flex';
    if (profileLink) profileLink.style.display = loggedIn ? 'flex' : 'none';
  }

  window.sb.auth.getSession().then(function (result) {
    reflectSession(result.data.session);
  });

  window.sb.auth.onAuthStateChange(function (_event, session) {
    reflectSession(session);
  });
});
