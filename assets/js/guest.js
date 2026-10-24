// The id a guest's browser keeps, the name the guest last chose, and what
// happens to a guest's results when that browser logs in.
//
// A guest plays an Anonymous quiz under a random id kept in localStorage
// ('tmbGuestId') and a name of their own for each quiz (docs/supabase-sql.md,
// "Guests: their own name, ..."); the last name chosen is remembered so the
// sign-up page can offer it. When someone logs in on that browser, carryOver()
// asks the database to move what the guest played onto their account
// (claim_guest_results) and then forgets the id, so the next guest on a shared
// computer starts afresh. (Signing up does the same through the sign-up
// itself: signup.js sends the id along.)
//
//   Guest.id()          the id, made the first time it's asked for
//   Guest.peek()        the id if there is one (never makes one)
//   Guest.lastName()    the name the guest last chose ('' if none)
//   Guest.setLastName(name)
//   Guest.forget()      throws the id and the name away
//   await Guest.carryOver()
//                       signed-in only: how many quizzes were moved onto the
//                       account (0 when there was nothing, or the database
//                       doesn't have the function yet)
(function () {
  var KEY = 'tmbGuestId';
  var NAME_KEY = 'tmbGuestName';
  var UUID = /^[0-9a-f-]{36}$/i;
  var memoryId = null;   // for a browser whose localStorage can't be used
  var memoryName = '';
  var running = null;

  function makeId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function peek() {
    try {
      var stored = localStorage.getItem(KEY);
      if (UUID.test(stored || '')) return stored;
    } catch (e) {}
    return memoryId;
  }

  function id() {
    var existing = peek();
    if (existing) return existing;
    var fresh = makeId();
    memoryId = fresh;
    try { localStorage.setItem(KEY, fresh); } catch (e) {}
    return fresh;
  }

  function lastName() {
    try { return localStorage.getItem(NAME_KEY) || memoryName; } catch (e) { return memoryName; }
  }

  function setLastName(name) {
    memoryName = String(name || '');
    try { localStorage.setItem(NAME_KEY, memoryName); } catch (e) {}
  }

  function forget() {
    memoryId = null;
    memoryName = '';
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(NAME_KEY);
    } catch (e) {}
  }

  async function carryOver() {
    if (running) return running;
    var guest = peek();
    if (!guest || !window.sb) return 0;
    running = (async function () {
      try {
        var result = await window.sb.rpc('claim_guest_results', { p_guest_id: guest });
        if (result.error) {
          // PGRST202: the database doesn't have the function yet. Keep the id and try again later.
          if (result.error.code !== 'PGRST202') console.error('guest.js: could not carry the guest results over', result.error);
          return 0;
        }
        forget();
        return Number(result.data && result.data.quizzes) || 0;
      } catch (thrown) {
        console.error('guest.js: could not carry the guest results over', thrown);
        return 0;
      } finally {
        running = null;
      }
    })();
    return running;
  }

  window.Guest = { id: id, peek: peek, lastName: lastName, setLastName: setLastName, forget: forget, carryOver: carryOver };
})();
