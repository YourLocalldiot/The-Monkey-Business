// Quiz page (quiz.html?id=<quizzes.id>): an intro with the quiz's name,
// description and leaderboard; a 3-2-1 countdown; the questions one at a time
// (timer, optional picture, shuffling as set in the CMS); then the result.
//
// Everything that matters is decided in the database, through the functions in
// docs/supabase-sql.md ("Quiz player"): the questions arrive without the
// correct answers, each answer is graded there (points = round(1000 x (1 -
// response time / question timer x 1/2)), and the leaderboard only hands out
// usernames and places.
//
// Guests: a quiz marked Anonymous in the CMS can be played without an account.
// The browser keeps a random guest id (assets/js/guest.js) and sends it with
// every call. Before Start the guest chooses a name for this quiz: it follows
// the rules of a username and has to be free (not a real user's username, not
// another guest's name in this quiz), which the database checks. Guests earn no
// EXP or bananas; at the end they are invited to create an account with the
// same name, and only then is their result kept (it moves onto the account;
// otherwise it is deleted a day after they last played).
//
// Leaving: a run in progress is lost if the page goes away. The tab being
// closed, the page reloaded or navigated back asks first (the browser's own
// message), the [x] and the language switch ask in the site's own dialog, and a
// notification at the start of a run says so too.
//
// Leaderboard: whoever is in the top 3 (guest or not) can say something from
// the podium: their own row gets a "Say something" button that opens a picker
// of the options moderators set in CMS > Podium talk (emojis or phrases). What
// they choose is shown in a speech bubble next to their name, for everyone
// (set_quiz_talk in the database checks the top 3).
//
// Rewards: for a signed-in player, finishing leaves EXP and bananas waiting;
// the "Claim rewards!" button pays them (with the reward effect, then a
// notification of what was received).
document.addEventListener('DOMContentLoaded', async function () {
  var $ = function (id) { return document.getElementById(id); };
  var page = $('quizPage');
  if (!page) return;

  var el = {
    title: $('quizTitle'), note: $('quizNote'), stats: $('quizStats'), close: $('quizClose'),
    statRank: $('statRank'), statDone: $('statDone'), statPoints: $('statPoints'),
    intro: $('quizIntro'), play: $('quizPlay'), result: $('quizResult'),
    introName: $('introName'), introDesc: $('introDesc'), introMeta: $('introMeta'),
    timer: $('quizTimer'), timerFill: $('timerFill'), timerText: $('timerText'),
    qImage: $('qImage'), qPrompt: $('qPrompt'), qHint: $('qHint'),
    qOptions: $('qOptions'), qFeedback: $('qFeedback'),
    resultScore: $('resultScore'), resultPlace: $('resultPlace'),
    introReward: $('introReward'), introGuest: $('introGuest'),
    guestCard: $('guestCard'), guestPlayedAs: $('guestPlayedAs'), guestCreate: $('guestCreate'),
    nameForm: $('guestNameForm'), nameInput: $('guestName'), nameHint: $('guestNameHint'),
    start: $('startBtn'), action: $('actionBtn'), again: $('againBtn'), home: $('homeLink'), claim: $('claimBtn'),
    resultTop: $('resultTop'),
    countdown: $('quizCountdown'), countdownNumber: $('countdownNumber'), skip: $('skipCountdown')
  };

  var COUNTDOWN_FROM = 3;

  var quizId = Number(new URLSearchParams(window.location.search).get('id'));
  var run = null;   // the run in progress: questions, index, score ...
  var isGuest = false;
  var guestName = '';

  // Calls a database function; a guest's calls carry the guest id (assets/js/guest.js).
  function rpc(name, args) {
    if (isGuest) args = Object.assign({ p_guest_id: window.Guest.id() }, args);
    return window.sb.rpc(name, args);
  }

  // ---------- small helpers ----------

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function setState(state) {
    page.dataset.state = state;
    el.intro.hidden = state !== 'intro';
    el.play.hidden = state !== 'play';
    el.timer.hidden = state !== 'play';
    el.result.hidden = state !== 'result';
    el.stats.hidden = state === 'intro' || state === 'loading';
    el.start.hidden = state !== 'intro';
    el.again.hidden = state !== 'result';
    el.home.hidden = state !== 'result';
    el.claim.hidden = true;
    if (state !== 'play') el.action.hidden = true;
  }

  function showNote(text, isError) {
    el.note.textContent = text;
    el.note.classList.toggle('is-error', !!isError);
    el.note.hidden = !text;
  }

  // Why a call failed, in words a player can act on.
  function failText(error, fallbackKey) {
    var code = error && error.code;
    if (code === 'PGRST202' || code === '42883' || code === 'PGRST205' || code === '42P01') return I18N.t('quiz.setup');
    if (code === 'P0002') return I18N.t('quiz.notFound');
    if (error && error.message === 'This quiz has no questions yet.') return I18N.t('quiz.noQuestions');
    return I18N.t(fallbackKey);
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function plural(count, oneKey, manyKey) {
    return I18N.t(count === 1 ? oneKey : manyKey, { count: I18N.number(count) });
  }

  function setStats(place, total, points) {
    el.statRank.textContent = place + '/' + total;
    el.statPoints.textContent = I18N.number(points);
  }

  // The question being played, out of all of them.
  function setProgress(current, count) {
    el.statDone.textContent = current + '/' + count;
  }

  // ---------- leaderboard ----------

  // rows: [{ place, username, is_me, total }] from get_quiz_leaderboard,
  // the top 10 plus the player's own row.
  function renderBoard(list, emptyEl, rows) {
    clear(list);
    emptyEl.hidden = rows.length > 0;
    list.hidden = rows.length === 0;
    var previous = 0;
    rows.forEach(function (row) {
      if (previous && row.place > previous + 1) {
        var gap = document.createElement('li');
        gap.className = 'quiz-board-gap';
        gap.setAttribute('aria-hidden', 'true');
        gap.textContent = '…';
        list.appendChild(gap);
      }
      previous = row.place;
      var item = document.createElement('li');
      item.className = 'quiz-board-row' + (row.is_me ? ' is-me' : '') + (row.place <= 3 ? ' place-' + row.place : '');
      var place = document.createElement('span');
      place.className = 'quiz-board-place tnum';
      place.textContent = row.place;
      var name = document.createElement('span');
      name.className = 'quiz-board-name';
      name.textContent = row.username;
      item.appendChild(place);
      item.appendChild(name);
      // What a podium holder says, in a speech bubble (their language's version if there is one).
      var said = I18N.pick(row.talk_vn, row.talk) || row.emoji;
      if (said) {
        var bubble = document.createElement('span');
        bubble.className = 'quiz-board-talk' + (isPhrase(said) ? ' is-phrase' : '');
        bubble.textContent = said;
        item.appendChild(bubble);
      }
      // The top 3 can say something (or change it) on their own row. Rows only
      // have a `talk` field once the database has the podium-talk SQL.
      if (row.is_me && row.place <= 3 && 'talk' in row) {
        var pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'quiz-board-talk-btn';
        pick.textContent = I18N.t(said ? 'quiz.talk.change' : 'quiz.talk.add');
        pick.addEventListener('click', function () { chooseTalk(row.talk_id || null); });
        item.appendChild(pick);
      }
      if (row.is_me) {
        var me = document.createElement('span');
        me.className = 'quiz-board-me';
        me.textContent = I18N.t('quiz.you');
        item.appendChild(me);
      }
      list.appendChild(item);
    });
  }

  var boardIds = null;   // the leaderboard on screen: [list id, empty-note id]

  // Words get smaller type than an emoji does.
  function isPhrase(text) { return /[\p{L}\p{N}]/u.test(text); }

  async function loadBoard(listId, emptyId) {
    boardIds = [listId, emptyId];
    var list = $(listId), empty = $(emptyId);
    var result = await rpc('get_quiz_leaderboard', { p_quiz_id: quizId });
    if (result.error) {
      console.error('quiz.js: could not load the leaderboard', result.error);
      list.hidden = true;
      empty.hidden = true;
      return [];
    }
    renderBoard(list, empty, result.data || []);
    return result.data || [];
  }

  // The options a podium holder can say (CMS > Podium talk), newest settings
  // every time the picker opens.
  async function loadTalkOptions() {
    var result = await window.sb.from('podium_talk').select('id, content, content_vn').order('position').order('id');
    if (result.error) {
      console.error('quiz.js: could not load the podium talk options', result.error);
      return null;
    }
    return result.data || [];
  }

  // Opens the picker; resolves to the chosen option's id, 0 to take the
  // message back, or null when it was closed without choosing.
  function pickTalk(options, currentId) {
    return new Promise(function (resolve) {
      var previous = document.activeElement;
      var overlay = document.createElement('div');
      overlay.className = 'ui-overlay';
      var box = document.createElement('div');
      box.className = 'ui-dialog quiz-talk-dialog';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', 'talkTitle');

      var title = document.createElement('h2');
      title.className = 'ui-dialog-title';
      title.id = 'talkTitle';
      title.textContent = I18N.t('quiz.talk.title');
      var text = document.createElement('p');
      text.className = 'ui-dialog-text';
      text.textContent = I18N.t('quiz.talk.text');

      var grid = document.createElement('div');
      grid.className = 'quiz-talk-grid';
      options.forEach(function (option) {
        var said = I18N.pick(option.content_vn, option.content);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'quiz-talk-choice' + (isPhrase(said) ? ' is-phrase' : '') + (option.id === currentId ? ' is-current' : '');
        b.textContent = said;
        b.addEventListener('click', function () { finish(option.id); });
        grid.appendChild(b);
      });

      var actions = document.createElement('div');
      actions.className = 'ui-dialog-actions';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn-secondary';
      cancel.textContent = I18N.t('ui.cancel');
      cancel.addEventListener('click', function () { finish(null); });
      if (currentId) {
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn-danger';
        remove.textContent = I18N.t('quiz.talk.remove');
        remove.addEventListener('click', function () { finish(0); });
        actions.appendChild(remove);
      }
      actions.appendChild(cancel);

      box.appendChild(title);
      box.appendChild(text);
      box.appendChild(grid);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      function finish(answer) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (previous && previous.focus && previous.isConnected) previous.focus();
        resolve(answer);
      }
      function onKey(event) {
        if (event.key === 'Escape') { event.preventDefault(); finish(null); }
      }
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('mousedown', function (event) { if (event.target === overlay) finish(null); });
      var first = grid.querySelector('.is-current') || grid.firstChild || cancel;
      first.focus();
    });
  }

  // A top-3 player chooses (or takes back) what they say; the leaderboard is
  // then reloaded so everyone's view, including theirs, shows it.
  async function chooseTalk(currentId) {
    var options = await loadTalkOptions();
    if (!options) {
      window.UI.toast(I18N.t('quiz.talk.fail'), { kind: 'error' });
      return;
    }
    if (!options.length) {
      window.UI.toast(I18N.t('quiz.talk.none'), { kind: 'info' });
      return;
    }
    var chosen = await pickTalk(options, currentId);
    if (chosen === null || (chosen || null) === currentId) return;
    var result = await rpc('set_quiz_talk', { p_quiz_id: quizId, p_talk_id: chosen || null });
    if (result.error) {
      console.error('quiz.js: could not save what the player says', result.error);
      window.UI.toast(I18N.t('quiz.talk.fail'), { kind: 'error' });
      return;
    }
    window.UI.toast(I18N.t(chosen ? 'quiz.talk.saved' : 'quiz.talk.removed'), { kind: 'success' });
    if (boardIds) loadBoard(boardIds[0], boardIds[1]);
  }

  // ---------- start-up ----------

  if (!Number.isInteger(quizId) || quizId < 1) {
    showNote(I18N.t('quiz.notFound'), true);
    return;
  }
  if (!window.sb) {
    showNote(I18N.t('err.noService'), true);
    return;
  }
  // Nobody signed in: they may still play a quiz that is marked Anonymous.
  var session = (await window.sb.auth.getSession()).data.session;
  isGuest = !session;

  var intro = await rpc('get_quiz_intro', { p_quiz_id: quizId });
  if (intro.error && intro.error.code === '28000') {
    // this quiz needs an account
    window.location.href = 'login.html';
    return;
  }
  if (intro.error || !intro.data) {
    console.error('quiz.js: could not load the quiz', intro.error);
    showNote(failText(intro.error, 'quiz.loadFail'), true);
    return;
  }

  var quizName = I18N.pick(intro.data.name_vn, intro.data.name) || I18N.t('home.untitledItem');
  var quizDesc = I18N.pick(intro.data.description_vn, intro.data.description) || '';
  el.title.textContent = quizName;
  document.title = quizName + ' — The Monkey Business';
  el.introName.textContent = quizName;
  el.introDesc.textContent = quizDesc;
  el.introDesc.hidden = !quizDesc;
  el.introMeta.textContent =
    plural(intro.data.question_count, 'quiz.questions.one', 'quiz.questions.many') + ' · ' +
    plural(intro.data.player_count, 'quiz.players.one', 'quiz.players.many');

  // What finishing would earn this player right now (the first time, or a replay).
  var reward = isGuest ? null : intro.data.reward;
  el.introGuest.hidden = !isGuest;
  if (reward && (reward.exp > 0 || reward.bananas > 0)) {
    el.introReward.textContent = I18N.t(reward.first ? 'quiz.reward.introFirst' : 'quiz.reward.introRepeat', {
      exp: I18N.number(reward.exp), bananas: I18N.number(reward.bananas)
    });
    el.introReward.hidden = false;
  }

  // A guest chooses the name they will have on this quiz's leaderboard.
  var NAME_FORMAT = /^[A-Za-z0-9_]{3,24}$/;
  var namesOn = false;                       // the database lets guests choose a name
  var nameHintText = el.nameHint.textContent;
  var checked = { name: '', ok: false };     // the last name asked about, and the answer

  function setNameHint(text, kind) {
    el.nameHint.textContent = text || nameHintText;
    el.nameHint.classList.toggle('is-error', kind === 'error');
    el.nameHint.classList.toggle('is-ok', kind === 'ok');
    el.nameInput.classList.toggle('is-invalid', kind === 'error');
    if (kind === 'error') el.nameInput.setAttribute('aria-invalid', 'true');
    else el.nameInput.removeAttribute('aria-invalid');
  }

  // true when the typed name can be used; otherwise says why, under the box.
  async function checkName(focusIfBad) {
    var name = el.nameInput.value.trim();
    var problem = '';
    if (!name) problem = I18N.t('quiz.name.required');
    else if (!NAME_FORMAT.test(name)) problem = I18N.t('signup.usernameHint');
    if (problem) {
      setNameHint(problem, 'error');
      if (focusIfBad) el.nameInput.focus();
      return false;
    }
    if (checked.name === name) return checked.ok;

    var status = await rpc('guest_name_status', { p_quiz_id: quizId, p_name: name });
    if (el.nameInput.value.trim() !== name) return false;   // it was changed while asking
    if (status.error || !status.data) {
      console.error('quiz.js: could not check the name', status.error);
      setNameHint(I18N.t('quiz.name.checkFail'), 'error');
      return false;
    }
    checked = { name: name, ok: !status.data.problem };
    if (status.data.problem === 'taken') setNameHint(I18N.t('quiz.name.taken'), 'error');
    else if (status.data.problem) setNameHint(I18N.t('signup.usernameHint'), 'error');
    else setNameHint(I18N.t('quiz.name.free'), 'ok');
    if (status.data.problem && focusIfBad) el.nameInput.focus();
    return !status.data.problem;
  }

  async function setUpGuestName() {
    var status = await rpc('guest_name_status', { p_quiz_id: quizId });
    // PGRST202: the database doesn't have the guest-names SQL yet; play as before.
    if (status.error && status.error.code === 'PGRST202') return;
    if (status.error) console.error('quiz.js: could not ask for the guest name', status.error);
    namesOn = true;
    el.nameInput.value = (status.data && status.data.current) || window.Guest.lastName() || '';
    el.nameForm.hidden = false;
    el.nameInput.addEventListener('input', function () {
      checked = { name: '', ok: false };
      setNameHint('', '');
    });
    el.nameInput.addEventListener('blur', function () {
      if (NAME_FORMAT.test(el.nameInput.value.trim())) checkName(false);
    });
    el.nameForm.addEventListener('submit', function (event) {
      event.preventDefault();
      el.start.click();
    });
  }
  if (isGuest) await setUpGuestName();

  showNote('');
  setState('intro');
  loadBoard('introBoard', 'introBoardEmpty');

  // ---------- leaving ----------

  // Once someone has said "Leave" in the site's dialog, the browser's own
  // "Leave site?" message must not ask a second time.
  var leaving = false;
  function letGo() {
    leaving = true;
    setTimeout(function () { leaving = false; }, 4000);   // in case the page ends up staying
  }

  // Closing the tab, reloading or going back in the middle of a run: the
  // browser asks first (it doesn't allow pages to word that message).
  window.addEventListener('beforeunload', function (event) {
    if (leaving || page.dataset.state !== 'play') return;
    event.preventDefault();
    event.returnValue = '';
  });

  // Leaving in the middle of a run asks first, in the site's own dialog.
  el.close.addEventListener('click', async function (event) {
    if (page.dataset.state !== 'play') return;
    event.preventDefault();
    var leave = await window.UI.confirm(I18N.t('quiz.leave'), {
      title: I18N.t('quiz.leave.title'),
      confirmLabel: I18N.t('quiz.leave.confirm'),
      cancelLabel: I18N.t('quiz.leave.stay'),
      danger: true
    });
    if (leave) {
      letGo();
      window.location.href = el.close.href;
    }
  });

  // Changing language reloads the page, which would throw away a run in
  // progress, so in the middle of one the language switch (assets/js/lang-switch.js) asks first.
  if (window.LangSwitch) {
    window.LangSwitch.beforeChange = async function () {
      if (page.dataset.state !== 'play') return true;
      var change = await window.UI.confirm(I18N.t('quiz.lang.text'), {
        title: I18N.t('quiz.lang.title'),
        confirmLabel: I18N.t('quiz.lang.confirm'),
        cancelLabel: I18N.t('quiz.leave.stay'),
        danger: true
      });
      if (change) letGo();
      return change;
    };
  }
  el.again.addEventListener('click', function () { window.location.reload(); });

  // ---------- start: countdown, then the first question ----------

  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  el.start.addEventListener('click', async function () {
    el.start.disabled = true;

    // A guest needs a name that is free before anything starts.
    var chosen = null;
    if (namesOn) {
      if (!(await checkName(true))) {
        el.start.disabled = false;
        return;
      }
      chosen = el.nameInput.value.trim();
      window.Guest.setLastName(chosen);
    }

    showNote('');
    el.countdown.hidden = false;

    // Fetch the questions (and the effects) while the countdown runs.
    var startArgs = { p_quiz_id: quizId };
    if (chosen) startArgs.p_guest_name = chosen;
    var loading = rpc('start_quiz', startArgs);
    var effectsReady = window.Effects.load();

    // "Skip" ends the countdown early (the questions are still waited for).
    var skipped = false;
    var skipPressed = new Promise(function (resolve) {
      el.skip.disabled = false;
      el.skip.onclick = function () {
        skipped = true;
        el.skip.disabled = true;
        resolve();
      };
    });
    el.skip.focus();

    for (var n = COUNTDOWN_FROM; n >= 1 && !skipped; n--) {
      el.countdownNumber.textContent = n;
      // restart the pop animation for each number
      el.countdownNumber.style.animation = 'none';
      void el.countdownNumber.offsetWidth;
      el.countdownNumber.style.animation = '';
      await Promise.race([wait(1000), skipPressed]);
    }
    el.skip.onclick = null;

    var started = await loading;
    await effectsReady;
    el.countdown.hidden = true;
    el.start.disabled = false;
    if (started.error && namesOn && (started.error.code === '23505' || started.error.code === '22023')) {
      // someone took the name a moment ago, or it can't be used
      checked = { name: '', ok: false };
      setNameHint(I18N.t(started.error.code === '23505' ? 'quiz.name.taken' : 'signup.usernameHint'), 'error');
      el.nameInput.focus();
      return;
    }
    if (started.error || !started.data) {
      console.error('quiz.js: could not start the quiz', started.error);
      showNote(failText(started.error, 'quiz.startFail'), true);
      return;
    }
    beginRun(started.data);
  });

  // ---------- playing ----------

  function beginRun(data) {
    var questions = data.questions || [];
    if (data.shuffle_questions) questions = shuffle(questions);
    if (data.shuffle_answers) {
      questions = questions.map(function (q) {
        var copy = Object.assign({}, q);
        copy.options = shuffle(q.options || []);
        return copy;
      });
    }
    run = {
      questions: questions,
      index: 0,
      score: 0,
      place: data.place,
      total: data.total,
      chosen: [],        // option ids ticked on the current question
      startedAt: 0,
      limit: 30,
      timerId: null,
      answered: false,
      pending: null      // an answer that is being sent / that failed to send
    };
    showNote('');
    guestName = data.guest_name || '';
    el.title.textContent = quizName;
    setState('play');
    setStats(run.place, run.total, 0);
    window.UI.toast(I18N.t('quiz.warn.toast'), { kind: 'info', title: I18N.t('quiz.warn.toastTitle'), duration: 7000 });
    showQuestion();
  }

  function stopTimer() {
    if (run && run.timerId) clearInterval(run.timerId);
    if (run) run.timerId = null;
  }

  function showQuestion() {
    var q = run.questions[run.index];
    window.scrollTo(0, 0);
    run.chosen = [];
    run.answered = false;
    run.pending = null;
    run.limit = q.time_limit_seconds || 30;

    setProgress(run.index + 1, run.questions.length);
    el.qPrompt.textContent = I18N.pick(q.prompt_vn, q.prompt);
    el.qHint.hidden = !q.multiple;
    el.qFeedback.hidden = true;
    el.qFeedback.className = 'quiz-feedback';

    if (q.image_url) {
      el.qImage.hidden = true;
      el.qImage.alt = I18N.t('quiz.image.alt');
      el.qImage.onload = function () { el.qImage.hidden = false; };
      el.qImage.onerror = function () { el.qImage.hidden = true; };
      el.qImage.src = q.image_url;
    } else {
      el.qImage.hidden = true;
      el.qImage.removeAttribute('src');
    }

    clear(el.qOptions);
    // The choices share the lower half of the box equally (see styles.css).
    el.play.style.setProperty('--n', q.options.length);
    q.options.forEach(function (option) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiz-option';
      button.dataset.id = option.id;
      button.textContent = I18N.pick(option.text_vn, option.text);
      if (q.multiple) button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', function () { onOption(q, option, button); });
      el.qOptions.appendChild(button);
    });

    // Several correct answers: tick them, then press the button.
    // One correct answer: pressing an answer sends it straight away.
    if (q.multiple) {
      setAction(I18N.t('quiz.submit'), true, function () { send(false); });
    } else {
      el.action.hidden = true;
    }

    startTimer();
  }

  function setAction(label, disabled, handler) {
    el.action.textContent = label;
    el.action.disabled = !!disabled;
    el.action.hidden = false;
    el.action.onclick = handler;
  }

  function startTimer() {
    stopTimer();
    run.startedAt = performance.now();
    function tick() {
      var elapsed = (performance.now() - run.startedAt) / 1000;
      var left = Math.max(0, run.limit - elapsed);
      el.timerFill.style.width = (left / run.limit * 100) + '%';
      el.timerFill.classList.toggle('is-low', left / run.limit <= 0.25);
      el.timerText.textContent = Math.ceil(left) + ' ' + I18N.t('quiz.secondsShort');
      if (left <= 0) {
        stopTimer();
        send(true);
      }
    }
    tick();
    run.timerId = setInterval(tick, 100);
  }

  function onOption(q, option, button) {
    if (run.answered) return;
    if (!q.multiple) {
      run.chosen = [option.id];
      send(false);
      return;
    }
    var at = run.chosen.indexOf(option.id);
    if (at === -1) run.chosen.push(option.id); else run.chosen.splice(at, 1);
    button.setAttribute('aria-pressed', at === -1 ? 'true' : 'false');
    button.classList.toggle('is-picked', at === -1);
    el.action.disabled = run.chosen.length === 0;
  }

  function lockOptions(locked) {
    Array.prototype.forEach.call(el.qOptions.children, function (b) { b.disabled = locked; });
  }

  // Sends the answer for grading. timedOut: the clock ran out (what is ticked
  // so far still counts, at the full response time).
  async function send(timedOut) {
    if (run.answered) return;
    run.answered = true;
    stopTimer();
    lockOptions(true);
    el.action.hidden = true;

    var q = run.questions[run.index];
    var seconds = timedOut ? run.limit : Math.min(run.limit, (performance.now() - run.startedAt) / 1000);
    run.pending = { ids: run.chosen.slice(), seconds: Math.round(seconds * 100) / 100, timedOut: timedOut, question: q };
    await deliver();
  }

  async function deliver() {
    var p = run.pending;
    el.qFeedback.hidden = true;
    var result = await rpc('answer_question', {
      p_quiz_id: quizId,
      p_question_id: p.question.id,
      p_option_ids: p.ids,
      p_seconds: p.seconds
    });
    if (result.error || !result.data) {
      console.error('quiz.js: could not send the answer', result.error);
      el.qFeedback.textContent = I18N.t('quiz.answerFail');
      el.qFeedback.className = 'quiz-feedback is-wrong';
      el.qFeedback.hidden = false;
      setAction(I18N.t('quiz.retry'), false, function () { el.action.hidden = true; deliver(); });
      return;
    }
    showResult(p, result.data);
  }

  function showResult(p, graded) {
    var correctIds = graded.correct_option_ids || [];
    Array.prototype.forEach.call(el.qOptions.children, function (b) {
      var id = Number(b.dataset.id);
      var isCorrect = correctIds.indexOf(id) !== -1;
      var picked = p.ids.indexOf(id) !== -1;
      b.classList.toggle('is-correct', isCorrect);
      b.classList.toggle('is-wrong', picked && !isCorrect);
      b.classList.remove('is-picked');
    });

    var text;
    if (graded.correct) text = I18N.t('quiz.correct', { points: I18N.number(graded.points) });
    else if (p.timedOut && p.ids.length === 0) text = I18N.t('quiz.timeUp');
    else text = I18N.t('quiz.wrong');
    el.qFeedback.textContent = text;
    el.qFeedback.className = 'quiz-feedback ' + (graded.correct ? 'is-correct' : 'is-wrong');
    el.qFeedback.hidden = false;

    run.score = graded.score;
    run.place = graded.place;
    run.total = graded.total;
    setStats(graded.place, graded.total, graded.score);

    // A right answer flashes the correct effect; a wrong one, or none given
    // before the time ran out, flashes the incorrect effect.
    window.Effects.play(window.Effects.pick(graded.correct ? 'correct' : 'incorrect'));

    var last = run.index === run.questions.length - 1;
    setAction(I18N.t(last ? 'quiz.finish' : 'quiz.next'), false, function () {
      if (last) finish(); else { run.index++; showQuestion(); }
    });
    el.action.focus();
  }

  // ---------- result ----------

  // Tells the player what they received, in a notification: "You earned 120
  // EXP and 60 bananas!" Says nothing when there is nothing to tell.
  function notifyReward(paid) {
    var exp = Number(paid.exp) || 0;
    var bananas = Number(paid.bananas) || 0;
    if (exp <= 0 && bananas <= 0) return;
    var vars = { exp: I18N.number(exp), bananas: I18N.number(bananas) };
    var key = exp > 0 && bananas > 0 ? 'quiz.reward.toastBoth' : exp > 0 ? 'quiz.reward.toastExp' : 'quiz.reward.toastBananas';
    window.UI.toast(I18N.t(key, vars), {
      kind: 'success',
      title: I18N.t(paid.first ? 'quiz.reward.captionFirst' : 'quiz.reward.captionRepeat'),
      duration: 9000
    });
  }

  async function finish() {
    el.action.disabled = true;
    var done = await rpc('finish_quiz', { p_quiz_id: quizId });
    if (done.error || !done.data) {
      console.error('quiz.js: could not finish the quiz', done.error);
      el.qFeedback.textContent = I18N.t('quiz.finishFail');
      el.qFeedback.className = 'quiz-feedback is-wrong';
      el.qFeedback.hidden = false;
      setAction(I18N.t('quiz.retry'), false, finish);
      return;
    }
    stopTimer();
    setState('result');
    setStats(done.data.place, done.data.total, done.data.score);
    setProgress(run.questions.length, run.questions.length);
    el.resultScore.textContent = I18N.t('quiz.result.score', { points: I18N.number(done.data.score) });
    el.resultPlace.textContent = I18N.t('quiz.result.place', { place: done.data.place, total: done.data.total });
    if (isGuest) {
      // Guests earn nothing: invite them to make an account instead.
      el.guestCard.hidden = false;
      el.guestPlayedAs.textContent = guestName ? I18N.t('quiz.guest.playedAs', { name: guestName }) : '';
      el.guestPlayedAs.hidden = !guestName;
      // Making an account with the same name is how the result is kept.
      el.guestCreate.href = 'signup.html' + (guestName ? '?name=' + encodeURIComponent(guestName) : '');
      el.guestCreate.textContent = guestName
        ? I18N.t('quiz.guest.createAs', { name: guestName })
        : I18N.t('quiz.guest.create');
    } else {
      offerClaim({
        exp: Number(done.data.exp) || 0,
        bananas: Number(done.data.bananas) || 0,
        first: !!done.data.first
      });
    }
    loadBoard('resultBoard', 'resultBoardEmpty').then(function (rows) {
      var mine = rows.filter(function (r) { return r.is_me; })[0];
      if (mine && mine.place <= 3 && 'talk' in mine) {
        el.resultTop.textContent = I18N.t('quiz.talk.hint');
        el.resultTop.hidden = false;
      }
    });
    window.scrollTo(0, 0);
  }

  // When there is something to claim, "Claim rewards!" takes the place of
  // "Play again" and "Back to Home" until it has been pressed. When there is
  // nothing, the usual two buttons stay.
  function offerClaim(waiting) {
    if (waiting.exp <= 0 && waiting.bananas <= 0) return;
    el.again.hidden = true;
    el.home.hidden = true;
    el.claim.hidden = false;
    el.claim.disabled = false;
    el.claim.onclick = async function () {
      el.claim.disabled = true;
      var result = await window.sb.rpc('claim_quiz_reward', { p_quiz_id: quizId });
      var paid = waiting;
      if (result.error && result.error.code === 'PGRST202') {
        // The database doesn't have the claim function yet: its older
        // finish_quiz already paid, so there is nothing left to do but say so.
      } else if (result.error || !result.data) {
        console.error('quiz.js: could not claim the rewards', result.error);
        window.UI.toast(I18N.t('quiz.claimFail'), { kind: 'error' });
        el.claim.disabled = false;
        return;
      } else {
        paid = { exp: Number(result.data.exp) || 0, bananas: Number(result.data.bananas) || 0, first: waiting.first };
      }

      // the reward effect first, then the notification of what was received
      var seconds = window.Effects.play(window.Effects.pick('reward'));
      el.claim.hidden = true;
      el.again.hidden = false;
      el.home.hidden = false;
      setTimeout(function () { notifyReward(paid); }, seconds * 1000);
    };
    el.claim.focus();
  }
});
