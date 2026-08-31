// Session-driven UI: sidebar Log in <-> Profile, the moderator-only
// Panel nav link, and (on pages that have it) the Home page greeting.
// Guest is the assumed default for everything here — elements start
// hidden via CSS (see .profile-link / .panel-link) so a slow session or
// profile lookup never briefly shows something a guest shouldn't see.
document.addEventListener('DOMContentLoaded', function () {
  if (!window.sb) return;

  var loginBtn = document.querySelector('.login-btn');
  var profileLink = document.querySelector('.profile-link');
  var panelLink = document.querySelector('.panel-link');
  var bubble = document.querySelector('.bubble');

  function setGreeting(firstName) {
    if (!bubble) return;
    // Built with text nodes, not innerHTML, so a name can never be
    // parsed as markup — it's just displayed, whatever it contains.
    bubble.textContent = '';
    bubble.appendChild(document.createTextNode(
      (firstName ? 'Morning, ' + firstName + '! I ' : 'Morning! I ')
    ));
    var b = document.createElement('b');
    b.textContent = 'think';
    bubble.appendChild(b);
    bubble.appendChild(document.createTextNode(
      " I finally get what a P/E ratio is. Let's find out for sure."
    ));
  }

  async function reflectSession(session) {
    var loggedIn = !!session;
    // Explicit values on both sides — .profile-link/.panel-link are
    // hidden via a stylesheet rule; style.display = '' only clears the
    // inline override, which falls right back to that rule instead of
    // showing the element.
    if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : 'flex';
    if (profileLink) profileLink.style.display = loggedIn ? 'flex' : 'none';

    if (!loggedIn) {
      if (panelLink) panelLink.style.display = 'none';
      setGreeting(null);
      return;
    }

    var result = await window.sb
      .from('profiles')
      .select('role, first_name')
      .eq('id', session.user.id)
      .single();

    var profile = result.data;
    if (panelLink) panelLink.style.display = (profile && profile.role === 'moderator') ? 'flex' : 'none';
    setGreeting(profile ? profile.first_name : null);
  }

  window.sb.auth.getSession().then(function (result) {
    reflectSession(result.data.session);
  });

  window.sb.auth.onAuthStateChange(function (_event, session) {
    reflectSession(session);
  });
});
