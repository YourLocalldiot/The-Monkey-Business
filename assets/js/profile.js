document.addEventListener('DOMContentLoaded', async function () {
  var message = document.getElementById('profileMessage');

  function showMessage(text, isError) {
    if (!message) return;
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('is-error', !!isError);
  }

  if (!window.sb) {
    showMessage(I18N.t('err.noService'), true);
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
    // The exact reason (RLS blocking the row, no row existing, a
    // network error, etc.) matters for debugging, so it goes to the
    // console instead of being swallowed by a generic message.
    console.error('profile.js: failed to load profile row', result.error);
    if (result.error && result.error.code === 'PGRST116') {
      showMessage(I18N.t('profile.noProfile'), true);
    } else if (result.error) {
      showMessage(I18N.t('profile.loadFail', { message: result.error.message }), true);
    } else {
      showMessage(I18N.t('profile.loadFail2'), true);
    }
  } else {
    var p = result.data;
    var fullName = ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
    document.getElementById('profileName').textContent = fullName || I18N.t('profile.yourProfile');
    document.getElementById('profileUsername').textContent = '@' + p.username;
    document.getElementById('profileStreak').textContent = p.streak_days;
    document.getElementById('profileCoins').textContent = I18N.number(p.coins);
    document.getElementById('profileCard').hidden = false;
  }

  document.getElementById('logoutBtn').addEventListener('click', async function () {
    await window.sb.auth.signOut();
    window.location.href = 'index.html';
  });

  // Language switch. The choice is saved on the account (so it follows the
  // user to other devices; needs profiles.language, see docs/supabase-sql.md)
  // and on this device, then the page reloads in that language.
  document.querySelectorAll('[data-lang-choice]').forEach(function (button) {
    button.setAttribute('aria-pressed', button.dataset.langChoice === I18N.lang ? 'true' : 'false');
    button.addEventListener('click', async function () {
      var next = button.dataset.langChoice;
      if (next === I18N.lang) return;
      var saved = await window.sb.from('profiles').update({ language: next }).eq('id', session.user.id);
      if (saved.error) console.warn('profile.js: could not save the language on the account', saved.error);
      I18N.setLang(next);
    });
  });
});
