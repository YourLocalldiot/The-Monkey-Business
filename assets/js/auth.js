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
    if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : '';
    if (profileLink) profileLink.style.display = loggedIn ? '' : 'none';
  }

  window.sb.auth.getSession().then(function (result) {
    reflectSession(result.data.session);
  });

  window.sb.auth.onAuthStateChange(function (_event, session) {
    reflectSession(session);
  });
});
