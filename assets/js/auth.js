// Session-driven UI: sidebar Log in <-> Profile, the moderator-only
// CMS nav link, and (on pages that have it) the Home page greeting.
// Guest is the assumed default for everything here — elements start
// hidden via CSS (see .profile-link / .cms-link) so a slow session or
// profile lookup never briefly shows something a guest shouldn't see.
document.addEventListener('DOMContentLoaded', function () {
  if (!window.sb) return;

  var loginBtn = document.querySelector('.login-btn');
  var profileLink = document.querySelector('.profile-link');
  var cmsLink = document.querySelector('.cms-link');
  var bubble = document.querySelector('.bubble');
  var statStreak = document.getElementById('statStreak');
  var statCoins = document.getElementById('statCoins');

  function setStats(streak, coins) {
    if (statStreak) statStreak.textContent = I18N.number(streak || 0);
    if (statCoins) statCoins.textContent = I18N.number(coins || 0);
  }

  // Someone who played quizzes as a guest on this browser keeps their results
  // once they are logged in (docs/supabase-sql.md, "Guests: keep the results
  // after signing up"). Done once per page; the notification says how many.
  var carryStarted = false;
  function keepGuestResults() {
    if (carryStarted || !window.Guest || !window.Guest.peek()) return;
    carryStarted = true;
    window.Guest.carryOver().then(function (count) {
      if (!(count > 0) || !window.UI) return;
      window.UI.toast(I18N.t(count === 1 ? 'guest.carried.one' : 'guest.carried.many', { count: I18N.number(count) }), {
        kind: 'success',
        title: I18N.t('guest.carried.title'),
        duration: 9000
      });
    });
  }

  function setGreeting(firstName) {
    if (!bubble) return;
    // Built with text nodes, not innerHTML, so a name can never be
    // parsed as markup — it's just displayed, whatever it contains.
    bubble.textContent = '';
    bubble.appendChild(document.createTextNode(
      (firstName ? I18N.t('home.greet.named', { name: firstName }) : I18N.t('home.greet.anon')) + ' '
    ));
    var b = document.createElement('b');
    b.textContent = I18N.t('home.greet.think');
    bubble.appendChild(b);
    bubble.appendChild(document.createTextNode(' ' + I18N.t('home.greet.rest')));
  }

  async function reflectSession(session) {
    var loggedIn = !!session;
    // Explicit values on both sides — .profile-link/.cms-link are
    // hidden via a stylesheet rule; style.display = '' only clears the
    // inline override, which falls right back to that rule instead of
    // showing the element.
    if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : 'flex';
    if (profileLink) profileLink.style.display = loggedIn ? 'flex' : 'none';

    if (!loggedIn) {
      if (cmsLink) cmsLink.style.display = 'none';
      setGreeting(null);
      setStats(0, 0);
      return;
    }

    keepGuestResults();

    var columns = 'role, first_name, coins, streak_days';
    var result = await window.sb
      .from('profiles')
      .select(columns + ', language')
      .eq('id', session.user.id)
      .single();

    // profiles.language comes from the i18n SQL in docs/supabase-sql.md;
    // without it, load everything else as before.
    if (result.error && result.error.code === '42703') {
      result = await window.sb
        .from('profiles')
        .select(columns)
        .eq('id', session.user.id)
        .single();
    }

    var profile = result.data;
    // The language saved on the account wins over this device's (reloads once if it differs).
    if (profile && profile.language) I18N.adopt(profile.language);
    if (cmsLink) cmsLink.style.display = (profile && profile.role === 'moderator') ? 'flex' : 'none';
    setGreeting(profile ? profile.first_name : null);
    setStats(profile && profile.streak_days, profile && profile.coins);
  }

  window.sb.auth.getSession().then(function (result) {
    reflectSession(result.data.session);
  });

  window.sb.auth.onAuthStateChange(function (_event, session) {
    reflectSession(session);
  });
});
