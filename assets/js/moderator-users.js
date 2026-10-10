// CMS → Users tab: look a user up by username and adjust their coins or
// streak. (This is what the whole moderator page used to be.) The form is
// plain markup in moderator.html; this wires it up the first time the tab
// is opened.
(function () {
  var P = window.CMS;

  P.register('users', function () {
    var message = document.getElementById('usersMessage');
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
})();
