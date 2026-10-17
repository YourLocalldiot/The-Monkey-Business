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
// The browser keeps a random guest id and sends it with every call; the
// database names the guest "Guest<n>". Guests earn no EXP or bananas, and at
// the end are invited to create an account.
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
    guestCard: $('guestCard'), guestPlayedAs: $('guestPlayedAs'),
    start: $('startBtn'), action: $('actionBtn'), again: $('againBtn'), home: $('homeLink'), claim: $('claimBtn'),
    countdown: $('quizCountdown'), countdownNumber: $('countdownNumber')
  };

  var COUNTDOWN_FROM = 3;

  var quizId = Number(new URLSearchParams(window.location.search).get('id'));
  var run = null;   // the run in progress: questions, index, score ...
  var isGuest = false;
  var guestName = '';

  // The random id a guest's browser keeps (the same one for every quiz).
  function makeId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  var memoryGuestId = null;
  function guestId() {
    try {
      var id = localStorage.getItem('tmbGuestId');
      if (!/^[0-9a-f-]{36}$/i.test(id || '')) {
        id = makeId();
        localStorage.setItem('tmbGuestId', id);
      }
      return id;
    } catch (e) {
      return memoryGuestId || (memoryGuestId = makeId());
    }
  }

  // Calls a database function; a guest's calls carry the guest id.
  function rpc(name, args) {
    if (isGuest) args = Object.assign({ p_guest_id: guestId() }, args);
    return window.sb.rpc(name, args);
  }

  // ---------- small helpers ----------

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function setState(state) {
    page.dataset.state = state;
    el.intro.hidden = state !== 'intro';
    el.play.hidden = state !== 'play';
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
      item.className = 'quiz-board-row' + (row.is_me ? ' is-me' : '');
      var place = document.createElement('span');
      place.className = 'quiz-board-place tnum';
      place.textContent = row.place;
      var name = document.createElement('span');
      name.className = 'quiz-board-name';
      name.textContent = row.username;
      item.appendChild(place);
      item.appendChild(name);
      if (row.is_me) {
        var me = document.createElement('span');
        me.className = 'quiz-board-me';
        me.textContent = I18N.t('quiz.you');
        item.appendChild(me);
      }
      list.appendChild(item);
    });
  }

  async function loadBoard(listId, emptyId) {
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

  showNote('');
  setState('intro');
  loadBoard('introBoard', 'introBoardEmpty');

  // ---------- leaving ----------

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
    if (leave) window.location.href = el.close.href;
  });
  el.again.addEventListener('click', function () { window.location.reload(); });

  // ---------- start: countdown, then the first question ----------

  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  el.start.addEventListener('click', async function () {
    el.start.disabled = true;
    showNote('');
    el.countdown.hidden = false;

    // Fetch the questions (and the effects) while the countdown runs.
    var loading = rpc('start_quiz', { p_quiz_id: quizId });
    var effectsReady = window.Effects.load();

    for (var n = COUNTDOWN_FROM; n >= 1; n--) {
      el.countdownNumber.textContent = n;
      // restart the pop animation for each number
      el.countdownNumber.style.animation = 'none';
      void el.countdownNumber.offsetWidth;
      el.countdownNumber.style.animation = '';
      await wait(1000);
    }

    var started = await loading;
    await effectsReady;
    el.countdown.hidden = true;
    el.start.disabled = false;
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
    showQuestion();
  }

  function stopTimer() {
    if (run && run.timerId) clearInterval(run.timerId);
    if (run) run.timerId = null;
  }

  function showQuestion() {
    var q = run.questions[run.index];
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

    // A right or a wrong pick flashes the effect of that kind (a timeout
    // with nothing picked doesn't).
    if (p.ids.length > 0) window.Effects.play(window.Effects.pick(graded.correct ? 'correct' : 'incorrect'));

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
    } else {
      offerClaim({
        exp: Number(done.data.exp) || 0,
        bananas: Number(done.data.bananas) || 0,
        first: !!done.data.first
      });
    }
    loadBoard('resultBoard', 'resultBoardEmpty');
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
