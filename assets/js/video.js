// Watch page (video.html?id=<videos.id>): a top bar with an [x] back to Home
// and the video's name, the YouTube player in the middle, and at the bottom the
// "Next" button.
//
// Finishing a video: for a signed-in player "Next" unlocks once they have
// watched the video to the end (the YouTube player reports how much was really
// played, so skipping ahead doesn't count). Pressing it records the video as
// finished (finish_video, docs/supabase-sql.md), which colours its piece on
// Home and leaves its EXP and bananas waiting; "Claim rewards!" then pays them,
// with the reward effect and a notification, as for a quiz. A guest, or a
// database without that SQL, gets a "Next" that simply goes back to Home.
//
// The video is looked up in the videos table. Visitors can read a video that
// sits in a playlist (see docs/supabase-sql.md), moderators any video.
document.addEventListener('DOMContentLoaded', async function () {
  var $ = function (id) { return document.getElementById(id); };
  var titleEl = $('videoTitle');
  var frame = $('videoFrame');
  var note = $('videoNote');
  var rewardEl = $('videoReward');
  var hintEl = $('videoHint');
  var nextBtn = $('videoNext');
  var claimBtn = $('videoClaim');
  var homeLink = $('videoHome');
  if (!titleEl || !frame || !note || !nextBtn) return;

  // watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID, /live/ID
  var YOUTUBE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i;
  var VIDEO_COLUMNS = 'id, display_name_en, display_name_vn, youtube_link';
  var REWARD_COLUMNS = ', reward_first_exp, reward_first_bananas, reward_repeat_exp, reward_repeat_bananas';
  var WATCHED_SHARE = 0.85;      // how much of the video must really have been played
  var REPEAT_AFTER_HOURS = 24;   // a rewatch pays again only after this long (finish_video checks it too)
  var MISSING = ['42P01', '42703', 'PGRST205', 'PGRST202'];   // the database doesn't have the SQL yet

  var video = null;
  var tracking = false;   // a signed-in player, and the database can record finished videos
  var progress = null;    // their video_progress row, if any
  var unlocked = true;    // "Next" works (false while a tracked video is still being watched)

  function showNote(text, isError) {
    note.textContent = text;
    note.classList.toggle('is-error', !!isError);
    note.hidden = false;
  }

  function setLine(node, text) {
    node.textContent = text || '';
    node.hidden = !text;
  }

  // "Next": record the video as finished and, if it earned something, offer to claim it.
  nextBtn.addEventListener('click', async function () {
    if (nextBtn.disabled) return;
    if (!tracking || !video) {
      window.location.href = 'index.html';
      return;
    }
    nextBtn.disabled = true;
    setLine(hintEl, '');
    var done = await window.sb.rpc('finish_video', { p_video_id: video.id });
    if (done.error || !done.data) {
      if (done.error && MISSING.indexOf(done.error.code) !== -1) {
        window.location.href = 'index.html';
        return;
      }
      console.error('video.js: could not finish the video', done.error);
      window.UI.toast(I18N.t('video.finishFail'), { kind: 'error' });
      nextBtn.disabled = false;
      return;
    }
    var waiting = {
      exp: Number(done.data.exp) || 0,
      bananas: Number(done.data.bananas) || 0,
      first: !!done.data.first
    };
    if (waiting.exp <= 0 && waiting.bananas <= 0) {
      window.location.href = 'index.html';
      return;
    }
    offerClaim(waiting);
  });

  // Tells the player what they received: "You earned 40 EXP and 20 bananas!"
  function notifyReward(paid) {
    var exp = Number(paid.exp) || 0;
    var bananas = Number(paid.bananas) || 0;
    if (exp <= 0 && bananas <= 0) return;
    var vars = { exp: I18N.number(exp), bananas: I18N.number(bananas) };
    var key = exp > 0 && bananas > 0 ? 'quiz.reward.toastBoth' : exp > 0 ? 'quiz.reward.toastExp' : 'quiz.reward.toastBananas';
    window.UI.toast(I18N.t(key, vars), {
      kind: 'success',
      title: I18N.t(paid.first ? 'video.reward.captionFirst' : 'video.reward.captionRepeat'),
      duration: 9000
    });
  }

  // "Claim rewards!" takes the place of "Next" until it has been pressed; then "Back to Home".
  function offerClaim(waiting) {
    nextBtn.hidden = true;
    setLine(rewardEl, '');
    setLine(hintEl, I18N.t('video.complete'));
    claimBtn.hidden = false;
    claimBtn.disabled = false;
    claimBtn.onclick = async function () {
      claimBtn.disabled = true;
      var result = await window.sb.rpc('claim_video_reward', { p_video_id: video.id });
      if (result.error || !result.data) {
        console.error('video.js: could not claim the rewards', result.error);
        window.UI.toast(I18N.t('quiz.claimFail'), { kind: 'error' });
        claimBtn.disabled = false;
        return;
      }
      var paid = { exp: Number(result.data.exp) || 0, bananas: Number(result.data.bananas) || 0, first: waiting.first };

      // the reward effect first, then the notification of what was received
      var seconds = 0;
      if (window.Effects) {
        await window.Effects.load();
        seconds = window.Effects.play(window.Effects.pick('reward'));
      }
      claimBtn.hidden = true;
      homeLink.hidden = false;
      homeLink.focus();
      setTimeout(function () { notifyReward(paid); }, seconds * 1000);
    };
    claimBtn.focus();
  }

  var id = Number(new URLSearchParams(window.location.search).get('id'));
  if (!Number.isInteger(id) || id < 1) {
    showNote(I18N.t('video.notFound'), true);
    return;
  }
  if (!window.sb) {
    showNote(I18N.t('err.noService'), true);
    return;
  }

  // The reward columns come with the video-rewards SQL; without it, load the video as before.
  var result = await window.sb.from('videos').select(VIDEO_COLUMNS + REWARD_COLUMNS).eq('id', id).maybeSingle();
  if (result.error && result.error.code === '42703') {
    result = await window.sb.from('videos').select(VIDEO_COLUMNS).eq('id', id).maybeSingle();
  }

  if (result.error) {
    console.error('video.js: could not load the video', result.error);
    showNote(I18N.t('video.loadFail'), true);
    return;
  }
  if (!result.data) {
    showNote(I18N.t('video.notFound'), true);
    return;
  }

  video = result.data;
  var name = I18N.pick(video.display_name_vn, video.display_name_en) || I18N.t('home.untitledItem');
  titleEl.textContent = name;
  document.title = name + ' — The Monkey Business';

  var match = YOUTUBE.exec(String(video.youtube_link || '').trim());
  if (!match) {
    showNote(I18N.t('video.badLink'), true);
    video = null;
    return;
  }

  // ---- who is watching, and what finishing is worth to them ----

  var session = (await window.sb.auth.getSession()).data.session;
  if (!session) {
    setLine(rewardEl, I18N.t('video.guest'));
  } else {
    var mine = await window.sb.from('video_progress').select('completions, last_completed_at').eq('video_id', video.id).maybeSingle();
    if (mine.error) {
      if (MISSING.indexOf(mine.error.code) === -1) console.error('video.js: could not load your progress', mine.error);
    } else {
      tracking = true;
      progress = mine.data;
    }
  }

  if (tracking) {
    var finishedBefore = !!(progress && progress.completions > 0);
    var lastAt = progress && progress.last_completed_at ? Date.parse(progress.last_completed_at) : 0;
    var first = !finishedBefore;
    var repeat = finishedBefore && Date.now() - lastAt > REPEAT_AFTER_HOURS * 3600 * 1000;
    var exp = first ? video.reward_first_exp : video.reward_repeat_exp;
    var bananas = first ? video.reward_first_bananas : video.reward_repeat_bananas;
    if (finishedBefore && !repeat) {
      setLine(rewardEl, I18N.t('video.reward.later'));
    } else if (exp > 0 || bananas > 0) {
      setLine(rewardEl, I18N.t(first ? 'video.reward.first' : 'video.reward.repeat', {
        exp: I18N.number(exp), bananas: I18N.number(bananas)
      }));
    }
  }

  // ---- the player ----

  var player = document.createElement('iframe');
  var embed = 'https://www.youtube-nocookie.com/embed/' + match[1] + '?rel=0&playsinline=1&enablejsapi=1';
  if (/^https?:/.test(window.location.origin)) embed += '&origin=' + encodeURIComponent(window.location.origin);
  player.src = embed;
  player.title = name;
  player.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
  player.allowFullscreen = true;
  player.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.textContent = '';
  frame.appendChild(player);

  if (tracking) lockUntilWatched(player);

  // ---- "Next" stays locked until the video has been watched ----

  function loadYouTubeApi() {
    return new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) { resolve(); return; }
      var previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof previous === 'function') previous();
        resolve();
      };
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onerror = function () { reject(new Error('The YouTube player script did not load.')); };
      document.head.appendChild(tag);
    });
  }

  function lockUntilWatched(iframe) {
    var timer = null;
    var giveUp = null;

    function unlock() {
      if (unlocked) return;
      unlocked = true;
      clearInterval(timer);
      clearTimeout(giveUp);
      nextBtn.disabled = false;
      setLine(hintEl, I18N.t('video.hint.ready'));
    }

    unlocked = false;
    nextBtn.disabled = true;
    setLine(hintEl, I18N.t('video.hint.watch', { percent: 0 }));

    // If the player can't be followed (its script is blocked, say), don't hold the player back.
    giveUp = setTimeout(unlock, 12000);
    loadYouTubeApi().then(function () {
      if (unlocked) return;
      clearTimeout(giveUp);
      var yt = new window.YT.Player(iframe, { events: { onError: unlock } });
      var watched = 0;       // seconds actually played
      var lastTime = null;
      var answered = false;  // the player has answered at least once
      giveUp = setTimeout(function () { if (!answered) unlock(); }, 20000);
      timer = setInterval(function () {
        var state, time, duration;
        try {
          state = yt.getPlayerState();
          time = yt.getCurrentTime();
          duration = yt.getDuration();
        } catch (notReady) {
          return;
        }
        answered = true;
        // Playing normally moves the clock by about a second (up to 2x speed: two);
        // a bigger jump is someone skipping ahead or back, which isn't watching.
        if (state === 1 && lastTime !== null) {
          var step = time - lastTime;
          if (step > 0 && step <= 3) watched += step;
        }
        lastTime = time;

        if (duration > 0) {
          var need = duration * WATCHED_SHARE;
          if (watched >= need) { unlock(); return; }
          setLine(hintEl, I18N.t('video.hint.watch', { percent: Math.floor(watched / need * 100) }));
        } else if (watched >= 30) {
          unlock();   // a live stream has no end
        }
      }, 1000);
    }, unlock);
  }
});
