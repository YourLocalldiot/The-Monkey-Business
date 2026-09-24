document.addEventListener('DOMContentLoaded', async function () {
  var message = document.getElementById('profileMessage');

  function showMessage(text, isError) {
    if (!message) return;
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('is-error', !!isError);
  }

  if (!window.sb) {
    showMessage('Could not reach the service. Check your connection and try again.', true);
    return;
  }

  var sessionResult = await window.sb.auth.getSession();
  var session = sessionResult.data.session;
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  var result = await window.sb
    .from('profiles')
    .select('username, first_name, last_name, coins, streak_days')
    .eq('id', session.user.id)
    .single();

  if (result.error || !result.data) {
    showMessage("Couldn't load your profile. Try refreshing the page.", true);
  } else {
    var p = result.data;
    var fullName = ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
    document.getElementById('profileName').textContent = fullName || 'Your profile';
    document.getElementById('profileUsername').textContent = '@' + p.username;
    document.getElementById('profileStreak').textContent = p.streak_days;
    document.getElementById('profileCoins').textContent = Number(p.coins).toLocaleString('en-US');
    document.getElementById('profileCard').hidden = false;
  }

  document.getElementById('logoutBtn').addEventListener('click', async function () {
    await window.sb.auth.signOut();
    window.location.href = 'index.html';
  });
});
