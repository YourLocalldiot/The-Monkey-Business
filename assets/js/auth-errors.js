// Turns what Supabase Auth says went wrong into a message in the page's
// language, instead of showing its English error text.
//
//   AuthErrors.kind(error)        -> 'network' | 'exists' | 'weak' | 'email' | 'rate' |
//                                    'disabled' | 'db' | 'credentials' | 'unconfirmed' | 'other'
//   AuthErrors.text(error)        -> the message to show for the kinds that need no page-specific
//                                    wording (the page decides what to say for the others)
//
// 'db' is what Supabase reports when a database trigger fails while creating
// a user ("Database error saving new user"). For sign-up that nearly always
// means the username is taken (the trigger inserts the profile row, and
// usernames are unique), but the page confirms it before saying so.
(function () {
  function kind(error) {
    if (!error) return 'other';
    var code = String(error.code || error.error_code || '').toLowerCase();
    var message = String(error.message || '');
    var status = error.status;

    if (error.name === 'AuthRetryableFetchError' || /failed to fetch|network ?error|load failed/i.test(message)) return 'network';
    if (code === 'user_already_exists' || code === 'email_exists' || /already (been )?registered|already exists/i.test(message)) return 'exists';
    if (code === 'weak_password' || error.name === 'AuthWeakPasswordError') return 'weak';
    if (code === 'email_address_invalid' || /email.*(invalid|not valid)|invalid.*email/i.test(message)) return 'email';
    if (status === 429 || /rate.?limit|too many/i.test(code + ' ' + message)) return 'rate';
    if (code === 'signup_disabled' || /signups? (not allowed|are disabled|disabled)/i.test(message)) return 'disabled';
    if (code === 'unexpected_failure' || /database error saving new user/i.test(message)) return 'db';
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'credentials';
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) return 'unconfirmed';
    return 'other';
  }

  var TEXT_KEYS = {
    network: 'err.noService',
    weak: 'auth.err.weak',
    email: 'auth.err.email',
    rate: 'auth.err.rate',
    disabled: 'auth.err.disabled',
    credentials: 'login.invalid',
    unconfirmed: 'login.notConfirmed'
  };

  function text(error) {
    var key = TEXT_KEYS[kind(error)];
    if (!key) console.error('auth: unexpected error', error);
    return window.I18N.t(key || 'auth.err.generic');
  }

  window.AuthErrors = { kind: kind, text: text };
})();
