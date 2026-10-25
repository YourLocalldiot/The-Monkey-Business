// Which piece comes after this one in the playlist. The video and quiz pages
// use it to move the player on once they have finished something.
//
// A piece is opened from Home's path with ?playlist=<id> on its address, which
// says which playlist it was opened from; without that, the player's current
// playlist (the one they opened last, user_playlists) is used. The playlist's
// items (playlist_items) are in order, whatever their type: the next one is
// simply the one after this one. Nothing is returned when this piece is the
// last of its playlist, isn't in it, or there is no playlist to look at.
//
//   var next = await NextPiece.find('video', 11)
//     -> { type: 'quiz', id: 2, name: 'Stock basics', playlist: 1, url: 'quiz.html?id=2&playlist=1' } or null
//   NextPiece.label(next)   -> "Up next: Quiz · Stock basics" (in the page's language)
(function () {
  // The fullest query first; fall back if the Vietnamese quiz column isn't there.
  var ATTEMPTS = [
    'position, item_type, video_id, quiz_id, videos(display_name_en, display_name_vn), quizzes(display_name, display_name_vn)',
    'position, item_type, video_id, quiz_id, videos(display_name_en, display_name_vn), quizzes(display_name)'
  ];
  var RETRY_CODES = ['42703', 'PGRST200', 'PGRST205', '42P01'];

  // ?playlist=<number>
  function playlistFromAddress() {
    var value = new URLSearchParams(window.location.search).get('playlist');
    return /^\d+$/.test(value || '') ? Number(value) : null;
  }

  // The playlist the signed-in player opened last, or null.
  async function currentPlaylist() {
    var session = (await window.sb.auth.getSession()).data.session;
    if (!session) return null;
    var result = await window.sb
      .from('user_playlists')
      .select('playlist_id')
      .order('last_opened_at', { ascending: false })
      .order('added_at', { ascending: false })
      .limit(1);
    if (result.error || !result.data || !result.data.length) return null;
    return result.data[0].playlist_id;
  }

  async function find(type, id) {
    if (!window.sb) return null;
    try {
      var playlistId = playlistFromAddress();
      if (playlistId === null) playlistId = await currentPlaylist();
      if (playlistId === null) return null;

      var result;
      for (var attempt = 0; attempt < ATTEMPTS.length; attempt++) {
        result = await window.sb.from('playlist_items').select(ATTEMPTS[attempt]).eq('playlist_id', playlistId).order('position');
        if (!result.error || RETRY_CODES.indexOf(result.error.code) === -1) break;
      }
      if (result.error) {
        console.error('next-piece.js: could not load the playlist', result.error);
        return null;
      }

      // only items whose video or quiz can be shown
      var items = (result.data || []).filter(function (entry) {
        return entry.item_type === 'quiz' ? entry.quizzes : entry.videos;
      });
      var at = -1;
      items.forEach(function (entry, index) {
        var ref = entry.item_type === 'quiz' ? entry.quiz_id : entry.video_id;
        if (entry.item_type === type && Number(ref) === Number(id)) at = index;
      });
      if (at === -1 || at === items.length - 1) return null;

      var entry = items[at + 1];
      var isQuiz = entry.item_type === 'quiz';
      var target = isQuiz ? entry.quizzes : entry.videos;
      var refId = isQuiz ? entry.quiz_id : entry.video_id;
      var name = isQuiz
        ? window.I18N.pick(target.display_name_vn, target.display_name)
        : window.I18N.pick(target.display_name_vn, target.display_name_en);
      return {
        type: entry.item_type,
        id: refId,
        name: name || window.I18N.t('home.untitledItem'),
        playlist: playlistId,
        url: (isQuiz ? 'quiz.html?id=' : 'video.html?id=') + encodeURIComponent(refId) + '&playlist=' + playlistId
      };
    } catch (thrown) {
      console.error('next-piece.js: could not work out the next piece', thrown);
      return null;
    }
  }

  function label(next) {
    return window.I18N.t('piece.upNext', {
      type: window.I18N.t(next.type === 'quiz' ? 'type.quiz' : 'type.video'),
      name: next.name
    });
  }

  window.NextPiece = { find: find, label: label };
})();
