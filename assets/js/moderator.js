// Gate + logic for moderator.html. The check here is UX only — the real
// security boundary is the Row Level Security policies on public.profiles
// (see docs/supabase-sql.md): a non-moderator's update simply gets
// rejected by the database no matter what this page does.
document.addEventListener('DOMContentLoaded', async function () {
  var message = document.querySelector('.auth-message');
  var lookupForm = document.getElementById('lookupForm');
  var resultBox = document.getElementById('modResult');
  var editForm = document.getElementById('editForm');
  var usernameLabel = document.getElementById('modUsername');
  var foundId = null;

  function showMessage(text, isError) {
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('is-error', !!isError);
  }

  if (!window.sb) {
    showMessage('Could not reach the service. Check your connection and try again.', true);
    lookupForm.hidden = true;
    return;
  }

  var sessionResult = await window.sb.auth.getSession();
  var session = sessionResult.data.session;
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  var meResult = await window.sb
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (meResult.error || !meResult.data || meResult.data.role !== 'moderator') {
    lookupForm.hidden = true;
    showMessage("You don't have access to this page.", true);
    return;
  }

  lookupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    resultBox.hidden = true;
    message.hidden = true;

    var username = lookupForm.username.value.trim();
    var result = await window.sb
      .from('profiles')
      .select('id, username, coins, streak_days')
      .eq('username', username)
      .single();

    if (result.error || !result.data) {
      showMessage('No user found with that username.', true);
      return;
    }

    var user = result.data;
    foundId = user.id;
    usernameLabel.textContent = '@' + user.username;
    editForm.coins.value = user.coins;
    editForm.streak.value = user.streak_days;
    resultBox.hidden = false;
  });

  editForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!foundId) return;

    var result = await window.sb
      .from('profiles')
      .update({
        coins: parseInt(editForm.coins.value, 10),
        streak_days: parseInt(editForm.streak.value, 10)
      })
      .eq('id', foundId);

    if (result.error) {
      showMessage(result.error.message, true);
      return;
    }
    showMessage('Saved.', false);
  });
});
